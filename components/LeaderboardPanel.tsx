"use client";

import { LayoutGroup, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { countryFlag } from "@/lib/playerProfile";
import { getLeaderboardView, subscribeLeaderboard, type LeaderboardView, type RankedEntry } from "@/lib/leaderboard";

type LeaderboardPanelProps = {
  playerName: string | null;
  resolveAvatar: (characterId: string) => string;
  onSelect: (entry: RankedEntry) => void;
  focusMode: boolean;
};

const TOP_COUNT = 5;
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
// Slow, soft spring so rank changes are easy to follow.
const slowMove = { type: "spring" as const, stiffness: 38, damping: 15, mass: 1.2 };

export default function LeaderboardPanel({ playerName, resolveAvatar, onSelect, focusMode }: LeaderboardPanelProps) {
  const [board, setBoard] = useState<LeaderboardView>(() => getLeaderboardView());
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const refresh = () => setBoard(getLeaderboardView());
    return subscribeLeaderboard(refresh);
  }, []);

  const top = board.top.slice(0, TOP_COUNT);
  const youOutsideTop = playerName && board.me && board.me.rank > TOP_COUNT ? board.me : null;
  const summaryEntry = board.me ?? top[0];

  const renderRow = (entry: RankedEntry) => {
    const isYou = entry.isYou;
    return (
      <motion.li
        key={`${entry.playerName.toLowerCase()}`}
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
          <span className="lb-name"><span className="lb-flag" aria-hidden="true">{countryFlag(entry.country)}</span> {entry.playerName}</span>
          <span className="lb-balance-row">
            <span className="lb-coin-icon" aria-hidden="true">$</span>
            <small className="lb-balance">{compact.format(entry.score)}</small>
          </span>
        </button>
      </motion.li>
    );
  };

  return (
    <aside className={`leaderboard-panel glass-panel ${focusMode ? "focus-mode-dimmed" : ""}`} aria-label="Leaderboard" aria-hidden={focusMode} inert={focusMode}>
      <button
        type="button"
        className="lb-toggle"
        aria-expanded={isExpanded}
        aria-controls="leaderboard-list"
        aria-label={isExpanded ? "Collapse leaderboard" : "Expand leaderboard"}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <span className="lb-title">TOP {TOP_COUNT}</span>
        {!isExpanded && (
          <span className="lb-collapsed-summary" aria-hidden="true">
            {summaryEntry
              ? <><span className="lb-flag">{countryFlag(summaryEntry.country)}</span> #{summaryEntry.rank} · {summaryEntry.playerName}</>
              : playerName ? "Play to join" : "Create a profile"}
          </span>
        )}
        <span className="lb-toggle-icon" aria-hidden="true">{isExpanded ? "−" : "+"}</span>
      </button>
      <div id="leaderboard-list" className="lb-content" hidden={!isExpanded}>
        <LayoutGroup>
          <ol className="lb-list">
            {top.length === 0 ? (
              <li className="lb-empty">{playerName ? "Play to join the board" : "Create a profile to join"}</li>
            ) : (
              <>
                {top.map(renderRow)}
                {youOutsideTop && <li className="lb-gap" aria-hidden="true">⋮</li>}
                {youOutsideTop && renderRow(youOutsideTop)}
              </>
            )}
          </ol>
        </LayoutGroup>
      </div>
    </aside>
  );
}
