extends Node3D

var enemies: Array = []
var projectiles: Array = []

func _ready() -> void:
	add_to_group("enemy_manager")
	call_deferred("_spawn_enemies")

func _spawn_enemies() -> void:
	var loader := get_tree().get_first_node_in_group("world_loader")
	var terrain := get_tree().get_first_node_in_group("terrain")
	var archetypes: Dictionary = GameState.catalog.get("enemyArchetypes", {})
	var spawns: Array = GameState.catalog.get("enemySpawns", [])

	for sp in spawns:
		var arch_id := String(sp.get("archetype", "sentinel"))
		var arch: Dictionary = archetypes.get(arch_id, {})
		var p: Array = sp.get("position", [0, 0, 0])
		var pos := Vector3(float(p[0]), float(p[1]), float(p[2]))
		if pos.z > 336.0 and terrain:
			pos.y = terrain.get_ground_y(pos.x, pos.z)

		var model_key := String(arch.get("model", "dark_sentinel"))
		var h := float(arch.get("height", 2.0))
		var node: Node3D = loader.instantiate_glb(model_key, h) if loader else null
		if node == null:
			node = _fallback_enemy_mesh(arch_id, h)
		node.name = String(sp["id"])
		node.position = pos
		add_child(node)

		var max_hp := float(arch.get("hp", 100))
		var max_poise := float(arch.get("poise", 50))
		enemies.append({
			"id": String(sp["id"]),
			"name": String(sp["name"]),
			"archetype": arch_id,
			"isBoss": bool(sp.get("isBoss", false)),
			"isWilds": bool(sp.get("isWilds", false)),
			"node": node,
			"home": pos,
			"hp": max_hp,
			"maxHp": max_hp,
			"poise": max_poise,
			"maxPoise": max_poise,
			"speed": float(arch.get("speed", 3.5)),
			"radius": float(arch.get("radius", 0.8)),
			"aggro": float(arch.get("aggro", 18.0)),
			"xp": int(arch.get("xp", 40)),
			"crowns": int(arch.get("crowns", 15)),
			"lootItemId": String(arch.get("lootItemId", "mana_shard")),
			"lootQty": int(arch.get("lootQty", 1)),
			"dead": false,
			"respawnTimer": 0.0,
			"attackCd": 1.2,
			"windup": 0.0,
			"stagger": 0.0,
		})

func _fallback_enemy_mesh(arch_id: String, h: float) -> Node3D:
	var n := Node3D.new()
	var mi := MeshInstance3D.new()
	var cap := CapsuleMesh.new()
	cap.radius = h * 0.25
	cap.height = h
	mi.mesh = cap
	mi.position = Vector3(0, h * 0.5, 0)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.55, 0.20, 0.72) if arch_id == "crystal-wyrm" else Color(0.65, 0.22, 0.22)
	mi.material_override = mat
	n.add_child(mi)
	return n

func _process(delta: float) -> void:
	var player := get_tree().get_first_node_in_group("player")
	var terrain := get_tree().get_first_node_in_group("terrain")

	for e in enemies:
		var node: Node3D = e["node"]
		if bool(e["dead"]):
			e["respawnTimer"] = float(e["respawnTimer"]) - delta
			if float(e["respawnTimer"]) <= 0.0:
				e["dead"] = false
				e["hp"] = e["maxHp"]
				e["poise"] = e["maxPoise"]
				node.position = e["home"]
				node.visible = true
			continue

		if float(e["stagger"]) > 0.0:
			e["stagger"] = maxf(0.0, float(e["stagger"]) - delta)
			continue

		e["attackCd"] = maxf(0.0, float(e["attackCd"]) - delta)
		if player == null:
			continue

		var ppos: Vector3 = (player as Node3D).global_position
		var dist := node.position.distance_to(ppos)
		var aggro := float(e["aggro"])

		if dist <= aggro:
			var to_p := ppos - node.position
			to_p.y = 0.0
			if to_p.length_squared() > 0.01:
				var dir := to_p.normalized()
				node.rotation.y = atan2(dir.x, dir.z)

				var is_ranged := String(e["archetype"]) == "ley-mage" or bool(e["isBoss"])
				var stop_dist := 11.5 if String(e["archetype"]) == "ley-mage" else (float(e["radius"]) + 1.45)

				if float(e["windup"]) > 0.0:
					e["windup"] = float(e["windup"]) - delta
					if float(e["windup"]) <= 0.0:
						if is_ranged and dist > 4.2:
							_fire_enemy_bolt(node.position + Vector3(0, 1.35, 0), ppos + Vector3(0, 1.0, 0), 22.0 if bool(e["isBoss"]) else 14.0)
						elif dist <= float(e["radius"]) + 2.6:
							var dmg := 26.0 if bool(e["isBoss"]) else (20.0 if String(e["archetype"]) == "furnace-golem" else 14.0)
							player.receive_enemy_attack(dmg, node.position)
						e["attackCd"] = 1.65 if bool(e["isBoss"]) else 2.1
				elif dist > stop_dist:
					node.position += dir * float(e["speed"]) * delta
					if node.position.z > 336.0 and terrain:
						node.position.y = terrain.get_ground_y(node.position.x, node.position.z)
				elif float(e["attackCd"]) <= 0.0:
					e["windup"] = 0.48
		else:
			var home: Vector3 = e["home"]
			var to_h := home - node.position
			to_h.y = 0.0
			if to_h.length() > 1.5:
				var hdir := to_h.normalized()
				node.position += hdir * float(e["speed"]) * 0.6 * delta
				node.rotation.y = atan2(hdir.x, hdir.z)

	# Update enemy ley projectiles
	var next_proj: Array = []
	for pr in projectiles:
		var mesh: Node3D = pr["node"]
		pr["life"] = float(pr["life"]) - delta
		mesh.position += (pr["vel"] as Vector3) * delta
		if player and mesh.position.distance_to((player as Node3D).global_position + Vector3(0, 1.0, 0)) < 1.2:
			player.receive_enemy_attack(float(pr["dmg"]), mesh.position)
			mesh.queue_free()
			continue
		if float(pr["life"]) <= 0.0:
			mesh.queue_free()
			continue
		next_proj.append(pr)
	projectiles = next_proj

func _fire_enemy_bolt(origin: Vector3, target: Vector3, dmg: float) -> void:
	var orb := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.24
	sm.height = 0.48
	orb.mesh = sm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.82, 0.25, 0.96)
	mat.emission_enabled = true
	mat.emission = Color(0.82, 0.25, 0.96)
	mat.emission_energy_multiplier = 2.4
	orb.material_override = mat
	orb.position = origin
	add_child(orb)
	var dir := (target - origin).normalized()
	projectiles.append({"node": orb, "vel": dir * 18.0, "dmg": dmg, "life": 2.4})

func hit_enemies_in_sphere(center: Vector3, radius: float, damage: int, poise_dmg: float, knock_dir: Vector3, vampiric_heal: int = 0) -> int:
	var hits := 0
	for e in enemies:
		if bool(e["dead"]):
			continue
		var node: Node3D = e["node"]
		var target_pt := node.position + Vector3(0, 1.0, 0)
		if target_pt.distance_to(center) <= radius + float(e["radius"]):
			_damage_enemy(e, damage, poise_dmg, knock_dir, vampiric_heal)
			hits += 1
	return hits

func hit_enemies_in_ray(origin: Vector3, dir: Vector3, max_dist: float, damage: int, poise_dmg: float, vampiric_heal: int = 0) -> int:
	var best_e: Dictionary = {}
	var best_t := max_dist
	for e in enemies:
		if bool(e["dead"]):
			continue
		var center: Vector3 = (e["node"] as Node3D).position + Vector3(0, 1.1, 0)
		var to_c := center - origin
		var proj := to_c.dot(dir)
		if proj < 0.0 or proj > best_t:
			continue
		var closest := origin + dir * proj
		if closest.distance_to(center) <= float(e["radius"]) + 0.85:
			best_t = proj
			best_e = e
	if not best_e.is_empty():
		_damage_enemy(best_e, damage, poise_dmg, dir, vampiric_heal)
		return 1
	return 0

func _damage_enemy(e: Dictionary, damage: int, poise_dmg: float, knock_dir: Vector3, vampiric_heal: int) -> void:
	var node: Node3D = e["node"]
	var mult := 1.4 if float(e["stagger"]) > 0.0 else 1.0
	var final_dmg := roundi(float(damage) * mult)
	e["hp"] = maxf(0.0, float(e["hp"]) - float(final_dmg))
	e["poise"] = float(e["poise"]) - poise_dmg
	if float(e["poise"]) <= 0.0:
		e["stagger"] = 2.0
		e["poise"] = e["maxPoise"]
		GameState.push_notification("Staggered!", "%s guard broken (+40%% riposte)" % String(e["name"]), "info")

	if knock_dir.length_squared() > 0.01:
		var kd := Vector3(knock_dir.x, 0.0, knock_dir.z).normalized()
		node.position += kd * (0.4 if bool(e["isBoss"]) else 0.9)

	if vampiric_heal > 0:
		GameState.hp = minf(GameState.max_hp, GameState.hp + float(vampiric_heal))

	if float(e["hp"]) <= 0.0:
		e["dead"] = true
		e["respawnTimer"] = 90.0 if bool(e["isBoss"]) else 35.0
		node.visible = false
		GameState.enemies_defeated += 1
		GameState.add_item(String(e["lootItemId"]), int(e["lootQty"]))
		GameState.award_xp_and_crowns(int(e["xp"]), int(e["crowns"]))
		GameState.push_notification("Defeated %s" % String(e["name"]), "+%d XP · +%d Crowns" % [int(e["xp"]), int(e["crowns"])], "success")
		if bool(e["isBoss"]):
			GameState.advance_quest("q_emerald_shadows", 1, 1)
		elif bool(e["isWilds"]):
			GameState.advance_quest("q_emerald_shadows", 0, 1)
		else:
			GameState.advance_quest("q_smelting_ashes", 0, 1)

func get_nearest_active_enemy(pos: Vector3, max_range: float) -> Dictionary:
	var best: Dictionary = {}
	var best_d := max_range
	for e in enemies:
		if bool(e["dead"]):
			continue
		var d := (e["node"] as Node3D).position.distance_to(pos)
		if d < best_d:
			best_d = d
			best = e
	return best
