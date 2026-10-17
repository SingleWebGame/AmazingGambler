import type { CharacterRarity } from "./characters";

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

export type CoinChestRarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic";
export type ChestDrop =
  | { kind: "coins"; rarity: CoinChestRarity; reward: number; color: string; label: string }
  | { kind: "character"; rarity: CharacterRarity; reward: 0; color: string; label: string; characterId: string };

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
  chests: Partial<Record<Direction, ChestDrop>>;
}

export const coinChestRewards: { rarity: CoinChestRarity; reward: number; color: string; weight: number }[] = [
  { rarity: "Common", reward: 10, color: "#f3dfa0", weight: 48 },
  { rarity: "Uncommon", reward: 30, color: "#f4d17c", weight: 28 },
  { rarity: "Rare", reward: 100, color: "#f4c464", weight: 15 },
  { rarity: "Epic", reward: 300, color: "#f6d77e", weight: 6.5 },
  { rarity: "Legendary", reward: 700, color: "#ffeb9c", weight: 2 },
  { rarity: "Mythic", reward: 1000, color: "#fff6c4", weight: 0.5 },
];

export const characterChestColors: Record<CharacterRarity, string> = {
  Common: "#c9afe6",
  Uncommon: "#bd9ce5",
  Rare: "#ae84df",
  Epic: "#a475df",
  Legendary: "#cc9bf5",
  "Ultra-rare": "#f0d5ff",
};

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
  return { id, options, hazards, chests: {} };
}

export function rollCoinChest(): ChestDrop {
  const total = coinChestRewards.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of coinChestRewards) {
    roll -= entry.weight;
    if (roll <= 0) {
      return { kind: "coins", rarity: entry.rarity, reward: entry.reward, color: entry.color, label: `${entry.rarity} coin chest` };
    }
  }
  const common = coinChestRewards[0];
  return { kind: "coins", rarity: common.rarity, reward: common.reward, color: common.color, label: `${common.rarity} coin chest` };
}

export function rollCharacterChest(ownedIds: string[], available: { id: string; rarity: CharacterRarity; name: string }[]): ChestDrop | null {
  const unowned = available.filter((character) => !ownedIds.includes(character.id));
  if (!unowned.length) return null;
  const weights: Record<CharacterRarity, number> = {
    Common: 40,
    Uncommon: 27,
    Rare: 17,
    Epic: 10,
    Legendary: 5,
    "Ultra-rare": 1,
  };
  const byRarity = unowned.reduce((groups, character) => {
    groups[character.rarity].push(character);
    return groups;
  }, {
    Common: [], Uncommon: [], Rare: [], Epic: [], Legendary: [], "Ultra-rare": [],
  } as Record<CharacterRarity, typeof unowned>);
  const eligible = (Object.keys(weights) as CharacterRarity[]).filter((rarity) => byRarity[rarity].length);
  const total = eligible.reduce((sum, rarity) => sum + weights[rarity], 0);
  let roll = Math.random() * total;
  let rarity = eligible[0];
  for (const candidate of eligible) {
    roll -= weights[candidate];
    if (roll <= 0) {
      rarity = candidate;
      break;
    }
  }
  const candidates = byRarity[rarity];
  const character = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    kind: "character",
    rarity,
    reward: 0,
    color: characterChestColors[rarity],
    label: `${rarity} character chest`,
    characterId: character.id,
  };
}

export function rollPathChest(
  ownedIds: string[],
  available: { id: string; rarity: CharacterRarity; name: string }[],
): ChestDrop | null {
  if (Math.random() >= 0.14) return null;
  if (Math.random() < 0.035) {
    const characterChest = rollCharacterChest(ownedIds, available);
    if (characterChest) return characterChest;
  }
  return rollCoinChest();
}

export function rollEvent(luck: number): EventKind {
  const rareRoll = Math.random() + (luck > 80 ? 0.025 : 0);
  if (rareRoll < 0.13) return "trap";
  if (rareRoll < 0.28) return "item";
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
