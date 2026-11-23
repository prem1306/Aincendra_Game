import { useCallback, useEffect, useRef, useState } from 'react';
import { AincendraEngine } from './aincendra/AincendraEngine';
import {
  DEFAULT_MOVEMENT_CONFIG,
  type CameraMode,
  type MapId,
  type MovementConfig,
  type PlayerEmoteKind,
  type PlayerTelemetry,
  type WeatherState,
} from './aincendra/core/types';
import { GameHUD } from './components/GameHUD';
import {
  FloatingInteractLabels,
  type FloatingInteractLabelsHandle,
} from './components/FloatingInteractLabels';
import {
  FloatingCombatOverlay,
  type FloatingCombatOverlayHandle,
} from './components/FloatingCombatOverlay';
import { ManaRailModal } from './components/ManaRailModal';
import {
  ALL_LINE_PASS_PRICE,
  findNearestRailStation,
  type RailStationId,
} from './aincendra/world/ManaRailNetwork';

const INITIAL_TELEMETRY: PlayerTelemetry = {
  speed: 0,
  verticalSpeed: 0,
  grounded: true,
  crouched: false,
  sprinting: false,
  stamina: 100,
  maxStamina: 100,
  activeEmote: 'none',
  locomotionState: 'Idle',
  combatState: 'Ready',
  comboCount: 0,
  totalHits: 0,
  lastDamageDealt: 0,
  cameraMode: 'third-person',
  mapId: 'elarion-district',
  areaName: 'Harbourgate Lane',
  weatherState: 'clear',
  weatherAutoCycle: true,
  npcCount: 104,
  wildlifeCount: 27,
  southGateOpen: false,
  crowns: 48,
  collectedCount: 0,
  totalPickables: 18,
  recentPickupTitle: null,
  pointerLocked: false,
  fps: 60,
  position: { x: 0, y: 0, z: 29 },
  yaw: 0,
  cameraYaw: 0,
  activePrompt: null,
  activeInspection: null,
};

const INITIAL_TICKETS: Record<RailStationId, number> = {
  harbour: 0,
  temple: 0,
  manaworks: 0,
  merchant: 0,
  councils: 0,
  bastion: 0,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AincendraEngine | null>(null);
  const floatingLabelsRef = useRef<FloatingInteractLabelsHandle | null>(null);
  const combatOverlayRef = useRef<FloatingCombatOverlayHandle | null>(null);

  const [telemetry, setTelemetry] = useState<PlayerTelemetry>(INITIAL_TELEMETRY);
  const telemetryRef = useRef<PlayerTelemetry>(INITIAL_TELEMETRY);
  const [config, setConfig] = useState<MovementConfig>(DEFAULT_MOVEMENT_CONFIG);
  const [dockOpen, setDockOpen] = useState(true);
  const [contextLost, setContextLost] = useState(false);

  const [railModalOpen, setRailModalOpen] = useState(false);
  const [railOriginId, setRailOriginId] = useState<RailStationId>('harbour');
  const [railTickets, setRailTickets] = useState<Record<RailStationId, number>>(INITIAL_TICKETS);
  const [railDayPass, setRailDayPass] = useState(false);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new AincendraEngine(
      mount,
      (nextTelemetry) => {
        telemetryRef.current = nextTelemetry;
        setTelemetry(nextTelemetry);
      },
      (lost) => setContextLost(lost),
      (labels) => floatingLabelsRef.current?.updateLabels(labels),
      (overlay) => combatOverlayRef.current?.updateCombatOverlay(overlay),
      (stationId) => {
        setRailOriginId(stationId as RailStationId);
        setRailModalOpen(true);
      }
    );
    engineRef.current = engine;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyH' && !e.repeat) {
        setDockOpen((prev) => !prev);
      } else if (e.code === 'KeyT' && !e.repeat) {
        if (telemetryRef.current.mapId === 'elarion-district') {
          setRailModalOpen((prev) => {
            if (!prev) {
              const nearest = findNearestRailStation(
                telemetryRef.current.position.x,
                telemetryRef.current.position.z
              );
              setRailOriginId(nearest.id);
              engine.releasePointerLock();
            }
            return !prev;
          });
        }
      } else if (e.code === 'Escape' && !e.repeat) {
        setRailModalOpen(false);
        engine.closeInspection();
      } else if (!e.repeat && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3')) {
        const idx = e.code === 'Digit1' ? 0 : e.code === 'Digit2' ? 1 : 2;
        engine.selectDialogueChoice(idx);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleUpdateConfig = useCallback((partial: Partial<MovementConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      engineRef.current?.updateMovementConfig(partial);
      return next;
    });
  }, []);

  const handleChangeCameraMode = useCallback((mode: CameraMode) => {
    engineRef.current?.setCameraMode(mode);
  }, []);

  const handleChangeMap = useCallback((mapId: MapId) => {
    engineRef.current?.setMap(mapId);
  }, []);

  const handleResetPlayer = useCallback(() => {
    engineRef.current?.resetPlayer();
  }, []);

  const handleTeleport = useCallback((x: number, y: number, z: number) => {
    engineRef.current?.teleportTo(x, y, z);
  }, []);

  const handleLockPointer = useCallback(() => {
    engineRef.current?.requestPointerLock();
  }, []);

  const handleCloseInspection = useCallback(() => {
    engineRef.current?.closeInspection();
  }, []);

  const handleChangeWeather = useCallback((mode: WeatherState | 'auto') => {
    engineRef.current?.setWeatherMode(mode);
  }, []);

  const handleSelectDialogueChoice = useCallback((index: number) => {
    engineRef.current?.selectDialogueChoice(index);
  }, []);

  const handleTriggerEmote = useCallback((emote: PlayerEmoteKind) => {
    engineRef.current?.triggerEmote(emote);
  }, []);

  const handleOpenRailNetwork = useCallback(() => {
    if (telemetryRef.current.mapId !== 'elarion-district') return;
    const nearest = findNearestRailStation(
      telemetryRef.current.position.x,
      telemetryRef.current.position.z
    );
    setRailOriginId(nearest.id);
    engineRef.current?.releasePointerLock();
    setRailModalOpen(true);
  }, []);

  const handleBuyRailTicket = useCallback((stationId: RailStationId, fare: number) => {
    const engine = engineRef.current;
    if (!engine || !engine.spendCrowns(fare)) return false;
    setRailTickets((prev) => ({
      ...prev,
      [stationId]: (prev[stationId] ?? 0) + 1,
    }));
    return true;
  }, []);

  const handleBuyRailDayPass = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !engine.spendCrowns(ALL_LINE_PASS_PRICE)) return false;
    setRailDayPass(true);
    return true;
  }, []);

  const handleDepartRail = useCallback(
    (destinationId: RailStationId, useTicket: boolean, fareIfBuying: number) => {
      if (railDayPass) return true;
      if (useTicket) {
        setRailTickets((prev) => ({
          ...prev,
          [destinationId]: Math.max(0, (prev[destinationId] ?? 0) - 1),
        }));
        return true;
      }
      const engine = engineRef.current;
      return Boolean(engine && engine.spendCrowns(fareIfBuying));
    },
    [railDayPass]
  );

  return (
    <main className="relative h-full w-full overflow-hidden bg-[#0f1318]">
      <div
        ref={canvasMountRef}
        onClick={handleLockPointer}
        className="h-full w-full cursor-crosshair"
        aria-label="Aincendra Elarion 3D Viewport"
      />

      <FloatingInteractLabels ref={floatingLabelsRef} />
      <FloatingCombatOverlay ref={combatOverlayRef} />

      <GameHUD
        telemetry={telemetry}
        config={config}
        dockOpen={dockOpen}
        contextLost={contextLost}
        onToggleDock={() => setDockOpen((prev) => !prev)}
        onUpdateConfig={handleUpdateConfig}
        onChangeCameraMode={handleChangeCameraMode}
        onChangeMap={handleChangeMap}
        onChangeWeather={handleChangeWeather}
        onResetPlayer={handleResetPlayer}
        onTeleport={handleTeleport}
        onLockPointer={handleLockPointer}
        onCloseInspection={handleCloseInspection}
        onSelectDialogueChoice={handleSelectDialogueChoice}
        onTriggerEmote={handleTriggerEmote}
        onOpenRailNetwork={handleOpenRailNetwork}
      />

      <ManaRailModal
        open={railModalOpen && telemetry.mapId === 'elarion-district'}
        originStationId={railOriginId}
        crowns={telemetry.crowns}
        tickets={railTickets}
        dayPassActive={railDayPass}
        onClose={() => setRailModalOpen(false)}
        onBuyTicket={handleBuyRailTicket}
        onBuyDayPass={handleBuyRailDayPass}
        onDepart={handleDepartRail}
        onArrivalTeleport={handleTeleport}
      />
    </main>
  );
}
