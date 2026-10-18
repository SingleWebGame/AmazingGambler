"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { PLAYER_NAME_MAX, setPlayerName, validatePlayerName } from "@/lib/playerProfile";

type ProfileModalProps = {
  playerName: string | null;
  onSaved: (name: string) => void;
  onClose: () => void;
};

export default function ProfileModal({ playerName, onSaved, onClose }: ProfileModalProps) {
  const [editing, setEditing] = useState(!playerName);
  const [value, setValue] = useState(playerName ?? "");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function save(event: FormEvent) {
    event.preventDefault();
    const check = validatePlayerName(value);
    if (!check.valid) {
      setError(check.error);
      return;
    }
    const saved = setPlayerName(check.name);
    if (!saved.valid) {
      setError(saved.error);
      return;
    }
    onSaved(saved.name);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <form
        onSubmit={save}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/20 bg-slate-900 p-6 text-white shadow-2xl"
      >
        <h2 id="profile-modal-title" className="text-xl font-bold">Player Profile</h2>
        <p className="mt-4 text-sm text-slate-300">Name:</p>
        {editing ? (
          <>
            <label htmlFor="profile-modal-name" className="sr-only">Player name</label>
            <input
              id="profile-modal-name"
              ref={inputRef}
              value={value}
              onChange={(event) => { setValue(event.target.value); setError(""); }}
              maxLength={PLAYER_NAME_MAX + 10}
              autoComplete="nickname"
              aria-invalid={error ? true : undefined}
              aria-describedby="profile-modal-error"
              className="mt-1 w-full rounded-lg border border-white/30 bg-slate-800 px-3 py-3 text-base text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            />
          </>
        ) : (
          <p className="mt-1 break-words text-lg font-semibold">{playerName}</p>
        )}
        <p id="profile-modal-error" role="alert" className="mt-2 min-h-[1.25rem] text-sm text-red-400">{error}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="min-h-[44px] flex-1 rounded-lg border border-white/30 px-4 py-2 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">Change Name</button>
          )}
          <button type="submit" disabled={!editing} className="min-h-[44px] flex-1 rounded-lg bg-amber-400 px-4 py-2 font-bold text-slate-900 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">Save</button>
          <button type="button" onClick={onClose} className="min-h-[44px] flex-1 rounded-lg border border-white/30 px-4 py-2 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">Close</button>
        </div>
      </form>
    </div>
  );
}
