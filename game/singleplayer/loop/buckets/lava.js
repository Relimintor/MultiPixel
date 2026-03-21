(function () {
  const EMPTY_BUCKET_ID = 115;
  const LAVA_BUCKET_ID = 117;
  const LAVA_SOURCE_ID = 33;

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

    if (heldItemId === EMPTY_BUCKET_ID && targetBlockId === LAVA_SOURCE_ID) {
      if (!setBlock(target.wx, target.wy, target.wz, 0)) return false;
      setSelectedItem(LAVA_BUCKET_ID, 1);
      showGameMessage('Filled bucket with lava.');
      return true;
    }

    if (heldItemId !== LAVA_BUCKET_ID) return false;

    if (getBlock(place.wx, place.wy, place.wz) !== 0) return false;
    if (!setBlock(place.wx, place.wy, place.wz, LAVA_SOURCE_ID)) return false;
    setSelectedItem(EMPTY_BUCKET_ID, 1);
    showGameMessage('Placed lava.');
    return true;
  }

  window.SingleplayerLavaBucket = { tryInteract };
})();
