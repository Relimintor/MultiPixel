(function () {
  const CHUNK_SIZE = 16;
  const CHUNK_HEIGHT = 96;
  const WORLD_RADIUS = 13;
  const BLOCK_SIZE = 1;
  const SEA_LEVEL = 18;
  const BASE_LAND_Y = 20;
  const ISLAND_RADIUS = 30;

  const WORLD_GEN_SETTINGS = {
    version: '1.17-inspired-v1',
    seedStorageKey: 'singleplayer.worldSeed',
    wasm: {
      enabled: false,
      preferCaveSampling: true,
    },
    terrainCarving: {
      // Keep the surface mostly intact: caves/ravines start carving a few blocks below ground.
      caveSurfaceSafetyDepth: 7,
      ravineSurfaceSafetyDepth: 8,
      ravineActivationThreshold: 0.9,
    },
    // Limit new chunk generation per update to avoid frame spikes while moving/jumping.
    chunkCreationBudgetPerTick: 2,
    chunkCreationBudgetOnForceUpdate: 5,
    // Max chunk mesh rebuilds processed per frame from the remesh queue.
    meshRebuildBudgetPerFrame: 2,
    // Tick-limiting caps to prevent chain-reaction lag spikes.
    blockUpdatesPerTickMax: 60,
    fluidUpdatesPerTickMax: 40,
    redstoneUpdatesPerTickMax: 40,
    // Chunk render distance in chunk units (radius). Lower default keeps performance stable.
    // Players can still raise it in-game with the render-distance command.
    chunkRenderDistance: 2,
    // Entities farther than this many blocks are frozen (AI/pathfinding/physics skipped).
    entityActivationRange: 48,
    biomeMap: {
      // Enable optional micro-variants for fuller biome variety in this profile.
      enableBambooJungleVariant: true,
      enableSunflowerPlainsVariant: true,
      // Climate probabilities from the design plan: warm 4/6, cold 1/6, freezing 1/6.
      temperatureRatios: { warm: 4 / 6, cold: 1 / 6, freezing: 1 / 6 },
      specialRegionChance: 1 / 13,
      regionHillChance: 0.08,
    },
    treeDensityByBiome: {
      Forest: 1.05,
      'Jungle Forest': 1.62,
      Plains: 0.24,
      Mountains: 0.05,
      'Snowy Plains': 0.08,
      Desert: 0,
      Ocean: 0,
    },
    treeClusterBonus: 1.32,
    treeMinSpacingChance: 0.48,
    decorations: {
      amethystGeodes: {
        enabled: true,
        chancePerChunk: 0.04,
        maxPerChunk: 1,
      },
      pumpkins: {
        enabled: true,
        chancePerChunk: 1 / 32,
        minPatch: 3,
        maxPatch: 7,
      },
      melons: {
        enabled: true,
        chancePerJungleChunk: 0.15,
        minPatch: 4,
        maxPatch: 9,
      },
    },
  };

  const CAVE_SCALE = 0.05;
  const CAVE_THRESHOLD = 0.7;
  const CAVE_MIN_Y = 5;
  const CAVE_MAX_Y_OFFSET = 4;

  const PLAYER_HEIGHT = 1.8 * BLOCK_SIZE;
  const PLAYER_RADIUS = 0.3;
  const GRAVITY = -0.012;
  const JUMP_POWER = 0.17;

  const INV_COLS = 9;
  const INV_ROWS = 3;
  const HOTBAR_SLOTS = 9;
  const TOTAL_INV_SIZE = INV_ROWS * INV_COLS + HOTBAR_SLOTS;

  const REPO_BASE_PREFIX = '/MultiPixel';
  const getAssetPath = (subPath) => {
    const ASSET_BASE_DIR = 'game/singleplayer/assets';
    if (REPO_BASE_PREFIX) return `${REPO_BASE_PREFIX}/${ASSET_BASE_DIR}/${subPath}`;
    return `${ASSET_BASE_DIR}/${subPath}`;
  };

  const makeInlineSvgIcon = (svgMarkup) => `data:image/svg+xml;utf8,${encodeURIComponent(svgMarkup)}`;

  const sideConfig = window.SingleplayerSideConfig || {};

  const ASSET_FILEPATHS = {
    GRASS: getAssetPath('textures/grass.png'),
    DIRT: getAssetPath('textures/dirt.png'),
    STONE: getAssetPath('textures/stone.png'),
    LEAVES: getAssetPath('textures/azalea_leaves.png'),
    SAND: getAssetPath('textures/sand.png'),
    HEART: getAssetPath('ui/full.png'),
    HEART_FULL: getAssetPath('ui/full.png'),
    HEART_HALF: getAssetPath('ui/half.png'),
    HEART_EMPTY: getAssetPath('ui/container.png'),
    FOOD: getAssetPath('ui/food_full.png'),
    FOOD_FULL: getAssetPath('ui/food_full.png'),
    FOOD_HALF: getAssetPath('ui/food_half.png'),
    FOOD_EMPTY: getAssetPath('ui/food_empty.png'),
    AIR_FULL: getAssetPath('ui/air_full.png'),
    AIR_POP: getAssetPath('ui/air_pop.png'),
    AIR_GONE: getAssetPath('ui/air_gone.png'),
    OAK_PLANK: getAssetPath('textures/oak_planks.png'),
    
    /*Crafting table*/
    CRAFTING_TABLE_SIDE: getAssetPath('textures/crafting_table/crafting_table_side.png'),
    CRAFTING_TABLE_TOP: getAssetPath('textures/crafting_table/crafting_table_top.png'),
    CRAFTING_TABLE_SIDE_ALT: getAssetPath('textures/crafting_table/crafting_table_side_1.png'),
    CRAFTING_TABLE_FRONT: getAssetPath('textures/crafting_table/crafting_table_front.png'),
    CRAFTING_TABLE_FRONT_ALT: getAssetPath('textures/crafting_table/crafting_table_front_1.png'),
    
    STICK: getAssetPath('textures/item/stick.png'),
    SANDSTONE: getAssetPath('sand/sandstone/sandstone.png'),
    SANDSTONE_BOTTOM: getAssetPath('sand/sandstone/sandstone_bottom.png'),
    SANDSTONE_TOP: getAssetPath('sand/sandstone/sandstone_top.png'),
    COBBLESTONE: getAssetPath('textures/cobblestone.png'),
    MOSSY_COBBLESTONE: getAssetPath('textures/mossy_cobblestone.png'),
    SNOW_BLOCK: getAssetPath('textures/snow.png'),
    SNOWBALL: getAssetPath('textures/item/snowball.png'),
    BEDROCK: getAssetPath('textures/bedrock.png'),
    COAL: getAssetPath('textures/item/coal.png'),
    COAL_ORE_BLOCK: getAssetPath('textures/coal_ore.png'),
    COAL_BLOCK: getAssetPath('textures/coal_block.png'),
    STONE_BRICK_BLOCK: getAssetPath('textures/stone_bricks.png'),
    TORCH: getAssetPath('textures/item/torch.png'),

    /*FUrnace*/
    FURNACE_TOP: getAssetPath('textures/furnace/furnace_top.png'),
    FURNACE: getAssetPath('textures/furnace_off.png'),
    FURNACE_SIDE: getAssetPath('textures/furnace/furnace_side.png'),
    FURNACE_FRONT: getAssetPath('textures/furnace/furnace_front.png'),
    FURNACE_FRONT_LIT: getAssetPath('textures/furnace/furnace_front_on.png'),
    CHEST_NORMAL: getAssetPath('textures/chest/normal.png'),
    CHEST_NORMAL_LEFT: getAssetPath('textures/chest/normal_left.png'),
    CHEST_NORMAL_RIGHT: getAssetPath('textures/chest/normal_right.png'),
    
    CRACKED_STONE_BRICK: getAssetPath('textures/cracked_stone_bricks.png'),
    CHARCOAL: getAssetPath('textures/item/charcoal.png'),
    GLASS_BLOCK: getAssetPath('textures/building/glass_block.png'),
    SMOOTH_STONE_BLOCK: getAssetPath('textures/smooth_stone.png'),
    GRAVEL: getAssetPath('textures/gravel.png'),
    
    // Reuse the existing sandstone top texture until a dedicated smooth texture asset is added.
    SMOOTH_SANDSTONE_BLOCK: getAssetPath('sand/sandstone/sandstone_top.png'),
    IRON_ORE_BLOCK: getAssetPath('textures/iron_ore.png'),
    IRON_ORE: getAssetPath('textures/item/raw_iron.png'),
    RAW_IRON_BLOCK: getAssetPath('textures/raw_iron_block.png'),
    LAVA_LIQUID: getAssetPath('textures/liquid/lava.jpeg'),
    WATER: getAssetPath('textures/liquid/water_still.jpeg'),
    COPPER_BLOCK: getAssetPath('textures/copper/copper_block.png'),
    COPPER_ORE: getAssetPath('textures/copper/copper_ore.png'),
    RAW_COPPER_BLOCK: getAssetPath('textures/copper/raw_copper_block.png'),
    WEATHERED_COPPER_BLOCK: getAssetPath('textures/copper/weathered_copper.png'),
    RAW_COPPER_ITEM: getAssetPath('textures/item/raw_copper.png'),
    OBSIDIAN_BLOCK: getAssetPath('textures/obsidian.png'),
    GOLD_ORE_BLOCK: getAssetPath('textures/gold_ore.png'),
    RAW_GOLD_BLOCK: getAssetPath('textures/raw_gold_block.png'),
    GOLD_ORE: getAssetPath('textures/item/raw_gold.png'),
    DIAMOND_ORE: getAssetPath('textures/diamond_ore.png'),
    DIAMOND: getAssetPath('textures/item/diamond.png'),
    DIAMOND_BLOCK: getAssetPath('textures/diamond_block.png'),
    FLINT: getAssetPath('textures/item/flint.png'),
    WOOD_LOG: getAssetPath('textures/oak/oak_log.png'),
    EMERALD_ORE: getAssetPath('textures/emerald_ore.png'),
    EMERALD_BLOCK: getAssetPath('textures/emerald_block.png'),
    EMERALD:  getAssetPath('textures/item/emerald.png'),
    CHISELED_STONE_BRICK: getAssetPath('textures/chiseled_stone_bricks.png'),

    //Amethyst cluster
    AMETHYST_BLOCK: getAssetPath('textures/amethyst_block.png'),
    CHALK_BLOCK: getAssetPath('textures/calcite.png'),
    BASALT_BLOCK: getAssetPath('textures/smooth_basalt.png'),
    
    BAMBOO_PLANKS_SIDE: getAssetPath('textures/bamboo_block.png'),
    BAMBOO_PLANKS_TOP:getAssetPath('textures/bamboo_block_top.png'),

    //dyes
    BLACK_DYE: getAssetPath('textures/item/black_dye.png'),
    GREEN_DYE: getAssetPath('textures/item/green_dye.png'),
    WHITE_DYE: getAssetPath('textures/item/white_dye.png'),
    PINK_DYE: getAssetPath('textures/item/pink_dye.png'),
    YELLOW_DYE: getAssetPath('textures/item/yellow_dye.png'),
    RED_DYE: getAssetPath('textures/item/red_dye.png'),
    PURPLE_DYE: getAssetPath('textures/item/purple_dye.png'),
    LIGHT_BLUE_DYE: getAssetPath('textures/item/light_blue_dye.png'),
    BLUE_DYE: getAssetPath('textures/item/blue_dye.png'),
    LIME_DYE: getAssetPath('textures/item/lime_dye.png'),
    ORANGE_DYE: getAssetPath('textures/item/orange_dye.png'),
    MAGENTA_DYE: getAssetPath('textures/item/magenta_dye.png'),
    CYAN_DYE: getAssetPath('textures/item/cyan_dye.png'),
    GRAY_DYE: getAssetPath('textures/item/gray_dye.png'),
    LIGHT_GRAY_DYE: getAssetPath('textures/item/light_gray_dye.png'),
    BROWN_DYE: getAssetPath('textures/item/brown_dye.png'),
    
    /*Ice*/
    ICE: getAssetPath('textures/ice.png'),
    PACKED_ICE: getAssetPath('textures/packed_ice.png'),
    BLUE_ICE: getAssetPath('textures/blue_ice.png'),
    
    OAK_LOG_TOP: getAssetPath('textures/oak/oak_log_top.png'),
    STEEL_INGOT: getAssetPath('textures/item/iron_ingot.png'),
    STEEL_BLOCK: getAssetPath('textures/iron_block.png'),
    COPPER_INGOT: getAssetPath('textures/item/copper_ingot.png'),
    GOLD_INGOT: getAssetPath('textures/item/gold_ingot.png'),
    COPPER_GRATE: getAssetPath('textures/copper/copper_grate.png'),
    CHISELED_COPPER: getAssetPath('textures/copper/chiseled_copper.png'),
    CUT_COPPER: getAssetPath('textures/copper/cut_copper.png'),
    game1k: getAssetPath('textures/game1k.webp'),

    /*Glass*/
    BLACK_STAINED_GLASS: getAssetPath('textures/glass/black_stained_glass.png'),
    GREEN_STAINED_GLASS: getAssetPath('textures/glass/green_stained_glass.png'),
    
    /*Pickaxes*/
    WOODEN_PICKAXE: getAssetPath('textures/item/tool/pickaxe/wooden_pickaxe.png'),
    STONE_PICKAXE: getAssetPath('textures/item/tool/pickaxe/stone_pickaxe.png'),
    GOLDEN_PICKAXE: getAssetPath('textures/item/tool/pickaxe/golden_pickaxe.png'),
    COPPER_PICKAXE: getAssetPath('textures/item/tool/pickaxe/copper_pickaxe.png'),
    IRON_PICKAXE: getAssetPath('textures/item/tool/pickaxe/iron_pickaxe.png'),
    DIAMOND_PICKAXE: getAssetPath('textures/item/tool/pickaxe/diamond_pickaxe.png'),
    EMERALD_PICKAXE: getAssetPath('textures/item/tool/pickaxe/emerald_pickaxe.png'),

    /*Axes*/
    WOODEN_AXE: getAssetPath('textures/item/tool/axe/wooden_axe.png'),
    STONE_AXE: getAssetPath('textures/item/tool/axe/stone_axe.png'),
    GOLDEN_AXE: getAssetPath('textures/item/tool/axe/golden_axe.png'),
    COPPER_AXE: getAssetPath('textures/item/tool/axe/copper_axe.png'),
    IRON_AXE: getAssetPath('textures/item/tool/axe/iron_axe.png'),
    DIAMOND_AXE: getAssetPath('textures/item/tool/axe/diamond_axe.png'),
    EMERALD_AXE: getAssetPath('textures/item/tool/axe/default_tool_emeraldaxe.png'),

    /*Daggers*/
    WOOD_DAGGER: getAssetPath('textures/item/tool/dagger/wood_dagger.png'),
    STONE_DAGGER: getAssetPath('textures/item/tool/dagger/stone_dagger.png'),
    GOLD_DAGGER: getAssetPath('textures/item/tool/dagger/gold_dagger.png'),
    STEEL_DAGGER: getAssetPath('textures/item/tool/dagger/steel_dagger.png'),
    EMERALD_DAGGER: getAssetPath('textures/item/tool/dagger/emerald_dagger.png'),

    //Shovel
    WOODEN_SHOVEL: getAssetPath('textures/item/tool/shovel/wooden_shovel.png'),
    STONE_SHOVEL: getAssetPath('textures/item/tool/shovel/stone_shovel.png'),
    GOLDEN_SHOVEL: getAssetPath('textures/item/tool/shovel/golden_shovel.png'),
    COPPER_SHOVEL: getAssetPath('textures/item/tool/shovel/copper_shovel.png'),
    IRON_SHOVEL: getAssetPath('textures/item/tool/shovel/iron_shovel.png'),
    DIAMOND_SHOVEL: getAssetPath('textures/item/tool/shovel/diamond_shovel.png'),
    EMERALD_SHOVEL: getAssetPath('textures/item/tool/shovel/emerald_shovel.png'),
    
    PIG_TEXTURE: getAssetPath('textures/mobs/pig.png'),
    PORKCHOP_RAW: getAssetPath('textures/item/food/pork/porkchop.png'),
    PORKCHOP_COOKED: getAssetPath('textures/item/food/pork/cooked_porkchop.png'),
    ZOMBIE_TEXTURE: getAssetPath('textures/mobs/hostile/zombie.png'),
    ROTTEN_FLESH: getAssetPath('textures/item/food/rotten_flesh.png'),

    //Jungle tree
    JUNGLE_LOG: getAssetPath('textures/jungle/jungle_log.png'),
    JUNGLE_LOG_TOP: getAssetPath('textures/jungle/jungle_log_top.png'),
    JUNGLE_PLANKS: getAssetPath('textures/jungle/jungle_planks.png'),
    PANDA_TEXTURE: getAssetPath('textures/mobs/neutral/panda.png'),
    BAMBOO_STAGE0: getAssetPath('textures/halfblock/bamboo/bamboo_stage0.png'),
    BAMBOO_STALK: getAssetPath('textures/halfblock/bamboo/bamboo_stalk.png'),

    //Pumpkin
    PUMPKIN_TOP:getAssetPath('textures/pumpkin/pumpkin_top.png'),
    PUMPKIN_BOTTOM:getAssetPath('textures/pumpkin/pumpkin_bottom.png'),
    PUMPKIN_SIDE: getAssetPath('textures/pumpkin/pumpkin_side.png'),

    //melon
    MELON_TOP: getAssetPath('textures/melon/melon_top.png'),
    MELON_SIDE: getAssetPath('textures/melon/melon_side.png'),

    //slice
    PUMPKIN_SLICE:getAssetPath('textures/item/glistering_melon_slice.png'),
    MELON_SLICE: getAssetPath('textures/item/melon_slice.png'),
    BUCKET: getAssetPath('textures/item/bucket.png'),
    WATER_BUCKET: getAssetPath('textures/item/water_bucket.png'),
    LAVA_BUCKET: getAssetPath('textures/item/lava_bucket'),
    GLOWSTONE: getAssetPath('textures/glowstone.png'),
    GLOWSTONE_DUST: getAssetPath('textures/item/glowstone_dust.png'),
    BONE: getAssetPath('textures/item/bone.png'),
  };

  const baseBlockMaterials = {
    
    /*Iligals*/
    0: { name: 'Air', id: 0, textured: false },
    14: { name: 'Bedrock', id: 14, textured: true, textureKey: 'BEDROCK', unbreakable: true },
    
    /*terrain*/
    1: { name: 'Grass', id: 1, textured: true, textureKey: 'GRASS' },
    2: { name: 'Dirt', id: 2, textured: true, textureKey: 'DIRT' }, 
    3: { name: 'Stone', id: 3, textured: true, textureKey: 'STONE' },
    7: { name: 'Sand', id: 7, textured: true, textureKey: 'SAND' },
    15: { name: 'Snow Block', id: 15, textured: true, textureKey: 'SNOW_BLOCK', color: 0xf2f7ff },
    59: { name: 'Ice', id: 59, textured: true, textureKey: 'ICE' },
    28: { name: 'gravel', id: 28, textured: true, textureKey: 'GRAVEL' },
     13: { 
      name: 'Sand stone', 
      id: 13, 
      textured: true, 
      textureKey: 'SANDSTONE', 
      textureByFace: {
        top: 'SANDSTONE_TOP',
        bottom: 'SANDSTONE_BOTTOM',
        posX: 'SANDSTONE',
        negX: 'SANDSTONE',
        posZ: 'SANDSTONE',
        negZ: 'SANDSTONE' 
      },
    },

    /* Wood Types
    With theyr
    respective leaf block*/

    //oak
    
     5: { 
      name: 'Oak Log', 
      id: 5, 
      textured: true, 
      textureKey: 'WOOD_LOG', 
      textureByFace: {
        top: 'OAK_LOG_TOP',
        bottom: 'OAK_LOG_TOP',
        posX: 'WOOD_LOG',
        negX: 'WOOD_LOG',
        posZ: 'WOOD_LOG',
        negZ: 'WOOD_LOG'
      } 
    },

    6: { name: 'Oak Leaves', id: 6, textured: true, textureKey: 'LEAVES', transparent: true, opacity: 1 },

    //Jungle
      96: { 
      name: 'Jungle Log', 
      id: 96, 
      textured: true, 
      textureKey: 'JUNGLE_LOG', 
      textureByFace: {
        top: 'JUNGLE_LOG_TOP',
        bottom: 'JUNGLE_LOG_TOP',
        posX: 'JUNGLE_LOG',
        negX: 'JUNGLE_LOG',
        posZ: 'JUNGLE_LOG',
        negZ: 'JUNGLE_LOG'
      } 
    },
  97: { name: 'Jungle Leaves', id: 97, textured: true, textureKey: 'LEAVES', transparent: true, opacity: 1 },
  98: { name: 'Jungle Planks', id: 98, textured: true, textureKey: 'JUNGLE_PLANKS' },

  //bamboo
  103: { name: 'Bamboo planks', id: 103, textured: true, textureKey: 'BAMBOO_PLANKS_SIDE',
      textureByFace: {
        top: 'BAMBOO_PLANKS_TOP',
        bottom: 'BAMBOO_PLANKS_TOP',
        posX: 'BAMBOO_PLANKS_SIDE',
        negX: 'BAMBOO_PLANKS_SIDE',
        posZ: 'BAMBOO_PLANKS_SIDE',
        negZ: 'BAMBOO_PLANKS_SIDE'
      }  },
    
    /*Building ig*/
    8: { name: 'Oak Planks', id: 8, textured: true, textureKey: 'OAK_PLANK' },
    114: {
      name: 'Wooden Slab',
      id: 114,
      textured: true,
      textureKey: 'OAK_PLANK',
      shape: 'slab',
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 },
      placeable: true
    },
    230: {
      name: 'Stone Slab',
      id: 230,
      textured: true,
      textureKey: 'STONE',
      shape: 'slab',
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 },
      placeable: true
    },
    231: {
      name: 'Cobblestone Slab',
      id: 231,
      textured: true,
      textureKey: 'COBBLESTONE',
      shape: 'slab',
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 },
      placeable: true
    },
    232: {
      name: 'Mossy Cobblestone Slab',
      id: 232,
      textured: true,
      textureKey: 'MOSSY_COBBLESTONE',
      shape: 'slab',
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 },
      placeable: true
    },
    233: {
      name: 'Stone Brick Slab',
      id: 233,
      textured: true,
      textureKey: 'STONE_BRICK_BLOCK',
      shape: 'slab',
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 },
      placeable: true
    },
    234: {
      name: 'Cracked Stone Brick Slab',
      id: 234,
      textured: true,
      textureKey: 'CRACKED_STONE_BRICK',
      shape: 'slab',
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 },
      placeable: true
    },
    235: {
      name: 'Smooth Stone Slab',
      id: 235,
      textured: true,
      textureKey: 'SMOOTH_STONE_BLOCK',
      shape: 'slab',
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 },
      placeable: true
    },
    236: {
      name: 'Sandstone Slab',
      id: 236,
      textured: true,
      textureKey: 'SANDSTONE',
      textureByFace: {
        top: 'SANDSTONE_TOP',
        bottom: 'SANDSTONE_BOTTOM',
        posX: 'SANDSTONE',
        negX: 'SANDSTONE',
        posZ: 'SANDSTONE',
        negZ: 'SANDSTONE'
      },
      shape: 'slab',
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 },
      placeable: true
    },
    237: {
      name: 'Smooth Sandstone Slab',
      id: 237,
      textured: true,
      textureKey: 'SMOOTH_SANDSTONE_BLOCK',
      shape: 'slab',
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 },
      placeable: true
    },
    238: {
      name: 'Jungle Planks Slab',
      id: 238,
      textured: true,
      textureKey: 'JUNGLE_PLANKS',
      shape: 'slab',
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 },
      placeable: true
    },
    239: {
      name: 'Bamboo Planks Slab',
      id: 239,
      textured: true,
      textureKey: 'BAMBOO_PLANKS_SIDE',
      textureByFace: {
        top: 'BAMBOO_PLANKS_TOP',
        bottom: 'BAMBOO_PLANKS_TOP',
        posX: 'BAMBOO_PLANKS_SIDE',
        negX: 'BAMBOO_PLANKS_SIDE',
        posZ: 'BAMBOO_PLANKS_SIDE',
        negZ: 'BAMBOO_PLANKS_SIDE'
      },
      shape: 'slab',
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 },
      placeable: true
    },
    17: { name: 'Cobblestone', id: 17, textured: true, textureKey: 'COBBLESTONE' },
    113: { name: 'Mossy Cobblestone', id: 113, textured: true, textureKey: 'MOSSY_COBBLESTONE', color: 0x6f8d5b },
    22: { name: 'torch', id: 22, textured: true, textureKey: 'TORCH', transparent: true, opacity: 1 },
    102: { name: 'chiseled stone bricks', id: 102, textured: true, textureKey: 'CHISELED_STONE_BRICK' },
    104: { name: 'Amethyst Block', id: 104, textured: true, textureKey: 'AMETHYST_BLOCK' },
    105: { name: 'Chalk', id: 105, textured: true, textureKey: 'CHALK_BLOCK' },
    106: { name: 'Basalt', id: 106, textured: true, textureKey: 'BASALT_BLOCK' },
    108: { name: 'Melon Block', id: 108, textured: true, 
      textureKey: 'MELON_SIDE',
           textureByFace: {
        top: 'MELON_TOP',
        bottom: 'MELON_TOP',
        posX: 'MELON_SIDE',
        negX: 'MELON_SIDE',
        posZ: 'MELON_SIDE',
        negZ: 'MELON_SIDE'
      }
         },
    119: { name: 'Glowstone', id: 119, textured: true, textureKey: 'GLOWSTONE', color: 0xf5c15b, emissive: 0xffd27a, lightRadius: 13, lightIntensity: 1.25 },
    222: { name: 'game1k block', id: 222, textured: true, textureKey: 'game1k', },
    
    /*Glass*/
    26: { name: 'Glass', id: 26, textured: true, textureKey: 'GLASS_BLOCK', transparent: true, opacity: 0.8 },
    79: { name: 'Black Glass', id: 79, textured: true, textureKey: 'BLACK_STAINED_GLASS', transparent: true, opacity: 0.8 },
    80: { name: 'Green Glass', id: 80, textured: true, textureKey: 'GREEN_STAINED_GLASS', transparent: true, opacity: 0.8 },
    
    /*Important later*/
    39: { name: 'Obsidian Block', id: 39, textured: true, textureKey: 'OBSIDIAN_BLOCK' },

    /* Well, valuable ore blocks*/
    45: { name: 'Diamond Block', id: 45, textured: true, textureKey: 'DIAMOND_BLOCK' },
    55: { name: 'Emerald Block', id: 55, textured: true, textureKey: 'EMERALD_BLOCK' },
    20: { name: 'Coal Block', id: 20, textured: true, textureKey: 'COAL_BLOCK' },
    68: { name: 'Steel Block', id: 68, textured: true, textureKey: 'STEEL_BLOCK' },
    
    /*Utility*/
       9: {
      name: 'Crafting Table',
      id: 9,
      textured: true,
      textureKey: 'CRAFTING_TABLE_SIDE',
      textureByFace: {
        top: 'CRAFTING_TABLE_TOP',
        bottom: 'OAK_PLANK',
        posX: 'CRAFTING_TABLE_FRONT',
        negX: 'CRAFTING_TABLE_FRONT_ALT',
        posZ: 'CRAFTING_TABLE_SIDE',
        negZ: 'CRAFTING_TABLE_SIDE_ALT'
      }
    },

       23: { 
      name: 'Furnace', 
      id: 23, 
      textured: true, 
      textureKey: 'FURNACE',  
      textureByFace: {
        top: 'FURNACE_TOP',
        bottom: 'COBBLESTONE',
        posX: 'FURNACE_FRONT',
        negX: 'FURNACE_SIDE',
        posZ: 'FURNACE_SIDE',
        negZ: 'FURNACE_SIDE'
      } 
    },
    82: {
      name: 'Chest',
      id: 82,
      textured: true,
      textureKey: 'CHEST_NORMAL',
      textureByFace: {
        top: 'CHEST_NORMAL',
        bottom: 'CHEST_NORMAL',
        posX: 'CHEST_NORMAL',
        negX: 'CHEST_NORMAL',
        posZ: 'CHEST_NORMAL',
        negZ: 'CHEST_NORMAL'
      },
      uvAtlasSize: 64,
      textureUvByFace: {
        top: [16, 0, 16, 16],
        bottom: [32, 0, 16, 16],
        posX: [0, 16, 16, 16],
        negX: [32, 16, 16, 16],
        posZ: [16, 16, 16, 16],
        negZ: [48, 16, 16, 16]
      },
      doubleChest: {
        leftTextureKey: 'CHEST_NORMAL_LEFT',
        rightTextureKey: 'CHEST_NORMAL_RIGHT'
      }
    },

    71: {
  name: 'Lit Furnace',
  id: 71,
  textured: true,
  textureKey: 'FURNACE',
  textureByFace: {
    top: 'FURNACE_TOP',
    bottom: 'COBBLESTONE',
    posX: 'FURNACE_FRONT_LIT',
    negX: 'FURNACE_SIDE',
    posZ: 'FURNACE_SIDE',
    negZ: 'FURNACE_SIDE'
  }
},
    /*Ice*/
    81: { name: 'Packed ice', id: 81, textured: true, textureKey: 'PACKED_ICE' },
    91: { name: 'Blue Ice', id: 91, textured: true, textureKey: 'BLUE_ICE' },
    
    /*Stone*/
     21: { name: 'Stone Brick', id: 21, textured: true, textureKey: 'STONE_BRICK_BLOCK' },
     24: { name: 'Cracked Stone Brick', id: 24, textured: true, textureKey: 'CRACKED_STONE_BRICK' },
     27: { name: 'Smooth Stone', id: 27, textured: true, textureKey: 'SMOOTH_STONE_BLOCK' }, 

    /*Sandstone*/
      29: {
      name: 'Smooth SandStone', 
      id: 29, 
      textured: true, 
      textureKey: 'SMOOTH_SANDSTONE_BLOCK',
    },
    
    /* Raw block*/
    36: { name: 'Raw copper block', id: 36, textured: true, textureKey: 'RAW_COPPER_BLOCK' },
    41: { name: 'Raw Gold Block', id: 41, textured: true, textureKey: 'RAW_GOLD_BLOCK' },
    32: { name: 'Block of raw iron', id: 32, textured: true, textureKey: 'RAW_IRON_BLOCK' },
    
    /* Copper*/
    34: { name: 'Copper Block', id: 34, textured: true, textureKey: 'COPPER_BLOCK' },
    37: { name: 'Weathered Copper Block', id: 37, textured: true, textureKey: 'WEATHERED_COPPER_BLOCK' },
    76: { name: 'Copper Grate Block', id: 76, textured: true, textureKey: 'COPPER_GRATE', transparent: true, opacity: 1 },
    77: { name: 'Chiseled Copper Block', id: 77, textured: true, textureKey: 'CHISELED_COPPER' },
    78: { name: 'Cut Copper Block', id: 78, textured: true, textureKey: 'CUT_COPPER' },
    
    /* water*/
    4: { name: 'Water', id: 4, transparent: true, opacity: 0.9, textured: true, textureKey: 'WATER' },
    47: { name: 'Flowing Water', id: 47, transparent: true, opacity: 0.9, textured: true, textureKey: 'WATER' },
    48: { name: 'Flowing Water', id: 48, transparent: true, opacity: 0.9, textured: true, textureKey: 'WATER' },
    49: { name: 'Flowing Water', id: 49, transparent: true, opacity: 0.9, textured: true, textureKey: 'WATER' },
    50: { name: 'Flowing Water', id: 50, transparent: true, opacity: 0.9, textured: true, textureKey: 'WATER' },
    51: { name: 'Flowing Water', id: 51, transparent: true, opacity: 0.9, textured: true, textureKey: 'WATER' },
    52: { name: 'Flowing Water', id: 52, transparent: true, opacity: 0.9, textured: true, textureKey: 'WATER' },
    53: { name: 'Flowing Water', id: 53, transparent: true, opacity: 0.9, textured: true, textureKey: 'WATER' },

    /*Flowing lava*/
    33: { name: 'Lava', id: 33, textured: true, textureKey: 'LAVA_LIQUID' },
    60: { name: 'Flowing Lava', id: 60, textured: true, textureKey: 'LAVA_LIQUID' },
    61: { name: 'Flowing Lava', id: 61, textured: true, textureKey: 'LAVA_LIQUID' },
    62: { name: 'Flowing Lava', id: 62, textured: true, textureKey: 'LAVA_LIQUID' },
    63: { name: 'Flowing Lava', id: 63, textured: true, textureKey: 'LAVA_LIQUID' },
    64: { name: 'Flowing Lava', id: 64, textured: true, textureKey: 'LAVA_LIQUID' },
    65: { name: 'Flowing Lava', id: 65, textured: true, textureKey: 'LAVA_LIQUID' },
    66: { name: 'Flowing Lava', id: 66, textured: true, textureKey: 'LAVA_LIQUID' },
    
    /*ORes*/
    54: { name: 'Emerald ore', id: 54, textured: true, textureKey: 'EMERALD_ORE' },
    40: { name: 'Gold Ore', id: 40, textured: true, textureKey: 'GOLD_ORE_BLOCK' },
    43: { name: 'Diamond Ore', id: 43, textured: true, textureKey: 'DIAMOND_ORE' },
    35: { name: 'Copper ore', id: 35, textured: true, textureKey: 'COPPER_ORE' },
    18: { name: 'Coal Ore', id: 18, textured: true, textureKey: 'COAL_ORE_BLOCK' },
    30: { name: 'Iron Ore Block', id: 30, textured: true, textureKey: 'IRON_ORE_BLOCK' },
    
    /*Dyes*/
    57: { name: 'Black Dye', id: 57, textured: true, textureKey: 'BLACK_DYE' },
    58: { name: 'Green Dye', id: 58, textured: true, textureKey: 'GREEN_DYE' },
    107: { name: 'White Dye', id: 107, textured: true, textureKey: 'WHITE_DYE' },
    120: { name: 'Pink Dye', id: 120, textured: true, textureKey: 'PINK_DYE' },
    126: { name: 'Yellow Dye', id: 126, textured: true, textureKey: 'YELLOW_DYE' },
    134: { name: 'Red Dye', id: 134, textured: true, textureKey: 'RED_DYE' },
    135: { name: 'Purple Dye', id: 135, textured: true, textureKey: 'PURPLE-DYE' },
    136: { name: 'Light Blue Dye', id: 136, textured: true, textureKey: 'LIGHT_BLUE_DYE' },
    137: { name: 'Blue Dye', id: 137, textured: true, textureKey: 'BLUE_DYE' },
    138: { name: 'Lime Dye', id: 138, textured: true, textureKey: 'LIME_DYE' },
    139: { name: 'Orange Dye', id: 139, textured: true, textureKey: 'ORANGE_DYE' },
    140: { name: 'Magenta Dye', id: 140, textured: true, textureKey: 'MAGENTA_DYE' },
    141: { name: 'Cyan dye', id: 141, textured: true, textureKey: 'CYAN_DYE' },
    142: { name: 'Gray Dye', id: 142, textured: true, textureKey: 'GRAY_DYE' },
    143: { name: 'light Grey Dye', id: 143, textured: true, textureKey: 'LIGHT_GRAY_DYE' },
    144: { name: 'Brown Dye', id: 144, textured: true, textureKey: 'BROWN_DYE' },
     

    /*Items*/
    56: { name: 'Emerald', id: 56, textured: true, textureKey: 'EMERALD' },
    46: { name: 'Flint', id: 46, textured: true, textureKey: 'FLINT' },
    31: { name: 'Raw Iron', id: 31, textured: true, textureKey: 'IRON_ORE' },
    38: { name: 'Raw Copper', id: 38, textured: true, textureKey: 'RAW_COPPER_ITEM' },
    10: { name: 'Stick', id: 10, textured: true, textureKey: 'STICK' },
    16: { name: 'Snowball', id: 16, textured: true, textureKey: 'SNOWBALL', color: 0xe7eefc },
    25: { name: 'Charcoal', id: 25, textured: true, textureKey: 'CHARCOAL' },
    42: { name: 'Raw Gold', id: 42, textured: true, textureKey: 'GOLD_ORE' },
    44: { name: 'Diamond', id: 44, textured: true, textureKey: 'DIAMOND' },
    19: { name: 'Coal', id: 19, textured: true, textureKey: 'COAL' },
    67: { name: 'steel ingot', id: 67, textured: true, textureKey: 'STEEL_INGOT' }, 
    69: { name: 'copper ingot', id: 69, textured: true, textureKey: 'COPPER_INGOT' },
    70: { name: 'Gold ingot', id: 70, textured: true, textureKey: 'GOLD_INGOT' },

    /*Tools*/
    11: { name: 'Wooden Pickaxe', id: 11, textured: true, textureKey: 'WOODEN_PICKAXE', toolType: 'pickaxe', tier: 1 },
    12: { name: 'Stone Pickaxe', id: 12, textured: true, textureKey: 'STONE_PICKAXE', toolType: 'pickaxe', tier: 2  },
    72: { name: 'Gold Pickaxe', id: 72, textured: true, textureKey: 'GOLDEN_PICKAXE', toolType: 'pickaxe', tier: 3 },
    73: { name: 'Copper Pickaxe', id: 73, textured: true, textureKey: 'COPPER_PICKAXE', toolType: 'pickaxe', tier: 4 },
    74: { name: 'Iron Pickaxe', id: 74, textured: true, textureKey: 'IRON_PICKAXE', toolType: 'pickaxe', tier: 5 },
    75: { name: 'Diamond Pickaxe', id: 75, textured: true, textureKey: 'DIAMOND_PICKAXE', toolType: 'pickaxe', tier: 6 },
    93: { name: 'Emerald Pickaxe', id: 93, textured: true, textureKey: 'EMERALD_PICKAXE', toolType: 'pickaxe', tier: 7 },
    127: { name: 'Wooden Axe', id: 127, textured: true, textureKey: 'WOODEN_AXE', toolType: 'axe', tier: 1 },
    128: { name: 'Stone Axe', id: 128, textured: true, textureKey: 'STONE_AXE', toolType: 'axe', tier: 2 },
    129: { name: 'Gold Axe', id: 129, textured: true, textureKey: 'GOLDEN_AXE', toolType: 'axe', tier: 3 },
    130: { name: 'Copper Axe', id: 130, textured: true, textureKey: 'COPPER_AXE', toolType: 'axe', tier: 4 },
    131: { name: 'Iron Axe', id: 131, textured: true, textureKey: 'IRON_AXE', toolType: 'axe', tier: 5 },
    132: { name: 'Diamond Axe', id: 132, textured: true, textureKey: 'DIAMOND_AXE', toolType: 'axe', tier: 6 },
    133: { name: 'Emerald Axe', id: 133, textured: true, textureKey: 'EMERALD_AXE', toolType: 'axe', tier: 7 },
    121: { name: 'Wooden Dagger', id: 121, textured: true, textureKey: 'WOOD_DAGGER', toolType: 'dagger', tier: 1, meleeDamage: 3, attackRange: 1.5 },
    122: { name: 'Stone Dagger', id: 122, textured: true, textureKey: 'STONE_DAGGER', toolType: 'dagger', tier: 2, meleeDamage: 3.5, attackRange: 1.5 },
    123: { name: 'Gold Dagger', id: 123, textured: true, textureKey: 'GOLD_DAGGER', toolType: 'dagger', tier: 3, meleeDamage: 3.25, attackRange: 1.5 },
    124: { name: 'Steel Dagger', id: 124, textured: true, textureKey: 'STEEL_DAGGER', toolType: 'dagger', tier: 5, meleeDamage: 4.5, attackRange: 1.5 },
    125: { name: 'Emerald Dagger', id: 125, textured: true, textureKey: 'EMERALD_DAGGER', toolType: 'dagger', tier: 7, meleeDamage: 5, attackRange: 1.5 },

    //SHovel
    83: { name: 'Wooden Shovel', id: 83, textured: true, textureKey: 'WOODEN_SHOVEL', toolType: 'shovel', tier: 1 },
    84: { name: 'Stone Shovel', id: 84, textured: true, textureKey: 'STONE_SHOVEL', toolType: 'shovel', tier: 2 },
    85: { name: 'Gold Shovel', id: 85, textured: true, textureKey: 'GOLDEN_SHOVEL', toolType: 'shovel', tier: 3 },
    86: { name: 'Copper Shovel', id: 86, textured: true, textureKey: 'COPPER_SHOVEL', toolType: 'shovel', tier: 4 },
    87: { name: 'Iron Shovel', id: 87, textured: true, textureKey: 'IRON_SHOVEL', toolType: 'shovel', tier: 5 },
    88: { name: 'Diamond Shovel', id: 88, textured: true, textureKey: 'DIAMOND_SHOVEL', toolType: 'shovel', tier: 6 },
    94: { name: 'Emerald Shovel', id: 94, textured: true, textureKey: 'EMERALD_SHOVEL', toolType: 'shovel', tier: 7 },
    
    89: { name: 'Raw Porkchop', id: 89, textured: true, textureKey: 'PORKCHOP_RAW' },
    90: { name: 'Cooked Porkchop', id: 90, textured: true, textureKey: 'PORKCHOP_COOKED' },
    92: { name: 'Rotten Flesh', id: 92, textured: true, textureKey: 'ROTTEN_FLESH' },
    95: { name: 'Bone', id: 95, textured: true, textureKey: 'BONE' },
    99: { name: 'Bamboo Shoot', id: 99, textured: true, textureKey: 'BAMBOO_STAGE0', transparent: true, opacity: 1 },
    100: { name: 'Bamboo Young', id: 100, textured: true, textureKey: 'BAMBOO_STAGE0', transparent: true, opacity: 1 },
    101: { name: 'Bamboo Stalk', id: 101, textured: true, textureKey: 'BAMBOO_STALK', transparent: true, opacity: 1 },
    109: { name: 'Melon Slice', id: 109, textured: true, textureKey: 'MELON_SLICE' },
    110: { name: 'Pumpkin', id: 110, textured: true,
          textureKey: 'PUMPKIN_TOP',  
      textureByFace: {
        top: 'PUMPKIN_TOP',
        bottom: 'PUMPKIN_BOTTOM',
        posX: 'PUMPKIN_SIDE',
        negX: 'PUMPKIN_SIDE',
        posZ: 'PUMPKIN_SIDE',
        negZ: 'PUMPKIN_SIDE'
      } },
    111: { name: 'Pumpkin Slice', id: 111, textured: true, textureKey: 'PUMPKIN_SLICE' },
    112: { name: 'Cooked Pumpkin Slice', id: 112, textured: false, color: 0xe38b1f },
    115: { name: 'Bucket', id: 115, textured: true, textureKey: 'BUCKET', nonStackable: true },
    116: { name: 'Water Bucket', id: 116, textured: true, textureKey: 'WATER_BUCKET', nonStackable: true },
    117: { name: 'Lava Bucket', id: 117, textured: true, textureKey: 'LAVA_BUCKET', nonStackable: true },
    118: { name: 'Glowstone Dust', id: 118, textured: true, textureKey: 'GLOWSTONE_DUST' },
  }; 

  const blockMaterials = {
    ...baseBlockMaterials,
    ...(sideConfig.SIDE_BLOCK_MATERIALS || sideConfig.FLOWER_BLOCK_MATERIALS || {}),
  };

  const solidBlocks = [1, 2, 3, 5, 6, 7, 8, 9, 13, 14, 15, 17, 18, 20, 21, 23, 24, 26, 27, 28, 29, 30, 32, 34, 35, 36, 37, 39, 40, 41, 43, 45, 54, 55, 59, 68, 71, 76, 77, 78, 79, 80, 81, 82, 91, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 108, 110, 113, 114, 119, 222 ];

  window.SingleplayerConfig = {
    CHUNK_SIZE, CHUNK_HEIGHT, WORLD_RADIUS, BLOCK_SIZE, SEA_LEVEL, BASE_LAND_Y, ISLAND_RADIUS,
    CAVE_SCALE, CAVE_THRESHOLD, CAVE_MIN_Y, CAVE_MAX_Y_OFFSET,
    PLAYER_HEIGHT, PLAYER_RADIUS, GRAVITY, JUMP_POWER,
    INV_COLS, INV_ROWS, HOTBAR_SLOTS, TOTAL_INV_SIZE,
    REPO_BASE_PREFIX,
    WORLD_GEN_SETTINGS,
    ASSET_FILEPATHS: {
      ...ASSET_FILEPATHS,
      ...(sideConfig.SIDE_ASSET_FILEPATHS || sideConfig.FLOWER_ASSET_FILEPATHS || {}),
    }, blockMaterials,
    SIDE_RENDER_BLOCK_IDS: sideConfig.SIDE_RENDER_BLOCK_IDS || sideConfig.FLOWER_IDS || [],
    FLOWER_SPAWN_CONFIG: sideConfig.FLOWER_SPAWN_CONFIG || {},
    SOLID_BLOCKS: solidBlocks,
    LIQUID_BLOCKS: [4, 33, 47, 48, 49, 50, 51, 52, 53, 60, 61, 62, 63, 64, 65, 66],
    DEFAULT_PLAYER: {
      moveSpeed: 0.12,
      sprintMultiplier: 1.7,
      rotationSpeed: 0.002,
      health: 20,
      maxHealth: 20,
    },
  };
})();
