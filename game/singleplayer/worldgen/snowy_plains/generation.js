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

  const SnowyPlainsWorldgen = {
    placeIglooInChunk({ data, cx, cz, spawnedGnomes, hashRand2D, iglooStructureDef, CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL }) {
      const snowyTerrain = window.SnowyPlainsTerrain || {};
      const iglooRules = snowyTerrain.structures?.igloo;
      if (!iglooRules || !iglooStructureDef) return;
      const canSpawn = snowyTerrain.shouldSpawnIgloo
        ? snowyTerrain.shouldSpawnIgloo({ cx, cz, hashRand2D, spawnChance: iglooRules.spawnChancePerChunk })
        : false;
      if (!canSpawn) return;

      const radius = Math.max(2, Math.min(6, Number(iglooStructureDef.radius) || 4));
      const centerX = Math.floor(CHUNK_SIZE / 2);
      const centerZ = Math.floor(CHUNK_SIZE / 2);
      if (centerX - radius < 1 || centerX + radius >= CHUNK_SIZE - 1 || centerZ - radius < 1 || centerZ + radius >= CHUNK_SIZE - 1) return;

      const idx = createIndex(CHUNK_SIZE, CHUNK_HEIGHT);
      const getColumnTop = createColumnTopGetter(data, idx, CHUNK_HEIGHT);
      const centerTopY = getColumnTop(centerX, centerZ);
      if (centerTopY < SEA_LEVEL) return;
      const requiredGround = iglooRules.validSurfaceBlockId ?? 15;
      if (data[idx(centerX, centerTopY, centerZ)] !== requiredGround) return;

      const maxSlope = Number(iglooStructureDef.maxSurfaceSlope) || 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const lx = centerX + dx;
          const lz = centerZ + dz;
          const topY = getColumnTop(lx, lz);
          if (topY < 1 || Math.abs(topY - centerTopY) > maxSlope) return;
        }
      }

      const floorBlock = Number(iglooStructureDef.floorBlockId) || 59;
      const wallBlock = Number(iglooStructureDef.wallBlockId) || 15;
      const windowBlock = Number(iglooStructureDef.windowBlockId) || wallBlock;
      const domeHeight = Number(iglooStructureDef.interiorHeadroom) || 3;
      const doorHeight = Math.max(2, Number(iglooStructureDef.doorHeight) || 2);

      const centerY = centerTopY + 1;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const dist = Math.sqrt(dx * dx + dz * dz);
          const lx = centerX + dx;
          const lz = centerZ + dz;
          if (dist <= radius - 0.35) data[idx(lx, centerTopY, lz)] = floorBlock;

          for (let dy = 0; dy <= domeHeight; dy++) {
            const ly = centerY + dy;
            if (ly < 1 || ly >= CHUNK_HEIGHT - 1) continue;
            const shellDist = Math.sqrt(dx * dx + dz * dz + (dy * 1.22) * (dy * 1.22));
            if (shellDist <= radius + 0.18 && shellDist >= radius - 1.05) {
              data[idx(lx, ly, lz)] = wallBlock;
            } else if (shellDist < radius - 1.05) {
              data[idx(lx, ly, lz)] = 0;
            }
          }
        }
      }

      for (let dy = 0; dy < doorHeight; dy++) {
        const ly = centerY + dy;
        data[idx(centerX, ly, centerZ + radius)] = 0;
        data[idx(centerX, ly, centerZ + radius - 1)] = 0;
      }
      data[idx(centerX - radius + 1, centerY + 1, centerZ)] = windowBlock;
      data[idx(centerX + radius - 1, centerY + 1, centerZ)] = windowBlock;

      const worldX = cx * CHUNK_SIZE + centerX;
      const worldZ = cz * CHUNK_SIZE + centerZ;
      const gnomeY = centerTopY + (Number(iglooStructureDef.gnomeSpawnOffsetY) || 1);
      spawnedGnomes.push({ wx: worldX, wy: gnomeY, wz: worldZ });
    }
  };

  window.SnowyPlainsWorldgen = SnowyPlainsWorldgen;
})();
