(function () {
  const SingleplayerChunkStreamOptimizations = {
    create({
      getYawObject,
      getCurrentChunkLoadRadius,
      getChunkCreationBudgetPerTick,
      getChunkCreationBudgetForce,
      getChunkKey = (cx, cz) => `${cx},${cz}`,
      getChunkEntries,
      hasChunk,
      hasSparseAirChunk,
      createChunk,
      removeChunk,
      CHUNK_SIZE,
      chunkUpdateIntervalMs,
    }) {
      const chunkOffsetsByRadius = new Map();
      let lastChunkUpdateMs = -Infinity;
      let lastChunkCoordX = Number.NaN;
      let lastChunkCoordZ = Number.NaN;

      function isChunkAllAir(data) {
        for (let i = 0; i < data.length; i++) {
          if (data[i] !== 0) return false;
        }
        return true;
      }

      function getChunkOffsetsForRadius(radius) {
        const cached = chunkOffsetsByRadius.get(radius);
        if (cached) return cached;
        const offsets = [];
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            offsets.push({ dx, dz, dist2: dx * dx + dz * dz });
          }
        }
        offsets.sort((a, b) => a.dist2 - b.dist2);
        chunkOffsetsByRadius.set(radius, offsets);
        return offsets;
      }

      function getChunkRetentionRadius() {
        return getCurrentChunkLoadRadius() + 1;
      }

      function ensureChunksAroundPlayer(forceUpdate = false, nowMs = performance.now()) {
        const yawObject = getYawObject();
        if (!yawObject) return;

        const playerChunkX = Math.floor(yawObject.position.x / CHUNK_SIZE);
        const playerChunkZ = Math.floor(yawObject.position.z / CHUNK_SIZE);
        const sameChunk = playerChunkX === lastChunkCoordX && playerChunkZ === lastChunkCoordZ;
        if (!forceUpdate && sameChunk && (nowMs - lastChunkUpdateMs) < chunkUpdateIntervalMs) return;

        lastChunkCoordX = playerChunkX;
        lastChunkCoordZ = playerChunkZ;
        lastChunkUpdateMs = nowMs;

        const loadRadius = getCurrentChunkLoadRadius();
        const keepRadius = getChunkRetentionRadius();
        const budget = forceUpdate ? getChunkCreationBudgetForce() : getChunkCreationBudgetPerTick();

        if (budget > 0) {
          const offsets = getChunkOffsetsForRadius(loadRadius);
          const loadRadiusSq = loadRadius * loadRadius;
          let created = 0;
          for (let i = 0; i < offsets.length && created < budget; i++) {
            const off = offsets[i];
            if (off.dist2 > loadRadiusSq) continue;
            const cx = playerChunkX + off.dx;
            const cz = playerChunkZ + off.dz;
            const chunkKey = getChunkKey(cx, cz);
            if (hasChunk(chunkKey) || hasSparseAirChunk(chunkKey)) continue;
            createChunk(cx, cz);
            created++;
          }
        }

        const chunkKeysToRemove = [];
        const keepRadiusSq = keepRadius * keepRadius;
        for (const [chunkKey, chunkGroup] of getChunkEntries()) {
          const dx = chunkGroup.userData.cx - playerChunkX;
          const dz = chunkGroup.userData.cz - playerChunkZ;
          const dist2 = dx * dx + dz * dz;
          if (dist2 > keepRadiusSq) chunkKeysToRemove.push(chunkKey);
        }

        for (const chunkKey of chunkKeysToRemove) {
          removeChunk(chunkKey);
        }
      }

      return {
        isChunkAllAir,
        getChunkOffsetsForRadius,
        getChunkRetentionRadius,
        ensureChunksAroundPlayer,
      };
    }
  };

  window.SingleplayerChunkStreamOptimizations = SingleplayerChunkStreamOptimizations;
})();
