"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import ThreeMazeScene from "./three-maze-scene";
import {
  cosmeticDefinitions,
  createJunction,
  directionNames,
  directionVectors,
  emptyProgress,
  itemDefinitions,
  loadProgress,
  rollChest,
  rollEvent,
  saveProgress,
  statDefinitions,
  trapDefinitions,
  type Direction,
  type CosmeticCategory,
  type EventKind,
  type Junction,
  type Progress,
} from "@/lib/game";

type Phase = "walking" | "choosing" | "approaching" | "moving" | "result" | "idle";
type TrailNode = { x: number; y: number; id: number; event?: EventKind; icon?: string };
type BetMap = Record<Direction, number>;
type TurnReport = {
  room: number;
  actualDirection: Direction;
  placedBets: Partial<BetMap>;
  totalStake: number;
  hit: boolean;
  risky: boolean;
  pathReward: number;
  chestReward: number;
  fortuneBonus: number;
  chestName?: string;
  itemName?: string;
  itemLuckGain: number;
  trapName?: string;
  trapPenalty: number;
  trapCaught: boolean;
  luckBefore: number;
  luckAfter: number;
  balanceBefore: number;
  balanceAfter: number;
};
type GameState = {
  money: number;
  run: number;
  stats: Record<string, number>;
  phase: Phase;
  junction: Junction;
  previous?: Direction;
  explorer: { x: number; y: number };
  trail: TrailNode[];
  bets: BetMap;
  progress: Progress;
  message: string;
  event: EventKind | null;
  overflow: boolean;
  chestCount: number;
  dailyClaimDay: number;
  lastReport: TurnReport | null;
  set: (values: Partial<GameState>) => void;
};

const SESSION_KEY = "amazing-gambler-forever-session";
const DAILY_ALLOWANCE = 100;
const WORLD_DAY_MS = 5 * 60 * 1000;
const WORLD_TRANSITION_MS = 30 * 1000;
const WORLD_NIGHT_MS = 5 * 60 * 1000;
const WORLD_CYCLE_MS = WORLD_DAY_MS + WORLD_TRANSITION_MS + WORLD_NIGHT_MS + WORLD_TRANSITION_MS;
const dayIndex = (date = new Date()) =>
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
const worldPhaseLabel = (startedAt: number, now = Date.now()) => {
  const time = ((now - startedAt) % WORLD_CYCLE_MS + WORLD_CYCLE_MS) % WORLD_CYCLE_MS;
  if (time < WORLD_DAY_MS) return "DAY";
  if (time < WORLD_DAY_MS + WORLD_TRANSITION_MS) return "DUSK";
  if (time < WORLD_DAY_MS + WORLD_TRANSITION_MS + WORLD_NIGHT_MS) return "NIGHT";
  return "DAWN";
};
const formatCoinBalance = (amount: number) =>
  new Intl.NumberFormat("en", {
    notation: amount < 1_000_000 ? "standard" : "compact",
    maximumFractionDigits: amount < 1_000_000 ? 0 : 1,
  }).format(amount);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isDirection = (value: unknown): value is Direction =>
  value === "north" || value === "east" || value === "south" || value === "west";
const isEventKind = (value: unknown): value is EventKind =>
  value === "chest" || value === "item" || value === "trap" || value === "quiet";

function loadForeverSession(): Partial<GameState> | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) throw new Error("Saved adventure is not an object.");
    const options = isRecord(value.junction) && Array.isArray(value.junction.options)
      ? value.junction.options.filter(isDirection)
      : [];
    const hazards = isRecord(value.junction) && Array.isArray(value.junction.hazards)
      ? value.junction.hazards.filter(isDirection)
      : [];
    const junctionId = isRecord(value.junction) && Number.isFinite(value.junction.id)
      ? Number(value.junction.id)
      : 0;
    if (!options.length || !isRecord(value.bets) || !isRecord(value.stats) || !isRecord(value.explorer)) {
      throw new Error("Saved adventure is missing required game state.");
    }
    const bets: BetMap = { north: 0, east: 0, south: 0, west: 0 };
    for (const direction of Object.keys(bets) as Direction[]) {
      const amount = value.bets[direction];
      bets[direction] = Number.isFinite(amount) ? Math.max(0, Math.floor(Number(amount))) : 0;
    }
    const stats = Object.fromEntries(
      Object.entries(value.stats).filter((entry): entry is [string, number] => Number.isFinite(entry[1])),
    );
    const trail = Array.isArray(value.trail)
      ? value.trail.filter((node): node is TrailNode =>
          isRecord(node) && Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.id),
        ).slice(-300)
      : [{ x: 0, y: 0, id: 0 }];
    const progress = isRecord(value.progress)
      ? { ...emptyProgress, ...Object.fromEntries(
          Object.entries(value.progress).filter((entry): entry is [string, number] => Number.isFinite(entry[1])),
        ) } as Progress
      : { ...emptyProgress };
    const reportValue = value.lastReport;
    let lastReport: TurnReport | null = null;
    if (isRecord(reportValue) && isDirection(reportValue.actualDirection) &&
      isRecord(reportValue.placedBets) && ["room", "totalStake", "pathReward", "chestReward", "fortuneBonus", "itemLuckGain", "trapPenalty", "luckBefore", "luckAfter", "balanceBefore", "balanceAfter"].every((key) => Number.isFinite(reportValue[key]))) {
      const placedBets: Partial<BetMap> = {};
      for (const direction of Object.keys(bets) as Direction[]) {
        if (Number.isFinite(reportValue.placedBets[direction])) {
          placedBets[direction] = Number(reportValue.placedBets[direction]);
        }
      }
      lastReport = {
        room: Number(reportValue.room),
        actualDirection: reportValue.actualDirection,
        placedBets,
        totalStake: Number(reportValue.totalStake),
        hit: Boolean(reportValue.hit),
        risky: Boolean(reportValue.risky),
        pathReward: Number(reportValue.pathReward),
        chestReward: Number(reportValue.chestReward),
        fortuneBonus: Number(reportValue.fortuneBonus),
        chestName: typeof reportValue.chestName === "string" ? reportValue.chestName : undefined,
        itemName: typeof reportValue.itemName === "string" ? reportValue.itemName : undefined,
        itemLuckGain: Number(reportValue.itemLuckGain),
        trapName: typeof reportValue.trapName === "string" ? reportValue.trapName : undefined,
        trapPenalty: Number(reportValue.trapPenalty),
        trapCaught: Boolean(reportValue.trapCaught),
        luckBefore: Number(reportValue.luckBefore),
        luckAfter: Number(reportValue.luckAfter),
        balanceBefore: Number(reportValue.balanceBefore),
        balanceAfter: Number(reportValue.balanceAfter),
      };
    }
    return {
      money: Number.isFinite(value.money) ? Math.max(0, Math.floor(Number(value.money))) : 100,
      run: Number.isFinite(value.run) ? Math.max(0, Math.floor(Number(value.run))) : 0,
      stats,
      phase: value.phase === "result" && lastReport
        ? "result"
        : value.phase === "walking" || value.phase === "approaching" || value.phase === "moving"
          ? value.phase
          : "choosing",
      junction: { id: junctionId, options, hazards },
      previous: isDirection(value.previous) ? value.previous : undefined,
      explorer: {
        x: Number.isFinite(value.explorer.x) ? Number(value.explorer.x) : 0,
        y: Number.isFinite(value.explorer.y) ? Number(value.explorer.y) : 0,
      },
      trail,
      bets,
      progress,
      message: typeof value.message === "string" ? value.message : "The adventure continues.",
      event: isEventKind(value.event) ? value.event : null,
      overflow: Boolean(value.overflow),
      chestCount: Number.isFinite(value.chestCount) ? Math.max(0, Math.floor(Number(value.chestCount))) : 0,
      dailyClaimDay: Number.isFinite(value.dailyClaimDay) ? Number(value.dailyClaimDay) : dayIndex(),
      lastReport,
    };
  } catch (error) {
    console.error("Unable to restore the ongoing adventure.", error);
    return null;
  }
}

function saveForeverSession(game: GameState) {
  try {
    const { set: _set, ...session } = game;
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.error("Unable to save the ongoing adventure.", error);
  }
}

const useGame = create<GameState>((set) => ({
  money: 100,
  run: 0,
  stats: Object.fromEntries(statDefinitions.map((stat) => [stat.id, stat.initial])),
  phase: "choosing",
  junction: { id: 0, options: ["north", "east", "south", "west"], hazards: [] },
  explorer: { x: 0, y: 0 },
  trail: [{ x: 0, y: 0, id: 0 }],
  bets: { north: 0, east: 0, south: 0, west: 0 },
  progress: { ...emptyProgress },
  message: "The paths are waiting. Where will fortune lead?",
  event: null,
  overflow: false,
  chestCount: 0,
  dailyClaimDay: dayIndex(),
  lastReport: null,
  set: (values) => set(values),
}));

const characters = [
  { name: "Pip", color: "#f0ae73", face: "🧙" },
  { name: "Moss", color: "#9dbe8f", face: "🧝" },
  { name: "Ruby", color: "#e79a91", face: "🦊" },
  { name: "Orbit", color: "#93b9d2", face: "👩‍🚀" },
];

const reverseDirection: Record<Direction, Direction> = {
  north: "south",
  east: "west",
  south: "north",
  west: "east",
};
const avatarArt = (character: (typeof characters)[number]) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="45" fill="${character.color}" stroke="#24362f" stroke-width="4"/><text x="48" y="62" text-anchor="middle" font-size="48">${character.face}</text></svg>`)}`;

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    coin: <><circle cx="12" cy="12" r="9" /><path d="M15 8.5c-.7-.8-1.7-1.2-3-1.2-1.7 0-2.8.8-2.8 2 0 3 6 1.5 6 4.4 0 1.3-1.2 2.2-3 2.2-1.4 0-2.6-.5-3.4-1.4M12 5.5v13" /></>,
    undo: <><path d="M3 7v6h6" /><path d="M5.2 12a7.5 7.5 0 1 1 1.9 5.1" /></>,
    upload: <><path d="M12 16V4m-4 4 4-4 4 4" /><path d="M4 16v4h16v-4" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    treasure: <><path d="M4 10h16v10H4zM3 6h18v4H3z" /><path d="M12 6v14m-3-14c-3 0-3-4 0-4 2 0 3 4 3 4m3 0c3 0 3-4 0-4-2 0-3 4-3 4" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function LegacyMazeScene({
  game,
  avatar,
  onChoosePath,
  theme,
  trail,
  frame,
}: {
  game: GameState;
  avatar: string;
  onChoosePath: (direction: Direction) => void;
  theme: string;
  trail: string;
  frame: string;
}) {
  const isMoving = game.phase === "moving" && game.previous !== undefined;
  const travelVector = isMoving ? directionVectors[game.previous!] : null;
  const camera = travelVector
    ? { x: game.explorer.x - travelVector.x, y: game.explorer.y - travelVector.y }
    : game.explorer;
  const previous = game.previous;
  const junction = game.junction;
  const allOptions = junction.options;
  const selectedCount = Object.values(game.bets).filter((amount) => amount > 0).length;
  const point = (direction: Direction, distance: number) => {
    const vector = directionVectors[direction];
    return { x: 400 + vector.x * distance, y: 250 + vector.y * distance };
  };
  const trailPath = game.trail
    .map((node, index) => `${index === 0 ? "M" : "L"} ${400 + (node.x - camera.x) * 112} ${250 + (node.y - camera.y) * 92}`)
    .join(" ");
  const pattern = useMemo(
    () => Array.from({ length: 18 }, (_, i) => ({
      x: (i * 157 + 39) % 800,
      y: (i * 97 + 33) % 520,
      rotate: (i * 31) % 90,
    })),
    [],
  );
  return (
    <div className={`maze-frame ${theme === "moonlit-maze" ? "maze-night" : ""}`}>
      <div className="scene-topline">
        <span className="chapter-label"><span className="live-dot" /> THE UNKNOWN, ROOM {String(game.run + 1).padStart(2, "0")}</span>
        <span className="scene-note">Every turn tells a story</span>
      </div>
      <svg className="maze-svg" viewBox="0 0 800 520" role="img" aria-label="Hand-drawn maze intersection">
        <defs>
          <pattern id="paper-dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r=".8" fill="#777258" opacity=".13" />
          </pattern>
          <filter id="roughen">
            <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="8" />
            <feDisplacementMap in="SourceGraphic" scale="2" />
          </filter>
          <filter id="avatar-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#283c34" floodOpacity=".22" />
          </filter>
        </defs>
        <rect width="800" height="520" fill="url(#paper-dots)" />
        {pattern.map((spot, index) => (
          <g key={index} transform={`translate(${spot.x} ${spot.y}) rotate(${spot.rotate})`} opacity=".14" className="maze-decoration">
            <path d="M-14 0q7-5 14 0t14 0M0-14q-4 7 0 14t0 14" />
          </g>
        ))}
        <g className="maze-lines" filter="url(#roughen)">
          {previous && !isMoving && (
            <>
              <path d={`M 400 250 L ${point(reverseDirection[previous], 175).x} ${point(reverseDirection[previous], 175).y}`} className="wall-line" />
              <path d={`M 400 250 L ${point(reverseDirection[previous], 175).x} ${point(reverseDirection[previous], 175).y}`} className="wall-line wall-line-light" />
              <path d={`M 400 250 L ${point(reverseDirection[previous], 170).x} ${point(reverseDirection[previous], 170).y}`} className="walked-line" />
            </>
          )}
          {allOptions.map((direction) => {
            const end = point(direction, 210);
            const perpendicular = direction === "north" || direction === "south" ? 38 : 32;
            const vector = directionVectors[direction];
            const px = vector.y === 0 ? 0 : perpendicular;
            const py = vector.x === 0 ? 0 : perpendicular;
            const pathStart = { x: 400 + px, y: 250 + py };
            const pathEnd = { x: end.x + px, y: end.y + py };
            const selected = game.bets[direction] > 0;
            const danger = junction.hazards.includes(direction);
            const choiceBlocked = game.phase === "choosing" && selectedCount >= 2 && !selected;
            return (
              <g key={direction}>
                <path d={`M ${pathStart.x} ${pathStart.y} L ${pathEnd.x} ${pathEnd.y}`} className="wall-line" />
                <path d={`M ${pathStart.x + (vector.x ? 3 : -3)} ${pathStart.y + (vector.y ? 3 : -3)} L ${pathEnd.x + (vector.x ? 3 : -3)} ${pathEnd.y + (vector.y ? 3 : -3)}`} className="wall-line wall-line-light" />
                <path
                  d={`M ${400 - px} ${250 - py} L ${end.x - px} ${end.y - py}`}
                  className={`path-line ${selected ? "path-selected" : ""} ${game.phase === "choosing" ? "path-choice" : ""}`}
                />
                {game.phase === "choosing" && (
                  <g
                    transform={`translate(${point(direction, 145).x} ${point(direction, 145).y})`}
                    role="button"
                    tabIndex={0}
                    aria-disabled={choiceBlocked}
                    aria-label={`Choose ${directionNames[direction]} path${danger ? ", risky" : ""}`}
                    className={choiceBlocked ? "route-target route-target-blocked" : "route-target"}
                    onClick={() => onChoosePath(direction)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onChoosePath(direction);
                      }
                    }}
                  >
                    <circle r="21" className={`route-marker ${selected ? "route-marker-selected" : ""} ${danger ? "route-marker-danger" : ""}`} />
                    <text y="6" textAnchor="middle" className="route-letter">{String.fromCharCode(65 + allOptions.indexOf(direction))}</text>
                    {danger && <text x="0" y="43" textAnchor="middle" className="danger-caption">DANGER</text>}
                  </g>
                )}
                {game.phase !== "choosing" && danger && (
                  <g transform={`translate(${point(direction, 155).x} ${point(direction, 155).y})`} className="danger-mark">
                    <path d="M0-13 13 11H-13Z" />
                    <text y="6" textAnchor="middle">!</text>
                  </g>
                )}
              </g>
            );
          })}
          {trailPath && <path d={trailPath} className={`trail-line ${trail === "starlight-trail" ? "trail-stars" : ""}`} />}
          {game.trail.slice(-5).map((node) => (
            <g key={`node-${node.id}`} transform={`translate(${400 + (node.x - camera.x) * 112} ${250 + (node.y - camera.y) * 92})`}>
              {node.event === "chest" && <text className="maze-event" textAnchor="middle" y="-48">🧰</text>}
              {node.event === "item" && <text className="maze-event" textAnchor="middle" y="-48">✦</text>}
              {node.event === "trap" && <text className="maze-event" textAnchor="middle" y="-48">{node.icon ?? "⚠"}</text>}
            </g>
          ))}
          <circle cx="400" cy="250" r="42" className="junction-halo" />
          <circle cx="400" cy="250" r="8" className="junction-dot" />
          {frame === "gold-frame" && <circle cx={367 + (travelVector?.x ?? 0) * 112 + 33} cy={217 + (travelVector?.y ?? 0) * 92 + 33} r="35" className="avatar-gold-frame" />}
          <image
            href={avatar}
            x={367 + (travelVector?.x ?? 0) * 112}
            y={217 + (travelVector?.y ?? 0) * 92}
            width="66"
            height="66"
            filter="url(#avatar-shadow)"
            className={`explorer-sprite ${game.phase === "moving" ? "explorer-moving" : game.phase === "walking" ? "explorer-walking" : ""}`}
          />
        </g>
      </svg>
      <div className="scene-caption">
        <span><span className="caption-dot" /> You are here</span>
        <span className="caption-mystery">The maze only reveals what you&apos;ve earned.</span>
      </div>
    </div>
  );
}

function MazeScene({
  game,
  avatar,
  onPathHoldStart,
  theme,
  trail,
  frame,
  worldClockStartedAt,
  worldPhase,
}: {
  game: GameState;
  avatar: string;
  onPathHoldStart: (direction: Direction) => void;
  theme: string;
  trail: string;
  frame: string;
  worldClockStartedAt: number;
  worldPhase: string;
}) {
  return (
    <ThreeMazeScene
      junction={game.junction}
      explorer={game.explorer}
      phase={game.phase}
      previous={game.previous}
      bets={game.bets}
      avatar={avatar}
      onPathHoldStart={onPathHoldStart}
      theme={theme}
      trail={trail}
      frame={frame}
      worldClockStartedAt={worldClockStartedAt}
      worldPhase={worldPhase}
    />
  );
}

function SelectionModal({
  onSelect,
  onUpload,
  onClose,
  hasCharacter,
}: {
  onSelect: (name: string, image: string) => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  hasCharacter: boolean;
}) {
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="character-modal" initial={{ y: 16, scale: .97 }} animate={{ y: 0, scale: 1 }} aria-labelledby="character-title">
        {hasCharacter && <button className="modal-close" onClick={onClose} aria-label="Close character picker">×</button>}
        <span className="eyebrow">A NEW ADVENTURE BEGINS</span>
        <h2 id="character-title">Who&apos;s taking the first step?</h2>
        <p>Choose a familiar face, or bring your own lucky charm.</p>
        <div className="character-options">
          {characters.map((character) => (
            <button key={character.name} className="character-choice" onClick={() => onSelect(character.name, avatarArt(character))}>
              <img src={avatarArt(character)} alt="" />
              <span>{character.name}</span>
            </button>
          ))}
        </div>
        <label className="upload-choice">
          <Icon name="upload" size={19} />
          <span>Upload your own explorer</span>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onUpload} />
        </label>
        <div className="modal-footnote">A face for the road. No account, no stakes—just play.</div>
      </motion.section>
    </motion.div>
  );
}

function TutorialModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div className="modal-backdrop tutorial-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section
        className="tutorial-modal"
        initial={{ y: 16, scale: .97 }}
        animate={{ y: 0, scale: 1 }}
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-description"
        role="dialog"
        aria-modal="true"
      >
        <span className="eyebrow">YOUR GUIDE TO THE FOREVER MAZE</span>
        <h2 id="tutorial-title">How to play</h2>
        <p id="tutorial-description" className="tutorial-intro">Read the crossroads, predict the explorer&apos;s next move, and learn what every part of the maze does. This guide is always available from the ? button.</p>
        <ol className="tutorial-steps">
          <li><span>1</span><div><strong>Read the crossroads</strong><p>Predict up to two open paths. A risky marker warns that the route may bring a trap.</p></div></li>
          <li><span>2</span><div><strong>Place your virtual coins</strong><p>Each tap adds 1 coin to a path; press and hold to add faster. Use Undo last coin to take back one. Your wager is split across the paths you chose.</p></div></li>
          <li><span>3</span><div><strong>Watch destiny unfold</strong><p>After you press Watch the turn, the explorer approaches, the camera zooms, then the random path is revealed. Correct predictions pay 2×, or 3× on a risky path. Read the turn report before continuing.</p></div></li>
          <li><span>4</span><div><strong>Find luck and trouble</strong><p>Chests award virtual coins, lucky items raise Luck, and traps can cost coins and Luck. Luck influences the chance of special events.</p></div></li>
          <li><span>5</span><div><strong>Your forever adventure</strong><p>Progress saves on this device and the maze keeps going. A daily pouch adds 100 free coins each new day; if you run out, wait for it to arrive.</p></div></li>
          <li><span>6</span><div><strong>Personalize your maze</strong><p>The Curio cabinet sells cosmetic keepsakes using virtual coins. Buy an item, then equip it. Frames, trails, themes, icons, and badges are visual only.</p></div></li>
          <li><span>7</span><div><strong>Day turns to night</strong><p>In-game day and night each last 5 minutes, with a gentle 30-second transition between them. It only changes the scenery—not luck, paths, or rewards.</p></div></li>
        </ol>
        <button className="tutorial-close-button" onClick={onClose}>Close guide &amp; keep exploring</button>
        <div className="modal-footnote">A cozy game with virtual coins only—never real-money gambling.</div>
      </motion.section>
    </motion.div>
  );
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [helpPlatform, setHelpPlatform] = useState<"ios" | "browser" | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) {
      setHelpPlatform(/iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios" : "browser");
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
    } catch (error) {
      console.error("Unable to start the app installation prompt.", error);
      setInstallPrompt(null);
      setHelpPlatform("browser");
    }
  };

  if (installed) return null;

  return (
    <>
      <button className="install-button" onClick={() => void install()} aria-label="Install Amazing Gambler on your phone">
        <span aria-hidden="true">↓</span> <span>Install</span>
      </button>
      <AnimatePresence>
        {helpPlatform && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setHelpPlatform(null)}>
            <motion.section className="install-help-modal" initial={{ y: 16 }} animate={{ y: 0 }} exit={{ y: 12 }} onClick={(event) => event.stopPropagation()}>
              <button className="modal-close" onClick={() => setHelpPlatform(null)} aria-label="Close install instructions">×</button>
              <span className="eyebrow">TAKE THE MAZE WITH YOU</span>
              <h2>Add to your Home Screen</h2>
              {helpPlatform === "ios"
                ? <p>In Safari, tap <strong>Share</strong> <span aria-label="Share">↑</span>, choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</p>
                : <p>Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. The exact wording can vary by browser.</p>}
              <div className="install-help-note">Your adventure opens from its own icon, just like an app.</div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function Game() {
  const game = useGame();
  const [avatar, setAvatar] = useState(avatarArt(characters[0]));
  const [characterName, setCharacterName] = useState("Pip");
  const [hasPickedCharacter, setHasPickedCharacter] = useState(false);
  const [showPicker, setShowPicker] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialSeen, setTutorialSeen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [turnResult, setTurnResult] = useState<TurnReport | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [ownedCosmetics, setOwnedCosmetics] = useState<string[]>([]);
  const [equipped, setEquipped] = useState<Partial<Record<CosmeticCategory, string>>>({});
  const [toast, setToast] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [dailyCountdown, setDailyCountdown] = useState("");
  const [worldClockStartedAt, setWorldClockStartedAt] = useState(0);
  const [worldPhase, setWorldPhase] = useState("DAY");
  const worldClockStartedAtRef = useRef<number | null>(null);
  const heldPathRef = useRef<{ direction: Direction; startedAt: number; timer: number } | null>(null);
  const lastPlacedDirectionRef = useRef<Direction | null>(null);
  const addBetRef = useRef<(direction: Direction, amount?: number) => void>(() => {});
  const luck = game.stats.luck ?? 10;
  const selectedCount = Object.values(game.bets).filter((amount) => amount > 0).length;
  const totalBet = Object.values(game.bets).reduce((sum, amount) => sum + amount, 0);
  const suspenseReport = (game.phase === "approaching" || game.phase === "moving") ? game.lastReport : null;
  const displayMoney = suspenseReport?.balanceBefore ?? game.money;
  const displayLuck = suspenseReport?.luckBefore ?? luck;
  const displayRoom = suspenseReport?.room ?? game.run + 1;
  const displayChests = game.chestCount - (suspenseReport?.chestName ? 1 : 0);
  const equippedIcon = cosmeticDefinitions.find((cosmetic) => cosmetic.id === equipped.icon)?.icon;
  const equippedBadge = cosmeticDefinitions.find((cosmetic) => cosmetic.id === equipped.badge);
  const currentOptions = game.junction.options;
  const optionNames = currentOptions.map((direction, index) => ({
    direction,
    label: String.fromCharCode(65 + index),
  }));
  const avatarName = characterName;

  useEffect(() => {
    const restored = loadForeverSession();
    const today = dayIndex();
    if (restored) {
      const elapsedDays = Math.max(0, today - (restored.dailyClaimDay ?? today));
      game.set({
        ...restored,
        money: (restored.money ?? 100) + elapsedDays * DAILY_ALLOWANCE,
        dailyClaimDay: today,
        progress: loadProgress(),
      });
    } else {
      game.set({ dailyClaimDay: today, progress: loadProgress() });
    }
    setTurnResult(restored?.lastReport ?? null);
    try {
      const characterRaw = window.localStorage.getItem("amazing-gambler-forever-character");
      if (characterRaw) {
        const characterValue: unknown = JSON.parse(characterRaw);
        if (isRecord(characterValue) && typeof characterValue.name === "string" &&
          typeof characterValue.avatar === "string" && characterValue.avatar.length < 7_000_000) {
          setCharacterName(characterValue.name);
          setAvatar(characterValue.avatar);
          setHasPickedCharacter(true);
          setShowPicker(false);
        }
      }
    } catch (error) {
      console.error("Unable to restore your explorer.", error);
    }
    try {
      setTutorialSeen(window.localStorage.getItem("amazing-gambler-tutorial-seen") === "true");
    } catch (error) {
      console.error("Unable to read the tutorial preference.", error);
    }
    try {
      const saved = window.localStorage.getItem("amazing-gambler-cosmetics");
      if (saved) {
        const cosmetics = JSON.parse(saved) as { owned?: unknown; equipped?: unknown };
        if (Array.isArray(cosmetics.owned)) {
          setOwnedCosmetics(cosmetics.owned.filter((id): id is string =>
            typeof id === "string" && cosmeticDefinitions.some((cosmetic) => cosmetic.id === id),
          ));
        }
        if (cosmetics.equipped && typeof cosmetics.equipped === "object" && !Array.isArray(cosmetics.equipped)) {
          setEquipped(cosmetics.equipped as Partial<Record<CosmeticCategory, string>>);
        }
      }
    } catch (error) {
      console.error("Unable to load saved cosmetics.", error);
    }
    setSessionReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    saveForeverSession(game);
  }, [
    sessionReady,
    game.money,
    game.run,
    game.stats,
    game.phase,
    game.junction,
    game.previous,
    game.explorer,
    game.trail,
    game.bets,
    game.progress,
    game.message,
    game.event,
    game.overflow,
    game.chestCount,
    game.dailyClaimDay,
    game.lastReport,
  ]);

  useEffect(() => {
    if (!sessionReady) return;
    const updateDailyAllowance = () => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const seconds = Math.max(0, Math.ceil((tomorrow.getTime() - now.getTime()) / 1000));
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = seconds % 60;
      setDailyCountdown(`${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`);
      const today = dayIndex(now);
      if (today > useGame.getState().dailyClaimDay) {
        const current = useGame.getState();
        const elapsedDays = today - current.dailyClaimDay;
        current.set({
          money: current.money + elapsedDays * DAILY_ALLOWANCE,
          dailyClaimDay: today,
          message: `Your daily pouch arrived: +${(elapsedDays * DAILY_ALLOWANCE).toLocaleString()} coins.`,
        });
        setToast(`Your daily pouch arrived: +${(elapsedDays * DAILY_ALLOWANCE).toLocaleString()} coins.`);
        window.setTimeout(() => setToast(""), 3500);
      }
    };
    updateDailyAllowance();
    const interval = window.setInterval(updateDailyAllowance, 1000);
    return () => window.clearInterval(interval);
  }, [sessionReady]);

  useEffect(() => {
    if (worldClockStartedAtRef.current === null) {
      const now = Date.now();
      let savedStart: number | null = null;
      try {
        const saved = window.localStorage.getItem("amazing-gambler-world-clock-start");
        const parsed = saved === null ? NaN : Number(saved);
        if (Number.isFinite(parsed) && parsed > 0 && parsed <= now) savedStart = parsed;
      } catch (error) {
        console.error("Unable to restore the in-game clock.", error);
      }
      const startedAt = savedStart ?? now;
      worldClockStartedAtRef.current = startedAt;
      if (savedStart === null) {
        try {
          window.localStorage.setItem("amazing-gambler-world-clock-start", String(startedAt));
        } catch (error) {
          console.error("Unable to save the in-game clock.", error);
        }
      }
    }
    const startedAt = worldClockStartedAtRef.current;
    setWorldClockStartedAt(startedAt);
    const updatePhase = () => setWorldPhase(worldPhaseLabel(startedAt));
    updatePhase();
    const timer = window.setInterval(updatePhase, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistration("/").then((registration) => {
        if (registration?.active && new URL(registration.active.scriptURL).pathname === "/sw.js") {
          return registration.unregister();
        }
        return undefined;
      }).catch((error: unknown) => {
        console.error("Unable to unregister the offline worker in development.", error);
      });
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("Unable to enable offline game support.", error);
    });
  }, []);

  useEffect(() => {
    if (game.phase === "walking") {
      const timer = window.setTimeout(() => game.set({ phase: "choosing", message: "Choose a path. Trust your gut." }), 850);
      return () => window.clearTimeout(timer);
    }
    if (game.phase === "approaching" && game.lastReport) {
      const timer = window.setTimeout(() => {
        game.set({ phase: "moving", previous: game.lastReport?.actualDirection });
      }, 2600);
      return () => window.clearTimeout(timer);
    }
    if (game.phase === "moving" && game.lastReport) {
      const timer = window.setTimeout(() => {
        const junction = createJunction(game.run, game.previous);
        game.set({
          phase: "result",
          junction,
          bets: { north: 0, east: 0, south: 0, west: 0 },
          event: game.lastReport?.trapName ? "trap" : game.lastReport?.chestName ? "chest" : game.lastReport?.itemName ? "item" : null,
        });
      }, 2300);
      return () => window.clearTimeout(timer);
    }
  }, [game.phase, game.run, game.previous, game.lastReport, game]);

  useEffect(() => {
    const stopHolding = () => {
      if (heldPathRef.current) window.clearTimeout(heldPathRef.current.timer);
      heldPathRef.current = null;
    };
    window.addEventListener("pointerup", stopHolding);
    window.addEventListener("pointercancel", stopHolding);
    window.addEventListener("blur", stopHolding);
    return () => {
      stopHolding();
      window.removeEventListener("pointerup", stopHolding);
      window.removeEventListener("pointercancel", stopHolding);
      window.removeEventListener("blur", stopHolding);
    };
  }, []);

  const chooseCharacter = (name: string, image: string) => {
    setAvatar(image);
    setCharacterName(name);
    setHasPickedCharacter(true);
    setShowPicker(false);
    try {
      window.localStorage.setItem("amazing-gambler-forever-character", JSON.stringify({ name, avatar: image }));
    } catch (error) {
      console.error("Unable to save your explorer.", error);
      setToast("Your explorer could not be saved on this device.");
    }
    if (!tutorialSeen) setShowTutorial(true);
    if (game.phase !== "result" && game.phase !== "approaching" && game.phase !== "moving") game.set({ phase: "walking" });
  };

  const closeTutorial = () => {
    setShowTutorial(false);
    setTutorialSeen(true);
    try {
      window.localStorage.setItem("amazing-gambler-tutorial-seen", "true");
    } catch (error) {
      console.error("Unable to save the tutorial preference.", error);
    }
  };

  const uploadCharacter = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setToast("That image is a little too large (max 5 MB).");
      window.setTimeout(() => setToast(""), 2800);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      setToast("We couldn’t open that image. Try another one.");
      window.setTimeout(() => setToast(""), 2800);
    };
    reader.onload = () => {
      if (typeof reader.result === "string") chooseCharacter("Your explorer", reader.result);
    };
    reader.readAsDataURL(file);
  };

  const addBet = (direction: Direction, amount = 1) => {
    if (game.phase !== "choosing") return;
    const current = game.bets[direction];
    if (current === 0 && selectedCount >= 2) {
      if (!toast) {
        setToast("You can back up to two paths at each junction.");
        window.setTimeout(() => setToast(""), 2400);
      }
      return;
    }
    const available = Math.max(0, game.money - totalBet);
    if (!available) {
      if (!toast) {
        setToast(`No coins left. Your daily pouch arrives in ${dailyCountdown || "a little while"}.`);
        window.setTimeout(() => setToast(""), 3000);
      }
      return;
    }
    const next = Math.min(game.money - (totalBet - current), current + Math.min(amount, available));
    lastPlacedDirectionRef.current = direction;
    const nextBets = { ...game.bets, [direction]: next };
    game.set({ bets: nextBets });
  };

  addBetRef.current = addBet;

  const startPathHold = (direction: Direction) => {
    if (game.phase !== "choosing") return;
    if (heldPathRef.current) window.clearTimeout(heldPathRef.current.timer);
    addBetRef.current(direction, 1);
    const hold = { direction, startedAt: Date.now(), timer: 0 };
    heldPathRef.current = hold;
    const repeat = () => {
      if (heldPathRef.current !== hold) return;
      addBetRef.current(direction, 1);
      const heldFor = Date.now() - hold.startedAt;
      const delay = Math.max(70, 280 - Math.floor(heldFor / 700) * 35);
      hold.timer = window.setTimeout(repeat, delay);
    };
    hold.timer = window.setTimeout(repeat, 420);
  };

  const stopPathHold = () => {
    if (heldPathRef.current) window.clearTimeout(heldPathRef.current.timer);
    heldPathRef.current = null;
  };

  const undoLastCoin = () => {
    if (game.phase !== "choosing") return;
    const direction = lastPlacedDirectionRef.current && game.bets[lastPlacedDirectionRef.current] > 0
      ? lastPlacedDirectionRef.current
      : currentOptions.find((option) => game.bets[option] > 0);
    if (!direction) return;
    const next = { ...game.bets, [direction]: Math.max(0, game.bets[direction] - 1) };
    if (next[direction] === 0) {
      lastPlacedDirectionRef.current = currentOptions.find((option) => next[option] > 0) ?? null;
    }
    game.set({ bets: next });
  };

  const resolveRound = () => {
    if (!selectedCount || totalBet <= 0 || game.phase !== "choosing" || totalBet > game.money) {
      if (!game.money) setToast(`Your pouch is empty. Your daily +100 arrives in ${dailyCountdown || "a little while"}.`);
      else setToast("Tap a path to place at least one coin first.");
      window.setTimeout(() => setToast(""), 2800);
      return;
    }
    const options = game.junction.options;
    const actualDirection = options[Math.floor(Math.random() * options.length)];
    const hit = Object.entries(game.bets).some(([direction, amount]) => direction === actualDirection && amount > 0);
    const dangerous = game.junction.hazards.includes(actualDirection);
    const predictedTrap = hit && dangerous;
    const event = rollEvent(luck);
    const chest = event === "chest" ? rollChest(luck) : null;
    const item = event === "item" ? itemDefinitions[Math.floor(Math.random() * itemDefinitions.length)] : null;
    const trapEncounter = dangerous || event === "trap";
    const trap = trapEncounter
      ? trapDefinitions[Math.floor(Math.random() * trapDefinitions.length)]
      : null;
    const oldLuck = luck;
    const balanceBefore = game.money;
    let nextLuck = oldLuck;
    let pathReward = 0;
    if (hit) {
      pathReward = game.bets[actualDirection] * (dangerous ? 3 : 2);
      nextLuck += dangerous ? 22 : 7;
    } else {
      nextLuck = Math.max(0, nextLuck - 5);
    }
    let fortuneBonus = predictedTrap ? 50 : 0;
    const beforeItem = nextLuck;
    if (item) nextLuck = item.apply({ ...game.stats, luck: nextLuck }).luck;
    const itemLuckGain = item ? Math.max(0, nextLuck - beforeItem) : 0;
    const overflowReached = nextLuck >= 100;
    const overflowArmed = game.overflow || oldLuck >= 100;
    const overflowActivated = overflowArmed && hit;
    if (overflowActivated) {
      fortuneBonus += 75;
      nextLuck = 5;
    }
    nextLuck = Math.min(100, Math.max(0, nextLuck));
    const survivalChance = trap
      ? Math.max(0.1, Math.min(.82, .36 + oldLuck / 300 - trap.survivalDifficulty))
      : 1;
    const trapCaught = trapEncounter && Math.random() > survivalChance;
    const requestedTrapPenalty = trap ? trap.moneyPenalty + (trapCaught ? 10 : 0) : 0;
    const balanceBeforeTrap = Math.max(0, balanceBefore - totalBet + pathReward + (chest?.reward ?? 0) + fortuneBonus);
    const trapPenalty = Math.min(requestedTrapPenalty, balanceBeforeTrap);
    if (trap) {
      nextLuck = Math.max(0, nextLuck - trap.luckPenalty);
    }
    const nextMoney = balanceBeforeTrap - trapPenalty;
    const selectedBets: Partial<BetMap> = {};
    for (const direction of Object.keys(game.bets) as Direction[]) {
      if (game.bets[direction] > 0) selectedBets[direction] = game.bets[direction];
    }
    const report: TurnReport = {
      room: game.run + 1,
      actualDirection,
      placedBets: selectedBets,
      totalStake: totalBet,
      hit,
      risky: dangerous,
      pathReward,
      chestReward: chest?.reward ?? 0,
      fortuneBonus,
      chestName: chest?.label,
      itemName: item?.name,
      itemLuckGain,
      trapName: trap?.label,
      trapPenalty,
      trapCaught,
      luckBefore: oldLuck,
      luckAfter: nextLuck,
      balanceBefore,
      balanceAfter: nextMoney,
    };
    const nextRun = game.run + 1;
    const resultMessage = trapCaught
      ? `${characterName} hit a ${trap?.label.toLowerCase()} trap, but the adventure goes on.`
      : hit
        ? `A lovely read. ${characterName} took ${directionNames[actualDirection]}.`
        : `${characterName} chose ${directionNames[actualDirection]}. Read the turn report to see what changed.`;
    const nextProgress: Progress = {
      totalEarned: game.progress.totalEarned + Math.max(0, pathReward + (chest?.reward ?? 0) + fortuneBonus),
      highestLuck: Math.max(game.progress.highestLuck, oldLuck, nextLuck),
      longestRun: Math.max(game.progress.longestRun, nextRun),
      chestsCollected: game.progress.chestsCollected + (chest ? 1 : 0),
      correctPredictions: game.progress.correctPredictions + (hit ? 1 : 0),
      failedPredictions: game.progress.failedPredictions + (hit ? 0 : 1),
      trapPredictions: game.progress.trapPredictions + (predictedTrap ? 1 : 0),
    };
    const vector = directionVectors[actualDirection];
    const node: TrailNode = {
      x: game.explorer.x + vector.x,
      y: game.explorer.y + vector.y,
      id: nextRun,
      event: trapEncounter ? "trap" : event,
      icon: trapEncounter ? trap?.icon : chest?.id,
    };
    const stepStats = { ...game.stats, luck: nextLuck };
    setTurnResult(report);
    game.set({
      money: nextMoney,
      run: nextRun,
      stats: stepStats,
      phase: "approaching",
      explorer: { x: node.x, y: node.y },
      trail: [...game.trail, node],
      progress: nextProgress,
      message: resultMessage,
      event: trapEncounter ? "trap" : event,
      overflow: !overflowActivated && (overflowArmed || overflowReached),
      chestCount: game.chestCount + (chest ? 1 : 0),
      lastReport: report,
    });
    saveProgress(nextProgress);
  };

  const collectCosmetic = (id: string) => {
    const cosmetic = cosmeticDefinitions.find((entry) => entry.id === id);
    if (!cosmetic) return;
    const isOwned = ownedCosmetics.includes(id);
    if (!isOwned && game.money < cosmetic.price) {
      setToast("A few more coins and this little treasure is yours.");
      window.setTimeout(() => setToast(""), 2400);
      return;
    }
    const nextOwned = isOwned ? ownedCosmetics : [...ownedCosmetics, id];
    const nextEquipped = { ...equipped, [cosmetic.category]: id };
    setOwnedCosmetics(nextOwned);
    setEquipped(nextEquipped);
    if (!isOwned) game.set({ money: game.money - cosmetic.price });
    try {
      window.localStorage.setItem("amazing-gambler-cosmetics", JSON.stringify({
        owned: nextOwned,
        equipped: nextEquipped,
      }));
      setToast(isOwned ? `${cosmetic.label} is now part of your adventure.` : `${cosmetic.label} added to your collection.`);
    } catch (error) {
      console.error("Unable to save cosmetics.", error);
      setToast("We couldn’t save that treasure. Please try again.");
    }
    window.setTimeout(() => setToast(""), 2400);
  };

  const shareText = `Amazing Gambler — $${game.progress.totalEarned.toLocaleString()} earned, ${game.progress.longestRun} rooms explored, ${game.progress.chestsCollected} treasures found. Predict the path!`;
  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setToast("Your adventure is copied and ready to share.");
    } catch {
      setToast("Copy isn’t available here. Try your browser’s share button.");
    }
    window.setTimeout(() => setToast(""), 2600);
  };
  const shareResult = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Amazing Gambler", text: shareText });
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          setToast("Sharing didn’t work this time.");
          window.setTimeout(() => setToast(""), 2400);
        }
      }
    } else {
      void copyResult();
    }
  };

  const downloadResult = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext("2d");
    if (!context) {
      setToast("Couldn’t make the result card on this device.");
      return;
    }
    context.fillStyle = "#f5efdf";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#19382f";
    context.font = "700 46px Georgia";
    context.fillText("AMAZING GAMBLER", 72, 110);
    context.font = "italic 24px Georgia";
    context.fillStyle = "#63766a";
    context.fillText("Predict the Path. Trust the Luck. Win the Fortune.", 72, 154);
    context.strokeStyle = "#c8bfa8";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(72, 190);
    context.lineTo(1128, 190);
    context.stroke();
    const stats = [
      ["MONEY EARNED", `$${game.progress.totalEarned.toLocaleString()}`],
      ["LONGEST RUN", `${game.progress.longestRun} rooms`],
      ["HIGHEST LUCK", `${game.progress.highestLuck}%`],
      ["CHESTS FOUND", `${game.progress.chestsCollected}`],
    ];
    stats.forEach(([label, value], index) => {
      const x = 72 + (index % 2) * 520;
      const y = 300 + Math.floor(index / 2) * 150;
      context!.fillStyle = "#66796e";
      context!.font = "600 20px Arial";
      context!.fillText(label, x, y);
      context!.fillStyle = "#19382f";
      context!.font = "700 48px Georgia";
      context!.fillText(value, x, y + 58);
    });
    context.fillStyle = "#788475";
    context.font = "18px Arial";
    context.fillText("A little luck goes a long way.", 72, 592);
    const anchor = document.createElement("a");
    anchor.download = "amazing-gambler-result.png";
    anchor.href = canvas.toDataURL("image/png");
    anchor.click();
    setToast("Your result card is ready.");
    window.setTimeout(() => setToast(""), 2200);
  };

  const isDangerous = (direction: Direction) => game.junction.hazards.includes(direction);
  const advanceAfterReport = () => {
    setTurnResult(null);
    game.set({
      phase: "choosing",
      lastReport: null,
      message: "Choose a path. Trust your instincts.",
    });
  };
  const resultPath = turnResult ? directionNames[turnResult.actualDirection] : "";
  const netCoins = turnResult ? turnResult.balanceAfter - turnResult.balanceBefore : 0;
  const predictedPaths = turnResult
    ? (Object.entries(turnResult.placedBets) as [Direction, number][]).filter(([, amount]) => amount > 0)
    : [];

  return (
    <main className="game-shell immersive-game">
      <div className="immersive-scene">
        <MazeScene
          game={game}
          avatar={avatar}
          onPathHoldStart={startPathHold}
          theme={equipped.theme ?? ""}
          trail={equipped.trail ?? ""}
          frame={equipped.frame ?? ""}
          worldClockStartedAt={worldClockStartedAt}
          worldPhase={worldPhase}
        />
      </div>

      <header className="immersive-hud" aria-label="Adventure status">
        <div className="hud-room glass-panel">
          <span className="hud-overline">THE FOREVER MAZE</span>
          <strong>ROOM {String(displayRoom).padStart(2, "0")}</strong>
        </div>
        <div className="hud-luck glass-panel" aria-label={`Luck ${displayLuck} percent`}>
          <div className="hud-luck-top"><span>☘</span><span>LUCK</span><strong>{displayLuck}%</strong></div>
          <div className="hud-luck-track"><div className="hud-luck-fill" style={{ width: `${Math.min(100, displayLuck)}%` }} /></div>
          {game.overflow && <span className="hud-overflow">FORTUNE READY</span>}
        </div>
        <div className="hud-wallet glass-panel">
          <div className="hud-coins"><span className="coin-stack" aria-hidden="true"><span className="coin-stack-back" /><span className="coin-stack-middle" /><span className="coin-stack-face">$</span></span><strong title={displayMoney.toLocaleString()}>{formatCoinBalance(displayMoney)}</strong></div>
          <div className="hud-chests"><Icon name="treasure" size={14} /><span>{displayChests} chests found</span></div>
          <div className={`hud-daily ${displayMoney === 0 ? "hud-daily-waiting" : ""}`}>{displayMoney === 0 ? `Daily pouch · +100 in ${dailyCountdown}` : `+100 daily · ${dailyCountdown}`}</div>
        </div>
      </header>

      <div className="world-title"><span className="world-clover">{equippedIcon ?? "✳"}</span><span>AMAZING GAMBLER</span><span className="world-time">{worldPhase}</span></div>

      <div className="world-shortcuts">
        <button className="profile-button glass-panel" onClick={() => setShowPicker(true)} aria-label={`Change explorer, current character ${avatarName}`}>
          <img src={avatar} alt="" /><span>{avatarName}</span><span className="profile-caret">⌄</span>
        </button>
        <button className="glass-tool" onClick={() => setShopOpen(true)}>✦ <span>Curio cabinet</span></button>
        <button className="glass-tool" onClick={() => setResultOpen(true)}>✧ <span>Journey card</span></button>
        <button className="glass-tool" onClick={() => setShowTutorial(true)} aria-label="Open game guide">? <span>Game guide</span></button>
        <PwaInstallButton />
      </div>

      <section className="next-junction-panel glass-panel" aria-label="Choose the explorer's path">
        <div className="junction-panel-heading">
          <div>
            <span className="junction-kicker">THE NEXT JUNCTION <i>·</i> {currentOptions.length} paths ahead</span>
            <h1>Predict the explorer&apos;s next move</h1>
            <p>Tap to place 1 coin <span>·</span> press and hold to stack them faster</p>
          </div>
          <div className="stake-summary">
            <span>ON THE LINE</span>
            <strong title={`${totalBet.toLocaleString()} coins`}><span className="mini-coin">$</span>{formatCoinBalance(totalBet)}</strong>
            {totalBet > 0 && <button onClick={undoLastCoin} disabled={game.phase !== "choosing"} aria-label="Undo the last coin placed"><Icon name="undo" size={13} /><span>Undo last coin</span></button>}
          </div>
        </div>
        <div className={`route-options options-${currentOptions.length}`}>
          {optionNames.map(({ direction, label }) => (
            <button
              key={direction}
              className={`route-option ${game.bets[direction] > 0 ? "route-option-active" : ""} ${isDangerous(direction) ? "route-option-danger" : ""}`}
              onPointerDown={(event) => { if (event.button === 0) startPathHold(direction); }}
              onPointerLeave={() => {
                if (heldPathRef.current?.direction === direction) stopPathHold();
              }}
              onClick={(event) => { if (event.detail === 0) addBet(direction); }}
              disabled={game.phase !== "choosing" || game.money <= 0 || (selectedCount >= 2 && game.bets[direction] === 0)}
              aria-pressed={game.bets[direction] > 0}
              aria-label={`${directionNames[direction]} path${isDangerous(direction) ? ", risky" : ""}; ${game.bets[direction]} ${game.bets[direction] === 1 ? "coin" : "coins"} placed. Tap to place 1 coin; press and hold to place faster.`}
            >
              <span className="option-key">{label}</span>
              <span className="option-name">{directionNames[direction]}</span>
              {isDangerous(direction) && <span className="option-danger">risky path</span>}
              {game.bets[direction] > 0 && <span className="option-wager" title={`${game.bets[direction].toLocaleString()} coins`}>+{formatCoinBalance(game.bets[direction])} <Icon name="coin" size={14} /></span>}
              {game.bets[direction] > 0 && <span className="option-check">✓</span>}
              {game.bets[direction] > 0 && <span className="option-progress" style={{ width: `${Math.min(100, game.bets[direction] / Math.max(1, game.money) * 100)}%` }} />}
            </button>
          ))}
        </div>
        <div className="junction-actions">
          <span className="coin-instruction">
            {game.money === 0
              ? `Your pouch is empty · daily +100 arrives in ${dailyCountdown || "a little while"}`
              : game.phase === "result"
                ? "Review this turn's result before choosing again."
                : game.phase === "approaching"
                  ? `${characterName} is approaching the crossroads…`
                  : game.phase === "moving"
                    ? `${characterName} is taking the path…`
                  : game.phase !== "choosing"
                    ? "The explorer is on the move…"
                    : totalBet > 0
                      ? `${totalBet} virtual ${totalBet === 1 ? "coin" : "coins"} placed · no real money`
                      : "Your explorer is waiting for your hunch."}
          </span>
          <button className="predict-button" onClick={resolveRound} disabled={game.phase !== "choosing" || !selectedCount || totalBet === 0 || totalBet > game.money || game.money <= 0}>
            <span>{game.money === 0 ? `Wait for daily coins · ${dailyCountdown || "…"}` : game.phase === "choosing" ? "Watch the turn" : game.phase === "approaching" ? "The moment of fate…" : game.phase === "moving" ? "The explorer is on the move…" : game.phase === "result" ? "Read your turn report" : "Explorer on the move…"}</span>
            {game.phase === "choosing" && game.money > 0 && <Icon name="arrow" size={19} />}
            {game.phase !== "choosing" && <span className="button-ellipsis">···</span>}
          </button>
        </div>
        <div className="daily-footnote">Daily allowance: 100 free coins <span>·</span> a cozy game of chance, never real gambling</div>
      </section>

      <AnimatePresence>
        {showPicker && <SelectionModal onSelect={chooseCharacter} onUpload={uploadCharacter} onClose={() => { setShowPicker(false); if (game.phase === "choosing") game.set({ phase: "walking" }); }} hasCharacter={hasPickedCharacter} />}
        {showTutorial && <TutorialModal onClose={closeTutorial} />}
        {turnResult && game.phase === "result" && (
          <motion.div className="turn-report-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section className="turn-report glass-panel" role="dialog" aria-modal="true" aria-labelledby="turn-report-title" initial={{ y: 18, scale: .97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, scale: .98 }}>
              <span className="turn-report-kicker">ROOM {String(turnResult.room).padStart(2, "0")} · TURN REPORT</span>
              <div className={`turn-outcome-mark ${turnResult.hit ? "turn-outcome-win" : ""}`}>{turnResult.hit ? "✦" : "↗"}</div>
              <h2 id="turn-report-title">{turnResult.hit ? "A sharp prediction!" : "The path had other plans."}</h2>
              <p className="turn-report-summary">
                {characterName} took the <strong>{resultPath}</strong> path.
                {turnResult.hit
                  ? ` You backed it with ${turnResult.placedBets[turnResult.actualDirection] ?? 0} coin${turnResult.placedBets[turnResult.actualDirection] === 1 ? "" : "s"}.`
                  : predictedPaths.length
                      ? ` You backed ${predictedPaths.map(([direction]) => directionNames[direction]).join(" and ")}.`
                    : " No coins were placed on that path."}
              </p>
              <div className="turn-report-lines">
                <div><span>Your coins placed</span><strong>−{turnResult.totalStake}</strong></div>
                <div><span>{turnResult.hit ? `Correct path · ${turnResult.risky ? "risky 3×" : "2×"} payout` : "Path prediction"}</span><strong>{turnResult.pathReward ? `+${turnResult.pathReward}` : "—"}</strong></div>
                {turnResult.chestReward > 0 && <div><span>{turnResult.chestName ?? "Treasure chest"}</span><strong>+{turnResult.chestReward}</strong></div>}
                {turnResult.fortuneBonus > 0 && <div><span>{turnResult.risky && turnResult.hit ? "Risky path bonus" : "Fortune bonus"}</span><strong>+{turnResult.fortuneBonus}</strong></div>}
                {turnResult.itemName && <div><span>{turnResult.itemName}</span><strong>+{turnResult.itemLuckGain}% luck</strong></div>}
                {turnResult.trapPenalty > 0 && <div className="turn-line-danger"><span>{turnResult.trapName ?? "Trap"}{turnResult.trapCaught ? " · caught!" : ""}</span><strong>−{turnResult.trapPenalty}</strong></div>}
                <div><span>Luck</span><strong>{turnResult.luckBefore}% <span>→</span> {turnResult.luckAfter}%</strong></div>
                <div className="turn-line-total"><span>Coin balance</span><strong>{turnResult.balanceBefore} <span>→</span> {turnResult.balanceAfter}</strong></div>
              </div>
              <div className={`turn-net ${netCoins < 0 ? "turn-net-loss" : ""}`}>
                {netCoins >= 0 ? "+" : "−"}{Math.abs(netCoins)} <span>coins this turn</span>
              </div>
              <button className="turn-continue" onClick={advanceAfterReport}>
                Continue to room {String(game.run + 1).padStart(2, "0")} <Icon name="arrow" size={18} />
              </button>
              <p className="turn-report-note">The maze keeps going. Your forever adventure is saved automatically.</p>
            </motion.section>
          </motion.div>
        )}
        {resultOpen && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setResultOpen(false)}>
            <motion.section className="result-modal" initial={{ y: 18 }} animate={{ y: 0 }} exit={{ y: 12 }} onClick={(event) => event.stopPropagation()}>
              <button className="modal-close" onClick={() => setResultOpen(false)} aria-label="Close result card">×</button>
              <span className="eyebrow">A LITTLE SOMETHING TO REMEMBER</span>
              <h2>Your adventure so far</h2>
              <div className="result-card">
                <div className="result-brand"><span>✳</span> AMAZING GAMBLER</div>
                <p>Predict the Path. Trust the Luck. Win the Fortune.</p>
                <div className="result-grid">
                  <div><span>MONEY EARNED</span><strong>${game.progress.totalEarned.toLocaleString()}</strong></div>
                  <div><span>LONGEST RUN</span><strong>{game.progress.longestRun} <small>rooms</small></strong></div>
                  <div><span>HIGHEST LUCK</span><strong>{game.progress.highestLuck}%</strong></div>
                  <div><span>CHESTS FOUND</span><strong>{game.progress.chestsCollected}</strong></div>
                </div>
                <div className="result-footer">A little luck goes a long way. <span>✳</span></div>
              </div>
              <div className="result-actions"><button onClick={() => void copyResult()}>Copy result</button><button onClick={downloadResult}>Download card</button><button className="share-button" onClick={() => void shareResult()}>Share your luck <Icon name="arrow" size={17} /></button></div>
            </motion.section>
          </motion.div>
        )}
        {shopOpen && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShopOpen(false)}>
            <motion.section className="shop-modal" initial={{ y: 18 }} animate={{ y: 0 }} exit={{ y: 12 }} onClick={(event) => event.stopPropagation()}>
              <button className="modal-close" onClick={() => setShopOpen(false)} aria-label="Close curio cabinet">×</button>
              <span className="eyebrow">FOUND ALONG THE WAY</span>
              <h2>A few little extras</h2>
              <p className="shop-intro">Spend virtual coins on cosmetic keepsakes. Tap Buy to collect an item, then tap Equip to change the maze&apos;s look. Decorations never change luck, rewards, or path outcomes.</p>
              <div className="shop-balance"><Icon name="coin" size={17} /> ${game.money.toLocaleString()} <span>in your pocket</span></div>
              <div className="shop-items">
                {cosmeticDefinitions.map((cosmetic) => {
                  const isOwned = ownedCosmetics.includes(cosmetic.id);
                  const active = equipped[cosmetic.category] === cosmetic.id;
                  return (
                    <article className="shop-item" key={cosmetic.id}>
                      <span className="shop-item-icon">{cosmetic.icon}</span>
                      <div className="shop-item-copy"><strong>{cosmetic.label}</strong><span>{cosmetic.description}</span></div>
                      <button className={active ? "shop-item-active" : ""} onClick={() => collectCosmetic(cosmetic.id)} disabled={!isOwned && game.money < cosmetic.price}>
                        {active ? "Wearing" : isOwned ? "Equip" : `$${cosmetic.price}`}
                      </button>
                    </article>
                  );
                })}
              </div>
              <div className="shop-footnote">Golden halo decorates your explorer · Moonlit maze changes the scenery · Starlight trail changes the path effect · Lucky compass changes the title mark · Pathfinder badge adds a keepsake. Visuals only, no gameplay advantage.</div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{toast && <motion.div className="toast-message" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>{toast}</motion.div>}</AnimatePresence>
    </main>
  );
}
