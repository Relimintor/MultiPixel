(function () {
  const PICKAXE_BY_ITEM_ID = {
    11: { name: 'Wooden Pickaxe', tier: 1, hardBlockSpeed: 0.56, utilityBlockSpeed: 1.08, softBlockPenalty: 1.18 },
    12: { name: 'Stone Pickaxe', tier: 2, hardBlockSpeed: 0.38, utilityBlockSpeed: 0.94, softBlockPenalty: 1.08 },
    72: { name: 'Gold Pickaxe', tier: 3, hardBlockSpeed: 0.10, utilityBlockSpeed: 0.52, softBlockPenalty: 0.84 },
    73: { name: 'Copper Pickaxe', tier: 4, hardBlockSpeed: 0.30, utilityBlockSpeed: 0.82, softBlockPenalty: 0.98 },
    74: { name: 'Iron Pickaxe', tier: 5, hardBlockSpeed: 0.18, utilityBlockSpeed: 0.68, softBlockPenalty: 0.90 },
    75: { name: 'Diamond Pickaxe', tier: 6, hardBlockSpeed: 0.14, utilityBlockSpeed: 0.58, softBlockPenalty: 0.84 },
    93: { name: 'Emerald Pickaxe', tier: 7, hardBlockSpeed: 0.12, utilityBlockSpeed: 0.50, softBlockPenalty: 0.78 },
  };

  const AXE_BY_ITEM_ID = {
    127: { name: 'Wooden Axe', tier: 1, woodBlockSpeed: 0.56, nonWoodPenalty: 1.08 },
    128: { name: 'Stone Axe', tier: 2, woodBlockSpeed: 0.38, nonWoodPenalty: 1.08 },
    129: { name: 'Gold Axe', tier: 3, woodBlockSpeed: 0.10, nonWoodPenalty: 1.06 },
    130: { name: 'Copper Axe', tier: 4, woodBlockSpeed: 0.30, nonWoodPenalty: 1.06 },
    131: { name: 'Iron Axe', tier: 5, woodBlockSpeed: 0.18, nonWoodPenalty: 1.04 },
    132: { name: 'Diamond Axe', tier: 6, woodBlockSpeed: 0.14, nonWoodPenalty: 1.02 },
    133: { name: 'Emerald Axe', tier: 7, woodBlockSpeed: 0.12, nonWoodPenalty: 1.0 },
  };

  const SHOVEL_BY_ITEM_ID = {
    83: { name: 'Wooden Shovel', tier: 1, softBlockSpeed: 0.54, hardBlockPenalty: 1.22 },
    84: { name: 'Stone Shovel', tier: 2, softBlockSpeed: 0.40, hardBlockPenalty: 1.22 },
    85: { name: 'Gold Shovel', tier: 3, softBlockSpeed: 0.16, hardBlockPenalty: 1.2 },
    86: { name: 'Copper Shovel', tier: 4, softBlockSpeed: 0.34, hardBlockPenalty: 1.2 },
    87: { name: 'Iron Shovel', tier: 5, softBlockSpeed: 0.22, hardBlockPenalty: 1.18 },
    88: { name: 'Diamond Shovel', tier: 6, softBlockSpeed: 0.15, hardBlockPenalty: 1.15 },
    94: { name: 'Emerald Shovel', tier: 7, softBlockSpeed: 0.10, hardBlockPenalty: 1.10 },
  };

  const HARD_BLOCKS = new Set([3, 13, 21, 24, 27, 29, 18, 30, 35, 40, 43, 54, 17, 20, 32, 34, 36, 37, 41, 45, 55, 68, 23, 71, 39, 104, 106]);
  const SOFT_BLOCKS = new Set([1,2,7,15,28]);
  const WOOD_BLOCKS = new Set([5, 8, 9, 82, 96, 98, 101, 103, 110, 114]);

  function getEquippedPickaxe(item) {
    if (!item) return null;
    return PICKAXE_BY_ITEM_ID[item.id] || null;
  }

  function getEquippedTool(item) {
    if (!item) return null;
    const pickaxe = PICKAXE_BY_ITEM_ID[item.id];
    if (pickaxe) return { ...pickaxe, toolType: 'pickaxe' };
    const shovel = SHOVEL_BY_ITEM_ID[item.id];
    if (shovel) return { ...shovel, toolType: 'shovel' };
    const axe = AXE_BY_ITEM_ID[item.id];
    if (axe) return { ...axe, toolType: 'axe' };
    return null;
  }

  function getMiningTimeMs(blockId, hardness, equippedTool) {
    if (!isFinite(hardness)) return Infinity;
    const baseMs = hardness * 900;
    const isHard = HARD_BLOCKS.has(blockId);
    const isSoft = SOFT_BLOCKS.has(blockId);

    if (!equippedTool) {
      if (isHard) return baseMs * 2.9;
      return baseMs;
    }

    if (equippedTool.toolType === 'pickaxe') {
      if (isHard) return baseMs * equippedTool.hardBlockSpeed;
      if (isSoft) return baseMs * equippedTool.softBlockPenalty;
      return baseMs * equippedTool.utilityBlockSpeed;
    }

    if (equippedTool.toolType === 'shovel') {
      if (isSoft) return baseMs * equippedTool.softBlockSpeed;
      return baseMs * equippedTool.hardBlockPenalty;
    }

    if (equippedTool.toolType === 'axe') {
      if (WOOD_BLOCKS.has(blockId)) return baseMs * equippedTool.woodBlockSpeed;
      return baseMs * equippedTool.nonWoodPenalty;
    }

    return baseMs;
  }

  function getDrop(blockId) {
    if (blockId === 3) return { id: 17, count: 1 };
    if (blockId === 15) return { id: 16, count: 2 };
    if (blockId === 18) return { id: 19, count: 1 };
    if (blockId === 30) return { id: 31, count: 1 };
    if (blockId === 1) return { id: 2, count: 1};
    if (blockId === 35) {
      const amount = Math.floor(Math.random() * 5) + 1;
      return { id: 38, count: amount };
    }
    if (blockId === 40) return { id: 42, count: 1};
    if (blockId === 43) return { id: 44, count: 1};
    if (blockId === 54) return { id: 56, count: 1};
    if (blockId === 28) {
      if (Math.random() < 0.5) return { id: 46, count: 1 };
      return { id: 28, count: 1 };
    }
    if (blockId === 99 || blockId === 100) return { id: 101, count: 1 };
    if (blockId === 107) return { id: 110, count: 1 };
    if (blockId === 108) return { id: 109, count: 9 };
    return { id: blockId, count: 1 };
  }

  window.PickaxeSystem = {
    getEquippedPickaxe,
    getEquippedTool,
    getMiningTimeMs,
    getDrop,
    HARD_BLOCKS,
    SOFT_BLOCKS,
    WOOD_BLOCKS,
  };
})();
