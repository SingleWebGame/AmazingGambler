"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GUARANTEED_ROUNDS } from "@/lib/game";

export type TourModal = "shop" | "collection" | null;

type TourStep = {
  id: string;
  target: string | null;
  title: string;
  body: string;
  // The modal that must be open while this step is shown.
  opens?: TourModal;
  // Lets the player click the highlighted UI instead of blocking it.
  interactive?: boolean;
  hint?: string;
};

const steps: TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Welcome, explorer! 👋",
    body: `Here's a 1-minute tour of the screen. First tip: your first ${GUARANTEED_ROUNDS} predictions are guaranteed wins, so play freely while you learn.`,
  },
  {
    id: "wallet",
    target: '[data-tour="wallet"]',
    title: "Your coin pouch",
    body: "These are your virtual coins, and your balance is your leaderboard score. A free +100 arrives every day if you run out.",
  },
  {
    id: "luck",
    target: '[data-tour="luck"]',
    title: "Luck",
    body: "Right predictions raise Luck. High Luck makes chests more likely, traps rarer, and slightly favors the paths you backed.",
  },
  {
    id: "paths",
    target: '[data-tour="routes"]',
    title: "Pick your path",
    body: "Tap a path to place 1 coin (press and hold to add faster). You can back up to two paths. Risky paths pay 3×.",
  },
  {
    id: "go",
    target: '[data-tour="go"]',
    title: "Watch the turn",
    body: "When your coins are placed, press this to watch the explorer choose. Correct predictions pay 2×.",
  },
  {
    id: "curio-button",
    target: '[data-tour="curio"]',
    title: "Curio cabinet",
    body: "Spend coins on cosmetic keepsakes: halos, skies, trails, marks and badges. They never change the odds.",
    interactive: true,
    hint: "Go on, tap it!",
  },
  {
    id: "curio",
    target: ".shop-modal",
    title: "Collect and equip",
    body: "Item colors show rarity, from gray (common) to orange (legendary). Tap Buy to collect, then Equip to wear it. A different item is on sale every day.",
    opens: "shop",
    interactive: true,
    hint: "Try the tabs and scroll.",
  },
  {
    id: "explorers-button",
    target: '[data-tour="explorers"]',
    title: "Wanderer collection",
    body: "100 explorers wait to be discovered. Find them in lilac chests or buy them with coins.",
    interactive: true,
  },
  {
    id: "explorers",
    target: ".character-collection-modal",
    title: "Rarity at a glance",
    body: "Each card's color shows its rarity: gray, green, blue, purple, orange and mythic pink. Rarer explorers cost more.",
    opens: "collection",
    interactive: true,
    hint: "Scroll to browse them all.",
  },
  {
    id: "leaderboard",
    target: '[data-tour="leaderboard"]',
    title: "Leaderboard",
    body: "See who holds the most coins. Tap a player to view their profile, or collapse the list with the − button.",
  },
  {
    id: "profile",
    target: '[data-tour="profile"]',
    title: "Your explorer profile",
    body: "Change your name, switch explorer, and view your stats here. You can reopen this tour anytime from the ? guide.",
  },
  {
    id: "tips",
    target: null,
    title: "Pro tips 💡",
    body: "When Luck is low, place small bets to keep losses small. Never bet everything on one turn, and remember that after your first 5 rounds the path is truly random.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

type GuidedTourProps = {
  onModalChange: (modal: TourModal) => void;
  onClose: (completed: boolean) => void;
};

const PADDING = 6;

export default function GuidedTour({ onModalChange, onClose }: GuidedTourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [tipHeight, setTipHeight] = useState(180);
  const tipRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const close = useCallback((completed: boolean) => {
    onModalChange(null);
    onClose(completed);
  }, [onClose, onModalChange]);

  useEffect(() => {
    onModalChange(step.opens ?? null);
    nextRef.current?.focus({ preventScroll: true });
  }, [step, onModalChange]);

  // Targets can animate in (modals, panels), so keep measuring while the step is active.
  useEffect(() => {
    const measure = () => {
      setViewport((current) =>
        current.width === window.innerWidth && current.height === window.innerHeight
          ? current
          : { width: window.innerWidth, height: window.innerHeight });
      if (tipRef.current) setTipHeight(tipRef.current.offsetHeight);
      const element = step.target ? document.querySelector(step.target) : null;
      if (!element) {
        setRect((current) => (current === null ? current : null));
        return;
      }
      const box = element.getBoundingClientRect();
      const next = { top: box.top, left: box.left, width: box.width, height: box.height };
      setRect((current) =>
        current && Math.abs(current.top - next.top) < 0.5 && Math.abs(current.left - next.left) < 0.5 &&
        Math.abs(current.width - next.width) < 0.5 && Math.abs(current.height - next.height) < 0.5
          ? current
          : next);
    };
    measure();
    const timer = window.setInterval(measure, 120);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
      else if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        if (isLast) close(true);
        else setIndex((value) => value + 1);
      } else if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, isLast]);

  const tipWidth = Math.min(340, Math.max(220, viewport.width - 24));
  let tipStyle: React.CSSProperties;
  if (!rect) {
    tipStyle = { width: tipWidth, left: Math.max(12, (viewport.width - tipWidth) / 2), top: Math.max(12, (viewport.height - tipHeight) / 2) };
  } else {
    const spaceBelow = viewport.height - (rect.top + rect.height);
    const spaceAbove = rect.top;
    let top: number;
    if (spaceBelow >= tipHeight + 24) top = rect.top + rect.height + PADDING + 10;
    else if (spaceAbove >= tipHeight + 24) top = rect.top - tipHeight - PADDING - 10;
    else top = rect.top + rect.height / 2 > viewport.height / 2 ? 12 : viewport.height - tipHeight - 12;
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - tipWidth / 2), Math.max(12, viewport.width - tipWidth - 12));
    tipStyle = { width: tipWidth, left, top: Math.max(8, top) };
  }

  return (
    <div className="tour-layer">
      {!step.interactive && <div className="tour-blocker" onClick={(event) => event.stopPropagation()} />}
      {rect
        ? (
          <div
            className="tour-spotlight"
            style={{ top: rect.top - PADDING, left: rect.left - PADDING, width: rect.width + PADDING * 2, height: rect.height + PADDING * 2 }}
          />
        )
        : <div className="tour-dim" />}
      <div ref={tipRef} className="tour-tip" style={tipStyle} role="dialog" aria-modal="false" aria-labelledby="tour-title" aria-describedby="tour-body">
        <div className="tour-progress" aria-hidden="true">
          {steps.map((entry, position) => <i key={entry.id} className={position === index ? "tour-dot-active" : position < index ? "tour-dot-done" : ""} />)}
        </div>
        <span className="tour-step-count">Step {index + 1} of {steps.length}</span>
        <h3 id="tour-title">{step.title}</h3>
        <p id="tour-body">{step.body}</p>
        {step.hint && <span className="tour-hint">👆 {step.hint}</span>}
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={() => close(false)}>{isLast ? "Close" : "Skip tour"}</button>
          <span className="tour-spacer" />
          {index > 0 && <button type="button" className="tour-back" onClick={() => setIndex((value) => Math.max(0, value - 1))}>Back</button>}
          <button
            ref={nextRef}
            type="button"
            className="tour-next"
            onClick={() => (isLast ? close(true) : setIndex((value) => value + 1))}
          >
            {isLast ? "Start exploring" : index === 0 ? "Show me" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
