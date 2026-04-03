(function () {
  function createIndex(chunkSize, chunkHeight) {
    return function idx(lx, ly, lz) {
      return lx + ly * chunkSize + lz * chunkSize * chunkHeight;
    };
  }

  function createColumnTopGetter(data, idx, chunkHeight, transparentBlocks) {
    return function getColumnTop(lx, lz) {
      for (let y = chunkHeight - 2; y >= 1; y--) {
        const block = data[idx(lx, y, lz)];
        if (!transparentBlocks.has(block)) return y;
      }
      return -1;
    };
  }

  const RedwoodForestWorldgen = {
    placeGroundCoverInChunk({ data, cx, cz, hashRand2D, getBiome, CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL }) {
      const centerX = Math.floor(CHUNK_SIZE / 2);
      const centerZ = Math.floor(CHUNK_SIZE / 2);
      const worldX = cx * CHUNK_SIZE + centerX;
      const worldZ = cz * CHUNK_SIZE + centerZ;
      if (getBiome(worldX, worldZ) !== 'Redwood Forest') return;

      const idx = createIndex(CHUNK_SIZE, CHUNK_HEIGHT);
      const transparent = new Set([0, 4, 6, 97, 251, 255]);
      const getColumnTop = createColumnTopGetter(data, idx, CHUNK_HEIGHT, transparent);

      for (let x = 1; x < CHUNK_SIZE - 1; x++) {
        for (let z = 1; z < CHUNK_SIZE - 1; z++) {
          const wx = cx * CHUNK_SIZE + x;
          const wz = cz * CHUNK_SIZE + z;
          const topY = getColumnTop(x, z);
          if (topY < SEA_LEVEL - 2 || topY >= CHUNK_HEIGHT - 2) continue;
          const ground = data[idx(x, topY, z)];
          if (ground !== 1 && ground !== 2) continue;
          if (data[idx(x, topY + 1, z)] !== 0) continue;

          const litterRoll = hashRand2D(wx, wz, 14801);
          if (litterRoll < 0.10) {
            data[idx(x, topY + 1, z)] = 255; // redwood root leaves
            continue;
          }
          const fernRoll = hashRand2D(wx, wz, 14802);
          if (fernRoll < 0.12) {
            data[idx(x, topY + 1, z)] = 146; // existing vines as low undergrowth accent
          }
        }
      }
    },

    placeFallenLogsInChunk({ data, cx, cz, hashRand2D, getBiome, CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL }) {
      const centerX = Math.floor(CHUNK_SIZE / 2);
      const centerZ = Math.floor(CHUNK_SIZE / 2);
      const worldX = cx * CHUNK_SIZE + centerX;
      const worldZ = cz * CHUNK_SIZE + centerZ;
      if (getBiome(worldX, worldZ) !== 'Redwood Forest') return;
      if (hashRand2D(cx, cz, 14901) > 0.22) return;

      const idx = createIndex(CHUNK_SIZE, CHUNK_HEIGHT);
      const transparent = new Set([0, 4, 6, 97, 251, 255, 146]);
      const getColumnTop = createColumnTopGetter(data, idx, CHUNK_HEIGHT, transparent);
      const orientationX = hashRand2D(cx, cz, 14902) < 0.5;
      const length = 4 + Math.floor(hashRand2D(cx, cz, 14903) * 5);
      const startX = 2 + Math.floor(hashRand2D(cx, cz, 14904) * (CHUNK_SIZE - 4));
      const startZ = 2 + Math.floor(hashRand2D(cx, cz, 14905) * (CHUNK_SIZE - 4));

      for (let i = 0; i < length; i++) {
        const lx = orientationX ? startX + i : startX;
        const lz = orientationX ? startZ : startZ + i;
        if (lx <= 0 || lz <= 0 || lx >= CHUNK_SIZE - 1 || lz >= CHUNK_SIZE - 1) continue;

        const topY = getColumnTop(lx, lz);
        if (topY < SEA_LEVEL - 2 || topY >= CHUNK_HEIGHT - 2) continue;
        const ground = data[idx(lx, topY, lz)];
        if (ground !== 1 && ground !== 2 && ground !== 255) continue;
        if (data[idx(lx, topY + 1, lz)] !== 0) continue;
        data[idx(lx, topY + 1, lz)] = 250;

        const mossRoll = hashRand2D(cx * 131 + lx * 17 + i, cz * 173 + lz * 19, 14906);
        if (mossRoll < 0.33 && data[idx(lx, topY + 2, lz)] === 0) {
          data[idx(lx, topY + 2, lz)] = 255;
        }
      }
    },
  };

  window.RedwoodForestWorldgen = RedwoodForestWorldgen;
})();
