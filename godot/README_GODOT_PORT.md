# Aincendra: Elarion — Godot 4.3+ Complete World & RPG Port

This directory (`/godot/`) contains a standalone **Godot 4.3+ Forward+** port of the Elarion coastal metropolis, Castle Vaelcrest, Mana-Rail transit network, and Vaelcrest Emerald Wilds countryside.

## Opening in Godot 4.3+
1. Launch **Godot 4.3** (or newer).
2. Click **Import** and select `/godot/project.godot`.
3. Let Godot import the 27 `.glb` models in `res://assets/models/` on first launch.
4. Press **F5** (Play Project) to spawn in Copperwell Square `(0, 0.25, 29)`.

## Re-exporting World Data from the Web Codebase
Whenever you edit buildings, Castle Vaelcrest, NPCs, quests, crafting recipes, or Mana-Rail stations in `src/aincendra/`, run:
```bash
npm run export:godot
```
This rebuilds the Three.js scene graph headlessly and refreshes:
- `godot/assets/models/*.glb` (all 27 standard glTF 2.0 models)
- `godot/data/world_geometry.json` (4,866 architectural primitives, 909 custom landmark meshes, 76 curated GLB mounts, 1,716 box colliders, 15 ramp colliders)
- `godot/data/npcs.json` (98 NPCs with patrol waypoints and branching dialogue trees)
- `godot/data/interactables.json` (72 district notices, shrines, kiosks, and combat dummies)
- `godot/data/rpg_catalog.json` (items, crafting recipes, quests, spells, Mana-Rail network, enemy archetypes, and 11 enemy spawns including the Crystal Wyrm boss)

## Controls
- **WASD** — Move · **Shift** — Sprint · **C** — Crouch · **Space** — Jump · **V** — Dodge Roll
- **Mouse** — Look · **F** — Toggle 3rd / 1st Person Camera
- **LMB** — 3-Hit Sabre Combo · **RMB** — Guard & Timed Parry · **R** — Flintlock Sidearm
- **1 / 2 / 3 / 4** — Arc Bolt / Pyre Nova / Chrono Ward / Ley-Siphon Lance
- **G** — Exothermic Vent (purges Thermal Heat in an AoE burst)
- **Q / 5** — Vitality Elixir / Aether Draught
- **E** — Speak with NPCs (including Heavy Infantry gatekeepers), inspect notices, harvest nodes, or open Mana-Rail Kiosks
- **M** — Mana-Rail Transit Map · **B** — Crafting · **I** — Satchel & Gear · **J** — Quest Journal · **T** — Cycle Weather
