"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  directionVectors,
  type Direction,
  type Junction,
} from "@/lib/game";

type SceneProps = {
  junction: Junction;
  explorer: { x: number; y: number };
  phase: "walking" | "choosing" | "approaching" | "moving" | "result" | "idle";
  previous?: Direction;
  bets: Record<Direction, number>;
  avatar: string;
  onPathHoldStart: (direction: Direction) => void;
  theme: string;
  frame: string;
  trail: string;
  worldClockStartedAt: number;
  worldPhase: string;
};

type SceneAssets = {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  hemisphere: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  renderer: THREE.WebGLRenderer;
  dynamic: THREE.Group;
  paths: THREE.Group;
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
  orientationAngle: number;
  routeIndicatorElements: Partial<Record<Direction, HTMLSpanElement>>;
};

const directions: Direction[] = ["north", "east", "south", "west"];
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

function addTree(
  parent: THREE.Group,
  x: number,
  z: number,
  scale: number,
  palette: THREE.Material[],
  seed: number,
) {
  const tree = new THREE.Group();
  tree.position.set(x, 0.1, z);
  tree.scale.setScalar(scale);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.19, 0.95, 5), makeMaterial("#76563b"));
  trunk.position.y = 0.47;
  trunk.castShadow = true;
  tree.add(trunk);
  for (let layer = 0; layer < 3; layer++) {
    const radius = 0.72 - layer * 0.14;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(radius, 1.06, 5 + ((seed + layer) % 2)),
      palette[(seed + layer) % palette.length],
    );
    cone.position.y = 1.05 + layer * 0.43;
    cone.rotation.y = seed * 0.71 + layer * 0.38;
    cone.castShadow = true;
    tree.add(cone);
  }
  parent.add(tree);
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

function buildForest(scene: THREE.Scene, tint: boolean) {
  const forest = new THREE.Group();
  const greens = tint
    ? ["#263c39", "#36534a", "#4e6953", "#405b50"].map((color) => makeMaterial(color))
    : ["#68845d", "#7f9865", "#526f59", "#91a66f"].map((color) => makeMaterial(color));
  for (let i = 0; i < 56; i++) {
    const angle = (i * 2.399963) % (Math.PI * 2);
    const radius = 7.7 + (i % 7) * 0.65;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.72;
    addTree(forest, x, z, 0.66 + (i % 4) * 0.12, greens, i);
  }
  for (let i = 0; i < 36; i++) {
    const angle = i * 2.399963 + 0.24;
    const radius = 5.3 + (i % 5) * 0.42;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.7;
    addHedge(forest, x, z, 0.56 + (i % 3) * 0.1, i % 2 ? "#577451" : "#66835a");
  }
  scene.add(forest);
}

function buildPath(scene: THREE.Group, direction: Direction, open: boolean) {
  const arm = new THREE.Group();
  const vector = directionPoint(direction, 1);
  const lane = new THREE.Mesh(
    new THREE.BoxGeometry(2.45, 0.1, 8.9),
    makeMaterial("#d6c392"),
  );
  lane.position.set(vector.x * 4.45, 0.19, vector.z * 4.45);
  if (direction === "east" || direction === "west") lane.rotation.y = Math.PI / 2;
  lane.receiveShadow = true;
  arm.add(lane);
  const centerLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.012, 6.7),
    makeMaterial("#f0dfb4"),
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
      const bushMaterial = makeMaterial(segment % 2 ? "#48684d" : "#5d7952");
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
      makeMaterial("#526c4e"),
    );
    barrier.position.set(vector.x * 7.7, 0.52, vector.z * 7.7);
    barrier.castShadow = true;
    arm.add(barrier);
  }
  scene.add(arm);
}

function buildExplorer(scene: THREE.Scene, avatar: string, frame: string) {
  const explorer = new THREE.Group();
  const bodyMaterial = makeMaterial("#bf865b");
  const cloakMaterial = makeMaterial("#547a63");
  const skinMaterial = makeMaterial("#e4ba8c");
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.78, 6), cloakMaterial);
  body.position.y = 0.75;
  body.castShadow = true;
  explorer.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), skinMaterial);
  head.position.y = 1.34;
  head.castShadow = true;
  explorer.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.37, 0.56, 5), bodyMaterial);
  hat.position.y = 1.73;
  hat.rotation.y = -0.24;
  hat.castShadow = true;
  explorer.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.075, 8), bodyMaterial);
  brim.position.y = 1.51;
  explorer.add(brim);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.43, 0.24), makeMaterial("#9b7149"));
  pack.position.set(0, 0.91, 0.34);
  pack.castShadow = true;
  explorer.add(pack);
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
  onPathHoldStart,
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
  const propsRef = useRef({ junction, explorerPosition, phase, previous, bets, avatar, theme, frame, worldClockStartedAt, worldPhase });
  const [graphicsError, setGraphicsError] = useState(false);
  holdStartRef.current = onPathHoldStart;
  propsRef.current = { junction, explorerPosition, phase, previous, bets, avatar, theme, frame, worldClockStartedAt, worldPhase };

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
    scene.background = new THREE.Color(propsRef.current.theme === "moonlit-maze" ? "#779098" : "#b9d4ca");
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

    const island = new THREE.Mesh(
      new THREE.CylinderGeometry(11, 12.2, 1.15, 10, 1),
      makeMaterial(propsRef.current.theme === "moonlit-maze" ? "#364e48" : "#78936a"),
    );
    island.position.y = -0.48;
    island.receiveShadow = true;
    island.castShadow = true;
    scene.add(island);
    const soilBand = new THREE.Mesh(
      new THREE.CylinderGeometry(11.5, 12.2, 0.22, 10, 1, true),
      makeMaterial("#795d42"),
    );
    soilBand.position.y = -0.27;
    scene.add(soilBand);
    const grass = new THREE.Mesh(
      new THREE.CircleGeometry(11, 10),
      makeMaterial(propsRef.current.theme === "moonlit-maze" ? "#526d59" : "#8ca272"),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = 0.105;
    grass.receiveShadow = true;
    scene.add(grass);
    buildForest(scene, propsRef.current.theme === "moonlit-maze");

    const center = new THREE.Mesh(
      new THREE.CylinderGeometry(2.03, 2.25, 0.14, 9),
      makeMaterial("#d9c79c"),
    );
    center.position.y = 0.17;
    center.receiveShadow = true;
    scene.add(center);
    const paths = new THREE.Group();
    scene.add(paths);
    for (const direction of directions) buildPath(paths, direction, false);
    const dynamic = new THREE.Group();
    scene.add(dynamic);
    const markerMeshes: THREE.Mesh[] = [];
    const explorer = buildExplorer(scene, propsRef.current.avatar, propsRef.current.frame);
    const startingPoint = propsRef.current.phase === "moving"
      ? new THREE.Vector3()
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
      camera,
      hemisphere,
      sun,
      renderer,
      dynamic,
      paths,
      markerMeshes,
      fireflies,
      explorer,
      resizeObserver,
      animationFrame: 0,
      raycaster,
      pointer,
      movement: null,
      suspenseStartedAt: null,
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
      const current = propsRef.current;
      const now = performance.now();
      const movement = assets.movement;
      if (movement) {
        const progress = Math.min(1, (now - movement.startedAt) / movement.duration);
        const eased = progress * progress * (3 - 2 * progress);
        assets.explorer.position.lerpVectors(movement.from, movement.to, eased);
        assets.explorer.position.y = 0.1 + Math.sin(progress * Math.PI) * 0.1;
        assets.explorer.rotation.y = movement.facing;
        if (progress >= 1) {
          assets.explorer.position.copy(movement.to);
          assets.explorer.position.y = 0.1;
          assets.movement = null;
        }
      } else {
        assets.explorer.position.y = 0.08 + Math.sin(elapsed * 1.8) * 0.1;
      }
      const suspenseStartedAt = assets.suspenseStartedAt;
      if (suspenseStartedAt !== null && (current.phase === "approaching" || current.phase === "moving")) {
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
      const moonlit = current.theme === "moonlit-maze";
      daySky.set(moonlit ? "#718b95" : "#b9d4ca");
      nightSky.set(moonlit ? "#101a2a" : "#253b4a");
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
          const material = object.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material.dispose();
        }
      });
      assetsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const assets = assetsRef.current;
    if (!assets) return;
    const { junction: nextJunction } = propsRef.current;
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
      buildPath(assets.paths, direction, nextJunction.options.includes(direction) || direction === cameFrom);
    }
    buildMarkers(assets.dynamic, nextJunction, propsRef.current.bets, assets.markerMeshes);
  }, [junction.id, junction.options, junction.hazards]);

  useEffect(() => {
    const assets = assetsRef.current;
    if (assets) updateMarkerBets(assets.markerMeshes, bets);
  }, [bets]);

  useEffect(() => {
    const assets = assetsRef.current;
    if (!assets) return;
    const now = performance.now();
    if (phase === "approaching") {
      assets.suspenseStartedAt = now;
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
    const isNight = theme === "moonlit-maze";
    assets.scene.background = new THREE.Color(isNight ? "#172b30" : "#b9d4ca");
    if (assets.scene.fog instanceof THREE.Fog) assets.scene.fog.color.set(isNight ? "#172b30" : "#b9d4ca");
  }, [theme]);

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
    const replacement = buildExplorer(assets.scene, avatar, frame);
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
  }, [avatar, frame]);

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
