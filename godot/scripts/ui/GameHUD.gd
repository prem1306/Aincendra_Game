extends CanvasLayer

const ManaRailUIScript := preload("res://scripts/ui/ManaRailUI.gd")

var vitals_label: Label
var hp_bar: ProgressBar
var mana_bar: ProgressBar
var stam_bar: ProgressBar
var heat_bar: ProgressBar
var cap_bar: ProgressBar
var quest_label: Label
var hotbar_label: Label
var prompt_panel: PanelContainer
var prompt_label: Label
var toast_box: VBoxContainer

var modal_backdrop: ColorRect
var dialogue_panel: PanelContainer
var dlg_title: Label
var dlg_body: Label
var dlg_choices: VBoxContainer

var side_panel: PanelContainer
var side_title: Label
var side_list: VBoxContainer
var active_side_mode: String = "" # "craft" | "inv" | "quests"

var rail_ui: PanelContainer

var current_npc_data: Dictionary = {}
var current_dlg_node_id: String = ""
var current_inspect_lines: Array = []
var current_inspect_idx: int = 0

func _ready() -> void:
	add_to_group("hud")
	_build_hud()
	GameState.state_changed.connect(_refresh_hud)
	GameState.notification_pushed.connect(_on_notification)
	_refresh_hud()

func has_active_modal() -> bool:
	return (dialogue_panel and dialogue_panel.visible) or (side_panel and side_panel.visible) or (rail_ui and rail_ui.visible)

func _build_hud() -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	# Top-Left Vitals Card
	var vitals_card := _make_card()
	_pin(vitals_card, 0.0, 0.0, 18.0, 18.0, 328.0, 193.0)
	root.add_child(vitals_card)
	var vv := VBoxContainer.new()
	vv.add_theme_constant_override("separation", 4)
	vitals_card.add_child(vv)
	vitals_label = Label.new()
	vitals_label.add_theme_font_size_override("font_size", 13)
	vv.add_child(vitals_label)

	hp_bar = _make_bar(Color(0.84, 0.24, 0.26))
	mana_bar = _make_bar(Color(0.22, 0.68, 0.94))
	stam_bar = _make_bar(Color(0.28, 0.78, 0.44))
	heat_bar = _make_bar(Color(0.95, 0.56, 0.14))
	cap_bar = _make_bar(Color(0.68, 0.46, 0.96))
	for pair in [["HP", hp_bar], ["Mana", mana_bar], ["Stamina", stam_bar], ["Heat", heat_bar], ["Capacitor", cap_bar]]:
		var row := HBoxContainer.new()
		var lbl := Label.new()
		lbl.text = pair[0]
		lbl.custom_minimum_size = Vector2(70, 0)
		lbl.add_theme_font_size_override("font_size", 11)
		row.add_child(lbl)
		row.add_child(pair[1])
		vv.add_child(row)

	# Top-Right Quest & Quick Buttons
	var right_card := _make_card()
	_pin(right_card, 1.0, 0.0, -348.0, 18.0, -18.0, 138.0)
	root.add_child(right_card)
	var rv := VBoxContainer.new()
	rv.add_theme_constant_override("separation", 6)
	right_card.add_child(rv)
	quest_label = Label.new()
	quest_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	quest_label.add_theme_font_size_override("font_size", 12)
	rv.add_child(quest_label)

	var btn_row := HBoxContainer.new()
	btn_row.add_theme_constant_override("separation", 4)
	rv.add_child(btn_row)
	for spec in [["[M] Rail", "rail"], ["[B] Craft", "craft"], ["[I] Bag", "inv"], ["[J] Quests", "quests"], ["Save", "save"]]:
		var b := Button.new()
		b.text = spec[0]
		b.add_theme_font_size_override("font_size", 11)
		b.pressed.connect(_on_quick_btn.bind(spec[1]))
		btn_row.add_child(b)

	# Notification Toast Stack
	toast_box = VBoxContainer.new()
	_pin(toast_box, 1.0, 0.0, -348.0, 150.0, -18.0, 420.0)
	toast_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(toast_box)

	# Bottom Prompt & Hotbar
	prompt_panel = _make_card()
	_pin(prompt_panel, 0.5, 1.0, -210.0, -108.0, 210.0, -70.0)
	prompt_panel.visible = false
	root.add_child(prompt_panel)
	prompt_label = Label.new()
	prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt_label.add_theme_color_override("font_color", Color(0.98, 0.85, 0.42))
	prompt_panel.add_child(prompt_label)

	var hotbar_card := _make_card()
	_pin(hotbar_card, 0.5, 1.0, -380.0, -56.0, 380.0, -16.0)
	root.add_child(hotbar_card)
	hotbar_label = Label.new()
	hotbar_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hotbar_label.add_theme_font_size_override("font_size", 12)
	hotbar_label.text = "[LMB] Sabre  [RMB] Guard/Parry  [R] Flintlock  [V] Dodge  [1] Arc  [2] Nova  [3] Ward  [4] Lance  [G] Vent  [Q/5] Flasks  [F] Cam  [T] Sky"
	hotbar_card.add_child(hotbar_label)

	# Modal Backdrop
	modal_backdrop = ColorRect.new()
	modal_backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	modal_backdrop.color = Color(0.0, 0.0, 0.0, 0.45)
	modal_backdrop.visible = false
	root.add_child(modal_backdrop)

	# Dialogue Modal
	dialogue_panel = _make_card()
	_pin(dialogue_panel, 0.5, 1.0, -340.0, -330.0, 340.0, -68.0)
	dialogue_panel.visible = false
	root.add_child(dialogue_panel)
	var dv := VBoxContainer.new()
	dv.add_theme_constant_override("separation", 10)
	dialogue_panel.add_child(dv)
	dlg_title = Label.new()
	dlg_title.add_theme_font_size_override("font_size", 18)
	dlg_title.add_theme_color_override("font_color", Color(0.95, 0.78, 0.35))
	dv.add_child(dlg_title)
	dlg_body = Label.new()
	dlg_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dlg_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	dv.add_child(dlg_body)
	dlg_choices = VBoxContainer.new()
	dlg_choices.add_theme_constant_override("separation", 6)
	dv.add_child(dlg_choices)

	# Side Modal (Crafting / Inventory / Quests)
	side_panel = _make_card()
	_pin(side_panel, 0.5, 0.5, -320.0, -240.0, 320.0, 240.0)
	side_panel.visible = false
	root.add_child(side_panel)
	var sv := VBoxContainer.new()
	sv.add_theme_constant_override("separation", 8)
	side_panel.add_child(sv)
	var sh := HBoxContainer.new()
	sv.add_child(sh)
	side_title = Label.new()
	side_title.add_theme_font_size_override("font_size", 18)
	side_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sh.add_child(side_title)
	var close_side := Button.new()
	close_side.text = "Close [Esc]"
	close_side.pressed.connect(close_all_modals)
	sh.add_child(close_side)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sv.add_child(scroll)
	side_list = VBoxContainer.new()
	side_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	side_list.add_theme_constant_override("separation", 6)
	scroll.add_child(side_list)

	# Mana-Rail UI Modal
	rail_ui = ManaRailUIScript.new()
	_pin(rail_ui, 0.5, 0.5, -460.0, -280.0, 460.0, 280.0)
	rail_ui.closed.connect(_on_modal_closed)
	root.add_child(rail_ui)

func _pin(c: Control, ax: float, ay: float, ol: float, ot: float, or_: float, ob: float) -> void:
	c.anchor_left = ax
	c.anchor_right = ax
	c.anchor_top = ay
	c.anchor_bottom = ay
	c.offset_left = ol
	c.offset_top = ot
	c.offset_right = or_
	c.offset_bottom = ob

func _make_card() -> PanelContainer:
	var pc := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.05, 0.08, 0.12, 0.90)
	sb.border_color = Color(0.28, 0.62, 0.78, 0.72)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(6)
	sb.set_content_margin_all(10)
	pc.add_theme_stylebox_override("panel", sb)
	return pc

func _make_bar(col: Color) -> ProgressBar:
	var pb := ProgressBar.new()
	pb.show_percentage = false
	pb.custom_minimum_size = Vector2(205, 13)
	var fill := StyleBoxFlat.new()
	fill.bg_color = col
	fill.set_corner_radius_all(3)
	pb.add_theme_stylebox_override("fill", fill)
	return pb

func _process(_delta: float) -> void:
	hp_bar.max_value = GameState.max_hp
	hp_bar.value = GameState.hp
	mana_bar.max_value = GameState.max_mana
	mana_bar.value = GameState.mana
	stam_bar.max_value = GameState.max_stamina
	stam_bar.value = GameState.stamina
	heat_bar.max_value = 100.0
	heat_bar.value = GameState.thermal_heat
	cap_bar.max_value = 100.0
	cap_bar.value = GameState.capacitor_charge

	var player := get_tree().get_first_node_in_group("player") as Node3D
	var npc_mgr := get_tree().get_first_node_in_group("npc_manager")
	if player and npc_mgr and not has_active_modal():
		var prompt: Dictionary = npc_mgr.find_nearest_prompt(player.global_position)
		if prompt.is_empty():
			prompt_panel.visible = false
		else:
			prompt_label.text = String(prompt.get("label", ""))
			prompt_panel.visible = true
	else:
		prompt_panel.visible = false

	if Input.is_action_just_pressed("ui_cancel"):
		if has_active_modal():
			close_all_modals()
		else:
			var pl := get_tree().get_first_node_in_group("player")
			if pl:
				pl.set_modal_open(not pl.mouse_captured)
	elif Input.is_action_just_pressed("toggle_rail"):
		if rail_ui.visible:
			close_all_modals()
		else:
			close_all_modals()
			rail_ui.open_panel()
			_sync_modal_state()
	elif Input.is_action_just_pressed("toggle_crafting"):
		_toggle_side("craft")
	elif Input.is_action_just_pressed("toggle_inventory"):
		_toggle_side("inv")
	elif Input.is_action_just_pressed("toggle_quests"):
		_toggle_side("quests")

func _on_quick_btn(kind: String) -> void:
	if kind == "save":
		var pl := get_tree().get_first_node_in_group("player") as Node3D
		GameState.save_game(pl.global_position if pl else Vector3.ZERO)
	elif kind == "rail":
		close_all_modals()
		rail_ui.open_panel()
		_sync_modal_state()
	else:
		_toggle_side(kind)

func _toggle_side(mode: String) -> void:
	if side_panel.visible and active_side_mode == mode:
		close_all_modals()
		return
	close_all_modals()
	active_side_mode = mode
	side_panel.visible = true
	_populate_side_panel()
	_sync_modal_state()

func close_all_modals() -> void:
	dialogue_panel.visible = false
	side_panel.visible = false
	rail_ui.visible = false
	var npc_mgr := get_tree().get_first_node_in_group("npc_manager")
	if npc_mgr:
		npc_mgr.active_npc_id = ""
	_sync_modal_state()

func _on_modal_closed() -> void:
	_sync_modal_state()

func _sync_modal_state() -> void:
	var open := has_active_modal()
	modal_backdrop.visible = open
	var player := get_tree().get_first_node_in_group("player")
	if player:
		player.set_modal_open(open)

func _refresh_hud() -> void:
	if vitals_label == null:
		return
	var st_tag := "" if GameState.active_station == "field" else " · Station: %s" % GameState.active_station.capitalize()
	vitals_label.text = "Lv %d · %d Crowns · %s%s\n%s (%s)" % [
		GameState.level, GameState.crowns, GameState.area_name, st_tag,
		"BURNOUT!" if GameState.burnout_timer > 0.0 else ("OVERCLOCK +30%" if GameState.thermal_heat >= 75.0 else "Thermal Nominal"),
		GameState.weather_state.capitalize(),
	]

	var qid := GameState.tracked_quest_id
	var qdef: Dictionary = GameState.quest_defs.get(qid, {})
	var qst: Dictionary = GameState.quests.get(qid, {})
	var stages: Array = qdef.get("stages", [])
	var idx := mini(int(qst.get("stageIndex", 0)), maxi(0, stages.size() - 1))
	var st_desc := String(stages[idx].get("description", "")) if idx < stages.size() else "Completed"
	var tgt := int(stages[idx].get("targetCount", 1)) if idx < stages.size() else 1
	quest_label.text = "QUEST: %s\n%s (%d/%d)" % [
		String(qdef.get("title", qid)),
		"Completed!" if String(qst.get("status", "")) == "completed" else st_desc,
		int(qst.get("stageCount", 0)),
		tgt,
	]

	if side_panel and side_panel.visible:
		_populate_side_panel()

func handle_interaction(prompt: Dictionary) -> void:
	var kind := String(prompt.get("type", ""))
	var payload: Dictionary = prompt.get("payload", {})
	if kind == "pickup":
		var npc_mgr := get_tree().get_first_node_in_group("npc_manager")
		if npc_mgr:
			npc_mgr.collect_pickup(payload)
	elif kind == "rail_kiosk":
		close_all_modals()
		rail_ui.open_panel(String(payload.get("id", "")))
		_sync_modal_state()
	elif kind == "inspect":
		close_all_modals()
		current_npc_data = {}
		current_inspect_lines = payload.get("lines", [])
		current_inspect_idx = 0
		dlg_title.text = "%s — %s" % [String(payload.get("title", "")), String(payload.get("subtitle", ""))]
		_show_inspect_line()
		dialogue_panel.visible = true
		_sync_modal_state()
	elif kind == "npc":
		close_all_modals()
		current_npc_data = payload
		var npc_mgr := get_tree().get_first_node_in_group("npc_manager")
		if npc_mgr:
			npc_mgr.active_npc_id = String(payload.get("id", ""))
		dlg_title.text = String(payload.get("role", "Citizen"))
		var tree: Dictionary = payload.get("dialogueTree", {})
		if not tree.is_empty():
			_show_branch_node(String(tree.get("startNodeId", "")))
		else:
			var lines: Array = payload.get("dialogueLines", ["Greetings, citizen of Elarion."])
			current_inspect_lines = lines
			current_inspect_idx = 0
			_show_inspect_line()
		dialogue_panel.visible = true
		_sync_modal_state()

func _show_inspect_line() -> void:
	for ch in dlg_choices.get_children():
		ch.queue_free()
	dlg_body.text = String(current_inspect_lines[current_inspect_idx]) if current_inspect_idx < current_inspect_lines.size() else ""
	var btn := Button.new()
	if current_inspect_idx + 1 < current_inspect_lines.size():
		btn.text = "Continue..."
		btn.pressed.connect(func():
			current_inspect_idx += 1
			_show_inspect_line()
		)
	else:
		btn.text = "Close [Esc]"
		btn.pressed.connect(close_all_modals)
	dlg_choices.add_child(btn)

func _show_branch_node(node_id: String) -> void:
	for ch in dlg_choices.get_children():
		ch.queue_free()
	var tree: Dictionary = current_npc_data.get("dialogueTree", {})
	var found: Dictionary = {}
	for nd in tree.get("nodes", []):
		if String(nd.get("id", "")) == node_id:
			found = nd
			break
	if found.is_empty():
		close_all_modals()
		return
	dlg_body.text = "\n".join(PackedStringArray(found.get("lines", [])))
	for choice in found.get("choices", []):
		var b := Button.new()
		b.text = String(choice.get("label", "Continue"))
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.pressed.connect(_on_branch_choice.bind(choice))
		dlg_choices.add_child(b)

func _on_branch_choice(choice: Dictionary) -> void:
	var npc_mgr := get_tree().get_first_node_in_group("npc_manager")
	if npc_mgr and choice.has("npcReaction"):
		npc_mgr.trigger_npc_reaction(String(current_npc_data.get("id", "")), String(choice["npcReaction"]))
	if choice.has("unlockGateId"):
		GameState.unlock_gate(String(choice["unlockGateId"]))
	if choice.has("questBranch"):
		var qb: Dictionary = choice["questBranch"]
		GameState.advance_quest(String(qb["questId"]), int(qb["stageIndex"]), 1, qb)
	if bool(choice.get("closeDialogue", false)):
		close_all_modals()
	elif choice.has("nextNodeId"):
		_show_branch_node(String(choice["nextNodeId"]))
	else:
		close_all_modals()

func _populate_side_panel() -> void:
	for ch in side_list.get_children():
		ch.queue_free()

	if active_side_mode == "craft":
		side_title.text = "Artificer Crafting · Station: %s" % GameState.active_station.capitalize()
		for r in GameState.recipes:
			var out_def: Dictionary = GameState.items.get(String(r["outputItemId"]), {})
			var chk := GameState.can_craft_recipe(r)
			var row := HBoxContainer.new()
			var lbl := Label.new()
			lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var ings: Array = []
			for ig in r.get("ingredients", []):
				var nm := String(GameState.items.get(String(ig["itemId"]), {}).get("name", ig["itemId"]))
				ings.append("%s %d/%d" % [nm, GameState.get_item_count(String(ig["itemId"])), int(ig["qty"])])
			lbl.text = "%s x%d (%s)\n%s · %d Cr" % [
				String(out_def.get("name", r["outputItemId"])),
				int(r.get("outputQty", 1)),
				String(r.get("craftTimeLabel", "Field")),
				", ".join(PackedStringArray(ings)),
				int(r.get("crownCost", 0)),
			]
			row.add_child(lbl)
			var btn := Button.new()
			btn.text = "Craft" if bool(chk["ok"]) else String(chk["reason"])
			btn.disabled = not bool(chk["ok"])
			btn.pressed.connect(func():
				GameState.craft_recipe(String(r["id"]))
				_populate_side_panel()
			)
			row.add_child(btn)
			side_list.add_child(row)

	elif active_side_mode == "inv":
		side_title.text = "Satchel & Gear · Weapon: %s · Armor: %s" % [
			String(GameState.items.get(GameState.equipped_weapon_id, {}).get("name", "None")),
			String(GameState.items.get(GameState.equipped_armor_id, {}).get("name", "None")),
		]
		for entry in GameState.inventory:
			var iid := String(entry["itemId"])
			var def: Dictionary = GameState.items.get(iid, {})
			var cat := String(def.get("category", "material"))
			var row := HBoxContainer.new()
			var lbl := Label.new()
			lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			lbl.text = "%s x%d — %s" % [String(def.get("name", iid)), int(entry["qty"]), String(def.get("description", ""))]
			lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			row.add_child(lbl)
			if cat == "weapon" or cat == "armor" or cat == "relic":
				var eq := (iid == GameState.equipped_weapon_id or iid == GameState.equipped_armor_id or iid == GameState.equipped_relic_id)
				var b := Button.new()
				b.text = "Equipped" if eq else "Equip"
				b.disabled = eq
				b.pressed.connect(func():
					GameState.equip_item(iid)
					_populate_side_panel()
				)
				row.add_child(b)
			elif cat == "consumable":
				var b := Button.new()
				b.text = "Use"
				b.pressed.connect(func():
					GameState.use_consumable(iid)
					_populate_side_panel()
				)
				row.add_child(b)
			side_list.add_child(row)

	elif active_side_mode == "quests":
		side_title.text = "Elarion Quest Journal & Factions (Vaelcrest %d · Mana-Works %d · Purists %d)" % [
			int(GameState.faction_rep.get("vaelcrest", 0)),
			int(GameState.faction_rep.get("mana_works", 0)),
			int(GameState.faction_rep.get("purists", 0)),
		]
		for qid in GameState.quest_order:
			var qdef: Dictionary = GameState.quest_defs.get(qid, {})
			var qst: Dictionary = GameState.quests.get(qid, {})
			var row := HBoxContainer.new()
			var lbl := Label.new()
			lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			var stages: Array = qdef.get("stages", [])
			var s_idx := mini(int(qst.get("stageIndex", 0)), maxi(0, stages.size() - 1))
			var st_txt := "COMPLETED" if String(qst.get("status", "")) == "completed" else String(stages[s_idx].get("description", ""))
			lbl.text = "%s (%s)\n%s" % [String(qdef.get("title", qid)), String(qdef.get("district", "")), st_txt]
			row.add_child(lbl)
			var b := Button.new()
			b.text = "Tracked" if GameState.tracked_quest_id == qid else "Track"
			b.disabled = (GameState.tracked_quest_id == qid)
			b.pressed.connect(func():
				GameState.tracked_quest_id = qid
				_refresh_hud()
				_populate_side_panel()
			)
			row.add_child(b)
			side_list.add_child(row)

func _on_notification(title: String, body: String, kind: String) -> void:
	if toast_box == null:
		return
	var card := _make_card()
	var lbl := Label.new()
	lbl.text = "%s: %s" % [title, body]
	lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lbl.add_theme_font_size_override("font_size", 12)
	lbl.add_theme_color_override("font_color", Color(0.42, 0.94, 0.65) if kind == "success" else (Color(0.98, 0.72, 0.30) if kind == "warn" else Color(0.86, 0.92, 0.98)))
	card.add_child(lbl)
	toast_box.add_child(card)
	var tw := create_tween()
	tw.tween_interval(3.6)
	tw.tween_callback(card.queue_free)
