import { NextResponse } from "next/server";
import { isCheatPlayer, validatePlayerName } from "@/lib/playerProfile";

export const dynamic = "force-dynamic";

// Works with the Upstash Redis integration from the Vercel Marketplace (free tier on the Hobby plan).
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ??
  process.env.KV_REST_API_URL ??
  process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ??
  process.env.KV_REST_API_TOKEN ??
  process.env.UPSTASH_REDIS_REST_TOKEN;

const SCORES = "ag:lb:scores";
const NAMES = "ag:lb:names";
const profileKey = (id: string) => `ag:lb:p:${id}`;

const TOP_COUNT = 5;
const MAX_SCORE = 1e12;
const ID_PATTERN = /^[A-Za-z0-9-]{16,64}$/;
const CHARACTER_PATTERN = /^[a-z0-9-]{1,40}$/i;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

type Command = (string | number)[];

async function redis(commands: Command[]): Promise<unknown[]> {
  const response = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Redis responded ${response.status}`);
  const results = (await response.json()) as { result?: unknown; error?: string }[];
  return results.map((entry) => {
    if (entry.error) throw new Error(entry.error);
    return entry.result;
  });
}

function hashToObject(flat: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = String(flat[i + 1]);
  return out;
}

type PublicEntry = {
  playerName: string;
  score: number;
  characterId: string;
  country: string | null;
  badgeId: string | null;
  charactersUnlocked: number;
  roomNumber: number;
  updatedAt: number;
  rank: number;
  isYou: boolean;
};

function toEntry(id: string, score: number, fields: Record<string, string>, rank: number, viewerId: string | null): PublicEntry | null {
  const name = validatePlayerName(fields.name ?? "");
  if (!name.valid) return null;
  return {
    playerName: name.name,
    score,
    characterId: CHARACTER_PATTERN.test(fields.characterId ?? "") ? fields.characterId : "pip",
    country: COUNTRY_PATTERN.test(fields.country ?? "") ? fields.country : null,
    badgeId: CHARACTER_PATTERN.test(fields.badgeId ?? "") ? fields.badgeId : null,
    charactersUnlocked: Math.max(1, Number(fields.charactersUnlocked) || 1),
    roomNumber: Math.max(1, Number(fields.roomNumber) || 1),
    updatedAt: Number(fields.updatedAt) || 0,
    rank,
    isYou: viewerId === id,
  };
}

function notConfigured() {
  return NextResponse.json({ mode: "local" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!REDIS_URL || !REDIS_TOKEN) return notConfigured();
  const viewerParam = new URL(request.url).searchParams.get("player");
  const viewerId = viewerParam && ID_PATTERN.test(viewerParam) ? viewerParam : null;
  try {
    // Fetch a few extra rows so equal scores can be ordered by who reached them first.
    const [topRaw, totalRaw] = await redis([
      ["ZREVRANGE", SCORES, 0, TOP_COUNT + 15, "WITHSCORES"],
      ["ZCARD", SCORES],
    ]);
    const flat = (topRaw as string[]) ?? [];
    const candidates: { id: string; score: number }[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) candidates.push({ id: flat[i], score: Number(flat[i + 1]) });

    const lookups = candidates.map((c) => c.id);
    if (viewerId && !lookups.includes(viewerId)) lookups.push(viewerId);
    const results = lookups.length
      ? await redis([
          ...lookups.map((id): Command => ["HGETALL", profileKey(id)]),
          ...(viewerId ? [["ZSCORE", SCORES, viewerId] as Command] : []),
        ])
      : [];
    const profiles = new Map(lookups.map((id, index) => [id, hashToObject(results[index])]));

    const sorted = candidates
      .map((c) => ({ ...c, updatedAt: Number(profiles.get(c.id)?.updatedAt) || 0 }))
      .sort((a, b) => b.score - a.score || a.updatedAt - b.updatedAt);
    const top = sorted
      .map((c, index) => toEntry(c.id, c.score, profiles.get(c.id) ?? {}, index + 1, viewerId))
      .filter((entry): entry is PublicEntry => entry !== null)
      .slice(0, TOP_COUNT);

    let me: PublicEntry | null = top.find((entry) => entry.isYou) ?? null;
    if (viewerId && !me) {
      const viewerScoreRaw = results[lookups.length] as string | null;
      if (viewerScoreRaw !== null && viewerScoreRaw !== undefined) {
        const viewerScore = Number(viewerScoreRaw);
        const [ahead] = await redis([["ZCOUNT", SCORES, `(${viewerScore}`, "+inf"]]);
        me = toEntry(viewerId, viewerScore, profiles.get(viewerId) ?? {}, Number(ahead) + 1, viewerId);
      }
    }
    return NextResponse.json(
      { mode: "remote", top, me, total: Number(totalRaw) || 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Leaderboard unavailable" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!REDIS_URL || !REDIS_TOKEN) return notConfigured();
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("bad body");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const playerId = body.playerId;
  const name = validatePlayerName(typeof body.playerName === "string" ? body.playerName : "");
  const score = body.score;
  const characterId = typeof body.characterId === "string" && CHARACTER_PATTERN.test(body.characterId) ? body.characterId : "pip";
  const country = typeof body.country === "string" && COUNTRY_PATTERN.test(body.country) ? body.country : "";
  // Absent leaves the saved badge alone; an empty or invalid value clears it.
  const badgeId = body.badgeId === undefined
    ? undefined
    : typeof body.badgeId === "string" && CHARACTER_PATTERN.test(body.badgeId) ? body.badgeId : "";
  const charactersUnlocked = body.charactersUnlocked;
  const roomNumber = body.roomNumber;
  const claimOnly = body.claimOnly === true;
  if (
    typeof playerId !== "string" || !ID_PATTERN.test(playerId) ||
    !name.valid ||
    typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > MAX_SCORE ||
    typeof charactersUnlocked !== "number" || !Number.isInteger(charactersUnlocked) || charactersUnlocked < 1 || charactersUnlocked > 1000 ||
    typeof roomNumber !== "number" || !Number.isInteger(roomNumber) || roomNumber < 1 || roomNumber > 1e9
  ) {
    return NextResponse.json({ error: "Invalid score submission" }, { status: 400 });
  }

  if (isCheatPlayer(name.name)) return NextResponse.json({ result: "unchanged" });

  const nameKey = name.name.toLowerCase();
  try {
    // Atomically claim the name; it may only belong to one player id.
    const [claimed] = await redis([["HSETNX", NAMES, nameKey, playerId]]);
    if (Number(claimed) === 0) {
      const [owner] = await redis([["HGET", NAMES, nameKey]]);
      if (owner !== playerId) return NextResponse.json({ error: "name_taken" }, { status: 409 });
    }

    const [previous, existingScore] = await redis([
      ["HGET", profileKey(playerId), "name"],
      ["ZSCORE", SCORES, playerId],
    ]);
    const writes: Command[] = [];
    if (typeof previous === "string" && previous.toLowerCase() !== nameKey) writes.push(["HDEL", NAMES, previous.toLowerCase()]);

    const isNew = existingScore === null || existingScore === undefined;
    // The board follows the current coin balance, so a player who loses coins moves down.
    const changed = !claimOnly && (isNew || score !== Number(existingScore));
    writes.push(["HSET", profileKey(playerId), "name", name.name, "characterId", characterId, "country", country]);
    if (badgeId !== undefined) writes.push(["HSET", profileKey(playerId), "badgeId", badgeId]);
    if (!claimOnly) {
      writes.push(["HSET", profileKey(playerId), "charactersUnlocked", charactersUnlocked, "roomNumber", roomNumber]);
    }
    if (changed || (claimOnly && isNew)) {
      writes.push(
        ["ZADD", SCORES, score, playerId],
        ["HSET", profileKey(playerId), "updatedAt", Date.now()],
      );
    }
    await redis(writes);
    return NextResponse.json({ result: isNew ? "created" : changed ? "updated" : "unchanged" });
  } catch {
    return NextResponse.json({ error: "Leaderboard unavailable" }, { status: 502 });
  }
}
