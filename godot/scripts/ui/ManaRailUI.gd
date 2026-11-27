extends PanelContainer

signal closed

var origin_id: String = "harbour"
var dest_id: String = "councils"
var selected_route: Dictionary = {}
var transit_anim: float = -1.0

var map_canvas: Control
var info_label: Label
var pass_btn: Button
var board_btn: Button
var station_buttons: Dictionary = {}

func _ready() -> void:
	visible = false
	custom_minimum_size = Vector2(920, 560)
	_build_ui()
	GameState.state_changed.connect(_refresh)

func _build_ui() -> void:
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.06, 0.09, 0.13, 0.96)
	bg.border_color = Color(0.24, 0.72, 0.85, 0.85)
	bg.set_border_width_all(2)
	bg.set_corner_radius_all(8)
	bg.set_content_margin_all(16)
	add_theme_stylebox_override("panel", bg)

	var root_vbox := VBoxContainer.new()
	root_vbox.add_theme_constant_override("separation", 10)
	add_child(root_vbox)

	var header := HBoxContainer.new()
	root_vbox.add_child(header)
	var title := Label.new()
	title.text = "ELARION MANA-RAIL TRANSIT NETWORK"
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", Color(0.45, 0.88, 0.96))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)

	var close_btn := Button.new()
	close_btn.text = "Close [M / Esc]"
	close_btn.pressed.connect(close_panel)
	header.add_child(close_btn)

	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 16)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root_vbox.add_child(body)

	# Left: Schematic Map Canvas
	map_canvas = _RailCanvas.new()
	map_canvas.owner_ui = self
	map_canvas.custom_minimum_size = Vector2(580, 440)
	map_canvas.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(map_canvas)

	# Right: Station list & Ticket Panel
	var side := VBoxContainer.new()
	side.custom_minimum_size = Vector2(290, 0)
	side.add_theme_constant_override("separation", 8)
	body.add_child(side)

	var st_hdr := Label.new()
	st_hdr.text = "Select Destination Station:"
	st_hdr.add_theme_color_override("font_color", Color(0.86, 0.74, 0.45))
	side.add_child(st_hdr)

	for st in GameState.rail_stations:
		var sid := String(st["id"])
		var btn := Button.new()
		btn.text = "%s (%s)" % [String(st["shortName"]), String(st["lineLabel"])]
		btn.pressed.connect(_on_select_dest.bind(sid))
		side.add_child(btn)
		station_buttons[sid] = btn

	info_label = Label.new()
	info_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	info_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	side.add_child(info_label)

	pass_btn = Button.new()
	pass_btn.pressed.connect(_on_buy_pass)
	side.add_child(pass_btn)

	board_btn = Button.new()
	board_btn.text = "Purchase Ticket & Ride"
	board_btn.pressed.connect(_on_board_rail)
	side.add_child(board_btn)

func open_panel(near_station_id: String = "") -> void:
	var player := get_tree().get_first_node_in_group("player") as Node3D
	if near_station_id != "":
		origin_id = near_station_id
	elif player:
		var st := GameState.find_nearest_rail_station(player.global_position)
		if not st.is_empty():
			origin_id = String(st["id"])
	if dest_id == origin_id:
		for st in GameState.rail_stations:
			if String(st["id"]) != origin_id:
				dest_id = String(st["id"])
				break
	visible = true
	_refresh()

func close_panel() -> void:
	visible = false
	emit_signal("closed")

func _on_select_dest(sid: String) -> void:
	dest_id = sid
	_refresh()

func _on_buy_pass() -> void:
	GameState.purchase_all_line_pass()
	_refresh()

func _on_board_rail() -> void:
	var res := GameState.purchase_rail_ride(origin_id, dest_id)
	if not bool(res.get("ok", false)):
		GameState.push_notification("Mana-Rail", String(res.get("reason", "Cannot board")), "warn")
		return
	var route: Dictionary = res["route"]
	var to_st: Dictionary = route["to"]
	var dp: Array = to_st["dropOff"]
	var player := get_tree().get_first_node_in_group("player")
	if player:
		player.teleport_to(Vector3(float(dp[0]), float(dp[1]) + 0.3, float(dp[2])))
	GameState.push_notification("Arrived: %s" % String(to_st["name"]), "Transit complete (-%d Crowns)." % int(res.get("paid", 0)), "success")
	close_panel()

func _refresh() -> void:
	if not visible:
		return
	selected_route = GameState.compute_rail_route(origin_id, dest_id)
	var orig_st: Dictionary = GameState.rail_station_map.get(origin_id, {})
	var dest_st: Dictionary = GameState.rail_station_map.get(dest_id, {})

	for sid in station_buttons.keys():
		var b: Button = station_buttons[sid]
		var prefix := "[HERE] " if sid == origin_id else ("[DEST] " if sid == dest_id else "")
		var st: Dictionary = GameState.rail_station_map.get(sid, {})
		b.text = prefix + String(st.get("shortName", sid))
		b.disabled = (sid == origin_id)

	if selected_route.is_empty():
		info_label.text = "Origin: %s\nSelect another station." % String(orig_st.get("name", origin_id))
		board_btn.disabled = true
	else:
		var fare := 0 if GameState.all_line_pass else int(selected_route["totalFare"])
		info_label.text = "From: %s\nTo: %s\nDistance: %dm · Est: %d min\nFare: %s\n\n%s" % [
			String(orig_st.get("shortName", origin_id)),
			String(dest_st.get("shortName", dest_id)),
			int(selected_route["totalDistanceMeters"]),
			int(selected_route["estimatedMinutes"]),
			"FREE (All-Line Pass)" if GameState.all_line_pass else "%d Crowns" % fare,
			String(dest_st.get("summary", "")),
		]
		board_btn.disabled = GameState.crowns < fare
		board_btn.text = "Board Train (%s)" % ("Pass" if GameState.all_line_pass else "%d Cr" % fare)

	pass_btn.visible = not GameState.all_line_pass
	pass_btn.text = "Buy All-Line Pass (%d Cr)" % GameState.all_line_pass_price
	pass_btn.disabled = GameState.crowns < GameState.all_line_pass_price
	if map_canvas:
		map_canvas.queue_redraw()

func _process(_delta: float) -> void:
	if visible and map_canvas:
		map_canvas.queue_redraw()

class _RailCanvas extends Control:
	var owner_ui: Control

	func _draw() -> void:
		if owner_ui == null:
			return
		var sz := size
		draw_rect(Rect2(Vector2.ZERO, sz), Color(0.04, 0.07, 0.11, 1.0), true)
		# Harbour bay water strip
		draw_rect(Rect2(Vector2(0, 0), Vector2(sz.x, sz.y * 0.20)), Color(0.06, 0.16, 0.24, 0.85), true)

		var sx := sz.x / 760.0
		var sy := sz.y / 460.0

		# Draw all rail segments
		for seg in GameState.rail_segments:
			var pts: Array = seg.get("points", [])
			if pts.size() < 2:
				continue
			var line_info: Dictionary = GameState.rail_lines.get(String(seg.get("line", "")), {})
			var col := Color.html(String(line_info.get("color", "#38bdf8")))
			for i in range(pts.size() - 1):
				var a := Vector2(float(pts[i][0]) * sx, float(pts[i][1]) * sy)
				var b := Vector2(float(pts[i + 1][0]) * sx, float(pts[i + 1][1]) * sy)
				draw_line(a, b, Color(col.r, col.g, col.b, 0.45), 3.0)

		# Highlight active route with animated pulse dot
		var route: Dictionary = owner_ui.selected_route
		if not route.is_empty():
			var t := fmod(Time.get_ticks_msec() * 0.001, 1.0)
			for item in route.get("segments", []):
				var seg: Dictionary = item["segment"]
				var pts: Array = seg.get("points", [])
				for i in range(pts.size() - 1):
					var a := Vector2(float(pts[i][0]) * sx, float(pts[i][1]) * sy)
					var b := Vector2(float(pts[i + 1][0]) * sx, float(pts[i + 1][1]) * sy)
					draw_line(a, b, Color(0.45, 0.95, 1.0, 0.95), 5.0)
					draw_circle(a.lerp(b, t if bool(item["forward"]) else (1.0 - t)), 5.0, Color(1.0, 0.88, 0.35))

		# Draw station nodes
		for st in GameState.rail_stations:
			var sid := String(st["id"])
			var pos := Vector2(float(st["mapX"]) * sx, float(st["mapY"]) * sy)
			var col := Color(0.96, 0.78, 0.25) if sid == owner_ui.origin_id else (Color(0.32, 0.92, 0.65) if sid == owner_ui.dest_id else Color(0.75, 0.86, 0.95))
			draw_circle(pos, 9.0, col)
			draw_circle(pos, 5.0, Color(0.05, 0.08, 0.12))
			draw_string(ThemeDB.fallback_font, pos + Vector2(12, 4), String(st["shortName"]), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color.WHITE)
