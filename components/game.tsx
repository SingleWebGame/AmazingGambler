"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import ThreeMazeScene, { environmentForRoom } from "./three-maze-scene";
import ProfileButton from "./ProfileButton";
import ProfileModal from "./ProfileModal";
import ProfileSetupModal from "./ProfileSetupModal";
import { submitScore } from "@/lib/leaderboard";
import { getPlayerName } from "@/lib/playerProfile";
import { loadSoundEnabled, playGameSound, setSoundEnabled as saveSoundEnabled, type GameSound } from "@/lib/audio";
import {
  cosmeticDefinitions,
  choosePredictedPath,
  createJunction,
  directionLabels,
  directionNames,
  directionVectors,
  emptyProgress,
  itemDefinitions,
  luckInfluence,
  loadProgress,
  rollPathChest,
  rollEvent,
  saveProgress,
  statDefinitions,
  trapDefinitions,
  type Direction,
  type CosmeticCategory,
  type EventKind,
  type ChestDrop,
  type Junction,
  type Progress,
} from "@/lib/game";
import {
  characterById,
  characterPortrait,
  characters,
  starterCharacters,
  type CharacterDefinition,
  type CharacterRarity,
} from "@/lib/characters";

type Phase = "walking" | "choosing" | "approaching" | "moving" | "chest" | "result" | "idle";
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
  chestDrop?: ChestDrop;
  itemName?: string;
  itemLuckGain: number;
  trapName?: string;
  trapPenalty: number;
  trapLuckLoss: number;
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
const DAILY_RESET_GRANT_KEY = "amazing-gambler-daily-reset-grant-v1";
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
const OWNED_CHARACTERS_KEY = "amazing-gambler-owned-characters";
const legacyStarterIds: Record<string, string> = { Pip: "pip", Moss: "moss", Ruby: "ruby", Orbit: "orbit" };
const validCharacterRarities: CharacterRarity[] = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Ultra-rare"];
const readOwnedCharacterIds = (): string[] => {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(OWNED_CHARACTERS_KEY) ?? "[\"pip\"]");
    if (!Array.isArray(stored)) throw new Error("Saved character collection is not a list.");
    const ids = stored.filter((id): id is string => typeof id === "string" && characterById.has(id));
    return [...new Set(["pip", ...ids])];
  } catch (error) {
    console.error("Unable to load your character collection.", error);
    return ["pip"];
  }
};
const isChestDrop = (value: unknown): value is ChestDrop => {
  if (!isRecord(value) || typeof value.color !== "string" || typeof value.label !== "string") return false;
  if (value.kind === "coins") {
    return typeof value.reward === "number" && Number.isFinite(value.reward) &&
      ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"].includes(String(value.rarity));
  }
  return value.kind === "character" && value.reward === 0 &&
    typeof value.characterId === "string" && characterById.has(value.characterId) &&
    validCharacterRarities.includes(value.rarity as CharacterRarity);
};

function createJunctionWithChests(
  id: number,
  cameFrom?: Direction,
  ownedIds: string[] = ["pip"],
  luck = 10,
): Junction {
  const junction = createJunction(id, cameFrom, luck);
  const chests: Partial<Record<Direction, ChestDrop>> = {};
  if (id < 3) {
    const character = starterCharacters.slice(1).find((entry) => !ownedIds.includes(entry.id));
    for (const direction of junction.options) {
      chests[direction] = character
        ? {
            kind: "character",
            rarity: character.rarity,
            reward: 0,
            color: character.rarity === "Common" ? "#c9afe6" : character.rarity === "Rare" ? "#ae84df" : "#a475df",
            label: `${character.rarity} character chest`,
            characterId: character.id,
          }
        : { kind: "coins", rarity: "Rare", reward: 100, color: "#f4c464", label: "Welcome coin chest" };
    }
  } else if (id === 3) {
    for (const direction of junction.options) {
      chests[direction] = { kind: "coins", rarity: "Rare", reward: 100, color: "#f4c464", label: "Welcome coin chest" };
    }
  } else {
    for (const direction of junction.options) {
      const drop = rollPathChest(ownedIds, characters, luck);
      if (drop) chests[direction] = drop;
    }
  }
  return { ...junction, hazards: id < 4 ? [] : junction.hazards, chests };
}

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
    const savedChests = isRecord(value.junction) && isRecord(value.junction.chests)
      ? Object.fromEntries(
          Object.entries(value.junction.chests).filter(
            (entry): entry is [Direction, ChestDrop] => isDirection(entry[0]) && isChestDrop(entry[1]),
          ),
        ) as Partial<Record<Direction, ChestDrop>>
      : null;
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
      const chestDrop = isChestDrop(reportValue.chestDrop) ? reportValue.chestDrop : undefined;
      const savedTrapName = typeof reportValue.trapName === "string" ? reportValue.trapName : undefined;
      const savedTrap = trapDefinitions.find((trap) => trap.label === savedTrapName);
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
        chestName: chestDrop?.kind === "character"
          ? characterById.get(chestDrop.characterId)?.name
          : typeof reportValue.chestName === "string" ? reportValue.chestName : undefined,
        chestDrop,
        itemName: typeof reportValue.itemName === "string" ? reportValue.itemName : undefined,
        itemLuckGain: Number(reportValue.itemLuckGain),
        trapName: savedTrapName,
        trapPenalty: Number(reportValue.trapPenalty),
        trapLuckLoss: Number.isFinite(reportValue.trapLuckLoss)
          ? Number(reportValue.trapLuckLoss)
          : savedTrap?.luckPenalty ?? 0,
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
        : value.phase === "chest" && lastReport?.chestDrop
          ? "chest"
        : value.phase === "walking" || value.phase === "approaching" || value.phase === "moving"
          ? value.phase
          : "choosing",
      junction: {
        id: junctionId,
        options,
        hazards,
        chests: savedChests ?? createJunctionWithChests(
          junctionId,
          isDirection(value.previous) ? value.previous : undefined,
          readOwnedCharacterIds(),
          stats.luck ?? 10,
        ).chests,
      },
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
  junction: {
    id: 0,
    options: ["north", "east", "south", "west"],
    hazards: [],
    chests: Object.fromEntries(["north", "east", "south", "west"].map((direction) => [
      direction,
      {
        kind: "character",
        rarity: "Common",
        reward: 0,
        color: "#c9afe6",
        label: "Common character chest",
        characterId: "moss",
      },
    ])) as Partial<Record<Direction, ChestDrop>>,
  },
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

const reverseDirection: Record<Direction, Direction> = {
  north: "south",
  east: "west",
  south: "north",
  west: "east",
};
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    coin: <><circle cx="12" cy="12" r="9" /><path d="M15 8.5c-.7-.8-1.7-1.2-3-1.2-1.7 0-2.8.8-2.8 2 0 3 6 1.5 6 4.4 0 1.3-1.2 2.2-3 2.2-1.4 0-2.6-.5-3.4-1.4M12 5.5v13" /></>,
    undo: <><path d="M3 7v6h6" /><path d="M5.2 12a7.5 7.5 0 1 1 1.9 5.1" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    treasure: <><path d="M4 10h16v10H4zM3 6h18v4H3z" /><path d="M12 6v14m-3-14c-3 0-3-4 0-4 2 0 3 4 3 4m3 0c3 0 3-4 0-4-2 0-3 4-3 4" /></>,
    sound: <><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15 9a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12" /></>,
    muted: <><path d="M11 5 6 9H3v6h3l5 4z" /><path d="m16 9 5 6m0-6-5 6" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function isGameSound(sound: string | null): sound is GameSound {
  return sound !== null && [
    "ui", "coin", "undo", "predict", "reward", "purchase", "continue", "chest", "success", "miss", "toggle",
  ].includes(sound);
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
                    <text y="6" textAnchor="middle" className="route-letter">{directionLabels[direction]}</text>
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
  characterId,
  onPathHoldStart,
  onChestReached,
  theme,
  trail,
  frame,
  worldClockStartedAt,
  worldPhase,
}: {
  game: GameState;
  avatar: string;
  characterId: string;
  onPathHoldStart: (direction: Direction) => void;
  onChestReached: () => void;
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
      characterId={characterId}
      onPathHoldStart={onPathHoldStart}
      onChestReached={onChestReached}
      theme={theme}
      trail={trail}
      frame={frame}
      worldClockStartedAt={worldClockStartedAt}
      worldPhase={worldPhase}
    />
  );
}

function PlayerProfileModal({
  avatar,
  characterName,
  selectedCharacterId,
  progress,
  onSelect,
  onShare,
  onCopy,
  onDownload,
  onClose,
  canClose,
  ownedCharacterIds,
}: {
  avatar: string;
  characterName: string;
  selectedCharacterId: string;
  progress: Progress;
  onSelect: (character: CharacterDefinition) => void;
  onShare: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onClose: () => void;
  canClose: boolean;
  ownedCharacterIds: string[];
}) {
  const unlocked = characters.filter((character) => ownedCharacterIds.includes(character.id));
  return (
    <motion.div className="modal-backdrop profile-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="character-modal player-profile-modal" initial={{ y: 16, scale: .97 }} animate={{ y: 0, scale: 1 }} aria-labelledby="profile-title" role="dialog" aria-modal="true">
        <div className="player-profile-header">
          {canClose && <button className="modal-close" onClick={onClose} aria-label="Close player profile">×</button>}
          <span className="eyebrow">YOUR FOREVER MAZE ADVENTURE</span>
          <h2 id="profile-title">Your explorer profile</h2>
          <div className="profile-identity">
            <img src={avatar} alt="" />
            <div><span>EXPLORING AS</span><strong>{characterName}</strong></div>
          </div>
          <div className="result-grid profile-stats">
            <div><span>MONEY EARNED</span><strong>${formatCoinBalance(progress.totalEarned)}</strong></div>
            <div><span>LONGEST RUN</span><strong>{progress.longestRun} <small>rooms</small></strong></div>
            <div><span>HIGHEST LUCK</span><strong>{progress.highestLuck}%</strong></div>
            <div><span>CHESTS FOUND</span><strong>{progress.chestsCollected}</strong></div>
          </div>
          <div className="result-actions profile-actions">
            <button onClick={onCopy}>Copy profile</button>
            <button onClick={onDownload}>Download card</button>
            <button className="share-button" onClick={onShare}>Share your journey <Icon name="arrow" size={17} /></button>
          </div>
          <span className="eyebrow profile-collection-label">{canClose ? "CHOOSE YOUR EXPLORER" : "CHOOSE YOUR FIRST EXPLORER"}</span>
        </div>
        <div className="profile-explorer-scroll">
          <div className="character-options">
            {unlocked.map((character) => (
              <button key={character.id} className={`character-choice ${selectedCharacterId === character.id ? "profile-explorer-selected" : ""}`} onClick={() => onSelect(character)} aria-pressed={selectedCharacterId === character.id}>
                <img src={characterPortrait(character)} alt="" />
                <span>{character.name}</span>
                {canClose && <small>{selectedCharacterId === character.id ? "exploring" : character.rarity}</small>}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footnote profile-footnote">Your profile shares your explorer and maze milestones. No account or real-money play.</div>
      </motion.section>
    </motion.div>
  );
}

function CharacterCollectionModal({
  ownedIds,
  selectedId,
  money,
  onBuy,
  onEquip,
  onClose,
}: {
  ownedIds: string[];
  selectedId: string;
  money: number;
  onBuy: (character: CharacterDefinition) => void;
  onEquip: (character: CharacterDefinition) => void;
  onClose: () => void;
}) {
  return (
    <motion.div className="modal-backdrop character-collection-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="character-collection-modal" initial={{ y: 18, scale: .98 }} animate={{ y: 0, scale: 1 }} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="collection-title">
        <header className="character-collection-header">
          <button className="modal-close" onClick={onClose} aria-label="Close character collection">×</button>
          <span className="eyebrow">100 EXPLORERS TO DISCOVER</span>
          <h2 id="collection-title">The wanderer&apos;s gallery</h2>
          <p>Find rare lilac character chests along the paths, or save your virtual coins to invite a new friend. Their look changes the 3D explorer, never the odds.</p>
          <div className="character-collection-summary"><span>{ownedIds.length} / 100 collected</span><strong>${money.toLocaleString()} coins</strong></div>
        </header>
        <div className="character-collection-scroll" aria-label="Explorer collection" tabIndex={0}>
          <div className="character-collection-grid">
            {characters.map((character) => {
              const owned = ownedIds.includes(character.id);
              const selected = selectedId === character.id;
              return (
                <article className={`gallery-card rarity-${character.rarity.toLowerCase().replace("-", "")}`} key={character.id}>
                  <img src={characterPortrait(character)} alt="" />
                  <strong>{character.name}</strong>
                  <span>{character.rarity}</span>
                  <button
                    data-sound={owned ? "reward" : "purchase"}
                    className={selected ? "gallery-selected" : ""}
                    disabled={selected || (!owned && money < character.price)}
                    onClick={() => owned ? onEquip(character) : onBuy(character)}
                  >
                    {selected ? "Exploring" : owned ? "Equip" : `$${character.price.toLocaleString()}`}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
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
          <li><span>1</span><div><strong>Read the crossroads</strong><p>Predict up to two open paths. After the opening four rooms, a spiked trap on a path marks a risky route: it can cost coins and Luck, but pays 3× when your prediction is right. Your first four predictions are guaranteed wins while you meet the explorer crew.</p></div></li>
          <li><span>2</span><div><strong>Place your virtual coins</strong><p>Each tap adds 1 coin to a path; press and hold to add faster. Tap Undo last coin to take back one, or press and hold to remove coins faster. Your wager is split across the paths you chose.</p></div></li>
          <li><span>3</span><div><strong>Watch destiny unfold</strong><p>After you press Watch the turn, the explorer approaches, the camera zooms, then the random path is revealed. Correct predictions pay 2×, or 3× on a risky path. Read the turn report before continuing.</p></div></li>
          <li><span>4</span><div><strong>Find a chest on the path</strong><p>Each route can hide one chest, placed before your prediction. Coin chests hold 10–1,000 coins; rare violet character chests unlock collectible explorers. The first three chests introduce Moussa Kane, Aissatou Cisse, and Cheikh Thiam. Chest contents are revealed as soon as the explorer reaches them.</p></div></li>
          <li><span>5</span><div><strong>Your forever adventure</strong><p>Progress saves on this device and the maze keeps going. A daily pouch adds 100 free coins each new day; if you run out, wait for it to arrive.</p></div></li>
          <li><span>6</span><div><strong>Collect 100 explorers</strong><p>Start as Seynabou Gaye, earn explorers from rare character chests, or browse the gallery and buy a new companion for 15,000–200,000 virtual coins. Every explorer has a unique Senegalese name, portrait, and their own low-poly 3D look.</p></div></li>
          <li><span>7</span><div><strong>Find luck and trouble</strong><p>Luck rises with good predictions and lucky items. Its influence scales from 0% at 0 Luck to 70% at 100 Luck: it slightly favors paths you backed, makes chests more likely, and makes traps less likely. Traps can still cost coins and Luck.</p></div></li>
          <li><span>8</span><div><strong>Day turns to night</strong><p>In-game day and night each last 5 minutes, with a gentle 30-second transition between them. It only changes the scenery—not luck, paths, or rewards.</p></div></li>
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
  const [avatar, setAvatar] = useState(characterPortrait(starterCharacters[0]));
  const [characterName, setCharacterName] = useState("Seynabou Gaye");
  const [selectedCharacterId, setSelectedCharacterId] = useState("pip");
  const [ownedCharacterIds, setOwnedCharacterIds] = useState<string[]>(["pip"]);
  const [hasPickedCharacter, setHasPickedCharacter] = useState(false);
  const [showProfile, setShowProfile] = useState(true);
  const [characterCollectionOpen, setCharacterCollectionOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialSeen, setTutorialSeen] = useState(false);
  const [turnResult, setTurnResult] = useState<TurnReport | null>(null);
  const [coinCountAnimation, setCoinCountAnimation] = useState<{ from: number; to: number } | null>(null);
  const [coinCountValue, setCoinCountValue] = useState<number | null>(null);
  const [betLossCue, setBetLossCue] = useState<{ id: number; amount: number } | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [ownedCosmetics, setOwnedCosmetics] = useState<string[]>([]);
  const [equipped, setEquipped] = useState<Partial<Record<CosmeticCategory, string>>>({});
  const [toast, setToast] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [dailyCountdown, setDailyCountdown] = useState("");
  const [worldClockStartedAt, setWorldClockStartedAt] = useState(0);
  const [worldPhase, setWorldPhase] = useState("DAY");
  const [playerName, setPlayerNameState] = useState<string | null>(null);
  const [playerNameLoaded, setPlayerNameLoaded] = useState(false);
  const [setupSkipped, setSetupSkipped] = useState(false);
  const [playerProfileOpen, setPlayerProfileOpen] = useState(false);
  const worldClockStartedAtRef = useRef<number | null>(null);
  const heldPathRef = useRef<{ direction: Direction; startedAt: number; timer: number } | null>(null);
  const heldUndoRef = useRef<{ startedAt: number; timer: number } | null>(null);
  const lastPlacedDirectionRef = useRef<Direction | null>(null);
  const chestRevealPausedRef = useRef(false);
  const addBetRef = useRef<(direction: Direction, amount?: number) => void>(() => {});
  const previousBetTotalRef = useRef<number | null>(null);
  const betLossCueIdRef = useRef(0);

  useEffect(() => {
    if (!coinCountAnimation) return;
    const startedAt = performance.now();
    const duration = 1100;
    let frame = 0;
    let previousValue = coinCountAnimation.from;
    setCoinCountValue(previousValue);
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const nextValue = Math.round(
        coinCountAnimation.from + (coinCountAnimation.to - coinCountAnimation.from) * eased,
      );
      if (nextValue !== previousValue) {
        previousValue = nextValue;
        setCoinCountValue(nextValue);
      }
      if (progress < 1) {
        frame = window.requestAnimationFrame(animate);
      } else {
        setCoinCountAnimation(null);
        setCoinCountValue(null);
      }
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [coinCountAnimation]);

  useEffect(() => {
    setSoundEnabled(loadSoundEnabled());
    const main = document.querySelector("main.immersive-game");
    if (!main) return;
    const handleInteractiveClick = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest("button, a, label, [role='button'], .modal-backdrop");
      if (!target || !main.contains(target) || target.matches(":disabled, [aria-disabled='true'], [data-sound-toggle]")) return;
      if (target.classList.contains("route-option") || target.classList.contains("undo-hold-button")) return;
      const requestedSound = target.getAttribute("data-sound");
      playGameSound(isGameSound(requestedSound) ? requestedSound : "ui");
    };
    main.addEventListener("click", handleInteractiveClick, true);
    return () => main.removeEventListener("click", handleInteractiveClick, true);
  }, []);

  const toggleSound = () => {
    const nextEnabled = !soundEnabled;
    if (soundEnabled) playGameSound("toggle");
    saveSoundEnabled(nextEnabled);
    setSoundEnabled(nextEnabled);
    if (nextEnabled) playGameSound("toggle");
  };
  const luck = game.stats.luck ?? 10;
  const selectedCount = Object.values(game.bets).filter((amount) => amount > 0).length;
  const totalBet = Object.values(game.bets).reduce((sum, amount) => sum + amount, 0);
  const suspenseReport = (game.phase === "approaching" || game.phase === "moving" || game.phase === "chest") ? game.lastReport : null;
  const reservedBalance = Math.max(0, (suspenseReport?.balanceBefore ?? turnResult?.balanceBefore ?? game.money) -
    (suspenseReport?.totalStake ?? (game.phase === "choosing" ? totalBet : turnResult?.totalStake ?? 0)));
  const displayMoney = coinCountAnimation
    ? coinCountValue ?? coinCountAnimation.from
    : suspenseReport || (turnResult && game.phase === "result") || game.phase === "choosing"
      ? reservedBalance
      : game.money;
  const displayLuck = suspenseReport?.luckBefore ?? luck;
  const displayRoom = suspenseReport?.room ?? game.run + 1;
  const displayChests = game.chestCount - (suspenseReport?.chestName ? 1 : 0);
  const revealedCharacter = turnResult?.chestDrop?.kind === "character"
    ? characterById.get(turnResult.chestDrop.characterId)
    : undefined;
  const equippedIcon = cosmeticDefinitions.find((cosmetic) => cosmetic.id === equipped.icon)?.icon;
  const equippedBadge = cosmeticDefinitions.find((cosmetic) => cosmetic.id === equipped.badge);
  const currentOptions = game.junction.options;
  const isRunPlaying = game.phase === "walking" || game.phase === "approaching" || game.phase === "moving" || game.phase === "chest";
  const optionNames = currentOptions.map((direction) => {
    return { direction, label: directionLabels[direction] };
  });
  const avatarName = characterName;

  useEffect(() => {
    if (!sessionReady) return;
    const previousTotal = previousBetTotalRef.current;
    previousBetTotalRef.current = totalBet;
    if (previousTotal === null || totalBet <= previousTotal || game.phase !== "choosing") return;
    setBetLossCue({ id: ++betLossCueIdRef.current, amount: totalBet - previousTotal });
  }, [totalBet, sessionReady, game.phase]);

  useEffect(() => {
    const restoredOwnedIds = readOwnedCharacterIds();
    setOwnedCharacterIds(restoredOwnedIds);
    const restored = loadForeverSession();
    const today = dayIndex();
    let resetGrant = 0;
    try {
      if (window.localStorage.getItem(DAILY_RESET_GRANT_KEY) !== "claimed") {
        window.localStorage.setItem(DAILY_RESET_GRANT_KEY, "claimed");
        resetGrant = DAILY_ALLOWANCE;
      }
    } catch (error) {
      console.error("Unable to claim the one-time daily coin reset.", error);
      setToast("Your daily coin bonus could not be saved on this device.");
    }
    if (restored) {
      const elapsedDays = Math.max(0, today - (restored.dailyClaimDay ?? today));
      game.set({
        ...restored,
        money: (restored.money ?? DAILY_ALLOWANCE) + elapsedDays * DAILY_ALLOWANCE + resetGrant,
        dailyClaimDay: today,
        progress: loadProgress(),
      });
    } else {
      game.set({ money: game.money + resetGrant, dailyClaimDay: today, progress: loadProgress() });
    }
    if (resetGrant > 0) {
      setToast(`Daily reset bonus: +${resetGrant} coins added to your pouch.`);
      window.setTimeout(() => setToast(""), 3600);
    }
    setTurnResult(restored?.lastReport ?? null);
    try {
      const characterRaw = window.localStorage.getItem("amazing-gambler-forever-character");
      if (characterRaw) {
        const characterValue: unknown = JSON.parse(characterRaw);
        if (isRecord(characterValue) && typeof characterValue.name === "string" &&
          typeof characterValue.avatar === "string" && characterValue.avatar.length < 7_000_000) {
          const legacyNameId = legacyStarterIds[characterValue.name];
          const legacyCharacter = starterCharacters.find((character) => character.name === characterValue.name)
            ?? starterCharacters.find((character) => character.id === legacyNameId);
          const selectedId = typeof characterValue.id === "string" && characterById.has(characterValue.id)
            ? characterValue.id
            : legacyCharacter?.id ?? "pip";
          const restoredCharacter = characterById.get(selectedId);
          const nextOwned = !restoredOwnedIds.includes(selectedId)
            ? [...restoredOwnedIds, selectedId]
            : restoredOwnedIds;
          setOwnedCharacterIds(nextOwned);
          setSelectedCharacterId(selectedId);
          setCharacterName(restoredCharacter?.name ?? starterCharacters[0].name);
          setAvatar(restoredCharacter ? characterPortrait(restoredCharacter) : characterPortrait(starterCharacters[0]));
          setHasPickedCharacter(true);
          setShowProfile(false);
          if (!restoredCharacter) {
            window.localStorage.setItem("amazing-gambler-forever-character", JSON.stringify({
              id: starterCharacters[0].id,
              name: starterCharacters[0].name,
              avatar: characterPortrait(starterCharacters[0]),
            }));
          }
          if (nextOwned.length !== restoredOwnedIds.length) {
            window.localStorage.setItem(OWNED_CHARACTERS_KEY, JSON.stringify(nextOwned));
          }
        }
      }
    } catch (error) {
      console.error("Unable to restore your explorer.", error);
    }
    setPlayerNameState(getPlayerName());
    setPlayerNameLoaded(true);
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
    if (game.phase === "chest") chestRevealPausedRef.current = true;
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
        const junction = createJunctionWithChests(game.run, game.previous, ownedCharacterIds, game.stats.luck ?? 10);
        playGameSound(game.lastReport?.hit ? "success" : "miss");
        game.set({
          phase: "result",
          junction,
          bets: { north: 0, east: 0, south: 0, west: 0 },
          event: game.lastReport?.trapName ? "trap" : game.lastReport?.chestName ? "chest" : game.lastReport?.itemName ? "item" : null,
        });
      }, 2300);
      return () => window.clearTimeout(timer);
    }
  }, [game.phase, game.run, game.previous, game.lastReport, game, ownedCharacterIds]);

  useEffect(() => {
    const stopHolding = () => {
      if (heldPathRef.current) window.clearTimeout(heldPathRef.current.timer);
      if (heldUndoRef.current) window.clearTimeout(heldUndoRef.current.timer);
      heldPathRef.current = null;
      heldUndoRef.current = null;
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

  const chooseCharacter = (character: CharacterDefinition) => {
    if (!ownedCharacterIds.includes(character.id)) return;
    setAvatar(characterPortrait(character));
    setCharacterName(character.name);
    setSelectedCharacterId(character.id);
    setHasPickedCharacter(true);
    setShowProfile(false);
    try {
      window.localStorage.setItem("amazing-gambler-forever-character", JSON.stringify({
        id: character.id,
        name: character.name,
        avatar: characterPortrait(character),
      }));
    } catch (error) {
      console.error("Unable to save your explorer.", error);
      setToast("Your explorer could not be saved on this device.");
    }
    if (!tutorialSeen) setShowTutorial(true);
    if (!["result", "approaching", "moving", "chest"].includes(game.phase)) game.set({ phase: "walking" });
  };

  const buyCharacter = (character: CharacterDefinition) => {
    if (ownedCharacterIds.includes(character.id)) return;
    const spendable = Math.max(0, game.money - totalBet);
    if (spendable < character.price || game.phase !== "choosing") {
      setToast(game.phase !== "choosing"
        ? "Wait for the turn to finish before inviting an explorer."
        : `Save ${formatCoinBalance(character.price - spendable)} more unplaced coins to invite ${character.name}.`);
      window.setTimeout(() => setToast(""), 3000);
      return;
    }
    const nextOwned = [...ownedCharacterIds, character.id];
    try {
      window.localStorage.setItem(OWNED_CHARACTERS_KEY, JSON.stringify(nextOwned));
      setOwnedCharacterIds(nextOwned);
      game.set({ money: game.money - character.price });
      setToast(`${character.name} joined your explorer collection.`);
    } catch (error) {
      console.error("Unable to save your character collection.", error);
      setToast("The explorer could not be saved on this device.");
    }
  };

  const continueAfterChest = () => {
    chestRevealPausedRef.current = true;
    game.set({ phase: "moving", message: "The explorer continues down the path." });
  };

  const handleChestReached = () => {
    if (game.phase !== "moving" || chestRevealPausedRef.current) return;
    chestRevealPausedRef.current = true;
    playGameSound("chest");
    game.set({ phase: "chest", message: "A chest! See what the explorer found." });
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

  const addBet = (direction: Direction, amount = 1) => {
    const currentGame = useGame.getState();
    if (currentGame.phase !== "choosing") return;
    const currentBets = currentGame.bets;
    const currentTotal = Object.values(currentBets).reduce((sum, value) => sum + value, 0);
    const currentSelectedCount = Object.values(currentBets).filter((value) => value > 0).length;
    const current = currentBets[direction];
    if (current === 0 && currentSelectedCount >= 2) {
      if (!toast) {
        setToast("You can back up to two paths at each junction.");
        window.setTimeout(() => setToast(""), 2400);
      }
      return;
    }
    const available = Math.max(0, currentGame.money - currentTotal);
    if (!available) {
      if (!toast) {
        setToast(`No coins left. Your daily pouch arrives in ${dailyCountdown || "a little while"}.`);
        window.setTimeout(() => setToast(""), 3000);
      }
      return;
    }
    const next = Math.min(currentGame.money - (currentTotal - current), current + Math.min(amount, available));
    lastPlacedDirectionRef.current = direction;
    const nextBets = { ...currentBets, [direction]: next };
    playGameSound("coin");
    game.set({ bets: nextBets });
  };

  addBetRef.current = addBet;

  const startPathHold = (direction: Direction) => {
    if (game.phase !== "choosing") return;
    if (heldPathRef.current) window.clearTimeout(heldPathRef.current.timer);
    if (heldUndoRef.current) window.clearTimeout(heldUndoRef.current.timer);
    heldUndoRef.current = null;
    addBetRef.current(direction, 1);
    const hold = { direction, startedAt: Date.now(), timer: 0 };
    heldPathRef.current = hold;
    const repeat = () => {
      if (heldPathRef.current !== hold) return;
      const heldFor = Date.now() - hold.startedAt;
      const amount = 2 ** Math.floor(heldFor / 1000);
      addBetRef.current(direction, amount);
      const delay = Math.max(35, 280 * 0.75 ** Math.floor(heldFor / 700));
      hold.timer = window.setTimeout(repeat, delay);
    };
    hold.timer = window.setTimeout(repeat, 420);
  };

  const stopPathHold = () => {
    if (heldPathRef.current) window.clearTimeout(heldPathRef.current.timer);
    heldPathRef.current = null;
  };

  const undoLastCoin = (amount = 1) => {
    const current = useGame.getState();
    if (current.phase !== "choosing") return;
    const options = current.junction.options;
    const next = { ...current.bets };
    let remaining = Math.min(amount, options.reduce((sum, direction) => sum + next[direction], 0));
    if (remaining <= 0) return;
    while (remaining > 0) {
      const direction = lastPlacedDirectionRef.current && next[lastPlacedDirectionRef.current] > 0
        ? lastPlacedDirectionRef.current
        : options.find((option) => next[option] > 0);
      if (!direction) break;
      const removed = Math.min(remaining, next[direction]);
      next[direction] -= removed;
      remaining -= removed;
      if (next[direction] === 0) {
        lastPlacedDirectionRef.current = options.find((option) => next[option] > 0) ?? null;
      }
    }
    playGameSound("undo");
    game.set({ bets: next });
  };

  const startUndoHold = () => {
    if (game.phase !== "choosing") return;
    if (heldUndoRef.current) window.clearTimeout(heldUndoRef.current.timer);
    if (heldPathRef.current) window.clearTimeout(heldPathRef.current.timer);
    heldPathRef.current = null;
    undoLastCoin();
    const hold = { startedAt: Date.now(), timer: 0 };
    heldUndoRef.current = hold;
    const repeat = () => {
      if (heldUndoRef.current !== hold) return;
      const heldFor = Date.now() - hold.startedAt;
      const amount = 2 ** Math.floor(heldFor / 1000);
      undoLastCoin(amount);
      const delay = Math.max(35, 280 * 0.75 ** Math.floor(heldFor / 700));
      hold.timer = window.setTimeout(repeat, delay);
    };
    hold.timer = window.setTimeout(repeat, 420);
  };

  const stopUndoHold = () => {
    if (heldUndoRef.current) window.clearTimeout(heldUndoRef.current.timer);
    heldUndoRef.current = null;
  };

  const resolveRound = () => {
    if (!selectedCount || totalBet <= 0 || game.phase !== "choosing" || totalBet > game.money) {
      if (!game.money) setToast(`Your pouch is empty. Your daily +100 arrives in ${dailyCountdown || "a little while"}.`);
      else setToast("Tap a path to place at least one coin first.");
      window.setTimeout(() => setToast(""), 2800);
      return;
    }
    const options = game.junction.options;
    const guaranteedWin = game.run < 4;
    const backedOptions = options.filter((direction) => game.bets[direction] > 0);
    const actualDirection = guaranteedWin
      ? choosePredictedPath(backedOptions, game.bets, luck)
      : choosePredictedPath(options, game.bets, luck);
    const hit = guaranteedWin || game.bets[actualDirection] > 0;
    const dangerous = game.junction.hazards.includes(actualDirection);
    const predictedTrap = hit && dangerous;
    const event = game.run < 4 ? "quiet" : rollEvent(luck);
    const chestDrop = game.junction.chests[actualDirection] ?? null;
    const chest = chestDrop?.kind === "coins" ? chestDrop : null;
    const newCharacter = chestDrop?.kind === "character"
      ? characterById.get(chestDrop.characterId)
      : undefined;
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
    const luckBeforeTrap = nextLuck;
    if (trap) nextLuck = Math.max(0, nextLuck - trap.luckPenalty);
    const trapLuckLoss = luckBeforeTrap - nextLuck;
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
      chestName: chestDrop
        ? newCharacter?.name ?? (chest?.label ?? chestDrop.label)
        : undefined,
      chestDrop: chestDrop ?? undefined,
      itemName: item?.name,
      itemLuckGain,
      trapName: trap?.label,
      trapPenalty,
      trapLuckLoss,
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
      chestsCollected: game.progress.chestsCollected + (chestDrop ? 1 : 0),
      correctPredictions: game.progress.correctPredictions + (hit ? 1 : 0),
      failedPredictions: game.progress.failedPredictions + (hit ? 0 : 1),
      trapPredictions: game.progress.trapPredictions + (predictedTrap ? 1 : 0),
    };
    const vector = directionVectors[actualDirection];
    const node: TrailNode = {
      x: game.explorer.x + vector.x,
      y: game.explorer.y + vector.y,
      id: nextRun,
      event: trapEncounter ? "trap" : chestDrop ? "chest" : event,
      icon: trapEncounter ? trap?.icon : newCharacter?.name ?? chest?.rarity,
    };
    const stepStats = { ...game.stats, luck: nextLuck };
    setTurnResult(report);
    chestRevealPausedRef.current = false;
    if (newCharacter && !ownedCharacterIds.includes(newCharacter.id)) {
      const nextOwned = [...ownedCharacterIds, newCharacter.id];
      try {
        window.localStorage.setItem(OWNED_CHARACTERS_KEY, JSON.stringify(nextOwned));
        setOwnedCharacterIds(nextOwned);
      } catch (error) {
        console.error("Unable to save your chest character reward.", error);
        setOwnedCharacterIds(nextOwned);
        setToast("Your explorer reward could not be saved on this device.");
      }
    }
    game.set({
      money: nextMoney,
      run: nextRun,
      stats: stepStats,
      phase: "approaching",
      explorer: { x: node.x, y: node.y },
      trail: [...game.trail, node],
      progress: nextProgress,
      message: resultMessage,
      event: trapEncounter ? "trap" : chestDrop ? "chest" : event,
      overflow: !overflowActivated && (overflowArmed || overflowReached),
      chestCount: game.chestCount + (chestDrop ? 1 : 0),
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

  const shareText = `Amazing Gambler — ${characterName}'s adventure: $${game.progress.totalEarned.toLocaleString()} earned, ${game.progress.longestRun} rooms explored, ${game.progress.highestLuck}% highest luck, ${game.progress.chestsCollected} treasures found. Predict the path!`;
  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setToast("Your explorer profile is copied and ready to share.");
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
    context.font = "700 21px Arial";
    context.fillStyle = "#365c49";
    context.fillText(`EXPLORER · ${characterName.toUpperCase()}`, 72, 184);
    context.strokeStyle = "#c8bfa8";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(72, 205);
    context.lineTo(1128, 205);
    context.stroke();
    const stats = [
      ["MONEY EARNED", `$${game.progress.totalEarned.toLocaleString()}`],
      ["LONGEST RUN", `${game.progress.longestRun} rooms`],
      ["HIGHEST LUCK", `${game.progress.highestLuck}%`],
      ["CHESTS FOUND", `${game.progress.chestsCollected}`],
    ];
    stats.forEach(([label, value], index) => {
      const x = 72 + (index % 2) * 520;
      const y = 300 + Math.floor(index / 2) * 145;
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
    if (turnResult) {
      const availableBeforeTurn = Math.max(0, turnResult.balanceBefore - turnResult.totalStake);
      setCoinCountValue(availableBeforeTurn);
      setCoinCountAnimation({ from: availableBeforeTurn, to: turnResult.balanceAfter });
    }
    setTurnResult(null);
    game.set({
      phase: "choosing",
      lastReport: null,
      message: "Choose a path. Trust your instincts.",
    });
  };
  const turnPathName = (direction: Direction) => directionNames[direction];
  const resultPath = turnResult ? turnPathName(turnResult.actualDirection) : "";
  const netCoins = turnResult ? turnResult.balanceAfter - turnResult.balanceBefore : 0;
  const predictedPaths = turnResult
    ? (Object.entries(turnResult.placedBets) as [Direction, number][]).filter(([, amount]) => amount > 0)
    : [];

  useEffect(() => {
    if (!sessionReady || !playerName) return;
    submitScore({
      playerName,
      score: game.money,
      charactersUnlocked: ownedCharacterIds.length,
      roomNumber: displayRoom,
    });
  }, [sessionReady, playerName, game.money, ownedCharacterIds.length, displayRoom]);

  return (
    <main className="game-shell immersive-game">
      <div className="immersive-scene">
        <MazeScene
          game={game}
          avatar={avatar}
          characterId={selectedCharacterId}
          onPathHoldStart={startPathHold}
          onChestReached={handleChestReached}
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
        <div className="hud-luck glass-panel" aria-label={`Luck ${displayLuck} percent; ${Math.round(luckInfluence(displayLuck) * 100)} percent influence`}>
          <div className="hud-luck-top"><span>☘</span><span>LUCK</span><strong>{displayLuck}%</strong></div>
          <div className="hud-luck-track"><div className="hud-luck-fill" style={{ width: `${Math.min(100, displayLuck)}%` }} /></div>
          {game.overflow && <span className="hud-overflow">FORTUNE READY</span>}
        </div>
        <div className="hud-wallet glass-panel">
          {betLossCue && (
            <motion.span
              key={betLossCue.id}
              className="hud-coin-loss"
              aria-hidden="true"
              initial={{ opacity: 0, y: 5, scale: .9 }}
              animate={{ opacity: [0, 1, 1, 0], y: [5, -5, -5, -25], scale: [.9, 1, 1, .96] }}
              transition={{ duration: .95, times: [0, .18, .68, 1], ease: "easeOut" }}
            >
              −{formatCoinBalance(betLossCue.amount)}
            </motion.span>
          )}
          <div className="hud-coins"><span className="coin-single" aria-hidden="true">$</span><strong title={displayMoney.toLocaleString()}>{formatCoinBalance(displayMoney)}</strong></div>
          <div className="hud-chests"><Icon name="treasure" size={14} /><span>{displayChests} chests found</span></div>
          <div className={`hud-daily ${displayMoney === 0 ? "hud-daily-waiting" : ""}`}>{displayMoney === 0 ? `Daily pouch · +100 in ${dailyCountdown}` : `+100 daily · ${dailyCountdown}`}</div>
        </div>
      </header>

      <div className="world-title"><span className="world-clover">{equippedIcon ?? "✳"}</span><span>AMAZING GAMBLER</span><span className="world-biome">{environmentForRoom(game.junction.id + 1).name}</span><span className="world-time">{worldPhase}</span></div>

      <div className="world-shortcuts">
        <button className="profile-button glass-panel" onClick={() => setShowProfile(true)} aria-label={`Open player profile, currently exploring as ${avatarName}`}>
          <img src={avatar} alt="" /><span>{avatarName}</span><span className="profile-caret">⌄</span>
        </button>
        <button className="glass-tool" onClick={() => setShopOpen(true)}>✦ <span>Curio cabinet</span></button>
        <button className="glass-tool character-gallery-button" onClick={() => setCharacterCollectionOpen(true)} aria-label="Open character collection">♙ <span>Explorers</span></button>
        <button className="glass-tool" onClick={() => setShowTutorial(true)} aria-label="Open game guide">? <span>Game guide</span></button>
        <PwaInstallButton />
        <ProfileButton onClick={() => setPlayerProfileOpen(true)} playerName={playerName} />
        <button
          className="glass-tool sound-toggle"
          data-sound-toggle
          aria-label={soundEnabled ? "Turn sound effects off" : "Turn sound effects on"}
          aria-pressed={soundEnabled}
          onClick={toggleSound}
        >
          <Icon name={soundEnabled ? "sound" : "muted"} size={16} />
          <span>{soundEnabled ? "Sound on" : "Sound off"}</span>
        </button>
      </div>

      <section className={`next-junction-panel glass-panel ${isRunPlaying ? "next-junction-panel-fading" : ""}`} aria-label="Choose the explorer's path" aria-hidden={isRunPlaying}>
        <div className="junction-panel-heading">
          <div>
            <span className="junction-kicker">THE NEXT JUNCTION <i>·</i> {currentOptions.length} paths ahead</span>
            <h1>Predict the explorer&apos;s next move</h1>
            <p>Tap to place 1 coin <span>·</span> press and hold to stack them faster</p>
          </div>
          <div className="stake-summary">
            <span>ON THE LINE</span>
            <strong title={`${totalBet.toLocaleString()} coins`}><span className="mini-coin">$</span>{formatCoinBalance(totalBet)}</strong>
            {totalBet > 0 && <button className="undo-hold-button" onPointerDown={(event) => { if (event.button === 0) startUndoHold(); }} onPointerLeave={stopUndoHold} onClick={(event) => { if (event.detail === 0) undoLastCoin(); }} disabled={game.phase !== "choosing"} title="Tap to undo one coin; press and hold to undo faster" aria-label="Undo the last coin placed; press and hold to remove coins faster"><Icon name="undo" size={13} /><span>Undo last coin</span></button>}
          </div>
        </div>
        <div className={`route-options options-${currentOptions.length}`}>
          {optionNames.map(({ direction, label }) => (
            <button
              key={direction}
              className={`route-option route-option-${direction} ${game.bets[direction] > 0 ? "route-option-active" : ""} ${isDangerous(direction) ? "route-option-danger" : ""}`}
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
          <button className="predict-button" data-sound="predict" onClick={resolveRound} disabled={game.phase !== "choosing" || !selectedCount || totalBet === 0 || totalBet > game.money || game.money <= 0}>
            <span>{game.money === 0 ? `Wait for daily coins · ${dailyCountdown || "…"}` : game.phase === "choosing" ? "Watch the turn" : game.phase === "approaching" ? "The moment of fate…" : game.phase === "moving" ? "The explorer is on the move…" : game.phase === "result" ? "Read your turn report" : "Explorer on the move…"}</span>
            {game.phase === "choosing" && game.money > 0 && <Icon name="arrow" size={19} />}
            {game.phase !== "choosing" && <span className="button-ellipsis">···</span>}
          </button>
        </div>
        <div className="daily-footnote">Daily allowance: 100 free coins <span>·</span> a cozy game of chance, never real gambling</div>
      </section>

      {playerNameLoaded && !playerName && !setupSkipped && !showProfile && (
        <ProfileSetupModal onComplete={setPlayerNameState} onSkip={() => setSetupSkipped(true)} />
      )}
      {playerProfileOpen && (
        <ProfileModal playerName={playerName} onSaved={setPlayerNameState} onClose={() => setPlayerProfileOpen(false)} />
      )}

      <AnimatePresence>
        {showProfile && (
          <PlayerProfileModal
            avatar={avatar}
            characterName={characterName}
            selectedCharacterId={selectedCharacterId}
            progress={game.progress}
            onSelect={chooseCharacter}
            onShare={() => void shareResult()}
            onCopy={() => void copyResult()}
            onDownload={downloadResult}
            onClose={() => setShowProfile(false)}
            canClose={hasPickedCharacter}
            ownedCharacterIds={ownedCharacterIds}
          />
        )}
        {showTutorial && <TutorialModal onClose={closeTutorial} />}
        {game.phase === "chest" && turnResult?.chestDrop && (
          <motion.div className="turn-report-backdrop chest-reveal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section className={`chest-reveal-card glass-panel ${turnResult.chestDrop.kind === "character" ? "chest-reveal-character" : "chest-reveal-coins"}`} role="dialog" aria-modal="true" aria-labelledby="chest-reveal-title" initial={{ y: 18, scale: .96 }} animate={{ y: 0, scale: 1 }}>
              <span className="chest-reveal-kicker">FOUND ON THE {turnPathName(turnResult.actualDirection).toUpperCase()} PATH · {turnResult.chestDrop.rarity.toUpperCase()}</span>
              <div className="chest-reveal-art" style={{ "--chest-color": turnResult.chestDrop.color } as React.CSSProperties}>
                {turnResult.chestDrop.kind === "character"
                  ? <img src={characterPortrait(characterById.get(turnResult.chestDrop.characterId) ?? starterCharacters[0])} alt="" />
                  : <Icon name="treasure" size={50} />}
              </div>
              <h2 id="chest-reveal-title">{turnResult.chestDrop.kind === "character"
                ? characterById.get(turnResult.chestDrop.characterId)?.name ?? "A new explorer"
                : `+${turnResult.chestDrop.reward} coins`}</h2>
              <p>{turnResult.chestDrop.kind === "character"
                ? "A new friend has joined your collection. Choose them now or keep exploring with your current companion."
                : `${turnResult.chestDrop.rarity} treasure. The coins are yours, and the explorer can carry on.`}</p>
              {revealedCharacter && (
                <button className="chest-equip-button" data-sound="reward" onClick={() => chooseCharacter(revealedCharacter)}>
                  Equip {revealedCharacter.name}
                </button>
              )}
              <button className="turn-continue chest-continue" data-sound="continue" onClick={continueAfterChest}>
                Continue the adventure <Icon name="arrow" size={18} />
              </button>
            </motion.section>
          </motion.div>
        )}
        {turnResult && game.phase === "result" && (
          <motion.div className="turn-report-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {turnResult.trapName ? (
              <motion.section className="trap-report glass-panel" role="dialog" aria-modal="true" aria-labelledby="trap-report-title" initial={{ y: 18, scale: .97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, scale: .98 }}>
                <span className="turn-report-kicker">ROOM {String(turnResult.room).padStart(2, "0")} · TRAP ENCOUNTER</span>
                <div className="trap-report-mark" aria-hidden="true">
                  {trapDefinitions.find((trap) => trap.label === turnResult.trapName)?.icon ?? "!"}
                </div>
                <h2 id="trap-report-title">{turnResult.trapName} sprung!</h2>
                <p className="turn-report-summary">
                  {characterName} hit a trap on the <strong>{resultPath}</strong> path.
                  {turnResult.trapCaught ? " The explorer was caught." : " The explorer escaped the worst of it."}
                </p>
                <div className="trap-loss-grid">
                  <div><span>COINS LOST</span><strong>−{turnResult.trapPenalty}</strong></div>
                  <div><span>LUCK LOST</span><strong>−{turnResult.trapLuckLoss}%</strong></div>
                </div>
                <div className="turn-report-lines">
                  <div><span>Your coins placed</span><strong>−{turnResult.totalStake}</strong></div>
                  <div><span>{turnResult.hit ? `Correct path · ${turnResult.risky ? "risky 3×" : "2×"} payout` : "Path prediction"}</span><strong>{turnResult.pathReward ? `+${turnResult.pathReward}` : "—"}</strong></div>
                  {turnResult.chestReward > 0 && <div><span>{turnResult.chestName ?? "Treasure chest"}</span><strong>+{turnResult.chestReward}</strong></div>}
                  {turnResult.chestDrop?.kind === "character" && <div><span>New explorer · {turnResult.chestName}</span><strong>Unlocked</strong></div>}
                  {turnResult.itemName && <div><span>{turnResult.itemName}</span><strong>+{turnResult.itemLuckGain}% luck</strong></div>}
                  <div><span>Luck after turn</span><strong>{turnResult.luckBefore}% <span>→</span> {turnResult.luckAfter}%</strong></div>
                  <div className="turn-line-total"><span>Coin balance</span><strong>{turnResult.balanceBefore} <span>→</span> {turnResult.balanceAfter}</strong></div>
                </div>
                <button className="turn-continue" data-sound="continue" onClick={advanceAfterReport}>
                  Continue to room {String(game.run + 1).padStart(2, "0")} <Icon name="arrow" size={18} />
                </button>
                <p className="turn-report-note">The maze keeps going. Your forever adventure is saved automatically.</p>
              </motion.section>
            ) : (
            <motion.section className="turn-report glass-panel" role="dialog" aria-modal="true" aria-labelledby="turn-report-title" initial={{ y: 18, scale: .97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, scale: .98 }}>
              <span className="turn-report-kicker">ROOM {String(turnResult.room).padStart(2, "0")} · TURN REPORT</span>
              <div className={`turn-outcome-mark ${turnResult.hit ? "turn-outcome-win" : ""}`}>{turnResult.hit ? "✦" : "↗"}</div>
              <h2 id="turn-report-title">{turnResult.hit ? "A sharp prediction!" : "The path had other plans."}</h2>
              <p className="turn-report-summary">
                {characterName} took the <strong>{resultPath}</strong> path.
                {turnResult.hit
                  ? ` You backed it with ${turnResult.placedBets[turnResult.actualDirection] ?? 0} coin${turnResult.placedBets[turnResult.actualDirection] === 1 ? "" : "s"}.`
                  : predictedPaths.length
                      ? ` You backed ${predictedPaths.map(([direction]) => turnPathName(direction)).join(" and ")}.`
                    : " No coins were placed on that path."}
              </p>
              <div className="turn-report-lines">
                <div><span>Your coins placed</span><strong>−{turnResult.totalStake}</strong></div>
                <div><span>{turnResult.hit ? `Correct path · ${turnResult.risky ? "risky 3×" : "2×"} payout` : "Path prediction"}</span><strong>{turnResult.pathReward ? `+${turnResult.pathReward}` : "—"}</strong></div>
                {turnResult.chestReward > 0 && <div><span>{turnResult.chestName ?? "Treasure chest"}</span><strong>+{turnResult.chestReward}</strong></div>}
                {turnResult.chestDrop?.kind === "character" && <div><span>New explorer · {turnResult.chestName}</span><strong>Unlocked</strong></div>}
                {turnResult.fortuneBonus > 0 && <div><span>{turnResult.risky && turnResult.hit ? "Risky path bonus" : "Fortune bonus"}</span><strong>+{turnResult.fortuneBonus}</strong></div>}
                {turnResult.itemName && <div><span>{turnResult.itemName}</span><strong>+{turnResult.itemLuckGain}% luck</strong></div>}
                {turnResult.trapPenalty > 0 && <div className="turn-line-danger"><span>{turnResult.trapName ?? "Trap"}{turnResult.trapCaught ? " · caught!" : ""}</span><strong>−{turnResult.trapPenalty}</strong></div>}
                <div><span>Luck</span><strong>{turnResult.luckBefore}% <span>→</span> {turnResult.luckAfter}%</strong></div>
                <div className="turn-line-total"><span>Coin balance</span><strong>{turnResult.balanceBefore} <span>→</span> {turnResult.balanceAfter}</strong></div>
              </div>
              <div className={`turn-net ${netCoins < 0 ? "turn-net-loss" : ""}`}>
                {netCoins >= 0 ? "+" : "−"}{Math.abs(netCoins)} <span>coins this turn</span>
              </div>
              <button className="turn-continue" data-sound="continue" onClick={advanceAfterReport}>
                Continue to room {String(game.run + 1).padStart(2, "0")} <Icon name="arrow" size={18} />
              </button>
              <p className="turn-report-note">The maze keeps going. Your forever adventure is saved automatically.</p>
            </motion.section>
            )}
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
                      <button
                        data-sound={isOwned ? "reward" : "purchase"}
                        className={active ? "shop-item-active" : ""}
                        onClick={() => collectCosmetic(cosmetic.id)}
                        disabled={!isOwned && game.money < cosmetic.price}
                      >
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
        {characterCollectionOpen && (
          <CharacterCollectionModal
            ownedIds={ownedCharacterIds}
            selectedId={selectedCharacterId}
            money={game.money}
            onBuy={buyCharacter}
            onEquip={(character) => {
              chooseCharacter(character);
              setCharacterCollectionOpen(false);
            }}
            onClose={() => setCharacterCollectionOpen(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>{toast && <motion.div className="toast-message" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>{toast}</motion.div>}</AnimatePresence>
    </main>
  );
}
