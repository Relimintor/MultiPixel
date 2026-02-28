(function () {
  // Tier rule: null = hand drops OK, number = min pickaxe tier for drops.
  const REQUIRED_PICKAXE_TIER = {
    3: null, // Stone mineable by hand
    18: null, // Coal ore mineable by hand
    30: 2, // Iron ore needs stone pickaxe+ for drops
    35: 5, // Copper ore needs iron pickaxe+ for drops
    43: 5, // Diamond ore needs iron pickaxe+ for drops
  };

  function canBreakBlock(blockId, equippedPickaxe) {
    const hardness = window.BlockHardnessSystem?.getHardness
      ? window.BlockHardnessSystem.getHardness(blockId)
      : 1;

    if (hardness < 0) {
      return { canBreak: false, dropsItems: false, reason: 'unbreakable', requiredTier: null };
    }

    const requiredTier = Object.prototype.hasOwnProperty.call(REQUIRED_PICKAXE_TIER, blockId)
      ? REQUIRED_PICKAXE_TIER[blockId]
      : null;

    if (requiredTier === null) {
      return { canBreak: true, dropsItems: true, reason: null, requiredTier };
    }

    const tier = equippedPickaxe?.tier || 0;
    if (tier >= requiredTier) {
      return { canBreak: true, dropsItems: true, reason: null, requiredTier };
    }

    return { canBreak: true, dropsItems: false, reason: 'tool_too_weak', requiredTier };
  }

  function getRequiredTier(blockId) {
    if (!Object.prototype.hasOwnProperty.call(REQUIRED_PICKAXE_TIER, blockId)) return null;
    return REQUIRED_PICKAXE_TIER[blockId];
  }

  window.BlockBreakableSystem = {
    REQUIRED_PICKAXE_TIER,
    canBreakBlock,
    getRequiredTier,
  };
})();
