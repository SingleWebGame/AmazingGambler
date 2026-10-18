import { getSavedPlayerName, validatePlayerName } from "./playerProfile";

const LEADERBOARD_KEY = "amazing-gambler-leaderboard";
const MAX_ENTRIES = 100;

export type LeaderboardEntry = {
  playerName: string;
  score: number;
  charactersUnlocked: number;
  roomNumber: number;
  updatedAt: number;
};
export type ScoreSubmission = {
  playerName: string | null;
  score: number;
  charactersUnlocked: number;
  roomNumber: number;
};
export type SubmitResult = "created" | "updated" | "unchanged" | "rejected";

function read(): LeaderboardEntry[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LEADERBOARD_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): LeaderboardEntry[] => {
      if (!item || typeof item !== "object") return [];
      const { playerName, score, charactersUnlocked, roomNumber, updatedAt } = item as Record<string, unknown>;
      if (typeof playerName !== "string" || typeof score !== "number" || !Number.isFinite(score)) return [];
      const name = validatePlayerName(playerName);
      return name.valid
        ? [{
            playerName: name.name,
            score,
            charactersUnlocked: typeof charactersUnlocked === "number" && Number.isFinite(charactersUnlocked) ? charactersUnlocked : 1,
            roomNumber: typeof roomNumber === "number" && Number.isFinite(roomNumber) ? roomNumber : 1,
            updatedAt: typeof updatedAt === "number" ? updatedAt : 0,
          }]
        : [];
    });
  } catch {
    return [];
  }
}

export function getLeaderboard(): LeaderboardEntry[] {
  return read().sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
}

// Best Score Mode: one record per player name (case-insensitive); only a higher score replaces it.
export function submitScore({ playerName, score, charactersUnlocked, roomNumber }: ScoreSubmission): SubmitResult {
  const name = validatePlayerName(playerName ?? "");
  if (
    !name.valid ||
    !Number.isFinite(score) ||
    score < 0 ||
    !Number.isInteger(charactersUnlocked) ||
    charactersUnlocked < 1 ||
    !Number.isInteger(roomNumber) ||
    roomNumber < 1
  ) return "rejected";
  const entries = read();
  const key = name.name.toLowerCase();
  const existing = entries.find((entry) => entry.playerName.toLowerCase() === key);
  let result: SubmitResult;
  if (!existing) {
    entries.push({ playerName: name.name, score, charactersUnlocked, roomNumber, updatedAt: Date.now() });
    result = "created";
  } else if (score > existing.score) {
    existing.score = score;
    existing.playerName = name.name;
    existing.charactersUnlocked = charactersUnlocked;
    existing.roomNumber = roomNumber;
    existing.updatedAt = Date.now();
    result = "updated";
  } else {
    return "unchanged";
  }
  try {
    window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
  } catch {
    return "rejected";
  }
  return result;
}

export function submitScoreForSavedPlayer(
  score: number,
  charactersUnlocked: number,
  roomNumber: number,
): SubmitResult {
  return submitScore({ playerName: getSavedPlayerName(), score, charactersUnlocked, roomNumber });
}
