export const PLAYER_NAME_KEY = "playerName";
export const PLAYER_NAME_MIN = 3;
export const PLAYER_NAME_MAX = 20;
export const PLAYER_PROFILE_EVENT = "amazing-gambler:profile-changed";

const ALLOWED_NAME = /^[A-Za-z0-9 ]+$/;

export type PlayerNameValidation =
  | { valid: true; name: string }
  | { valid: false; error: string };

// Provider-agnostic identity. Leaderboard code depends only on this shape, so
// OAuth/email/cloud profiles can later supply `id` and `provider` without
// changing leaderboard logic.
export type PlayerProfile = {
  id: string;
  displayName: string;
  provider: "local";
};

export function validatePlayerName(input: string): PlayerNameValidation {
  const name = input.trim().replace(/\s+/g, " ");
  if (!name) return { valid: false, error: "Please enter a player name." };
  if (name.length < PLAYER_NAME_MIN) return { valid: false, error: `Name must be at least ${PLAYER_NAME_MIN} characters.` };
  if (name.length > PLAYER_NAME_MAX) return { valid: false, error: `Name must be at most ${PLAYER_NAME_MAX} characters.` };
  if (!ALLOWED_NAME.test(name)) return { valid: false, error: "Use only letters, numbers, and spaces." };
  return { valid: true, name };
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// Stored values are re-validated so tampered localStorage can never inject a bad name.
export function getPlayerName(): string | null {
  const raw = storage()?.getItem(PLAYER_NAME_KEY);
  if (raw == null) return null;
  const result = validatePlayerName(raw);
  return result.valid ? result.name : null;
}

export function setPlayerName(input: string): PlayerNameValidation {
  const result = validatePlayerName(input);
  if (!result.valid) return result;
  try {
    storage()?.setItem(PLAYER_NAME_KEY, result.name);
  } catch {
    return { valid: false, error: "Could not save your name on this device." };
  }
  window.dispatchEvent(new Event(PLAYER_PROFILE_EVENT));
  return result;
}

export function clearPlayerName(): void {
  try {
    storage()?.removeItem(PLAYER_NAME_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PLAYER_PROFILE_EVENT));
}

export function getSavedPlayerName(): string | null {
  return getPlayerName();
}

export function getPlayerProfile(): PlayerProfile | null {
  const name = getPlayerName();
  return name ? { id: `local:${name.toLowerCase()}`, displayName: name, provider: "local" } : null;
}
