
--preview

local S = minetest.get_translator(minetest.get_current_modname())

local preview_texture = "node_view_preview_texture2.png"

minetest.register_node("node_view:preview_node", {
  description = S("Preview").." "..S("Node"),
  tiles = {preview_texture},
  groups = {cracky = 3, level = math.random(0, 3), not_in_creative_inventory = 1},
  drop = ""
})

minetest.register_entity("node_view:preview_entity", {
  initial_properties = {
    description = S("Preview").." "..S("Entity"),
    physical = false,
    collide_with_objects = false,
    collisionbox = {-0.0, -0.0, -0.0, 0.0, 0.0, 0.0},
    visual = "cube",
    textures = {preview_texture, preview_texture, preview_texture, preview_texture, preview_texture, preview_texture},
    health = math.random(5, 10),
    max_hp = 10
  }
})
