(function () {
  const UndergroundGeodesWorldgen = {
    placeAmethystGeodesInChunk({ data, cx, cz, hashRand2D, worldGenSettings, CHUNK_SIZE, CHUNK_HEIGHT }) {
      const geodeCfg = worldGenSettings?.decorations?.amethystGeodes || {};
      if (geodeCfg.enabled === false) return;

      const BASALT_ID = 106;
      const CHALK_ID = 105;
      const AMETHYST_ID = 104;
      const geodeChancePerChunk = Number(geodeCfg.chancePerChunk);
      const spawnChance = Number.isFinite(geodeChancePerChunk) ? geodeChancePerChunk : 0.075;
      if (hashRand2D(cx, cz, 12001) > spawnChance) return;

      const idx = (lx, ly, lz) => lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT;
      const maxPerChunk = Math.max(1, Math.floor(Number(geodeCfg.maxPerChunk) || 2));
      const geodeCount = maxPerChunk <= 1 ? 1 : (hashRand2D(cx * 7, cz * 11, 12002) > 0.84 ? maxPerChunk : 1);

      for (let g = 0; g < geodeCount; g++) {
        const lx = 2 + Math.floor(hashRand2D(cx * 37 + g * 13, cz * 29 - g * 7, 12003) * (CHUNK_SIZE - 4));
        const lz = 2 + Math.floor(hashRand2D(cx * 19 - g * 5, cz * 41 + g * 17, 12004) * (CHUNK_SIZE - 4));
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;

        const centerY = 10 + Math.floor(hashRand2D(wx, wz, 12005 + g) * Math.max(18, CHUNK_HEIGHT * 0.45));
        if (centerY < 8 || centerY > CHUNK_HEIGHT - 8) continue;

        const radiusX = 3.2 + hashRand2D(wx + 17, wz - 9, 12006 + g) * 2.4;
        const radiusY = 2.7 + hashRand2D(wx - 31, wz + 21, 12007 + g) * 2.0;
        const radiusZ = 3.0 + hashRand2D(wx + 47, wz + 13, 12008 + g) * 2.6;
        const outerRim = 1.05;
        const middleRim = 0.78;

        const minX = Math.max(1, Math.floor(lx - radiusX - 2));
        const maxX = Math.min(CHUNK_SIZE - 2, Math.ceil(lx + radiusX + 2));
        const minY = Math.max(2, Math.floor(centerY - radiusY - 2));
        const maxY = Math.min(CHUNK_HEIGHT - 2, Math.ceil(centerY + radiusY + 2));
        const minZ = Math.max(1, Math.floor(lz - radiusZ - 2));
        const maxZ = Math.min(CHUNK_SIZE - 2, Math.ceil(lz + radiusZ + 2));

        const eggNoiseByXZ = [];
        for (let x = minX; x <= maxX; x++) {
          eggNoiseByXZ[x] = [];
          for (let z = minZ; z <= maxZ; z++) {
            eggNoiseByXZ[x][z] = (hashRand2D(wx + x * 5, wz + z * 3, 12009) - 0.5) * 0.12;
          }
        }

        for (let x = minX; x <= maxX; x++) {
          const dx = (x - lx) / radiusX;
          const dx2 = dx * dx;
          for (let y = minY; y <= maxY; y++) {
            const dy = (y - centerY) / radiusY;
            const dy2 = dy * dy;
            for (let z = minZ; z <= maxZ; z++) {
              const dz = (z - lz) / radiusZ;
              const norm = Math.sqrt(dx2 + dy2 + dz * dz) + eggNoiseByXZ[x][z];
              if (norm > outerRim) continue;

              const at = idx(x, y, z);
              const current = data[at];
              if (current === 14 || current === 33 || current === 4) continue;

              if (norm > middleRim) data[at] = BASALT_ID;
              else if (norm > 0.48) data[at] = CHALK_ID;
              else data[at] = AMETHYST_ID;
            }
          }
        }
      }
    }
  };

  window.UndergroundGeodesWorldgen = UndergroundGeodesWorldgen;
})();
