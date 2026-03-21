(function () {
  const SingleplayerChunkRemeshOptimizations = {
    create({
      getChunkKey = (cx, cz) => `${cx},${cz}`,
      getChunk,
      updateChunkGeometry,
      meshRebuildBudgetPerFrame,
      meshRebuildBudgetForce,
    }) {
      const dirtyChunkRemeshReasons = new Map();
      const batchedChunkRemeshNeeds = new Map();
      let blockUpdateBatchDepth = 0;

      function computeChunkHash(data) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < data.length; i++) {
          h ^= data[i] & 0xff;
          h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
      }

      function requestChunkRemesh(cx, cz, reason = 'block') {
        const key = getChunkKey(cx, cz);
        const rank = { load: 0, neighbor: 1, block: 2, lighting: 3 };
        const prev = dirtyChunkRemeshReasons.get(key);
        if (!prev || (rank[reason] ?? 0) >= (rank[prev] ?? 0)) {
          dirtyChunkRemeshReasons.set(key, reason);
        }
      }

      function requestChunkAndNeighborsRemesh(cx, cz, reason = 'neighbor') {
        requestChunkRemesh(cx, cz, reason);
        requestChunkRemesh(cx - 1, cz, reason);
        requestChunkRemesh(cx + 1, cz, reason);
        requestChunkRemesh(cx, cz - 1, reason);
        requestChunkRemesh(cx, cz + 1, reason);
      }

      function rebuildDirtyChunkMeshes(forceAll = false) {
        if (dirtyChunkRemeshReasons.size === 0) return 0;
        const budget = forceAll ? meshRebuildBudgetForce : meshRebuildBudgetPerFrame;
        let processed = 0;

        for (const [key, reason] of Array.from(dirtyChunkRemeshReasons.entries())) {
          if (processed >= budget) break;
          dirtyChunkRemeshReasons.delete(key);
          const chunkGroup = getChunk(key);
          if (!chunkGroup) continue;
          const forceRemesh = reason === 'lighting';
          updateChunkGeometry(chunkGroup, chunkGroup.userData.chunkData, forceRemesh);
          processed++;
        }
        return processed;
      }

      function markBatchedChunkRemeshNeed(cx, cz, includeNeighbors = false) {
        const key = getChunkKey(cx, cz);
        const prev = batchedChunkRemeshNeeds.get(key);
        batchedChunkRemeshNeeds.set(key, Boolean(prev || includeNeighbors));
      }

      function beginBlockUpdateBatch() {
        blockUpdateBatchDepth++;
      }

      function endBlockUpdateBatch() {
        if (blockUpdateBatchDepth <= 0) return;
        blockUpdateBatchDepth--;
        if (blockUpdateBatchDepth > 0) return;

        for (const [key, includeNeighbors] of batchedChunkRemeshNeeds.entries()) {
          const [cxs, czs] = key.split(',');
          const cx = Number(cxs);
          const cz = Number(czs);
          if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;
          requestChunkRemesh(cx, cz, 'block');
          if (includeNeighbors) requestChunkAndNeighborsRemesh(cx, cz, 'neighbor');
        }
        batchedChunkRemeshNeeds.clear();
      }

      function applyBlockUpdateBatch(cb) {
        beginBlockUpdateBatch();
        try {
          return cb();
        } finally {
          endBlockUpdateBatch();
        }
      }

      function deleteChunk(chunkKey) {
        dirtyChunkRemeshReasons.delete(chunkKey);
        batchedChunkRemeshNeeds.delete(chunkKey);
      }

      return {
        computeChunkHash,
        requestChunkRemesh,
        requestChunkAndNeighborsRemesh,
        rebuildDirtyChunkMeshes,
        markBatchedChunkRemeshNeed,
        beginBlockUpdateBatch,
        endBlockUpdateBatch,
        applyBlockUpdateBatch,
        deleteChunk,
        isBatchActive() {
          return blockUpdateBatchDepth > 0;
        }
      };
    }
  };

  window.SingleplayerChunkRemeshOptimizations = SingleplayerChunkRemeshOptimizations;
})();
