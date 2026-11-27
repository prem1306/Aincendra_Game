extends CharacterBody3D

@onready var cam_pivot: Node3D = $CameraPivot
@onready var spring_arm: SpringArm3D = $CameraPivot/SpringArm3D
@onready var camera: Camera3D = $CameraPivot/SpringArm3D/Camera3D
@onready var avatar_root: Node3D = $AvatarRoot
@onready var weapon_pivot: Node3D = $AvatarRoot/WeaponPivot
@onready var ward_shield: MeshInstance3D = $WardShield

const WALK_SPEED := 7.2
const SPRINT_SPEED := 12.2
const CROUCH_SPEED := 4.0
const JUMP_SPEED := 8.8
const GRAVITY := 21.0

var yaw: float = 0.0
var pitch: float = -0.22
var first_person: bool = false
var mouse_captured: bool = true

var coyote_timer: float = 0.0
var dodge_timer: float = 0.0
var dodge_dir: Vector3 = Vector3.ZERO
var combo_step: int = 0
var combo_reset_timer: float = 0.0
var attack_cd: float = 0.0
var gun_cd: float = 0.0
var parry_window: float = 0.0
var guarding: bool = false
var last_area: String = ""
var walk_phase: float = 0.0

func _ready() -> void:
	add_to_group("player")
	_build_avatar_visuals()
	Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)

func _build_avatar_visuals() -> void:
	if avatar_root.get_child_count() > 1:
		return
	var coat_mat := StandardMaterial3D.new()
	coat_mat.albedo_color = Color(0.16, 0.25, 0.35)
	coat_mat.roughness = 0.65

	var trim_mat := StandardMaterial3D.new()
	trim_mat.albedo_color = Color(0.76, 0.56, 0.26)
	trim_mat.metallic = 0.65
	trim_mat.roughness = 0.35

	var torso := MeshInstance3D.new()
	var tm := BoxMesh.new()
	tm.size = Vector3(0.48, 0.68, 0.28)
	torso.mesh = tm
	torso.material_override = coat_mat
	torso.position = Vector3(0, 1.08, 0)
	avatar_root.add_child(torso)

	var head := MeshInstance3D.new()
	var hm := SphereMesh.new()
	hm.radius = 0.17
	hm.height = 0.34
	head.mesh = hm
	head.material_override = trim_mat
	head.position = Vector3(0, 1.62, 0)
	avatar_root.add_child(head)

	for sx in [-0.13, 0.13]:
		var leg := MeshInstance3D.new()
		var lm := BoxMesh.new()
		lm.size = Vector3(0.16, 0.72, 0.18)
		leg.mesh = lm
		leg.material_override = coat_mat
		leg.position = Vector3(sx, 0.36, 0)
		avatar_root.add_child(leg)

	var blade := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.05, 0.92, 0.09)
	blade.mesh = bm
	blade.material_override = trim_mat
	blade.position = Vector3(0.0, 0.45, -0.2)
	weapon_pivot.add_child(blade)

func set_modal_open(is_open: bool) -> void:
	mouse_captured = not is_open
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE if is_open else Input.MOUSE_MODE_CAPTURED)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and mouse_captured:
		yaw -= event.relative.x * 0.0028
		pitch = clampf(pitch - event.relative.y * 0.0024, -1.05, 0.65)
	elif event is InputEventMouseButton and event.pressed and not mouse_captured:
		var hud := get_tree().get_first_node_in_group("hud")
		if hud and not hud.has_active_modal():
			set_modal_open(false)

func _physics_process(delta: float) -> void:
	var hud := get_tree().get_first_node_in_group("hud")
	var ui_locked := hud != null and hud.has_active_modal()

	cam_pivot.rotation.y = yaw
	cam_pivot.rotation.x = pitch

	attack_cd = maxf(0.0, attack_cd - delta)
	gun_cd = maxf(0.0, gun_cd - delta)
	parry_window = maxf(0.0, parry_window - delta)
	combo_reset_timer = maxf(0.0, combo_reset_timer - delta)
	if combo_reset_timer <= 0.0:
		combo_step = 0

	if ward_shield:
		ward_shield.visible = GameState.active_ward_timer > 0.0

	if ui_locked:
		velocity.x = 0.0
		velocity.z = 0.0
		if not is_on_floor():
			velocity.y -= GRAVITY * delta
		move_and_slide()
		return

	if Input.is_action_just_pressed("toggle_camera"):
		first_person = not first_person
		spring_arm.spring_length = 0.0 if first_person else 4.6
		avatar_root.visible = not first_person

	# Guard & Parry
	if Input.is_action_just_pressed("guard"):
		parry_window = 0.28
	guarding = Input.is_action_pressed("guard")

	# Movement
	var input_vec := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var basis_yaw := Basis(Vector3.UP, yaw)
	var move_dir := (basis_yaw * Vector3(input_vec.x, 0.0, input_vec.y)).normalized()

	var is_crouching := Input.is_action_pressed("crouch")
	var is_sprinting := Input.is_action_pressed("sprint") and not is_crouching and GameState.stamina > 6.0 and move_dir.length() > 0.1
	if is_sprinting:
		GameState.stamina = maxf(0.0, GameState.stamina - 16.0 * delta)
	else:
		GameState.stamina = minf(GameState.max_stamina, GameState.stamina + 22.0 * delta)

	if Input.is_action_just_pressed("dodge") and dodge_timer <= 0.0 and GameState.stamina >= 20.0:
		GameState.stamina -= 20.0
		dodge_timer = 0.34
		dodge_dir = move_dir if move_dir.length() > 0.1 else -basis_yaw.z

	if dodge_timer > 0.0:
		dodge_timer -= delta
		velocity.x = dodge_dir.x * 16.5
		velocity.z = dodge_dir.z * 16.5
	else:
		var spd := CROUCH_SPEED if is_crouching else (SPRINT_SPEED if is_sprinting else WALK_SPEED)
		if guarding:
			spd *= 0.55
		velocity.x = move_dir.x * spd
		velocity.z = move_dir.z * spd

	if is_on_floor():
		coyote_timer = 0.14
	else:
		coyote_timer = maxf(0.0, coyote_timer - delta)
		velocity.y -= GRAVITY * delta

	if Input.is_action_just_pressed("jump") and coyote_timer > 0.0:
		velocity.y = JUMP_SPEED
		coyote_timer = 0.0

	move_and_slide()

	# Align avatar facing & countryside terrain floor clamping
	var terrain := get_tree().get_first_node_in_group("terrain")
	if global_position.z > 336.0 and terrain:
		var gy: float = terrain.get_ground_y(global_position.x, global_position.z)
		if global_position.y < gy:
			global_position.y = gy
			velocity.y = maxf(0.0, velocity.y)

	if move_dir.length_squared() > 0.01:
		var target_yaw := atan2(-move_dir.x, -move_dir.z)
		avatar_root.rotation.y = lerp_angle(avatar_root.rotation.y, target_yaw, minf(1.0, delta * 12.0))
		walk_phase += delta * (12.0 if is_sprinting else 8.0)
		avatar_root.position.y = absf(sin(walk_phase)) * 0.06
	else:
		avatar_root.position.y = 0.0

	# Combat & Abilities
	if Input.is_action_just_pressed("attack_light") and attack_cd <= 0.0:
		_perform_melee()
	if Input.is_action_just_pressed("firearm") and gun_cd <= 0.0:
		_fire_flintlock()
	if Input.is_action_just_pressed("spell_1"):
		_cast_player_spell("arc_bolt")
	if Input.is_action_just_pressed("spell_2"):
		_cast_player_spell("pyre_nova")
	if Input.is_action_just_pressed("spell_3"):
		_cast_player_spell("chrono_ward")
	if Input.is_action_just_pressed("spell_4"):
		_cast_player_spell("ley_lance")
	if Input.is_action_just_pressed("vent_heat"):
		_perform_vent()
	if Input.is_action_just_pressed("use_heal"):
		GameState.use_consumable("vitality_elixir")
	if Input.is_action_just_pressed("use_mana"):
		GameState.use_consumable("aether_draught")
	if Input.is_action_just_pressed("emote_wave"):
		GameState.push_notification("Emote", "You salute House Vaelcrest.", "info")

	# District & Station updates
	var area := GameState.resolve_area_name(global_position)
	if area != last_area:
		last_area = area
		GameState.area_name = area
		GameState.emit_signal("state_changed")

	var npc_mgr := get_tree().get_first_node_in_group("npc_manager")
	if npc_mgr:
		npc_mgr.update_nearby_station(global_position)
		if Input.is_action_just_pressed("interact") and hud:
			var prompt: Dictionary = npc_mgr.find_nearest_prompt(global_position)
			if not prompt.is_empty():
				hud.handle_interaction(prompt)

func _perform_melee() -> void:
	attack_cd = 0.34
	combo_reset_timer = 1.15
	combo_step = (combo_step + 1) % 3
	var dmg := (24 if combo_step == 0 else (28 if combo_step == 1 else 36)) + int(GameState.get_gear_bonuses()["attackBonus"])
	var forward := -avatar_root.global_transform.basis.z
	var strike_pos := global_position + Vector3(0, 1.0, 0) + forward * 1.45

	var tw := create_tween()
	weapon_pivot.rotation.x = -1.25
	tw.tween_property(weapon_pivot, "rotation:x", 0.35, 0.16)
	tw.tween_property(weapon_pivot, "rotation:x", 0.0, 0.14)

	_spawn_pulse_ring(strike_pos, 1.5, Color(0.95, 0.85, 0.55))

	var enemy_mgr := get_tree().get_first_node_in_group("enemy_manager")
	var npc_mgr := get_tree().get_first_node_in_group("npc_manager")
	var hit_cnt := 0
	if enemy_mgr:
		hit_cnt += enemy_mgr.hit_enemies_in_sphere(strike_pos, 2.2, dmg, 24.0, forward)
	if npc_mgr:
		hit_cnt += npc_mgr.hit_dummies_in_sphere(strike_pos, 2.0, dmg)
	if hit_cnt > 0:
		GameState.apply_melee_capacitor_gain(18.0)

func _fire_flintlock() -> void:
	gun_cd = 1.15
	var dmg := 26 + int(GameState.get_gear_bonuses()["attackBonus"])
	var origin := global_position + Vector3(0, 1.45, 0)
	var aim := -camera.global_transform.basis.z
	_spawn_beam(origin, origin + aim * 26.0, Color(1.0, 0.78, 0.35))
	var enemy_mgr := get_tree().get_first_node_in_group("enemy_manager")
	if enemy_mgr:
		enemy_mgr.hit_enemies_in_ray(origin, aim, 32.0, dmg, 18.0)

func _cast_player_spell(spell_id: String) -> void:
	var res := GameState.cast_spell(spell_id)
	if not bool(res.get("ok", false)):
		GameState.push_notification("Spell Blocked", String(res.get("reason", "Unavailable")), "warn")
		return
	var dmg := int(res.get("damage", 0))
	var enemy_mgr := get_tree().get_first_node_in_group("enemy_manager")
	var origin := global_position + Vector3(0, 1.4, 0)
	var aim := -camera.global_transform.basis.z

	if spell_id == "arc_bolt":
		_spawn_beam(origin, origin + aim * 26.0, Color(0.43, 0.89, 0.96))
		if enemy_mgr:
			enemy_mgr.hit_enemies_in_ray(origin, aim, 28.0, dmg, 22.0)
	elif spell_id == "pyre_nova":
		_spawn_pulse_ring(global_position + Vector3(0, 0.4, 0), 5.8, Color(0.96, 0.62, 0.08))
		if enemy_mgr:
			enemy_mgr.hit_enemies_in_sphere(global_position + Vector3(0, 1.0, 0), 5.8, dmg, 45.0, Vector3.ZERO)
	elif spell_id == "chrono_ward":
		_spawn_pulse_ring(global_position + Vector3(0, 0.6, 0), 4.5, Color(0.65, 0.55, 0.98))
	elif spell_id == "ley_lance":
		_spawn_beam(origin, origin + aim * 24.0, Color(0.20, 0.83, 0.60))
		if enemy_mgr:
			enemy_mgr.hit_enemies_in_ray(origin, aim, 24.0, dmg, 30.0, 18)

func _perform_vent() -> void:
	var res := GameState.exothermic_vent()
	if not bool(res.get("ok", false)):
		GameState.push_notification("Vent", String(res.get("reason", "")), "info")
		return
	var dmg := int(res.get("damage", 24))
	_spawn_pulse_ring(global_position + Vector3(0, 0.5, 0), 6.2, Color(0.95, 0.35, 0.25))
	var enemy_mgr := get_tree().get_first_node_in_group("enemy_manager")
	if enemy_mgr:
		enemy_mgr.hit_enemies_in_sphere(global_position + Vector3(0, 1.0, 0), 6.2, dmg, 55.0, Vector3.ZERO)
	GameState.push_notification("Exothermic Vent", "Purged heat for %d AoE damage!" % dmg, "success")

func receive_enemy_attack(raw_damage: float, _from_pos: Vector3) -> void:
	if dodge_timer > 0.0:
		return
	var res := GameState.take_player_damage(raw_damage, guarding, parry_window > 0.0)
	if bool(res.get("parried", false)):
		GameState.push_notification("Perfect Parry!", "+28 Capacitor Charge · +12 Mana", "success")
		_spawn_pulse_ring(global_position + Vector3(0, 1.1, 0), 2.4, Color(0.45, 0.92, 1.0))
	elif bool(res.get("defeated", false)):
		GameState.hp = GameState.max_hp
		GameState.mana = GameState.max_mana
		global_position = Vector3(0.0, 0.4, 29.0)
		GameState.push_notification("Revived at Harbourgate", "Recovered at Copperwell Sanctuary.", "warn")

func teleport_to(dest: Vector3) -> void:
	var terrain := get_tree().get_first_node_in_group("terrain")
	var target := dest
	if target.z > 336.0 and terrain:
		target.y = terrain.get_ground_y(target.x, target.z) + 0.35
	global_position = target
	velocity = Vector3.ZERO

func _spawn_pulse_ring(pos: Vector3, radius: float, col: Color) -> void:
	var mi := MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 0.72
	tm.outer_radius = 1.0
	mi.mesh = tm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = col
	mat.emission_enabled = true
	mat.emission = col
	mat.emission_energy_multiplier = 2.2
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mi.material_override = mat
	mi.position = pos
	get_parent().add_child(mi)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(mi, "scale", Vector3(radius, 1.0, radius), 0.28)
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.28)
	tw.chain().tween_callback(mi.queue_free)

func _spawn_beam(a: Vector3, b: Vector3, col: Color) -> void:
	var dist := a.distance_to(b)
	if dist < 0.2:
		return
	var mi := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.06
	cm.bottom_radius = 0.06
	cm.height = dist
	mi.mesh = cm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = col
	mat.emission_enabled = true
	mat.emission = col
	mat.emission_energy_multiplier = 2.8
	mi.material_override = mat
	get_parent().add_child(mi)
	mi.global_position = (a + b) * 0.5
	mi.look_at(b, Vector3.UP)
	mi.rotate_object_local(Vector3.RIGHT, PI * 0.5)
	var tw := create_tween()
	tw.tween_property(mi, "scale:x", 0.05, 0.18)
	tw.tween_callback(mi.queue_free)
