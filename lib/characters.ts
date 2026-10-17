export type CharacterRarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Ultra-rare";

export type CharacterDefinition = {
  id: string;
  name: string;
  rarity: CharacterRarity;
  price: number;
  cloak: string;
  trim: string;
  skin: string;
  species: number;
  variant: number;
  accessory: string;
};

const rarityPrice = (rarity: CharacterRarity, index: number) => {
  const ranges: Record<CharacterRarity, [number, number, number, number]> = {
    Common: [15_000, 28_000, 0, 38],
    Uncommon: [30_000, 49_000, 38, 25],
    Rare: [55_000, 84_000, 63, 16],
    Epic: [90_000, 124_000, 79, 10],
    Legendary: [145_000, 174_000, 89, 5],
    "Ultra-rare": [190_000, 200_000, 94, 2],
  };
  const [minimum, maximum, tierStart, tierSize] = ranges[rarity];
  const tierPosition = Math.max(0, Math.min(1, (index - tierStart) / (tierSize - 1)));
  return Math.round((minimum + (maximum - minimum) * tierPosition) / 500) * 500;
};

const rarityForIndex = (index: number): CharacterRarity => {
  if (index < 38) return "Common";
  if (index < 63) return "Uncommon";
  if (index < 79) return "Rare";
  if (index < 89) return "Epic";
  if (index < 94) return "Legendary";
  return "Ultra-rare";
};

const legacyIdNames = [
  "Aster", "Bramble", "Clover", "Dapple", "Ember", "Fern",
  "Glimmer", "Hazel", "Juniper", "Kestrel", "Lumen", "Maple",
];
const legacyIdTitles = [
  "Moth", "Mender", "Scout", "Keeper", "Dreamer", "Tinkerer", "Wanderer", "Sprite",
];
const senegaleseGivenNames = [
  "Abdoulaye", "Aminata", "Amadou", "Awa", "Babacar", "Coumba",
  "Ibrahima", "Fatou", "Mamadou", "Mariama", "Ousmane", "Ndeye",
];
const senegaleseFamilyNames = ["Ndiaye", "Diop", "Fall", "Ba", "Sow", "Diallo", "Sarr", "Seck"];
const generatedNames = senegaleseGivenNames.flatMap((givenName) =>
  senegaleseFamilyNames.map((familyName) => `${givenName} ${familyName}`),
);
generatedNames[generatedNames.length - 1] = "Abdoulaye D DIAWARA";
const cloaks = ["#6f9b79", "#927bb7", "#bf796c", "#5f91aa", "#bd9656", "#7487b2", "#b47892", "#718f86"];
const trims = ["#efd083", "#d7b6ef", "#f0a99a", "#a9d9df", "#f2c78c", "#c7b5ff", "#ffc0d6", "#b4e0bd"];
const skins = [
  "#f0c79e", "#d9a77f", "#ebbc9e", "#c98f71", "#f1d1ae",
  "#bb866b", "#9b654b", "#7d4b38", "#5e382b", "#40281f",
];
const accessories = ["leaf", "star", "moon", "feather", "flower", "goggles", "crystal", "ribbon"];

const collection = legacyIdNames.flatMap((name, nameIndex) =>
  legacyIdTitles.map((title, titleIndex) => {
    const index = nameIndex * legacyIdTitles.length + titleIndex;
    return {
      id: `${name}-${title}`.toLowerCase(),
      name: generatedNames[index],
      rarity: rarityForIndex(index),
      price: rarityPrice(rarityForIndex(index), index),
      cloak: cloaks[index % cloaks.length],
      trim: trims[(index * 3 + titleIndex) % trims.length],
      skin: skins[(index * 5 + nameIndex) % skins.length],
      species: index % 8,
      variant: index + 4,
      accessory: accessories[(index * 3 + nameIndex) % accessories.length],
    };
  }),
);

export const starterCharacters: CharacterDefinition[] = [
  { id: "pip", name: "Seynabou Gaye", rarity: "Common", price: 15_000, cloak: "#547a63", trim: "#f0ae73", skin: "#e4ba8c", species: 0, variant: 0, accessory: "traveler hat" },
  { id: "moss", name: "Moussa Kane", rarity: "Common", price: 18_000, cloak: "#668b5d", trim: "#c8df91", skin: "#75462f", species: 1, variant: 1, accessory: "leaf crown" },
  { id: "ruby", name: "Aissatou Cisse", rarity: "Rare", price: 58_000, cloak: "#a65360", trim: "#ffc2a2", skin: "#9b5e43", species: 2, variant: 2, accessory: "fox ears" },
  { id: "orbit", name: "Cheikh Thiam", rarity: "Epic", price: 94_000, cloak: "#547d9c", trim: "#a7e2f4", skin: "#edc8a6", species: 3, variant: 3, accessory: "star helmet" },
];

const discoveredCharacters: CharacterDefinition[] = collection.map((character, index) => ({
  ...character,
  price: rarityPrice(character.rarity, index),
}));

export const characters: CharacterDefinition[] = [...starterCharacters, ...discoveredCharacters];
export const characterById = new Map(characters.map((character) => [character.id, character]));
export const characterRarities: CharacterRarity[] = [
  "Common", "Uncommon", "Rare", "Epic", "Legendary", "Ultra-rare",
];

export function characterPortrait(character: CharacterDefinition): string {
  const ears = character.species % 4;
  const earShapes = [
    '<path d="M29 40 22 17l22 13m25 10 7-23-22 13" fill="CLOAK" stroke="SKIN" stroke-width="5" stroke-linejoin="round"/>',
    '<path d="M27 42 20 12l25 19m22 11 7-30-25 19" fill="TRIM" stroke="SKIN" stroke-width="5" stroke-linejoin="round"/>',
    '<path d="M25 38q-8-26 15-19l8 17m13 2q24-26 16-1l-14 8" fill="TRIM" stroke="SKIN" stroke-width="5"/>',
    '<path d="M22 44a26 26 0 0 1 52 0" fill="none" stroke="TRIM" stroke-width="7"/>',
  ];
  const ornaments: Record<string, string> = {
    leaf: '<path d="M47 9Q67 12 53 31 31 25 47 9Zm0 20 2 8" fill="TRIM" stroke="#fff2d1" stroke-width="2"/>',
    star: '<path d="m48 8 5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1z" fill="TRIM"/>',
    moon: '<path d="M57 10Q33 13 42 34q15 6 23-7Q51 28 57 10Z" fill="TRIM"/>',
    feather: '<path d="M61 9Q72 27 48 37L42 30Q57 24 61 9Zm-16 24-5 6m11-14-8 1" fill="TRIM" stroke="#fff2d1" stroke-width="2"/>',
    flower: '<circle cx="48" cy="21" r="6" fill="TRIM"/><circle cx="39" cy="21" r="6" fill="TRIM"/><circle cx="57" cy="21" r="6" fill="TRIM"/><circle cx="48" cy="13" r="6" fill="TRIM"/><circle cx="48" cy="29" r="6" fill="TRIM"/><circle cx="48" cy="21" r="3" fill="#fff2d1"/>',
    goggles: '<path d="M34 18h28v9q-1 9-9 8-6-1-5-9-1 8-7 9-8 1-8-8Z" fill="none" stroke="TRIM" stroke-width="4"/>',
    crystal: '<path d="m48 8 12 13-12 17-12-17z" fill="TRIM" stroke="#fff2d1" stroke-width="2"/><path d="m48 8 1 30" stroke="#fff2d1" stroke-width="2"/>',
    ribbon: '<path d="M47 20Q27 5 33 23l14 5m2-8Q69 5 63 23l-14 5m-1-8v18" fill="TRIM" stroke="#fff2d1" stroke-width="2"/>',
  };
  const ornament = (ornaments[character.accessory] ?? ornaments.star).replaceAll("TRIM", character.trim);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${character.trim}"/><stop offset="1" stop-color="${character.cloak}"/></linearGradient></defs><circle cx="48" cy="48" r="46" fill="url(#bg)" stroke="#24362f" stroke-width="4"/><g>${earShapes[ears].replaceAll("CLOAK", character.cloak).replaceAll("TRIM", character.trim).replaceAll("SKIN", character.skin)}</g><path d="M18 91q3-29 30-29t30 29" fill="${character.cloak}" stroke="#f7e4b2" stroke-width="3"/><ellipse cx="48" cy="47" rx="22" ry="25" fill="${character.skin}"/><path d="M29 43q1-25 20-23 19 2 19 22-10-3-19-13-8 10-20 14Z" fill="${character.cloak}"/>${ornament}<ellipse cx="40" cy="48" rx="2.5" ry="3.5" fill="#263a32"/><ellipse cx="56" cy="48" rx="2.5" ry="3.5" fill="#263a32"/><path d="M43 57q5 4 10 0" fill="none" stroke="#934f4a" stroke-width="2" stroke-linecap="round"/><circle cx="32" cy="54" r="4" fill="#ef9c8b" opacity=".5"/><circle cx="64" cy="54" r="4" fill="#ef9c8b" opacity=".5"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
