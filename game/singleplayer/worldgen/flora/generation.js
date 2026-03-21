(function () {
  function createColumnTopGetter(data, chunkSize, chunkHeight, isIgnoredBlock) {
    const idx = (lx, ly, lz) => lx + ly * chunkSize + lz * chunkSize * chunkHeight;
    return function getColumnTop(lx, lz) {
      for (let y = chunkHeight - 2; y >= 1; y--) {
        const block = data[idx(lx, y, lz)];
        if (isIgnoredBlock(block)) continue;
        return y;
      }
      return -1;
    };
  }

  function randIntInclusive(hashRand2D, seedX, seedZ, salt, min, max) {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return lo + Math.floor(hashRand2D(seedX, seedZ, salt) * (hi - lo + 1));
  }

  const SideFloraWorldgen = {
    placeFlowerPatchesInChunk({
      data,
      cx,
      cz,
      hashRand2D,
      getBiome,
      blockMaterials,
      CHUNK_SIZE,
      CHUNK_HEIGHT,
    }) {
      const sideConfig = window.SingleplayerSideConfig || {};
      const featureConfigs = sideConfig.FLOWER_PATCH_FEATURES || {};
      if (!featureConfigs || typeof featureConfigs !== 'object') return 0;

      const centerWX = cx * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
      const centerWZ = cz * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
      const chunkBiome = typeof getBiome === 'function' ? getBiome(centerWX, centerWZ) : null;
      const feature = chunkBiome ? featureConfigs[chunkBiome] : null;
      if (!feature?.flowerIds?.length) return 0;

      const idx = (lx, ly, lz) => lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT;
      const isIgnoredBlock = (blockId) => {
        if (blockId === 0 || blockId === 6) return true;
        return Boolean(blockMaterials?.[blockId]?.renderAs);
      };
      const getColumnTop = createColumnTopGetter(data, CHUNK_SIZE, CHUNK_HEIGHT, isIgnoredBlock);

      const patchesPerChunk = Math.max(0, Math.floor(Number(feature.patchesPerChunk) || 0));
      const triesPerPatch = Math.max(1, Math.floor(Number(feature.tries) || 64));
      const xzSpread = Math.max(1, Math.floor(Number(feature.xzSpread) || 7));
      const ySpread = Math.max(0, Math.floor(Number(feature.ySpread) || 3));
      const substrateIds = new Set(Array.isArray(feature.substrateIds) && feature.substrateIds.length ? feature.substrateIds : [1]);
      let placed = 0;

      for (let patchIndex = 0; patchIndex < patchesPerChunk; patchIndex++) {
        const originLX = Math.floor(hashRand2D(cx * 173 + patchIndex * 11, cz * 197 - patchIndex * 7, 12401) * CHUNK_SIZE);
        const originLZ = Math.floor(hashRand2D(cx * 211 - patchIndex * 13, cz * 227 + patchIndex * 5, 12402) * CHUNK_SIZE);
        const originTopY = getColumnTop(originLX, originLZ);
        if (originTopY < 1 || originTopY >= CHUNK_HEIGHT - 2) continue;
        if (!substrateIds.has(data[idx(originLX, originTopY, originLZ)])) continue;
        const originY = originTopY + 1;

        for (let attempt = 0; attempt < triesPerPatch; attempt++) {
          const targetLX = originLX + randIntInclusive(hashRand2D, cx * 313 + patchIndex * 29 + attempt, cz * 331 - patchIndex * 31 - attempt, 12410, -xzSpread, xzSpread);
          const targetLZ = originLZ + randIntInclusive(hashRand2D, cx * 349 - patchIndex * 17 + attempt, cz * 367 + patchIndex * 19 - attempt, 12411, -xzSpread, xzSpread);
          const targetY = originY + randIntInclusive(hashRand2D, cx * 389 + patchIndex * 23 + attempt, cz * 401 - patchIndex * 37 - attempt, 12412, -ySpread, ySpread);
          if (targetLX < 0 || targetLX >= CHUNK_SIZE || targetLZ < 0 || targetLZ >= CHUNK_SIZE) continue;
          if (targetY < 1 || targetY >= CHUNK_HEIGHT - 1) continue;
          if (data[idx(targetLX, targetY, targetLZ)] !== 0) continue;

          const belowId = data[idx(targetLX, targetY - 1, targetLZ)];
          if (!substrateIds.has(belowId)) continue;

          const flowerId = feature.flowerIds[Math.floor(hashRand2D(cx * 421 + patchIndex * 41 + attempt, cz * 439 - patchIndex * 43 - attempt, 12413) * feature.flowerIds.length)] || 0;
          if (!flowerId) continue;
          if (!blockMaterials?.[flowerId]?.placeable) continue;

          data[idx(targetLX, targetY, targetLZ)] = flowerId;
          placed++;
        }
      }

      return placed;
    },
  };

  window.SideFloraWorldgen = SideFloraWorldgen;
})();
