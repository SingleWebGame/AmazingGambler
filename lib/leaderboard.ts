import { getPlayerId, validatePlayerName } from "./playerProfile";

const LOCAL_KEY = "amazing-gambler-leaderboard";
const API = "/api/leaderboard";
const TOP_COUNT = 5;
const MAX_LOCAL_ENTRIES = 100;
const POLL_MS = 10_000;
export const LEADERBOARD_EVENT = "amazing-gambler:leaderboard-changed";

export type LeaderboardEntry = {
  playerName: string;
  score: number;
  characterId: string;
  country: string | null;
  charactersUnlocked: number;
  roomNumber: number;
  updatedAt: number;
};
export type RankedEntry = LeaderboardEntry & { rank: number; isYou: boolean };
export type LeaderboardView = { top: RankedEntry[]; me: RankedEntry | null; total: number };
export type ScoreSubmission = {
  playerName: string | null;
  score: number;
  characterId: string;
  country: string | null;
  charactersUnlocked: number;
  roomNumber: number;
};
export type SubmitResult = "created" | "updated" | "unchanged" | "rejected" | "name_taken" | "offline";

const CHARACTER_ID = /^[a-z0-9-]{1,40}$/i;
const COUNTRY_CODE = /^[A-Z]{2}$/;

// Stays false until the server reports that no online database is configured (e.g. local development).
let useLocalStore = false;

function count(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

type StoredEntry = LeaderboardEntry & { playerId: string };

function readLocal(): StoredEntry[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): StoredEntry[] => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const { playerName, score } = record;
      if (typeof playerName !== "string" || typeof score !== "number" || !Number.isFinite(score) || score < 0) return [];
      const name = validatePlayerName(playerName);
      if (!name.valid) return [];
      return [{
        playerId: typeof record.playerId === "string" ? record.playerId : `name:${name.name.toLowerCase()}`,
        playerName: name.name,
        score,
        characterId: typeof record.characterId === "string" && CHARACTER_ID.test(record.characterId) ? record.characterId : "pip",
        country: typeof record.country === "string" && COUNTRY_CODE.test(record.country) ? record.country : null,
        charactersUnlocked: count(record.charactersUnlocked, 1),
        roomNumber: count(record.roomNumber, 1),
        updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
      }];
    });
  } catch {
    return [];
  }
}

// Ranking depends on total money only; the player who reached a score first wins ties.
function sortEntries<T extends LeaderboardEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.score - a.score || a.updatedAt - b.updatedAt);
}

function localView(): LeaderboardView {
  const playerId = getPlayerId();
  const ranked = sortEntries(readLocal()).map((entry, index) => ({
    ...entry,
    rank: index + 1,
    isYou: entry.playerId === playerId,
  }));
  return { top: ranked.slice(0, TOP_COUNT), me: ranked.find((entry) => entry.isYou) ?? null, total: ranked.length };
}

function submitLocal(submission: ScoreSubmission, name: string): SubmitResult {
  const playerId = getPlayerId();
  const entries = readLocal();
  const key = name.toLowerCase();
  const existing = entries.find((entry) => entry.playerId === playerId)
    ?? entries.find((entry) => entry.playerId.startsWith("name:") && entry.playerName.toLowerCase() === key);
  if (entries.some((entry) => entry !== existing && entry.playerName.toLowerCase() === key)) return "name_taken";
  const safeCountry = submission.country && COUNTRY_CODE.test(submission.country) ? submission.country : null;
  let result: SubmitResult;
  if (!existing) {
    entries.push({
      playerId,
      playerName: name,
      score: submission.score,
      characterId: submission.characterId,
      country: safeCountry,
      charactersUnlocked: submission.charactersUnlocked,
      roomNumber: submission.roomNumber,
      updatedAt: Date.now(),
    });
    result = "created";
  } else {
    const improved = submission.score > existing.score;
    existing.playerId = playerId;
    existing.playerName = name;
    existing.characterId = submission.characterId;
    existing.country = safeCountry;
    if (improved) {
      existing.score = submission.score;
      existing.charactersUnlocked = submission.charactersUnlocked;
      existing.roomNumber = submission.roomNumber;
      existing.updatedAt = Date.now();
    }
    result = improved ? "updated" : "unchanged";
  }
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(sortEntries(entries).slice(0, MAX_LOCAL_ENTRIES)));
  } catch {
    return "rejected";
  }
  return result;
}

function validSubmission(submission: ScoreSubmission): string | null {
  const name = validatePlayerName(submission.playerName ?? "");
  if (
    !name.valid ||
    !Number.isFinite(submission.score) ||
    submission.score < 0 ||
    !CHARACTER_ID.test(submission.characterId) ||
    !Number.isInteger(submission.charactersUnlocked) ||
    submission.charactersUnlocked < 1 ||
    !Number.isInteger(submission.roomNumber) ||
    submission.roomNumber < 1
  ) return null;
  return name.name;
}

let view: LeaderboardView = { top: [], me: null, total: 0 };
const listeners = new Set<() => void>();

export function getLeaderboardView(): LeaderboardView {
  return view;
}

function publish(next: LeaderboardView) {
  view = next;
  listeners.forEach((listener) => listener());
}

export async function refreshLeaderboard(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!useLocalStore) {
    try {
      const response = await fetch(`${API}?player=${encodeURIComponent(getPlayerId())}`, { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as { top?: RankedEntry[]; me?: RankedEntry | null; total?: number };
        publish({ top: data.top ?? [], me: data.me ?? null, total: data.total ?? 0 });
        return;
      }
      if (response.status === 503) useLocalStore = true;
      else return; // Temporary server problem: keep showing the last known standings.
    } catch {
      return; // Offline: keep showing the last known standings.
    }
  }
  publish(localView());
}

// Best Score Mode: each player id owns one record; score, room, and unlocked explorers only change on a higher
// score, while the name, explorer, and country shown always stay current.
export async function submitScore(submission: ScoreSubmission): Promise<SubmitResult> {
  const name = validSubmission(submission);
  if (!name) return "rejected";
  let result: SubmitResult | null = null;
  if (!useLocalStore) {
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...submission, playerName: name, playerId: getPlayerId() }),
      });
      if (response.status === 503) useLocalStore = true;
      else if (response.status === 409) return "name_taken";
      else if (response.status === 400) return "rejected";
      else if (!response.ok) return "offline";
      else result = ((await response.json()) as { result: SubmitResult }).result;
    } catch {
      return "offline";
    }
  }
  if (result === null) result = submitLocal(submission, name);
  if (result !== "rejected" && result !== "name_taken") {
    window.dispatchEvent(new Event(LEADERBOARD_EVENT));
    void refreshLeaderboard();
  }
  return result;
}

// Reserves (or renames to) a player name. Used by the profile screens before the name is saved on this device.
export async function claimPlayerName(
  playerName: string,
  extras: Pick<ScoreSubmission, "characterId" | "country"> = { characterId: "pip", country: null },
): Promise<SubmitResult> {
  return submitScore({ playerName, score: 0, charactersUnlocked: 1, roomNumber: 1, ...extras });
}

// Notifies on changes made in this tab, other tabs, and (through polling) other players.
export function subscribeLeaderboard(listener: () => void): () => void {
  listeners.add(listener);
  const refresh = () => void refreshLeaderboard();
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCAL_KEY || event.key === null) refresh();
  };
  const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
  window.addEventListener(LEADERBOARD_EVENT, refresh);
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(onVisible, POLL_MS);
  refresh();
  return () => {
    listeners.delete(listener);
    window.removeEventListener(LEADERBOARD_EVENT, refresh);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
  };
}
