
--init

local modpath = minetest.get_modpath("node_view")

dofile(modpath .. "/functions.lua")
dofile(modpath .. "/preview.lua")
dofile(modpath .. "/ui.lua")

if minetest.get_modpath("default") then
  cg = "minetest_game"
elseif minetest.get_modpath("mcl_core") then
  cg = "mineclone"

  if minetest.get_modpath("vl_legacy") then
    cgs = "voxelibre"
  else
    cgs = "mineclonia"
  end
end

minetest.register_on_joinplayer(function(player)
  local meta = player:get_meta()
  meta:set_string("nv_last_obj", "")
  meta:set_int("nv_last_health", -1)

  node_view.edit_mode[player:get_player_name()] = false
end)

minetest.register_globalstep(function(dtime)
  for _, player in ipairs(minetest.get_connected_players()) do
    if not node_view.edit_mode[player:get_player_name()] then
      node_view.get_hud(player, {preview = false})
    end
  end
end)
