import * as THREE from 'three';
import type { BoxCollider } from '../core/types';
import { createHeraldry } from './foundry/heraldryRuntime.js';
import { createStatue } from './foundry/statueRuntime.js';
import { ModelAssetCache, type LocalModelKey } from './ModelAssetCache';

export interface CuratedAssetsOutput {
  group: THREE.Group;
  boxColliders: BoxCollider[];
  raycastTargets: THREE.Object3D[];
  update: (dt: number) => void;
  dispose: () => void;
}

interface FloatingVessel {
  holder: THREE.Group;
  baseY: number;
  phase: number;
  bobAmp: number;
  rollAmp: number;
}

/**
 * Integrates curated GLB assets (Polyfork & three.ws Poly Haven CC0) and standalone
 * procedural Three.js asset runtimes (World Asset Foundry: Heraldry & Statues)
 * sourced from GitHub's `3d-assets` topic repositories.
 */
export function buildElarionCuratedAssets(
  modelCache: ModelAssetCache,
  groundHeightAt: (x: number, z: number) => number
): CuratedAssetsOutput {
  const group = new THREE.Group();
  group.name = 'Elarion_Curated_3D_Assets';

  const boxColliders: BoxCollider[] = [];
  const raycastTargets: THREE.Object3D[] = [];
  const animatedUpdates: Array<(seconds: number) => void> = [];
  const floatingVessels: FloatingVessel[] = [];
  const disposables: Array<{ dispose: () => void }> = [];
  let elapsedSeconds = 0;

  const mountGlb = (
    key: LocalModelKey,
    x: number,
    y: number,
    z: number,
    targetHeight: number,
    yaw = 0,
    colliderRadius?: number
  ): THREE.Group => {
    const holder = new THREE.Group();
    holder.name = `Curated_${key}`;
    holder.position.set(x, y, z);
    holder.rotation.y = yaw;
    group.add(holder);

    modelCache.mountIntoContainer(holder, key, targetHeight, undefined, (loadedModel) => {
      loadedModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          raycastTargets.push(child);
        }
      });
    });

    if (colliderRadius && colliderRadius > 0) {
      boxColliders.push({
        minX: x - colliderRadius,
        maxX: x + colliderRadius,
        minY: y,
        maxY: y + targetHeight * 0.85,
        minZ: z - colliderRadius,
        maxZ: z + colliderRadius,
      });
    }
    return holder;
  };

  const mountFoundry = (
    node: THREE.Group & { userData: { update?: (s: number) => void; dispose?: () => void } },
    x: number,
    y: number,
    z: number,
    yaw = 0,
    colliderRadius = 0,
    colliderHeight = 2.6
  ): void => {
    node.position.set(x, y, z);
    node.rotation.y = yaw;
    node.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        raycastTargets.push(mesh);
      }
    });
    group.add(node);

    if (typeof node.userData.update === 'function') {
      animatedUpdates.push(node.userData.update);
    }
    if (typeof node.userData.dispose === 'function') {
      disposables.push({ dispose: node.userData.dispose });
    }
    if (colliderRadius > 0) {
      boxColliders.push({
        minX: x - colliderRadius,
        maxX: x + colliderRadius,
        minY: y,
        maxY: y + colliderHeight,
        minZ: z - colliderRadius,
        maxZ: z + colliderRadius,
      });
    }
  };

  // =========================================================================
  // 1. HARBOUR QUAY & PIERS (Moored Caique Boats, Rowboats, Boathouses, Lamps, Cargo)
  // =========================================================================
  const caiqueSpots: Array<[number, number, number, number]> = [
    [-18.5, -72.0, 0.14, 0.2],
    [11.5, -78.0, -0.18, 1.8],
    [33.0, -69.0, 0.32, 3.1],
    [-42.0, -67.0, -0.28, 4.4],
  ];
  for (const [bx, bz, yaw, phase] of caiqueSpots) {
    const boat = mountGlb('caique_boat', bx, -1.78, bz, 4.4, yaw);
    floatingVessels.push({ holder: boat, baseY: -1.78, phase, bobAmp: 0.12, rollAmp: 0.032 });
  }

  const rowboatSpots: Array<[number, number, number, number]> = [
    [-13.0, -64.5, 0.65, 0.9],
    [94.0, -64.0, -0.45, 2.7],
    [-86.0, 468.0, 0.8, 1.4], // South-West Woodland Pond
    [92.0, 522.0, -0.5, 3.6], // South-East Woodland Pond
  ];
  for (const [rx, rz, yaw, phase] of rowboatSpots) {
    const baseY = rz > 300 ? groundHeightAt(rx, rz) - 0.18 : -1.78;
    const rowboat = mountGlb('wooden_rowboat', rx, baseY, rz, 1.25, yaw);
    floatingVessels.push({ holder: rowboat, baseY, phase, bobAmp: 0.06, rollAmp: 0.025 });
  }

  // Coastal Boathouses on Outer West & East Docks (non-blocking)
  mountGlb('boathouse', -91.0, -0.30, -56.0, 5.8, Math.PI * 0.5, 3.4);
  mountGlb('boathouse', 98.0, -0.30, -56.0, 5.8, -Math.PI * 0.5, 3.4);

  // Ornate Wrought-Iron Harbour Lamp Posts along Walkable Quay & Piers
  const harbourLampCoords: Array<[number, number]> = [
    [-28.0, -93.0],
    [0.0, -85.5],
    [22.0, -93.0],
    [-14.5, -43.0],
    [14.5, -43.0],
    [-64.0, -42.5],
    [58.0, -42.5],
  ];
  for (const [lx, lz] of harbourLampCoords) {
    mountGlb('harbour_lamp', lx, -0.30, lz, 4.1, 0, 0.35);
  }

  // Quay Cargo Clusters (Barrels, Crates & Promenade Coastal Cannons)
  mountGlb('wooden_crate_prop', -38.5, -0.30, -46.5, 1.35, 0.3, 0.75);
  mountGlb('wooden_barrel_prop', -36.8, -0.30, -46.2, 1.05, 0.8, 0.5);
  mountGlb('wooden_crate_prop', 34.5, -0.30, -46.8, 1.35, -0.4, 0.75);
  mountGlb('wooden_barrel_prop', 36.2, -0.30, -46.4, 1.05, 1.1, 0.5);
  mountGlb('wooden_barrel_prop', -23.5, -0.30, -70.5, 1.05, 0.2, 0.5);
  mountGlb('wooden_crate_prop', 18.0, -0.30, -71.5, 1.3, 0.5, 0.75);
  mountGlb('deck_cannon', -33.2, -0.30, -93.5, 1.35, Math.PI, 0.85);
  mountGlb('deck_cannon', 26.8, -0.30, -93.5, 1.35, Math.PI, 0.85);

  // =========================================================================
  // 2. OLD PORT, COPPERWELL SQUARE & ARTISAN MARKET PLAZA
  // =========================================================================
  // Stone Wells in Copperwell Square & Temple Quarter
  mountGlb('stone_well', 25.5, 0.16, 17.5, 2.8, 0.4, 1.25);
  mountGlb('stone_well', -172.0, 0.16, 4.5, 2.8, -0.6, 1.25);

  // Clay Bread Oven & Supply Carts in Old Port
  mountGlb('bread_oven', -13.5, 0.16, 86.0, 2.2, Math.PI * 0.5, 1.1);
  mountGlb('wooden_cart', 12.8, 0.16, 62.0, 1.85, -0.42, 1.45);
  mountGlb('wooden_cart', -34.0, 0.16, 222.0, 1.85, 0.25, 1.45);
  mountGlb('wooden_cart', 32.0, 0.16, 194.0, 1.85, 1.35, 1.45);
  mountGlb('wooden_cart', 13.5, 0.16, 309.0, 1.85, -0.8, 1.45);

  // Photorealistic Brass & Iron Lanterns flanking Tavern, Watch Post & Conservatory
  mountGlb('lantern_ornate', -14.2, 0.16, 54.0, 0.85, 0.3, 0.25);
  mountGlb('lantern_ornate', -6.2, 0.16, 32.0, 0.85, -0.4, 0.25);
  mountGlb('lantern_ornate', 66.0, 0.16, 64.0, 0.85, 0.0, 0.25);

  // Handcrafted Market Stalls in South Artisan Plaza & Exchange Square
  mountGlb('market_stall', -48.0, 0.16, 206.0, 3.2, 0.0, 1.6);
  mountGlb('market_stall', 48.0, 0.16, 206.0, 3.2, 0.0, 1.6);
  mountGlb('market_stall', -72.0, 0.16, 224.0, 3.2, Math.PI, 1.6);
  mountGlb('market_stall', 72.0, 0.16, 224.0, 3.2, Math.PI, 1.6);

  // Foundry Market Obelisk & Midsummer Festival Bunting in Grand Exchange Square
  mountFoundry(
    createStatue(
      {
        family: 'monuments',
        variant: 'obelisk',
        width: 2.0,
        depth: 2.0,
        height: 6.4,
        stoneColor: '#d4ccb8',
        trimColor: '#c8a962',
        carving: 0.55,
        seed: 4031,
      },
      { id: 'obelisk' }
    ),
    -26.0,
    0.16,
    212.0,
    0,
    1.1,
    6.4
  );
  mountFoundry(
    createHeraldry(
      {
        variant: 'bunting',
        family: 'civic',
        width: 5.4,
        depth: 0.5,
        height: 3.1,
        primaryColor: '#8e2d34',
        secondaryColor: '#e9c775',
        trimColor: '#3b8c76',
        sigil: 'none',
        pattern: 'plain',
        tassels: false,
        wind: 0.38,
        seed: 7102,
      },
      { id: 'bunting' }
    ),
    0.0,
    0.16,
    182.0,
    0
  );

  // =========================================================================
  // 3. NOBLE HEIGHTS & CASTLE VAELCREST (Equestrian Statue, Standards, Braziers, Cannons)
  // =========================================================================
  const Y_CASTLE = 5.20;

  // Noble Heights Approach Heroic Equestrian Monument (on Royal Plinth)
  mountFoundry(
    createStatue(
      {
        family: 'pedestals',
        variant: 'royal-plinth',
        width: 2.8,
        depth: 2.8,
        height: 1.85,
        stoneColor: '#d0c9b9',
        trimColor: '#d4af5c',
        metalColor: '#7a643d',
        seed: 7321,
      },
      { id: 'royal-plinth' }
    ),
    172.0,
    Y_CASTLE,
    11.2,
    0,
    1.45,
    4.6
  );
  mountGlb('horse_statue', 172.0, Y_CASTLE + 1.82, 11.2, 2.85, -Math.PI * 0.5);

  // Castle Vaelcrest Outer Bailey Centerpiece Equestrian Statue (225, 5.2, 18.5)
  mountFoundry(
    createStatue(
      {
        family: 'pedestals',
        variant: 'royal-plinth',
        width: 3.4,
        depth: 3.4,
        height: 2.15,
        stoneColor: '#d6d1c3',
        trimColor: '#d7ae62',
        metalColor: '#887047',
        seed: 7329,
      },
      { id: 'royal-plinth' }
    ),
    225.0,
    Y_CASTLE,
    18.5,
    0,
    1.75,
    5.4
  );
  mountGlb('horse_statue', 225.0, Y_CASTLE + 2.12, 18.5, 3.25, -Math.PI * 0.5);

  // Wind-Rippling House Vaelcrest Royal Standards flanking Gatehouse & Great Hall Portico
  const vaelcrestStandards: Array<[number, number, number, number, number]> = [
    [197.2, Y_CASTLE, 9.2, -Math.PI * 0.5, 4721],
    [197.2, Y_CASTLE, 27.8, -Math.PI * 0.5, 4722],
    [241.0, Y_CASTLE, 10.0, -Math.PI * 0.5, 4723],
    [241.0, Y_CASTLE, 27.0, -Math.PI * 0.5, 4724],
  ];
  for (const [sx, sy, sz, yaw, seed] of vaelcrestStandards) {
    mountFoundry(
      createHeraldry(
        {
          variant: 'standard',
          family: 'standards',
          width: 1.65,
          depth: 0.48,
          height: 4.4,
          primaryColor: '#8b262d',
          secondaryColor: '#ebd9b0',
          trimColor: '#d7ae62',
          sigil: 'crown',
          pattern: 'quartered',
          wind: 0.34,
          seed,
        },
        { id: 'standard' }
      ),
      sx,
      sy,
      sz,
      yaw,
      0.3,
      4.2
    );
  }

  // Knight Training Yard Sword Memorial & Escutcheon Shield + Water Trough
  mountFoundry(
    createStatue(
      {
        family: 'pedestals',
        variant: 'sword-memorial',
        width: 1.7,
        depth: 1.5,
        height: 3.4,
        metalColor: '#555657',
        seed: 6184,
      },
      { id: 'sword-memorial' }
    ),
    226.0,
    Y_CASTLE,
    46.0,
    0,
    0.9,
    3.4
  );
  mountFoundry(
    createHeraldry(
      {
        variant: 'shield',
        family: 'regalia',
        width: 1.2,
        depth: 0.4,
        height: 1.75,
        primaryColor: '#233b5c',
        secondaryColor: '#ebe1cc',
        trimColor: '#d7ae62',
        sigil: 'tower',
        pattern: 'pale',
        tassels: false,
        wind: 0,
        seed: 8064,
      },
      { id: 'shield' }
    ),
    214.8,
    Y_CASTLE,
    32.2,
    Math.PI * 0.5,
    0.45,
    1.7
  );
  mountGlb('water_trough', 237.2, Y_CASTLE, 29.0, 0.95, 0, 0.8);

  // Great Hall & War Room Ceremonial Tapestries
  mountFoundry(
    createHeraldry(
      {
        variant: 'tapestry',
        family: 'hangings',
        width: 3.6,
        depth: 0.3,
        height: 3.1,
        primaryColor: '#25483a',
        secondaryColor: '#ebdfbb',
        trimColor: '#c9a35b',
        sigil: 'stag',
        pattern: 'chevron',
        wind: 0,
        seed: 5958,
      },
      { id: 'tapestry' }
    ),
    291.4,
    Y_CASTLE + 1.8,
    59.0,
    -Math.PI * 0.5
  );

  // Eternal Remembrancer Braziers flanking Castle Gatehouse Approach
  for (const [bz, seed] of [
    [9.4, 2260],
    [27.6, 2261],
  ]) {
    mountFoundry(
      createStatue(
        {
          family: 'monuments',
          variant: 'eternal-brazier',
          width: 2.1,
          depth: 2.1,
          height: 2.75,
          flame: true,
          offerings: true,
          metalColor: '#4c3e35',
          glowColor: '#6bd8ea',
          seed,
        },
        { id: 'eternal-brazier' }
      ),
      192.4,
      Y_CASTLE,
      bz,
      0,
      1.05,
      2.7
    );
  }

  // Ornate Gatehouse Lanterns flanking the Great Hall West Portal
  mountGlb('lantern_ornate', 241.8, Y_CASTLE, 14.5, 0.9, 0.2, 0.25);
  mountGlb('lantern_ornate', 241.8, Y_CASTLE, 22.5, 0.9, -0.2, 0.25);

  // Coastal Deck Cannons defending East & South Castle Ramparts (Y = 11.40m)
  const RAMPART_Y = Y_CASTLE + 6.2;
  mountGlb('deck_cannon', 301.2, RAMPART_Y, -10.0, 1.35, Math.PI * 0.5, 0.85);
  mountGlb('deck_cannon', 301.2, RAMPART_Y, 44.0, 1.35, Math.PI * 0.5, 0.85);
  mountGlb('deck_cannon', 256.0, RAMPART_Y, 83.8, 1.35, 0, 0.85);

  // =========================================================================
  // 4. VAELCREST COUNTRYSIDE (Windmills, Haystacks, Wells, Carts & Farm Props)
  // =========================================================================
  const windmillSpots: Array<[number, number, number]> = [
    [-136.0, 396.0, 0.35],
    [136.0, 398.0, -0.45],
  ];
  for (const [wx, wz, yaw] of windmillSpots) {
    const wy = groundHeightAt(wx, wz);
    mountGlb('windmill', wx, wy, wz, 13.5, yaw, 3.2);
  }

  // Farmyard Wells, Carts, Haystacks & Troughs beside the 4 Countryside Farm Cottages
  const farmyardAnchors: Array<[number, number, number]> = [
    [-216.0, 369.0, 0.2],
    [-226.0, 528.0, -0.35],
    [72.0, 369.0, 0.5],
    [169.0, 561.0, -0.2],
  ];
  for (const [fx, fz, yaw] of farmyardAnchors) {
    const fy = groundHeightAt(fx, fz);
    mountGlb('stone_well', fx, fy, fz, 2.7, yaw, 1.2);
    mountGlb('haystack', fx + 5.5, groundHeightAt(fx + 5.5, fz + 2.5), fz + 2.5, 2.4, yaw + 0.7, 1.3);
    mountGlb('wooden_cart', fx - 5.2, groundHeightAt(fx - 5.2, fz + 3.2), fz + 3.2, 1.8, yaw - 0.5, 1.35);
    mountGlb('water_trough', fx + 3.0, groundHeightAt(fx + 3.0, fz - 4.0), fz - 4.0, 0.9, yaw, 0.75);
  }

  return {
    group,
    boxColliders,
    raycastTargets,
    update: (dt: number) => {
      elapsedSeconds += dt;
      for (const fn of animatedUpdates) {
        fn(elapsedSeconds);
      }
      for (const vessel of floatingVessels) {
        vessel.holder.position.y =
          vessel.baseY + Math.sin(elapsedSeconds * 1.15 + vessel.phase) * vessel.bobAmp;
        vessel.holder.rotation.z =
          Math.sin(elapsedSeconds * 0.9 + vessel.phase) * vessel.rollAmp;
      }
    },
    dispose: () => {
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}
