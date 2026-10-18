"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { claimPlayerName } from "@/lib/leaderboard";
import { PLAYER_NAME_MAX, setPlayerName, validatePlayerName } from "@/lib/playerProfile";

type ProfileSetupModalProps = {
  onComplete: (name: string) => void;
};

export default function ProfileSetupModal({ onComplete }: ProfileSetupModalProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const check = validatePlayerName(value);
    if (!check.valid) {
      setError(check.error);
      return;
    }
    setBusy(true);
    const claim = await claimPlayerName(check.name);
    setBusy(false);
    if (claim === "name_taken") {
      setError("That name is already taken. Please choose another.");
      return;
    }
    if (claim === "offline") {
      setError("Can't reach the leaderboard right now. Check your connection and try again.");
      return;
    }
    const saved = setPlayerName(check.name);
    if (!saved.valid) {
      setError(saved.error);
      return;
    }
    onComplete(saved.name);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <form
        onSubmit={submit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-setup-title"
        className="w-full max-w-md rounded-2xl border border-white/20 bg-slate-900 p-6 text-white shadow-2xl"
      >
        <h2 id="profile-setup-title" className="text-xl font-bold">Welcome to Amazing Gambler</h2>
        <label htmlFor="profile-setup-name" className="mt-4 block text-sm text-slate-300">Choose your player name</label>
        <input
          id="profile-setup-name"
          ref={inputRef}
          value={value}
          onChange={(event) => { setValue(event.target.value); setError(""); }}
          maxLength={PLAYER_NAME_MAX + 10}
          placeholder="Alex"
          autoComplete="nickname"
          aria-invalid={error ? true : undefined}
          aria-describedby="profile-setup-help profile-setup-error"
          className="mt-2 w-full rounded-lg border border-white/30 bg-slate-800 px-3 py-3 text-base text-white placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        />
        <p id="profile-setup-help" className="mt-2 text-xs text-slate-400">3–20 characters: letters, numbers, and spaces.</p>
        <p id="profile-setup-error" role="alert" className="mt-2 min-h-[1.25rem] text-sm text-red-400">{error}</p>
        <div className="mt-4">
          <button type="submit" className="min-h-[44px] w-full rounded-lg bg-amber-400 px-4 py-2 font-bold text-slate-900 hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
        </div>
      </form>
    </div>
  );
}
