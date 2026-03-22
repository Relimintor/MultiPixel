(function () {

  const WATER_SOURCE = 4;
  const MAX_HORIZONTAL = 7;
  const FLOW_DELAY = 3;
  const LEGACY_FLOW_START = 47;
  const LEGACY_FLOW_END = 53;
  const flowingDistanceByPos = new Map();

  function shuffledDirs(randomFn) {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    return dirs;
  }

  function keyOf(x, y, z) {
    return `${x},${y},${z}`;
  }

  function isLegacyFlowing(id) {
    return id >= LEGACY_FLOW_START && id <= LEGACY_FLOW_END;
  }

  function getFlowingDistance(x, y, z) {
    return flowingDistanceByPos.get(keyOf(x, y, z)) ?? 0;
  }

  function setFlowingDistance(x, y, z, distance) {
    const key = keyOf(x, y, z);
    if (distance > 0) flowingDistanceByPos.set(key, Math.min(MAX_HORIZONTAL, distance));
    else flowingDistanceByPos.delete(key);
  }

  function adoptLegacyFlowState(wx, wy, wz, id, setBlock) {
    if (!isLegacyFlowing(id)) return false;
    const distance = Math.max(1, Math.min(MAX_HORIZONTAL, id - LEGACY_FLOW_START + 1));
    setFlowingDistance(wx, wy, wz, distance);
    setBlock(wx, wy, wz, WATER_SOURCE);
    return true;
  }

  function getCurrentDistance(wx, wy, wz) {
    return getFlowingDistance(wx, wy, wz);
  }

  function hasStrongerNeighborSupply(wx, wy, wz, getBlock, currentDistance) {
    if (getBlock(wx, wy + 1, wz) === WATER_SOURCE) return true;
    const neighborDistances = [
      getCurrentDistance(wx + 1, wy, wz),
      getCurrentDistance(wx - 1, wy, wz),
      getCurrentDistance(wx, wy, wz + 1),
      getCurrentDistance(wx, wy, wz - 1),
    ];
    for (const d of neighborDistances) {
      if (d === 0) return true; // adjacent source
      if (d > 0 && d + 1 <= currentDistance) return true;
    }
    return false;
  }

  function tryUpdate(ctx) {
    const { wx, wy, wz, getBlock, setBlock, gameTick, random } = ctx;

    const id = getBlock(wx, wy, wz);
    if (id !== WATER_SOURCE && !isLegacyFlowing(id)) return false;

    let changed = false;
    if (adoptLegacyFlowState(wx, wy, wz, id, setBlock)) changed = true;

    if ((gameTick + wx + wy + wz) % FLOW_DELAY !== 0) return false;

    const currentDistance = getCurrentDistance(wx, wy, wz);
    if (currentDistance > 0 && !hasStrongerNeighborSupply(wx, wy, wz, getBlock, currentDistance)) {
      setBlock(wx, wy, wz, 0);
      setFlowingDistance(wx, wy, wz, 0);
      return true;
    }

    const below = getBlock(wx, wy - 1, wz);

    if (below === 0) {
      setBlock(wx, wy - 1, wz, WATER_SOURCE);
      setFlowingDistance(wx, wy - 1, wz, 1);
      changed = true;
    }

    if (currentDistance >= MAX_HORIZONTAL) return changed;

    const dirs = shuffledDirs(random || Math.random);
    const nextDistance = Math.min(MAX_HORIZONTAL, (currentDistance || 0) + 1);
    for (const [dx, dz] of dirs) {
      const nx = wx + dx;
      const nz = wz + dz;
      const nid = getBlock(nx, wy, nz);
      if (nid === 0) {
        setBlock(nx, wy, nz, WATER_SOURCE);
        setFlowingDistance(nx, wy, nz, nextDistance);
        changed = true;
        continue;
      }
      if (nid === WATER_SOURCE || isLegacyFlowing(nid)) {
        const existingDistance = getCurrentDistance(nx, wy, nz);
        if (existingDistance > nextDistance) {
          setFlowingDistance(nx, wy, nz, nextDistance);
          changed = true;
        }
      }
    }

    return changed;
  }

  window.WaterPhysics = { tryUpdate };

})();
