export type Direction = "north" | "east" | "south" | "west";
export type EventKind = "chest" | "item" | "trap" | "quiet";

export interface StatDefinition {
  id: string;
  label: string;
  icon: string;
  initial: number;
  maximum: number;
  unit?: string;
}

export interface ItemDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  apply: (stats: Record<string, number>) => Record<string, number>;
}

export interface ChestDefinition {
  id: string;
  label: string;
  reward: number;
  color: string;
  weight: number;
}

export type CosmeticCategory = "frame" | "theme" | "trail" | "icon" | "badge";

export interface CosmeticDefinition {
  id: string;
  label: string;
  category: CosmeticCategory;
  icon: string;
  price: number;
  description: string;
}

export interface TrapDefinition {
  id: string;
  label: string;
  icon: string;
  survivalDifficulty: number;
  moneyPenalty: number;
  luckPenalty: number;
}

export interface Junction {
  id: number;
  options: Direction[];
  hazards: Direction[];
}

export interface Progress {
  totalEarned: number;
  highestLuck: number;
  longestRun: number;
  chestsCollected: number;
  correctPredictions: number;
  failedPredictions: number;
  trapPredictions: number;
}

export const statDefinitions: StatDefinition[] = [
  { id: "luck", label: "Luck", icon: "✳", initial: 10, maximum: 100, unit: "%" },
];

export const itemDefinitions: ItemDefinition[] = [
  {
    id: "lucky-ball",
    name: "Lucky Ball",
    icon: "🔮",
    description: "A little extra fortune",
    apply: (stats) => ({
      ...stats,
      luck: Math.min(100, (stats.luck ?? 0) + Math.floor(Math.random() * 6)),
    }),
  },
];

export const chestDefinitions: ChestDefinition[] = [
  { id: "grey", label: "Pocket change", reward: 10, color: "#8e9698", weight: 64 },
  { id: "blue", label: "Sapphire chest", reward: 100, color: "#4d94d1", weight: 25 },
  { id: "gold", label: "Golden chest", reward: 500, color: "#e3a83d", weight: 9 },
  { id: "royal", label: "Royal fortune", reward: 2000, color: "#ca7ebc", weight: 2 },
];

export const cosmeticDefinitions: CosmeticDefinition[] = [
  { id: "gold-frame", label: "Golden halo", category: "frame", icon: "◉", price: 75, description: "A little shine for your explorer" },
  { id: "moonlit-maze", label: "Moonlit maze", category: "theme", icon: "☾", price: 120, description: "Follow the paths after dark" },
  { id: "starlight-trail", label: "Starlight trail", category: "trail", icon: "✦", price: 90, description: "Leave a little sparkle behind" },
  { id: "lucky-compass", label: "Lucky compass", category: "icon", icon: "⌖", price: 40, description: "A new mark for your journey" },
  { id: "pathfinder-badge", label: "Pathfinder badge", category: "badge", icon: "⚑", price: 180, description: "A badge for brave guessers" },
];

export const trapDefinitions: TrapDefinition[] = [
  { id: "pit", label: "Pit", icon: "◯", survivalDifficulty: 0.05, moneyPenalty: 8, luckPenalty: 5 },
  { id: "spikes", label: "Spikes", icon: "⌁", survivalDifficulty: 0.1, moneyPenalty: 10, luckPenalty: 7 },
  { id: "boulder", label: "Boulder", icon: "●", survivalDifficulty: 0.14, moneyPenalty: 12, luckPenalty: 8 },
  { id: "poison", label: "Poison", icon: "☠", survivalDifficulty: 0.12, moneyPenalty: 10, luckPenalty: 9 },
  { id: "monster", label: "Monster", icon: "♟", survivalDifficulty: 0.2, moneyPenalty: 15, luckPenalty: 10 },
];

export const directionNames: Record<Direction, string> = {
  north: "North",
  east: "East",
  south: "South",
  west: "West",
};

export const directionVectors: Record<Direction, { x: number; y: number }> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

const reverseDirection: Record<Direction, Direction> = {
  north: "south",
  east: "west",
  south: "north",
  west: "east",
};

export const emptyProgress: Progress = {
  totalEarned: 0,
  highestLuck: 10,
  longestRun: 0,
  chestsCollected: 0,
  correctPredictions: 0,
  failedPredictions: 0,
  trapPredictions: 0,
};

export function createJunction(id: number, cameFrom?: Direction): Junction {
  const possible = (Object.keys(directionVectors) as Direction[]).filter(
    (direction) => direction !== (cameFrom ? reverseDirection[cameFrom] : undefined),
  );
  const shuffled = [...possible].sort(() => Math.random() - 0.5);
  const count = 2 + Math.floor(Math.random() * 3);
  const options = shuffled.slice(0, count);
  const hazards =
    Math.random() < 0.35
      ? [options[Math.floor(Math.random() * options.length)]]
      : [];
  return { id, options, hazards };
}

export function rollChest(luck: number): ChestDefinition {
  const boosted = luck > 80;
  const weights = chestDefinitions.map((chest) => ({
    chest,
    weight:
      boosted && chest.id !== "grey"
        ? chest.weight * (chest.id === "royal" ? 1.18 : chest.id === "gold" ? 1.1 : 1.04)
        : boosted
          ? chest.weight * 0.94
          : chest.weight,
  }));
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of weights) {
    roll -= entry.weight;
    if (roll <= 0) return entry.chest;
  }
  return chestDefinitions[0];
}

export function rollEvent(luck: number): EventKind {
  const rareRoll = Math.random() + (luck > 80 ? 0.025 : 0);
  if (rareRoll < 0.13) return "trap";
  if (rareRoll < 0.28) return "item";
  if (rareRoll < 0.48) return "chest";
  return "quiet";
}

export function loadProgress(): Progress {
  if (typeof window === "undefined") return { ...emptyProgress };
  try {
    const saved = window.localStorage.getItem("amazing-gambler-progress");
    return saved
      ? { ...emptyProgress, ...JSON.parse(saved) as Partial<Progress> }
      : { ...emptyProgress };
  } catch (error) {
    console.error("Unable to load saved game progress.", error);
    return { ...emptyProgress };
  }
}

export function saveProgress(progress: Progress) {
  try {
    window.localStorage.setItem("amazing-gambler-progress", JSON.stringify(progress));
  } catch (error) {
    console.error("Unable to save game progress.", error);
  }
}
