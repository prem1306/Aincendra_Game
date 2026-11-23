import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SpringArmCamera } from './camera/SpringArmCamera';
import { PlayerCharacter } from './characters/player/PlayerCharacter';
import { CombatSystem } from './combat/CombatSystem';
import {
  DEFAULT_MOVEMENT_CONFIG,
  type CameraMode,
  type CombatState,
  type DummyStatusReadout,
  type FloatingCombatPopup,
  type FloatingInteractLabel,
  type GreyboxWorldData,
  type MapId,
  type MovementConfig,
  type PlayerEmoteKind,
  type PlayerTelemetry,
  type WeatherState,
} from './core/types';
import { InputManager } from './input/InputManager';
import { InteractionManager } from './interaction/InteractionManager';
import { NpcManager } from './npc/NpcManager';
import { buildElarionDistrictBlock } from './world/ElarionDistrictBlock';
import { buildGreyboxTestMap } from './world/GreyboxTestMap';
import { WeatherSystem } from './world/WeatherSystem';

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class AincendraEngine {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly springArm: SpringArmCamera;
  private readonly player: PlayerCharacter;
  private readonly input: InputManager;
  private readonly npcManager: NpcManager;
  private readonly interactionManager: InteractionManager;
  private world: GreyboxWorldData;
  private currentMapId: MapId = 'elarion-district';
  private readonly sunLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly rimLight: THREE.DirectionalLight;
  private readonly weatherSystem: WeatherSystem;
  private readonly combatSystem: CombatSystem;
  private readonly envTexture: THREE.Texture;
  private readonly isSoftwareGl: boolean;
  private readonly clock = new THREE.Clock();

  private readonly onTelemetry: (t: PlayerTelemetry) => void;
  private readonly onContextLostCallback?: (lost: boolean) => void;
  private readonly onFloatingLabels?: (labels: FloatingInteractLabel[]) => void;
  private readonly onCombatOverlay?: (payload: {
    popups: FloatingCombatPopup[];
    dummies: DummyStatusReadout[];
  }) => void;
  private readonly onOpenRailNetwork?: (stationId: string) => void;

  private frameId = 0;
  private disposed = false;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private currentFps = 60;
  private telemetryTimer = 0;
  private lastCombatState: CombatState = 'Ready';
  private crowns = 48;
  private lastCollectedAwarded = 0;

  constructor(
    container: HTMLElement,
    onTelemetry: (t: PlayerTelemetry) => void,
    onContextLost?: (lost: boolean) => void,
    onFloatingLabels?: (labels: FloatingInteractLabel[]) => void,
    onCombatOverlay?: (payload: {
      popups: FloatingCombatPopup[];
      dummies: DummyStatusReadout[];
    }) => void,
    onOpenRailNetwork?: (stationId: string) => void
  ) {
    this.container = container;
    this.onTelemetry = onTelemetry;
    this.onContextLostCallback = onContextLost;
    this.onFloatingLabels = onFloatingLabels;
    this.onCombatOverlay = onCombatOverlay;
    this.onOpenRailNetwork = onOpenRailNetwork;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x9ec4dc);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(0xaac7dc, 0.00068);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    pmrem.dispose();

    this.hemiLight = new THREE.HemisphereLight(0xe4eff8, 0x454c54, 0.95);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff3d8, 2.05);
    this.sunLight.position.set(28, 42, 22);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 128;
    const d = 46;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight(0x88b4d8, 0.45);
    this.rimLight.position.set(-24, 16, -28);
    this.scene.add(this.rimLight);

    this.weatherSystem = new WeatherSystem();
    this.scene.add(this.weatherSystem.group);

    this.npcManager = new NpcManager();
    this.scene.add(this.npcManager.group);
    this.interactionManager = new InteractionManager();
    this.combatSystem = new CombatSystem();
    this.scene.add(this.combatSystem.group);

    this.world = this.buildWorld(this.currentMapId);
    this.scene.add(this.world.group);
    if (this.world.npcSpawns) {
      this.npcManager.spawnFromSpecs(this.world.npcSpawns);
    }
    this.interactionManager.setTargets(
      this.world.interactables,
      this.world.npcSpawns,
      this.world.collectProp
    );
    this.interactionManager.setRailOpenHandler((stationId) => {
      this.releasePointerLock();
      this.onOpenRailNetwork?.(stationId);
    });
    this.combatSystem.setDummies(this.world.combatDummies, this.world.boxColliders);

    this.player = new PlayerCharacter(DEFAULT_MOVEMENT_CONFIG, this.world.spawnPoint);
    this.scene.add(this.player.root);

    const aspect = Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight);
    this.springArm = new SpringArmCamera(aspect, DEFAULT_MOVEMENT_CONFIG);
    this.springArm.camera.add(this.combatSystem.fpWeaponRoot);
    this.scene.add(this.springArm.camera);

    this.input = new InputManager(
      canvas,
      () => {
        this.emitTelemetry();
      },
      () => this.interactionManager.hasOpenDialogueChoices()
    );

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.springArm.camera);
    }

    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
    window.addEventListener('resize', this.handleResize);

    this.clock.start();
    this.tick();
  }

  private buildWorld(mapId: MapId): GreyboxWorldData {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    return mapId === 'elarion-district'
      ? buildElarionDistrictBlock(maxAniso)
      : buildGreyboxTestMap(maxAniso);
  }

  public setMap(mapId: MapId): void {
    if (mapId === this.currentMapId) return;
    this.scene.remove(this.world.group);
    this.world.dispose();
    this.npcManager.clear();
    this.interactionManager.clear();

    this.currentMapId = mapId;
    this.world = this.buildWorld(mapId);
    this.scene.add(this.world.group);

    if (this.world.npcSpawns) {
      this.npcManager.spawnFromSpecs(this.world.npcSpawns);
    }
    this.interactionManager.setTargets(
      this.world.interactables,
      this.world.npcSpawns,
      this.world.collectProp
    );
    this.combatSystem.setDummies(this.world.combatDummies, this.world.boxColliders);

    this.player.reset(this.world.spawnPoint);
    this.springArm.resetOrientation(this.world.spawnPoint);
    this.emitTelemetry();
  }

  public closeInspection(): void {
    this.interactionManager.closeInspection();
    this.emitTelemetry();
  }

  public triggerInteract(): void {
    this.interactionManager.triggerInteract();
    this.emitTelemetry();
  }

  public selectDialogueChoice(index: number): void {
    this.interactionManager.selectChoice(
      index,
      (gateId) => {
        const unlocked = this.world.unlockGate?.(gateId) ?? false;
        if (unlocked) {
          this.emitTelemetry();
        }
        return unlocked;
      },
      (emote) => {
        this.player.triggerEmote(emote);
        this.npcManager.notifyPlayerEmote(this.player.position, emote);
      }
    );
    this.emitTelemetry();
  }

  public triggerEmote(emote: PlayerEmoteKind): void {
    this.player.triggerEmote(emote);
    this.npcManager.notifyPlayerEmote(this.player.position, emote);
    this.emitTelemetry();
  }

  public spendCrowns(amount: number): boolean {
    if (amount <= 0) return true;
    if (this.crowns < amount) return false;
    this.crowns -= amount;
    this.emitTelemetry();
    return true;
  }

  public releasePointerLock(): void {
    try {
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      this.input.clearAll();
    } catch {
      // Safe fallback when pointer lock is unavailable
    }
  }

  public requestPointerLock(): void {
    this.input.requestPointerLock();
  }

  public updateMovementConfig(partial: Partial<MovementConfig>): void {
    this.player.updateConfig(partial);
    this.springArm.updateConfig(partial);
  }

  public setCameraMode(mode: CameraMode): void {
    this.springArm.setMode(mode);
    this.player.setMeshVisible(mode === 'third-person');
    this.emitTelemetry();
  }

  public setWeatherMode(mode: WeatherState | 'auto'): void {
    this.weatherSystem.setWeatherMode(mode);
    this.emitTelemetry();
  }

  public cycleWeather(): void {
    this.weatherSystem.cycleNext();
    this.emitTelemetry();
  }

  public resetPlayer(): void {
    this.interactionManager.closeInspection();
    this.player.reset(this.world.spawnPoint);
    this.springArm.resetOrientation(this.world.spawnPoint);
    this.emitTelemetry();
  }

  public teleportTo(x: number, y: number, z: number): void {
    this.interactionManager.closeInspection();
    const dest = new THREE.Vector3(x, y, z);
    this.player.reset(dest);
    this.springArm.resetOrientation(dest);
    this.emitTelemetry();
  }

  private readonly handleResize = (): void => {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.springArm.setAspect(w / h);
    this.renderer.setSize(w, h);
  };

  private readonly handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.onContextLostCallback?.(true);
  };

  private readonly handleContextRestored = (): void => {
    this.onContextLostCallback?.(false);
  };

  private resolveAreaName(): string {
    if (this.currentMapId === 'greybox') return 'Proving Yard';
    const { x, z } = this.player.position;

    // 0. Outer Vaelcrest Countryside & Green Wilds
    if (z > 335.0) {
      if (Math.hypot(x + 88, z - 468) < 42 || Math.hypot(x - 94, z - 522) < 44) {
        return 'Vaelcrest Wilds · Emerald Glade Pond';
      }
      if (Math.abs(x - Math.sin((z - 336) * 0.011) * 16) < 16) {
        return 'Vaelcrest Domain · Woodland Highway';
      }
      return 'Vaelcrest Domain · Emerald Wilds';
    }
    if (x < -290.0) return 'Vaelcrest Wilds · West Meadow Woods';
    if (x > 308.0) return 'Vaelcrest Wilds · East Highland Woods';

    // 1. Grand Canal & Outer Expansion Districts
    if (z >= 120.0 && z <= 154.0) {
      if (Math.abs(x) < 12.0) return 'Grand Canal · Central Bridge';
      if (x < -120.0) return 'Grand Canal · West Bridge';
      if (x > 90.0) return 'Grand Canal · East Bridge';
      return 'Grand Canal Shipping Locks';
    }
    if (z > 154.0 && z <= 166.5) return 'South Canal Promenade';
    if (z > 318.0) return 'Domain Overland Bastion Gate';
    if (z > 166.5) {
      if (x > 175.0) return 'East Residential Estates';
      if (Math.abs(x) < 28.0 && Math.abs(z - 212.0) < 28.0) return 'Grand Exchange Square';
      if (x < -28.0 && z > 228.0) return 'Residential Quarter · Civic School';
      if (x > 28.0 && z > 228.0) return 'Merchant Quarter · Reserve Bank';
      return 'Merchant Quarter';
    }

    if (x < -132.0) {
      if (z < 14.5) return 'Temple Quarter Sanctuary';
      if (z < 76.0) return 'Industrial Quarter · Mana Works';
      return 'Mana-Rail Freight Yard';
    }

    if (x > 135.5) {
      if (z > 88.0) return 'Citadel Landing';
      if (x > 215.0) return 'Three-Council Assembly Hall';
      if (z < 12.0) return 'Noble Palace Gardens';
      return 'Coastal Railgun Citadel';
    }

    // 2. Inner 5-District Core
    if (z < -62.5) {
      if (x < -14.0) return 'West Cargo Pier';
      if (x <= 11.5) return 'Central Shipyard Pier';
      return 'East Cargo Pier';
    }
    if (z < -26.2) return 'Grand Harbour Quay';
    if (z < -21.8 && Math.abs(x) <= 9.8) return 'Harbour Overlook';
    if (x >= -86.0 && x <= -64.0 && z >= -3.0 && z <= 11.0) return 'Smelting Hall';
    if (x >= -62.0 && x <= -44.0 && z >= 25.0 && z <= 36.0) return 'West Forge & Assay';
    if (x < -94.0 && z < 15.0) return 'Boiler Works Yard';
    if (x < -42.0 && z < 15.0) return 'West Refinery Yard';
    if (x < -38.0 && z >= 12.5 && z <= 25.0) return 'Refinery Avenue';
    if (x < -42.0) return 'Industrial Quarter';
    if (x >= 81.5 && z <= 58.0) return 'Noble Heights Plaza';
    if (x > 50.0 && z < 3.5) return 'Aetheric Conservatory';
    if (x > 50.0 && z > 63.0) return 'Cartography Wing';
    if (x > 50.0) return 'Academic Courtyard';
    if (x > 38.0 && z >= 12.0 && z <= 25.0) return 'Academic Concourse';
    if (z > 83.5) return 'South Merchant Promenade';
    if (z > 51.5) return 'Merchant Guild Plaza';
    if (z > 38.5) return 'Overland Gate Approach';
    if (x < -17.0 && z < 13.0) return 'Worker Courtyard';
    if (x > 16.5 && z < 13.0) return 'Copperwell Square';
    if (x >= -17.0 && x <= -9.5 && z >= 4.0 && z <= 12.5) return 'Vaelcrest Chandlery';
    if (x >= 9.5 && x <= 17.0 && z >= -6.5 && z <= 2.5) return 'Salt & Brass Tavern';
    if (z >= 12.5 && z <= 24.5 && Math.abs(x) > 6.0) return 'Foundry Row';
    return 'Harbourgate Lane';
  }

  private emitTelemetry(): void {
    const horizSpeed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    this.onTelemetry({
      speed: horizSpeed,
      verticalSpeed: this.player.velocity.y,
      grounded: this.player.grounded,
      crouched: this.player.crouched,
      sprinting: this.player.sprinting,
      stamina: this.player.stamina,
      maxStamina: this.player.maxStamina,
      activeEmote: this.player.activeEmote,
      locomotionState: this.player.getLocomotionState(),
      combatState: this.player.getCombatState(),
      comboCount: this.combatSystem.getComboCount(),
      totalHits: this.combatSystem.getTotalHits(),
      lastDamageDealt: this.combatSystem.getLastDamageDealt(),
      cameraMode: this.springArm.mode,
      mapId: this.currentMapId,
      areaName: this.resolveAreaName(),
      weatherState: this.weatherSystem.state,
      weatherAutoCycle: this.weatherSystem.isAutoCycling,
      npcCount: this.npcManager.count,
      wildlifeCount: this.world.wildlifeCount ?? 0,
      southGateOpen: this.world.isGateOpen?.('south_bastion_gate') ?? false,
      crowns: this.crowns,
      collectedCount: this.interactionManager.getCollectedCount(),
      totalPickables: this.interactionManager.getTotalPickables(),
      recentPickupTitle: this.interactionManager.getRecentPickupTitle(),
      pointerLocked: this.input.pointerLocked,
      fps: this.currentFps,
      position: {
        x: this.player.position.x,
        y: this.player.position.y,
        z: this.player.position.z,
      },
      yaw: this.player.yaw,
      cameraYaw: this.springArm.yaw,
      activePrompt: this.interactionManager.getActivePrompt(),
      activeInspection: this.interactionManager.getActiveInspection(),
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.ALREADY_SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private readonly tick = (): void => {
    if (this.disposed) return;

    const dt = this.clock.getDelta();
    this.fpsAccum += dt;
    this.fpsFrames += 1;
    if (this.fpsAccum >= 0.4) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    const inputSnap = this.input.sample();
    this.player.update(
      dt,
      inputSnap,
      this.springArm.yaw,
      this.world.boxColliders,
      this.world.rampColliders,
      this.world.worldBoundsRadius,
      this.world.worldBounds,
      this.world.defaultGroundY ?? 0,
      this.world.groundHeightAt,
      {
        onFireSidearm: (origin, dir) => {
          this.combatSystem.spawnSidearmBolt(origin, dir);
        },
        onPlayerEmote: (emote) => {
          this.npcManager.notifyPlayerEmote(this.player.position, emote);
        },
      }
    );

    const horizSpeed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    this.combatSystem.update(
      dt,
      this.player.position,
      horizSpeed,
      this.springArm.mode,
      this.player.getSwingSnapshot(),
      (critical) => {
        this.springArm.triggerCombatImpulse(critical ? 0.14 : 0.08);
      }
    );

    this.npcManager.update(dt, this.player.position);
    this.interactionManager.update(dt, this.player.position, this.springArm.yaw, this.npcManager);
    if (inputSnap.interactPressed) {
      this.interactionManager.triggerInteract();
    }

    const collectedNow = this.interactionManager.getCollectedCount();
    let crownsEarned = false;
    if (collectedNow > this.lastCollectedAwarded) {
      this.crowns += (collectedNow - this.lastCollectedAwarded) * 15;
      this.lastCollectedAwarded = collectedNow;
      crownsEarned = true;
    } else if (collectedNow < this.lastCollectedAwarded) {
      this.lastCollectedAwarded = collectedNow;
    }
    const defeatsNow = this.combatSystem.consumeDefeats();
    if (defeatsNow > 0) {
      this.crowns += defeatsNow * 8;
      crownsEarned = true;
    }
    if (crownsEarned) {
      this.emitTelemetry();
    }

    this.world.update?.(dt, this.player.position);
    const weatherChanged = this.weatherSystem.update(dt, this.player.position, {
      scene: this.scene,
      renderer: this.renderer,
      sunLight: this.sunLight,
      hemiLight: this.hemiLight,
      rimLight: this.rimLight,
    });

    const landingImpulse = this.player.consumeLandingImpulse();
    if (landingImpulse > 0) {
      this.springArm.triggerLandingDip(landingImpulse);
    }

    this.springArm.update(
      dt,
      inputSnap,
      this.player.position,
      this.player.getCameraAnchorY(),
      this.player.getFirstPersonEyeY(),
      this.player.sprinting,
      this.player.crouched,
      this.world.raycastTargets
    );

    this.sunLight.target.position.set(this.player.position.x, this.player.position.y, this.player.position.z);
    this.sunLight.position.set(
      this.player.position.x + 28,
      this.player.position.y + 44,
      this.player.position.z + 22
    );

    this.renderer.render(this.scene, this.springArm.camera);

    if (this.onFloatingLabels) {
      const floatingLabels = this.interactionManager.computeFloatingLabels(
        this.springArm.camera,
        this.container.clientWidth,
        this.container.clientHeight,
        this.npcManager
      );
      this.onFloatingLabels(floatingLabels);
    }

    if (this.onCombatOverlay) {
      const overlay = this.combatSystem.computeCombatOverlay(
        this.springArm.camera,
        this.container.clientWidth,
        this.container.clientHeight,
        this.player.position
      );
      this.onCombatOverlay(overlay);
    }

    const combatStateNow = this.player.getCombatState();
    const combatChanged = combatStateNow !== this.lastCombatState || this.combatSystem.consumeDirty();
    this.lastCombatState = combatStateNow;

    this.telemetryTimer += dt;
    if (
      weatherChanged ||
      combatChanged ||
      this.interactionManager.consumeDirty() ||
      this.telemetryTimer >= 0.05
    ) {
      this.telemetryTimer = 0;
      this.emitTelemetry();
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    window.removeEventListener('resize', this.handleResize);

    this.input.dispose();
    this.npcManager.dispose();
    this.player.dispose();
    this.combatSystem.dispose();
    this.weatherSystem.dispose();
    this.world.dispose();
    this.envTexture.dispose();
    this.renderer.dispose();

    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
