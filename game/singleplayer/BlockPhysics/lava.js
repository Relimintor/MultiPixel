(function () {

  const LAVA_SOURCE = 33;
  const FLOW_START = 60;
  const FLOW_END = 66;
  const MAX_HORIZONTAL = 7;
  const FLOW_DELAY = 10;

  function shuffledDirs(randomFn) {
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    return dirs;
  }

  function isFlowing(id) { return id >= FLOW_START && id <= FLOW_END; }
  function getDistance(id) { return id === LAVA_SOURCE ? 0 : id - FLOW_START + 1; }

  function tryUpdate(ctx) {
    const { wx, wy, wz, getBlock, setBlock, gameTick, random } = ctx;
    const id = getBlock(wx, wy, wz);
    if (id !== LAVA_SOURCE && !isFlowing(id)) return false;
    if ((gameTick + wx + wy + wz) % FLOW_DELAY !== 0) return false;

    const below = getBlock(wx, wy - 1, wz);
    if (below === 4 || (below >= 47 && below <= 53)) {
      setBlock(wx, wy - 1, wz, id === LAVA_SOURCE ? 39 : 3); // obsidian/cobble-ish cooling
      if (id !== LAVA_SOURCE) setBlock(wx, wy, wz, 0);
      return true;
    }
    if (below === 0) {
      setBlock(wx, wy - 1, wz, FLOW_START);
      if (id !== LAVA_SOURCE) setBlock(wx, wy, wz, 0);
      return true;
    }


    const distance = getDistance(id);
    if (distance >= MAX_HORIZONTAL) return false;

    let moved = false;
    const dirs = shuffledDirs(random || Math.random);
    for (const [dx, dz] of dirs) {
      const nx = wx + dx;
      const nz = wz + dz;
      const nid = getBlock(nx, wy, nz);
      if (nid === 4 || (nid >= 47 && nid <= 53)) {
        setBlock(nx, wy, nz, id === LAVA_SOURCE ? 39 : 3);
        moved = true;
        continue;
      }
      if (nid === 0) {
        setBlock(nx, wy, nz, FLOW_START + distance);
        moved = true;
      }

    }
    return moved;
  }

  window.LavaPhysics = { tryUpdate };
})();
