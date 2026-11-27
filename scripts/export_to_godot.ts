import * as fs from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';

// Minimal headless Canvas 2D shim so procedural texture builders run in Node
function installHeadlessDomShim(): void {
  if (typeof (globalThis as Record<string, unknown>).document !== 'undefined') return;

  const makeMockCtx = (w: number, h: number) => ({
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '12px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    ellipse: () => {},
    rect: () => {},
    quadraticCurveTo: () => {},
    bezierCurveTo: () => {},
    fill: () => {},
    stroke: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: (t: string) => ({ width: t.length * 8 }),
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    drawImage: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createImageData: (cw: number, ch: number) => ({
      width: cw,
      height: ch,
      data: new Uint8ClampedArray(cw * ch * 4),
    }),
    getImageData: (_x: number, _y: number, cw: number, ch: number) => ({
      width: cw || w,
      height: ch || h,
      data: new Uint8ClampedArray((cw || w) * (ch || h) * 4),
    }),
    putImageData: () => {},
  });

  const makeProxyCtx = (w: number, h: number) =>
    new Proxy(makeMockCtx(w, h), {
      get(target, prop) {
        if (prop in target) return target[prop as keyof typeof target];
        return () => {};
      },
    });

  (globalThis as Record<string, unknown>).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        const c = {
          width: 256,
          height: 256,
          getContext: () => makeProxyCtx(c.width, c.height),
        };
        return c;
      }
      return {};
    },
  };
}

installHeadlessDomShim();

// Prevent THREE.FileLoader from calling new Request('/assets/...') in Node during headless export
THREE.FileLoader.prototype.load = function (_url: string, _onLoad?: unknown, _onProgress?: unknown, _onError?: unknown) {
  return undefined as unknown as XMLHttpRequest;
};

import { buildElarionDistrictBlock } from '../src/aincendra/world/ElarionDistrictBlock';
import { ITEMS, CRAFTING_RECIPES } from '../src/aincendra/rpg/craftingData';
import { QUEST_CATALOG, QUEST_ORDER } from '../src/aincendra/rpg/questData';
import { SPELLS, SPELL_ORDER } from '../src/aincendra/rpg/magicCombatRules';
import {
  ALL_LINE_PASS_PRICE,
  RAIL_LINES,
  RAIL_SEGMENTS,
  RAIL_STATIONS,
} from '../src/aincendra/world/ManaRailNetwork';

interface SerializedMaterial {
  color: string;
  roughness: number;
  metalness: number;
  emissive: string;
  emissiveIntensity: number;
  transparent: boolean;
  opacity: number;
  vertexColors: boolean;
  doubleSided: boolean;
}

interface SerializedPrimitive {
  shape: 'box' | 'cylinder' | 'cone' | 'sphere' | 'torus' | 'plane';
  dims: number[];
  matrix: number[];
  mat: SerializedMaterial;
  castShadow: boolean;
  tag: string;
}

interface SerializedCustomMesh {
  name: string;
  matrix: number[];
  positions: number[];
  normals: number[];
  indices: number[] | null;
  colors: number[] | null;
  mat: SerializedMaterial;
}

interface SerializedGlbMount {
  key: string;
  name: string;
  pos: [number, number, number];
  rotY: number;
  targetHeight: number;
}

function roundNum(n: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function roundArray(arr: ArrayLike<number>, decimals = 3): number[] {
  const out = new Array<number>(arr.length);
  const f = 10 ** decimals;
  for (let i = 0; i < arr.length; i++) {
    out[i] = Math.round(arr[i] * f) / f;
  }
  return out;
}

function serializeMaterial(mat: THREE.Material | THREE.Material[]): SerializedMaterial {
  const m = Array.isArray(mat) ? mat[0] : mat;
  const std = m as THREE.MeshStandardMaterial;
  return {
    color: std?.color ? `#${std.color.getHexString()}` : '#9aa0a6',
    roughness: roundNum(std?.roughness ?? 0.85, 2),
    metalness: roundNum(std?.metalness ?? 0.05, 2),
    emissive: std?.emissive ? `#${std.emissive.getHexString()}` : '#000000',
    emissiveIntensity: roundNum(std?.emissiveIntensity ?? 0, 2),
    transparent: Boolean(std?.transparent),
    opacity: roundNum(std?.opacity ?? 1, 2),
    vertexColors: Boolean(std?.vertexColors),
    doubleSided: std?.side === THREE.DoubleSide,
  };
}

function hasAncestorMatching(obj: THREE.Object3D, pattern: RegExp): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur.name && pattern.test(cur.name)) return true;
    cur = cur.parent;
  }
  return false;
}

function classifyPrimitive(geo: THREE.BufferGeometry): {
  shape: SerializedPrimitive['shape'];
  dims: number[];
} | null {
  const anyGeo = geo as unknown as { type?: string; parameters?: Record<string, number> };
  const p = anyGeo.parameters || {};
  switch (anyGeo.type) {
    case 'BoxGeometry':
      return { shape: 'box', dims: [p.width ?? 1, p.height ?? 1, p.depth ?? 1] };
    case 'CylinderGeometry':
      return {
        shape: 'cylinder',
        dims: [
          p.radiusTop ?? 1,
          p.radiusBottom ?? 1,
          p.height ?? 1,
          p.radialSegments ?? 12,
        ],
      };
    case 'ConeGeometry':
      return {
        shape: 'cone',
        dims: [p.radius ?? 1, p.height ?? 1, p.radialSegments ?? 12],
      };
    case 'SphereGeometry':
      return {
        shape: 'sphere',
        dims: [p.radius ?? 1, p.widthSegments ?? 12, p.heightSegments ?? 8],
      };
    case 'TorusGeometry':
      return {
        shape: 'torus',
        dims: [p.radius ?? 1, p.tube ?? 0.2],
      };
    case 'PlaneGeometry':
      return {
        shape: 'plane',
        dims: [p.width ?? 1, p.height ?? 1],
      };
    default:
      return null;
  }
}

async function main(): Promise<void> {
  const rootDir = path.resolve(process.cwd());
  const godotDir = path.join(rootDir, 'godot');
  const dataDir = path.join(godotDir, 'data');
  const modelsDestDir = path.join(godotDir, 'assets', 'models');
  const modelsSrcDir = path.join(rootDir, 'public', 'assets', 'models');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(modelsDestDir, { recursive: true });

  // 1. Copy all 27 local GLB models into godot/assets/models/
  const glbFiles = fs.readdirSync(modelsSrcDir).filter((f) => f.endsWith('.glb')).sort();
  for (const file of glbFiles) {
    fs.copyFileSync(path.join(modelsSrcDir, file), path.join(modelsDestDir, file));
  }

  // 2. Build live Three.js Elarion world graph in headless mode
  const world = buildElarionDistrictBlock(1);
  world.group.updateMatrixWorld(true);

  const primitives: SerializedPrimitive[] = [];
  const customMeshes: SerializedCustomMesh[] = [];
  const curatedGlbs: SerializedGlbMount[] = [];

  const tmpMat4 = new THREE.Matrix4();
  const instanceMat4 = new THREE.Matrix4();

  // Record curated GLB mounts from ElarionCuratedAssets & WorldStationsAndLoot
  world.group.traverse((obj) => {
    if (obj.name.startsWith('Curated_')) {
      const key = obj.name.replace(/^Curated_/, '');
      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);
      curatedGlbs.push({
        key,
        name: obj.name,
        pos: [roundNum(worldPos.x, 3), roundNum(worldPos.y, 3), roundNum(worldPos.z, 3)],
        rotY: roundNum(obj.rotation.y, 4),
        targetHeight: key === 'windmill' ? 13.5 : key === 'boathouse' ? 5.8 : key === 'caique_boat' ? 4.4 : key === 'harbour_lamp' ? 4.1 : key === 'horse_statue' ? (worldPos.x > 200 ? 3.25 : 2.85) : key === 'market_stall' ? 3.2 : key === 'stone_well' ? 2.8 : key === 'haystack' ? 2.4 : key === 'bread_oven' ? 2.2 : key === 'wooden_cart' ? 1.85 : key === 'deck_cannon' ? 1.35 : key === 'wooden_crate_prop' ? 1.35 : key === 'wooden_rowboat' ? 1.25 : key === 'wooden_barrel_prop' ? 1.05 : key === 'water_trough' ? 0.95 : 0.88,
      });
    }
  });

  // Add crafting stations, ley portal, spectral stag & chests from WorldStationsAndLoot
  const stationAndLootGlbs: SerializedGlbMount[] = [
    { key: 'alchemy_bench', name: 'station_alchemy_copperwell', pos: [19.5, 0.16, 7.5], rotY: -0.7, targetHeight: 1.45 },
    { key: 'blacksmith_forge', name: 'station_forge_smelting', pos: [-72.0, 0.18, 4.0], rotY: 0.4, targetHeight: 2.65 },
    { key: 'anvil', name: 'station_anvil_westforge', pos: [-52.0, 0.18, 30.0], rotY: 0.0, targetHeight: 1.05 },
    { key: 'alchemy_bench', name: 'station_alchemy_conservatory', pos: [64.0, 1.76, 6.0], rotY: -1.2, targetHeight: 1.45 },
    { key: 'ancestral_shrine', name: 'station_shrine_temple', pos: [-192.0, 0.16, -12.0], rotY: 0.25, targetHeight: 2.85 },
    { key: 'ancestral_shrine', name: 'station_shrine_wilds', pos: [-76.0, world.groundHeightAt?.(-76, 456) ?? 0.5, 456.0], rotY: 0.9, targetHeight: 2.85 },
    { key: 'ley_portal', name: 'landmark_ley_portal', pos: [0, world.groundHeightAt?.(0, 542) ?? 0.5, 542], rotY: 0, targetHeight: 5.8 },
    { key: 'spectral_stag', name: 'landmark_spectral_stag', pos: [-84, world.groundHeightAt?.(-84, 464) ?? 0.5, 464], rotY: 0.65, targetHeight: 2.4 },
    { key: 'treasure_chest', name: 'loot_chest_harbour', pos: [-14.0, 0.16, 15.0], rotY: 0, targetHeight: 0.85 },
    { key: 'treasure_chest', name: 'loot_chest_exchange', pos: [26.0, 0.16, 212.0], rotY: 0, targetHeight: 0.85 },
    { key: 'treasure_chest', name: 'loot_chest_wilds_glade', pos: [-68.0, world.groundHeightAt?.(-68, 452) ?? 0.5, 452.0], rotY: 0, targetHeight: 0.85 },
  ];
  curatedGlbs.push(...stationAndLootGlbs);

  // Traverse architectural & landmark meshes
  world.group.traverse((obj) => {
    // Skip procedural countryside terrain/trees/wildlife (handled natively in Godot ElarionTerrain.gd & AmbientWildlife.gd)
    // EXCEPT keep farm cottages, drystone walls, hay bales, and alpine mountain peaks!
    const inCountryside = hasAncestorMatching(obj, /^Vaelcrest_Green_Countryside$/);
    const inMountainLandmark = hasAncestorMatching(obj, /^Vaelcrest_Mountain_Range_Landmark$/);
    if (inCountryside && !inMountainLandmark) {
      // Keep farm cottages & hay bales if cone/box, skip high-count grass/trees/creatures
      if ((obj as THREE.InstancedMesh).isInstancedMesh) {
        const cnt = (obj as THREE.InstancedMesh).count;
        if (cnt > 120) return; // skip 1,250 tree/shrub instances — Godot builds native MultiMesh trees!
      } else if (!(obj as THREE.Mesh).isMesh) {
        return;
      } else {
        const mesh = obj as THREE.Mesh;
        const geo = mesh.geometry as THREE.BufferGeometry;
        // Skip the massive PlaneGeometry terrain/pond sheets & voxel outcrops (ElarionTerrain.gd generates native Godot terrain!)
        if (geo.type === 'PlaneGeometry' && (geo.attributes.position?.count ?? 0) > 200) return;
      }
    }

    // Skip fallback meshes inside Aincendra_World_Stations_And_Loot (since Godot uses the real GLBs)
    if (hasAncestorMatching(obj, /^Aincendra_World_Stations_And_Loot$/)) return;

    if ((obj as THREE.InstancedMesh).isInstancedMesh) {
      const inst = obj as THREE.InstancedMesh;
      const prim = classifyPrimitive(inst.geometry);
      const mat = serializeMaterial(inst.material);
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, instanceMat4);
        tmpMat4.multiplyMatrices(inst.matrixWorld, instanceMat4);
        if (prim) {
          primitives.push({
            shape: prim.shape,
            dims: prim.dims.map((d) => roundNum(d, 3)),
            matrix: roundArray(tmpMat4.elements, 4),
            mat,
            castShadow: inst.castShadow,
            tag: inst.name || 'instanced',
          });
        }
      }
      return;
    }

    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const prim = classifyPrimitive(mesh.geometry);
      const mat = serializeMaterial(mesh.material);

      // Keep custom vertex-displaced mountain cones as custom meshes so alpine crags + snow vertex colors survive!
      const forceCustom = inMountainLandmark || (mesh.geometry.attributes.color !== undefined && prim?.shape === 'cone');

      if (prim && !forceCustom) {
        primitives.push({
          shape: prim.shape,
          dims: prim.dims.map((d) => roundNum(d, 3)),
          matrix: roundArray(mesh.matrixWorld.elements, 4),
          mat,
          castShadow: mesh.castShadow,
          tag: mesh.name || mesh.parent?.name || 'arch',
        });
      } else {
        const posAttr = mesh.geometry.getAttribute('position');
        if (!posAttr || posAttr.count === 0) return;
        const normAttr = mesh.geometry.getAttribute('normal');
        const idxAttr = mesh.geometry.getIndex();
        const colAttr = mesh.geometry.getAttribute('color');
        customMeshes.push({
          name: mesh.name || mesh.parent?.name || 'custom_mesh',
          matrix: roundArray(mesh.matrixWorld.elements, 4),
          positions: roundArray(posAttr.array as ArrayLike<number>, 3),
          normals: normAttr ? roundArray(normAttr.array as ArrayLike<number>, 3) : [],
          indices: idxAttr ? Array.from(idxAttr.array as ArrayLike<number>) : null,
          colors: colAttr ? roundArray(colAttr.array as ArrayLike<number>, 3) : null,
          mat,
        });
      }
    }
  });

  // 3. Serialize world_geometry.json
  const worldGeometry = {
    meta: {
      title: 'Aincendra: Elarion',
      godotVersion: '4.3',
      exportedAt: new Date().toISOString(),
      spawnPoint: [world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z],
      worldBounds: world.worldBounds,
    },
    primitives,
    customMeshes,
    curatedGlbs,
    boxColliders: world.boxColliders.map((b) => ({
      minX: roundNum(b.minX, 3),
      maxX: roundNum(b.maxX, 3),
      minY: roundNum(b.minY, 3),
      maxY: roundNum(b.maxY, 3),
      minZ: roundNum(b.minZ, 3),
      maxZ: roundNum(b.maxZ, 3),
    })),
    rampColliders: world.rampColliders.map((r) => ({
      minX: roundNum(r.minX, 3),
      maxX: roundNum(r.maxX, 3),
      minZ: roundNum(r.minZ, 3),
      maxZ: roundNum(r.maxZ, 3),
      axis: r.axis,
      yStart: roundNum(r.yStart, 3),
      yEnd: roundNum(r.yEnd, 3),
    })),
  };
  fs.writeFileSync(path.join(dataDir, 'world_geometry.json'), JSON.stringify(worldGeometry));

  // 4. Serialize npcs.json
  const npcsData = (world.npcSpawns ?? []).map((n) => ({
    ...n,
    tunicHex: `#${n.tunicColor.toString(16).padStart(6, '0')}`,
    accentHex: `#${n.accentColor.toString(16).padStart(6, '0')}`,
  }));
  fs.writeFileSync(path.join(dataDir, 'npcs.json'), JSON.stringify(npcsData, null, 2));

  // 5. Serialize interactables.json
  const interactablesData = {
    interactables: world.interactables ?? [],
    combatDummies: world.combatDummies ?? [],
  };
  fs.writeFileSync(path.join(dataDir, 'interactables.json'), JSON.stringify(interactablesData, null, 2));

  // 6. Serialize rpg_catalog.json (Items, Recipes, Quests, Spells, Rail Network, Enemies)
  const gy = (x: number, z: number) => roundNum(world.groundHeightAt?.(x, z) ?? 0.16, 3);
  const rpgCatalog = {
    items: ITEMS,
    recipes: CRAFTING_RECIPES,
    quests: QUEST_CATALOG,
    questOrder: QUEST_ORDER,
    spells: SPELLS,
    spellOrder: SPELL_ORDER,
    manaRail: {
      allLinePassPrice: ALL_LINE_PASS_PRICE,
      lines: RAIL_LINES,
      stations: RAIL_STATIONS,
      segments: RAIL_SEGMENTS,
    },
    enemyArchetypes: {
      sentinel: { model: 'dark_sentinel', height: 2.15, hp: 115, poise: 60, speed: 4.1, radius: 0.75, aggro: 18, xp: 48, crowns: 16, lootItemId: 'iron_ore', lootQty: 1 },
      'ley-mage': { model: 'ley_mage', height: 1.92, hp: 90, poise: 45, speed: 3.4, radius: 0.68, aggro: 22, xp: 55, crowns: 20, lootItemId: 'mana_shard', lootQty: 2 },
      'furnace-golem': { model: 'furnace_golem', height: 2.85, hp: 210, poise: 110, speed: 2.5, radius: 1.05, aggro: 19, xp: 90, crowns: 32, lootItemId: 'crystal_core', lootQty: 1 },
      'crystal-wyrm': { model: 'crystal_wyrm', height: 4.4, hp: 540, poise: 180, speed: 4.6, radius: 1.85, aggro: 32, xp: 280, crowns: 120, lootItemId: 'wyrm_scale', lootQty: 2 },
    },
    enemySpawns: [
      { id: 'enm_sentinel_foundry', name: 'Corrupted Sentinel', archetype: 'sentinel', position: [-46, gy(-46, 38), 38], isBoss: false, isWilds: false },
      { id: 'enm_sentinel_freight', name: 'Freight-Yard Sentinel', archetype: 'sentinel', position: [-144, gy(-144, 52), 52], isBoss: false, isWilds: false },
      { id: 'enm_golem_smelting', name: 'Furnace Golem', archetype: 'furnace-golem', position: [-102, gy(-102, 22), 22], isBoss: false, isWilds: false },
      { id: 'enm_mage_academic', name: 'Rogue Ley-Mage', archetype: 'ley-mage', position: [72, gy(72, 74), 74], isBoss: false, isWilds: false },
      { id: 'enm_sentinel_citadel', name: 'Citadel Ward Sentinel', archetype: 'sentinel', position: [152, gy(152, 68), 68], isBoss: false, isWilds: false },
      { id: 'enm_mage_merchant', name: 'Aether Siphoner', archetype: 'ley-mage', position: [-46, gy(-46, 206), 206], isBoss: false, isWilds: false },
      { id: 'enm_sentinel_southroad', name: 'Bastion Road Sentinel', archetype: 'sentinel', position: [52, gy(52, 245), 245], isBoss: false, isWilds: false },
      { id: 'enm_wilds_sentinel', name: 'Blighted Sentinel', archetype: 'sentinel', position: [-18, gy(-18, 382), 382], isBoss: false, isWilds: true },
      { id: 'enm_wilds_mage', name: 'Wilds Ley-Conduit Mage', archetype: 'ley-mage', position: [26, gy(26, 424), 424], isBoss: false, isWilds: true },
      { id: 'enm_wilds_golem', name: 'Overclocked Furnace Golem', archetype: 'furnace-golem', position: [-42, gy(-42, 468), 468], isBoss: false, isWilds: true },
      { id: 'boss_crystal_wyrm', name: 'Aetheric Crystal Wyrm', archetype: 'crystal-wyrm', position: [0, gy(0, 522), 522], isBoss: true, isWilds: true },
    ],
  };
  fs.writeFileSync(path.join(dataDir, 'rpg_catalog.json'), JSON.stringify(rpgCatalog, null, 2));

  world.dispose();

  console.log(
    `Exported Godot 4 project data:\n` +
      `  - GLB models copied: ${glbFiles.length}\n` +
      `  - Primitives: ${primitives.length}, Custom meshes: ${customMeshes.length}\n` +
      `  - Curated GLB mounts: ${curatedGlbs.length}\n` +
      `  - Box colliders: ${worldGeometry.boxColliders.length}, Ramp colliders: ${worldGeometry.rampColliders.length}\n` +
      `  - NPCs: ${npcsData.length}, Interactables: ${interactablesData.interactables.length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
