import { getSavedPlayerName, validatePlayerName } from "./playerProfile";

const LEADERBOARD_KEY = "amazing-gambler-leaderboard";
const MAX_ENTRIES = 100;
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
export type ScoreSubmission = {
  playerName: string | null;
  score: number;
  characterId: string;
  country: string | null;
  charactersUnlocked: number;
  roomNumber: number;
};
export type SubmitResult = "created" | "updated" | "unchanged" | "rejected";
export type RankedEntry = LeaderboardEntry & { rank: number };

const CHARACTER_ID = /^[a-z0-9-]{1,40}$/i;
const COUNTRY_CODE = /^[A-Z]{2}$/;

function count(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

function read(): LeaderboardEntry[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LEADERBOARD_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): LeaderboardEntry[] => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const { playerName, score } = record;
      if (typeof playerName !== "string" || typeof score !== "number" || !Number.isFinite(score) || score < 0) return [];
      const name = validatePlayerName(playerName);
      if (!name.valid) return [];
      return [{
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
function sorted(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => b.score - a.score || a.updatedAt - b.updatedAt);
}

export function getLeaderboard(): RankedEntry[] {
  return sorted(read()).slice(0, MAX_ENTRIES).map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function getPlayerRank(playerName: string | null): number | null {
  if (!playerName) return null;
  const key = playerName.toLowerCase();
  const found = getLeaderboard().find((entry) => entry.playerName.toLowerCase() === key);
  return found?.rank ?? null;
}

// Best Score Mode: one record per player name (case-insensitive); score, room, and unlocked
// explorers only change on a higher score, while the explorer and country shown stay current.
export function submitScore(submission: ScoreSubmission): SubmitResult {
  const name = validatePlayerName(submission.playerName ?? "");
  const { score, characterId, country } = submission;
  if (
    !name.valid ||
    !Number.isFinite(score) ||
    score < 0 ||
    !CHARACTER_ID.test(characterId) ||
    !Number.isInteger(submission.charactersUnlocked) ||
    submission.charactersUnlocked < 1 ||
    !Number.isInteger(submission.roomNumber) ||
    submission.roomNumber < 1
  ) return "rejected";
  const safeCountry = country && COUNTRY_CODE.test(country) ? country : null;
  const entries = read();
  const key = name.name.toLowerCase();
  const existing = entries.find((entry) => entry.playerName.toLowerCase() === key);
  let result: SubmitResult;
  if (!existing) {
    entries.push({
      playerName: name.name,
      score,
      characterId,
      country: safeCountry,
      charactersUnlocked: submission.charactersUnlocked,
      roomNumber: submission.roomNumber,
      updatedAt: Date.now(),
    });
    result = "created";
  } else {
    const improved = score > existing.score;
    const cosmeticChange = existing.characterId !== characterId || existing.country !== safeCountry || existing.playerName !== name.name;
    if (!improved && !cosmeticChange) return "unchanged";
    existing.playerName = name.name;
    existing.characterId = characterId;
    existing.country = safeCountry;
    if (improved) {
      existing.score = score;
      existing.charactersUnlocked = submission.charactersUnlocked;
      existing.roomNumber = submission.roomNumber;
      existing.updatedAt = Date.now();
    }
    result = improved ? "updated" : "unchanged";
  }
  try {
    window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(sorted(entries).slice(0, MAX_ENTRIES)));
  } catch {
    return "rejected";
  }
  window.dispatchEvent(new Event(LEADERBOARD_EVENT));
  return result;
}

export function submitScoreForSavedPlayer(submission: Omit<ScoreSubmission, "playerName">): SubmitResult {
  return submitScore({ ...submission, playerName: getSavedPlayerName() });
}

// Notifies on changes made in this tab and, through the storage event, in other tabs.
export function subscribeLeaderboard(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === LEADERBOARD_KEY || event.key === null) listener();
  };
  window.addEventListener(LEADERBOARD_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LEADERBOARD_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
