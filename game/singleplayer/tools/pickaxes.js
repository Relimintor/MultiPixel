(function () {
  const PICKAXE_BY_ITEM_ID = {
    11: { name: 'Wooden Pickaxe', tier: 1, hardBlockSpeed: 0.56, softBlockPenalty: 1.05 },
    12: { name: 'Stone Pickaxe', tier: 2, hardBlockSpeed: 0.38, softBlockPenalty: 1.02 },
  };

  const HARD_BLOCKS = new Set([3, 13, 17, 14, 20]);

  function getEquippedPickaxe(item) {
    if (!item) return null;
    return PICKAXE_BY_ITEM_ID[item.id] || null;
  }

  function getMiningTimeMs(blockId, hardness, equippedPickaxe) {
    if (!isFinite(hardness)) return Infinity;
    const baseMs = hardness * 900;
    const isHard = HARD_BLOCKS.has(blockId);

    if (isHard) {
      if (!equippedPickaxe) return baseMs * 2.9;
      return baseMs * equippedPickaxe.hardBlockSpeed;
    }

    if (!equippedPickaxe) return baseMs;
    return baseMs * equippedPickaxe.softBlockPenalty;
  }

  function getDrop(blockId) {
    if (blockId === 3) return { id: 17, count: 1 };      // Stone -> Cobblestone
    if (blockId === 15) return { id: 16, count: 2 };     // Snow block -> Snowballs
    if (blockId === 18) return { id: 19, count: 1 };     // Coal ore -> Coal
    return { id: blockId, count: 1 };
  }

  window.PickaxeSystem = {
    getEquippedPickaxe,
    getMiningTimeMs,
    getDrop,
    HARD_BLOCKS,
  };
})();
