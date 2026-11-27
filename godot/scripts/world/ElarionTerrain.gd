extends Node3D

@export var grid_res_x: int = 128
@export var grid_res_z: int = 96

var terrain_base: FastNoiseLite
var terrain_ridge: FastNoiseLite
var biome_warp_x: FastNoiseLite
var biome_warp_z: FastNoiseLite

func _ready() -> void:
	add_to_group("terrain")
	_init_noise()
	_build_countryside_terrain()
	_build_ocean_and_ponds()
	_build_forest_trees()

func _init_noise() -> void:
	terrain_base = FastNoiseLite.new()
	terrain_base.seed = 1306
	terrain_base.noise_type = FastNoiseLite.TYPE_SIMPLEX
	terrain_base.fractal_type = FastNoiseLite.FRACTAL_FBM
	terrain_base.fractal_octaves = 4
	terrain_base.fractal_lacunarity = 2.05
	terrain_base.fractal_gain = 0.48
	terrain_base.frequency = 0.0065

	terrain_ridge = FastNoiseLite.new()
	terrain_ridge.seed = 1407
	terrain_ridge.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	terrain_ridge.fractal_type = FastNoiseLite.FRACTAL_RIDGED
	terrain_ridge.fractal_octaves = 3
	terrain_ridge.frequency = 0.0042

	biome_warp_x = FastNoiseLite.new()
	biome_warp_x.seed = 1517
	biome_warp_x.noise_type = FastNoiseLite.TYPE_SIMPLEX
	biome_warp_x.frequency = 0.008

	biome_warp_z = FastNoiseLite.new()
	biome_warp_z.seed = 1563
	biome_warp_z.noise_type = FastNoiseLite.TYPE_SIMPLEX
	biome_warp_z.frequency = 0.008

func get_ground_y(x: float, z: float) -> float:
	var dx_city := (-290.0 - x) if x < -290.0 else ((x - 308.0) if x > 308.0 else 0.0)
	var dz_city := ((-42.0 - z) if z < -42.0 else 0.0) if z < 336.0 else (z - 336.0)
	var dist_out := sqrt(dx_city * dx_city + dz_city * dz_city)
	if dist_out <= 0.01:
		return 0.16

	var blend := clampf((dist_out) / 22.0, 0.0, 1.0)
	blend = blend * blend * (3.0 - 2.0 * blend)

	var road_curve_x := sin((z - 336.0) * 0.011) * 16.0
	var road_dist := absf(x - road_curve_x)
	var road_t := clampf((road_dist - 6.0) / 16.0, 0.0, 1.0)
	road_t = road_t * road_t * (3.0 - 2.0 * road_t)
	var road_flatten := (1.0 - road_t * 0.85) if z > 334.0 else 0.0

	var p1_d := sqrt((x + 88.0) * (x + 88.0) + (z - 468.0) * (z - 468.0))
	var p2_d := sqrt((x - 94.0) * (x - 94.0) + (z - 522.0) * (z - 522.0))
	var pond_dip := exp(-(p1_d * p1_d) / (26.0 * 26.0)) * -1.45 + exp(-(p2_d * p2_d) / (28.0 * 28.0)) * -1.45

	var wx := x + biome_warp_x.get_noise_2d(x, z) * 26.0
	var wz := z + biome_warp_z.get_noise_2d(x + 31.7, z - 19.3) * 26.0
	var fbm := terrain_base.get_noise_2d(wx, wz)
	var ridge := maxf(0.0, terrain_ridge.get_noise_2d(wx * 0.85, wz * 0.85))
	var hills := fbm * 4.4 + ridge * ridge * 8.5

	var edge_t := clampf((dist_out - 95.0) / 325.0, 0.0, 1.0)
	edge_t = edge_t * edge_t * (3.0 - 2.0 * edge_t)
	var raw_h := 0.16 + (hills * 0.72 + edge_t * 16.5) * (1.0 - road_flatten) + pond_dip
	return lerpf(0.16, maxf(-0.8, raw_h), blend)

func _build_countryside_terrain() -> void:
	# Generate sweeping green terrain ring surrounding Elarion (-480..+480, Z = 290..720 + flanks)
	var min_x := -480.0
	var max_x := 480.0
	var min_z := 290.0
	var max_z := 720.0

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var col_meadow := Color(0.24, 0.44, 0.21)
	var col_ridge := Color(0.32, 0.47, 0.27)
	var col_road := Color(0.55, 0.48, 0.36)
	var col_sand := Color(0.46, 0.42, 0.31)

	for iz in range(grid_res_z):
		for ix in range(grid_res_x):
			var u0 := float(ix) / float(grid_res_x)
			var u1 := float(ix + 1) / float(grid_res_x)
			var v0 := float(iz) / float(grid_res_z)
			var v1 := float(iz + 1) / float(grid_res_z)

			var x0 := lerpf(min_x, max_x, u0)
			var x1 := lerpf(min_x, max_x, u1)
			var z0 := lerpf(min_z, max_z, v0)
			var z1 := lerpf(min_z, max_z, v1)

			var pts := [
				Vector3(x0, get_ground_y(x0, z0), z0),
				Vector3(x1, get_ground_y(x1, z0), z0),
				Vector3(x1, get_ground_y(x1, z1), z1),
				Vector3(x0, get_ground_y(x0, z1), z1),
			]
			var cols: Array[Color] = []
			for p in pts:
				var road_x := sin((p.z - 336.0) * 0.011) * 16.0
				var d_road := absf(p.x - road_x)
				var c := col_meadow.lerp(col_ridge, clampf(p.y / 14.0, 0.0, 1.0))
				if p.y < -0.15:
					c = col_sand
				elif p.z > 334.0 and d_road < 5.4:
					c = col_road
				cols.append(c)

			for idx in [0, 1, 2, 0, 2, 3]:
				st.set_color(cols[idx])
				st.set_uv(Vector2(pts[idx].x * 0.04, pts[idx].z * 0.04))
				st.add_vertex(pts[idx])

	st.generate_normals()
	var mesh := st.commit()

	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.92
	mat.metallic = 0.02

	var body := StaticBody3D.new()
	body.name = "VaelcrestTerrainBody"
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	body.add_child(mi)

	var col_shape := CollisionShape3D.new()
	col_shape.shape = mesh.create_trimesh_shape()
	body.add_child(col_shape)
	add_child(body)

func _build_ocean_and_ponds() -> void:
	var sea_mat := StandardMaterial3D.new()
	sea_mat.albedo_color = Color(0.08, 0.30, 0.40, 0.92)
	sea_mat.roughness = 0.16
	sea_mat.metallic = 0.25

	var sea := MeshInstance3D.new()
	sea.name = "ElarionBayOcean"
	var sea_mesh := PlaneMesh.new()
	sea_mesh.size = Vector2(2200.0, 900.0)
	sea.mesh = sea_mesh
	sea.material_override = sea_mat
	sea.position = Vector3(0.0, -1.8, -420.0)
	add_child(sea)

	for pond_pos in [Vector3(-88.0, -0.35, 468.0), Vector3(94.0, -0.35, 522.0)]:
		var p_mesh := CylinderMesh.new()
		p_mesh.top_radius = 22.0
		p_mesh.bottom_radius = 22.0
		p_mesh.height = 0.2
		var p_inst := MeshInstance3D.new()
		p_inst.mesh = p_mesh
		p_inst.material_override = sea_mat
		p_inst.position = pond_pos
		add_child(p_inst)

func _build_forest_trees() -> void:
	# MultiMesh forest canopy & trunks in Vaelcrest Countryside (avoiding farm plots, highway, and ponds)
	var trunk_mesh := CylinderMesh.new()
	trunk_mesh.top_radius = 0.22
	trunk_mesh.bottom_radius = 0.34
	trunk_mesh.height = 4.6
	var trunk_mat := StandardMaterial3D.new()
	trunk_mat.albedo_color = Color(0.32, 0.22, 0.15)
	trunk_mat.roughness = 0.92

	var crown_mesh := ConeMesh.new()
	crown_mesh.top_radius = 0.2
	crown_mesh.bottom_radius = 2.4
	crown_mesh.height = 6.2
	var crown_mat := StandardMaterial3D.new()
	crown_mat.albedo_color = Color(0.18, 0.38, 0.19)
	crown_mat.roughness = 0.86

	var transforms: Array[Transform3D] = []
	var rng := RandomNumberGenerator.new()
	rng.seed = 1306
	for _i in range(950):
		var tx := rng.randf_range(-420.0, 420.0)
		var tz := rng.randf_range(346.0, 680.0)
		var road_x := sin((tz - 336.0) * 0.011) * 16.0
		if absf(tx - road_x) < 12.0:
			continue
		if Vector2(tx + 88.0, tz - 468.0).length() < 28.0 or Vector2(tx - 94.0, tz - 522.0).length() < 30.0:
			continue
		if Vector2(tx, tz - 542.0).length() < 24.0:
			continue
		if tz < 420.0 and ((tx > -244.0 and tx < -44.0) or (tx > 44.0 and tx < 258.0)):
			continue
		if tz > 512.0 and tz < 618.0 and ((tx > -254.0 and tx < -130.0) or (tx > 142.0 and tx < 264.0)):
			continue
		var ty := get_ground_y(tx, tz)
		var sc := rng.randf_range(0.85, 1.45)
		var xf := Transform3D(Basis.from_euler(Vector3(0, rng.randf_range(0, TAU), 0)).scaled(Vector3(sc, sc, sc)), Vector3(tx, ty, tz))
		transforms.append(xf)

	var mm_trunks := MultiMeshInstance3D.new()
	mm_trunks.name = "CountrysideTreeTrunks"
	var m_t := MultiMesh.new()
	m_t.transform_format = MultiMesh.TRANSFORM_3D
	m_t.mesh = trunk_mesh
	m_t.instance_count = transforms.size()

	var mm_crowns := MultiMeshInstance3D.new()
	mm_crowns.name = "CountrysideTreeCrowns"
	var m_c := MultiMesh.new()
	m_c.transform_format = MultiMesh.TRANSFORM_3D
	m_c.mesh = crown_mesh
	m_c.instance_count = transforms.size()

	for i in range(transforms.size()):
		var t := transforms[i]
		m_t.set_instance_transform(i, t.translated_local(Vector3(0, 2.3, 0)))
		m_c.set_instance_transform(i, t.translated_local(Vector3(0, 6.2, 0)))

	mm_trunks.multimesh = m_t
	mm_trunks.material_override = trunk_mat
	mm_crowns.multimesh = m_c
	mm_crowns.material_override = crown_mat
	add_child(mm_trunks)
	add_child(mm_crowns)
