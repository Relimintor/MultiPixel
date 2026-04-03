(function () {
  // Hardness grades: 0 = instant, -1 = unbreakable, 1..50 normal grades.
  const HARDNESS_BY_BLOCK_ID = {
    0: 0,
    1: 5,   // Grass
    2: 4,   // Dirt
    3: 9,   // Stone
    4: 0,   // Water
    5: 8,   // Wood Log
    6: 2,   // Leaves
    7: 5,   // Sand
    8: 6,   // Oak Planks
    114: 4, // Wooden slab
    230: 8, // Stone slab
    231: 8, // Cobblestone slab
    232: 8, // Mossy cobblestone slab
    233: 10, // Stone brick slab
    234: 10, // Cracked stone brick slab
    235: 10, // Smooth stone slab
    236: 9, // Sandstone slab
    237: 10, // Smooth sandstone slab
    238: 5, // Jungle planks slab
    239: 5, // Bamboo planks slab
    9: 8,   // Crafting table
    13: 10, // Sandstone
    14: -1, // Bedrock
    15: 2,  // Snow block
    17: 9,  // Cobblestone
    18: 9,  // Coal ore
    20: 12, // Coal block
    21: 11, // Stone brick
    23: 12, // Furnace
    24: 11,
    27: 11,
    28: 4,
    29: 11,
    30: 12, // Iron ore
    32: 14,
    34: 13,
    35: 13, // Copper ore
    36: 14,
    37: 14,
    39: 50, // Obsidian
    40: 14,
    41: 14,
    43: 16,
    45: 16,
    54: 16,
    55: 16,
    59: 1,
    68: 16,
    71: 12,
    76: 12,
    77: 12,
    78: 12,
    79: 3,
    80: 3,
    81: 4,
    82: 8,  // Chest
    91: 2.5,
    99: 1,
    100: 1,
    101: 1,
    102: 11, // Chiseled stone bricks
    103: 6,  // Bamboo planks
    104: 12, // Amethyst block
    105: 5,  // Chalk
    106: 14, // Basalt
    107: 2,  // Pumpkin block
    108: 2,  // Melon block
    119: 8,  // Glowstone
    241: 10, // Red sandstone
    242: 5,  // Red sand
    243: 8,  // Terracotta
    244: 8,  // White terracotta
    245: 8,  // Light gray terracotta
    246: 8,  // Brown terracotta
    247: 8,  // Yellow terracotta
    248: 8,  // Orange terracotta
    249: 8,  // Red terracotta
  };

  function getHardness(blockId) {
    const grade = HARDNESS_BY_BLOCK_ID[blockId];
    if (typeof grade !== 'number') return 6;
    return grade;
  }

  function toLegacyHardness(hardnessGrade) {
    if (hardnessGrade < 0) return Infinity;
    if (hardnessGrade === 0) return 0;
    return Math.max(0.2, hardnessGrade / 5);
  }

  window.BlockHardnessSystem = {
    HARDNESS_BY_BLOCK_ID,
    getHardness,
    toLegacyHardness,
  };
})();
