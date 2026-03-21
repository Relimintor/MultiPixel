(function () {
  function createIndex(chunkSize, chunkHeight) {
    return function idx(lx, ly, lz) {
      return lx + ly * chunkSize + lz * chunkSize * chunkHeight;
    };
  }

  function createColumnTopGetter(data, idx, chunkHeight, transparentBlocks = new Set([0, 4])) {
    return function getColumnTop(lx, lz) {
      for (let y = chunkHeight - 2; y >= 1; y--) {
        const block = data[idx(lx, y, lz)];
        if (!transparentBlocks.has(block)) return y;
      }
      return -1;
    };
  }

  const DesertWorldgen = {
    placeDesertWellInChunk({ data, cx, cz, spawnedPigs, hashRand2D, getBiome, CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL }) {
      const centerX = Math.floor(CHUNK_SIZE / 2);
      const centerZ = Math.floor(CHUNK_SIZE / 2);
      const worldX = cx * CHUNK_SIZE + centerX;
      const worldZ = cz * CHUNK_SIZE + centerZ;

      if (getBiome(worldX, worldZ) !== 'Desert') return;
      if (hashRand2D(cx, cz, 9127) > 0.08) return;

      const idx = createIndex(CHUNK_SIZE, CHUNK_HEIGHT);
      const getColumnTop = createColumnTopGetter(data, idx, CHUNK_HEIGHT);

      const radius = 2;
      if (centerX - radius < 2 || centerX + radius >= CHUNK_SIZE - 2 || centerZ - radius < 2 || centerZ + radius >= CHUNK_SIZE - 2) return;

      const topY = getColumnTop(centerX, centerZ);
      if (topY < SEA_LEVEL - 1) return;
      if (data[idx(centerX, topY, centerZ)] !== 7) return;

      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const lx = centerX + dx;
          const lz = centerZ + dz;
          const y = getColumnTop(lx, lz);
          if (y < 1 || Math.abs(y - topY) > 1) return;
          const ground = data[idx(lx, y, lz)];
          if (ground !== 7 && ground !== 13) return;
        }
      }

      const sandstone = 13;
      const water = 4;
      const copperBlock = 34;
      const wellY = topY + 1;

      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          data[idx(centerX + dx, wellY, centerZ + dz)] = sandstone;
        }
      }

      data[idx(centerX, wellY, centerZ)] = water;
      data[idx(centerX + 1, wellY, centerZ)] = water;
      data[idx(centerX - 1, wellY, centerZ)] = water;
      data[idx(centerX, wellY, centerZ + 1)] = water;
      data[idx(centerX, wellY, centerZ - 1)] = water;

      if (wellY - 1 >= 1) data[idx(centerX, wellY - 1, centerZ)] = copperBlock;

      for (let py = wellY + 1; py <= wellY + 3; py++) {
        data[idx(centerX - 1, py, centerZ - 1)] = sandstone;
        data[idx(centerX - 1, py, centerZ + 1)] = sandstone;
        data[idx(centerX + 1, py, centerZ - 1)] = sandstone;
        data[idx(centerX + 1, py, centerZ + 1)] = sandstone;
      }

      const roofY = wellY + 4;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          data[idx(centerX + dx, roofY, centerZ + dz)] = sandstone;
        }
      }

      spawnedPigs.push({ wx: worldX + 0.5, wy: wellY + 1, wz: worldZ + 0.5 });
    }
  };

  window.DesertWorldgen = DesertWorldgen;
})();
