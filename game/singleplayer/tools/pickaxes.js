(function () {
  const PICKAXE_BY_ITEM_ID = {
    11: { name: 'Wooden Pickaxe', tier: 1, hardBlockSpeed: 0.56, softBlockPenalty: 1 },
    12: { name: 'Stone Pickaxe', tier: 2, hardBlockSpeed: 0.38, softBlockPenalty: 1 },
    72: { name: 'Gold Pickaxe', tier: 3, hardBlockSpeed: 0.10, softBlockPenalty: 1 },
    73: { name: 'Copper Pickaxe', tier: 4, hardBlockSpeed: 0.30, softBlockPenalty: 1 },
    74: { name: 'Iron Pickaxe', tier: 5, hardBlockSpeed: 0.18, softBlockPenalty: 1 },
    75: { name: 'Diamond Pickaxe', tier: 6, hardBlockSpeed: 0.14, softBlockPenalty: 1 },
    93: { name: 'Emerald Pickaxe', tier: 7, hardBlockSpeed: 0.12, softBlockPenalty: 1 },
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
      return baseMs * equippedTool.softBlockPenalty;
    }

    if (equippedTool.toolType === 'shovel') {
      if (isSoft) return baseMs * equippedTool.softBlockSpeed;
      return baseMs * equippedTool.hardBlockPenalty;
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
    return { id: blockId, count: 1 };
  }

  window.PickaxeSystem = {
    getEquippedPickaxe,
    getEquippedTool,
    getMiningTimeMs,
    getDrop,
    HARD_BLOCKS,
    SOFT_BLOCKS,
  };
})();
