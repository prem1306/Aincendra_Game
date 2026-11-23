import { ChevronDown, ChevronUp, Cloud, CloudRain, Coins, DoorClosed, DoorOpen, RotateCcw, Sun, TrainFront, X } from 'lucide-react';
import type {
  CameraMode,
  MapId,
  MovementConfig,
  NpcReactionKind,
  PlayerEmoteKind,
  PlayerTelemetry,
  WeatherState,
} from '../aincendra/core/types';
import { ElarionMinimap } from './ElarionMinimap';

interface GameHUDProps {
  telemetry: PlayerTelemetry;
  config: MovementConfig;
  dockOpen: boolean;
  contextLost: boolean;
  onToggleDock: () => void;
  onUpdateConfig: (partial: Partial<MovementConfig>) => void;
  onChangeCameraMode: (mode: CameraMode) => void;
  onChangeMap: (mapId: MapId) => void;
  onChangeWeather: (mode: WeatherState | 'auto') => void;
  onResetPlayer: () => void;
  onTeleport: (x: number, y: number, z: number) => void;
  onLockPointer: () => void;
  onCloseInspection: () => void;
  onSelectDialogueChoice: (index: number) => void;
  onTriggerEmote: (emote: PlayerEmoteKind) => void;
  onOpenRailNetwork: () => void;
}

const REACTION_LABELS: Record<NpcReactionKind, string> = {
  none: '',
  salute: 'Salutes',
  wave: 'Waves',
  nod: 'Nods',
  laugh: 'Laughs',
  point: 'Points outward',
  bow: 'Bows respectfully',
};

const WEATHER_LABELS: Record<WeatherState, string> = {
  clear: 'Clear',
  overcast: 'Overcast',
  rainy: 'Rainy',
};

export function GameHUD({
  telemetry,
  config,
  dockOpen,
  contextLost,
  onToggleDock,
  onUpdateConfig,
  onChangeCameraMode,
  onChangeMap,
  onChangeWeather,
  onResetPlayer,
  onTeleport,
  onLockPointer,
  onCloseInspection,
  onSelectDialogueChoice,
  onTriggerEmote,
  onOpenRailNetwork,
}: GameHUDProps) {
  const mapLabel =
    telemetry.mapId === 'elarion-district'
      ? 'Elarion · Capital Metropolis'
      : 'Greybox Yard · Milestone 2';

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
      {/* Top-Left Minimal Spec Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="pointer-events-auto rounded-lg border border-white/12 bg-[#0f1318]/88 px-3.5 py-2.5 shadow-lg">
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-sm font-bold tracking-wide text-[#f1ede4] whitespace-nowrap">
              Aincendra: Elarion
            </h1>
            <span className="text-white/25" aria-hidden="true">·</span>
            <span className="text-xs text-[#9fb2c2] whitespace-nowrap">
              {telemetry.areaName}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2.5 text-xs text-[#c7c4bc] font-mono-tabular">
            <span>{mapLabel}</span>
            <span className="text-white/25" aria-hidden="true">·</span>
            <span>{telemetry.locomotionState}</span>
            <span className="text-white/25" aria-hidden="true">/</span>
            <span className={telemetry.combatState !== 'Ready' ? 'text-[#f4c382]' : ''}>
              {telemetry.combatState}
              {telemetry.comboCount > 0 ? ` (${telemetry.comboCount}×)` : ''}
            </span>
            <span className="text-white/25" aria-hidden="true">/</span>
            <span>{telemetry.speed.toFixed(2)} m/s</span>
            <span className="text-white/25" aria-hidden="true">/</span>
            <span>{telemetry.npcCount} NPCs</span>
            {telemetry.wildlifeCount > 0 && telemetry.mapId === 'elarion-district' && (
              <>
                <span className="text-white/25" aria-hidden="true">/</span>
                <span className="text-[#8cd17d]">{telemetry.wildlifeCount} Wild Fauna</span>
              </>
            )}
            {telemetry.totalPickables > 0 && (
              <>
                <span className="text-white/25" aria-hidden="true">/</span>
                <span className="text-[#7de2f0]">
                  {telemetry.collectedCount}/{telemetry.totalPickables} Items
                </span>
              </>
            )}
            <span className="text-white/25" aria-hidden="true">/</span>
            <span>{WEATHER_LABELS[telemetry.weatherState]}</span>
            <span className="text-white/25" aria-hidden="true">/</span>
            <span>{telemetry.fps} FPS</span>
          </div>

          {/* Stamina Bar & Bastion Gate Clearance Row */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-[#9fb2c2]">Stamina</span>
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/12">
                <div
                  className="h-full rounded-full bg-[#6ecad9] transition-all duration-75"
                  style={{
                    width: `${Math.max(0, Math.min(100, (telemetry.stamina / telemetry.maxStamina) * 100))}%`,
                  }}
                />
              </div>
              <span className="font-mono-tabular text-[#d9d5cc]">
                {Math.round(telemetry.stamina)}
              </span>
            </div>

            {telemetry.mapId === 'elarion-district' && (
              <>
                <div className="flex items-center gap-1.5 text-[#c7c4bc]">
                  {telemetry.southGateOpen ? (
                    <>
                      <DoorOpen className="h-3.5 w-3.5 text-[#8cd17d]" />
                      <span className="text-[#8cd17d]">South Gate Open</span>
                    </>
                  ) : (
                    <>
                      <DoorClosed className="h-3.5 w-3.5 text-[#d4965b]" />
                      <span className="text-[#d4965b]">South Gate Guarded</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1.5 font-mono-tabular text-[#f2c484]">
                  <Coins className="h-3.5 w-3.5" />
                  <span>{telemetry.crowns} Cr</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Top-Right Pointer-Lock Prompt & Elarion District Minimap */}
        <div className="flex items-start justify-end gap-2.5">
          {!telemetry.pointerLocked && (
            <button
              type="button"
              onClick={onLockPointer}
              className="pointer-events-auto rounded-lg border border-white/15 bg-[#0f1318]/88 px-3.5 py-2 text-xs font-medium text-[#e7e5df] transition-colors hover:border-[#b67a4e]/70 hover:text-white focus-visible:outline-2 focus-visible:outline-[#b67a4e] whitespace-nowrap shrink-0"
            >
              Click viewport or here for Mouse Look (or drag)
            </button>
          )}
          {telemetry.mapId === 'elarion-district' && (
            <ElarionMinimap
              position={telemetry.position}
              yaw={telemetry.yaw}
              cameraYaw={telemetry.cameraYaw}
              cameraMode={telemetry.cameraMode}
              areaName={telemetry.areaName}
              southGateOpen={telemetry.southGateOpen}
              onTeleport={onTeleport}
            />
          )}
        </div>
      </div>

      {/* Subtle center reticle only when pointer-locked */}
      {telemetry.pointerLocked && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/75"
        />
      )}

      {contextLost && (
        <div className="pointer-events-auto mx-auto rounded-lg border border-amber-500/40 bg-[#1a1510]/95 px-4 py-3 text-sm text-amber-200">
          WebGL rendering context was interrupted. Waiting for GPU recovery.
        </div>
      )}

      {/* Unified Collapsible Bottom Control Dock + Interaction Overlay */}
      <div className="mx-auto flex w-full max-w-[1060px] flex-col items-center">
        {telemetry.activeInspection && (
          <div className="pointer-events-auto mb-3 w-full max-w-[680px] rounded-xl border border-[#b67a4e]/45 bg-[#0f1318]/94 px-4 py-3.5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#b67a4e]">
                  <span>{telemetry.activeInspection.category}</span>
                  {telemetry.activeInspection.subtitle && (
                    <>
                      <span className="text-white/25" aria-hidden="true">·</span>
                      <span className="text-[#9fb2c2]">{telemetry.activeInspection.subtitle}</span>
                    </>
                  )}
                  {telemetry.activeInspection.npcReaction &&
                    telemetry.activeInspection.npcReaction !== 'none' && (
                      <>
                        <span className="text-white/25" aria-hidden="true">·</span>
                        <span className="text-[#8cd17d]">
                          [{REACTION_LABELS[telemetry.activeInspection.npcReaction]}]
                        </span>
                      </>
                    )}
                </div>
                <h2 className="mt-0.5 font-display text-base font-semibold text-[#f1ede4]">
                  {telemetry.activeInspection.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={onCloseInspection}
                aria-label="Close inspection panel"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-white/12 bg-[#171d24] text-[#c7c4bc] transition-colors hover:border-[#b67a4e]/70 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-[#ddd9d0]">
              {telemetry.activeInspection.lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>

            {telemetry.activeInspection.choices && telemetry.activeInspection.choices.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {telemetry.activeInspection.choices.map((choice, idx) => (
                  <button
                    key={`${choice.label}-${idx}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDialogueChoice(idx);
                    }}
                    className="flex items-center gap-2.5 rounded-lg border border-white/12 bg-[#171d24] px-3 py-2 text-left text-xs font-medium text-[#e9e5dc] transition-colors hover:border-[#b67a4e]/80 hover:bg-[#1e2630] hover:text-white"
                  >
                    <span className="font-mono-tabular text-[#b67a4e]">[{idx + 1}]</span>
                    <span>{choice.label}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-2.5 text-[11px] text-[#8d99a6]">
              {telemetry.activeInspection.choices?.length
                ? 'Click an option or press 1–3 · Press E or Esc to close, or walk away'
                : 'Press E or Esc to close, or walk away'}
            </div>
          </div>
        )}

        {telemetry.recentPickupTitle && !telemetry.activeInspection && (
          <div className="pointer-events-none mb-2.5 rounded-lg border border-[#7de2f0]/55 bg-[#0f1318]/92 px-3.5 py-1.5 text-xs text-[#f1ede4] shadow-lg">
            <span className="font-semibold text-[#7de2f0]">Picked Up</span>
            <span className="mx-2 text-white/30" aria-hidden="true">·</span>
            <span>{telemetry.recentPickupTitle}</span>
            <span className="ml-2 font-mono-tabular text-[#9fb2c2]">
              ({telemetry.collectedCount}/{telemetry.totalPickables})
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleDock}
          className="pointer-events-auto mb-1.5 flex items-center gap-1.5 rounded-md border border-white/12 bg-[#0f1318]/90 px-3 py-1 text-xs font-medium text-[#c7c4bc] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-[#b67a4e] whitespace-nowrap shrink-0"
        >
          {dockOpen ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              <span>Hide Controls (H)</span>
            </>
          ) : (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              <span>Show Controls (H)</span>
            </>
          )}
        </button>

        <div
          className={`pointer-events-auto w-full rounded-xl border border-white/12 bg-[#0f1318]/92 px-4 py-3 shadow-2xl transition-all duration-200 ${
            dockOpen
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-6 opacity-0 h-0 overflow-hidden py-0 border-0'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Configurable Movement Speeds & Responsiveness */}
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex flex-col gap-1 text-xs text-[#a8b3be]">
                <span className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span>Walk</span>
                  <span className="font-mono-tabular text-[#e7e5df]">{config.walkSpeed.toFixed(1)} m/s</span>
                </span>
                <input
                  type="range"
                  min={2.5}
                  max={7.5}
                  step={0.1}
                  value={config.walkSpeed}
                  onChange={(e) => onUpdateConfig({ walkSpeed: Number(e.target.value) })}
                  className="h-1.5 w-20 cursor-pointer accent-[#b67a4e]"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[#a8b3be]">
                <span className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span>Sprint</span>
                  <span className="font-mono-tabular text-[#e7e5df]">{config.sprintSpeed.toFixed(1)} m/s</span>
                </span>
                <input
                  type="range"
                  min={6.0}
                  max={12.0}
                  step={0.2}
                  value={config.sprintSpeed}
                  onChange={(e) => onUpdateConfig({ sprintSpeed: Number(e.target.value) })}
                  className="h-1.5 w-20 cursor-pointer accent-[#b67a4e]"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[#a8b3be]">
                <span className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span>Crouch</span>
                  <span className="font-mono-tabular text-[#e7e5df]">{config.crouchSpeed.toFixed(1)} m/s</span>
                </span>
                <input
                  type="range"
                  min={1.4}
                  max={4.0}
                  step={0.1}
                  value={config.crouchSpeed}
                  onChange={(e) => onUpdateConfig({ crouchSpeed: Number(e.target.value) })}
                  className="h-1.5 w-20 cursor-pointer accent-[#b67a4e]"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[#a8b3be]">
                <span className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span>Accel</span>
                  <span className="font-mono-tabular text-[#e7e5df]">{config.acceleration.toFixed(0)}</span>
                </span>
                <input
                  type="range"
                  min={10}
                  max={36}
                  step={1}
                  value={config.acceleration}
                  onChange={(e) => onUpdateConfig({ acceleration: Number(e.target.value) })}
                  className="h-1.5 w-16 cursor-pointer accent-[#b67a4e]"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[#a8b3be]">
                <span className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span>Turn</span>
                  <span className="font-mono-tabular text-[#e7e5df]">{config.rotationRate.toFixed(0)}</span>
                </span>
                <input
                  type="range"
                  min={6}
                  max={24}
                  step={1}
                  value={config.rotationRate}
                  onChange={(e) => onUpdateConfig({ rotationRate: Number(e.target.value) })}
                  className="h-1.5 w-16 cursor-pointer accent-[#b67a4e]"
                />
              </label>
            </div>

            {/* Map Switch, Camera Mode & Reset */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-lg border border-white/10 bg-[#171d24] p-0.5">
                <button
                  type="button"
                  onClick={() => onChangeMap('elarion-district')}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    telemetry.mapId === 'elarion-district'
                      ? 'bg-[#b67a4e] text-[#0f1318]'
                      : 'text-[#b5bec7] hover:text-white'
                  }`}
                >
                  Elarion District
                </button>
                <button
                  type="button"
                  onClick={() => onChangeMap('greybox')}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    telemetry.mapId === 'greybox'
                      ? 'bg-[#b67a4e] text-[#0f1318]'
                      : 'text-[#b5bec7] hover:text-white'
                  }`}
                >
                  Greybox Yard
                </button>
              </div>

              <div className="flex items-center rounded-lg border border-white/10 bg-[#171d24] p-0.5">
                <button
                  type="button"
                  onClick={() => onChangeCameraMode('third-person')}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    telemetry.cameraMode === 'third-person'
                      ? 'bg-[#b67a4e] text-[#0f1318]'
                      : 'text-[#b5bec7] hover:text-white'
                  }`}
                >
                  3rd Person
                </button>
                <button
                  type="button"
                  onClick={() => onChangeCameraMode('first-person')}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    telemetry.cameraMode === 'first-person'
                      ? 'bg-[#b67a4e] text-[#0f1318]'
                      : 'text-[#b5bec7] hover:text-white'
                  }`}
                >
                  1st Person
                </button>
              </div>

              <div className="flex items-center rounded-lg border border-white/10 bg-[#171d24] p-0.5" role="group" aria-label="Dynamic Weather">
                <button
                  type="button"
                  onClick={() => onChangeWeather('auto')}
                  title="Automatic Weather Cycle"
                  className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    telemetry.weatherAutoCycle
                      ? 'bg-[#b67a4e] text-[#0f1318]'
                      : 'text-[#b5bec7] hover:text-white'
                  }`}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => onChangeWeather('clear')}
                  title="Clear Sky"
                  className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    !telemetry.weatherAutoCycle && telemetry.weatherState === 'clear'
                      ? 'bg-[#b67a4e] text-[#0f1318]'
                      : 'text-[#b5bec7] hover:text-white'
                  }`}
                >
                  <Sun className="h-3 w-3" />
                  <span>Clear</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeWeather('overcast')}
                  title="Overcast"
                  className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    !telemetry.weatherAutoCycle && telemetry.weatherState === 'overcast'
                      ? 'bg-[#b67a4e] text-[#0f1318]'
                      : 'text-[#b5bec7] hover:text-white'
                  }`}
                >
                  <Cloud className="h-3 w-3" />
                  <span>Overcast</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeWeather('rainy')}
                  title="Coastal Rain"
                  className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    !telemetry.weatherAutoCycle && telemetry.weatherState === 'rainy'
                      ? 'bg-[#b67a4e] text-[#0f1318]'
                      : 'text-[#b5bec7] hover:text-white'
                  }`}
                >
                  <CloudRain className="h-3 w-3" />
                  <span>Rain</span>
                </button>
              </div>

              <div className="flex items-center rounded-lg border border-white/10 bg-[#171d24] p-0.5" role="group" aria-label="Player Emotes">
                {(
                  [
                    ['wave', 'Wave (1)'],
                    ['salute', 'Salute (2)'],
                    ['sit', 'Sit (3)'],
                  ] as const
                ).map(([emoteId, emoteLabel]) => (
                  <button
                    key={emoteId}
                    type="button"
                    onClick={() => onTriggerEmote(emoteId)}
                    className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      telemetry.activeEmote === emoteId
                        ? 'bg-[#b67a4e] text-[#0f1318]'
                        : 'text-[#b5bec7] hover:text-white'
                    }`}
                  >
                    {emoteLabel}
                  </button>
                ))}
              </div>

              {telemetry.mapId === 'elarion-district' && (
                <button
                  type="button"
                  onClick={onOpenRailNetwork}
                  className="flex items-center gap-1.5 rounded-lg border border-[#7de2f0]/45 bg-[#15202b] px-2.5 py-1.5 text-xs font-medium text-[#9ff3ff] transition-colors hover:border-[#7de2f0] hover:bg-[#1a2938] hover:text-white whitespace-nowrap shrink-0"
                >
                  <TrainFront className="h-3.5 w-3.5" />
                  <span>Mana-Rail (T)</span>
                </button>
              )}

              <button
                type="button"
                onClick={onResetPlayer}
                className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#171d24] px-2.5 py-1.5 text-xs font-medium text-[#e7e5df] transition-colors hover:border-[#b67a4e]/70 hover:text-white whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Unboxed Controls Legend */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/8 pt-2 text-[11px] text-[#9aa5b1]">
            <span>WASD Move · Shift Sprint · Space Jump/Vault · Ctrl/C Crouch · LMB/F Slash · R Heavy Cleave · X Mana Sidearm · V Dodge Roll · RMB/Q Guard · 1-3 Emotes · T Mana-Rail · E Speak/Pick Up</span>
            <span aria-hidden="true">|</span>
            <span>Harbour (N) · Mana Works (W) · Council Heights (E) · South Bastion Gate &amp; Emerald Wilds (S)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
