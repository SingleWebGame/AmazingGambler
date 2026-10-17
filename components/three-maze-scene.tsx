"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  directionVectors,
  type ChestDrop,
  type Direction,
  type Junction,
} from "@/lib/game";
import { characterById as explorerById, starterCharacters } from "@/lib/characters";

type SceneProps = {
  junction: Junction;
  explorer: { x: number; y: number };
  phase: "walking" | "choosing" | "approaching" | "moving" | "chest" | "result" | "idle";
  previous?: Direction;
  bets: Record<Direction, number>;
  avatar: string;
  characterId: string;
  onPathHoldStart: (direction: Direction) => void;
  onChestReached: () => void;
  theme: string;
  frame: string;
  trail: string;
  worldClockStartedAt: number;
  worldPhase: string;
};

type SceneAssets = {
  scene: THREE.Scene;
  environment: THREE.Group;
  camera: THREE.OrthographicCamera;
  hemisphere: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  renderer: THREE.WebGLRenderer;
  dynamic: THREE.Group;
  paths: THREE.Group;
  chests: THREE.Group;
  chestPoolGroup: THREE.Group;
  chestPool: THREE.Group[];
  chestIconTextures: Record<ChestDrop["kind"], THREE.CanvasTexture>;
  markerMeshes: THREE.Mesh[];
  fireflies: { mesh: THREE.Mesh; phase: number; radius: number; speed: number }[];
  explorer: THREE.Group;
  avatarTexture?: THREE.Texture;
  resizeObserver: ResizeObserver;
  animationFrame: number;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  movement: { from: THREE.Vector3; to: THREE.Vector3; startedAt: number; duration: number; facing: number } | null;
  suspenseStartedAt: number | null;
  chestPickedUp: boolean;
  orientationAngle: number;
  routeIndicatorElements: Partial<Record<Direction, HTMLSpanElement>>;
};

const directions: Direction[] = ["north", "east", "south", "west"];
type EnvironmentBiome = {
  name: string;
  skyDay: string;
  skyNight: string;
  island: string;
  soil: string;
  grass: string;
  center: string;
  path: string;
  pathLine: string;
  foliage: string[];
  scrub: string;
};
const environmentBiomes: EnvironmentBiome[] = [
  {
    name: "Golden Savanna",
    skyDay: "#c4d2b5",
    skyNight: "#344651",
    island: "#ae8550",
    soil: "#79513a",
    grass: "#c6a15d",
    center: "#dfc58e",
    path: "#d7b777",
    pathLine: "#f5e5b6",
    foliage: ["#667747", "#7b8550", "#8a9255"],
    scrub: "#90794b",
  },
  {
    name: "Baobab Woodland",
    skyDay: "#b9d4ca",
    skyNight: "#293f48",
    island: "#718568",
    soil: "#674b3a",
    grass: "#8a9b6c",
    center: "#d3bd8a",
    path: "#c9b187",
    pathLine: "#efe0b8",
    foliage: ["#466548", "#567650", "#6d8657"],
    scrub: "#66794e",
  },
  {
    name: "Sandstone Ruins",
    skyDay: "#d1c7aa",
    skyNight: "#403d43",
    island: "#9b7958",
    soil: "#624535",
    grass: "#a18a61",
    center: "#c5a277",
    path: "#c2a078",
    pathLine: "#ead3a4",
    foliage: ["#62704b", "#788050", "#8b8a58"],
    scrub: "#8a7450",
  },
  {
    name: "Tropical Forest",
    skyDay: "#a9cfc0",
    skyNight: "#203d42",
    island: "#4f765d",
    soil: "#634936",
    grass: "#668b62",
    center: "#cfbd8e",
    path: "#c2ad7f",
    pathLine: "#e8ddb3",
    foliage: ["#315e49", "#417454", "#568358"],
    scrub: "#4c754e",
  },
  {
    name: "Sahel Stone Trail",
    skyDay: "#d4c6a4",
    skyNight: "#414756",
    island: "#a17d54",
    soil: "#704c37",
    grass: "#bb9a64",
    center: "#d4b888",
    path: "#d0ae7e",
    pathLine: "#f1dfb6",
    foliage: ["#66734b", "#7a7b4d", "#8b8552"],
    scrub: "#8b764e",
  },
];
export const environmentForRoom = (room: number) =>
  environmentBiomes[Math.floor(Math.max(0, room - 1) / 5) % environmentBiomes.length];
const rarityGlow = (color: string) => new THREE.MeshStandardMaterial({
  color,
  emissive: color,
  emissiveIntensity: 0.45,
  roughness: 0.4,
  flatShading: true,
});
const reverseDirection: Record<Direction, Direction> = {
  north: "south",
  east: "west",
  south: "north",
  west: "east",
};
const directionOrder: Direction[] = ["north", "east", "south", "west"];
const orientationFor = (cameFrom?: Direction) => {
  const entry = cameFrom ? reverseDirection[cameFrom] : "south";
  return ((2 - directionOrder.indexOf(entry) + 4) % 4) * (Math.PI / 2);
};
const rotatedDirectionPoint = (direction: Direction, distance: number, angle: number) =>
  directionPoint(direction, distance).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
const directionAngles: Record<Direction, number> = {
  north: 0,
  east: Math.PI / 2,
  south: Math.PI,
  west: -Math.PI / 2,
};
const directionPoint = (direction: Direction, distance: number) => {
  const vector = directionVectors[direction];
  return new THREE.Vector3(vector.x * distance, 0, vector.y * distance);
};
const makeMaterial = (color: THREE.ColorRepresentation, roughness = 1) =>
  new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });

function makeLabelTexture(label: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.clearRect(0, 0, 128, 128);
  context.fillStyle = "#fbf2d9";
  context.beginPath();
  context.arc(64, 64, 53, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 8;
  context.beginPath();
  context.arc(64, 64, 48, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "#335347";
  context.font = "700 57px Georgia";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 64, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addHedge(
  parent: THREE.Group,
  x: number,
  z: number,
  scale: number,
  tint: THREE.ColorRepresentation,
) {
  const hedge = new THREE.Group();
  hedge.position.set(x, 0.11, z);
  const body = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.82 * scale, 0),
    makeMaterial(tint),
  );
  body.scale.set(1.24, 0.78, 0.88);
  body.position.y = 0.54 * scale;
  body.castShadow = true;
  hedge.add(body);
  const highlight = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.47 * scale, 0),
    makeMaterial("#90aa70"),
  );
  highlight.position.set(-0.18 * scale, 0.9 * scale, -0.08 * scale);
  highlight.castShadow = true;
  hedge.add(highlight);
  parent.add(hedge);
}

function addAcacia(parent: THREE.Group, x: number, z: number, scale: number, palette: string[], seed: number) {
  const tree = new THREE.Group();
  tree.position.set(x, 0.1, z);
  tree.scale.setScalar(scale);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.24, 1.75, 5), makeMaterial("#76533a"));
  trunk.position.y = 0.86;
  trunk.castShadow = true;
  tree.add(trunk);
  for (let branch = -1; branch <= 1; branch++) {
    const canopy = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.78 + (seed % 3) * 0.06, 0),
      makeMaterial(palette[(seed + branch + 3) % palette.length]),
    );
    canopy.scale.set(1.38, 0.39, 0.9);
    canopy.position.set(branch * 0.47, 1.92 + (seed % 2) * 0.12, branch * 0.15);
    canopy.castShadow = true;
    tree.add(canopy);
  }
  parent.add(tree);
}

function addBaobab(parent: THREE.Group, x: number, z: number, scale: number, palette: string[], seed: number) {
  const tree = new THREE.Group();
  tree.position.set(x, 0.1, z);
  tree.scale.setScalar(scale);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.9, 2.65, 7), makeMaterial("#805c43"));
  trunk.position.y = 1.3;
  trunk.castShadow = true;
  tree.add(trunk);
  for (let branch = 0; branch < 5; branch++) {
    const angle = branch * Math.PI * 0.4 + seed;
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 1.05, 5), makeMaterial("#805c43"));
    limb.position.set(Math.cos(angle) * 0.73, 2.6, Math.sin(angle) * 0.73);
    limb.rotation.z = Math.cos(angle) * -0.68;
    limb.rotation.x = Math.sin(angle) * 0.68;
    limb.castShadow = true;
    tree.add(limb);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 0), makeMaterial(palette[branch % palette.length]));
    crown.scale.set(1.1, 0.72, 1);
    crown.position.set(Math.cos(angle) * 1.08, 3, Math.sin(angle) * 1.08);
    crown.castShadow = true;
    tree.add(crown);
  }
  parent.add(tree);
}

function addPalm(parent: THREE.Group, x: number, z: number, scale: number, palette: string[], seed: number) {
  const palm = new THREE.Group();
  palm.position.set(x, 0.1, z);
  palm.scale.setScalar(scale);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.22, 2.9, 5), makeMaterial("#866142"));
  trunk.position.y = 1.42;
  trunk.rotation.z = (seed % 2 ? 1 : -1) * 0.08;
  trunk.castShadow = true;
  palm.add(trunk);
  for (let leaf = 0; leaf < 7; leaf++) {
    const angle = leaf * Math.PI * 2 / 7;
    const frond = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 2, 4),
      makeMaterial(palette[leaf % palette.length]),
    );
    frond.position.set(Math.cos(angle) * 0.7, 2.94 - (leaf % 3) * 0.12, Math.sin(angle) * 0.7);
    frond.rotation.z = -Math.cos(angle) * 0.95;
    frond.rotation.x = Math.sin(angle) * 0.95;
    frond.castShadow = true;
    palm.add(frond);
  }
  parent.add(palm);
}

function addStoneRuin(parent: THREE.Group, x: number, z: number, scale: number, seed: number) {
  const ruin = new THREE.Group();
  ruin.position.set(x, 0.1, z);
  ruin.rotation.y = seed * 0.73;
  const sandstone = makeMaterial(seed % 2 ? "#a77a55" : "#bd9168");
  const pillarHeight = 1.4 + (seed % 3) * 0.34;
  const pillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.62 * scale, pillarHeight * scale, 0.6 * scale),
    sandstone,
  );
  pillar.position.y = pillarHeight * scale / 2;
  pillar.castShadow = true;
  ruin.add(pillar);
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.9 * scale, 0.25 * scale, 0.82 * scale),
    makeMaterial("#c39a6f"),
  );
  cap.position.y = pillarHeight * scale;
  cap.castShadow = true;
  ruin.add(cap);
  const carving = new THREE.Mesh(
    new THREE.BoxGeometry(0.06 * scale, 0.52 * scale, 0.035 * scale),
    makeMaterial("#785843"),
  );
  carving.position.set(0, pillarHeight * scale * 0.53, 0.31 * scale);
  ruin.add(carving);
  parent.add(ruin);
}

function buildForest(parent: THREE.Group, biome: EnvironmentBiome) {
  const foliage = biome.foliage;
  const count = biome.name === "Tropical Forest" ? 30 : biome.name === "Sandstone Ruins" ? 12 : 20;
  for (let i = 0; i < count; i++) {
    const angle = (i * 2.399963) % (Math.PI * 2);
    const radius = (biome.name === "Tropical Forest" ? 7.2 : 8.1) + (i % 5) * 0.62;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.72;
    const scale = 0.78 + (i % 4) * 0.13;
    if (biome.name === "Baobab Woodland") addBaobab(parent, x, z, scale, foliage, i);
    else if (biome.name === "Tropical Forest") addPalm(parent, x, z, scale, foliage, i);
    else addAcacia(parent, x, z, scale, foliage, i);
  }
  const scrubCount = biome.name === "Tropical Forest" ? 25 : biome.name === "Sandstone Ruins" ? 13 : 20;
  for (let i = 0; i < scrubCount; i++) {
    const angle = i * 2.399963 + 0.24;
    const radius = 4.9 + (i % 5) * 0.43;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.7;
    if (biome.name === "Sandstone Ruins" && i % 2 === 0) {
      addStoneRuin(parent, x, z, 0.76 + (i % 3) * 0.12, i);
    } else {
      addHedge(parent, x, z, 0.56 + (i % 3) * 0.1, i % 2 ? biome.scrub : foliage[i % foliage.length]);
    }
  }
  if (biome.name === "Sahel Stone Trail") {
    for (let i = 0; i < 14; i++) {
      const angle = i * 2.399963 + 0.58;
      const radius = 7.4 + (i % 4) * 0.67;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.56 + (i % 3) * 0.14, 0),
        makeMaterial(i % 2 ? "#9e7955" : "#b18a5e"),
      );
      rock.scale.set(1.28, 0.8, 1);
      rock.position.set(Math.cos(angle) * radius, 0.36, Math.sin(angle) * radius * 0.7);
      rock.castShadow = true;
      parent.add(rock);
    }
  }
}

function buildEnvironment(parent: THREE.Group, biome: EnvironmentBiome) {
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(11, 12.2, 1.15, 10, 1),
    makeMaterial(biome.island),
  );
  island.position.y = -0.48;
  island.receiveShadow = true;
  island.castShadow = true;
  parent.add(island);
  const soilBand = new THREE.Mesh(
    new THREE.CylinderGeometry(11.5, 12.2, 0.22, 10, 1, true),
    makeMaterial(biome.soil),
  );
  soilBand.position.y = -0.27;
  parent.add(soilBand);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(11, 10), makeMaterial(biome.grass));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.105;
  ground.receiveShadow = true;
  parent.add(ground);
  const clearing = new THREE.Mesh(
    new THREE.CylinderGeometry(2.03, 2.25, 0.14, 9),
    makeMaterial(biome.center),
  );
  clearing.position.y = 0.17;
  clearing.receiveShadow = true;
  parent.add(clearing);
  buildForest(parent, biome);
}

function buildPath(scene: THREE.Group, direction: Direction, open: boolean, biome: EnvironmentBiome) {
  const arm = new THREE.Group();
  const vector = directionPoint(direction, 1);
  const lane = new THREE.Mesh(
    new THREE.BoxGeometry(2.45, 0.1, 8.9),
    makeMaterial(biome.path),
  );
  lane.position.set(vector.x * 4.45, 0.19, vector.z * 4.45);
  if (direction === "east" || direction === "west") lane.rotation.y = Math.PI / 2;
  lane.receiveShadow = true;
  arm.add(lane);
  const centerLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.012, 6.7),
    makeMaterial(biome.pathLine),
  );
  centerLine.position.set(vector.x * 4.35, 0.25, vector.z * 4.35);
  if (direction === "east" || direction === "west") centerLine.rotation.y = Math.PI / 2;
  arm.add(centerLine);

  for (const side of [-1, 1]) {
    for (let segment = 0; segment < 5; segment++) {
      const distance = 2.35 + segment * 1.08;
      const sideOffset = side * 1.74;
      const x = direction === "east" || direction === "west" ? vector.x * distance : sideOffset;
      const z = direction === "north" || direction === "south" ? vector.z * distance : sideOffset;
      if (open && distance > 6.7) continue;
      const bushMaterial = makeMaterial(segment % 2 ? biome.scrub : biome.foliage[segment % biome.foliage.length]);
      const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.53, 0), bushMaterial);
      bush.scale.set(1.16, 0.85 + (segment % 2) * 0.1, 0.95);
      bush.position.set(x, 0.52, z);
      bush.castShadow = true;
      arm.add(bush);
    }
  }
  if (!open) {
    const barrier = new THREE.Mesh(
      new THREE.BoxGeometry(2.05, 0.62, 0.35),
      makeMaterial(biome.scrub),
    );
    barrier.position.set(vector.x * 7.7, 0.52, vector.z * 7.7);
    barrier.castShadow = true;
    arm.add(barrier);
  }
  scene.add(arm);
}

function makeChestTypeTexture(kind: ChestDrop["kind"]): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);

  context.fillStyle = "#fff8e8";
  context.beginPath();
  context.arc(64, 64, 57, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = kind === "coins" ? "#e3b956" : "#b996d5";
  context.lineWidth = 8;
  context.stroke();
  if (kind === "coins") {
    context.fillStyle = "#e4b74f";
    context.beginPath();
    context.arc(64, 64, 39, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#f8e4a6";
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = "#fff8e8";
    context.font = "700 58px Georgia";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("$", 64, 66);
  } else {
    context.fillStyle = "#80629f";
    context.beginPath();
    context.arc(64, 43, 19, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.ellipse(64, 95, 34, 27, 0, Math.PI, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildChest(
  parent: THREE.Group,
  poolGroup: THREE.Group,
  pool: THREE.Group[],
  direction: Direction,
  drop: ChestDrop,
  iconTextures: Record<ChestDrop["kind"], THREE.CanvasTexture>,
) {
  const chest = pool.pop() ?? new THREE.Group();
  poolGroup.remove(chest);
  const pooled = chest.userData.hasChestModel === true;
  if (!pooled) {
    const model = new THREE.Group();
    model.scale.setScalar(0.5);
    const wood = new THREE.MeshStandardMaterial({ color: "#80532f", roughness: 0.72, flatShading: true });
    const lidWood = new THREE.MeshStandardMaterial({ color: "#a36e3c", roughness: 0.65, flatShading: true });
    const metal = rarityGlow(drop.color);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.54, 0.62), wood);
    body.position.y = 0.32;
    body.castShadow = true;
    model.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.25, 0.66), lidWood);
    lid.position.y = 0.69;
    lid.castShadow = true;
    model.add(lid);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.79, 0.69), metal);
    band.position.set(0, 0.49, 0);
    band.castShadow = true;
    model.add(band);
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.2, 0.07), metal);
    clasp.position.set(0, 0.39, 0.35);
    model.add(clasp);
    const auraMaterial = new THREE.MeshBasicMaterial({ color: drop.color, transparent: true, opacity: 0.72 });
    const aura = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 5, 16), auraMaterial);
    aura.rotation.x = Math.PI / 2;
    aura.position.y = 0.08;
    model.add(aura);
    chest.add(model);
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: iconTextures[drop.kind],
      transparent: true,
      depthWrite: false,
    }));
    icon.position.y = 1.13;
    icon.scale.set(0.56, 0.56, 1);
    icon.renderOrder = 2;
    icon.material.userData.sharedChestIcon = true;
    chest.add(icon);
    chest.userData.metalMaterial = metal;
    chest.userData.auraMaterial = auraMaterial;
    chest.userData.iconMaterial = icon.material;
    chest.userData.hasChestModel = true;
  } else {
    const metal = chest.userData.metalMaterial as THREE.MeshStandardMaterial;
    metal.color.set(drop.color);
    metal.emissive.set(drop.color);
    const aura = chest.userData.auraMaterial as THREE.MeshBasicMaterial;
    aura.color.set(drop.color);
    const icon = chest.userData.iconMaterial as THREE.SpriteMaterial;
    icon.map = iconTextures[drop.kind];
    icon.needsUpdate = true;
  }
  chest.userData.direction = direction;
  chest.userData.animationPhase = directions.indexOf(direction) * 1.3;
  const point = directionPoint(direction, 1.95);
  chest.position.set(point.x, 0.22, point.z);
  chest.visible = true;
  parent.add(chest);
}

function recycleChest(chest: THREE.Group, active: THREE.Group, poolGroup: THREE.Group, pool: THREE.Group[]) {
  active.remove(chest);
  chest.visible = false;
  poolGroup.add(chest);
  pool.push(chest);
}

function buildExplorer(scene: THREE.Scene, avatar: string, frame: string, characterId: string) {
  const character = explorerById.get(characterId) ?? starterCharacters[0];
  const explorer = new THREE.Group();
  const bodyMaterial = makeMaterial(character.trim);
  const cloakMaterial = makeMaterial(character.cloak);
  const skinMaterial = makeMaterial(character.skin);
  const bodyGeometry = character.variant % 4 === 0
    ? new THREE.CylinderGeometry(0.25, 0.38, 0.78, 6)
    : character.variant % 4 === 1
      ? new THREE.ConeGeometry(0.42, 0.92, 6)
      : character.variant % 4 === 2
        ? new THREE.DodecahedronGeometry(0.47, 0)
        : new THREE.CylinderGeometry(0.4, 0.29, 0.74, 5);
  const body = new THREE.Mesh(bodyGeometry, cloakMaterial);
  body.position.y = 0.75;
  body.castShadow = true;
  explorer.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.29 + (character.variant % 4) * 0.025, 1), skinMaterial);
  head.position.y = 1.34;
  head.castShadow = true;
  explorer.add(head);
  if (character.species === 3) {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 6), new THREE.MeshStandardMaterial({
      color: character.trim, transparent: true, opacity: 0.45, roughness: 0.25, flatShading: true,
    }));
    helmet.position.y = 1.35;
    explorer.add(helmet);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.08), makeMaterial("#a9e4ee", 0.3));
    visor.position.set(0, 1.35, -0.43);
    explorer.add(visor);
  } else if (character.species === 2 || character.species === 5) {
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, character.species === 2 ? 0.55 : 0.34, 5), bodyMaterial);
      ear.position.set(side * 0.22, 1.69, 0);
      ear.rotation.z = side * -0.2;
      ear.castShadow = true;
      explorer.add(ear);
    }
  } else if (character.species === 1 || character.species === 4) {
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 4), bodyMaterial);
      leaf.position.set(side * 0.26, 1.69, 0.02);
      leaf.rotation.z = side * -0.42;
      explorer.add(leaf);
    }
  } else {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.37, 0.56, 5), bodyMaterial);
    hat.position.y = 1.73;
    hat.rotation.y = -0.24;
    hat.castShadow = true;
    explorer.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.075, 8), bodyMaterial);
    brim.position.y = 1.51;
    explorer.add(brim);
  }
  const packColor = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.46, 0.27), makeMaterial(character.cloak));
  packColor.position.set(0, 0.91, 0.34);
  packColor.castShadow = true;
  explorer.add(packColor);
  const sash = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.1 + (character.variant % 3) * 0.035, 0.43),
    bodyMaterial,
  );
  sash.position.y = 0.83;
  sash.rotation.z = character.variant % 2 ? 0.2 : -0.2;
  explorer.add(sash);
  const footMaterial = makeMaterial("#46392d");
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.3), footMaterial);
    foot.position.set(side * 0.18, 0.27, 0.03);
    explorer.add(foot);
  }
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(frame === "gold-frame" ? 0.66 : 0.52, 0.035, 5, 16),
    new THREE.MeshStandardMaterial({
      color: frame === "gold-frame" ? "#e4bd6a" : "#f0dfaf",
      emissive: "#b18a45",
      emissiveIntensity: 0.3,
      roughness: 0.7,
    }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 2.13;
  explorer.add(halo);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 16),
    new THREE.MeshBasicMaterial({ color: "#233a2b", transparent: true, opacity: 0.2 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.14;
  shadow.scale.set(1.3, 0.7, 1);
  explorer.add(shadow);

  const portrait = document.createElement("canvas");
  portrait.width = 128;
  portrait.height = 128;
  const context = portrait.getContext("2d");
  if (context) {
    context.fillStyle = "#efd59b";
    context.beginPath();
    context.arc(64, 64, 62, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#385547";
    context.font = "700 58px Georgia";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("✦", 64, 68);
    const texture = new THREE.CanvasTexture(portrait);
    texture.colorSpace = THREE.SRGBColorSpace;
    const badge = new THREE.Mesh(
      new THREE.CircleGeometry(0.23, 20),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    badge.position.set(0.45, 1.39, 0.34);
    explorer.add(badge);
    const image = new Image();
    image.onload = () => {
      if (!explorer.parent) return;
      context.clearRect(0, 0, portrait.width, portrait.height);
      context.save();
      context.beginPath();
      context.arc(64, 64, 61, 0, Math.PI * 2);
      context.clip();
      context.drawImage(image, 3, 3, 122, 122);
      context.restore();
      texture.needsUpdate = true;
    };
    image.src = avatar;
  }
  scene.add(explorer);
  return explorer;
}

function buildMarkers(
  parent: THREE.Group,
  junction: Junction,
  bets: Record<Direction, number>,
  markerMeshes: THREE.Mesh[],
) {
  parent.children.slice().forEach((child) => {
    parent.remove(child);
    child.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        object.geometry?.dispose();
        const material = object.material;
        const materials = Array.isArray(material) ? material : [material];
        materials.forEach((entry) => {
          if (entry instanceof THREE.SpriteMaterial && entry.map) entry.map.dispose();
          entry.dispose();
        });
      }
    });
  });
  markerMeshes.length = 0;
  junction.options.forEach((direction, index) => {
    const point = directionPoint(direction, 6.25);
    const selected = bets[direction] > 0;
    const dangerous = junction.hazards.includes(direction);
    const color = selected ? "#ddad56" : dangerous ? "#c97e68" : "#819c72";
    const group = new THREE.Group();
    group.position.set(point.x, 0.26, point.z);
    group.rotation.y = directionAngles[direction] * 0.09;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.69, 0.75, 0.15, 7),
      new THREE.MeshStandardMaterial({
        color: selected ? "#eacb82" : "#f5ebcf",
        emissive: selected ? "#b1792c" : "#000000",
        emissiveIntensity: selected ? 0.24 : 0,
        roughness: 0.68,
        flatShading: true,
      }),
    );
    base.position.y = 0.2;
    base.castShadow = true;
    base.userData.direction = direction;
    base.userData.dangerous = dangerous;
    group.add(base);
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(0.52, 7),
      new THREE.MeshBasicMaterial({ color }),
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.29;
    group.add(inner);
    const letterTexture = makeLabelTexture(String.fromCharCode(65 + index), color);
    if (letterTexture) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: letterTexture, transparent: true, depthWrite: false }),
      );
      sprite.scale.set(0.8, 0.8, 1);
      sprite.position.y = 0.91;
      sprite.userData.direction = direction;
      group.add(sprite);
    }
    if (dangerous) {
      const danger = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.17, 0),
        new THREE.MeshStandardMaterial({ color: "#d78366", emissive: "#8c3829", emissiveIntensity: 0.28 }),
      );
      danger.position.set(0.51, 0.77, -0.42);
      danger.userData.direction = direction;
      group.add(danger);
    }
    group.userData.direction = direction;
    parent.add(group);
    markerMeshes.push(base);
  });
}

function updateMarkerBets(markerMeshes: THREE.Mesh[], bets: Record<Direction, number>) {
  markerMeshes.forEach((marker) => {
    const direction = marker.userData.direction as Direction;
    const selected = bets[direction] > 0;
    const dangerous = Boolean(marker.userData.dangerous);
    const material = marker.material as THREE.MeshStandardMaterial;
    material.color.set(selected ? "#eacb82" : "#f5ebcf");
    material.emissive.set(selected ? "#b1792c" : "#000000");
    material.emissiveIntensity = selected ? 0.24 : 0;
    const inner = marker.parent?.children[1];
    if (inner instanceof THREE.Mesh && inner.material instanceof THREE.MeshBasicMaterial) {
      inner.material.color.set(selected ? "#ddad56" : dangerous ? "#c97e68" : "#819c72");
    }
  });
}

export default function ThreeMazeScene({
  junction,
  explorer: explorerPosition,
  phase,
  previous,
  bets,
  avatar,
  characterId,
  onPathHoldStart,
  onChestReached,
  theme,
  frame,
  trail,
  worldClockStartedAt,
  worldPhase,
}: SceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const routeIndicatorElementsRef = useRef<Partial<Record<Direction, HTMLSpanElement>>>({});
  const assetsRef = useRef<SceneAssets | null>(null);
  const holdStartRef = useRef(onPathHoldStart);
  const propsRef = useRef({ junction, explorerPosition, phase, previous, bets, avatar, characterId, onChestReached, theme, frame, worldClockStartedAt, worldPhase });
  const [graphicsError, setGraphicsError] = useState(false);
  holdStartRef.current = onPathHoldStart;
  propsRef.current = { junction, explorerPosition, phase, previous, bets, avatar, characterId, onChestReached, theme, frame, worldClockStartedAt, worldPhase };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch (error) {
      console.error("Unable to initialize the 3D labyrinth.", error);
      setGraphicsError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.className = "maze-canvas";
    renderer.domElement.setAttribute("aria-label", "Interactive low-poly 3D labyrinth crossroads");
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const initialBiome = environmentForRoom(propsRef.current.junction.id + 1);
    scene.background = new THREE.Color(propsRef.current.theme === "moonlit-maze" ? initialBiome.skyNight : initialBiome.skyDay);
    scene.fog = new THREE.Fog(scene.background, 22, 43);
    const camera = new THREE.OrthographicCamera(-11, 11, 7.6, -7.6, 0.1, 100);
    camera.position.set(0, 17, 20);
    camera.lookAt(0, 0, 0);
    const hemisphere = new THREE.HemisphereLight("#fff3d7", "#526d53", 2.25);
    scene.add(hemisphere);
    const sun = new THREE.DirectionalLight("#fff0c8", 3.2);
    sun.position.set(-6, 13, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.bias = -0.00015;
    scene.add(sun);

    const environment = new THREE.Group();
    environment.userData.biomeName = initialBiome.name;
    scene.add(environment);
    buildEnvironment(environment, initialBiome);
    const paths = new THREE.Group();
    scene.add(paths);
    for (const direction of directions) buildPath(paths, direction, false, initialBiome);
    const chests = new THREE.Group();
    scene.add(chests);
    const chestPoolGroup = new THREE.Group();
    chestPoolGroup.visible = false;
    scene.add(chestPoolGroup);
    const chestIconTextures = {
      coins: makeChestTypeTexture("coins"),
      character: makeChestTypeTexture("character"),
    };
    const dynamic = new THREE.Group();
    scene.add(dynamic);
    const markerMeshes: THREE.Mesh[] = [];
    const explorer = buildExplorer(scene, propsRef.current.avatar, propsRef.current.frame, propsRef.current.characterId);
    const startingPoint = propsRef.current.phase === "moving"
      ? new THREE.Vector3()
      : propsRef.current.phase === "chest" && propsRef.current.previous
        ? rotatedDirectionPoint(propsRef.current.previous, 1.95, orientationFor(propsRef.current.previous))
        : directionPoint("south", 3.05);
    explorer.position.copy(startingPoint);
    explorer.position.y = 0.1;
    explorer.rotation.y = directionAngles.north;
    const fireflies: SceneAssets["fireflies"] = [];
    const fireflyColors = ["#ffdf8c", "#d7f3b5", "#fff0ba"];
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.045 + (i % 3) * 0.012, 5, 4),
        new THREE.MeshBasicMaterial({ color: fireflyColors[i % fireflyColors.length] }),
      );
      const phaseOffset = i * 1.91;
      mesh.position.set(Math.cos(phaseOffset) * (4.2 + (i % 4)), 0.55 + (i % 5) * 0.32, Math.sin(phaseOffset) * (3.4 + (i % 3)));
      scene.add(mesh);
      fireflies.push({ mesh, phase: phaseOffset, radius: 4.3 + (i % 5) * 0.58, speed: 0.12 + (i % 4) * 0.025 });
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const pickDirection = (event: PointerEvent) => {
      if (propsRef.current.phase !== "choosing" || event.button !== 0) return;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markerMeshes, false);
      const hit = hits.find((entry) => entry.object.userData.direction);
      if (hit) holdStartRef.current(hit.object.userData.direction as Direction);
    };
    const showPointer = (event: PointerEvent) => {
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      renderer.domElement.style.cursor = raycaster.intersectObjects(markerMeshes, false).length ? "pointer" : "grab";
    };
    renderer.domElement.addEventListener("pointerdown", pickDirection);
    renderer.domElement.addEventListener("pointermove", showPointer);

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const aspect = width / height;
      const frustumHeight = aspect < 1 ? 16 : 15.2;
      camera.left = (-frustumHeight * aspect) / 2;
      camera.right = (frustumHeight * aspect) / 2;
      camera.top = frustumHeight / 2;
      camera.bottom = -frustumHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const assets: SceneAssets = {
      scene,
      environment,
      camera,
      hemisphere,
      sun,
      renderer,
      dynamic,
      paths,
      chests,
      chestPoolGroup,
      chestPool: [],
      chestIconTextures,
      markerMeshes,
      fireflies,
      explorer,
      resizeObserver,
      animationFrame: 0,
      raycaster,
      pointer,
      movement: null,
      suspenseStartedAt: null,
      chestPickedUp: false,
      orientationAngle: orientationFor(propsRef.current.previous),
      routeIndicatorElements: routeIndicatorElementsRef.current,
    };
    assetsRef.current = assets;
    let elapsed = 0;
    const daySky = new THREE.Color();
    const nightSky = new THREE.Color("#253b4a");
    const dayHemi = new THREE.Color("#fff3d7");
    const nightHemi = new THREE.Color("#a9c2ec");
    const dayGround = new THREE.Color("#526d53");
    const nightGround = new THREE.Color("#23364c");
    const daySun = new THREE.Color("#fff0c8");
    const nightSun = new THREE.Color("#b5c9ff");
    const skyColor = new THREE.Color();
    const hemiColor = new THREE.Color();
    const groundColor = new THREE.Color();
    const sunColor = new THREE.Color();
    const animate = () => {
      assets.animationFrame = window.requestAnimationFrame(animate);
      elapsed += 0.01;
      assets.fireflies.forEach(({ mesh, phase: offset, radius, speed }, index) => {
        const t = elapsed * speed + offset;
        mesh.position.set(Math.cos(t) * radius, 0.48 + Math.sin(t * 1.7) * 0.42 + (index % 3) * 0.14, Math.sin(t) * radius * 0.66);
      });
      assets.chests.children.forEach((chest) => {
        const phase = Number(chest.userData.animationPhase) || 0;
        chest.position.y = 0.22 + Math.sin(elapsed * 1.8 + phase) * 0.08;
        chest.rotation.y = elapsed * 0.45 + phase;
      });
      const current = propsRef.current;
      const now = performance.now();
      const movement = assets.movement;
      if (movement && current.phase !== "chest") {
        const progress = Math.min(1, (now - movement.startedAt) / movement.duration);
        const eased = progress * progress * (3 - 2 * progress);
        assets.explorer.position.lerpVectors(movement.from, movement.to, eased);
        assets.explorer.position.y = 0.1 + Math.sin(progress * Math.PI) * 0.1;
        assets.explorer.rotation.y = movement.facing;
        const chestOnPath = current.previous && current.junction.chests[current.previous];
        if (chestOnPath && !assets.chestPickedUp && progress >= 0.6) {
          assets.chestPickedUp = true;
          const chest = assets.chests.children.find(
            (entry) => entry.userData.direction === current.previous,
          );
          if (chest instanceof THREE.Group) {
            recycleChest(chest, assets.chests, assets.chestPoolGroup, assets.chestPool);
          }
          current.onChestReached();
        }
        if (progress >= 1) {
          assets.explorer.position.copy(movement.to);
          assets.explorer.position.y = 0.1;
          assets.movement = null;
        }
      } else {
        assets.explorer.position.y = 0.08 + Math.sin(elapsed * 1.8) * 0.1;
      }
      const suspenseStartedAt = assets.suspenseStartedAt;
      if (suspenseStartedAt !== null && (current.phase === "approaching" || current.phase === "moving" || current.phase === "chest")) {
        const zoomProgress = Math.max(0, Math.min(1, (now - suspenseStartedAt - 2000) / 2400));
        const easedZoom = zoomProgress * zoomProgress * (3 - 2 * zoomProgress);
        camera.zoom += (1.32 - camera.zoom) * easedZoom * 0.06;
      } else {
        camera.zoom += (1 - camera.zoom) * 0.035;
        if (current.phase === "result") assets.suspenseStartedAt = null;
      }
      const indicatorRect = renderer.domElement.getBoundingClientRect();
      const panelTop = document.querySelector<HTMLElement>(".next-junction-panel")?.getBoundingClientRect().top;
      const shortcutsBottom = document.querySelector<HTMLElement>(".world-shortcuts")?.getBoundingClientRect().bottom;
      const indicatorPosition = new THREE.Vector3();
      current.junction.options.forEach((direction) => {
        const indicator = assets.routeIndicatorElements[direction];
        if (!indicator) return;
        indicatorPosition.copy(directionPoint(direction, 6.25));
        indicatorPosition.y = 0.65;
        assets.dynamic.localToWorld(indicatorPosition);
        indicatorPosition.project(camera);
        const margin = 48;
        const x = (indicatorPosition.x * 0.5 + 0.5) * indicatorRect.width;
        const y = (-indicatorPosition.y * 0.5 + 0.5) * indicatorRect.height;
        const clampedX = Math.max(margin, Math.min(indicatorRect.width - margin, x));
        const minY = Math.max(margin, (shortcutsBottom ?? 0) - indicatorRect.top + 18);
        const maxY = Math.max(minY, Math.min(indicatorRect.height - margin, (panelTop ?? indicatorRect.bottom) - indicatorRect.top - 38));
        const clampedY = Math.max(minY, Math.min(maxY, y));
        const edge = x < margin ? "◀" : x > indicatorRect.width - margin ? "▶" : y < minY ? "▲" : y > maxY ? "▼" : "";
        indicator.style.left = `${clampedX}px`;
        indicator.style.top = `${clampedY}px`;
        indicator.dataset.edge = edge;
        indicator.style.visibility = indicatorPosition.z >= -1 && indicatorPosition.z <= 1 ? "visible" : "hidden";
      });
      const cycleMs = 660_000;
      const clockTime = ((Date.now() - current.worldClockStartedAt) % cycleMs + cycleMs) % cycleMs;
      let nightBlend = 0;
      if (clockTime >= 300_000 && clockTime < 330_000) {
        const blend = (clockTime - 300_000) / 30_000;
        nightBlend = blend * blend * (3 - 2 * blend);
      } else if (clockTime >= 330_000 && clockTime < 630_000) {
        nightBlend = 1;
      } else if (clockTime >= 630_000) {
        const blend = (clockTime - 630_000) / 30_000;
        nightBlend = 1 - blend * blend * (3 - 2 * blend);
      }
      const biome = environmentForRoom(current.junction.id + 1);
      const moonlit = current.theme === "moonlit-maze";
      daySky.set(moonlit ? biome.skyNight : biome.skyDay);
      nightSky.set(moonlit ? "#101a2a" : biome.skyNight);
      skyColor.lerpColors(daySky, nightSky, nightBlend);
      assets.scene.background = skyColor;
      if (assets.scene.fog instanceof THREE.Fog) assets.scene.fog.color.copy(skyColor);
      assets.hemisphere.color.copy(hemiColor.lerpColors(dayHemi, nightHemi, nightBlend));
      assets.hemisphere.groundColor.copy(groundColor.lerpColors(dayGround, nightGround, nightBlend));
      assets.hemisphere.intensity = 2.25 + (0.85 - 2.25) * nightBlend;
      assets.sun.color.copy(sunColor.lerpColors(daySun, nightSun, nightBlend));
      assets.sun.intensity = 3.2 + (0.65 - 3.2) * nightBlend;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      window.cancelAnimationFrame(assets.animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pickDirection);
      renderer.domElement.removeEventListener("pointermove", showPointer);
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
          object.geometry?.dispose();
          if (object instanceof THREE.Sprite && !object.material.userData.sharedChestIcon) {
            object.material.map?.dispose();
          }
          const material = object.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material.dispose();
        }
      });
      Object.values(assets.chestIconTextures).forEach((texture) => texture.dispose());
      assetsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const assets = assetsRef.current;
    if (!assets) return;
    const { junction: nextJunction } = propsRef.current;
    const biome = environmentForRoom(nextJunction.id + 1);
    if (assets.environment.userData.biomeName !== biome.name) {
      while (assets.environment.children.length) {
        const decoration = assets.environment.children[0];
        assets.environment.remove(decoration);
        decoration.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        });
      }
      buildEnvironment(assets.environment, biome);
      assets.environment.userData.biomeName = biome.name;
    }
    while (assets.paths.children.length) {
      const path = assets.paths.children[0];
      assets.paths.remove(path);
      path.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
    }
    const cameFrom = previous ? reverseDirection[previous] : "south";
    assets.orientationAngle = orientationFor(previous);
    assets.paths.rotation.y = assets.orientationAngle;
    assets.dynamic.rotation.y = assets.orientationAngle;
    for (const direction of directions) {
      buildPath(assets.paths, direction, nextJunction.options.includes(direction) || direction === cameFrom, biome);
    }
    while (assets.chests.children.length) {
      const chest = assets.chests.children[0];
      recycleChest(chest as THREE.Group, assets.chests, assets.chestPoolGroup, assets.chestPool);
    }
    for (const [direction, chest] of Object.entries(nextJunction.chests)) {
      if (!chest) continue;
      if (propsRef.current.phase === "chest" && direction === propsRef.current.previous) continue;
      buildChest(
        assets.chests,
        assets.chestPoolGroup,
        assets.chestPool,
        direction as Direction,
        chest,
        assets.chestIconTextures,
      );
    }
    assets.chests.rotation.y = assets.orientationAngle;
    const selectedChest = propsRef.current.previous;
    assets.chests.children.forEach((chest) => {
      chest.visible = !(propsRef.current.phase === "chest" && chest.userData.direction === selectedChest);
    });
    buildMarkers(assets.dynamic, nextJunction, propsRef.current.bets, assets.markerMeshes);
  }, [junction.id, junction.options, junction.hazards, junction.chests]);

  useEffect(() => {
    const assets = assetsRef.current;
    if (assets) updateMarkerBets(assets.markerMeshes, bets);
  }, [bets]);

  useEffect(() => {
    const assets = assetsRef.current;
    if (!assets) return;
    assets.chests.children.forEach((chest) => {
      chest.visible = !(phase === "chest" && chest.userData.direction === previous);
    });
  }, [phase, previous, junction.id]);

  useEffect(() => {
    const assets = assetsRef.current;
    if (!assets) return;
    const now = performance.now();
    if (phase === "approaching") {
      assets.suspenseStartedAt = now;
      assets.chestPickedUp = false;
      assets.movement = {
        from: assets.explorer.position.clone(),
        to: new THREE.Vector3(0, 0, 0),
        startedAt: now,
        duration: 2600,
        facing: directionAngles.north,
      };
      return;
    }
    if (phase === "moving" && previous) {
      const suspenseStartedAt = assets.suspenseStartedAt ?? now - 2600;
      assets.suspenseStartedAt = suspenseStartedAt;
      assets.movement = {
        from: assets.explorer.position.clone(),
        to: rotatedDirectionPoint(previous, 3.05, assets.orientationAngle),
        startedAt: now,
        duration: 2100,
        facing: directionAngles[previous] + assets.orientationAngle,
      };
      return;
    }
    if (phase === "result" || phase === "choosing" || phase === "walking" || phase === "idle") {
      const entrance = directionPoint("south", 3.05);
      assets.explorer.position.set(entrance.x, 0.1, entrance.z);
      assets.explorer.rotation.y = directionAngles.north;
      assets.movement = null;
      assets.suspenseStartedAt = null;
    }
  }, [phase, junction.id, previous]);

  useEffect(() => {
    const assets = assetsRef.current;
    if (!assets) return;
    const biome = environmentForRoom(junction.id + 1);
    const sky = theme === "moonlit-maze" ? biome.skyNight : biome.skyDay;
    assets.scene.background = new THREE.Color(sky);
    if (assets.scene.fog instanceof THREE.Fog) assets.scene.fog.color.set(sky);
  }, [junction.id, theme]);

  useEffect(() => {
    const assets = assetsRef.current;
    if (!assets) return;
    assets.fireflies.forEach(({ mesh }, index) => {
      const material = mesh.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.color.set(trail === "starlight-trail" ? "#d6eef0" : ["#ffdf8c", "#d7f3b5", "#fff0ba"][index % 3]);
      }
    });
  }, [trail]);

  useEffect(() => {
    const assets = assetsRef.current;
    if (!assets) return;
    const position = assets.explorer.position;
    const rotation = assets.explorer.rotation.y;
    const replacement = buildExplorer(assets.scene, avatar, frame, characterId);
    replacement.position.copy(position);
    replacement.rotation.y = rotation;
    assets.scene.remove(assets.explorer);
    assets.explorer.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (material instanceof THREE.MeshBasicMaterial && material.map) material.map.dispose();
          material.dispose();
        });
      }
    });
    assets.explorer = replacement;
  }, [avatar, characterId, frame]);

  return (
    <div className={`maze-frame ${theme === "moonlit-maze" ? "maze-night" : ""}`}>
      <div className="scene-topline">
        <span className="chapter-label"><span className="live-dot" /> THE UNKNOWN, ROOM {String(junction.id + 1).padStart(2, "0")}</span>
        <span className="scene-note"><span className="world-time-indicator">{worldPhase === "DAY" ? "☀" : "☾"} {worldPhase}</span> · day &amp; night cycle</span>
      </div>
      <div className="scene-three" ref={containerRef} aria-label="Three-dimensional labyrinth">
        <div className="scene-route-indicators" aria-hidden="true">
          {junction.options.map((direction, index) => (
            <span
              key={direction}
              className="scene-route-indicator"
              ref={(element) => {
                if (element) routeIndicatorElementsRef.current[direction] = element;
                else delete routeIndicatorElementsRef.current[direction];
              }}
            >
              <span className="scene-route-letter">{String.fromCharCode(65 + index)}</span>
              <span>{direction}</span>
              <span className="scene-route-edge" />
            </span>
          ))}
        </div>
      </div>
      {graphicsError && (
        <div className="graphics-fallback" role="status">
          <span>✧</span>
          <strong>This labyrinth needs WebGL.</strong>
          <span>Try enabling hardware acceleration in your browser.</span>
        </div>
      )}
      <div className="scene-caption">
        <span><span className="caption-dot" /> {phase === "choosing" ? "Choose a glowing path" : "A new adventure unfolds"}</span>
        <span className="caption-mystery"><span className="scene-key">A–D</span> to choose · {trail === "starlight-trail" ? "follow the starlight" : "follow the fireflies"}</span>
      </div>
    </div>
  );
}
