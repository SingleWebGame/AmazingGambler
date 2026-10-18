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

export type CosmeticRarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

export interface CosmeticDefinition {
  id: string;
  label: string;
  category: CosmeticCategory;
  icon: string;
  price: number;
  description: string;
  rarity: CosmeticRarity;
}

// The opening predictions are guaranteed wins so new explorers can learn the controls safely.
export const GUARANTEED_ROUNDS = 5;

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
  { id: "gold-frame", label: "Golden halo", category: "frame", icon: "◉", price: 75, rarity: "Common", description: "A little shine for your explorer" },
  { id: "emerald-halo", label: "Emerald halo", category: "frame", icon: "◎", price: 110, rarity: "Uncommon", description: "A leafy green ring of calm" },
  { id: "rose-halo", label: "Rose halo", category: "frame", icon: "❂", price: 140, rarity: "Uncommon", description: "A soft blush glow overhead" },
  { id: "frost-halo", label: "Frost halo", category: "frame", icon: "❄", price: 260, rarity: "Rare", description: "A crisp, icy ring that hums" },
  { id: "solar-crown", label: "Solar crown", category: "frame", icon: "☀", price: 650, rarity: "Epic", description: "A wide blazing crown of light" },
  { id: "moonlit-maze", label: "Moonlit maze", category: "theme", icon: "☾", price: 120, rarity: "Uncommon", description: "Follow the paths after dark" },
  { id: "sunlit-maze", label: "Golden noon", category: "theme", icon: "☼", price: 150, rarity: "Uncommon", description: "The maze stays bright all day" },
  { id: "starlight-trail", label: "Starlight trail", category: "trail", icon: "✦", price: 90, rarity: "Common", description: "Leave a little sparkle behind" },
  { id: "blossom-trail", label: "Blossom trail", category: "trail", icon: "✿", price: 120, rarity: "Uncommon", description: "Petals drift in your wake" },
  { id: "ember-trail", label: "Ember trail", category: "trail", icon: "♨", price: 190, rarity: "Rare", description: "Warm sparks follow every step" },
  { id: "aurora-trail", label: "Aurora trail", category: "trail", icon: "≋", price: 420, rarity: "Epic", description: "Northern lights ripple behind you" },
  { id: "lucky-compass", label: "Lucky compass", category: "icon", icon: "⌖", price: 40, rarity: "Common", description: "A new mark for your journey" },
  { id: "wild-clover", label: "Wild clover", category: "icon", icon: "⚘", price: 70, rarity: "Common", description: "A little green wish for luck" },
  { id: "sun-seal", label: "Sun seal", category: "icon", icon: "❋", price: 160, rarity: "Uncommon", description: "A warm seal for bright days" },
  { id: "crown-mark", label: "Crown mark", category: "icon", icon: "♛", price: 480, rarity: "Rare", description: "For explorers who aim high" },
  { id: "star-medal", label: "Star medal", category: "icon", icon: "✪", price: 1100, rarity: "Epic", description: "A medal shaped like a wish" },
  { id: "clover-badge", label: "Clover badge", category: "badge", icon: "☘", price: 80, rarity: "Common", description: "Worn by the hopeful" },
  { id: "pathfinder-badge", label: "Pathfinder badge", category: "badge", icon: "⚑", price: 180, rarity: "Uncommon", description: "A badge for brave guessers" },
  { id: "keeper-badge", label: "Keeper badge", category: "badge", icon: "◈", price: 320, rarity: "Rare", description: "For those who guard their coins" },
  { id: "maze-master-badge", label: "Maze master", category: "badge", icon: "♜", price: 800, rarity: "Epic", description: "You have walked every turn" },
  { id: "legend-badge", label: "Forever legend", category: "badge", icon: "★", price: 1800, rarity: "Legendary", description: "The rarest keepsake in the cabinet" },
];

export const cosmeticCategoryLabels: Record<CosmeticCategory, string> = {
  frame: "Halos",
  theme: "Skies",
  trail: "Trails",
  icon: "Marks",
  badge: "Badges",
};

export const cosmeticRarityColors: Record<CosmeticRarity, string> = {
  Common: "#b4bcc4",
  Uncommon: "#5fc84a",
  Rare: "#3fa9f5",
  Epic: "#b05cf0",
  Legendary: "#f5a02d",
};

export const cosmeticHalos: Record<string, { radius: number; color: string; glow: string }> = {
  "gold-frame": { radius: 0.66, color: "#e4bd6a", glow: "#b18a45" },
  "emerald-halo": { radius: 0.66, color: "#7fd18b", glow: "#2f8a4a" },
  "rose-halo": { radius: 0.66, color: "#f2a0bd", glow: "#b04f78" },
  "frost-halo": { radius: 0.72, color: "#bfe8ff", glow: "#4a9ccc" },
  "solar-crown": { radius: 0.86, color: "#ffd25a", glow: "#e0871c" },
};

export const trailPalettes: Record<string, { colors: string[]; caption: string }> = {
  "starlight-trail": { colors: ["#d6eef0", "#d6eef0", "#d6eef0"], caption: "follow the starlight" },
  "blossom-trail": { colors: ["#ffb7d1", "#ffd9e6", "#ff9ec2"], caption: "follow the petals" },
  "ember-trail": { colors: ["#ff9a52", "#ffd27a", "#ff6b4a"], caption: "follow the embers" },
  "aurora-trail": { colors: ["#7df5d0", "#8fb8ff", "#d99bff"], caption: "follow the aurora" },
};
export const defaultTrailColors = ["#ffdf8c", "#d7f3b5", "#fff0ba"];

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

export const directionLabels: Record<Direction, string> = {
  east: "A",
  north: "B",
  west: "C",
  south: "D",
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

export function luckInfluence(luck: number): number {
  if (!Number.isFinite(luck)) return 0;
  return Math.min(100, Math.max(0, luck)) * 0.007;
}

export function choosePredictedPath(
  options: Direction[],
  bets: Partial<Record<Direction, number>>,
  luck: number,
): Direction {
  if (!options.length) throw new Error("Cannot choose a path from an empty junction.");
  const bonus = luckInfluence(luck);
  const weighted = options.map((direction) => ({
    direction,
    weight: (bets[direction] ?? 0) > 0 ? 1 + bonus : 1,
  }));
  const totalWeight = weighted.reduce((total, option) => total + option.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const option of weighted) {
    roll -= option.weight;
    if (roll < 0) return option.direction;
  }
  return weighted[weighted.length - 1].direction;
}

export function createJunction(id: number, cameFrom?: Direction, luck = 10): Junction {
  const possible = (Object.keys(directionVectors) as Direction[]).filter(
    (direction) => direction !== (cameFrom ? reverseDirection[cameFrom] : undefined),
  );
  const shuffled = [...possible].sort(() => Math.random() - 0.5);
  const count = 2 + Math.floor(Math.random() * 3);
  const options = shuffled.slice(0, count);
  const hazards =
    Math.random() < 0.35 * (1 - luckInfluence(luck))
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
  luck = 10,
): ChestDrop | null {
  const influence = luckInfluence(luck);
  if (Math.random() >= 0.14 * (1 + influence)) return null;
  if (Math.random() < 0.035 * (1 + influence)) {
    const characterChest = rollCharacterChest(ownedIds, available);
    if (characterChest) return characterChest;
  }
  return rollCoinChest();
}

export function rollEvent(luck: number): EventKind {
  const influence = luckInfluence(luck);
  const trapChance = 0.13 * (1 - influence);
  const itemChance = 0.15 * (1 + influence);
  const roll = Math.random();
  if (roll < trapChance) return "trap";
  if (roll < trapChance + itemChance) return "item";
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
