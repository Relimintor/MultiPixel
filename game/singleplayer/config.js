(function () {
  const CHUNK_SIZE = 16;
  const CHUNK_HEIGHT = 96;
  const WORLD_RADIUS = 13;
  const BLOCK_SIZE = 1;
  const SEA_LEVEL = 18;
  const BASE_LAND_Y = 20;
  const ISLAND_RADIUS = 30;

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

  const ASSET_FILEPATHS = {
    DIRT: getAssetPath('textures/dirt_block.png'),
    STONE: getAssetPath('textures/stone_block.png'),
    LEAVES: getAssetPath('textures/leaf_oak.png'),
    SAND: getAssetPath('textures/sand_block.png'),
    HEART: getAssetPath('ui/heart_full.png'),
    FOOD: getAssetPath('ui/food_full.png'),
    OAK_PLANK: getAssetPath('textures/oak_planks.png'),
    CRAFTING_TABLE_SIDE: getAssetPath('textures/crafting_table_side.png'),
    STICK: getAssetPath('textures/stick.png'),
    SAND_STONE: getAssetPath('textures/sand_stone.png'),
    WOODEN_PICKAXE: getAssetPath('textures/wooden_pickaxe.png'),
    BEDROCK: getAssetPath('textures/bedrock.png'),
  };

  const blockMaterials = {
    0: { name: 'Air', id: 0, textured: false },
    1: { name: 'Grass', id: 1, textured: true, textureKey: 'DIRT' },
    2: { name: 'Dirt', id: 2, textured: true, textureKey: 'DIRT' },
    3: { name: 'Stone', id: 3, textured: true, textureKey: 'STONE' },
    4: { name: 'Water', id: 4, color: 0x1976D2, transparent: true, opacity: 0.7, textured: false },
    5: { name: 'Wood Log', id: 5, color: 0x8B4513, textured: false },
    6: { name: 'Leaves', id: 6, textured: true, textureKey: 'LEAVES', transparent: true, opacity: 0.8 },
    7: { name: 'Sand', id: 7, textured: true, textureKey: 'SAND' },
    8: { name: 'Oak Planks', id: 8, textured: true, textureKey: 'OAK_PLANK' },
    9: { name: 'Crafting Table', id: 9, textured: true, textureKey: 'CRAFTING_TABLE_SIDE' },
    10: { name: 'Stick', id: 10, textured: false, textureKey: 'STICK' },
    11: { name: 'Wooden Pickaxe', id: 11, textured: true, textureKey: 'WOODEN_PICKAXE', toolType: 'pickaxe', tier: 1 },
    12: { name: 'Stone Pickaxe', id: 12, textured: false, color: 0x7F8C8D },
    13: { name: 'Sand stone', id: 13, textured: true, textureKey: 'SAND_STONE' },
    14: { name: 'Bedrock', id: 14, textured: true, textureKey: 'BEDROCK', unbreakable: true },
  };

  window.SingleplayerConfig = {
    CHUNK_SIZE, CHUNK_HEIGHT, WORLD_RADIUS, BLOCK_SIZE, SEA_LEVEL, BASE_LAND_Y, ISLAND_RADIUS,
    CAVE_SCALE, CAVE_THRESHOLD, CAVE_MIN_Y, CAVE_MAX_Y_OFFSET,
    PLAYER_HEIGHT, PLAYER_RADIUS, GRAVITY, JUMP_POWER,
    INV_COLS, INV_ROWS, HOTBAR_SLOTS, TOTAL_INV_SIZE,
    REPO_BASE_PREFIX,
    ASSET_FILEPATHS, blockMaterials,
    SOLID_BLOCKS: [1, 2, 3, 5, 6, 7, 8, 9, 13, 14],
    LIQUID_BLOCKS: [4],
    DEFAULT_PLAYER: {
      moveSpeed: 0.12,
      sprintMultiplier: 1.7,
      rotationSpeed: 0.002,
      health: 20,
      maxHealth: 20,
    },
  };
})();
