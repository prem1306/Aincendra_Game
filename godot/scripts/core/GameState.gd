extends Node

signal state_changed
signal notification_pushed(title: String, body: String, kind: String)
signal gate_unlocked(gate_id: String)
signal rail_travel_started(route: Dictionary)
signal weather_changed(state_name: String)

const SAVE_PATH := "user://elarion_save.json"

var catalog: Dictionary = {}
var items: Dictionary = {}
var recipes: Array = []
var quest_defs: Dictionary = {}
var quest_order: Array = []
var spells: Dictionary = {}
var spell_order: Array = []
var rail_stations: Array = []
var rail_station_map: Dictionary = {}
var rail_segments: Array = []
var rail_lines: Dictionary = {}
var all_line_pass_price: int = 18

var base_max_hp: int = 120
var base_max_mana: int = 100
var hp: float = 120.0
var max_hp: float = 120.0
var mana: float = 100.0
var max_mana: float = 100.0
var stamina: float = 100.0
var max_stamina: float = 100.0

var thermal_heat: float = 0.0
var burnout_timer: float = 0.0
var overdrive_timer: float = 0.0
var capacitor_charge: float = 0.0
var active_ward_timer: float = 0.0
var vent_cooldown: float = 0.0
var spell_cooldowns: Dictionary = {
	"arc_bolt": 0.0,
	"pyre_nova": 0.0,
	"chrono_ward": 0.0,
	"ley_lance": 0.0,
}

var level: int = 1
var xp: int = 0
var xp_to_next: int = 100
var crowns: int = 45
var enemies_defeated: int = 0
var items_crafted: int = 0

var all_line_pass: bool = false
var south_gate_open: bool = false
var castle_gate_open: bool = false

var faction_rep: Dictionary = {
	"vaelcrest": 10,
	"mana_works": 0,
	"purists": 0,
}

var equipped_weapon_id: String = "vaelcrest_sabre"
var equipped_armor_id: String = "harbour_coat"
var equipped_relic_id: String = ""

var inventory: Array = [
	{"itemId": "vaelcrest_sabre", "qty": 1},
	{"itemId": "harbour_coat", "qty": 1},
	{"itemId": "vitality_elixir", "qty": 2},
	{"itemId": "aether_draught", "qty": 2},
	{"itemId": "mana_shard", "qty": 2},
	{"itemId": "aether_herb", "qty": 1},
]

var quests: Dictionary = {}
var tracked_quest_id: String = "q_gate_conduit"
var collected_ids: Dictionary = {}

var active_station: String = "field"
var weather_state: String = "clear"
var weather_auto_cycle: bool = true
var area_name: String = "Grand Harbour Quay"

func _ready() -> void:
	_load_catalog()
	_init_quests()
	recalculate_gear_caps()

func _load_catalog() -> void:
	var f := FileAccess.open("res://data/rpg_catalog.json", FileAccess.READ)
	if f == null:
		push_error("Missing res://data/rpg_catalog.json")
		return
	var parsed = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	catalog = parsed
	items = catalog.get("items", {})
	recipes = catalog.get("recipes", [])
	quest_defs = catalog.get("quests", {})
	quest_order = catalog.get("questOrder", [])
	spells = catalog.get("spells", {})
	spell_order = catalog.get("spellOrder", [])

	var rail: Dictionary = catalog.get("manaRail", {})
	all_line_pass_price = int(rail.get("allLinePassPrice", 18))
	rail_lines = rail.get("lines", {})
	rail_stations = rail.get("stations", [])
	rail_segments = rail.get("segments", [])
	rail_station_map.clear()
	for st in rail_stations:
		rail_station_map[st["id"]] = st

func _init_quests() -> void:
	quests = {
		"q_gate_conduit": {"questId": "q_gate_conduit", "status": "active", "stageIndex": 0, "stageCount": 0},
		"q_smelting_ashes": {"questId": "q_smelting_ashes", "status": "active", "stageIndex": 0, "stageCount": 0},
		"q_emerald_shadows": {"questId": "q_emerald_shadows", "status": "active", "stageIndex": 0, "stageCount": 0},
		"q_council_conspiracy": {"questId": "q_council_conspiracy", "status": "active", "stageIndex": 0, "stageCount": 0},
	}

func _process(delta: float) -> void:
	var dt := minf(delta, 0.05)
	burnout_timer = maxf(0.0, burnout_timer - dt)
	var cool_rate := 18.0 if burnout_timer > 0.0 else 7.5
	thermal_heat = maxf(0.0, thermal_heat - cool_rate * dt)
	var mana_regen := 1.5 if burnout_timer > 0.0 else 5.2
	mana = minf(max_mana, mana + mana_regen * dt)
	hp = minf(max_hp, hp + 0.65 * dt)
	vent_cooldown = maxf(0.0, vent_cooldown - dt)
	active_ward_timer = maxf(0.0, active_ward_timer - dt)
	overdrive_timer = maxf(0.0, overdrive_timer - dt)
	for sid in spell_cooldowns.keys():
		spell_cooldowns[sid] = maxf(0.0, float(spell_cooldowns[sid]) - dt)

func push_notification(title: String, body: String, kind: String = "info") -> void:
	emit_signal("notification_pushed", title, body, kind)

func get_item_count(item_id: String) -> int:
	for entry in inventory:
		if entry["itemId"] == item_id:
			return int(entry["qty"])
	return 0

func add_item(item_id: String, qty: int) -> void:
	if qty <= 0:
		return
	for entry in inventory:
		if entry["itemId"] == item_id:
			entry["qty"] = int(entry["qty"]) + qty
			emit_signal("state_changed")
			return
	inventory.append({"itemId": item_id, "qty": qty})
	emit_signal("state_changed")

func remove_item(item_id: String, qty: int) -> void:
	if qty <= 0:
		return
	var next: Array = []
	for entry in inventory:
		if entry["itemId"] == item_id:
			var rem := int(entry["qty"]) - qty
			if rem > 0:
				next.append({"itemId": item_id, "qty": rem})
		else:
			next.append(entry)
	inventory = next
	emit_signal("state_changed")

func get_gear_bonuses() -> Dictionary:
	var weapon: Dictionary = items.get(equipped_weapon_id, {})
	var armor: Dictionary = items.get(equipped_armor_id, {})
	var relic: Dictionary = items.get(equipped_relic_id, {}) if equipped_relic_id != "" else {}
	var lvl_bonus := (level - 1) * 3
	var mult := 1.3 if overdrive_timer > 0.0 else 1.0
	var raw_atk := int(weapon.get("attackBonus", 0)) + int(relic.get("attackBonus", 0)) + lvl_bonus
	var raw_spell := int(weapon.get("spellBonus", 0)) + int(relic.get("spellBonus", 0)) + lvl_bonus
	return {
		"attackBonus": roundi(raw_atk * mult),
		"spellBonus": roundi(raw_spell * mult),
		"armorBonus": int(armor.get("armorBonus", 0)) + int(relic.get("armorBonus", 0)),
		"maxHpBonus": int(armor.get("maxHpBonus", 0)) + int(relic.get("maxHpBonus", 0)) + (level - 1) * 12,
		"maxManaBonus": int(armor.get("maxManaBonus", 0)) + int(relic.get("maxManaBonus", 0)) + (level - 1) * 10,
	}

func recalculate_gear_caps() -> void:
	var b := get_gear_bonuses()
	max_hp = float(base_max_hp + int(b["maxHpBonus"]))
	max_mana = float(base_max_mana + int(b["maxManaBonus"]))
	hp = minf(hp, max_hp)
	mana = minf(mana, max_mana)

func equip_item(item_id: String) -> bool:
	if get_item_count(item_id) <= 0 or not items.has(item_id):
		return false
	var def: Dictionary = items[item_id]
	var cat := String(def.get("category", ""))
	if cat == "weapon":
		equipped_weapon_id = item_id
	elif cat == "armor":
		equipped_armor_id = item_id
	elif cat == "relic":
		equipped_relic_id = item_id
	else:
		return false
	recalculate_gear_caps()
	emit_signal("state_changed")
	return true

func use_consumable(item_id: String) -> bool:
	if get_item_count(item_id) <= 0 or not items.has(item_id):
		return false
	var def: Dictionary = items[item_id]
	if String(def.get("category", "")) != "consumable":
		return false
	if def.has("healHp"):
		hp = minf(max_hp, hp + float(def["healHp"]))
	if def.has("restoreMana"):
		mana = minf(max_mana, mana + float(def["restoreMana"]))
	if def.has("coolHeat"):
		thermal_heat = maxf(0.0, thermal_heat - float(def["coolHeat"]))
		if thermal_heat < 50.0:
			burnout_timer = 0.0
	if bool(def.get("overclockBoost", false)):
		overdrive_timer = maxf(overdrive_timer, 12.0)
	remove_item(item_id, 1)
	push_notification(String(def.get("name", item_id)), "Used consumable.", "info")
	emit_signal("state_changed")
	return true

func is_station_compatible(recipe_station: String, cur_station: String) -> bool:
	if recipe_station == "field":
		return true
	if recipe_station == cur_station:
		return true
	if cur_station == "shrine" and recipe_station == "alchemy":
		return true
	return false

func can_craft_recipe(recipe: Dictionary) -> Dictionary:
	var req_st := String(recipe.get("station", "field"))
	if not is_station_compatible(req_st, active_station):
		return {"ok": false, "reason": "Requires %s" % req_st.capitalize()}
	var cost := int(recipe.get("crownCost", 0))
	if crowns < cost:
		return {"ok": false, "reason": "Need %d Crowns" % cost}
	for ing in recipe.get("ingredients", []):
		var iid := String(ing["itemId"])
		var need := int(ing["qty"])
		if get_item_count(iid) < need:
			var nm := String(items.get(iid, {}).get("name", iid))
			return {"ok": false, "reason": "Missing %s" % nm}
	return {"ok": true, "reason": ""}

func craft_recipe(recipe_id: String) -> Dictionary:
	var found: Dictionary = {}
	for r in recipes:
		if String(r["id"]) == recipe_id:
			found = r
			break
	if found.is_empty():
		return {"crafted": false, "reason": "Unknown recipe"}
	var chk := can_craft_recipe(found)
	if not bool(chk["ok"]):
		return {"crafted": false, "reason": String(chk["reason"])}

	for ing in found.get("ingredients", []):
		remove_item(String(ing["itemId"]), int(ing["qty"]))
	crowns -= int(found.get("crownCost", 0))
	var out_id := String(found["outputItemId"])
	var out_qty := int(found.get("outputQty", 1))
	add_item(out_id, out_qty)
	items_crafted += 1

	var out_def: Dictionary = items.get(out_id, {})
	if out_id == "crystal_core":
		advance_quest("q_gate_conduit", 1, 1)
	if out_id == "volt_edge_sabre" or out_id == "copper_brigandine":
		advance_quest("q_smelting_ashes", 1, 1)

	push_notification("Crafted %s" % String(out_def.get("name", out_id)), "Item added to satchel.", "success")
	emit_signal("state_changed")
	return {"crafted": true}

func cast_spell(spell_id: String) -> Dictionary:
	if not spells.has(spell_id):
		return {"ok": false, "reason": "Unknown spell"}
	if burnout_timer > 0.0:
		return {"ok": false, "reason": "Core Burnout — press [G] Vent!"}
	if float(spell_cooldowns.get(spell_id, 0.0)) > 0.0:
		return {"ok": false, "reason": "Recharging"}
	var sp: Dictionary = spells[spell_id]
	var cost := float(sp.get("manaCost", 16))
	if mana < cost:
		return {"ok": false, "reason": "Need %d Mana" % int(cost)}

	var bonuses := get_gear_bonuses()
	var overclocked := burnout_timer <= 0.0 and thermal_heat >= 75.0
	var dmg := int(sp.get("baseDamage", 0))
	if dmg > 0:
		dmg += int(bonuses["spellBonus"])
	var used_cap := false
	if spell_id == "arc_bolt" and capacitor_charge >= 35.0:
		dmg = roundi(float(dmg) * 1.45)
		capacitor_charge = maxf(0.0, capacitor_charge - 35.0)
		used_cap = true
	if overclocked and dmg > 0:
		dmg = roundi(float(dmg) * 1.3)

	mana -= cost
	thermal_heat = minf(100.0, thermal_heat + float(sp.get("heatGain", 18)))
	var triggered_burnout := thermal_heat >= 100.0
	if triggered_burnout:
		burnout_timer = 2.8
	if spell_id == "chrono_ward":
		active_ward_timer = 4.5
	spell_cooldowns[spell_id] = float(sp.get("cooldown", 2.0))
	emit_signal("state_changed")
	return {
		"ok": true,
		"damage": dmg,
		"usedCapacitor": used_cap,
		"overclocked": overclocked,
		"triggeredBurnout": triggered_burnout,
	}

func exothermic_vent() -> Dictionary:
	if vent_cooldown > 0.0:
		return {"ok": false, "reason": "Vent recharging"}
	if thermal_heat < 25.0:
		return {"ok": false, "reason": "Need >= 25% Heat to Vent"}
	var bonuses := get_gear_bonuses()
	var vented := thermal_heat
	var dmg := roundi(22.0 + vented * 0.65 + float(bonuses["spellBonus"]) * 0.8)
	thermal_heat = 0.0
	burnout_timer = 0.0
	vent_cooldown = 3.5
	mana = minf(max_mana, mana + float(roundi(vented * 0.18)))
	emit_signal("state_changed")
	return {"ok": true, "damage": dmg, "ventedHeat": vented}

func apply_melee_capacitor_gain(gain: float = 18.0) -> void:
	capacitor_charge = minf(100.0, capacitor_charge + gain)
	mana = minf(max_mana, mana + 4.0)
	emit_signal("state_changed")

func take_player_damage(raw_damage: float, guarding: bool, parried: bool) -> Dictionary:
	if parried:
		capacitor_charge = minf(100.0, capacitor_charge + 28.0)
		mana = minf(max_mana, mana + 12.0)
		emit_signal("state_changed")
		return {"damageTaken": 0, "parried": true, "defeated": false}
	var bonuses := get_gear_bonuses()
	var armor_mit := 100.0 / (100.0 + float(bonuses["armorBonus"]) * 3.5)
	var scaled := raw_damage * armor_mit
	if guarding:
		scaled *= 0.28
	if active_ward_timer > 0.0:
		scaled *= 0.55
	var dmg := maxi(1, roundi(scaled))
	hp = maxf(0.0, hp - float(dmg))
	emit_signal("state_changed")
	return {"damageTaken": dmg, "parried": false, "defeated": hp <= 0.0}

func award_xp_and_crowns(xp_gain: int, crowns_gain: int) -> bool:
	xp += xp_gain
	crowns += crowns_gain
	var leveled := false
	while xp >= xp_to_next:
		xp -= xp_to_next
		level += 1
		xp_to_next = roundi(float(xp_to_next) * 1.45)
		leveled = true
	if leveled:
		recalculate_gear_caps()
		hp = max_hp
		mana = max_mana
		push_notification("Level %d Reached!" % level, "Max HP, Mana & Spell Power increased.", "success")
	emit_signal("state_changed")
	return leveled

func advance_quest(quest_id: String, expected_stage: int, inc: int = 1, branch: Dictionary = {}) -> void:
	if not quests.has(quest_id) or not quest_defs.has(quest_id):
		return
	var cur: Dictionary = quests[quest_id]
	var qdef: Dictionary = quest_defs[quest_id]
	if String(cur.get("status", "")) == "completed":
		return
	if int(cur.get("stageIndex", 0)) != expected_stage:
		return
	var stages: Array = qdef.get("stages", [])
	var st: Dictionary = stages[expected_stage]
	var target_cnt := int(st.get("targetCount", 1))
	var next_cnt := mini(target_cnt, int(cur.get("stageCount", 0)) + inc)
	cur["stageCount"] = next_cnt
	if not branch.is_empty():
		cur["branchChosen"] = String(branch.get("label", ""))
		var fac := String(branch.get("faction", "vaelcrest"))
		faction_rep[fac] = int(faction_rep.get(fac, 0)) + int(branch.get("repDelta", 0))

	if next_cnt >= target_cnt:
		if expected_stage + 1 < stages.size():
			cur["stageIndex"] = expected_stage + 1
			cur["stageCount"] = 0
			push_notification("Quest Updated", String(qdef.get("title", quest_id)), "info")
		else:
			cur["status"] = "completed"
			if qdef.has("rewardItemId"):
				add_item(String(qdef["rewardItemId"]), 1)
			award_xp_and_crowns(int(qdef.get("rewardXp", 100)), int(qdef.get("rewardCrowns", 50)))
			push_notification("Quest Completed!", "%s (+%d Crowns)" % [String(qdef.get("title", quest_id)), int(qdef.get("rewardCrowns", 50))], "success")
	emit_signal("state_changed")

func unlock_gate(gate_id: String) -> void:
	if gate_id == "south_bastion_gate" and not south_gate_open:
		south_gate_open = true
		emit_signal("gate_unlocked", gate_id)
		push_notification("Bastion Gate Unbarred", "The Emerald Wilds highway beyond Elarion is open.", "success")
	elif gate_id == "vaelcrest_castle_gate" and not castle_gate_open:
		castle_gate_open = true
		emit_signal("gate_unlocked", gate_id)
		push_notification("Castle Vaelcrest Admitted", "Commander Brenna has opened the Western Gatehouse.", "success")
	emit_signal("state_changed")

func find_nearest_rail_station(pos: Vector3) -> Dictionary:
	var best: Dictionary = {}
	var best_sq := INF
	for st in rail_stations:
		var dp: Array = st["dropOff"]
		var dx := float(dp[0]) - pos.x
		var dz := float(dp[2]) - pos.z
		var d2 := dx * dx + dz * dz
		if d2 < best_sq:
			best_sq = d2
			best = st
	return best

func compute_rail_route(from_id: String, to_id: String) -> Dictionary:
	if from_id == to_id or not rail_station_map.has(from_id) or not rail_station_map.has(to_id):
		return {}
	var dist_fare: Dictionary = {}
	var dist_m: Dictionary = {}
	var prev_edge: Dictionary = {}
	var visited: Dictionary = {}
	for st in rail_stations:
		dist_fare[st["id"]] = INF
		dist_m[st["id"]] = INF
	dist_fare[from_id] = 0.0
	dist_m[from_id] = 0.0

	while visited.size() < rail_stations.size():
		var curr := ""
		for st in rail_stations:
			var sid := String(st["id"])
			if visited.has(sid):
				continue
			if curr == "" or dist_fare[sid] < dist_fare[curr] or (dist_fare[sid] == dist_fare[curr] and dist_m[sid] < dist_m[curr]):
				curr = sid
		if curr == "" or dist_fare[curr] == INF or curr == to_id:
			break
		visited[curr] = true
		for seg in rail_segments:
			var nb := ""
			var fwd := true
			if seg["from"] == curr:
				nb = String(seg["to"])
				fwd = true
			elif seg["to"] == curr:
				nb = String(seg["from"])
				fwd = false
			if nb == "" or visited.has(nb):
				continue
			var cf := float(dist_fare[curr]) + float(seg["fare"])
			var cm := float(dist_m[curr]) + float(seg["distanceMeters"])
			if cf < float(dist_fare[nb]) or (cf == float(dist_fare[nb]) and cm < float(dist_m[nb])):
				dist_fare[nb] = cf
				dist_m[nb] = cm
				prev_edge[nb] = {"prev": curr, "segment": seg, "forward": fwd}

	var ordered: Array = []
	var cursor := to_id
	while cursor != from_id:
		if not prev_edge.has(cursor):
			return {}
		var step: Dictionary = prev_edge[cursor]
		ordered.push_front(step)
		cursor = String(step["prev"])

	var stops: Array = [rail_station_map[from_id]]
	var total_fare := 0
	var total_dist := 0
	for item in ordered:
		var seg: Dictionary = item["segment"]
		var end_id := String(seg["to"]) if bool(item["forward"]) else String(seg["from"])
		stops.append(rail_station_map[end_id])
		total_fare += int(seg["fare"])
		total_dist += int(seg["distanceMeters"])

	return {
		"from": rail_station_map[from_id],
		"to": rail_station_map[to_id],
		"stops": stops,
		"segments": ordered,
		"totalFare": maxi(2, total_fare),
		"totalDistanceMeters": total_dist,
		"estimatedMinutes": maxi(2, roundi(float(total_dist) / 65.0)),
	}

func purchase_rail_ride(from_id: String, to_id: String) -> Dictionary:
	var route := compute_rail_route(from_id, to_id)
	if route.is_empty():
		return {"ok": false, "reason": "Select a different destination station."}
	var cost := 0 if all_line_pass else int(route["totalFare"])
	if crowns < cost:
		return {"ok": false, "reason": "Need %d Crowns for this ticket." % cost}
	crowns -= cost
	emit_signal("rail_travel_started", route)
	emit_signal("state_changed")
	return {"ok": true, "route": route, "paid": cost}

func purchase_all_line_pass() -> bool:
	if all_line_pass or crowns < all_line_pass_price:
		return false
	crowns -= all_line_pass_price
	all_line_pass = true
	push_notification("All-Line Mana-Rail Pass", "Unlimited transit across all Elarion lines unlocked.", "success")
	emit_signal("state_changed")
	return true

func resolve_area_name(pos: Vector3) -> String:
	var x := pos.x
	var z := pos.z
	if z > 336.0:
		if z > 510.0 and absf(x) < 42.0:
			return "Ancient Ley-Portal · Emerald Wilds"
		return "Vaelcrest Countryside & Emerald Wilds"
	if x > 202.0 and z >= -42.0 and z <= 88.0:
		if x >= 242.0 and z >= -4.0 and z <= 38.0:
			return "Castle Vaelcrest · Three-Council Great Hall"
		if x >= 244.0 and z >= 40.0 and z <= 78.0:
			return "Castle Vaelcrest · Patriarch War Room"
		if x >= 212.0 and x <= 240.0 and z >= 50.0 and z <= 79.0:
			return "Castle Vaelcrest · Courts & Treasury"
		if x >= 244.0 and z <= -5.0:
			return "Castle Vaelcrest · Residence Wing"
		if pos.y > 9.5:
			return "Castle Vaelcrest · Coastal Rampart Battlements"
		return "Castle Vaelcrest · Outer Bailey"
	if x >= 135.0:
		return "Noble Heights & Council Approach"
	if z < -34.0:
		return "Grand Harbour Quay & Piers"
	if x < -130.0 and z < 16.0:
		return "Temple Quarter Sanctuary"
	if x < -44.0 and z < 120.0:
		return "West Industrial Quarter & Mana Works"
	if z >= 120.0 and z <= 165.0:
		return "Grand Canal Locks & Arches"
	if z > 165.0:
		return "Merchant Quarter & Grand Exchange"
	if x > 38.0:
		return "East Academic Courtyard"
	return "Central Old Port · Copperwell Square"

func save_game(player_pos: Vector3) -> void:
	var data := {
		"hp": hp, "mana": mana, "level": level, "xp": xp, "xp_to_next": xp_to_next,
		"crowns": crowns, "south_gate_open": south_gate_open, "castle_gate_open": castle_gate_open,
		"all_line_pass": all_line_pass, "equipped_weapon_id": equipped_weapon_id,
		"equipped_armor_id": equipped_armor_id, "equipped_relic_id": equipped_relic_id,
		"inventory": inventory, "quests": quests, "faction_rep": faction_rep,
		"collected_ids": collected_ids,
		"playerPos": [player_pos.x, player_pos.y, player_pos.z],
	}
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(data))
		f.close()
		push_notification("Progress Saved", "Saved to user://elarion_save.json", "info")
