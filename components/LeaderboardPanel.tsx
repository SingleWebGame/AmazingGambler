"use client";

import { LayoutGroup, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { getLeaderboard, subscribeLeaderboard, type RankedEntry } from "@/lib/leaderboard";
import { countryFlag } from "@/lib/playerProfile";

type LeaderboardPanelProps = {
  playerName: string | null;
  resolveAvatar: (characterId: string) => string;
  onSelect: (entry: RankedEntry) => void;
};

const TOP_COUNT = 5;
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
// Slow, soft spring so rank changes are easy to follow.
const slowMove = { type: "spring" as const, stiffness: 38, damping: 15, mass: 1.2 };

export default function LeaderboardPanel({ playerName, resolveAvatar, onSelect }: LeaderboardPanelProps) {
  const [entries, setEntries] = useState<RankedEntry[]>([]);

  useEffect(() => {
    const refresh = () => setEntries(getLeaderboard());
    refresh();
    return subscribeLeaderboard(refresh);
  }, []);

  const youKey = playerName?.toLowerCase() ?? null;
  const top = entries.slice(0, TOP_COUNT);
  const you = youKey ? entries.find((entry) => entry.playerName.toLowerCase() === youKey) : undefined;
  const youOutsideTop = you && you.rank > TOP_COUNT ? you : null;
  if (!top.length) return null;

  const renderRow = (entry: RankedEntry) => {
    const isYou = entry.playerName.toLowerCase() === youKey;
    return (
      <motion.li
        key={entry.playerName.toLowerCase()}
        layout="position"
        transition={slowMove}
        className={`lb-item ${isYou ? "lb-you" : ""} ${entry.rank === 1 ? "lb-leader" : ""}`}
      >
        <button
          type="button"
          onClick={() => onSelect(entry)}
          aria-label={`${isYou ? "Your" : `${entry.playerName}'s`} explorer profile, rank ${entry.rank}, ${entry.score.toLocaleString()} coins`}
        >
          <span className="lb-rank">{entry.rank}</span>
          <img src={resolveAvatar(entry.characterId)} alt="" />
          <span className="lb-player-label">
            <span className="lb-name">{entry.playerName}{isYou && <em> (you)</em>}</span>
            <span className="lb-balance-row">
              <span className="lb-coin-icon" aria-hidden="true">$</span>
              <small className="lb-balance">{compact.format(entry.score)} coins</small>
            </span>
          </span>
          <span className="lb-flag" aria-hidden="true">{countryFlag(entry.country)}</span>
        </button>
      </motion.li>
    );
  };

  return (
    <aside className="leaderboard-panel glass-panel" aria-label="Leaderboard">
      <span className="lb-title">LEADERBOARD · TOP {TOP_COUNT}</span>
      <LayoutGroup>
        <ol className="lb-list">
          {top.map(renderRow)}
          {youOutsideTop && <li className="lb-gap" aria-hidden="true">⋮</li>}
          {youOutsideTop && renderRow(youOutsideTop)}
        </ol>
      </LayoutGroup>
    </aside>
  );
}
