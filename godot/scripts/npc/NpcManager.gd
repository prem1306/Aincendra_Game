extends Node3D

const NPCS_PATH := "res://data/npcs.json"
const INTERACTABLES_PATH := "res://data/interactables.json"

var npcs: Array = []
var interactables: Array = []
var dummies: Array = []
var pickup_nodes: Array = []
var active_npc_id: String = ""

const STATION_ZONES := [
	{"station": "alchemy", "label": "Alchemy Bench", "pos": Vector3(19.5, 0.16, 7.5), "radius": 4.2},
	{"station": "forge", "label": "Runesmith Forge", "pos": Vector3(-72.0, 0.18, 4.0), "radius": 4.8},
	{"station": "anvil", "label": "West Forge Anvil", "pos": Vector3(-52.0, 0.18, 30.0), "radius": 4.2},
	{"station": "alchemy", "label": "Conservatory Bench", "pos": Vector3(64.0, 1.76, 6.0), "radius": 4.2},
	{"station": "shrine", "label": "Temple Ley-Shrine", "pos": Vector3(-192.0, 0.16, -12.0), "radius": 5.0},
	{"station": "shrine", "label": "Wilds Ancestral Shrine", "pos": Vector3(-76.0, 0.5, 456.0), "radius": 5.5},
]

const PICKUP_DEFS := [
	{"id": "pk_shard_1", "itemId": "mana_shard", "qty": 2, "title": "Aetheric Mana Outcrop", "pos": Vector3(-47.0, 0.25, 5.0), "color": Color(0.28, 0.88, 0.96), "quest": "q_gate_conduit", "stage": 0},
	{"id": "pk_shard_2", "itemId": "mana_shard", "qty": 2, "title": "Silo Conduit Crystal", "pos": Vector3(-86.0, 0.25, 40.0), "color": Color(0.28, 0.88, 0.96), "quest": "q_gate_conduit", "stage": 0},
	{"id": "pk_ore_1", "itemId": "iron_ore", "qty": 2, "title": "Refinery Iron Vein", "pos": Vector3(-64.0, 0.25, 18.0), "color": Color(0.55, 0.60, 0.68), "quest": "", "stage": 0},
	{"id": "pk_copper_1", "itemId": "copper_ingot", "qty": 2, "title": "Assayed Copper Stack", "pos": Vector3(-56.0, 0.25, 36.0), "color": Color(0.84, 0.52, 0.30), "quest": "", "stage": 0},
	{"id": "pk_herb_1", "itemId": "aether_herb", "qty": 2, "title": "Emerald Wilds Sage", "pos": Vector3(-34.0, 0.4, 372.0), "color": Color(0.32, 0.86, 0.46), "quest": "", "stage": 0},
	{"id": "pk_herb_2", "itemId": "aether_herb", "qty": 2, "title": "Pondside Sea-Fennel", "pos": Vector3(-84.0, 0.4, 444.0), "color": Color(0.32, 0.86, 0.46), "quest": "", "stage": 0},
	{"id": "pk_dispatch_1", "itemId": "mana_shard", "qty": 1, "title": "Harbour Sealed Dispatch", "pos": Vector3(-14.0, 0.4, 15.0), "color": Color(0.95, 0.78, 0.28), "quest": "q_council_conspiracy", "stage": 0},
	{"id": "pk_dispatch_2", "itemId": "copper_ingot", "qty": 1, "title": "Exchange Tariff Ledger", "pos": Vector3(26.0, 0.4, 212.0), "color": Color(0.95, 0.78, 0.28), "quest": "q_council_conspiracy", "stage": 0},
	{"id": "pk_dispatch_3", "itemId": "crystal_core", "qty": 1, "title": "Wilds Glade Relic Chest", "pos": Vector3(-68.0, 0.4, 452.0), "color": Color(0.95, 0.78, 0.28), "quest": "q_council_conspiracy", "stage": 0},
]

func _ready() -> void:
	add_to_group("npc_manager")
	_load_npcs()
	_load_interactables()
	_spawn_pickups()

func _load_npcs() -> void:
	var f := FileAccess.open(NPCS_PATH, FileAccess.READ)
	if f == null:
		return
	var parsed = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) != TYPE_ARRAY:
		return

	var container := Node3D.new()
	container.name = "CityNPCs"
	add_child(container)

	for raw in parsed:
		var p: Array = raw.get("position", [0, 0, 0])
		var pos := Vector3(float(p[0]), float(p[1]), float(p[2]))
		var role := String(raw.get("role", "Citizen"))
		var is_heavy := role.contains("Infantry") or role.contains("Commander") or role.contains("Captain") or role.contains("Guard") or role.contains("Knight")
		var rig := _build_npc_rig(
			Color.html(String(raw.get("tunicHex", "#4b5866"))),
			Color.html(String(raw.get("accentHex", "#c27f4e"))),
			is_heavy
		)
		rig.name = String(raw.get("id", "npc"))
		rig.position = pos
		rig.rotation.y = float(raw.get("facingYaw", 0.0))
		container.add_child(rig)

		var wps: Array = []
		for wp in raw.get("waypoints", []):
			wps.append(Vector3(float(wp[0]), float(wp[1]), float(wp[2])))

		npcs.append({
			"data": raw,
			"node": rig,
			"base_pos": pos,
			"base_yaw": float(raw.get("facingYaw", 0.0)),
			"waypoints": wps,
			"wp_idx": 0,
			"speed": float(raw.get("moveSpeed", 1.5)),
			"emote": "",
			"emote_timer": 0.0,
		})

func _build_npc_rig(tunic: Color, accent: Color, is_heavy: bool) -> Node3D:
	var root := Node3D.new()
	var tunic_mat := StandardMaterial3D.new()
	tunic_mat.albedo_color = tunic
	tunic_mat.roughness = 0.45 if is_heavy else 0.78
	tunic_mat.metallic = 0.45 if is_heavy else 0.05

	var accent_mat := StandardMaterial3D.new()
	accent_mat.albedo_color = accent
	accent_mat.roughness = 0.55

	var skin_mat := StandardMaterial3D.new()
	skin_mat.albedo_color = Color(0.84, 0.70, 0.58)
	skin_mat.roughness = 0.72

	var torso := MeshInstance3D.new()
	var tm := BoxMesh.new()
	tm.size = Vector3(0.56, 0.72, 0.34) if is_heavy else Vector3(0.46, 0.66, 0.28)
	torso.mesh = tm
	torso.material_override = tunic_mat
	torso.position = Vector3(0.0, 1.08, 0.0)
	root.add_child(torso)

	var head := MeshInstance3D.new()
	var hm := SphereMesh.new()
	hm.radius = 0.17
	hm.height = 0.34
	head.mesh = hm
	head.material_override = tunic_mat if is_heavy else skin_mat
	head.position = Vector3(0.0, 1.62, 0.0)
	root.add_child(head)

	for side in [-1.0, 1.0]:
		var leg := MeshInstance3D.new()
		var lm := BoxMesh.new()
		lm.size = Vector3(0.16, 0.72, 0.18)
		leg.mesh = lm
		leg.material_override = accent_mat
		leg.position = Vector3(side * 0.13, 0.36, 0.0)
		root.add_child(leg)

		var arm := MeshInstance3D.new()
		var am := BoxMesh.new()
		am.size = Vector3(0.14, 0.58, 0.15)
		arm.mesh = am
		arm.material_override = tunic_mat
		arm.position = Vector3(side * (0.36 if is_heavy else 0.31), 1.05, 0.0)
		arm.name = "RightArm" if side > 0 else "LeftArm"
		root.add_child(arm)

	if is_heavy:
		# Vaelcrest halberd + visor glow
		var shaft := MeshInstance3D.new()
		var sm := CylinderMesh.new()
		sm.top_radius = 0.025
		sm.bottom_radius = 0.025
		sm.height = 2.25
		shaft.mesh = sm
		shaft.material_override = accent_mat
		shaft.position = Vector3(0.42, 1.18, 0.18)
		root.add_child(shaft)

		var blade := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.04, 0.42, 0.18)
		blade.mesh = bm
		blade.material_override = tunic_mat
		blade.position = Vector3(0.42, 2.22, 0.24)
		root.add_child(blade)

	return root

func _load_interactables() -> void:
	var f := FileAccess.open(INTERACTABLES_PATH, FileAccess.READ)
	if f == null:
		return
	var parsed = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	interactables = parsed.get("interactables", [])

	var dummy_container := Node3D.new()
	dummy_container.name = "CombatDummies"
	add_child(dummy_container)

	for d in parsed.get("combatDummies", []):
		var p: Array = d.get("position", [0, 0, 0])
		var pos := Vector3(float(p[0]), float(p[1]), float(p[2]))
		var root := Node3D.new()
		root.position = pos
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(0.68, 0.52, 0.34)
		var post := MeshInstance3D.new()
		var pm := CylinderMesh.new()
		pm.top_radius = 0.08
		pm.bottom_radius = 0.10
		pm.height = 1.65
		post.mesh = pm
		post.material_override = mat
		post.position = Vector3(0, 0.82, 0)
		root.add_child(post)

		var body := MeshInstance3D.new()
		var bm := CylinderMesh.new()
		bm.top_radius = 0.24
		bm.bottom_radius = 0.22
		bm.height = 0.78
		body.mesh = bm
		body.material_override = mat
		body.position = Vector3(0, 1.15, 0)
		root.add_child(body)
		dummy_container.add_child(root)

		dummies.append({
			"node": root,
			"mat": mat,
			"pos": pos,
			"label": String(d.get("label", "Training Dummy")),
			"wobble": 0.0,
		})

func _spawn_pickups() -> void:
	var terrain := get_tree().get_first_node_in_group("terrain")
	var container := Node3D.new()
	container.name = "WorldPickups"
	add_child(container)

	for pd in PICKUP_DEFS:
		if GameState.collected_ids.has(pd["id"]):
			continue
		var pos: Vector3 = pd["pos"]
		if pos.z > 336.0 and terrain:
			pos.y = terrain.get_ground_y(pos.x, pos.z) + 0.35
		var node := MeshInstance3D.new()
		var oct := SphereMesh.new()
		oct.radius = 0.34
		oct.height = 0.68
		oct.radial_segments = 6
		oct.rings = 3
		node.mesh = oct
		var mat := StandardMaterial3D.new()
		mat.albedo_color = pd["color"]
		mat.emission_enabled = true
		mat.emission = pd["color"]
		mat.emission_energy_multiplier = 1.25
		node.material_override = mat
		node.position = pos + Vector3(0.0, 0.55, 0.0)
		container.add_child(node)
		pickup_nodes.append({"def": pd, "node": node, "pos": pos, "collected": false})

func _process(delta: float) -> void:
	var t := Time.get_ticks_msec() * 0.001
	for n in npcs:
		var node: Node3D = n["node"]
		var wps: Array = n["waypoints"]
		var did := String(n["data"].get("id", ""))
		if active_npc_id != "" and active_npc_id == did:
			var player := get_tree().get_first_node_in_group("player") as Node3D
			if player:
				var look_p := player.global_position
				look_p.y = node.global_position.y
				if look_p.distance_to(node.global_position) > 0.2:
					node.look_at(look_p, Vector3.UP)
					node.rotate_y(PI)
		elif wps.size() >= 2:
			var target: Vector3 = wps[int(n["wp_idx"])]
			var to_t := target - node.position
			to_t.y = 0.0
			if to_t.length() < 0.35:
				n["wp_idx"] = (int(n["wp_idx"]) + 1) % wps.size()
			else:
				var dir := to_t.normalized()
				node.position += dir * float(n["speed"]) * delta
				node.rotation.y = atan2(dir.x, dir.z)

		if float(n["emote_timer"]) > 0.0:
			n["emote_timer"] = maxf(0.0, float(n["emote_timer"]) - delta)
			var r_arm := node.get_node_or_null("RightArm") as Node3D
			if r_arm:
				r_arm.rotation.x = -1.6 + sin(t * 10.0) * 0.35
		else:
			var r_arm := node.get_node_or_null("RightArm") as Node3D
			if r_arm:
				r_arm.rotation.x = 0.0

	for d in dummies:
		if float(d["wobble"]) > 0.0:
			d["wobble"] = maxf(0.0, float(d["wobble"]) - delta * 2.5)
			var node: Node3D = d["node"]
			node.rotation.z = sin(t * 28.0) * float(d["wobble"]) * 0.22

	for pk in pickup_nodes:
		if not bool(pk["collected"]):
			var node: Node3D = pk["node"]
			node.rotation.y += delta * 1.6
			node.position.y = pk["pos"].y + 0.55 + sin(t * 2.5) * 0.12

func update_nearby_station(player_pos: Vector3) -> void:
	var terrain := get_tree().get_first_node_in_group("terrain")
	var found := "field"
	for sz in STATION_ZONES:
		var p: Vector3 = sz["pos"]
		if p.z > 336.0 and terrain:
			p.y = terrain.get_ground_y(p.x, p.z)
		if player_pos.distance_to(p) <= float(sz["radius"]):
			found = String(sz["station"])
			break
	if GameState.active_station != found:
		GameState.active_station = found
		GameState.emit_signal("state_changed")

func hit_dummies_in_sphere(center: Vector3, radius: float, damage: int) -> int:
	var hits := 0
	for d in dummies:
		var p: Vector3 = d["pos"] + Vector3(0, 1.0, 0)
		if p.distance_to(center) <= radius + 0.6:
			d["wobble"] = 1.0
			hits += 1
			GameState.push_notification(String(d["label"]), "Struck for %d damage!" % damage, "info")
	return hits

func trigger_npc_reaction(npc_id: String, reaction: String) -> void:
	for n in npcs:
		if String(n["data"].get("id", "")) == npc_id:
			n["emote"] = reaction
			n["emote_timer"] = 1.4
			break

func find_nearest_prompt(player_pos: Vector3) -> Dictionary:
	var best: Dictionary = {}
	var best_d := INF

	# 1. Pickups
	for pk in pickup_nodes:
		if bool(pk["collected"]):
			continue
		var d := player_pos.distance_to(pk["pos"])
		if d < 3.2 and d < best_d:
			best_d = d
			best = {"type": "pickup", "label": "[E] Collect %s" % String(pk["def"]["title"]), "payload": pk}

	# 2. Mana-Rail Kiosks
	for st in GameState.rail_stations:
		var kp: Array = st.get("kioskPos", st["dropOff"])
		var kpos := Vector3(float(kp[0]), float(kp[1]), float(kp[2]))
		var d := player_pos.distance_to(kpos)
		if d < 4.5 and d < best_d:
			best_d = d
			best = {"type": "rail_kiosk", "label": "[E] Mana-Rail Ticket Kiosk (%s)" % String(st["shortName"]), "payload": st}

	# 3. NPCs
	for n in npcs:
		var pos: Vector3 = n["node"].global_position
		var d := player_pos.distance_to(pos)
		if d < 3.6 and d < best_d:
			best_d = d
			var role := String(n["data"].get("role", "Citizen"))
			best = {"type": "npc", "label": "[E] Speak with %s" % role, "payload": n["data"]}

	# 4. World Interactables
	for item in interactables:
		var p: Array = item.get("position", [0, 0, 0])
		var ipos := Vector3(float(p[0]), float(p[1]), float(p[2]))
		var rad := float(item.get("radius", 2.8))
		var d := player_pos.distance_to(ipos)
		if d < rad and d < best_d:
			best_d = d
			best = {"type": "inspect", "label": "[E] %s · %s" % [String(item.get("promptAction", "Inspect")), String(item.get("title", "Object"))], "payload": item}

	return best

func collect_pickup(pk: Dictionary) -> void:
	if bool(pk["collected"]):
		return
	pk["collected"] = true
	var def: Dictionary = pk["def"]
	GameState.collected_ids[def["id"]] = true
	(pk["node"] as Node3D).visible = false
	GameState.add_item(String(def["itemId"]), int(def["qty"]))
	GameState.push_notification("Collected %s" % String(def["title"]), "+%d %s" % [int(def["qty"]), String(GameState.items.get(def["itemId"], {}).get("name", def["itemId"]))], "success")
	var qid := String(def.get("quest", ""))
	if qid != "":
		GameState.advance_quest(qid, int(def.get("stage", 0)), 1)
