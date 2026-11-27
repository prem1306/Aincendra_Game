extends Node3D

var creatures: Array = []

const SPECIES_DEFS := [
	{"kind": "stag", "count": 5, "color": Color(0.48, 0.34, 0.22), "scale": 1.15, "speed": 2.4, "air": false},
	{"kind": "doe", "count": 7, "color": Color(0.56, 0.42, 0.29), "scale": 0.95, "speed": 2.6, "air": false},
	{"kind": "boar", "count": 5, "color": Color(0.28, 0.22, 0.19), "scale": 0.85, "speed": 2.1, "air": false},
	{"kind": "wolf", "count": 5, "color": Color(0.44, 0.46, 0.50), "scale": 0.92, "speed": 3.4, "air": false},
	{"kind": "hawk", "count": 6, "color": Color(0.38, 0.30, 0.24), "scale": 0.75, "speed": 7.5, "air": true},
	{"kind": "dire_boar", "count": 3, "color": Color(0.22, 0.34, 0.24), "scale": 1.35, "speed": 2.5, "air": false},
	{"kind": "raptor_drake", "count": 3, "color": Color(0.18, 0.48, 0.42), "scale": 1.25, "speed": 5.2, "air": true},
	{"kind": "colossus_stag", "count": 2, "color": Color(0.24, 0.62, 0.68), "scale": 1.65, "speed": 2.0, "air": false},
]

func _ready() -> void:
	_spawn_wildlife()

func _spawn_wildlife() -> void:
	var terrain := get_tree().get_first_node_in_group("terrain")
	var rng := RandomNumberGenerator.new()
	rng.seed = 4209

	for sp in SPECIES_DEFS:
		var mat := StandardMaterial3D.new()
		mat.albedo_color = sp["color"]
		mat.roughness = 0.78
		if String(sp["kind"]) == "colossus_stag" or String(sp["kind"]) == "raptor_drake":
			mat.emission_enabled = true
			mat.emission = sp["color"]
			mat.emission_energy_multiplier = 0.45

		for _i in range(int(sp["count"])):
			var cx := rng.randf_range(-260.0, 260.0)
			var cz := rng.randf_range(358.0, 625.0)
			var root := _build_creature_mesh(String(sp["kind"]), mat)
			var sc := float(sp["scale"])
			root.scale = Vector3(sc, sc, sc)
			var y := 24.0 if bool(sp["air"]) else (terrain.get_ground_y(cx, cz) if terrain else 0.3)
			root.position = Vector3(cx, y, cz)
			add_child(root)
			creatures.append({
				"node": root,
				"home": Vector3(cx, y, cz),
				"angle": rng.randf_range(0.0, TAU),
				"radius": rng.randf_range(12.0, 32.0),
				"speed": float(sp["speed"]),
				"air": bool(sp["air"]),
			})

func _build_creature_mesh(kind: String, mat: StandardMaterial3D) -> Node3D:
	var n := Node3D.new()
	var body := MeshInstance3D.new()
	if kind == "hawk" or kind == "raptor_drake":
		var bm := BoxMesh.new()
		bm.size = Vector3(2.4, 0.22, 0.7)
		body.mesh = bm
		body.material_override = mat
		n.add_child(body)
	else:
		var bm := BoxMesh.new()
		bm.size = Vector3(0.75, 0.75, 1.5)
		body.mesh = bm
		body.material_override = mat
		body.position = Vector3(0.0, 0.85, 0.0)
		n.add_child(body)

		var head := MeshInstance3D.new()
		var hm := BoxMesh.new()
		hm.size = Vector3(0.45, 0.45, 0.55)
		head.mesh = hm
		head.material_override = mat
		head.position = Vector3(0.0, 1.35, 0.85)
		n.add_child(head)

		for lx in [-0.25, 0.25]:
			for lz in [-0.5, 0.5]:
				var leg := MeshInstance3D.new()
				var lm := BoxMesh.new()
				lm.size = Vector3(0.16, 0.65, 0.16)
				leg.mesh = lm
				leg.material_override = mat
				leg.position = Vector3(lx, 0.32, lz)
				n.add_child(leg)
	return n

func _process(delta: float) -> void:
	var terrain := get_tree().get_first_node_in_group("terrain")
	var t := Time.get_ticks_msec() * 0.001
	for c in creatures:
		var node: Node3D = c["node"]
		var home: Vector3 = c["home"]
		var r: float = c["radius"]
		c["angle"] = float(c["angle"]) + (float(c["speed"]) / maxf(4.0, r)) * delta
		var ang: float = c["angle"]
		var nx := home.x + cos(ang) * r
		var nz := home.z + sin(ang) * r
		var ny := (home.y + sin(t * 1.8 + ang) * 2.5) if bool(c["air"]) else (terrain.get_ground_y(nx, nz) if terrain else 0.3)
		var prev := node.position
		node.position = Vector3(nx, ny, nz)
		var dir := node.position - prev
		dir.y = 0.0
		if dir.length_squared() > 0.0001:
			node.look_at(node.position + dir.normalized(), Vector3.UP)
