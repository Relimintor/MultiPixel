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

  const JungleForestWorldgen = {
    placePandaPackInChunk({ data, cx, cz, spawnedPandas, hashRand2D, getBiome, CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL }) {
      const centerX = Math.floor(CHUNK_SIZE / 2);
      const centerZ = Math.floor(CHUNK_SIZE / 2);
      const worldX = cx * CHUNK_SIZE + centerX;
      const worldZ = cz * CHUNK_SIZE + centerZ;
      if (getBiome(worldX, worldZ) !== 'Jungle Forest') return;

      const cfg = window.JungleDecorationConfig?.panda || {};
      const chance = Number(cfg.packSpawnChancePerChunk) || 0.14;
      if (hashRand2D(cx, cz, 9901) > chance) return;

      const idx = createIndex(CHUNK_SIZE, CHUNK_HEIGHT);
      const getColumnTop = createColumnTopGetter(data, idx, CHUNK_HEIGHT, new Set([0, 4]));
      const minPack = Math.max(1, Number(cfg.minPack) || 1);
      const maxPack = Math.max(minPack, Number(cfg.maxPack) || 3);
      const packSize = minPack + Math.floor(hashRand2D(cx, cz, 9902) * (maxPack - minPack + 1));

      for (let i = 0; i < packSize; i++) {
        const rx = Math.floor(hashRand2D(cx * 17 + i * 5, cz * 23 + i * 3, 9903) * CHUNK_SIZE);
        const rz = Math.floor(hashRand2D(cx * 13 + i * 7, cz * 31 + i * 11, 9904) * CHUNK_SIZE);
        if (rx < 1 || rz < 1 || rx >= CHUNK_SIZE - 1 || rz >= CHUNK_SIZE - 1) continue;
        const topY = getColumnTop(rx, rz);
        if (topY < SEA_LEVEL || topY > SEA_LEVEL + 28) continue;
        const under = data[idx(rx, topY, rz)];
        if (under !== 1 && under !== 2) continue;
        spawnedPandas.push({ wx: cx * CHUNK_SIZE + rx + 0.5, wy: topY + 1, wz: cz * CHUNK_SIZE + rz + 0.5 });
      }
    },

    placeBambooInChunk({ data, cx, cz, hashRand2D, getBiome, hasNearbyTreeTrunk, CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL }) {
      const centerX = Math.floor(CHUNK_SIZE / 2);
      const centerZ = Math.floor(CHUNK_SIZE / 2);
      const worldX = cx * CHUNK_SIZE + centerX;
      const worldZ = cz * CHUNK_SIZE + centerZ;
      if (getBiome(worldX, worldZ) !== 'Jungle Forest') return;

      const cfg = window.JungleDecorationConfig?.bamboo || {};
      const baseChance = Number(cfg.baseSpawnChancePerColumn) || 0.055;
      const nearTreeBoost = Number(cfg.nearTreeBoost) || 0.03;
      const idx = createIndex(CHUNK_SIZE, CHUNK_HEIGHT);
      const getColumnTop = createColumnTopGetter(data, idx, CHUNK_HEIGHT, new Set([0, 4, 6, 97]));

      for (let x = 1; x < CHUNK_SIZE - 1; x++) {
        for (let z = 1; z < CHUNK_SIZE - 1; z++) {
          const wx = cx * CHUNK_SIZE + x;
          const wz = cz * CHUNK_SIZE + z;
          const topY = getColumnTop(x, z);
          if (topY < SEA_LEVEL - 1 || topY >= CHUNK_HEIGHT - 2) continue;
          const ground = data[idx(x, topY, z)];
          if (ground !== 1 && ground !== 2) continue;
          if (data[idx(x, topY + 1, z)] !== 0) continue;

          const nearbyTree = hasNearbyTreeTrunk(data, x, z, 2);
          const chance = baseChance + (nearbyTree ? nearTreeBoost : 0);
          if (hashRand2D(wx, wz, 9910) > chance) continue;
          data[idx(x, topY + 1, z)] = 99;
        }
      }
    },

    placeMelonsInChunk({ data, cx, cz, hashRand2D, getBiome, worldGenSettings, CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL }) {
      const melonCfg = worldGenSettings?.decorations?.melons || {};
      if (melonCfg.enabled === false) return;

      const centerX = Math.floor(CHUNK_SIZE / 2);
      const centerZ = Math.floor(CHUNK_SIZE / 2);
      const worldX = cx * CHUNK_SIZE + centerX;
      const worldZ = cz * CHUNK_SIZE + centerZ;
      if (getBiome(worldX, worldZ) !== 'Jungle Forest') return;

      const chancePerJungleChunk = Number(melonCfg.chancePerJungleChunk);
      const spawnChance = Number.isFinite(chancePerJungleChunk) ? chancePerJungleChunk : 0.25;
      if (hashRand2D(cx, cz, 12201) > spawnChance) return;

      const MELON_BLOCK_ID = 108;
      const idx = createIndex(CHUNK_SIZE, CHUNK_HEIGHT);
      const getColumnTop = createColumnTopGetter(data, idx, CHUNK_HEIGHT, new Set([0, 4, 6, 97]));
      const minPatch = Math.max(1, Math.floor(Number(melonCfg.minPatch) || 4));
      const maxPatch = Math.max(minPatch, Math.floor(Number(melonCfg.maxPatch) || 9));
      const count = minPatch + Math.floor(hashRand2D(cx * 13, cz * 17, 12202) * (maxPatch - minPatch + 1));

      for (let i = 0; i < count; i++) {
        const lx = 1 + Math.floor(hashRand2D(cx * 37 + i * 13, cz * 41 - i * 9, 12203) * (CHUNK_SIZE - 2));
        const lz = 1 + Math.floor(hashRand2D(cx * 43 - i * 7, cz * 47 + i * 5, 12204) * (CHUNK_SIZE - 2));
        const topY = getColumnTop(lx, lz);
        if (topY < SEA_LEVEL - 1 || topY >= CHUNK_HEIGHT - 2) continue;
        const ground = data[idx(lx, topY, lz)];
        if (ground !== 1 && ground !== 2) continue;
        if (data[idx(lx, topY + 1, lz)] !== 0) continue;
        data[idx(lx, topY + 1, lz)] = MELON_BLOCK_ID;
      }
    }
  };

  window.JungleForestWorldgen = JungleForestWorldgen;
})();
