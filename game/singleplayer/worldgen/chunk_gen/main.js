(function () {
  function createChunkGenerator({
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    SEA_LEVEL,
    CAVE_SCALE,
    CAVE_MIN_Y,
    CAVE_MAX_Y_OFFSET,
    CAVE_SURFACE_SAFETY_DEPTH,
    CAVE_THRESHOLD,
    RAVINE_ACTIVATION_THRESHOLD,
    worldGenerator,
    worldGenSettings,
    perlin,
    octaveNoise2D,
    hashRand2D,
    sampleCaveShape,
    getBiome,
    getNoiseGroundHeight,
    getRiverMask,
    getRavineMask,
    isOceanBiomeName,
    getBiomeInfo,
    oakTreeDecoration,
    placeAmethystGeodesInChunk,
    buildChunkHeightmap,
    placeIglooInChunk,
    placeVillageInChunk,
    placeDesertWellInChunk,
    placeWolfPackInChunk,
    placePandaPackInChunk,
    placeBambooInChunk,
    placePumpkinPatchInChunk,
    placeMelonsInChunk,
  }) {
    const orePasses = window.SingleplayerChunkGenOres || {};

    return function generateChunkData(cx, cz) {
      const data = new Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
      const spawnedGnomes = [];
      const fallbackTreeCandidates = [];
      let treesPlacedInChunk = 0;

      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const wx = cx * CHUNK_SIZE + x;
          const wz = cz * CHUNK_SIZE + z;

          const worldSample = worldGenerator ? worldGenerator.sample(wx, wz) : null;
          const biome = worldSample ? (worldSample.gameplayBiome || worldSample.biome) : getBiome(wx, wz);
          const h = getNoiseGroundHeight(wx, wz, biome, worldSample);
          const biomeInfo = getBiomeInfo(biome);

          const riverInfluence = worldSample ? worldSample.riverMask : getRiverMask(wx, wz);
          const isFrozenRiver = !!worldSample && (worldSample.biome === 'Frozen River' || worldSample.tempBand === (window.WorldgenLayers?.Constants?.FREEZING ?? 13));
          const RIVER_WIDTH_THRESHOLD = 0.1;
          const isRiver = !worldSample?.noRiver && riverInfluence > RIVER_WIDTH_THRESHOLD;
          const isOcean = isOceanBiomeName(biome);
          const hasAquaticFloor = isRiver || isOcean;
          const gravelPatchNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.08, 1642, 977);
          const hasGravelPatch = hasAquaticFloor && gravelPatchNoise > 0.58;
          const isWarmOcean = biome === 'Warm Ocean';
          const isColdOcean = biome === 'Cold Ocean';
          const isCoastOcean = biome === 'Coast Ocean';
          const ravineMask = getRavineMask(wx, wz);
          const ravineTopCap = Math.max(3, h - CAVE_SURFACE_SAFETY_DEPTH);
          const canCarveRavine = ravineMask > RAVINE_ACTIVATION_THRESHOLD && ravineTopCap > 3;
          const ravineStrength = canCarveRavine
            ? ((ravineMask - RAVINE_ACTIVATION_THRESHOLD) / (1 - RAVINE_ACTIVATION_THRESHOLD))
            : 0;
          const ravineTop = canCarveRavine ? Math.min(ravineTopCap, CHUNK_HEIGHT - 1) : 0;
          const ravineMaxDepth = canCarveRavine ? (12 + Math.floor(ravineStrength * 8)) : 0;
          const ravineBottom = canCarveRavine ? Math.max(3, ravineTop - ravineMaxDepth) : 0;

          for (let y = 0; y < CHUNK_HEIGHT; y++) {
            let t = 0;

            if (y === 0) {
              t = 14;
              data[x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_HEIGHT] = t;
              continue;
            }

            if (y < h) {
              const distFromSurface = h - 1 - y;

              if (worldGenerator?.terrain?.surfaceBlockForBiome) {
                t = worldGenerator.terrain.surfaceBlockForBiome(biome, y, h, SEA_LEVEL);
              } else if (biome === 'Desert') {
                t = distFromSurface < 5 ? 7 : 13;
              } else if (biome === 'Snowy Plains') {
                t = distFromSurface === 0 ? 15 : 59;
              } else if (biome === 'Mountains') {
                t = distFromSurface === 0 && h > SEA_LEVEL + 20 ? 15 : 3;
              } else {
                const isBeachZone = h >= SEA_LEVEL - 1 && h <= SEA_LEVEL + 2;
                if (distFromSurface === 0) t = isBeachZone ? 7 : 1;
                else if (distFromSurface < 4) t = isBeachZone ? 7 : 2;
                else t = 3;
              }

              if (biome === 'Mountains' && t !== 0) {
                const ridgeRough = Math.abs(perlin.noise3D(wx * 0.017 + 310, y * 0.024, wz * 0.017 - 145));
                const microBreak = Math.abs(perlin.noise3D(wx * 0.035 - 980, y * 0.045, wz * 0.035 + 410));
                const carvingBand = distFromSurface >= 3 && distFromSurface <= 9;
                const shouldCarve = carvingBand && ridgeRough > 0.92 && microBreak > 0.9;
                if (shouldCarve) t = 0;
              }

              if (hasAquaticFloor && y < SEA_LEVEL - 1) {
                if (isColdOcean) {
                  t = 28;
                } else if (isCoastOcean) {
                  t = 7;
                } else if (isWarmOcean) {
                  if (distFromSurface <= 1) t = hasGravelPatch ? 28 : 7;
                  else if (distFromSurface < 3) t = hasGravelPatch ? 28 : 7;
                  else t = 3;
                } else if (distFromSurface === 0) {
                  t = hasGravelPatch ? 28 : 7;
                } else if (distFromSurface < 3) {
                  t = hasGravelPatch && distFromSurface < 2 ? 28 : 7;
                } else {
                  t = 3;
                }
              }
            } else if (y < SEA_LEVEL) {
              t = 0;
              if (isRiver) {
                t = isFrozenRiver ? 59 : 4;
              } else if (isOcean) {
                t = 4;
              }
            }

            if (y > CAVE_MIN_Y && y < h - CAVE_MAX_Y_OFFSET && (h - y) >= (CAVE_SURFACE_SAFETY_DEPTH + 2)) {
              if (t === 3 || t === 2 || t === 7 || t === 13 || t === 28 || t === 59) {
                const caveShape = sampleCaveShape(wx, y, wz);
                const depth = Math.max(0, (h - y) / Math.max(1, h));
                const nearSurfaceGuard = depth < 0.2 ? 0.1 : (depth < 0.35 ? 0.05 : 0);
                const dynamicThreshold = CAVE_THRESHOLD + nearSurfaceGuard - Math.min(0.1, depth * 0.14);
                const tunnelNoise = Math.abs(perlin.noise3D(wx * CAVE_SCALE * 0.7, y * CAVE_SCALE * 0.45, wz * CAVE_SCALE * 0.7));
                if (caveShape > dynamicThreshold || (depth > 0.55 && tunnelNoise < 0.05)) {
                  t = 0;
                }
              }
            }

            if (canCarveRavine) {
              const strength = ravineStrength;
              if (y <= ravineTop && y >= ravineBottom) {
                const mid = (ravineTop + ravineBottom) / 2;
                const halfHeight = (ravineTop - ravineBottom) / 2;
                const verticalFactor = 1 - Math.abs(y - mid) / halfHeight;
                const widthNoise = octaveNoise2D(wx, wz, 2, 0.5, 2.0, 0.04, 812, -245);
                const widthFactor = strength * verticalFactor + widthNoise * 0.06;
                if (widthFactor > 0.42) {
                  if (y < 6) t = 33;
                  else if (y < SEA_LEVEL - 1) t = 4;
                  else t = 0;
                }
              }
            }

            t = orePasses.applyOrePasses
              ? orePasses.applyOrePasses({ blockType: t, y, h, CHUNK_HEIGHT, wx, wz, octaveNoise2D, hashRand2D, biomeInfo })
              : t;

            data[x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_HEIGHT] = t;
          }

          if (oakTreeDecoration?.tryGenerateTreeAtColumn?.({
            data,
            x,
            z,
            wx,
            wz,
            biome,
            isRiver,
            riverInfluence,
            worldGenSettings,
            seaLevel: SEA_LEVEL,
            chunkSize: CHUNK_SIZE,
            chunkHeight: CHUNK_HEIGHT,
            octaveNoise2D,
            hashRand2D,
            fallbackTreeCandidates,
          })) {
            treesPlacedInChunk++;
          }
        }
      }

      if (treesPlacedInChunk === 0) {
        oakTreeDecoration?.placeFallbackTree?.({
          data,
          cx,
          cz,
          fallbackTreeCandidates,
          hashRand2D,
          chunkSize: CHUNK_SIZE,
          chunkHeight: CHUNK_HEIGHT,
        });
      }

      placeAmethystGeodesInChunk(data, cx, cz);
      const heightmap = buildChunkHeightmap(data);
      const spawnedPigs = [];
      const spawnedWolves = [];
      const spawnedPandas = [];
      const spawnedVillagers = [];
      placeIglooInChunk(data, cx, cz, spawnedGnomes);
      const placedVillage = placeVillageInChunk(data, cx, cz, spawnedVillagers);
      if (!placedVillage) placeDesertWellInChunk(data, cx, cz, spawnedPigs);
      placeWolfPackInChunk(data, heightmap, cx, cz, spawnedWolves);
      placePandaPackInChunk(data, heightmap, cx, cz, spawnedPandas);
      placeBambooInChunk(data, cx, cz);
      placePumpkinPatchInChunk(data, cx, cz);
      placeMelonsInChunk(data, cx, cz);
      return { data, heightmap, spawnedGnomes, spawnedPigs, spawnedWolves, spawnedPandas, spawnedVillagers };
    };
  }

  window.SingleplayerChunkGeneration = {
    createChunkGenerator,
  };
})();
