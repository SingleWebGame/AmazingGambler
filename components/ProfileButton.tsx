"use client";

type ProfileButtonProps = {
  onClick: () => void;
  playerName?: string | null;
};

export default function ProfileButton({ onClick, playerName }: ProfileButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={playerName ? `Open profile for ${playerName}` : "Open profile"}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/20 bg-black/40 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
    >
      <span aria-hidden="true">👤</span>
      <span>Profile</span>
    </button>
  );
}
