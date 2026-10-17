"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
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

type Phase = "walking" | "choosing" | "moving" | "fallen" | "idle";
type TrailNode = { x: number; y: number; id: number; event?: EventKind; icon?: string };
type BetMap = Record<Direction, number>;
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
  set: (values: Partial<GameState>) => void;
};

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
  set: (values) => set(values),
}));

const characters = [
  { name: "Pip", color: "#f0ae73", face: "🧙" },
  { name: "Moss", color: "#9dbe8f", face: "🧝" },
  { name: "Ruby", color: "#e79a91", face: "🦊" },
  { name: "Orbit", color: "#93b9d2", face: "👩‍🚀" },
];

const startBet = 10;
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
    upload: <><path d="M12 16V4m-4 4 4-4 4 4" /><path d="M4 16v4h16v-4" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    treasure: <><path d="M4 10h16v10H4zM3 6h18v4H3z" /><path d="M12 6v14m-3-14c-3 0-3-4 0-4 2 0 3 4 3 4m3 0c3 0 3-4 0-4-2 0-3 4-3 4" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function MazeScene({
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
            className={`explorer-sprite ${game.phase === "moving" ? "explorer-moving" : game.phase === "walking" ? "explorer-walking" : ""} ${game.phase === "fallen" ? "explorer-fallen" : ""}`}
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
        <span className="eyebrow">A QUICK NOTE BEFORE THE FIRST TURN</span>
        <h2 id="tutorial-title">How to play</h2>
        <p id="tutorial-description" className="tutorial-intro">Watch the explorer reach a junction. Then trust your hunch about where they&apos;ll go.</p>
        <ol className="tutorial-steps">
          <li><span>1</span><div><strong>Read the paths</strong><p>Look at the open routes in the maze. Risky paths are marked.</p></div></li>
          <li><span>2</span><div><strong>Choose one or two</strong><p>Tap up to two paths on the maze or in the junction panel.</p></div></li>
          <li><span>3</span><div><strong>Set your practice-coin wager</strong><p>Lock it in and see where the explorer goes. Correct guesses win coins.</p></div></li>
        </ol>
        <button className="tutorial-close-button" onClick={onClose}>Close tutorial &amp; start exploring</button>
        <div className="modal-footnote">This quick tutorial is shown once on this device.</div>
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
  const wager = startBet;
  const [resultOpen, setResultOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [ownedCosmetics, setOwnedCosmetics] = useState<string[]>([]);
  const [equipped, setEquipped] = useState<Partial<Record<CosmeticCategory, string>>>({});
  const [toast, setToast] = useState("");
  const movingRef = useRef<number | null>(null);
  const luck = game.stats.luck ?? 10;
  const selectedCount = Object.values(game.bets).filter((amount) => amount > 0).length;
  const totalBet = Object.values(game.bets).reduce((sum, amount) => sum + amount, 0);
  const equippedIcon = cosmeticDefinitions.find((cosmetic) => cosmetic.id === equipped.icon)?.icon;
  const equippedBadge = cosmeticDefinitions.find((cosmetic) => cosmetic.id === equipped.badge);
  const currentOptions = game.junction.options;
  const optionNames = currentOptions.map((direction, index) => ({
    direction,
    label: String.fromCharCode(65 + index),
  }));
  const avatarName = characterName;

  useEffect(() => {
    game.set({ progress: loadProgress() });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (game.phase !== "walking") return;
    const timer = window.setTimeout(() => game.set({ phase: "choosing", message: "Choose a path. Trust your gut." }), 1550);
    return () => window.clearTimeout(timer);
  }, [game.phase, game]);

  useEffect(() => () => {
    if (movingRef.current) clearTimeout(movingRef.current);
  }, []);

  const chooseCharacter = (name: string, image: string) => {
    setAvatar(image);
    setCharacterName(name);
    setHasPickedCharacter(true);
    setShowPicker(false);
    if (!tutorialSeen) setShowTutorial(true);
    game.set({ phase: "walking" });
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

  const addBet = (direction: Direction) => {
    if (game.phase !== "choosing") return;
    const current = game.bets[direction];
    if (current === 0 && selectedCount >= 2) {
      setToast("You can choose up to two paths at each junction.");
      window.setTimeout(() => setToast(""), 2400);
      return;
    }
    const next = current > 0 ? 0 : Math.min(wager, Math.max(0, game.money - totalBet));
    const nextBets = { ...game.bets, [direction]: next };
    game.set({
      bets: nextBets,
    });
  };

  const adjustBet = (amount: number) => {
    if (game.phase !== "choosing") return;
    const chosen = currentOptions.find((direction) => game.bets[direction] > 0);
    const direction = chosen ?? currentOptions[0];
    if (!direction) return;
    const otherBets = totalBet - game.bets[direction];
    const next = Math.max(0, Math.min(game.money - otherBets, game.bets[direction] + amount));
    game.set({
      bets: { ...game.bets, [direction]: next },
    });
  };

  const resolveRound = () => {
    if (!selectedCount || totalBet <= 0 || game.phase !== "choosing") {
      setToast("Pick a path and add a wager first.");
      window.setTimeout(() => setToast(""), 2200);
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
    let nextLuck = oldLuck;
    let payout = 0;
    if (hit) {
      payout += game.bets[actualDirection] * (dangerous ? 3 : 2);
      nextLuck += dangerous ? 22 : 7;
    } else {
      nextLuck = Math.max(0, nextLuck - 5);
    }
    if (chest) payout += chest.reward;
    if (predictedTrap) payout += 50;
    const beforeItem = nextLuck;
    if (item) nextLuck = item.apply({ ...game.stats, luck: nextLuck }).luck;
    const itemLuckGain = item ? Math.max(0, nextLuck - beforeItem) : 0;
    const overflowReached = nextLuck >= 100;
    const overflowArmed = game.overflow || oldLuck >= 100;
    const overflowActivated = overflowArmed && hit;
    if (overflowActivated) {
      payout += 75;
      nextLuck = 5;
    }
    nextLuck = Math.min(100, Math.max(0, nextLuck));
    const survivalChance = trap
      ? Math.max(0.1, Math.min(.82, .36 + oldLuck / 300 - trap.survivalDifficulty))
      : 1;
    const ended = trapEncounter && Math.random() > survivalChance;
    if (trap && !ended) {
      payout -= trap.moneyPenalty;
      nextLuck = Math.max(0, nextLuck - trap.luckPenalty);
    }
    const nextMoney = Math.max(0, game.money - totalBet + payout - (ended ? 20 : 0));
    const nextRun = game.run + 1;
    const resultMessage = ended
      ? `Oh no—${characterName} stumbled into a trap. The journey ends here.`
      : hit
        ? dangerous
          ? `Brave call! The risky path paid off. +$${payout.toLocaleString()}`
          : `A lovely guess. You found the right path! +$${payout.toLocaleString()}`
        : `The explorer went another way. Better luck next turn.`;
    const nextProgress: Progress = {
      totalEarned: game.progress.totalEarned + Math.max(0, payout),
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
      event: ended ? "trap" : event,
      icon: ended ? trap?.icon : chest?.id,
    };
    const stepStats = { ...game.stats, luck: nextLuck };
    game.set({
      money: nextMoney,
      run: nextRun,
      stats: stepStats,
      phase: ended ? "fallen" : "moving",
      previous: actualDirection,
      explorer: { x: node.x, y: node.y },
      trail: [...game.trail, node],
      bets: { north: 0, east: 0, south: 0, west: 0 },
      progress: nextProgress,
      message: overflowActivated ? `LUCK OVERFLOW! A fortune bonus +$75!` : resultMessage,
      event: ended ? "trap" : event,
      overflow: !overflowActivated && (overflowArmed || overflowReached),
      chestCount: game.chestCount + (chest ? 1 : 0),
    });
    saveProgress(nextProgress);
    if (chest) {
      setToast(`${chest.label}! +$${chest.reward.toLocaleString()}`);
      window.setTimeout(() => setToast(""), 2400);
    } else if (item) {
      setToast(`${item.name}: +${itemLuckGain} Luck`);
      window.setTimeout(() => setToast(""), 2400);
    }
    movingRef.current = window.setTimeout(() => {
      if (ended) {
        game.set({ phase: "fallen" });
        return;
      }
      const junction = createJunction(nextRun, actualDirection);
      game.set({
        phase: "walking",
        junction,
        event: null,
        overflow: false,
        message: "Another junction. Read the signs...",
      });
    }, 1050);
  };

  const restartRun = () => {
    const nextJunction = createJunction(0);
    game.set({
      money: Math.max(50, game.money),
      run: 0,
      stats: Object.fromEntries(statDefinitions.map((stat) => [stat.id, stat.initial])),
      phase: "walking",
      junction: nextJunction,
      previous: undefined,
      explorer: { x: 0, y: 0 },
      trail: [{ x: 0, y: 0, id: 0 }],
      bets: { north: 0, east: 0, south: 0, west: 0 },
      message: "A fresh maze. A fresh fortune.",
      event: null,
      overflow: false,
    });
    setResultOpen(false);
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
  const roundOutcome = useMemo(() => game.message, [game.message]);

  return (
    <main className="game-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Amazing Gambler home">
          <span className="brand-mark">{equippedIcon ?? "✳"}</span>
          <span className="brand-name">AMAZING<br />GAMBLER</span>
        </a>
        <p className="tagline">Predict the Path. <span>Trust the Luck.</span> Win the Fortune.</p>
        <div className="top-actions">
          <PwaInstallButton />
          <button className="profile-button" onClick={() => setShowPicker(true)} aria-label={`Change explorer, current character ${avatarName}`}>
            <img src={avatar} alt="" /><span>{avatarName}</span><span className="profile-caret">⌄</span>
          </button>
        </div>
      </header>

      <div className="game-main">
        <section className="play-column">
          <div className="adventure-heading">
            <div>
              <span className="eyebrow">YOUR LUCKY LITTLE ADVENTURE</span>
              <h1>One more turn<span className="heading-period">.</span></h1>
            </div>
            <div className="run-chip">{equippedBadge && <span className="badge-chip" title={equippedBadge.label}>{equippedBadge.icon}</span>}<span className="run-icon">⌁</span><span>ROOM <strong>{String(game.run + 1).padStart(2, "0")}</strong></span></div>
          </div>

          <MazeScene
            game={game}
            avatar={avatar}
            onChoosePath={addBet}
            theme={equipped.theme ?? ""}
            trail={equipped.trail ?? ""}
            frame={equipped.frame ?? ""}
          />

          <div className="journey-footer">
            <div className="journey-stat"><span className="journey-icon">⌁</span><div><span>On this run</span><strong>{game.run} <small>rooms</small></strong></div></div>
            <div className="journey-divider" />
            {statDefinitions.map((stat) => {
              const value = game.stats[stat.id] ?? stat.initial;
              return (
                <div className="journey-stat luck-stat" key={stat.id}>
                  <span className="luck-symbol">{stat.icon}</span>
                  <div className="luck-copy">
                    <span>{stat.label}<b>{value}{stat.unit ?? ""}</b></span>
                    <div className="luck-track"><div className="luck-fill" style={{ width: `${Math.min(100, value / stat.maximum * 100)}%` }} /></div>
                  </div>
                  {stat.id === "luck" && game.overflow && <span className="overflow-chip">OVERFLOW!</span>}
                </div>
              );
            })}
            <div className="journey-divider" />
            <div className="journey-stat"><span className="journey-icon treasure-icon"><Icon name="treasure" /></span><div><span>Found</span><strong>{game.chestCount} <small>chests</small></strong></div></div>
          </div>

          <div className="round-message" aria-live="polite">
            <span className={`message-icon ${game.event === "trap" ? "message-danger" : ""}`}>{game.event === "trap" ? "!" : game.event === "chest" ? "♢" : game.event === "item" ? "✦" : "✧"}</span>
            <AnimatePresence mode="wait"><motion.span key={roundOutcome} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}>{roundOutcome}</motion.span></AnimatePresence>
          </div>
        </section>

        <aside className="play-sidebar">
          <section className="wallet-card">
            <div className="wallet-top"><span className="eyebrow">YOUR POCKET</span><span className="wallet-spark">✳</span></div>
            <div className="wallet-amount"><span className="dollar-sign">$</span>{game.money.toLocaleString()}</div>
            <div className="wallet-caption"><span className="wallet-dot" /> Practice coins <span className="virtual-note">JUST FOR FUN</span></div>
          </section>

          <section className="decision-panel">
            <div className="decision-heading">
              <div><span className="eyebrow">THE NEXT JUNCTION</span><h2>Where will they go?</h2></div>
              <span className="junction-count">{currentOptions.length} <small>ways</small></span>
            </div>
            <p className="decision-hint">Choose up to two paths on the map or below.</p>
            <div className={`route-options options-${currentOptions.length}`}>
              {optionNames.map(({ direction, label }) => (
                <button
                  key={direction}
                  className={`route-option ${game.bets[direction] > 0 ? "route-option-active" : ""} ${isDangerous(direction) ? "route-option-danger" : ""}`}
                  onClick={() => addBet(direction)}
                  disabled={game.phase !== "choosing" || game.money <= 0 || (selectedCount >= 2 && game.bets[direction] === 0)}
                  aria-pressed={game.bets[direction] > 0}
                >
                  <span className="option-key">{label}</span>
                  <span className="option-name">{directionNames[direction]}</span>
                  {isDangerous(direction) && <span className="option-danger">risky</span>}
                  {game.bets[direction] > 0 && <span className="option-wager">${game.bets[direction]}</span>}
                  {game.bets[direction] > 0 && <span className="option-check">✓</span>}
                </button>
              ))}
            </div>
            <div className="wager-row">
              <span>Your wager</span>
              <div className="wager-control">
                <button onClick={() => adjustBet(-10)} disabled={game.phase !== "choosing" || totalBet <= 0} aria-label="Decrease wager">−</button>
                <span>${totalBet || wager}</span>
                <button onClick={() => adjustBet(10)} disabled={game.phase !== "choosing" || game.money <= totalBet} aria-label="Increase wager">+</button>
              </div>
              <span className="wager-caption">virtual coins</span>
            </div>
            <button className="predict-button" onClick={resolveRound} disabled={game.phase !== "choosing" || !selectedCount || totalBet === 0}>
              <span>{game.phase === "choosing" ? "Lock in prediction" : game.phase === "fallen" ? "Journey ended" : "Explorer on the move"}</span>
              {game.phase === "choosing" ? <Icon name="arrow" size={19} /> : <span className="button-ellipsis">···</span>}
            </button>
            <div className="payout-note"><span>✦</span> Correct path pays <strong>2×</strong> <i>·</i> risky path pays <strong>3×</strong></div>
          </section>

          <section className="hint-card">
            <span className="hint-icon">✎</span><div><strong>A little hunch goes a long way.</strong><p>You can spread your coins over more than one path.</p></div>
          </section>
          {game.phase === "fallen" && (
            <div className="run-actions">
              <button className="new-run-button" onClick={restartRun}><span>↻</span> Find another maze</button>
              <button className="share-run-button" onClick={() => setResultOpen(true)}>Your adventure card <Icon name="arrow" size={16} /></button>
            </div>
          )}
          <div className="sidebar-bottom">
            <div className="sidebar-links">
              <button onClick={() => setShopOpen(true)}><span>✦</span> Curio cabinet</button>
              <button onClick={() => setResultOpen(true)}><span>✧</span> Adventure card</button>
            </div>
            <span>All games are just for fun.</span>
          </div>
        </aside>
      </div>

      <footer className="site-footer">
        <span>✳ <strong>AMAZING GAMBLER</strong> <i>·</i> Every maze has a silver lining.</span>
        <span>Virtual coins only <i>·</i> Made for the love of a good guess</span>
      </footer>

      <AnimatePresence>
        {showPicker && <SelectionModal onSelect={chooseCharacter} onUpload={uploadCharacter} onClose={() => { setShowPicker(false); if (game.phase === "choosing") game.set({ phase: "walking" }); }} hasCharacter={hasPickedCharacter} />}
        {showTutorial && <TutorialModal onClose={closeTutorial} />}
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
              <p className="shop-intro">Make this maze feel like yours. Everything here costs practice coins.</p>
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
              <div className="shop-footnote">A small collection of frames, trails, themes, icons &amp; badges.</div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{toast && <motion.div className="toast-message" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>{toast}</motion.div>}</AnimatePresence>
    </main>
  );
}
