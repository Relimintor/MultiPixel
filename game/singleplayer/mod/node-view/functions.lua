
--functions

node_view = {}

local S = minetest.get_translator(minetest.get_current_modname())
local MCS = minetest.get_translator("mcl_doc")
local MCST = minetest.get_translator("mcl_tools")

local show_liquids = minetest.settings:get_bool("node_view.show_liquids") or false
local show_entities = minetest.settings:get_bool("node_view.show_entities") ~= false
local always_show_hand_in_creative = minetest.settings:get_bool("node_view.always_show_hand_in_creative") ~= false
local mod_security = minetest.settings:get("secure.enable_security") or false
local texture_pack_size = minetest.settings:get("node_view.texture_pack_size") or "None"
local texture_sizes = {["None"] = nil, ["1x1px"] = 1, ["2x2px"] = 2, ["4x4px"] = 4, ["8x8px"] = 8, ["16x16px"] = 16, ["32x32px"] = 32, ["64x64px"] = 64, ["128x128px"] = 128, ["256x256px"] = 256, ["512x512px"] = 512, ["1024x1024px"] = 1024}
local forced_texture_size = texture_sizes[texture_pack_size]
local texture_pack_path = minetest.settings:get("texture_path")

node_view.edit_mode = {}

function node_view.enter_edit_mode(player)
  if not node_view.edit_mode[player:get_player_name()] then
    node_view.edit_mode[player:get_player_name()] = true

    player_name = player:get_player_name()
    minetest.show_formspec(player_name, "node_view:ui", node_view.get_ui(player, {reopen = false}))
  end
end

function node_view.exit_edit_mode(player)
  if node_view.edit_mode[player:get_player_name()] then
    local meta = player:get_meta()
    meta:set_string("nv_last_obj", "")
    meta:set_int("nv_last_health", -1)

    node_view.edit_mode[player:get_player_name()] = false
  end
end

function node_view.get_rgb(v)
  v = v:gsub("%s", "")

  local r,g,b = v:match("^(%d+),(%d+),(%d+)$")
  r, g, b = tonumber(r), tonumber(g), tonumber(b)

  return r, g, b
end

function node_view.rgb_to_hex(r, g, b)
  return string.format("%02X%02X%02X", r, g, b)
end

function node_view.get_player_range(player)
  local wield = player:get_wielded_item()
  local def = wield:get_definition()

  if def.range then
    return def.range
  end

  if minetest.is_creative_enabled(player:get_player_name()) then
    return 10
  end

  return 4
end

function node_view.get_obj(player)
  local pos = player:get_pos()
  local meta = player:get_meta()
  local properties = player:get_properties()
  local eye_height = properties.eye_height
  local range = node_view.get_player_range(player)

  pos.y = pos.y + eye_height
  local dir = player:get_look_dir()

  local start = vector.add(pos, vector.multiply(dir, 0.2))
  local finish = vector.add(start, vector.multiply(dir, range))

  local ray = minetest.raycast(start, finish, show_entities, show_liquids)

  for obj_data in ray do
    if obj_data.type == "object" and obj_data.ref:is_player() then
      goto continue
    end

    local obj
    local obj_name
    local obj_description
    local obj_pos
    local obj_type
    local obj_texture
    local obj_mesh
    local obj_color
    local obj_palette

    local entity_hp = -1

    if obj_data.type == "node" then
      obj = minetest.get_node(obj_data.under)

      obj_name = obj.name
      obj_pos = obj_data.under
      obj_type = "node"

      local def = minetest.registered_nodes[obj_name]

      if def then
        obj_description = def.description
        obj_mesh = def.mesh or "node_view_default_mesh.obj"
        obj_color = def.color
        obj_palette = def.palette
        if def.tiles then
          obj_texture = def.tiles[6] or def.tiles[1] or "node_view_default_texture.png"
        else
          obj_texture = "node_view_default_texture.png"
        end
      else
        obj_description = S("Unknown")
        obj_mesh = "node_view_default_mesh.obj"
        obj_texture = "node_view_default_texture.png"
      end
    elseif obj_data.type == "object" then
      obj = obj_data.ref
      local entity = obj:get_luaentity()

      if entity then
        obj_name = entity.name
        obj_pos = obj:get_pos()
        obj_type = "entity"

        obj_description = entity.description
        obj_mesh = entity.mesh or "node_view_default_mesh.obj"

        entity_hp = entity.health

        if not entity_hp then
          entity_hp = entity.hp
        end

        if not entity_hp then
          entity_hp = entity.object:get_hp()
        end

        --[[if entity.textures then
          obj_texture = table.concat(entity.textures, ",")
        elseif entity.texture then
          obj_texture = entity.texture
        end--]]
      else
        obj_name = "unknown"
        obj_description = S("Unknown")
        obj_mesh = "node_view_default_mesh.obj" --entity.mesh or "node_view_default_mesh.obj"
        obj_texture = "node_view_default_texture.png"
        obj_pos = "?"
        obj_type = "entity"
      end
    end

    if obj_name ~= meta:get_string("nv_last_obj") or entity_hp ~= meta:get_int("nv_last_health") then
      meta:set_string("nv_last_obj", obj_name)
      meta:set_int("nv_last_health", entity_hp or -1)

      if obj_description then
        obj_description = obj_description:match("^[^\n]*")
      else
        obj_description = nil
      end

      return {
        data = obj_data,
        name = obj_name,
        description = obj_description,
        type = obj_type,
        pos = obj_pos,
        texture = obj_texture,
        mesh = obj_mesh,
        color = obj_color,
        palette = obj_palette
      }
    else
      return false
    end

    ::continue::
  end

  meta:set_string("nv_last_obj", "")
  return {type = "air"}
end

local node_view_huds = {}

function node_view.remove_huds(player)
    local player_name = player:get_player_name()
    local huds = node_view_huds[player_name]

    if not huds then
      return
    end

    for _, id in pairs(huds) do
      if id and player:hud_get(id) then
        player:hud_remove(id)
      end
    end

    node_view_huds[player_name] = {}
end

--Following functions (node_view.tool_can_dig_node, node_view.get_tool_maxlevel, node_view.get_min_required_tool, get_modname_from_node, node_view.get_png_size, strip_texture_modifiers, node_view.round1, node_view.get_modname_from_obj, node_view.remove_last_path_element) are generated by ChatGPT, with some additions from me.I left it's comments there, because I am lazy.

------------------------------------------------------------
-- Prüfen, ob ein Tool einen Node abbauen kann
------------------------------------------------------------
function node_view.tool_can_dig_node(toolstack, nodename)
    local tool_caps = toolstack:get_tool_capabilities()
    local ndef = minetest.registered_nodes[nodename]
    if not ndef then
      return false
    end

    local node_groups = ndef.groups or {}
    local dig_params = minetest.get_dig_params(node_groups, tool_caps)
    return dig_params.diggable, dig_params.time
end

-- Entfernt alle Einträge aus 'source', deren name eines der Wörter aus 'blocked' enthält.
function node_view.filter_out_by_name(source, blocked)
    local result = {}

    for _, entry in ipairs(source) do
        local name = entry.name or ""
        local keep = true

        for _, word in ipairs(blocked) do
            if string.find(name, word, 1, true) then
                keep = false
                break
            end
        end

        if keep then
            table.insert(result, entry)
        end
    end

    return result
end

------------------------------------------------------------
-- Tool: maxlevel extrahieren
------------------------------------------------------------
function node_view.get_tool_maxlevel(itemdef)
    local maxlevel = 0
    if not itemdef.tool_capabilities then return 0 end

    for _, gc in pairs(itemdef.tool_capabilities.groupcaps or {}) do
        if gc.maxlevel and gc.maxlevel > maxlevel then
            maxlevel = gc.maxlevel
        end
    end

    return maxlevel
end


------------------------------------------------------------
-- Mapping: Gruppe → Werkzeugtyp
------------------------------------------------------------
local GROUP_TO_TOOL_MTG = {
    cracky = S("Pickaxe"),
    crumbly = S("Shovel"),
    choppy = S("Axe"),
    snappy = S("Sword"),
    dig_immediate = S("Hand")
}

local GROUP_TO_TOOL_MC = {
    pickaxey = S("Pickaxe"),
    shovely = S("Shovel"),
    axey = S("Axe"),
    shearsy = S("Shears"),
    dig_immediate = S("Hand")
}


------------------------------------------------------------
-- Hauptfunktion: minimal benötigtes Tool + Werkzeugtyp
------------------------------------------------------------
function node_view.get_min_required_tool(node_name, player)
    local def = minetest.registered_nodes[node_name]
    if not def or not def.groups then
        return
    end

    local node_groups = def.groups


    ------------------------------------------------------------
    -- 1) Werkzeugtyp bestimmen (unabhängig von Hand)
    ------------------------------------------------------------
    local tooltype = S("None") -- fallback

    if cg == "minetest_game" then
      group_to_tool = GROUP_TO_TOOL_MTG
    elseif cg == "mineclone" then
      group_to_tool = GROUP_TO_TOOL_MC
    else
      group_to_tool = GROUP_TO_TOOL_MTG
    end

    for group, _ in pairs(node_groups) do
        if group_to_tool[group] then
            tooltype = group_to_tool[group]
            break
        end
    end

    if always_show_hand_in_creative then
      if minetest.is_creative_enabled(player:get_player_name()) then
        if not node_groups.unbreakable then
          return {name = "hand", description = S("Hand"), type = tooltype}
        else
          return {name = "hand", description = S("Hand"), type = S("None")}
        end
      end
    end

    if cg == "minetest_game" then
        ------------------------------------------------------------
        -- 2) ZUERST: Hand testen (minimales Tool)
        ------------------------------------------------------------
        local hand_can, hand_time = node_view.tool_can_dig_node(ItemStack(""), node_name)

        if hand_can then
            return {name = "hand", description = S("Hand"), type = tooltype}
        end

        ------------------------------------------------------------
        -- 3) Wenn Hand NICHT geht → Tools testen
        ------------------------------------------------------------
        local tools = {}

        for toolname, itemdef in pairs(minetest.registered_items) do
            if itemdef.tool_capabilities then
                local stack = ItemStack(toolname)
                local can, time = node_view.tool_can_dig_node(stack, node_name)

                if can then
                    local maxlevel = node_view.get_tool_maxlevel(itemdef)

                    table.insert(tools, {
                        name = toolname,
                        display = toolname,
                        maxlevel = maxlevel,
                        time = time or 999,
                    })
                end
            end
        end

        if #tools == 0 then
            return {name = "unbreakable", description = S("Unbreakable"), type = S("None")}
        end

        tools = node_view.filter_out_by_name(tools, {"hand", "enchanted", "spear", "hammer", "shepherd"})

        ------------------------------------------------------------
        -- 4) Tools sortieren:
        --    1) maxlevel ASC (schwächstes zuerst)
        --    2) time DESC (langsamstes zuerst)
        ------------------------------------------------------------
        table.sort(tools, function(a, b)
            if a.maxlevel ~= b.maxlevel then
                return a.maxlevel < b.maxlevel
            end
            return a.time > b.time
        end)


        ------------------------------------------------------------
        -- 5) Minimales Werkzeug ausgeben
        ------------------------------------------------------------
        local best = tools[1]

        if best then
          local itemdef = minetest.registered_items[best.display]
          local tool_description = itemdef and itemdef.description or best.display

          return {name = best.display, description = tool_description:match("^[^\n]*"), type = tooltype}
        else
          return {name = "error", description = "ERROR", type = tooltype}
        end
    elseif cg == "mineclone" then
        local pickaxey = { MCS("Diamond Pickaxe"), MCS("Iron Pickaxe"), MCS("Stone Pickaxe"), MCS("Golden Pickaxe"), MCS("Wooden Pickaxe")}
        local axey = {MCS("Diamond Axe"), S("Iron Axe"), MCS("Stone Axe"), MCS("Golden Axe"), MCS("Wooden Axe")}
        local shovely = {MCS("Diamond Shovel"), MCS("Iron Shovel"), MCS("Stone Shovel"), MCS("Golden Shovel"), MCS("Wooden Shovel")}
        local netherite_tools = {pickaxey = MCST("Netherite Pickaxe"), axey = MCST("Netherite Axe"), shovely = MCST("Netherite Shovel")}
        local miscs = {shearsy = MCST("Shears"), swordy = S("Sword"), handy = S("Hand")}

        local toolname = nil
        local tool_description = nil

        if node_groups then
          if node_groups.dig_immediate == 3 then
            return {name = "hand", description = miscs.handy, type = tooltype}
          else
            local tool_minable = false

            if node_groups.shearsy or node_groups.shearsy_wool then
              toolname = "shears"
              tool_description = miscs.shearsy
            elseif node_groups.swordy or node_groups.swordy_cobweb then
              toolname = "sword"
              tool_description = miscs.swordy
            elseif node_groups.handy then
              toolname = "hand"
              tool_description = miscs.handy
            elseif node_groups.pickaxey then
              toolname = "?pickaxe"

              if node_groups.pickaxey <= 5 then
                tool_description = pickaxey[(node_groups.pickaxey - 6) * -1]
              else
                tool_description = netherite_tools.pickaxey
              end
            elseif node_groups.axey then
              toolname = "?axe"

              if node_groups.axey <= 5 then
                tool_description = axey[(node_groups.axey - 6) * -1]
              else
                tool_description = netherite_tools.axey
              end
            elseif node_groups.shovely then
              toolname = "?shovel"

              if node_groups.shovely <= 5 then
                tool_description = shovely[(node_groups.shovely - 6) * -1]
              else
                tool_description = netherite_tools.shovely
              end
            else
              return {name = "unbreakable", description = S("Unbreakable"), type = S("None")}
            end

            if toolname and tool_description then
              return {name = toolname, description = tool_description:match("^[^\n]*"), type = tooltype}
            else
              return {name = "unknown", description = S("Unknown"), type = S("Unknown")}
            end
          end
        end
    end
end

function node_view.get_modname_from_obj(obj_name)
    return obj_name:match("([^:]+)")
end

function node_view.remove_last_path_element(path)
  -- trailing Slashes entfernen
  path = path:gsub("[/\\]+$", "")

  -- zwei Elemente entfernen
  return path:match("^(.*)[/\\][^/\\]+[/\\][^/\\]+$")
end

function node_view.round1(x)
  if x then
    return math.floor(x * 10 + 0.5) / 10
  else
    return nil
  end
end

-- Entfernt alles ab dem ersten ^ (Texture-Modifiers)
function strip_texture_modifiers(tex)
    if type(tex) ~= "string" then
        return tex
    end

    local pos = tex:find("%^")
    if not pos then
        return tex
    end

    return tex:sub(1, pos - 1)
end

function node_view.get_png_size(path_or_tex)
    local clean = strip_texture_modifiers(path_or_tex)
    local f = io.open(clean, "rb")
    if not f then return nil, nil end

    -- PNG signature
    f:read(8)

    -- IHDR chunk length (ignored)
    f:read(4)

    -- IHDR type (must be ASCII "IHDR")
    local ihdr_type = f:read(4)
    if ihdr_type ~= "IHDR" then
        f:close()
        return nil, nil
    end

    -- Width (big endian)
    local w1, w2, w3, w4 = string.byte(f:read(4), 1, 4)
    local width = w1 * 16777216 + w2 * 65536 + w3 * 256 + w4

    -- Height (big endian)
    local h1, h2, h3, h4 = string.byte(f:read(4), 1, 4)
    local height = h1 * 16777216 + h2 * 65536 + h3 * 256 + h4

    f:close()
    return width, height
end

function node_view.get_hud(player, data)
  data = data or {}

  local obj

  local player_name = player:get_player_name()
  local meta = player:get_meta()

  local hud_scale = {x = 400, y = 81.25}
  local r, g, b = node_view.get_rgb(meta:get_string("nv_hud_color"))

  local hud_alignments = {
    ["Top-Middle"] = {pos = {x = 0.5, y = 0}, additional_offset = {x = 0, y = 0}},
    ["Top-Right"] = {pos = {x = 1, y = 0}, additional_offset = {x = (hud_scale.x / 2) * -1, y = 0}},
    ["Top-Left"] = {pos = {x = 0, y = 0}, additional_offset = {x = hud_scale.x / 2, y = 0}},
    ["Middle-Right"] = {pos = {x = 1, y = 0.5}, additional_offset = {x = (hud_scale.x / 2) * -1, y = (hud_scale.y / 2) * -1}},
    ["Middle-Left"] = {pos = {x = 0, y = 0.5}, additional_offset = {x = hud_scale.x / 2, y = (hud_scale.y / 2) * -1}},
    ["Bottom-Right"] = {pos = {x = 1, y = 1}, additional_offset = {x = (hud_scale.x / 2) * -1, y = hud_scale.y * -1}},
    ["Bottom-Left"] = {pos = {x = 0, y = 1}, additional_offset = {x = hud_scale.x / 2, y = hud_scale.y * -1}}
  }

  h_a = hud_alignments[meta:get_string("nv_hud_alignment")] or hud_alignments["Top-Middle"]

  if not data.preview then
    obj = node_view.get_obj(player)
  else
    local preview_def

    if data.preview_type == "Entity" then
      preview_def = minetest.registered_nodes["node_view:preview_node"]

      obj = {
        data = {},
        name = "node_view:preview_node",
        description = preview_def.description,
        type = "node",
        pos = {x = 0, y = 0, z = 0},
        texture = preview_def.tiles[1],
        mesh = "node_view_default_mesh.obj",
        color = nil,
        palette = nil
      }
    elseif data.preview_type == "Node" then
      preview_def = minetest.registered_entities["node_view:preview_entity"].initial_properties

      obj = {
        data = {},
        name = "node_view:preview_entity",
        description = preview_def.description,
        type = "entity",
        pos = {x = 0, y = 0, z = 0},
        texture = preview_def.textures[1],
        mesh = "node_view_default_mesh.obj",
        color = nil,
        palette = nil
      }
    end
  end

  if not node_view_huds[player_name] then
    node_view_huds[player_name] = {}
  end

  if obj then
    if obj.type ~= "air" or data.preview then
      node_view.remove_huds(player)

      local huds = node_view_huds[player_name]

      local modname = node_view.get_modname_from_obj(obj.name)
      local mod_path = minetest.get_modpath(modname)
      local user_path = minetest.get_user_path()

      local obj_texture = "node_view_default_texture.png"
      local obj_extra_info
      local extra_info_color

      local obj_name_offset = {x = -117.5, y = 19}
      local extra_info_offset = {x = -117.5, y = 39}
      local modname_offset = {x = -117.5, y = 59.1}

      local alignment

      local png_w, png_h

      if obj.type == "node" then
        obj_texture = obj.texture.name or obj.texture.image or obj.texture or obj_texture
        obj_texture = strip_texture_modifiers(obj_texture)

        if mod_path then
          local texture_path

          if mod_security == "false" then
            if texture_pack_path then
              texture_path = texture_pack_path..node_view.get_modname_from_obj(obj.name).."/"..obj_texture

              png_w, png_h = node_view.get_png_size(texture_path)

              if not png_w or png_h then
                texture_path = texture_pack_path..obj_texture

                png_w, png_h = node_view.get_png_size(texture_path)
              end
            end
          end

          if not png_w or png_h then
            texture_path = mod_path.."/textures/"..obj_texture

            png_w, png_h = node_view.get_png_size(texture_path)
          end

          if not png_w or not png_h then
            texture_path = mod_path.."/models/"..obj_texture

            png_w, png_h = node_view.get_png_size(texture_path)
          end
        end

        if not png_w or not png_h then
            png_w = forced_texture_size or 16
            png_h = forced_texture_size or 16

            if cgs == "voxelibre" then
              if obj.texture.animation then
                if mod_security == "true" then
                  png_w = 9999999
                  png_h = 9999999

                  obj_name_offset = {x = 0, y = 19}
                  extra_info_offset = {x = 0, y = 39}
                  modname_offset = {x = 0, y = 59.1}

                  alignment = 0
                else
                  texture_path = node_view.remove_last_path_element(user_path).."/games/mineclone2/textures/"..obj_texture

                  png_w, png_h = node_view.get_png_size(texture_path)
                end
              end
            end
        end

        if forced_texture_size and mod_security == "true" then
          if png_w == png_h then
            png_w = forced_texture_size
            png_h = forced_texture_size
          else
            png_w = 9999999
            png_h = 9999999

            obj_name_offset = {x = 0, y = 19}
            extra_info_offset = {x = 0, y = 39}
            modname_offset = {x = 0, y = 59.1}

            alignment = 0
          end
        end

        obj_texture = "node_view_default_texture.png"

        if type(obj.texture) == "string" then
          obj_texture = obj.texture
        elseif type(obj.texture) == "table" then
          if obj.texture.animation then
            if obj.texture.name then
              if obj.texture.animation.type == "vertical_frames" then
                obj_texture = obj.texture.name.."^[verticalframe: "..png_h / png_w..":0"
              elseif obj.texture.animation.type == "horizontal_frames" then
                obj_texture = obj.texture.name.."^[horizontalframe:"..png_w / png_h..":0"
              end
            elseif obj.texture.image then
              if obj.texture.animation.type == "vertical_frames" then
                obj_texture = obj.texture.image.."^[verticalframe:"..png_h / png_w..":0"
              elseif obj.texture.animation.type == "horizontal_frames" then
                obj_texture = obj.texture.image.."^[horizontalframe:"..png_w / png_h..":0"
              end
            end
          end
        end

        if obj.color then
          obj_texture = obj_texture.."^[multiply:"..obj.color
        end

        if obj.palette and not obj.color then
          obj_texture = obj_texture.."^[multiply:#7CBD6B"
        end

        local tool = node_view.get_min_required_tool(obj.name, player) or {description = S("Unknown"), type = S("Unknown")}

        obj_extra_info = tool.description.." ("..S("Type")..": "..(tool.type)..")"

        if obj.mesh == "node_view_default_mesh.obj" then
          huds.img = player:hud_add({
            hud_elem_type = "image",
            text = obj_texture or "node_view_default_texture.png",
            position = {x = h_a.pos.x, y = h_a.pos.y},
            offset = {x = -157.5 + h_a.additional_offset.x, y = 40 + h_a.additional_offset.y},
            alignment = {x = 0, y = 0},
            scale = {x = 56 / (png_w or 16), y = 56 / (png_w or 16)},
            z_index = 2
          })
        else
          obj_name_offset = {x = 0, y = 19}
          extra_info_offset = {x = 0, y = 39}
          modname_offset = {x = 0, y = 59.1}

          alignment = 0
        end
      elseif obj.type == "entity" then
        local entity_ref = obj.data.ref
        local entity

        if entity_ref then
          entity = entity_ref:get_luaentity()
        else
          entity = minetest.registered_entities["node_view:preview_entity"].initial_properties
        end

        local entity_hp
        local entity_max_hp

        if entity then
          entity_hp = entity.health

          if not entity_hp then
            entity_hp = entity.hp
          end

          if not entity_hp then
            entity_hp = entity.object:get_hp()
          end

          entity_max_hp = entity.max_health

          if not entity_max_hp then
            entity_max_hp = entity.max_hp
          end

          if not entity_max_hp then
            entity_max_hp = entity.hp_max
          end

          if not entity_max_hp then
            entity_max_hp = entity.object:get_hp()
          end
        end

        if meta:get_string("nv_hud_health_in") == "Hearts" then
          obj_extra_info = S("Health")..": "..(node_view.round1(entity_hp / 2) or S("Unknown")).."♥/"..(node_view.round1(entity_max_hp / 2) or S("Unknown")).."♥"
        else
          obj_extra_info = S("Health")..": "..(node_view.round1(entity_hp) or S("Unknown")).."/"..(node_view.round1(entity_max_hp) or S("Unknown"))
        end

        extra_info_color = "FF4040"

        obj_name_offset = {x = 0, y = 19}
        extra_info_offset = {x = 0, y = 39}
        modname_offset = {x = 0, y = 59.1}

        alignment = 0
      end

      huds.bg = player:hud_add({
        hud_elem_type = "image",
        position = {x = h_a.pos.x, y = h_a.pos.y},
        offset = {x = h_a.additional_offset.x, y = (hud_scale.y / 2) + h_a.additional_offset.y},
        text = "node_view_hud_bg.png^[multiply:#"..node_view.rgb_to_hex(r or 26, g or 26, b or 27),
        scale = hud_scale,
        alignment = {x = 0, y = 0},
        z_index = 1
      })

      huds.obj_name = player:hud_add({
        hud_elem_type = "text",
        text = obj.description or obj.name or S("Unknown"),
        number = 0xFFFFFF,
        position = {x = h_a.pos.x, y = h_a.pos.y},
        offset = {x = obj_name_offset.x + h_a.additional_offset.x, y = obj_name_offset.y + h_a.additional_offset.y},
        alignment = {x = alignment or 1, y = 0},
        z_index = 2
      })

      huds.extra_info = player:hud_add({
        hud_elem_type = "text",
        text = obj_extra_info or S("Unknown"),
        number = "0x"..(extra_info_color or "EBB344"),
        position = {x = h_a.pos.x, y = h_a.pos.y},
        offset = {x = extra_info_offset.x + h_a.additional_offset.x, y = extra_info_offset.y + h_a.additional_offset.y},
        alignment = {x = alignment or 1, y = 0},
        z_index = 2
      })

      huds.modname = player:hud_add({
        hud_elem_type = "text",
        text = "["..(modname or S("Unknown")).."]",
        number = 0x4343F0,
        position = {x = h_a.pos.x, y = h_a.pos.y},
        offset = {x = modname_offset.x + h_a.additional_offset.x, y = modname_offset.y + h_a.additional_offset.y},
        alignment = {x = alignment or 1, y = 0},
        z_index = 2
      })
    else
      node_view.remove_huds(player)
    end
  end
end
