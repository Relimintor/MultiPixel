(function () {
  function createIndex(chunkSize, chunkHeight) {
    return function idx(lx, ly, lz) {
      return lx + ly * chunkSize + lz * chunkSize * chunkHeight;
    };
  }

  function createColumnTopGetter(data, idx, chunkHeight) {
    return function getColumnTop(lx, lz) {
      for (let y = chunkHeight - 2; y >= 1; y--) {
        const block = data[idx(lx, y, lz)];
        if (block !== 0 && block !== 4) return y;
      }
      return -1;
    };
  }

  const OakForestWorldgen = {
    placeWolfPackInChunk({ data, cx, cz, spawnedWolves, hashRand2D, getBiome, CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL }) {
      const centerX = Math.floor(CHUNK_SIZE / 2);
      const centerZ = Math.floor(CHUNK_SIZE / 2);
      const worldX = cx * CHUNK_SIZE + centerX;
      const worldZ = cz * CHUNK_SIZE + centerZ;
      if (getBiome(worldX, worldZ) !== 'Forest') return;
      if (hashRand2D(cx, cz, 7701) > 0.12) return;

      const idx = createIndex(CHUNK_SIZE, CHUNK_HEIGHT);
      const getColumnTop = createColumnTopGetter(data, idx, CHUNK_HEIGHT);
      const packSize = 1 + Math.floor(hashRand2D(cx, cz, 7702) * 5);

      for (let i = 0; i < packSize; i++) {
        const rx = Math.floor(hashRand2D(cx * 37 + i * 7, cz * 53 + i * 11, 7703) * CHUNK_SIZE);
        const rz = Math.floor(hashRand2D(cx * 41 + i * 13, cz * 29 + i * 17, 7704) * CHUNK_SIZE);
        if (rx < 1 || rz < 1 || rx >= CHUNK_SIZE - 1 || rz >= CHUNK_SIZE - 1) continue;
        const topY = getColumnTop(rx, rz);
        if (topY < SEA_LEVEL || topY > SEA_LEVEL + 24) continue;
        const under = data[idx(rx, topY, rz)];
        if (under !== 1 && under !== 2) continue;
        spawnedWolves.push({ wx: cx * CHUNK_SIZE + rx + 0.5, wy: topY + 1, wz: cz * CHUNK_SIZE + rz + 0.5 });
      }
    }
  };

  window.OakForestWorldgen = OakForestWorldgen;
})();
