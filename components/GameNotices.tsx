"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { usePwaInstall } from "@/lib/pwaInstall";

const INSTALL_NUDGE_KEY = "amazing-gambler-install-nudge";
const NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

type RankNoticeProps = {
  rank: number | null;
  total: number;
  playerName: string | null;
};

type RankNoticeState = { id: number; kind: "up" | "down"; title: string; body: string } | null;

function ordinal(rank: number) {
  const suffix = rank % 100 >= 11 && rank % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][rank % 10] ?? "th";
  return `${rank}${suffix}`;
}

// Local, in-game notification shown when the player's leaderboard rank changes. When the tab is in the
// background it also uses the system notification, but only if the player already allowed them.
export function RankNotice({ rank, total, playerName }: RankNoticeProps) {
  const [notice, setNotice] = useState<RankNoticeState>(null);
  const previousRank = useRef<number | null>(null);
  const noticeId = useRef(0);

  useEffect(() => {
    previousRank.current = null;
  }, [playerName]);

  useEffect(() => {
    if (rank === null) return;
    const previous = previousRank.current;
    previousRank.current = rank;
    if (previous === null || previous === rank) return;

    const improved = rank < previous;
    const next: RankNoticeState = improved
      ? {
          id: ++noticeId.current,
          kind: "up",
          title: rank === 1 ? "You are #1! 🏆" : `Congratulations! You climbed to #${rank} 🎉`,
          body: rank === 1
            ? `You lead all ${total} explorers. Keep your coins safe!`
            : `Up from ${ordinal(previous)} place. ${rank <= 3 ? "You're on the podium!" : "Keep going!"}`,
        }
      : {
          id: ++noticeId.current,
          kind: "down",
          title: `Another explorer passed you · now #${rank}`,
          body: "Win a few coins to climb back up.",
        };
    setNotice(next);

    if (improved && typeof document !== "undefined" && document.hidden && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("Amazing Gambler", { body: next.title.replace(/[🎉🏆]/gu, "").trim(), icon: "/icon-192.png", tag: "rank-change" });
      } catch {
        // System notifications are optional.
      }
    }
  }, [rank, total]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.kind === "up" ? 6500 : 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <div className="notice-layer" aria-live="polite">
      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.id}
            className={`rank-notice rank-notice-${notice.kind}`}
            role="status"
            initial={{ opacity: 0, y: -18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            {notice.kind === "up" && (
              <span className="rank-confetti" aria-hidden="true">
                {Array.from({ length: 14 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}
              </span>
            )}
            <div className="rank-notice-copy">
              <strong>{notice.title}</strong>
              <span>{notice.body}</span>
            </div>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification">×</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type InstallNudgeProps = {
  eligible: boolean;
  onShowHelp: (platform: "ios" | "browser") => void;
};

// Gentle, once-in-a-while suggestion to install the game, shown after the player is settled in.
export function InstallNudge({ eligible, onShowHelp }: InstallNudgeProps) {
  const { installed, canPrompt, isIos, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const last = Number(window.localStorage.getItem(INSTALL_NUDGE_KEY) ?? 0);
      setDismissed(Number.isFinite(last) && Date.now() - last < NUDGE_COOLDOWN_MS);
    } catch {
      setDismissed(true);
    }
  }, []);

  const remember = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_NUDGE_KEY, String(Date.now()));
    } catch {
      // Cooldown is best effort.
    }
  };

  const visible = eligible && !dismissed && !installed && (canPrompt || isIos);

  const accept = async () => {
    remember();
    const result = await install();
    if (result === "manual") onShowHelp(isIos ? "ios" : "browser");
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          className="install-nudge glass-panel"
          role="dialog"
          aria-label="Install Amazing Gambler"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: "spring", stiffness: 240, damping: 24 }}
        >
          <span className="install-nudge-icon" aria-hidden="true">📲</span>
          <div className="install-nudge-copy">
            <strong>Keep the adventure on your home screen</strong>
            <span>Install Amazing Gambler for one-tap play, full screen, and offline fun.</span>
          </div>
          <div className="install-nudge-actions">
            <button type="button" className="install-nudge-yes" onClick={() => void accept()}>Install</button>
            <button type="button" className="install-nudge-no" onClick={remember}>Not now</button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
