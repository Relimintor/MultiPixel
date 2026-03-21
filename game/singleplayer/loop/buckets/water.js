(function () {
  const EMPTY_BUCKET_ID = 115;
  const WATER_BUCKET_ID = 116;
  const WATER_SOURCE_ID = 4;

  function tryInteract(ctx) {
    if (!ctx) return false;
    const heldItemId = Number(ctx.heldItemId);
    const target = ctx.targetPos || {};
    const place = ctx.placePos || {};
    const targetBlockId = Number(ctx.targetBlockId);
    const getBlock = typeof ctx.getBlock === 'function' ? ctx.getBlock : () => 0;
    const setBlock = typeof ctx.setBlock === 'function' ? ctx.setBlock : () => false;
    const setSelectedItem = typeof ctx.setSelectedItem === 'function' ? ctx.setSelectedItem : () => false;
    const showGameMessage = typeof ctx.showGameMessage === 'function' ? ctx.showGameMessage : () => {};

    if (heldItemId === EMPTY_BUCKET_ID && targetBlockId === WATER_SOURCE_ID) {
      if (!setBlock(target.wx, target.wy, target.wz, 0)) return false;
      setSelectedItem(WATER_BUCKET_ID, 1);
      showGameMessage('Filled bucket with water.');
      return true;
    }

    if (heldItemId !== WATER_BUCKET_ID) return false;

    if (getBlock(place.wx, place.wy, place.wz) !== 0) return false;
    if (!setBlock(place.wx, place.wy, place.wz, WATER_SOURCE_ID)) return false;
    setSelectedItem(EMPTY_BUCKET_ID, 1);
    showGameMessage('Placed water.');
    return true;
  }

  window.SingleplayerWaterBucket = { tryInteract };
})();
