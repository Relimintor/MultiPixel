(function () {
  function tryUpdate(ctx) {
    const { wx, wy, wz, getBlock, swapBlocks } = ctx;

    if (wy <= 1) return false;

    const below = getBlock(wx, wy - 1, wz);
    if (below === 0 || below === 4) {
      swapBlocks(wx, wy, wz, wx, wy - 1, wz);
      return true;
    }

    return false;
  }

  window.SandPhysics = { tryUpdate };
})();
