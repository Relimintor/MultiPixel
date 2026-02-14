(function () {
  function shuffledDirs(randomFn) {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      const tmp = dirs[i];
      dirs[i] = dirs[j];
      dirs[j] = tmp;
    }
    return dirs;
  }

  function tryUpdate(ctx) {
    const { wx, wy, wz, getBlock, setBlock, swapBlocks, random } = ctx;

    if (wy <= 1) return false;

    const below = getBlock(wx, wy - 1, wz);
    if (below === 0) {
      swapBlocks(wx, wy, wz, wx, wy - 1, wz);
      return true;
    }

    const dirs = shuffledDirs(random || Math.random);
    for (const [dx, dz] of dirs) {
      const nx = wx + dx;
      const nz = wz + dz;
      const side = getBlock(nx, wy, nz);
      if (side === 0) {
        setBlock(nx, wy, nz, 4);
        return true;
      }
    }

    return false;
  }

  window.WaterPhysics = { tryUpdate };
})();
