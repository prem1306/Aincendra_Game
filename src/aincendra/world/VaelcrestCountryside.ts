import * as THREE from 'three';
import type { BoxCollider } from '../core/types';

export interface CountrysideOutput {
  group: THREE.Group;
  boxColliders: BoxCollider[];
  wildlifeCount: number;
  update: (dt: number, playerPosition?: THREE.Vector3) => void;
  dispose: () => void;
}

type CreatureKind =
  | 'stag'
  | 'doe'
  | 'boar'
  | 'wolf'
  | 'hawk'
  | 'dire-boar'
  | 'raptor-drake'
  | 'colossus-stag';

interface AmbientCreature {
  kind: CreatureKind;
  root: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  wings?: [THREE.Group, THREE.Group];
  tail?: THREE.Group;
  center: [number, number];
  waypoints: Array<[number, number]>;
  wpIndex: number;
  speed: number;
  waitTimer: number;
  phase: number;
  yaw: number;
  pos: THREE.Vector3;
  orbitRadius?: number;
  orbitHeight?: number;
}

/**
 * Deterministic heightfield for the Vaelcrest Countryside outside Elarion's walls.
 * Inside the walled city footprint (-290..+308, Z <= 336) it returns 0.16m so
 * city streets and Bastion Gate transitions have zero step/seam.
 */
export function getCountrysideGroundY(x: number, z: number): number {
  const dxCity = x < -290 ? -290 - x : x > 308 ? x - 308 : 0;
  const dzCity = z < 336 ? (z < -42 ? -42 - z : 0) : z - 336;
  const distOut = Math.hypot(dxCity, dzCity);
  if (distOut <= 0.01) {
    return 0.16;
  }

  // Smooth ramp-in over the first 22m outside city walls
  const blend = THREE.MathUtils.smoothstep(distOut, 0, 22);

  // Keep Southern Country Highway (|x| < 14, z = 334..690) gently graded & walkable
  const roadCurveX = Math.sin((z - 336) * 0.011) * 16;
  const roadDist = Math.abs(x - roadCurveX);
  const roadFlatten = z > 334 ? 1 - THREE.MathUtils.smoothstep(roadDist, 6, 22) * 0.85 : 0;

  // Pond basins stay flat around their water level
  const pond1Dist = Math.hypot(x + 88, z - 468);
  const pond2Dist = Math.hypot(x - 94, z - 522);
  const pondDip1 = Math.exp(-(pond1Dist * pond1Dist) / (26 * 26)) * -1.45;
  const pondDip2 = Math.exp(-(pond2Dist * pond2Dist) / (28 * 28)) * -1.45;

  const rolling =
    Math.sin(x * 0.016 + 0.4) * Math.cos(z * 0.015 - 0.3) * 4.2 +
    Math.sin(x * 0.037 - z * 0.029) * 1.85 +
    Math.cos(x * 0.009 + z * 0.011) * 2.8;

  // Higher scenic hills farther out (south/west/east edges)
  const edgeRise = THREE.MathUtils.smoothstep(distOut, 95, 360) * 9.5;
  const rawH = 0.16 + (rolling + edgeRise) * (1 - roadFlatten) + pondDip1 + pondDip2;

  return THREE.MathUtils.lerp(0.16, Math.max(-0.8, rawH), blend);
}

function createGrassDetailTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4e753b';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 1800; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * size;
    const y = (Math.sin(i * 78.233) * 19341.123 % 1 + 1) % 1 * size;
    const shade = i % 3 === 0 ? '#5d8845' : i % 3 === 1 ? '#3e622f' : '#6f964e';
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, 2, 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(42, 42);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

function seededRand(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Rolling Green Vaelcrest Countryside & Evolved Wildlife Reserve:
 * - Replaces all grey exterior voids with continuous sunlit emerald hills, winding dirt road,
 *   meadow ponds, ~950 instanced oak/pine/shrub trees, mossy boulders, & vaultable fallen logs.
 * - Populates purely ambient woodland animals & evolved mana-beasts for open-world exploration.
 */
export function buildVaelcrestCountryside(maxAnisotropy = 4): CountrysideOutput {
  const group = new THREE.Group();
  group.name = 'Vaelcrest_Green_Countryside';
  const boxColliders: BoxCollider[] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  const grassTex = createGrassDetailTexture(maxAnisotropy);
  const matTerrain = new THREE.MeshStandardMaterial({
    map: grassTex,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
  });
  const matBark = new THREE.MeshStandardMaterial({ color: 0x4b3626, roughness: 0.9, metalness: 0.02 });
  const matOakLeaf = new THREE.MeshStandardMaterial({ color: 0x3b6e35, roughness: 0.84, metalness: 0.02 });
  const matLightLeaf = new THREE.MeshStandardMaterial({ color: 0x528841, roughness: 0.82, metalness: 0.02 });
  const matPineLeaf = new THREE.MeshStandardMaterial({ color: 0x285434, roughness: 0.86, metalness: 0.02 });
  const matMossRock = new THREE.MeshStandardMaterial({ color: 0x5d695c, roughness: 0.92, metalness: 0.04 });
  const matPondWater = new THREE.MeshStandardMaterial({
    color: 0x2d6d7a,
    roughness: 0.16,
    metalness: 0.18,
    transparent: true,
    opacity: 0.88,
  });

  disposables.push(grassTex, matTerrain, matBark, matOakLeaf, matLightLeaf, matPineLeaf, matMossRock, matPondWater);

  // -------------------------------------------------------------------------
  // 1. CONTINUOUS GREEN TERRAIN MESHES (South Expands + West & East Meadow Wings)
  // -------------------------------------------------------------------------
  const buildTerrainPatch = (minX: number, maxX: number, minZ: number, maxZ: number, segX: number, segZ: number) => {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const geo = new THREE.PlaneGeometry(w, d, segX, segZ);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const colGrass = new THREE.Color(0x88b36d);
    const colHighGrass = new THREE.Color(0x6b9855);
    const colDirt = new THREE.Color(0xa68964);
    const colShore = new THREE.Color(0x7c8f5e);
    const tmpCol = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + (minX + maxX) * 0.5;
      const wz = pos.getZ(i) + (minZ + maxZ) * 0.5;
      const wy = getCountrysideGroundY(wx, wz);
      pos.setY(i, wy);

      const roadCurveX = Math.sin((wz - 336) * 0.011) * 16;
      const roadDist = Math.abs(wx - roadCurveX);
      if (wz > 333 && roadDist < 8.0) {
        const t = THREE.MathUtils.smoothstep(roadDist, 3.8, 8.0);
        tmpCol.copy(colDirt).lerp(colGrass, t);
      } else if (wy < 0.05) {
        tmpCol.copy(colShore);
      } else {
        const hillT = THREE.MathUtils.clamp((wy - 0.5) / 10, 0, 1);
        tmpCol.copy(colGrass).lerp(colHighGrass, hillT);
      }
      colors[i * 3] = tmpCol.r;
      colors[i * 3 + 1] = tmpCol.g;
      colors[i * 3 + 2] = tmpCol.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    disposables.push(geo);

    const mesh = new THREE.Mesh(geo, matTerrain);
    mesh.position.set((minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5);
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  // Main South Countryside Expands (Z = 335..760, X = -640..+640)
  buildTerrainPatch(-640, 640, 335, 760, 88, 64);
  // West Green Meadow Wing outside Western Industrial Wall (X = -640..-288, Z = -46..336)
  buildTerrainPatch(-640, -288, -46, 336, 34, 42);
  // East Green Meadow Wing outside Citadel Wall (X = 306..640, Z = -46..336)
  buildTerrainPatch(306, 640, -46, 336, 34, 42);

  // Meadow Ponds
  for (const [px, pz, r] of [
    [-88, 468, 22],
    [94, 522, 24],
  ] as Array<[number, number, number]>) {
    const pondGeo = new THREE.CircleGeometry(r, 24);
    pondGeo.rotateX(-Math.PI / 2);
    disposables.push(pondGeo);
    const pond = new THREE.Mesh(pondGeo, matPondWater);
    pond.position.set(px, -0.35, pz);
    group.add(pond);
  }

  // -------------------------------------------------------------------------
  // 2. INSTANCED TREES (~950 OAKS, PINES, SHRUBS), BOULDERS & VAULT LOGS
  // -------------------------------------------------------------------------
  interface TreePlacement {
    x: number;
    y: number;
    z: number;
    scale: number;
    rot: number;
    isPine: boolean;
  }
  const oaks: TreePlacement[] = [];
  const pines: TreePlacement[] = [];

  for (let i = 0; i < 1250; i++) {
    const r1 = seededRand(i * 3 + 1);
    const r2 = seededRand(i * 3 + 2);
    const r3 = seededRand(i * 3 + 3);

    let tx: number;
    let tz: number;
    if (i < 880) {
      // South Countryside Woods
      tx = THREE.MathUtils.lerp(-580, 580, r1);
      tz = THREE.MathUtils.lerp(348, 735, r2);
    } else if (i < 1065) {
      // West Meadow Woods
      tx = THREE.MathUtils.lerp(-580, -304, r1);
      tz = THREE.MathUtils.lerp(-25, 340, r2);
    } else {
      // East Meadow Woods
      tx = THREE.MathUtils.lerp(322, 580, r1);
      tz = THREE.MathUtils.lerp(-25, 340, r2);
    }

    // Keep dirt highway corridor and pond interiors clear
    const roadCurveX = Math.sin((tz - 336) * 0.011) * 16;
    if (tz > 334 && Math.abs(tx - roadCurveX) < 11.5) continue;
    if (Math.hypot(tx + 88, tz - 468) < 25) continue;
    if (Math.hypot(tx - 94, tz - 522) < 27) continue;

    const ty = getCountrysideGroundY(tx, tz);
    if (ty < -0.1) continue;

    const scale = 0.85 + r3 * 0.75;
    const isPine = (i % 5 === 0 || i % 5 === 2) || ty > 4.2;
    const item: TreePlacement = { x: tx, y: ty, z: tz, scale, rot: r3 * Math.PI * 2, isPine };
    if (isPine) pines.push(item);
    else oaks.push(item);

    // Register trunk collider only in primary explored countryside zone so physics checks stay fast
    if (tz < 685 && Math.abs(tx) < 470) {
      const tr = 0.36 * scale;
      boxColliders.push({
        minX: tx - tr,
        maxX: tx + tr,
        minY: ty,
        maxY: ty + 3.2 * scale,
        minZ: tz - tr,
        maxZ: tz + tr,
      });
    }
  }

  const dummy = new THREE.Object3D();

  // Trunks for all trees
  const allTrees = [...oaks, ...pines];
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 3.6, 7);
  disposables.push(trunkGeo);
  const trunkInst = new THREE.InstancedMesh(trunkGeo, matBark, allTrees.length);
  trunkInst.receiveShadow = true;
  allTrees.forEach((t, idx) => {
    dummy.position.set(t.x, t.y + 1.8 * t.scale, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.scale.setScalar(t.scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);
  });
  trunkInst.computeBoundingSphere();
  group.add(trunkInst);

  // Oak Crowns (broad lush canopies)
  if (oaks.length > 0) {
    const oakCrownGeo = new THREE.DodecahedronGeometry(2.35, 1);
    const oakSubGeo = new THREE.DodecahedronGeometry(1.65, 1);
    disposables.push(oakCrownGeo, oakSubGeo);
    const oakInst = new THREE.InstancedMesh(oakCrownGeo, matOakLeaf, oaks.length);
    const oakSubInst = new THREE.InstancedMesh(oakSubGeo, matLightLeaf, oaks.length);
    oaks.forEach((t, idx) => {
      dummy.position.set(t.x, t.y + 4.4 * t.scale, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.set(t.scale * 1.15, t.scale * 0.92, t.scale * 1.15);
      dummy.updateMatrix();
      oakInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(
        t.x + Math.cos(t.rot) * 1.1 * t.scale,
        t.y + 5.2 * t.scale,
        t.z + Math.sin(t.rot) * 1.1 * t.scale
      );
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      oakSubInst.setMatrixAt(idx, dummy.matrix);
    });
    oakInst.computeBoundingSphere();
    oakSubInst.computeBoundingSphere();
    group.add(oakInst, oakSubInst);
  }

  // Pine Cones (2-tier evergreen conifers)
  if (pines.length > 0) {
    const pineLowGeo = new THREE.ConeGeometry(2.1, 3.8, 7);
    const pineTopGeo = new THREE.ConeGeometry(1.5, 3.4, 7);
    disposables.push(pineLowGeo, pineTopGeo);
    const pineLowInst = new THREE.InstancedMesh(pineLowGeo, matPineLeaf, pines.length);
    const pineTopInst = new THREE.InstancedMesh(pineTopGeo, matPineLeaf, pines.length);
    pines.forEach((t, idx) => {
      dummy.position.set(t.x, t.y + 3.6 * t.scale, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      pineLowInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(t.x, t.y + 5.4 * t.scale, t.z);
      dummy.updateMatrix();
      pineTopInst.setMatrixAt(idx, dummy.matrix);
    });
    pineLowInst.computeBoundingSphere();
    pineTopInst.computeBoundingSphere();
    group.add(pineLowInst, pineTopInst);
  }

  // Mossy Meadow Boulders & Vaultable Fallen Logs along countryside trails
  const boulderGeo = new THREE.DodecahedronGeometry(1.25, 1);
  disposables.push(boulderGeo);
  const boulderCoords: Array<[number, number, number]> = [];
  for (let i = 0; i < 90; i++) {
    const bx = THREE.MathUtils.lerp(-420, 420, seededRand(900 + i * 2));
    const bz = THREE.MathUtils.lerp(355, 665, seededRand(900 + i * 2 + 1));
    const roadCurveX = Math.sin((bz - 336) * 0.011) * 16;
    if (Math.abs(bx - roadCurveX) < 10) continue;
    const bs = 0.65 + seededRand(1200 + i) * 1.1;
    boulderCoords.push([bx, bz, bs]);
  }
  const boulderInst = new THREE.InstancedMesh(boulderGeo, matMossRock, boulderCoords.length);
  boulderCoords.forEach(([bx, bz, bs], i) => {
    const by = getCountrysideGroundY(bx, bz);
    dummy.position.set(bx, by + bs * 0.45, bz);
    dummy.rotation.set(i * 0.4, i * 0.9, 0);
    dummy.scale.set(bs * 1.2, bs * 0.85, bs);
    dummy.updateMatrix();
    boulderInst.setMatrixAt(i, dummy.matrix);
    boxColliders.push({
      minX: bx - bs * 0.95,
      maxX: bx + bs * 0.95,
      minY: by,
      maxY: by + bs * 1.2,
      minZ: bz - bs * 0.85,
      maxZ: bz + bs * 0.85,
    });
  });
  boulderInst.computeBoundingSphere();
  group.add(boulderInst);

  // Vaultable Fallen Logs across roadside meadows (0.68m tall so Space while sprinting vaults cleanly!)
  const logGeo = new THREE.CylinderGeometry(0.34, 0.38, 4.2, 8);
  logGeo.rotateZ(Math.PI / 2);
  disposables.push(logGeo);
  for (const [lx, lz] of [
    [-16, 376],
    [18, 405],
    [-22, 448],
    [24, 492],
    [-14, 540],
    [16, 588],
  ]) {
    const ly = getCountrysideGroundY(lx, lz);
    const logMesh = new THREE.Mesh(logGeo, matBark);
    logMesh.position.set(lx, ly + 0.34, lz);
    logMesh.castShadow = true;
    logMesh.receiveShadow = true;
    group.add(logMesh);
    boxColliders.push({
      minX: lx - 2.1,
      maxX: lx + 2.1,
      minY: ly,
      maxY: ly + 0.68,
      minZ: lz - 0.38,
      maxZ: lz + 0.38,
    });
  }

  // -------------------------------------------------------------------------
  // 3. AMBIENT WOODLAND ANIMALS & EVOLVED MANA-BEASTS (Purely Ambient)
  // -------------------------------------------------------------------------
  const matStagCoat = new THREE.MeshStandardMaterial({ color: 0x8b5a36, roughness: 0.78 });
  const matDoeCoat = new THREE.MeshStandardMaterial({ color: 0xa6744c, roughness: 0.78 });
  const matAntler = new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.72 });
  const matBoarCoat = new THREE.MeshStandardMaterial({ color: 0x3f2e24, roughness: 0.88 });
  const matWolfCoat = new THREE.MeshStandardMaterial({ color: 0x6c7278, roughness: 0.82 });
  const matHawk = new THREE.MeshStandardMaterial({ color: 0x4c3626, roughness: 0.7 });
  const matDireArmor = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.45, metalness: 0.45 });
  const matDrakeHide = new THREE.MeshStandardMaterial({ color: 0x274d4b, roughness: 0.56, metalness: 0.14 });
  const matMossColossus = new THREE.MeshStandardMaterial({ color: 0x3b593c, roughness: 0.84 });
  const matManaHorn = new THREE.MeshStandardMaterial({
    color: 0x7de2f0,
    emissive: 0x34a8c2,
    emissiveIntensity: 1.2,
    roughness: 0.22,
  });
  const matEyeDark = new THREE.MeshStandardMaterial({ color: 0x121417, roughness: 0.3 });

  disposables.push(
    matStagCoat,
    matDoeCoat,
    matAntler,
    matBoarCoat,
    matWolfCoat,
    matHawk,
    matDireArmor,
    matDrakeHide,
    matMossColossus,
    matManaHorn,
    matEyeDark
  );

  const legQuadGeo = new THREE.CylinderGeometry(0.055, 0.038, 0.62, 6);
  const bodyQuadGeo = new THREE.CapsuleGeometry(0.28, 0.75, 4, 8);
  bodyQuadGeo.rotateX(Math.PI / 2);
  const neckQuadGeo = new THREE.CylinderGeometry(0.11, 0.15, 0.42, 7);
  const headQuadGeo = new THREE.BoxGeometry(0.2, 0.2, 0.32);
  const antlerBeamGeo = new THREE.CylinderGeometry(0.025, 0.032, 0.58, 5);
  const tuskGeo = new THREE.ConeGeometry(0.032, 0.18, 5);
  const wingGeo = new THREE.BoxGeometry(1.1, 0.05, 0.36);
  const tailGeo = new THREE.ConeGeometry(0.08, 0.45, 6);
  disposables.push(legQuadGeo, bodyQuadGeo, neckQuadGeo, headQuadGeo, antlerBeamGeo, tuskGeo, wingGeo, tailGeo);

  const creatures: AmbientCreature[] = [];

  const spawnCreature = (
    kind: CreatureKind,
    cx: number,
    cz: number,
    radius: number,
    phase: number
  ) => {
    const root = new THREE.Group();
    const head = new THREE.Group();
    const legs: THREE.Group[] = [];
    let wings: [THREE.Group, THREE.Group] | undefined;
    let tail: THREE.Group | undefined;

    if (kind === 'hawk') {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.38, 4, 6), matHawk);
      body.rotation.x = Math.PI / 2;
      disposables.push(body.geometry);
      const wingL = new THREE.Group();
      const wingLMesh = new THREE.Mesh(wingGeo, matHawk);
      wingLMesh.position.x = -0.55;
      wingL.add(wingLMesh);
      const wingR = new THREE.Group();
      const wingRMesh = new THREE.Mesh(wingGeo, matHawk);
      wingRMesh.position.x = 0.55;
      wingR.add(wingRMesh);
      root.add(body, wingL, wingR);
      wings = [wingL, wingR];
      const baseY = getCountrysideGroundY(cx, cz) + 18 + (phase % 3) * 4;
      root.position.set(cx, baseY, cz);
      group.add(root);
      creatures.push({
        kind,
        root,
        head,
        legs,
        wings,
        center: [cx, cz],
        waypoints: [[cx, cz]],
        wpIndex: 0,
        speed: 7.5,
        waitTimer: 0,
        phase,
        yaw: 0,
        pos: root.position.clone(),
        orbitRadius: radius,
        orbitHeight: baseY,
      });
      return;
    }

    const isColossus = kind === 'colossus-stag';
    const isDireBoar = kind === 'dire-boar';
    const isDrake = kind === 'raptor-drake';

    const coatMat =
      kind === 'stag'
        ? matStagCoat
        : kind === 'doe'
          ? matDoeCoat
          : kind === 'boar'
            ? matBoarCoat
            : kind === 'wolf'
              ? matWolfCoat
              : isDireBoar
                ? matDireArmor
                : isDrake
                  ? matDrakeHide
                  : matMossColossus;

    const scale = isColossus ? 1.85 : isDireBoar ? 1.45 : isDrake ? 1.35 : kind === 'stag' ? 1.12 : kind === 'boar' ? 0.85 : 0.92;
    root.scale.setScalar(scale);

    if (isDrake) {
      // Bipedal Evolved Raptor-Drake
      const body = new THREE.Mesh(bodyQuadGeo, coatMat);
      body.position.set(0, 0.92, 0);
      body.rotation.x = -0.24;
      const dorsal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.72), matManaHorn);
      dorsal.position.set(0, 1.18, -0.04);
      disposables.push(dorsal.geometry);

      const tailGrp = new THREE.Group();
      tailGrp.position.set(0, 0.86, -0.45);
      const tailMesh = new THREE.Mesh(tailGeo, coatMat);
      tailMesh.rotation.x = -Math.PI * 0.55;
      tailMesh.scale.set(1.2, 1.9, 1.2);
      tailMesh.position.z = -0.35;
      tailGrp.add(tailMesh);
      tail = tailGrp;

      head.position.set(0, 1.12, 0.45);
      const neck = new THREE.Mesh(neckQuadGeo, coatMat);
      neck.position.set(0, 0.16, 0.08);
      neck.rotation.x = 0.32;
      const skull = new THREE.Mesh(headQuadGeo, coatMat);
      skull.position.set(0, 0.34, 0.22);
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 5), matManaHorn);
      crest.rotation.x = -0.8;
      crest.position.set(0, 0.48, 0.16);
      disposables.push(crest.geometry);
      head.add(neck, skull, crest);

      for (const lx of [-0.2, 0.2]) {
        const legPivot = new THREE.Group();
        legPivot.position.set(lx, 0.76, -0.05);
        const legMesh = new THREE.Mesh(legQuadGeo, coatMat);
        legMesh.scale.set(1.25, 1.22, 1.25);
        legMesh.position.y = -0.36;
        legPivot.add(legMesh);
        legs.push(legPivot);
        root.add(legPivot);
      }
      root.add(body, dorsal, tailGrp, head);
    } else {
      // Quadrupeds (Stag, Doe, Boar, Wolf, Dire Boar, Moss Colossus Stag)
      const body = new THREE.Mesh(bodyQuadGeo, coatMat);
      body.position.set(0, 0.76, 0);
      body.scale.set(kind === 'boar' || isDireBoar ? 1.25 : 0.92, 1.0, kind === 'boar' ? 0.88 : 1.05);
      root.add(body);

      if (isDireBoar) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.22, 0.78), matManaHorn);
        plate.position.set(0, 1.0, 0.06);
        disposables.push(plate.geometry);
        root.add(plate);
      } else if (isColossus) {
        const mossBack = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), matOakLeaf);
        mossBack.position.set(0, 1.06, -0.05);
        disposables.push(mossBack.geometry);
        root.add(mossBack);
      }

      head.position.set(0, 0.86, 0.46);
      const neck = new THREE.Mesh(neckQuadGeo, coatMat);
      neck.position.set(0, kind === 'boar' || isDireBoar ? 0.02 : 0.16, 0.06);
      neck.rotation.x = kind === 'boar' || isDireBoar ? 1.1 : 0.42;
      const skull = new THREE.Mesh(headQuadGeo, coatMat);
      skull.position.set(0, kind === 'boar' || isDireBoar ? 0.04 : 0.34, kind === 'boar' || isDireBoar ? 0.22 : 0.18);
      head.add(neck, skull);

      if (kind === 'stag' || isColossus) {
        const antlerMat = isColossus ? matManaHorn : matAntler;
        for (const sx of [-1, 1]) {
          const beam = new THREE.Mesh(antlerBeamGeo, antlerMat);
          beam.position.set(sx * 0.14, 0.56, 0.14);
          beam.rotation.z = -sx * 0.42;
          beam.rotation.x = -0.22;
          const tine = new THREE.Mesh(antlerBeamGeo, antlerMat);
          tine.scale.setScalar(0.55);
          tine.position.set(sx * 0.22, 0.64, 0.24);
          tine.rotation.z = sx * 0.25;
          head.add(beam, tine);
        }
      } else if (kind === 'boar' || isDireBoar) {
        const tMat = isDireBoar ? matManaHorn : matAntler;
        for (const sx of [-1, 1]) {
          const tusk = new THREE.Mesh(tuskGeo, tMat);
          tusk.position.set(sx * 0.11, 0.04, 0.38);
          tusk.rotation.x = 0.6;
          tusk.rotation.z = -sx * 0.35;
          head.add(tusk);
        }
      } else if (kind === 'wolf') {
        const tailGrp = new THREE.Group();
        tailGrp.position.set(0, 0.78, -0.48);
        const tMesh = new THREE.Mesh(tailGeo, coatMat);
        tMesh.rotation.x = -Math.PI * 0.65;
        tMesh.position.z = -0.2;
        tailGrp.add(tMesh);
        tail = tailGrp;
        root.add(tailGrp);
      }

      const legCoords: Array<[number, number]> = [
        [-0.16, 0.32],
        [0.16, 0.32],
        [-0.16, -0.32],
        [0.16, -0.32],
      ];
      for (const [lx, lz] of legCoords) {
        const legPivot = new THREE.Group();
        legPivot.position.set(lx, 0.62, lz);
        const legMesh = new THREE.Mesh(legQuadGeo, coatMat);
        legMesh.position.y = -0.31;
        legPivot.add(legMesh);
        legs.push(legPivot);
        root.add(legPivot);
      }

      root.add(head);
    }

    const startY = getCountrysideGroundY(cx, cz);
    root.position.set(cx, startY, cz);
    group.add(root);

    const wps: Array<[number, number]> = [];
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + phase * 0.5;
      wps.push([cx + Math.cos(ang) * radius, cz + Math.sin(ang) * radius]);
    }

    creatures.push({
      kind,
      root,
      head,
      legs,
      tail,
      center: [cx, cz],
      waypoints: wps,
      wpIndex: 0,
      speed: isDrake ? 3.2 : kind === 'wolf' ? 3.0 : isColossus ? 1.5 : 1.9,
      waitTimer: phase % 2.4,
      phase,
      yaw: phase,
      pos: root.position.clone(),
    });
  };

  // Populate ambient woodland fauna & evolved mana-beasts across green wilds
  const wildlifeSeeds: Array<[CreatureKind, number, number, number]> = [
    ['stag', -42, 382, 16],
    ['doe', -34, 392, 14],
    ['doe', -48, 396, 14],
    ['boar', 46, 390, 12],
    ['boar', 56, 398, 12],
    ['wolf', -115, 425, 22],
    ['wolf', -126, 434, 20],
    ['stag', 120, 445, 18],
    ['doe', 132, 452, 16],
    ['dire-boar', -65, 442, 18],
    ['dire-boar', 72, 488, 18],
    ['raptor-drake', -155, 510, 26],
    ['raptor-drake', 148, 550, 26],
    ['colossus-stag', 0, 520, 22],
    ['colossus-stag', -180, 580, 24],
    ['stag', 210, 435, 20],
    ['doe', 220, 448, 18],
    ['boar', -240, 460, 14],
    ['wolf', 250, 520, 24],
    ['stag', -355, 190, 22], // West meadow deer
    ['dire-boar', -375, 265, 18],
    ['stag', 360, 180, 22],  // East meadow deer
    ['raptor-drake', 375, 250, 22],
    ['hawk', -40, 430, 48],
    ['hawk', 75, 495, 55],
    ['hawk', -160, 540, 62],
    ['hawk', 165, 410, 50],
  ];

  wildlifeSeeds.forEach(([kind, x, z, r], idx) => {
    spawnCreature(kind, x, z, r, idx * 1.37);
  });

  // -------------------------------------------------------------------------
  // 4. UPDATE LOOP (Gentle Ambient Grazing, Patrol & Soaring)
  // -------------------------------------------------------------------------
  const update = (dt: number, playerPosition?: THREE.Vector3): void => {
    const clampedDt = Math.min(dt, 0.05);

    for (const c of creatures) {
      c.phase += clampedDt;

      if (c.kind === 'hawk' && c.wings && c.orbitRadius && c.orbitHeight !== undefined) {
        const ang = c.phase * 0.24;
        const nx = c.center[0] + Math.cos(ang) * c.orbitRadius;
        const nz = c.center[1] + Math.sin(ang) * c.orbitRadius;
        c.root.position.set(nx, c.orbitHeight + Math.sin(c.phase * 0.9) * 1.2, nz);
        c.root.rotation.y = -ang;
        const flap = Math.sin(c.phase * 5.2) * 0.38;
        c.wings[0].rotation.z = flap;
        c.wings[1].rotation.z = -flap;
        continue;
      }

      // Non-hostile proximity awareness: gently step aside if player runs right beside them
      let fleeing = false;
      if (playerPosition) {
        const dxp = c.pos.x - playerPosition.x;
        const dzp = c.pos.z - playerPosition.z;
        const distSq = dxp * dxp + dzp * dzp;
        if (distSq < 8.5 * 8.5 && distSq > 0.04) {
          fleeing = true;
          const dist = Math.sqrt(distSq);
          const trotSpeed = c.speed * 1.45;
          c.pos.x += (dxp / dist) * trotSpeed * clampedDt;
          c.pos.z += (dzp / dist) * trotSpeed * clampedDt;
          c.yaw = Math.atan2(dxp, dzp);
          c.waitTimer = 0;
        }
      }

      let moving = fleeing;
      if (!fleeing) {
        if (c.waitTimer > 0) {
          c.waitTimer -= clampedDt;
        } else {
          const wp = c.waypoints[c.wpIndex];
          const wx = wp[0] - c.pos.x;
          const wz = wp[1] - c.pos.z;
          const dist = Math.hypot(wx, wz);
          if (dist < 0.6) {
            c.wpIndex = (c.wpIndex + 1) % c.waypoints.length;
            c.waitTimer = 2.2 + (c.phase % 2.5);
          } else {
            moving = true;
            const step = Math.min(dist, c.speed * clampedDt);
            c.pos.x += (wx / dist) * step;
            c.pos.z += (wz / dist) * step;
            const targetYaw = Math.atan2(wx, wz);
            const delta = Math.atan2(Math.sin(targetYaw - c.yaw), Math.cos(targetYaw - c.yaw));
            c.yaw += delta * Math.min(1, clampedDt * 5.5);
          }
        }
      }

      c.pos.y = getCountrysideGroundY(c.pos.x, c.pos.z);
      c.root.position.copy(c.pos);
      c.root.rotation.y = c.yaw;

      if (moving) {
        const stride = Math.sin(c.phase * (fleeing ? 11.5 : 7.0)) * 0.55;
        if (c.legs.length >= 4) {
          c.legs[0].rotation.x = stride;
          c.legs[1].rotation.x = -stride;
          c.legs[2].rotation.x = -stride;
          c.legs[3].rotation.x = stride;
        } else if (c.legs.length === 2) {
          c.legs[0].rotation.x = stride;
          c.legs[1].rotation.x = -stride;
        }
        c.head.rotation.x = THREE.MathUtils.damp(c.head.rotation.x, 0.05, 8, clampedDt);
      } else {
        for (const leg of c.legs) {
          leg.rotation.x = THREE.MathUtils.damp(leg.rotation.x, 0, 10, clampedDt);
        }
        // Calm grazing bob
        c.head.rotation.x = Math.sin(c.phase * 1.6) * 0.14 + 0.16;
      }
      if (c.tail) {
        c.tail.rotation.y = Math.sin(c.phase * 3.4) * 0.25;
      }
    }
  };

  return {
    group,
    boxColliders,
    wildlifeCount: creatures.length,
    update,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
