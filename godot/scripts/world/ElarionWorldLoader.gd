extends Node3D

const WORLD_DATA_PATH := "res://data/world_geometry.json"

var material_cache: Dictionary = {}
var primitive_mesh_cache: Dictionary = {}
var glb_scene_cache: Dictionary = {}

var south_gate_left: Node3D
var south_gate_right: Node3D
var south_gate_collider: CollisionShape3D
var castle_gate_left: Node3D
var castle_gate_right: Node3D
var castle_gate_collider: CollisionShape3D

var animated_ships: Array = []
var animated_train: Node3D
var animated_airship: Node3D
var train_t: float = 0.0
var airship_angle: float = 0.0

func _ready() -> void:
	add_to_group("world_loader")
	_load_world_geometry()
	_build_interactive_gates()
	_build_ambient_vehicles()
	GameState.gate_unlocked.connect(_on_gate_unlocked)

func _process(delta: float) -> void:
	var t := Time.get_ticks_msec() * 0.001
	for s in animated_ships:
		var node: Node3D = s["node"]
		var base_pos: Vector3 = s["base_pos"]
		var phase: float = s["phase"]
		node.position.y = base_pos.y + sin(t * 1.4 + phase) * 0.22
		node.rotation.z = sin(t * 1.1 + phase) * 0.035

	if animated_train:
		train_t = fmod(train_t + delta * 0.055, 1.0)
		var x := lerpf(-220.0, 220.0, train_t)
		animated_train.position = Vector3(x, 8.85, 88.0)

	if animated_airship:
		airship_angle += delta * 0.09
		animated_airship.position = Vector3(cos(airship_angle) * 165.0, 56.0 + sin(t * 0.7) * 2.5, 45.0 + sin(airship_angle) * 145.0)
		animated_airship.rotation.y = -airship_angle

func _load_world_geometry() -> void:
	var f := FileAccess.open(WORLD_DATA_PATH, FileAccess.READ)
	if f == null:
		push_error("Missing %s — run `npm run export:godot` first." % WORLD_DATA_PATH)
		return
	var parsed = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Invalid JSON in %s" % WORLD_DATA_PATH)
		return

	var data: Dictionary = parsed
	_spawn_primitives(data.get("primitives", []))
	_spawn_custom_meshes(data.get("customMeshes", []))
	_spawn_curated_glbs(data.get("curatedGlbs", []))
	_spawn_box_colliders(data.get("boxColliders", []))
	_spawn_ramp_colliders(data.get("rampColliders", []))

func _mat_from_dict(md: Dictionary) -> StandardMaterial3D:
	var key := "%s|%.2f|%.2f|%s|%.2f|%s|%.2f|%s|%s" % [
		String(md.get("color", "#9aa0a6")),
		float(md.get("roughness", 0.85)),
		float(md.get("metalness", 0.05)),
		String(md.get("emissive", "#000000")),
		float(md.get("emissiveIntensity", 0.0)),
		str(bool(md.get("transparent", false))),
		float(md.get("opacity", 1.0)),
		str(bool(md.get("vertexColors", false))),
		str(bool(md.get("doubleSided", false))),
	]
	if material_cache.has(key):
		return material_cache[key]

	var mat := StandardMaterial3D.new()
	var col := Color.html(String(md.get("color", "#9aa0a6")))
	var trans := bool(md.get("transparent", false))
	var op := float(md.get("opacity", 1.0))
	if trans or op < 0.99:
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		col.a = op
	mat.albedo_color = col
	mat.roughness = float(md.get("roughness", 0.85))
	mat.metallic = float(md.get("metalness", 0.05))
	if bool(md.get("vertexColors", false)):
		mat.vertex_color_use_as_albedo = true
	if bool(md.get("doubleSided", false)):
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED

	var em_hex := String(md.get("emissive", "#000000"))
	var em_int := float(md.get("emissiveIntensity", 0.0))
	if em_int > 0.01 and em_hex != "#000000":
		mat.emission_enabled = true
		mat.emission = Color.html(em_hex)
		mat.emission_energy_multiplier = em_int

	material_cache[key] = mat
	return mat

func _mesh_from_prim(shape: String, dims: Array) -> Mesh:
	var key := shape + "|" + str(dims)
	if primitive_mesh_cache.has(key):
		return primitive_mesh_cache[key]

	var mesh: Mesh
	match shape:
		"box":
			var bm := BoxMesh.new()
			bm.size = Vector3(float(dims[0]), float(dims[1]), float(dims[2]))
			mesh = bm
		"cylinder":
			var cm := CylinderMesh.new()
			cm.top_radius = maxf(0.01, float(dims[0]))
			cm.bottom_radius = maxf(0.01, float(dims[1]))
			cm.height = maxf(0.02, float(dims[2]))
			cm.radial_segments = clampi(int(dims[3]) if dims.size() > 3 else 12, 6, 24)
			cm.rings = 1
			mesh = cm
		"cone":
			var cnm := CylinderMesh.new()
			cnm.top_radius = 0.0
			cnm.bottom_radius = maxf(0.01, float(dims[0]))
			cnm.height = maxf(0.02, float(dims[1]))
			cnm.radial_segments = clampi(int(dims[2]) if dims.size() > 2 else 12, 6, 24)
			cnm.rings = 1
			mesh = cnm
		"sphere":
			var sm := SphereMesh.new()
			sm.radius = maxf(0.02, float(dims[0]))
			sm.height = sm.radius * 2.0
			sm.radial_segments = 14
			sm.rings = 8
			mesh = sm
		"torus":
			var tm := TorusMesh.new()
			var r := maxf(0.05, float(dims[0]))
			var tube := maxf(0.02, float(dims[1]))
			tm.inner_radius = maxf(0.01, r - tube)
			tm.outer_radius = r + tube
			mesh = tm
		"plane":
			var qm := QuadMesh.new()
			qm.size = Vector2(float(dims[0]), float(dims[1]))
			mesh = qm
		_:
			var fb := BoxMesh.new()
			mesh = fb

	primitive_mesh_cache[key] = mesh
	return mesh

func _transform_from_elements(e: Array) -> Transform3D:
	if e.size() < 16:
		return Transform3D.IDENTITY
	var bx := Vector3(float(e[0]), float(e[1]), float(e[2]))
	var by := Vector3(float(e[4]), float(e[5]), float(e[6]))
	var bz := Vector3(float(e[8]), float(e[9]), float(e[10]))
	var org := Vector3(float(e[12]), float(e[13]), float(e[14]))
	return Transform3D(Basis(bx, by, bz), org)

func _spawn_primitives(prims: Array) -> void:
	# Batch identical (mesh + material) primitives into MultiMeshInstance3D for high FPS!
	var batches: Dictionary = {}
	for p in prims:
		var shape := String(p.get("shape", "box"))
		var dims: Array = p.get("dims", [1, 1, 1])
		var mat_dict: Dictionary = p.get("mat", {})
		var mat := _mat_from_dict(mat_dict)
		var mesh := _mesh_from_prim(shape, dims)
		var bkey := "%d|%d" % [mesh.get_instance_id(), mat.get_instance_id()]
		if not batches.has(bkey):
			batches[bkey] = {"mesh": mesh, "mat": mat, "shape": shape, "xforms": [], "cast_shadow": bool(p.get("castShadow", false))}
		var xf := _transform_from_elements(p.get("matrix", []))
		if shape == "torus":
			xf = xf * Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3.ZERO)
		batches[bkey]["xforms"].append(xf)

	var container := Node3D.new()
	container.name = "CityArchitectureBatches"
	add_child(container)

	for b in batches.values():
		var xforms: Array = b["xforms"]
		if xforms.size() == 1:
			var mi := MeshInstance3D.new()
			mi.mesh = b["mesh"]
			mi.material_override = b["mat"]
			mi.transform = xforms[0]
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if b["cast_shadow"] else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			container.add_child(mi)
		else:
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.mesh = b["mesh"]
			mm.instance_count = xforms.size()
			for i in range(xforms.size()):
				mm.set_instance_transform(i, xforms[i])
			var mmi := MultiMeshInstance3D.new()
			mmi.multimesh = mm
			mmi.material_override = b["mat"]
			mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if b["cast_shadow"] else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			container.add_child(mmi)

func _spawn_custom_meshes(meshes: Array) -> void:
	var container := Node3D.new()
	container.name = "CustomLandmarks"
	add_child(container)

	for cm in meshes:
		var pos_arr: Array = cm.get("positions", [])
		if pos_arr.size() < 9:
			continue
		var norm_arr: Array = cm.get("normals", [])
		var col_arr = cm.get("colors", null)
		var idx_arr = cm.get("indices", null)

		var verts := PackedVector3Array()
		verts.resize(pos_arr.size() / 3)
		for i in range(verts.size()):
			verts[i] = Vector3(float(pos_arr[i * 3]), float(pos_arr[i * 3 + 1]), float(pos_arr[i * 3 + 2]))

		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = verts

		if norm_arr.size() == pos_arr.size():
			var norms := PackedVector3Array()
			norms.resize(verts.size())
			for i in range(verts.size()):
				norms[i] = Vector3(float(norm_arr[i * 3]), float(norm_arr[i * 3 + 1]), float(norm_arr[i * 3 + 2]))
			arrays[Mesh.ARRAY_NORMAL] = norms

		if col_arr != null and col_arr.size() == pos_arr.size():
			var cols := PackedColorArray()
			cols.resize(verts.size())
			for i in range(verts.size()):
				cols[i] = Color(float(col_arr[i * 3]), float(col_arr[i * 3 + 1]), float(col_arr[i * 3 + 2]))
			arrays[Mesh.ARRAY_COLOR] = cols

		if idx_arr != null and idx_arr.size() >= 3:
			var idxs := PackedInt32Array()
			idxs.resize(idx_arr.size())
			for i in range(idx_arr.size()):
				idxs[i] = int(idx_arr[i])
			arrays[Mesh.ARRAY_INDEX] = idxs

		var arr_mesh := ArrayMesh.new()
		arr_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		var mi := MeshInstance3D.new()
		mi.name = String(cm.get("name", "CustomMesh"))
		mi.mesh = arr_mesh
		mi.material_override = _mat_from_dict(cm.get("mat", {}))
		mi.transform = _transform_from_elements(cm.get("matrix", []))
		container.add_child(mi)

func _spawn_curated_glbs(mounts: Array) -> void:
	var container := Node3D.new()
	container.name = "CuratedGLBProps"
	add_child(container)

	for m in mounts:
		var key := String(m.get("key", ""))
		var inst := instantiate_glb(key, float(m.get("targetHeight", 1.5)))
		if inst == null:
			continue
		var p: Array = m.get("pos", [0, 0, 0])
		inst.name = String(m.get("name", key))
		inst.position = Vector3(float(p[0]), float(p[1]), float(p[2]))
		inst.rotation.y = float(m.get("rotY", 0.0))
		container.add_child(inst)

func instantiate_glb(key: String, target_height: float) -> Node3D:
	var path := "res://assets/models/%s.glb" % key
	if not ResourceLoader.exists(path):
		return null
	if not glb_scene_cache.has(key):
		glb_scene_cache[key] = load(path)
	var packed: PackedScene = glb_scene_cache[key]
	if packed == null:
		return null

	var wrapper := Node3D.new()
	var model := packed.instantiate()
	wrapper.add_child(model)

	var aabb := _compute_hierarchy_aabb(model)
	if aabb.size.y > 0.001:
		var s := target_height / aabb.size.y
		model.scale = Vector3(s, s, s)
		var center_xz := aabb.position + aabb.size * 0.5
		model.position = Vector3(-center_xz.x * s, -aabb.position.y * s, -center_xz.z * s)
	return wrapper

func _compute_hierarchy_aabb(root: Node) -> AABB:
	var combined := AABB()
	var has_box := false
	var stack: Array = [[root, Transform3D.IDENTITY]]
	while not stack.is_empty():
		var item: Array = stack.pop_back()
		var n: Node = item[0]
		var xf: Transform3D = item[1]
		if n is Node3D and n != root:
			xf = xf * (n as Node3D).transform
		if n is MeshInstance3D and (n as MeshInstance3D).mesh != null:
			var local_box := (n as MeshInstance3D).mesh.get_aabb()
			var world_box := xf * local_box
			if not has_box:
				combined = world_box
				has_box = true
			else:
				combined = combined.merge(world_box)
		for ch in n.get_children():
			stack.append([ch, xf])
	return combined

func _spawn_box_colliders(boxes: Array) -> void:
	var body := StaticBody3D.new()
	body.name = "WorldBoxColliders"
	add_child(body)

	for b in boxes:
		var sx := maxf(0.1, float(b["maxX"]) - float(b["minX"]))
		var sy := maxf(0.1, float(b["maxY"]) - float(b["minY"]))
		var sz := maxf(0.1, float(b["maxZ"]) - float(b["minZ"]))
		var cs := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = Vector3(sx, sy, sz)
		cs.shape = shape
		cs.position = Vector3(
			(float(b["minX"]) + float(b["maxX"])) * 0.5,
			(float(b["minY"]) + float(b["maxY"])) * 0.5,
			(float(b["minZ"]) + float(b["maxZ"])) * 0.5
		)
		body.add_child(cs)

func _spawn_ramp_colliders(ramps: Array) -> void:
	var body := StaticBody3D.new()
	body.name = "WorldRampColliders"
	add_child(body)

	for r in ramps:
		var x0 := float(r["minX"])
		var x1 := float(r["maxX"])
		var z0 := float(r["minZ"])
		var z1 := float(r["maxZ"])
		var ys := float(r["yStart"])
		var ye := float(r["yEnd"])
		var axis := String(r.get("axis", "z"))
		var base_y := minf(ys, ye) - 0.5

		var pts := PackedVector3Array()
		if axis == "z":
			pts.append_array([
				Vector3(x0, ys, z0), Vector3(x1, ys, z0),
				Vector3(x1, ye, z1), Vector3(x0, ye, z1),
				Vector3(x0, base_y, z0), Vector3(x1, base_y, z0),
				Vector3(x1, base_y, z1), Vector3(x0, base_y, z1),
			])
		else:
			pts.append_array([
				Vector3(x0, ys, z0), Vector3(x0, ys, z1),
				Vector3(x1, ye, z1), Vector3(x1, ye, z0),
				Vector3(x0, base_y, z0), Vector3(x0, base_y, z1),
				Vector3(x1, base_y, z1), Vector3(x1, base_y, z0),
			])

		var convex := ConvexPolygonShape3D.new()
		convex.points = pts
		var cs := CollisionShape3D.new()
		cs.shape = convex
		body.add_child(cs)

func _build_interactive_gates() -> void:
	var gate_mat := StandardMaterial3D.new()
	gate_mat.albedo_color = Color(0.24, 0.19, 0.15)
	gate_mat.metallic = 0.45
	gate_mat.roughness = 0.55

	# South Bastion Gate (X = 0, Z = 333)
	var sg_body := StaticBody3D.new()
	sg_body.name = "SouthBastionGate"
	add_child(sg_body)
	south_gate_collider = CollisionShape3D.new()
	var sg_shape := BoxShape3D.new()
	sg_shape.size = Vector3(12.8, 7.0, 1.4)
	south_gate_collider.shape = sg_shape
	south_gate_collider.position = Vector3(0.0, 3.5, 333.0)
	sg_body.add_child(south_gate_collider)

	south_gate_left = _make_gate_leaf(Vector3(-6.2, 0.2, 333.0), Vector3(6.1, 6.4, 0.45), 3.05, gate_mat)
	south_gate_right = _make_gate_leaf(Vector3(6.2, 0.2, 333.0), Vector3(6.1, 6.4, 0.45), -3.05, gate_mat)
	add_child(south_gate_left)
	add_child(south_gate_right)

	# Castle Vaelcrest Western Gatehouse (X = 202, Y = 5.2, Z = 18.5)
	var cg_body := StaticBody3D.new()
	cg_body.name = "CastleVaelcrestGate"
	add_child(cg_body)
	castle_gate_collider = CollisionShape3D.new()
	var cg_shape := BoxShape3D.new()
	cg_shape.size = Vector3(1.6, 7.2, 12.0)
	castle_gate_collider.shape = cg_shape
	castle_gate_collider.position = Vector3(202.0, 8.8, 18.5)
	cg_body.add_child(castle_gate_collider)

	castle_gate_left = _make_gate_leaf_z(Vector3(202.0, 5.2, 12.6), Vector3(0.45, 6.2, 5.8), 2.9, gate_mat)
	castle_gate_right = _make_gate_leaf_z(Vector3(202.0, 5.2, 24.4), Vector3(0.45, 6.2, 5.8), -2.9, gate_mat)
	add_child(castle_gate_left)
	add_child(castle_gate_right)

	if GameState.south_gate_open:
		_on_gate_unlocked("south_bastion_gate")
	if GameState.castle_gate_open:
		_on_gate_unlocked("vaelcrest_castle_gate")

func _make_gate_leaf(pivot: Vector3, size: Vector3, offset_x: float, mat: StandardMaterial3D) -> Node3D:
	var n := Node3D.new()
	n.position = pivot
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = mat
	mi.position = Vector3(offset_x, size.y * 0.5, 0.0)
	n.add_child(mi)
	return n

func _make_gate_leaf_z(pivot: Vector3, size: Vector3, offset_z: float, mat: StandardMaterial3D) -> Node3D:
	var n := Node3D.new()
	n.position = pivot
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = mat
	mi.position = Vector3(0.0, size.y * 0.5, offset_z)
	n.add_child(mi)
	return n

func _on_gate_unlocked(gate_id: String) -> void:
	var tw := create_tween().set_parallel(true)
	if gate_id == "south_bastion_gate":
		if south_gate_collider:
			south_gate_collider.set_deferred("disabled", true)
		tw.tween_property(south_gate_left, "rotation:y", -1.42, 1.1).set_trans(Tween.TRANS_CUBIC)
		tw.tween_property(south_gate_right, "rotation:y", 1.42, 1.1).set_trans(Tween.TRANS_CUBIC)
	elif gate_id == "vaelcrest_castle_gate":
		if castle_gate_collider:
			castle_gate_collider.set_deferred("disabled", true)
		tw.tween_property(castle_gate_left, "rotation:y", 1.42, 1.1).set_trans(Tween.TRANS_CUBIC)
		tw.tween_property(castle_gate_right, "rotation:y", -1.42, 1.1).set_trans(Tween.TRANS_CUBIC)

func _build_ambient_vehicles() -> void:
	# Animated Harbour Ships using merchant_ship.glb
	var ship_spots := [
		{"pos": Vector3(-55.0, -1.7, -92.0), "rot": 0.2, "phase": 0.0, "h": 11.5},
		{"pos": Vector3(68.0, -1.7, -108.0), "rot": -0.35, "phase": 1.6, "h": 10.5},
		{"pos": Vector3(-135.0, -1.7, -135.0), "rot": 0.45, "phase": 3.1, "h": 12.0},
	]
	for sp in ship_spots:
		var ship := instantiate_glb("merchant_ship", float(sp["h"]))
		if ship:
			ship.position = sp["pos"]
			ship.rotation.y = float(sp["rot"])
			add_child(ship)
			animated_ships.append({"node": ship, "base_pos": sp["pos"], "phase": float(sp["phase"])})

	# Viaduct Mana-Rail Express Train
	var train := Node3D.new()
	train.name = "ViaductManaTrain"
	var train_mat := StandardMaterial3D.new()
	train_mat.albedo_color = Color(0.16, 0.25, 0.34)
	train_mat.metallic = 0.55
	train_mat.roughness = 0.35
	var glow_mat := StandardMaterial3D.new()
	glow_mat.albedo_color = Color(0.22, 0.85, 0.96)
	glow_mat.emission_enabled = true
	glow_mat.emission = Color(0.22, 0.85, 0.96)
	glow_mat.emission_energy_multiplier = 2.0

	for c_idx in range(3):
		var car := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(8.5, 2.3, 2.5)
		car.mesh = bm
		car.material_override = train_mat
		car.position = Vector3((c_idx - 1) * 9.6, 1.2, 0.0)
		train.add_child(car)
		var strip := MeshInstance3D.new()
		var sm := BoxMesh.new()
		sm.size = Vector3(7.2, 0.35, 2.56)
		strip.mesh = sm
		strip.material_override = glow_mat
		strip.position = Vector3((c_idx - 1) * 9.6, 1.6, 0.0)
		train.add_child(strip)
	add_child(train)
	animated_train = train

	# Patrolling House Vaelcrest Mana-Airship
	var ship_air := Node3D.new()
	ship_air.name = "VaelcrestAirship"
	var env := MeshInstance3D.new()
	var cap := CapsuleMesh.new()
	cap.radius = 6.5
	cap.height = 30.0
	env.mesh = cap
	env.rotation.z = PI * 0.5
	var hull_mat := StandardMaterial3D.new()
	hull_mat.albedo_color = Color(0.76, 0.72, 0.64)
	hull_mat.roughness = 0.65
	env.material_override = hull_mat
	ship_air.add_child(env)
	var gondola := MeshInstance3D.new()
	var gm := BoxMesh.new()
	gm.size = Vector3(11.0, 2.6, 3.4)
	gondola.mesh = gm
	gondola.material_override = train_mat
	gondola.position = Vector3(0.0, -7.8, 0.0)
	ship_air.add_child(gondola)
	add_child(ship_air)
	animated_airship = ship_air
