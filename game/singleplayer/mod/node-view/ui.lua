
--ui

local S = minetest.get_translator(minetest.get_current_modname())

local old_values = {}
local index = {}
local change_preview_type = {}

minetest.register_chatcommand("nv", {
  description = "Opens the Node View UI.",
  func = function(name, param)
    local player = minetest.get_player_by_name(name)

    node_view.enter_edit_mode(player)
end})

minetest.register_chatcommand("nv_reset", {
  description = "Resets the Node View UI.",
  func = function(name, param)
    local player = minetest.get_player_by_name(name)

    node_view.exit_edit_mode(player)
end})

minetest.register_on_joinplayer(function(player)
  local player_name = player:get_player_name()
  local meta = player:get_meta()

  index[player_name] = 0

  local id_bg = player:hud_add({
    hud_elem_type = "image",
    position = {x = 0.5, y = 0.5},
    offset = {x = 0, y = 0},
    text = "node_view_ui_bg.png^[opacity:0",
    alignment = {x = 0, y = 0},
    scale = {x = 48, y = 39},
    z_index = 9999
  })

  local id_r_text = player:hud_add({
    hud_elem_type = "text",
    position = {x = 0.5, y = 0.5},
    offset = {x = -24, y = -199.5},
    text = "",
    alignment = {x = 1, y = 0},
    scale = {x = 1, y = 1},
    number = 0x80FFFFFF,
    z_index = 10000
  })

  local id_g_text = player:hud_add({
    hud_elem_type = "text",
    position = {x = 0.5, y = 0.5},
    offset = {x = -24, y = -134,5},
    text = "",
    alignment = {x = 1, y = 0},
    scale = {x = 1, y = 1},
    number = 0xFFFFFF,
    z_index = 10000
  })

  local id_b_text = player:hud_add({
    hud_elem_type = "text",
    position = {x = 0.5, y = 0.5},
    offset = {x = -24, y = -69,5},
    text = "",
    alignment = {x = 1, y = 0},
    scale = {x = 1, y = 1},
    number = 0xFFFFFF,
    z_index = 10000
  })

  meta:set_string("nv_bg_id", id_bg)
  meta:set_string("nv_r_text_id", id_r_text)
  meta:set_string("nv_g_text_id", id_g_text)
  meta:set_string("nv_b_text_id", id_b_text)
end)

minetest.register_on_dieplayer(function(player)
  local player_name = player:get_player_name()
  local meta = player:get_meta()

  local bg_id = meta:get_string("nv_bg_id")
  local r_text_id = meta:get_string("nv_r_text_id")
  local g_text_id = meta:get_string("nv_g_text_id")
  local b_text_id = meta:get_string("nv_b_text_id")

  player:hud_change(bg_id, "text", "node_view_ui_bg.png^[opacity:0")
  player:hud_change(r_text_id, "text", "")
  player:hud_change(g_text_id, "text", "")
  player:hud_change(b_text_id, "text", "")

  if old_values[player_name] then
    meta:set_string("nv_hud_color", old_values[player_name].color)
    meta:set_string("nv_hud_alignment", old_values[player_name].hud_alignment)
    meta:set_string("nv_hud_health_in", old_values[player_name].health_in)
  end

  node_view.exit_edit_mode(player)
end)

function node_view.get_ui(player, data)
  local player_name = player:get_player_name()

  index[player_name] = index[player_name] + 1

  player_index = index[player_name]

  local meta = player:get_meta()
  local string_to_num = {
    hud_alignments = {
      ["Top-Middle"] = 1, ["Top-Right"] = 2, ["Top-Left"] = 3, ["Middle-Right"] = 4, ["Middle-Left"] = 5, ["Bottom-Right"] = 6, ["Bottom-Left"] = 7
    },
    health_in = {
      ["Points"] = 1, ["Hearts"] = 2
    }
  }

  if not data.reopen then
    change_preview_type[player_name] = "Entity"
    old_values[player_name] = {color = meta:get_string("nv_hud_color"), hud_alignment = meta:get_string("nv_hud_alignment"), health_in = meta:get_string("nv_hud_health_in")}
  end

  local r, g, b = node_view.get_rgb(meta:get_string("nv_hud_color"))
  local hud_alignment = meta:get_string("nv_hud_alignment")
  local health_in = meta:get_string("nv_hud_health_in")

  local bg_id = meta:get_string("nv_bg_id")
  local r_text_id = meta:get_string("nv_r_text_id")
  local g_text_id = meta:get_string("nv_g_text_id")
  local b_text_id = meta:get_string("nv_b_text_id")

  player:hud_change(bg_id, "text", "node_view_ui_bg.png^[opacity:255")
  player:hud_change(r_text_id, "text", r or "26")
  player:hud_change(g_text_id, "text", g or "26")
  player:hud_change(b_text_id, "text", b or "27")

  local formspec = (
    "formspec_version[6]"..
    "size[12,10]"..
    "no_prepend[]"..
    "bgcolor[#FFFFFF00;false]"..
    "label[0.2,0.4;Node View]"..

    "container[0,1.7]"..
      "scrollbaroptions[min=0;max=255;smallstep=1]"..

      "container[1.2,0]"..
        "label[0,0.25;R]"..
        "box[0.3,0.01;3.99,0.48;#FF0000CC]"..
        "scrollbar[0.3,0;4,0.5;horizontal;r_"..player_index..";"..(r or 26).."]"..

        "label[0,1.25;G]"..
        "box[0.3,1.01;3.99,0.48;#00FF00CC]"..
        "scrollbar[0.3,1;4,0.5;horizontal;g_"..player_index..";"..(g or 26).."]"..

        "label[0,2.25;B]"..
        "box[0.3,2.01;3.99,0.48;#0000FFCC]"..
        "scrollbar[0.3,2;4,0.5;horizontal;b_"..player_index..";"..(b or 27).."]"..

        "button[0,2.9;2.5,0.7;default_color;"..S("Set to Default").."]"..
      "container_end[]"..

      "container[7.5,0.11]"..
        "label[0,0;"..S("Hud Alignment")..":]"..
        "dropdown[0,0.2;3,0.8;hud_alignment;Top-Middle,Top-Right,Top-Left,Middle-Right,Middle-Left,Bottom-Right,Bottom-Left;".. (string_to_num.hud_alignments[hud_alignment] or 1) ..";false]"..

        "button[0,1.2;2.5,0.7;default_hud_alignment;"..S("Set to Default").."]"..
      "container_end[]"..

      "container[7.5,3.11]"..
        "label[0,0;"..S("Health in")..":]"..
        "dropdown[0,0.2;3,0.8;health_in;Points,Hearts;".. (string_to_num.health_in[health_in] or 1) ..";false]"..

        "button[0,1.2;2.5,0.7;default_health_in;"..S("Set to Default").."]"..
      "container_end[]"..
    "container_end[]"..

    "style[change_change_preview_type;bgcolor=#404DFF80]"..
    "style[cancel;bgcolor=#FF0F1180]"..
    "button[0.21,8.9;4.5,0.8;change_change_preview_type;"..S("Change Preview to")..": "..S(change_preview_type[player_name]).."]"..
    "button_exit[5.67,8.9;3,0.8;cancel;"..S("Cancel").."]"..
    "button[8.8,8.9;3,0.8;apply;"..S("Apply Changes").."]"
  )

  node_view.get_hud(player, {preview = true, preview_type = change_preview_type[player_name]})

  return formspec
end

minetest.register_on_player_receive_fields(function(player, formname, fields)
  if formname ~= "node_view:ui" then
    return false
  end

  local player_name = player:get_player_name()
  local meta = player:get_meta()

  local player_index = index[player_name]
  local player_change_preview_type = change_preview_type[player_name]

  local bg_id = meta:get_string("nv_bg_id")
  local r_text_id = meta:get_string("nv_r_text_id")
  local g_text_id = meta:get_string("nv_g_text_id")
  local b_text_id = meta:get_string("nv_b_text_id")

  if fields["r_"..player_index] or fields["g_"..player_index] or fields["b_"..player_index] then
    local r = tonumber(fields["r_"..player_index]:match("%d+"))
    local g = tonumber(fields["g_"..player_index]:match("%d+"))
    local b = tonumber(fields["b_"..player_index]:match("%d+"))

    player:hud_change(r_text_id, "text", r)
    player:hud_change(g_text_id, "text", g)
    player:hud_change(b_text_id, "text", b)

    meta:set_string("nv_hud_color", r..", "..g..", "..b)
    node_view.get_hud(player, {preview = true, preview_type = player_change_preview_type})
  end

  if fields.default_color then
    meta:set_string("nv_hud_color", "26, 26, 27")
    minetest.show_formspec(player_name, "node_view:ui", node_view.get_ui(player, {reopen = true}))
    node_view.get_hud(player, {preview = true, preview_type = player_change_preview_type})
  end

  if fields.hud_alignment then
    meta:set_string("nv_hud_alignment", fields.hud_alignment)
    node_view.get_hud(player, {preview = true, preview_type = player_change_preview_type})
  end

  if fields.default_hud_alignment then
    meta:set_string("nv_hud_alignment", "Top-Middle")
    minetest.show_formspec(player_name, "node_view:ui", node_view.get_ui(player, {reopen = true}))
    node_view.get_hud(player, {preview = true, preview_type = player_change_preview_type})
  end

  if fields.health_in then
    meta:set_string("nv_hud_health_in", fields.health_in)
    node_view.get_hud(player, {preview = true, preview_type = player_change_preview_type})
  end

  if fields.default_health_in then
    meta:set_string("nv_hud_health_in", "Points")
    minetest.show_formspec(player_name, "node_view:ui", node_view.get_ui(player, {reopen = true}))
    node_view.get_hud(player, {preview = true, preview_type = player_change_preview_type})
  end

  if fields.change_change_preview_type then
    if player_change_preview_type == "Node" then
      change_preview_type[player_name] = "Entity"
      minetest.show_formspec(player_name, "node_view:ui", node_view.get_ui(player, {reopen = true}))
    else
      change_preview_type[player_name] = "Node"
      minetest.show_formspec(player_name, "node_view:ui", node_view.get_ui(player, {reopen = true}))
    end
  end

  if fields.apply then
    minetest.close_formspec(player_name, formname)

    player:hud_change(bg_id, "text", "node_view_ui_bg.png^[opacity:0")
    player:hud_change(r_text_id, "text", "")
    player:hud_change(g_text_id, "text", "")
    player:hud_change(b_text_id, "text", "")

    node_view.exit_edit_mode(player)

    return true
  end

  if fields.apply then
    minetest.close_formspec(player_name, formname)

    player:hud_change(bg_id, "text", "node_view_ui_bg.png^[opacity:0")
    player:hud_change(r_text_id, "text", "")
    player:hud_change(g_text_id, "text", "")
    player:hud_change(b_text_id, "text", "")

    node_view.exit_edit_mode(player)

    return true
  end

  if fields.quit then
    player:hud_change(bg_id, "text", "node_view_ui_bg.png^[opacity:0")
    player:hud_change(r_text_id, "text", "")
    player:hud_change(g_text_id, "text", "")
    player:hud_change(b_text_id, "text", "")

    meta:set_string("nv_hud_color", old_values[player_name].color)
    meta:set_string("nv_hud_alignment", old_values[player_name].hud_alignment)
    meta:set_string("nv_hud_health_in", old_values[player_name].health_in)

    node_view.exit_edit_mode(player)
  end

  return true
end)
