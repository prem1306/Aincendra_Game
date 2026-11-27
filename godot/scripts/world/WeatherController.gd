extends Node3D

@onready var world_env: WorldEnvironment = $WorldEnvironment
@onready var sun_light: DirectionalLight3D = $SunLight
@onready var rain_particles: GPUParticles3D = $RainParticles

const STATES := ["clear", "overcast", "rainy"]
var cycle_timer: float = 0.0

func _ready() -> void:
	add_to_group("weather_controller")
	apply_weather(GameState.weather_state)

func _process(delta: float) -> void:
	if Input.is_action_just_pressed("cycle_weather"):
		cycle_next_weather()

	if GameState.weather_auto_cycle:
		cycle_timer += delta
		if cycle_timer >= 95.0:
			cycle_timer = 0.0
			cycle_next_weather()

	var player := get_tree().get_first_node_in_group("player") as Node3D
	if player and rain_particles:
		rain_particles.global_position = player.global_position + Vector3(0.0, 14.0, 0.0)

func cycle_next_weather() -> void:
	var idx := STATES.find(GameState.weather_state)
	var next_state := STATES[(idx + 1) % STATES.size()]
	GameState.weather_state = next_state
	apply_weather(next_state)
	GameState.emit_signal("weather_changed", next_state)
	GameState.push_notification("Weather Shift", "Sky turned %s." % next_state.capitalize(), "info")

func apply_weather(state_name: String) -> void:
	if world_env == null or world_env.environment == null or sun_light == null:
		return
	var env := world_env.environment
	match state_name:
		"overcast":
			sun_light.light_energy = 1.05
			sun_light.light_color = Color(0.86, 0.89, 0.94)
			env.ambient_light_energy = 0.65
			env.fog_enabled = true
			env.fog_density = 0.0022
			env.fog_light_color = Color(0.68, 0.74, 0.80)
			if rain_particles:
				rain_particles.emitting = false
		"rainy":
			sun_light.light_energy = 0.72
			sun_light.light_color = Color(0.74, 0.82, 0.92)
			env.ambient_light_energy = 0.52
			env.fog_enabled = true
			env.fog_density = 0.0042
			env.fog_light_color = Color(0.46, 0.54, 0.62)
			if rain_particles:
				rain_particles.emitting = true
		_:
			sun_light.light_energy = 1.55
			sun_light.light_color = Color(1.0, 0.95, 0.86)
			env.ambient_light_energy = 0.82
			env.fog_enabled = true
			env.fog_density = 0.00095
			env.fog_light_color = Color(0.66, 0.80, 0.90)
			if rain_particles:
				rain_particles.emitting = false
