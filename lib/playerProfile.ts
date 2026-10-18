import { countryFromTimeZone } from "./timezoneCountries";

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

const COUNTRY_KEY = "playerCountry";
const COUNTRY_SOURCE_KEY = "playerCountrySource";
const COUNTRY_CODE = /^[A-Z]{2}$/;

type CountrySource = "geo" | "timezone" | "language";

function detectCountryFromTimeZone(): string | null {
  try {
    return countryFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return null;
  }
}

// Weakest signal: the language setting often reflects device defaults, not where the player lives.
function detectCountryFromLanguage(): string | null {
  if (typeof navigator === "undefined") return null;
  for (const language of navigator.languages ?? [navigator.language]) {
    try {
      const locale = new Intl.Locale(language);
      // Only trust an explicit region ("fr-SN"); maximize() would just guess a likely region.
      if (locale.region && COUNTRY_CODE.test(locale.region)) return locale.region;
    } catch {
      // Ignore malformed locale tags.
    }
  }
  return null;
}

function cacheCountry(code: string, source: CountrySource) {
  try {
    const store = storage();
    store?.setItem(COUNTRY_KEY, code);
    store?.setItem(COUNTRY_SOURCE_KEY, source);
  } catch {
    // Storage unavailable; detection still works next load.
  }
}

// Instant, offline guess: time zone first, then an explicit language region. Never typed by the player.
export function getPlayerCountry(): string | null {
  const store = storage();
  const saved = store?.getItem(COUNTRY_KEY);
  const source = store?.getItem(COUNTRY_SOURCE_KEY);
  if (saved && COUNTRY_CODE.test(saved) && source === "geo") return saved;
  const guess = detectCountryFromTimeZone() ?? detectCountryFromLanguage();
  if (guess) {
    cacheCountry(guess, detectCountryFromTimeZone() ? "timezone" : "language");
    return guess;
  }
  return saved && COUNTRY_CODE.test(saved) ? saved : null;
}

// Authoritative check: the server reads the visitor's country from their IP address.
// Falls back to the local guess when the server cannot tell (for example on localhost).
export async function resolvePlayerCountry(): Promise<string | null> {
  const local = getPlayerCountry();
  if (storage()?.getItem(COUNTRY_SOURCE_KEY) === "geo") return local;
  try {
    const response = await fetch("/api/country", { cache: "no-store" });
    if (!response.ok) return local;
    const data: unknown = await response.json();
    const code = typeof data === "object" && data !== null ? (data as { country?: unknown }).country : null;
    if (typeof code === "string" && COUNTRY_CODE.test(code)) {
      cacheCountry(code, "geo");
      return code;
    }
  } catch {
    // Offline or blocked; the local guess is still used.
  }
  return local;
}

export function countryFlag(code: string | null | undefined): string {
  if (!code || !COUNTRY_CODE.test(code)) return "🌍";
  return String.fromCodePoint(...[...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

const PLAYER_ID_KEY = "playerId";
const PLAYER_ID = /^[A-Za-z0-9-]{16,64}$/;

// Private random id that owns this player's leaderboard entry. A future login (Google, Discord, email)
// can replace it with the provider account id without changing leaderboard logic.
export function getPlayerId(): string {
  const store = storage();
  const saved = store?.getItem(PLAYER_ID_KEY);
  if (saved && PLAYER_ID.test(saved)) return saved;
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  try {
    store?.setItem(PLAYER_ID_KEY, id);
  } catch {
    // Storage unavailable; a fresh id is generated next load.
  }
  return id;
}

export function getSavedPlayerName(): string | null {
  return getPlayerName();
}

export function getPlayerProfile(): PlayerProfile | null {
  const name = getPlayerName();
  return name ? { id: `local:${name.toLowerCase()}`, displayName: name, provider: "local" } : null;
}
