import * as THREE from 'three';
import type {
  BoxCollider,
  CombatDummySpec,
  InteractableSpec,
  NpcSpawnSpec,
  RampCollider,
} from '../core/types';
import type { MetropolisMaterials } from './ElarionMetropolisExpansion';
import type { PickablePropSpec } from './PickableProps';

export interface CastleVaelcrestOutput {
  group: THREE.Group;
  npcSpawns: NpcSpawnSpec[];
  interactables: InteractableSpec[];
  pickableSpecs: PickablePropSpec[];
  combatDummies: CombatDummySpec[];
  unlockGate: (gateId: string) => boolean;
  isGateOpen: (gateId: string) => boolean;
  update: (dt: number) => void;
}

/**
 * Castle Vaelcrest — Grand Coastal Citadel of House Vaelcrest (X = 135.5..305.0, Z = -40..88, Y = 5.20m)
 * Built strictly around canonical Vaelcrest Domain lore & Elarion visual architecture:
 * - Guarded Western Gatehouse (outside stays clear for Council Heights Mana-Rail Station [192, 5.2, 18.5])
 * - Walkable perimeter curtain walls & 11.4m rampart wall-walks via 2 navigable stone stair-ramps
 * - 4 Verdigris-Copper Bastion Towers + North Sea-Cliff Mana-Railgun Batteries & Aetheric Comm Spire
 * - Walkable roofed Great Hall & Three-Council Rotunda (Councils of Law, Authority, Elders) crowned by tall copper cupola & gold spire
 * - Walkable roofed Patriarch War Room (3D Domain Relief Map Table, Patriarch Alistair Vaelcrest)
 * - Walkable roofed Courts & Iron-Grilled Domain Treasury Vault
 * - Walkable roofed Residence Wing & Coastal Reflecting Garden (Lord Caelen Vaelcrest — Heir)
 * - Knight Training Yard with armored sparring dummies & commoner Heavy Infantry defenders
 */
export function buildCastleVaelcrest(
  boxColliders: BoxCollider[],
  rampColliders: RampCollider[],
  raycastTargets: THREE.Object3D[],
  disposables: Array<{ dispose: () => void }>,
  mats: MetropolisMaterials
): CastleVaelcrestOutput {
  const group = new THREE.Group();
  // Named with "Landmark" so WorldPartitionStreamer keeps the towering citadel visible across Elarion
  group.name = 'Castle_Vaelcrest_Landmark';

  const npcSpawns: NpcSpawnSpec[] = [];
  const interactables: InteractableSpec[] = [];
  const pickableSpecs: PickablePropSpec[] = [];
  const combatDummies: CombatDummySpec[] = [];

  const Y0 = 5.20;

  // Signature patinated green-copper domes, gilded finials & royal banners
  const matCopperPatina = new THREE.MeshStandardMaterial({
    color: 0x3b8c76,
    roughness: 0.36,
    metalness: 0.56,
  });
  const matGoldSpire = new THREE.MeshStandardMaterial({
    color: 0xdca84c,
    roughness: 0.24,
    metalness: 0.88,
  });
  const matBannerCrimson = new THREE.MeshStandardMaterial({
    color: 0x7c2629,
    roughness: 0.82,
    metalness: 0.06,
  });
  const matBannerTeal = new THREE.MeshStandardMaterial({
    color: 0x1e4d5c,
    roughness: 0.80,
    metalness: 0.08,
  });
  const matBullion = new THREE.MeshStandardMaterial({
    color: 0xe2b44f,
    roughness: 0.28,
    metalness: 0.90,
  });
  disposables.push(matCopperPatina, matGoldSpire, matBannerCrimson, matBannerTeal, matBullion);

  const addBox = (
    cx: number,
    baseY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    options?: { collide?: boolean; cameraBlock?: boolean; castShadow?: boolean }
  ): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(w, h, d);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(cx, baseY + h * 0.5, cz);
    mesh.castShadow = options?.castShadow ?? false;
    mesh.receiveShadow = true;
    group.add(mesh);

    if (options?.collide !== false) {
      boxColliders.push({
        minX: cx - w * 0.5,
        maxX: cx + w * 0.5,
        minY: baseY,
        maxY: baseY + h,
        minZ: cz - d * 0.5,
        maxZ: cz + d * 0.5,
      });
    }
    if (options?.cameraBlock !== false) {
      raycastTargets.push(mesh);
    }
    return mesh;
  };

  /**
   * Adds a hollow wall segment from minX..maxX, minZ..maxZ, baseY..baseY+h
   */
  const addWallSpan = (
    minX: number,
    maxX: number,
    baseY: number,
    h: number,
    minZ: number,
    maxZ: number,
    material: THREE.Material,
    collide = true
  ) => {
    addBox((minX + maxX) * 0.5, baseY, (minZ + maxZ) * 0.5, maxX - minX, h, maxZ - minZ, material, {
      collide,
    });
  };

  const addRamp = (
    cx: number,
    cz: number,
    w: number,
    len: number,
    axis: '+x' | '-x' | '+z' | '-z',
    yStart: number,
    yEnd: number,
    steps: number,
    material: THREE.Material
  ) => {
    const horiz = axis === '+x' || axis === '-x';
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const stepTop = THREE.MathUtils.lerp(yStart, yEnd, t);
      if (horiz) {
        const sx = cx - len * 0.5 + t * len;
        addBox(sx, yStart - 0.5, cz, len / steps + 0.08, stepTop - yStart + 0.5, w, material, {
          collide: false,
        });
      } else {
        const sz = cz - len * 0.5 + t * len;
        addBox(cx, yStart - 0.5, sz, w, stepTop - yStart + 0.5, len / steps + 0.08, material, {
          collide: false,
        });
      }
    }
    rampColliders.push({
      minX: cx - (horiz ? len : w) * 0.5,
      maxX: cx + (horiz ? len : w) * 0.5,
      minZ: cz - (horiz ? w : len) * 0.5,
      maxZ: cz + (horiz ? w : len) * 0.5,
      axis,
      yStart,
      yEnd,
    });
  };

  const addLamp = (x: number, y: number, z: number, cyan = false) => {
    addBox(x, y, z, 0.24, 3.6, 0.24, mats.iron);
    addBox(x, y + 3.6, z, 0.42, 0.52, 0.42, cyan ? mats.manaLamp : mats.warmLantern, {
      collide: false,
    });
    addBox(x, y + 4.12, z, 0.56, 0.14, 0.56, matCopperPatina, { collide: false });
  };

  const addTree = (x: number, y: number, z: number, scale = 1.0) => {
    addBox(x, y, z, 1.5 * scale, 0.42, 1.5 * scale, mats.sandstone);
    const trunkGeo = new THREE.CylinderGeometry(0.18 * scale, 0.28 * scale, 2.8 * scale, 7);
    const crownGeo = new THREE.DodecahedronGeometry(1.45 * scale, 1);
    disposables.push(trunkGeo, crownGeo);
    const trunk = new THREE.Mesh(trunkGeo, mats.darkTimber);
    trunk.position.set(x, y + 0.42 + 1.4 * scale, z);
    const crown = new THREE.Mesh(crownGeo, mats.foliage);
    crown.position.set(x, y + 0.42 + 3.2 * scale, z);
    group.add(trunk, crown);
  };

  // =========================================================================
  // 1. EASTERN CLIFF PLATEAU FOUNDATION & PUBLIC NOBLE HEIGHTS APPROACH
  // =========================================================================
  // Main cliff foundation plateau (X = 135.5..305.0, Z = -40..88, top Y = 5.20m)
  addBox(220.25, -0.4, 24.0, 169.5, 5.6, 128.0, mats.marbleInlay);
  // Cobble boulevard running east from Council Heights plaza up to Castle Gatehouse (X = 136..202)
  addBox(169.0, 5.14, 18.5, 66.0, 0.08, 9.0, mats.road, { collide: false });
  // Inner Grand Bailey cobble boulevard from Gatehouse to Great Hall Portal (X = 202..244)
  addBox(223.0, 5.14, 18.5, 42.0, 0.08, 10.0, mats.road, { collide: false });

  // Grand Citadel Steps descending South (y = 5.20 -> 0.16) at X = 148..164, Z = 88..112
  addRamp(156.0, 100.0, 16.0, 24.0, '-z', 0.16, Y0, 20, mats.limestone);
  addBox(208.5, -0.4, 104.0, 193.0, 0.56, 32.0, mats.pavement);

  // Eastern Cliff Perimeter Retaining Wall (X = 307, lower cliff edge) & Sea-Cliff Balustrade outside Gate
  addBox(307.0, 0.16, 140.0, 3.0, 14.0, 380.0, mats.sandstone);
  addBox(167.0, Y0, -40.3, 63.0, 1.35, 1.1, mats.sandstone);

  // Approach Gardens & Promenade Lanterns (completely clear of Mana-Rail Station [192, 5.2, 18.5] & Kiosk [186, 5.2, 13.5])
  addTree(146.0, Y0, -18.0, 1.2);
  addTree(168.0, Y0, -24.0, 1.25);
  addTree(168.0, Y0, 4.0, 1.15);
  addTree(146.0, Y0, 42.0, 1.2);
  addTree(174.0, Y0, 46.0, 1.25);
  for (const lx of [148, 168, 188]) {
    addLamp(lx, Y0, 12.2, false);
    addLamp(lx, Y0, 24.8, false);
  }

  // East Residential Estates & Civic Gardens south of Citadel Cliff (X = 185..302, Z = 166..328)
  addBox(243.5, -0.4, 247.0, 117.0, 0.56, 162.0, mats.pavement);
  for (const [ex, ez, col] of [
    [212, 196, mats.warmPlaster],
    [264, 196, mats.sagePlaster],
    [212, 248, mats.terracottaPlaster],
    [264, 248, mats.brick],
    [212, 298, mats.sandstone],
    [264, 298, mats.warmPlaster],
  ] as Array<[number, number, THREE.Material]>) {
    addBox(ex, 0.16, ez, 32.0, 9.2, 24.0, col);
    addBox(ex, 9.36, ez, 33.2, 2.0, 25.2, mats.slateRoof);
    addTree(ex - 20.0, 0.16, ez, 1.2);
  }

  // =========================================================================
  // 2. FORTIFIED WESTERN GATEHOUSE (X = 198..206, Z = 2.5..34.5) & ANIMATED GATE
  // =========================================================================
  // Twin limestone Gatehouse Towers flanking a 12m central passage (Z = 12.5..24.5)
  const gateTowerCapGeo = new THREE.ConeGeometry(6.8, 7.6, 4);
  const spireTipGeo = new THREE.ConeGeometry(0.95, 5.2, 6);
  disposables.push(gateTowerCapGeo, spireTipGeo);

  for (const gz of [7.5, 29.5]) {
    addBox(202.0, Y0, gz, 8.2, 16.5, 10.0, mats.limestone);
    addBox(202.0, Y0 + 16.5, gz, 9.0, 1.0, 10.8, mats.sandstone);
    const cap = new THREE.Mesh(gateTowerCapGeo, matCopperPatina);
    cap.position.set(202.0, Y0 + 21.2, gz);
    cap.rotation.y = Math.PI / 4;
    const tip = new THREE.Mesh(spireTipGeo, matGoldSpire);
    tip.position.set(202.0, Y0 + 26.8, gz);
    group.add(cap, tip);
  }
  // Overhead Machicolated Gatehouse Arch Bridge (Y = 12.2..17.6, 7m vertical clearance above 5.20!)
  addBox(202.0, Y0 + 7.0, 18.5, 8.0, 5.4, 12.4, mats.sandstone);
  // House Vaelcrest Heraldic Crest above Gate Arch
  addBox(197.8, Y0 + 8.6, 18.5, 0.35, 2.8, 2.4, matBannerCrimson, { collide: false });
  addBox(197.65, Y0 + 8.8, 18.5, 0.25, 1.5, 1.3, matGoldSpire, { collide: false });

  // Twin Mana Barrier Pylons flanking Gatehouse Approach
  for (const pz of [11.2, 25.8]) {
    addBox(196.8, Y0, pz, 1.3, 5.2, 1.3, mats.iron);
    addBox(196.8, Y0 + 5.2, pz, 0.9, 1.5, 0.9, mats.manaLamp, { collide: false });
  }

  // Interactive Double Oak-and-Iron Citadel Gate Doors (vaelcrest_castle_gate) at X = 202.0, Z = 12.5..24.5
  let castleGateUnlocked = false;
  const castleGateCollider: BoxCollider = {
    minX: 201.3,
    maxX: 202.7,
    minY: Y0,
    maxY: Y0 + 7.2,
    minZ: 12.4,
    maxZ: 24.6,
  };
  boxColliders.push(castleGateCollider);

  const cDoorGeo = new THREE.BoxGeometry(0.6, 7.0, 6.0);
  const cBandGeo = new THREE.BoxGeometry(0.75, 0.42, 6.02);
  disposables.push(cDoorGeo, cBandGeo);

  const cNorthGatePivot = new THREE.Group();
  cNorthGatePivot.position.set(202.0, Y0, 12.5);
  const cNorthLeaf = new THREE.Mesh(cDoorGeo, mats.darkTimber);
  cNorthLeaf.position.set(0, 3.5, 3.0);
  const cNorthBandA = new THREE.Mesh(cBandGeo, mats.iron);
  cNorthBandA.position.set(0, 1.8, 3.0);
  const cNorthBandB = new THREE.Mesh(cBandGeo, mats.iron);
  cNorthBandB.position.set(0, 5.2, 3.0);
  cNorthGatePivot.add(cNorthLeaf, cNorthBandA, cNorthBandB);

  const cSouthGatePivot = new THREE.Group();
  cSouthGatePivot.position.set(202.0, Y0, 24.5);
  const cSouthLeaf = new THREE.Mesh(cDoorGeo, mats.darkTimber);
  cSouthLeaf.position.set(0, 3.5, -3.0);
  const cSouthBandA = new THREE.Mesh(cBandGeo, mats.iron);
  cSouthBandA.position.set(0, 1.8, -3.0);
  const cSouthBandB = new THREE.Mesh(cBandGeo, mats.iron);
  cSouthBandB.position.set(0, 5.2, -3.0);
  cSouthGatePivot.add(cSouthLeaf, cSouthBandA, cSouthBandB);

  group.add(cNorthGatePivot, cSouthGatePivot);
  raycastTargets.push(cNorthLeaf, cSouthLeaf);

  // =========================================================================
  // 3. PERIMETER CURTAIN WALLS, 4 CORNER BASTIONS & WALKABLE 11.4m RAMPARTS
  // =========================================================================
  const RAMPART_Y = Y0 + 6.2; // 11.40m walkable parapet wall-walk

  // North Sea-Cliff Curtain Wall (X = 200..304, Z = -39.5..-35.0)
  addWallSpan(200.0, 304.0, Y0, 6.2, -39.5, -35.0, mats.sandstone);
  // South Cliff Curtain Wall (X = 200..304, Z = 82.0..86.5)
  addWallSpan(200.0, 304.0, Y0, 6.2, 82.0, 86.5, mats.sandstone);
  // East Seaward Curtain Wall (X = 299.5..304.0, Z = -35.0..82.0)
  addWallSpan(299.5, 304.0, Y0, 6.2, -35.0, 82.0, mats.sandstone);
  // West North Curtain Wall (X = 200.0..204.2, Z = -35.0..2.5)
  addWallSpan(200.0, 204.2, Y0, 6.2, -35.0, 2.5, mats.sandstone);
  // West South Curtain Wall (X = 200.0..204.2, Z = 34.5..82.0)
  addWallSpan(200.0, 204.2, Y0, 6.2, 34.5, 82.0, mats.sandstone);

  // Inner Safety Parapet Curbs (keep walkable ramparts easy to patrol without falling off!)
  addWallSpan(204.2, 299.5, RAMPART_Y, 0.85, -35.2, -34.6, mats.limestone);
  addWallSpan(204.2, 299.5, RAMPART_Y, 0.85, 81.6, 82.2, mats.limestone);
  addWallSpan(299.3, 299.9, RAMPART_Y, 0.85, -34.6, 81.6, mats.limestone);

  // Outer Crenellation Merlons via InstancedMesh (anti-per-mesh bloat)
  const merlonPositions: Array<[number, number, number]> = [];
  for (let mx = 207; mx <= 297; mx += 4.5) {
    merlonPositions.push([mx, RAMPART_Y + 0.58, -39.1]);
    merlonPositions.push([mx, RAMPART_Y + 0.58, 86.1]);
  }
  for (let mz = -32; mz <= 79; mz += 4.5) {
    merlonPositions.push([303.6, RAMPART_Y + 0.58, mz]);
    if (mz < 1 || mz > 36) {
      merlonPositions.push([200.4, RAMPART_Y + 0.58, mz]);
    }
  }
  const merlonGeo = new THREE.BoxGeometry(1.8, 1.16, 0.85);
  disposables.push(merlonGeo);
  const merlonInst = new THREE.InstancedMesh(merlonGeo, mats.limestone, merlonPositions.length);
  const dummy = new THREE.Object3D();
  merlonPositions.forEach(([x, y, z], idx) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, x > 299 || x < 205 ? Math.PI / 2 : 0, 0);
    dummy.updateMatrix();
    merlonInst.setMatrixAt(idx, dummy.matrix);
  });
  merlonInst.computeBoundingSphere();
  group.add(merlonInst);

  // 4 Corner Bastion Towers with Verdigris-Copper Roofs & Gold Finials
  const bastionBodyGeo = new THREE.CylinderGeometry(5.6, 6.1, 18.0, 8);
  const bastionCapGeo = new THREE.ConeGeometry(6.3, 8.2, 8);
  const bastionPinGeo = new THREE.CylinderGeometry(0.18, 0.55, 5.4, 8);
  disposables.push(bastionBodyGeo, bastionCapGeo, bastionPinGeo);

  for (const [bx, bz] of [
    [201.5, -37.5],
    [302.0, -37.5],
    [201.5, 84.5],
    [302.0, 84.5],
  ]) {
    const body = new THREE.Mesh(bastionBodyGeo, mats.limestone);
    body.position.set(bx, Y0 + 9.0, bz);
    const cap = new THREE.Mesh(bastionCapGeo, matCopperPatina);
    cap.position.set(bx, Y0 + 22.1, bz);
    const pin = new THREE.Mesh(bastionPinGeo, matGoldSpire);
    pin.position.set(bx, Y0 + 28.4, bz);
    group.add(body, cap, pin);
    boxColliders.push({
      minX: bx - 5.4,
      maxX: bx + 5.4,
      minY: Y0,
      maxY: Y0 + 18.5,
      minZ: bz - 5.4,
      maxZ: bz + 5.4,
    });
  }

  // 2 Broad Navigable Inner Stone Stair-Ramps ascending from Bailey (5.20m) up to Ramparts (11.40m)
  // NW Stair: south bottom at Z = -12, climbs north (-z) up to Z = -34.5 along X = 207.2
  addRamp(207.2, -23.25, 4.0, 22.5, '-z', Y0, RAMPART_Y, 24, mats.limestone);
  addWallSpan(204.5, 205.2, Y0, 7.2, -34.5, -12.0, mats.sandstone);
  addWallSpan(209.2, 209.8, Y0, 7.0, -34.5, -12.0, mats.sandstone);

  // SW Stair: north bottom at Z = 59.5, climbs south (+z) up to Z = 82.0 along X = 207.2
  addRamp(207.2, 70.75, 4.0, 22.5, '+z', Y0, RAMPART_Y, 24, mats.limestone);
  addWallSpan(204.5, 205.2, Y0, 7.2, 59.5, 82.0, mats.sandstone);
  addWallSpan(209.2, 209.8, Y0, 7.0, 59.5, 82.0, mats.sandstone);

  // 3 Sea-Cliff Coastal Mana-Railgun Barbette Towers along North Rampart (Y = 11.40m)
  const railBarrelGeo = new THREE.CylinderGeometry(0.28, 0.42, 7.8, 10);
  const turretDrumGeo = new THREE.CylinderGeometry(1.75, 2.0, 1.35, 10);
  disposables.push(railBarrelGeo, turretDrumGeo);
  for (const rx of [228.0, 256.0, 284.0]) {
    const drum = new THREE.Mesh(turretDrumGeo, mats.iron);
    drum.position.set(rx, RAMPART_Y + 0.68, -37.8);
    group.add(drum);
    boxColliders.push({
      minX: rx - 1.8,
      maxX: rx + 1.8,
      minY: RAMPART_Y,
      maxY: RAMPART_Y + 2.4,
      minZ: -39.4,
      maxZ: -36.2,
    });
    for (const bxOff of [-0.45, 0.45]) {
      const barrel = new THREE.Mesh(railBarrelGeo, mats.copper);
      barrel.rotation.x = -Math.PI / 2 + 0.24;
      barrel.position.set(rx + bxOff, RAMPART_Y + 2.2, -39.8);
      group.add(barrel);
    }
    addBox(rx, RAMPART_Y + 1.4, -37.4, 1.5, 0.55, 2.2, mats.manaLamp, { collide: false });
  }

  // North-East Aetheric Communication & Barrier Spire (X = 294, Z = -37.4, rising above sea cliff)
  addBox(294.0, RAMPART_Y, -37.4, 2.4, 10.5, 2.4, mats.iron);
  addBox(294.0, RAMPART_Y + 10.5, -37.4, 1.2, 4.2, 1.2, mats.manaLamp, { collide: false });
  addBox(294.0, RAMPART_Y + 14.7, -37.4, 0.45, 3.6, 0.45, matGoldSpire, { collide: false });

  // =========================================================================
  // 4. WALKABLE ROOFED GREAT HALL & THREE-COUNCIL ROTUNDA (X = 242..294, Z = -4..38)
  // =========================================================================
  // Polished inlaid floor (Y = 5.22m)
  addBox(268.0, Y0, 17.0, 50.0, 0.04, 40.0, mats.marbleInlay, { collide: false });
  // Crimson Heraldic Carpet Runner down nave center
  addBox(267.0, Y0 + 0.04, 18.5, 42.0, 0.03, 5.4, matBannerCrimson, { collide: false });

  // Perimeter Walls with 3 Wide Open Arched Portals (West Bailey, North Residence, South War Room)
  // West Wall X = 242..244 (open portal Z = 15..22)
  addWallSpan(242.0, 244.0, Y0, 13.0, -4.0, 15.0, mats.limestone);
  addWallSpan(242.0, 244.0, Y0, 13.0, 22.0, 38.0, mats.limestone);
  addWallSpan(242.0, 244.0, Y0 + 7.2, 5.8, 15.0, 22.0, mats.sandstone); // Portal arch lintel (Y=12.4..18.2)
  // East Wall X = 292..294 (solid apse with warm stained-glass window recesses)
  addWallSpan(292.0, 294.0, Y0, 13.0, -4.0, 38.0, mats.limestone);
  addBox(291.85, Y0 + 2.8, 17.0, 0.2, 6.2, 12.0, mats.warmLantern, { collide: false });
  // North Wall Z = -4..-2 (open portal X = 264..270 into Residence Wing)
  addWallSpan(244.0, 264.0, Y0, 13.0, -4.0, -2.0, mats.limestone);
  addWallSpan(270.0, 292.0, Y0, 13.0, -4.0, -2.0, mats.limestone);
  addWallSpan(264.0, 270.0, Y0 + 7.2, 5.8, -4.0, -2.0, mats.sandstone);
  // South Wall Z = 36..38 (open portal X = 264..270 into Patriarch War Room)
  addWallSpan(244.0, 264.0, Y0, 13.0, 36.0, 38.0, mats.limestone);
  addWallSpan(270.0, 292.0, Y0, 13.0, 36.0, 38.0, mats.limestone);
  addWallSpan(264.0, 270.0, Y0 + 7.2, 5.8, 36.0, 38.0, mats.sandstone);

  // Exterior West Portico Colonnade facing Bailey
  for (const pz of [5.0, 12.0, 25.0, 32.0]) {
    addBox(238.5, Y0, pz, 1.3, 10.6, 1.3, mats.sandstone);
  }
  addBox(240.0, Y0 + 10.6, 18.5, 4.4, 2.2, 30.0, mats.limestone);

  // Roof Vault Slab & Monumental Iconic Copper-Domed + Gold-Spired Rotunda Silhouette
  addBox(268.0, Y0 + 13.0, 17.0, 53.5, 1.6, 43.5, mats.sandstone);
  addBox(268.0, Y0 + 14.6, 17.0, 46.0, 4.2, 36.0, mats.slateRoof);

  const rotundaDrumGeo = new THREE.CylinderGeometry(14.5, 15.6, 8.8, 16);
  const rotundaDomeGeo = new THREE.SphereGeometry(14.8, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.54);
  const centralSpireGeo = new THREE.ConeGeometry(4.2, 21.0, 12);
  const turretBodyGeo = new THREE.CylinderGeometry(2.6, 3.0, 14.0, 8);
  const turretSpireGeo = new THREE.ConeGeometry(2.9, 10.5, 8);
  disposables.push(rotundaDrumGeo, rotundaDomeGeo, centralSpireGeo, turretBodyGeo, turretSpireGeo);

  const drum = new THREE.Mesh(rotundaDrumGeo, mats.limestone);
  drum.position.set(268.0, Y0 + 23.0, 17.0);
  const dome = new THREE.Mesh(rotundaDomeGeo, matCopperPatina);
  dome.position.set(268.0, Y0 + 26.8, 17.0);
  const centralSpire = new THREE.Mesh(centralSpireGeo, matGoldSpire);
  centralSpire.position.set(268.0, Y0 + 46.5, 17.0);
  group.add(drum, dome, centralSpire);

  // 4 Flanking Rotunda Corner Turrets (Iconic Multi-Spired Skyline from Screenshots)
  for (const [tx, tz] of [
    [251.0, 2.0],
    [285.0, 2.0],
    [251.0, 32.0],
    [285.0, 32.0],
  ]) {
    const tb = new THREE.Mesh(turretBodyGeo, mats.sandstone);
    tb.position.set(tx, Y0 + 25.0, tz);
    const ts = new THREE.Mesh(turretSpireGeo, matGoldSpire);
    ts.position.set(tx, Y0 + 36.8, tz);
    group.add(tb, ts);
  }

  // Interior Great Hall Colonade Columns & Three-Council Dais Tables
  for (const cx of [253, 267, 281]) {
    addBox(cx, Y0, 4.5, 1.1, 12.8, 1.1, mats.sandstone);
    addBox(cx, Y0, 29.5, 1.1, 12.8, 1.1, mats.sandstone);
  }
  // 1) Council of Law Dais (NE Bay)
  addBox(280.0, Y0, 9.0, 7.5, 0.45, 5.5, mats.limestone);
  addBox(280.0, Y0 + 0.45, 9.0, 4.8, 1.05, 1.6, mats.darkTimber);
  addBox(280.0, Y0 + 1.5, 9.0, 4.9, 0.08, 1.7, matBannerTeal, { collide: false });
  // 2) Council of Authority Dais (SE Bay)
  addBox(280.0, Y0, 26.0, 7.5, 0.45, 5.5, mats.limestone);
  addBox(280.0, Y0 + 0.45, 26.0, 4.8, 1.05, 1.6, mats.darkTimber);
  addBox(280.0, Y0 + 1.5, 26.0, 4.9, 0.08, 1.7, matBannerCrimson, { collide: false });
  // 3) Council of Elders Raised High Seat (East Apse)
  addBox(288.0, Y0, 17.5, 5.0, 0.72, 10.0, mats.limestone);
  addBox(288.0, Y0 + 0.72, 17.5, 2.2, 1.25, 6.2, mats.timber);
  // Wall Sconces & Banners inside Great Hall
  for (const bx of [253, 267, 281]) {
    addBox(bx, Y0 + 4.5, -1.75, 1.8, 4.2, 0.14, matBannerCrimson, { collide: false });
    addBox(bx, Y0 + 4.5, 35.75, 1.8, 4.2, 0.14, matBannerTeal, { collide: false });
  }

  // =========================================================================
  // 5. WALKABLE ROOFED PATRIARCH WAR ROOM (X = 244..294, Z = 40..78)
  // =========================================================================
  // Covered passage roof joining Great Hall South Portal -> War Room North Portal (Z = 38..40)
  addWallSpan(262.0, 264.0, Y0, 10.0, 38.0, 40.0, mats.limestone);
  addWallSpan(270.0, 272.0, Y0, 10.0, 38.0, 40.0, mats.limestone);
  addWallSpan(262.0, 272.0, Y0 + 7.2, 3.0, 38.0, 40.0, mats.slateRoof);

  // Floor (Y = 5.22m)
  addBox(269.0, Y0, 59.0, 48.0, 0.04, 36.0, mats.timber, { collide: false });
  // Walls: North portal X = 264..270, West portal Z = 55..61
  addWallSpan(244.0, 264.0, Y0, 10.2, 40.0, 42.0, mats.brick);
  addWallSpan(270.0, 294.0, Y0, 10.2, 40.0, 42.0, mats.brick);
  addWallSpan(264.0, 270.0, Y0 + 7.0, 3.2, 40.0, 42.0, mats.sandstone);
  addWallSpan(244.0, 246.0, Y0, 10.2, 42.0, 55.0, mats.brick);
  addWallSpan(244.0, 246.0, Y0, 10.2, 61.0, 78.0, mats.brick);
  addWallSpan(244.0, 246.0, Y0 + 7.0, 3.2, 55.0, 61.0, mats.sandstone);
  addWallSpan(292.0, 294.0, Y0, 10.2, 42.0, 78.0, mats.brick);
  addWallSpan(244.0, 294.0, Y0, 10.2, 76.0, 78.0, mats.brick);
  // War Room Roof & Copper Hip Cap
  addBox(269.0, Y0 + 10.2, 59.0, 52.0, 1.3, 40.0, mats.sandstone);
  addBox(269.0, Y0 + 11.5, 59.0, 48.0, 3.2, 36.0, mats.slateRoof);

  // Centerpiece: Sculpted 3D Relief Map Table of the Vaelcrest Domain (269, 5.22, 59)
  addBox(269.0, Y0, 59.0, 8.2, 1.05, 5.4, mats.darkTimber);
  addBox(269.0, Y0 + 1.05, 59.0, 7.6, 0.16, 4.8, mats.water, { collide: false }); // Sea bay relief
  addBox(269.0, Y0 + 1.12, 59.8, 7.4, 0.24, 3.2, mats.foliage, { collide: false }); // Green inland wilds
  addBox(271.2, Y0 + 1.24, 58.9, 1.4, 0.35, 1.1, mats.limestone, { collide: false }); // Citadel ridge miniature
  addBox(267.0, Y0 + 1.32, 60.4, 2.6, 0.55, 0.9, mats.sandstone, { collide: false }); // Highland range miniature
  addBox(269.0, Y0 + 1.26, 59.4, 5.2, 0.08, 0.12, mats.manaLamp, { collide: false }); // Mana-rail corridor pin
  // Warm Hearth & Tactical Weapon Stands along East War Room Wall
  addBox(290.6, Y0, 59.0, 2.2, 3.4, 5.8, mats.darkBrick);
  addBox(289.8, Y0 + 0.3, 59.0, 0.9, 1.4, 2.8, mats.furnaceGlow, { collide: false });

  // =========================================================================
  // 6. WALKABLE ROOFED COURTS & DOMAIN TREASURY VAULT (X = 212..240, Z = 50..79)
  // =========================================================================
  addBox(226.0, Y0, 64.5, 26.0, 0.04, 27.0, mats.limestone, { collide: false });
  // Walls: North portal X = 223..229
  addWallSpan(212.0, 223.0, Y0, 9.6, 50.0, 51.8, mats.limestone);
  addWallSpan(229.0, 240.0, Y0, 9.6, 50.0, 51.8, mats.limestone);
  addWallSpan(223.0, 229.0, Y0 + 6.8, 2.8, 50.0, 51.8, mats.sandstone);
  addWallSpan(212.0, 213.8, Y0, 9.6, 51.8, 79.0, mats.limestone);
  addWallSpan(238.2, 240.0, Y0, 9.6, 51.8, 79.0, mats.limestone);
  addWallSpan(212.0, 240.0, Y0, 9.6, 77.2, 79.0, mats.limestone);
  addBox(226.0, Y0 + 9.6, 64.5, 30.0, 1.2, 31.0, mats.sandstone);
  addBox(226.0, Y0 + 10.8, 64.5, 27.0, 2.6, 28.0, mats.slateRoof);

  // Magistrate Court (West half X = 214..227) & Iron-Grilled Treasury Partition (X = 227.5, open archway Z = 60..66)
  addWallSpan(227.2, 228.0, Y0, 6.8, 52.0, 60.0, mats.iron);
  addWallSpan(227.2, 228.0, Y0, 6.8, 66.0, 77.0, mats.iron);
  addWallSpan(227.2, 228.0, Y0 + 5.8, 3.8, 60.0, 66.0, mats.iron);
  // Magistrate Dais & Witness Benches
  addBox(217.5, Y0, 73.0, 6.0, 0.55, 2.8, mats.darkTimber);
  addBox(217.5, Y0 + 0.55, 72.2, 5.2, 1.05, 1.1, mats.timber);
  addBox(218.5, Y0, 64.5, 5.0, 0.55, 1.2, mats.timber);
  addBox(218.5, Y0, 60.5, 5.0, 0.55, 1.2, mats.timber);
  // Treasury Gold Bullion Stacks & Sealed Mana Vault Coffers (East half X = 230..237)
  addBox(234.8, Y0, 56.5, 2.8, 1.4, 2.4, matBullion);
  addBox(234.8, Y0, 62.0, 2.8, 1.8, 2.4, mats.copper);
  addBox(234.8, Y0, 68.5, 2.6, 1.3, 2.2, mats.iron);
  addBox(234.8, Y0 + 1.3, 68.5, 1.2, 1.1, 1.2, mats.manaLamp, { collide: false });

  // =========================================================================
  // 7. RESIDENCE WING & CLIFF REFLECTING GARDEN (X = 212..294, Z = -33..-5)
  // =========================================================================
  // West Reflecting Garden Courtyard overlooking Harbour Bay (X = 212..242, Z = -33..-5)
  addBox(227.0, Y0, -19.0, 18.0, 0.52, 14.0, mats.limestone);
  addBox(227.0, Y0 + 0.34, -19.0, 16.0, 0.24, 12.0, mats.water, { collide: false });
  addTree(216.0, Y0, -29.0, 1.1);
  addTree(216.0, Y0, -9.0, 1.1);
  addLamp(238.0, Y0, -27.5, false);
  addLamp(238.0, Y0, -10.5, false);

  // East Walkable Roofed Vaelcrest Residence Wing & Heir Study (X = 244..294, Z = -33..-5)
  // Covered passage linking Residence South Portal -> Great Hall North Portal (Z = -5..-4)
  addWallSpan(262.0, 264.0, Y0, 10.0, -5.0, -4.0, mats.limestone);
  addWallSpan(270.0, 272.0, Y0, 10.0, -5.0, -4.0, mats.limestone);
  addWallSpan(262.0, 272.0, Y0 + 7.2, 3.0, -5.0, -4.0, mats.slateRoof);

  addBox(269.0, Y0, -19.0, 48.0, 0.04, 26.0, mats.timber, { collide: false });
  // Walls: West portal Z = -22..-15 (facing Reflecting Garden), South portal X = 264..270
  addWallSpan(244.0, 246.0, Y0, 10.2, -33.0, -22.0, mats.warmPlaster);
  addWallSpan(244.0, 246.0, Y0, 10.2, -15.0, -5.0, mats.warmPlaster);
  addWallSpan(244.0, 246.0, Y0 + 7.0, 3.2, -22.0, -15.0, mats.sandstone);
  addWallSpan(244.0, 294.0, Y0, 10.2, -33.0, -31.2, mats.warmPlaster);
  addWallSpan(292.0, 294.0, Y0, 10.2, -31.2, -5.0, mats.warmPlaster);
  addWallSpan(244.0, 264.0, Y0, 10.2, -6.8, -5.0, mats.warmPlaster);
  addWallSpan(270.0, 294.0, Y0, 10.2, -6.8, -5.0, mats.warmPlaster);
  addWallSpan(264.0, 270.0, Y0 + 7.0, 3.2, -6.8, -5.0, mats.sandstone);

  addBox(269.0, Y0 + 10.2, -19.0, 52.0, 1.3, 30.0, mats.sandstone);
  addBox(269.0, Y0 + 11.5, -19.0, 48.0, 3.2, 26.0, matCopperPatina);

  // Residence Furnishings: Hearth Study Fireplace, Oak Banquet Table, Bookshelves
  addBox(290.6, Y0, -19.0, 2.0, 3.4, 5.2, mats.darkBrick);
  addBox(289.8, Y0 + 0.3, -19.0, 0.85, 1.3, 2.4, mats.furnaceGlow, { collide: false });
  addBox(260.0, Y0, -19.0, 8.0, 0.95, 2.8, mats.darkTimber);
  addBox(278.0, Y0, -29.2, 9.0, 3.2, 1.4, mats.timber);
  addBox(278.0, Y0, -8.8, 9.0, 3.2, 1.4, mats.timber);

  // =========================================================================
  // 8. KNIGHT TRAINING YARD (X = 212..240, Z = 27..49)
  // =========================================================================
  addBox(226.0, Y0 - 0.04, 38.0, 26.0, 0.06, 20.0, mats.pavement, { collide: false });
  // Weapon Racks & House Vaelcrest Heraldic Mast
  addBox(215.5, Y0, 46.5, 4.5, 2.1, 0.85, mats.darkTimber);
  addBox(235.5, Y0, 46.5, 4.5, 2.1, 0.85, mats.darkTimber);
  addBox(214.0, Y0, 29.0, 0.4, 8.0, 0.4, mats.iron);
  addBox(214.0, Y0 + 5.2, 29.0, 0.14, 2.6, 1.6, matBannerCrimson, { collide: false });

  // Combat Sparring Dummies inside Knight Training Yard
  combatDummies.push(
    {
      id: 'el_dummy_citadel_north',
      name: 'House Vaelcrest Knight Dummy',
      position: [222.0, Y0, 34.0],
      facingYaw: -1.57,
      maxHp: 260,
      armored: true,
    },
    {
      id: 'el_dummy_citadel_south',
      name: 'Domain Lancer Dummy',
      position: [232.0, Y0, 40.0],
      facingYaw: -2.2,
      maxHp: 220,
      armored: true,
    }
  );

  // =========================================================================
  // 9. CASTLE VAELCREST NPCs & HOUSE VAELCREST LEADERSHIP
  // =========================================================================
  npcSpawns.push(
    // Commander Brenna — Heavy Infantry Gatehouse Commander (unlocks vaelcrest_castle_gate)
    {
      id: 'npc_vaelcrest_commander_brenna',
      role: 'Heavy Infantry',
      heavyArmor: true,
      behavior: 'interact',
      actionKind: 'watch',
      position: [195.2, Y0, 15.2],
      facingYaw: -1.57,
      tunicColor: 0x24303c,
      accentColor: 0xdca84c,
      initialDialogueNodeId: 'castle_halt',
      dialogueTree: [
        {
          id: 'castle_halt',
          npcReaction: 'salute',
          lines: [
            'Halt at Castle Vaelcrest’s Western Gatehouse! I am Commander Brenna of the House Vaelcrest Guard.',
            'I rose from common dock-ward stock on merit alone—here, discipline and capability open every gate. State your business within the citadel.',
          ],
          choices: [
            {
              label: 'Request admission to the Three-Council Rotunda & War Room',
              nextNodeId: 'castle_grant',
              npcReaction: 'nod',
            },
            {
              label: 'Inquire about House Vaelcrest’s governance and councils',
              nextNodeId: 'castle_lore',
              npcReaction: 'point',
            },
            {
              label: 'Step back toward Council Heights Station',
              closeDialogue: true,
              npcReaction: 'salute',
            },
          ],
        },
        {
          id: 'castle_lore',
          npcReaction: 'point',
          lines: [
            'The Patriarch holds hereditary sovereignty as our Warrior Lord, while Lord Caelen administers the daily workings of courts, treasury, and rail.',
            'Descendant rulers founded the Council of Law, Council of Authority, and Council of Elders so capable citizens govern alongside House Vaelcrest.',
          ],
          choices: [
            {
              label: 'Grant me clearance — unbar the Citadel Gatehouse',
              nextNodeId: 'castle_open',
              npcReaction: 'salute',
              playerEmote: 'salute',
              unlockGateId: 'vaelcrest_castle_gate',
            },
            {
              label: 'Thank you, Commander',
              closeDialogue: true,
              npcReaction: 'nod',
            },
          ],
        },
        {
          id: 'castle_grant',
          npcReaction: 'salute',
          lines: [
            'By order of Lord Caelen Vaelcrest, citizens in good standing are welcome in the Outer Bailey, Great Hall, Courts, and North Battlements. Confirm your pledge:',
          ],
          choices: [
            {
              label: 'Present Vaelcrest Civic Pass & enter the Citadel (+15 Vaelcrest Rep)',
              nextNodeId: 'castle_open',
              npcReaction: 'salute',
              playerEmote: 'salute',
              unlockGateId: 'vaelcrest_castle_gate',
              questBranch: {
                questId: 'q_council_conspiracy',
                stageIndex: 1,
                label: 'Granted Citadel Access by Commander Brenna',
                faction: 'vaelcrest',
                repDelta: 15,
              },
            },
            {
              label: 'Enter quietly as an observer',
              nextNodeId: 'castle_open',
              npcReaction: 'nod',
              playerEmote: 'wave',
              unlockGateId: 'vaelcrest_castle_gate',
            },
          ],
        },
        {
          id: 'castle_open',
          npcReaction: 'wave',
          lines: [
            'Gatehouse bolts drawn! Beyond the arch lie the Knight Training Yard, Great Hall of the Three Councils, Patriarch War Room, and North Railgun Ramparts.',
          ],
          choices: [
            {
              label: 'Cross the Citadel threshold',
              closeDialogue: true,
              npcReaction: 'salute',
            },
          ],
        },
      ],
    },
    {
      id: 'npc_vaelcrest_sentry_south',
      role: 'Heavy Infantry',
      heavyArmor: true,
      behavior: 'idle',
      actionKind: 'watch',
      position: [195.4, Y0, 22.8],
      facingYaw: -1.57,
      tunicColor: 0x24303c,
      accentColor: 0x3b8c76,
    },
    // Patriarch Alistair Vaelcrest — Warrior Lord in the War Room
    {
      id: 'npc_patriarch_vaelcrest',
      role: 'Harbourmaster',
      heavyArmor: true,
      behavior: 'interact',
      actionKind: 'announce',
      position: [263.2, Y0 + 0.04, 59.0],
      facingYaw: 1.57,
      tunicColor: 0x541e22,
      accentColor: 0xdca84c,
      initialDialogueNodeId: 'patriarch_greet',
      dialogueTree: [
        {
          id: 'patriarch_greet',
          npcReaction: 'nod',
          lines: [
            'You stand before the War Table of House Vaelcrest. Eight centuries ago our founders bridged coastal harbour and highland pass with disciplined steel.',
            'True strength rests on external-mana artillery, trained commoner levies, and a realm where any citizen can rise by merit.',
          ],
          choices: [
            {
              label: 'Ask about Elarion’s coastal defence strategy',
              nextNodeId: 'patriarch_strategy',
              npcReaction: 'point',
            },
            {
              label: 'Ask about Lord Caelen’s daily administration',
              nextNodeId: 'patriarch_heir',
              npcReaction: 'nod',
            },
            {
              label: 'Offer a warrior’s salute and depart',
              closeDialogue: true,
              npcReaction: 'salute',
              playerEmote: 'salute',
            },
          ],
        },
        {
          id: 'patriarch_strategy',
          npcReaction: 'point',
          lines: [
            'See the northern sea-cliff pins on the relief table: our twin-rail mana batteries interlock with Harbour breakwaters while the rail viaducts feed foundry ammunition uninterrupted.',
          ],
          choices: [
            {
              label: 'Formidable logistics, Lord Patriarch',
              closeDialogue: true,
              npcReaction: 'salute',
            },
          ],
        },
        {
          id: 'patriarch_heir',
          npcReaction: 'nod',
          lines: [
            'My son Caelen handles day-to-day treasury tariffs, council decrees, and harbour charters in the Residence Wing north of the Rotunda—leaving me free to keep watch over the realm’s sword.',
          ],
          choices: [
            {
              label: 'I will seek Lord Caelen in the Residence Wing',
              closeDialogue: true,
              npcReaction: 'nod',
            },
          ],
        },
      ],
    },
    // Lord Caelen Vaelcrest — Patriarch's Son & Heir in the Residence Wing
    {
      id: 'npc_lord_caelen_vaelcrest',
      role: 'Scholar',
      behavior: 'interact',
      actionKind: 'clipboard',
      position: [268.0, Y0 + 0.04, -19.0],
      facingYaw: -1.57,
      tunicColor: 0x1e4d5c,
      accentColor: 0xdca84c,
      initialDialogueNodeId: 'caelen_greet',
      dialogueTree: [
        {
          id: 'caelen_greet',
          npcReaction: 'bow',
          lines: [
            'Welcome to the Residence Wing. I am Caelen Vaelcrest—between harbour tariff dispatches and Mana-Rail expansion charters, the ink rarely dries here.',
            'My father anchors our military resolve while I oversee the Three Councils’ daily coordination across agriculture, mining, and maritime trade.',
          ],
          choices: [
            {
              label: 'Discuss expanding Elarion’s Mana-Rail corridors',
              nextNodeId: 'caelen_rail',
              npcReaction: 'nod',
            },
            {
              label: 'Take leave respectfully',
              closeDialogue: true,
              npcReaction: 'bow',
              playerEmote: 'wave',
            },
          ],
        },
        {
          id: 'caelen_rail',
          npcReaction: 'point',
          lines: [
            'Council Heights Station outside our gatehouse already links directly to Harbour Quay and Grand Exchange. Soon our inland spurs will reach the furthest mining fiefs.',
          ],
          choices: [
            {
              label: 'Carry on your work, Lord Caelen',
              closeDialogue: true,
              npcReaction: 'nod',
            },
          ],
        },
      ],
    },
    // High Chancellor & Three Council Members inside Great Hall & Rotunda
    {
      id: 'npc_council_administrator',
      role: 'Harbourmaster',
      behavior: 'interact',
      actionKind: 'clipboard',
      position: [255.0, Y0 + 0.04, 18.5],
      facingYaw: -1.57,
      tunicColor: 0x23384d,
      accentColor: 0xe6b85c,
      randomDialogues: [
        ['Here beneath the copper cupola sit the Council of Law, the Council of Authority, and the Council of Elders.'],
        ['Our founder ruled by martial charter alone; later Vaelcrest generations raised these councils so capable commoners share the helm of governance.'],
      ],
    },
    {
      id: 'npc_magister_law',
      role: 'Scholar',
      behavior: 'interact',
      actionKind: 'clipboard',
      position: [275.5, Y0 + 0.04, 9.0],
      facingYaw: -1.57,
      tunicColor: 0x1e4d5c,
      accentColor: 0x7de2f0,
      randomDialogues: [
        ['Council of Law codifies maritime prize courts, guild charters, and equal trial rights for commoner and noble alike.'],
      ],
    },
    {
      id: 'npc_councilor_authority',
      role: 'Scholar',
      behavior: 'interact',
      actionKind: 'announce',
      position: [275.5, Y0 + 0.04, 26.0],
      facingYaw: -1.57,
      tunicColor: 0x6c2427,
      accentColor: 0xe6b85c,
      randomDialogues: [
        ['Council of Authority directs garrison rotations, shipyard foundry quotas, and coastal railgun capacitor reserves.'],
      ],
    },
    // Courts & Treasury Officials
    {
      id: 'npc_chief_magistrate',
      role: 'Scholar',
      behavior: 'interact',
      actionKind: 'converse',
      position: [217.5, Y0 + 0.04, 69.5],
      facingYaw: 0.0,
      tunicColor: 0x283240,
      accentColor: 0xdca84c,
      randomDialogues: [
        ['In Vaelcrest Courts, guild masters and common mariners alike receive swift, written judgment under the Charter of Law.'],
      ],
    },
    {
      id: 'npc_treasury_bursar',
      role: 'Customs Clerk',
      behavior: 'interact',
      actionKind: 'clipboard',
      position: [231.0, Y0 + 0.04, 62.5],
      facingYaw: -1.57,
      tunicColor: 0x2f4b44,
      accentColor: 0xe2b44f,
      randomDialogues: [
        ['Bullion ingots and stabilized mana cores inside this vault back every note issued by the Vaelcrest Reserve Bank in the Merchant Quarter.'],
      ],
    },
    // Bailey & Rampart Garrison
    {
      id: 'npc_citadel_knight_a',
      role: 'Heavy Infantry',
      heavyArmor: true,
      behavior: 'idle',
      actionKind: 'watch',
      position: [216.0, Y0, 12.0],
      facingYaw: -1.57,
      tunicColor: 0x26323e,
      accentColor: 0xd4a44e,
    },
    {
      id: 'npc_citadel_knight_b',
      role: 'Heavy Infantry',
      heavyArmor: true,
      behavior: 'idle',
      actionKind: 'watch',
      position: [216.0, Y0, 25.0],
      facingYaw: -1.57,
      tunicColor: 0x26323e,
      accentColor: 0xd4a44e,
    },
    {
      id: 'npc_rampart_gunner',
      role: 'Heavy Infantry',
      heavyArmor: true,
      behavior: 'patrol',
      actionKind: 'watch',
      position: [242.0, RAMPART_Y, -36.8],
      facingYaw: Math.PI,
      tunicColor: 0x24303c,
      accentColor: 0x7de2f0,
      moveSpeed: 1.5,
      waypoints: [
        [220.0, RAMPART_Y, -36.8],
        [292.0, RAMPART_Y, -36.8],
      ],
    },
    {
      id: 'npc_palace_gardener',
      role: 'Resident',
      behavior: 'work',
      actionKind: 'sweep',
      position: [182.0, Y0, 0.0],
      facingYaw: 0.9,
      tunicColor: 0x4d6b47,
      accentColor: 0xc27f4e,
    },
    {
      id: 'npc_palace_courtyard_gardener',
      role: 'Resident',
      behavior: 'work',
      actionKind: 'sweep',
      position: [236.0, Y0, -24.0],
      facingYaw: -0.9,
      tunicColor: 0x4d6b47,
      accentColor: 0x7de2f0,
    }
  );

  // =========================================================================
  // 10. CASTLE INTERACTABLES & COLLECTIBLE ARTIFACTS
  // =========================================================================
  interactables.push(
    {
      id: 'int_three_councils_hall',
      title: 'Three-Council Rotunda & Lecterns',
      subtitle: 'Castle Vaelcrest · Great Hall',
      category: 'Landmark',
      promptAction: 'Inspect',
      position: [268.0, Y0, 18.5],
      radius: 4.2,
      lines: [
        'Seat of the Council of Law, the Council of Authority, and the quarterly Council of Elders beneath House Vaelcrest’s copper dome.',
        'Though founded after the first Warrior Lord’s era, the councils allow talented commoners to rise to mayors, ministers, and commanders.',
      ],
    },
    {
      id: 'int_war_room_map',
      title: 'Domain Strategic Relief Map',
      subtitle: 'Castle Vaelcrest · Patriarch War Room',
      category: 'Infrastructure',
      promptAction: 'Inspect',
      position: [269.0, Y0, 54.8],
      radius: 4.0,
      lines: [
        'A carved scale relief of the entire 230,000 km² Vaelcrest Domain—showing Elarion’s bay, inland rail corridors, agricultural valleys, and mountain strongholds.',
      ],
    },
    {
      id: 'int_coastal_railgun_battery',
      title: 'North Sea-Cliff Mana-Railgun Battery',
      subtitle: 'Castle Vaelcrest · Rampart Battlements (11.4m)',
      category: 'Infrastructure',
      promptAction: 'Inspect',
      position: [256.0, RAMPART_Y, -35.8],
      radius: 4.0,
      lines: [
        'Twin-rail external-mana cannon emplacements sweep across Elarion Bay, backed by glowing capacitor coils and the Aetheric Communication Spire.',
      ],
    },
    {
      id: 'int_knight_training_yard',
      title: 'House Vaelcrest Knight Training Yard',
      subtitle: 'Castle Vaelcrest · Outer Bailey',
      category: 'Landmark',
      promptAction: 'Read',
      position: [215.0, Y0, 31.0],
      radius: 3.4,
      lines: [
        'Commoner recruits and noble squires spar side by side beneath the crimson Vaelcrest banner—advancement here depends strictly on skill and valor.',
      ],
    }
  );

  pickableSpecs.push(
    {
      id: 'pick_council_folio',
      title: 'Three-Council Charter Roll',
      subtitle: 'Castle Vaelcrest · Great Hall',
      propKind: 'dispatch-scroll',
      position: [284.0, Y0, 17.5],
      lines: ['Gilded legislative folio countersigned by the Council of Law and Council of Authority.'],
    },
    {
      id: 'pick_treasury_bullion_seal',
      title: 'Royal Treasury Reserve Signet',
      subtitle: 'Castle Vaelcrest · Treasury Vault',
      propKind: 'cargo-seal',
      position: [232.0, Y0, 68.5],
      lines: ['Heavy brass reserve seal locking Crown bullion shipments to the Vaelcrest Reserve Bank.'],
    }
  );

  let castleGateAngle = 0;

  const unlockGate = (gateId: string): boolean => {
    if (gateId !== 'vaelcrest_castle_gate' || castleGateUnlocked) return false;
    castleGateUnlocked = true;
    castleGateCollider.maxY = -10;
    castleGateCollider.minY = -12;
    return true;
  };

  const isGateOpen = (gateId: string): boolean =>
    gateId === 'vaelcrest_castle_gate' ? castleGateUnlocked : false;

  const update = (dt: number) => {
    const clampedDt = Math.min(dt, 0.05);
    const targetAngle = castleGateUnlocked ? 1.44 : 0;
    castleGateAngle = THREE.MathUtils.damp(castleGateAngle, targetAngle, 3.6, clampedDt);
    cNorthGatePivot.rotation.y = -castleGateAngle;
    cSouthGatePivot.rotation.y = castleGateAngle;
  };

  return {
    group,
    npcSpawns,
    interactables,
    pickableSpecs,
    combatDummies,
    unlockGate,
    isGateOpen,
    update,
  };
}
