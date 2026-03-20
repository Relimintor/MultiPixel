(function () {
  const BIOME_CLIMATE_TARGETS = [
    { name: 'Desert', temp: 0.09, humidity: -0.12, continentalness: 0.18, erosion: 0.08, weirdness: 0.06 },
    { name: 'Forest', temp: 0.0, humidity: 0.16, continentalness: 0.14, erosion: 0.06, weirdness: -0.04 },
    { name: 'Jungle Forest', temp: 0.95, humidity: 0.9, continentalness: 0.2, erosion: 0.03, weirdness: 0.0 },
    { name: 'Plains', temp: -0.02, humidity: 0.02, continentalness: 0.1, erosion: 0.2, weirdness: 0.02 },
    { name: 'Snowy Plains', temp: -0.52, humidity: 0.04, continentalness: 0.12, erosion: 0.18, weirdness: -0.02 },
  ];

  const BIOME_NAME_TO_TERRAIN_KEY = {
    Ocean: 'ocean',
    'Coast Ocean': 'ocean',
    'Warm Ocean': 'ocean',
    'Lukewarm Ocean': 'ocean',
    'Cold Ocean': 'ocean',
    'Frozen Ocean': 'ocean',
    Mountains: 'mountains',
    Desert: 'desert',
    'Snowy Plains': 'snowyPlains',
    Forest: 'oakForest',
    'Jungle Forest': 'jungleForest',
    Plains: 'plains',
    River: 'river',
    'Frozen River': 'river',
  };

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function smoothstep(edge0, edge1, x) {
    if (edge0 === edge1) return x < edge0 ? 0 : 1;
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function sampleClimateVector({ wx, wz, y, SEA_LEVEL, octaveNoise3D }) {
    const sampleY = Number.isFinite(y) ? y : SEA_LEVEL;
    const rawTemp = octaveNoise3D(wx, sampleY, wz, 3, 0.52, 2.0, 0.00048, -600, 170, 300);
    const rawHumidity = octaveNoise3D(wx, sampleY, wz, 3, 0.55, 2.0, 0.00072, 320, -240, -130);
    return {
      temp: Math.max(-1, Math.min(1, rawTemp * 2.1)),
      humidity: Math.max(-1, Math.min(1, rawHumidity * 2.0)),
      continentalness: octaveNoise3D(wx, sampleY, wz, 3, 0.52, 2.0, 0.00145, 200, 90, 200),
      erosion: octaveNoise3D(wx, sampleY, wz, 4, 0.5, 2.05, 0.0039, 180, -120, -90),
      weirdness: octaveNoise3D(wx, sampleY, wz, 4, 0.5, 2.0, 0.0021, -510, 380, 140),
    };
  }

  function sampleTerrainVector({ wx, wz, octaveNoise2D }) {
    const continentalness = octaveNoise2D(wx, wz, 3, 0.52, 2.0, 0.00145, 200, 200);
    const erosion = octaveNoise2D(wx, wz, 4, 0.5, 2.05, 0.0039, 180, -90);
    const weirdness = octaveNoise2D(wx, wz, 4, 0.5, 2.0, 0.0021, -510, 140);
    const humidity = octaveNoise2D(wx, wz, 3, 0.55, 2.0, 0.0011, 320, -130);
    const peaksValleys = 1 - Math.abs(weirdness);
    const ridges = Math.pow(Math.max(0, peaksValleys), 1.8);
    return { continentalness, erosion, weirdness, humidity, peaksValleys, ridges };
  }

  function biomeWeights({ wx, wz, SEA_LEVEL, octaveNoise2D, octaveNoise3D }) {
    const tv = sampleTerrainVector({ wx, wz, octaveNoise2D });
    const climate = sampleClimateVector({ wx, wz, y: SEA_LEVEL + 8, SEA_LEVEL, octaveNoise3D });
    const mountainNoise = (Math.abs(octaveNoise2D(wx, wz, 3, 0.56, 2.0, 0.0013, -400, 750)) + 1) * 0.5;
    const continentalNoise = (tv.continentalness + 1) * 0.5;

    const oceanW = smoothstep(0.36, 0.02, continentalNoise);
    const mountainW = smoothstep(0.50, 0.80, mountainNoise) * smoothstep(0.34, 0.90, continentalNoise);
    const desertW = smoothstep(0.02, 0.48, climate.temp) * smoothstep(0.24, -0.30, climate.humidity) * smoothstep(0.30, 0.90, continentalNoise);
    const snowyW = smoothstep(-0.20, -0.64, climate.temp) * smoothstep(-0.18, 0.50, climate.humidity) * smoothstep(0.22, 0.86, continentalNoise) * (1 - mountainW * 0.70);
    const jungleHumidityW = smoothstep(0.30, 1.0, climate.humidity);
    const jungleTempW = smoothstep(0.55, 0.98, climate.temp);
    const jungleW = jungleHumidityW * jungleTempW * smoothstep(0.22, 0.92, continentalNoise) * (1 - mountainW * 0.55);
    const forestW = smoothstep(-0.12, 0.44, climate.humidity) * smoothstep(-0.28, 0.40, climate.temp) * (1 - desertW * 0.72) * (1 - jungleW * 0.7);
    const plainsW = (0.16 + smoothstep(0.14, 0.66, continentalNoise) * 0.14) * (1 - jungleW * 0.5);

    const adaptiveDesertFloor = climate.temp > 0.26 && climate.humidity < 0.12 ? 0.018 : 0;
    const adaptiveSnowyFloor = climate.temp < -0.30 ? 0.018 : 0;
    const adaptiveJungleFloor = climate.temp > 0.52 && climate.humidity > 0.40 ? 0.018 : 0;
    const desertBlendW = Math.max(desertW, adaptiveDesertFloor);
    const snowyBlendW = Math.max(snowyW, adaptiveSnowyFloor);
    const jungleBlendW = Math.max(jungleW, adaptiveJungleFloor);

    const total = oceanW + mountainW + desertBlendW + snowyBlendW + forestW + plainsW + jungleBlendW;
    if (total <= 0) {
      return {
        tv,
        climate,
        weights: { Ocean: 0, Mountains: 0, Desert: 0, Forest: 0, 'Jungle Forest': 0, Plains: 1, 'Snowy Plains': 0 },
      };
    }

    return {
      tv,
      climate,
      weights: {
        Ocean: oceanW / total,
        Mountains: mountainW / total,
        Desert: desertBlendW / total,
        Forest: forestW / total,
        'Jungle Forest': jungleBlendW / total,
        Plains: plainsW / total,
        'Snowy Plains': snowyBlendW / total,
      },
    };
  }

  function isOceanBiomeName(biomeName) {
    return biomeName === 'Ocean'
      || biomeName === 'Coast Ocean'
      || biomeName === 'Warm Ocean'
      || biomeName === 'Lukewarm Ocean'
      || biomeName === 'Cold Ocean'
      || biomeName === 'Frozen Ocean';
  }

  function getBiome({ wx, wz, worldGenerator, SEA_LEVEL, octaveNoise2D, octaveNoise3D }) {
    if (worldGenerator) return worldGenerator.sampleBiome(wx, wz);

    const { climate, weights } = biomeWeights({ wx, wz, SEA_LEVEL, octaveNoise2D, octaveNoise3D });
    if ((weights.Ocean || 0) > 0.68) {
      const coastalBand = (weights.Ocean || 0) < 0.84;
      if (coastalBand) return 'Coast Ocean';

      const temp = Number(climate.temp) || 0;
      if (temp >= 0.62) return 'Warm Ocean';
      if (temp >= 0.28) return 'Lukewarm Ocean';
      if (temp <= -0.60) return 'Frozen Ocean';
      if (temp <= -0.24) return 'Cold Ocean';
      return 'Ocean';
    }
    if ((weights.Mountains || 0) > 0.72) return 'Mountains';

    let bestBiome = 'Plains';
    let bestScore = -Infinity;
    for (const target of BIOME_CLIMATE_TARGETS) {
      const dTemp = climate.temp - target.temp;
      const dHum = climate.humidity - target.humidity;
      const dCont = climate.continentalness - target.continentalness;
      const dEro = climate.erosion - target.erosion;
      const dWeird = climate.weirdness - target.weirdness;
      const climateDist = dTemp * dTemp + dHum * dHum + dCont * dCont + dEro * dEro + dWeird * dWeird;
      const score = -climateDist + (Number(weights[target.name] || 0) * 0.65);
      if (score > bestScore) {
        bestScore = score;
        bestBiome = target.name;
      }
    }

    return bestBiome;
  }

  function getTerrainModuleForBiome(biomeName, TerrainModules) {
    const key = BIOME_NAME_TO_TERRAIN_KEY[biomeName] || 'plains';
    return TerrainModules[key] || null;
  }

  function getBiomeInfo(biomeName, TerrainModules) {
    return getTerrainModuleForBiome(biomeName, TerrainModules)?.biomeInfo || null;
  }

  function getNoiseGroundHeight({ wx, wz, biome, worldSample = null, worldGenerator, TerrainModules, BASE_LAND_Y, SEA_LEVEL, perlin, octaveNoise2D, octaveNoise3D, getRiverMask, getRavineMask }) {
    if (worldGenerator) return worldGenerator.getHeight(wx, wz, biome, worldSample);
    const tv = sampleTerrainVector({ wx, wz, octaveNoise2D });
    const biomeData = biomeWeights({ wx, wz, SEA_LEVEL, octaveNoise2D, octaveNoise3D });
    const weights = biomeData.weights || {};
    const continentalMask = (tv.continentalness + 1) * 0.5;
    const terrainNoise = (perlin.noise2D(wx * 0.02, wz * 0.02) + 1) * 0.5;
    const detailNoise = (perlin.noise2D(wx * 0.045, wz * 0.045) + 1) * 0.5;
    const erosionNoise = (tv.erosion + 1) * 0.5;
    const peakNoise = Math.abs(perlin.noise2D(wx * 0.007 - 250, wz * 0.007 + 400));
    const jaggedNoise = Math.abs(octaveNoise2D(wx, wz, 5, 0.46, 2.25, 0.013, -1200, 950));
    const cliffNoise = Math.abs(perlin.noise2D(wx * 0.012 - 910, wz * 0.012 + 260));
    const deepNoise = (perlin.noise2D(wx * 0.01 - 200, wz * 0.01 + 430) + 1) * 0.5;
    const bigDuneNoise = (perlin.noise2D(wx * 0.016 + 15, wz * 0.016 - 15) + 1) * 0.5;
    const duneDetailNoise = (perlin.noise2D(wx * 0.038 + 120, wz * 0.038 - 70) + 1) * 0.5;
    const rockMaskNoise = (perlin.noise2D(wx * 0.009 - 510, wz * 0.009 + 230) + 1) * 0.5;

    const biomeHeights = {
      Ocean: TerrainModules.ocean.getHeight({ SEA_LEVEL, deepNoise, terrainNoise }),
      Mountains: TerrainModules.mountains.getHeight({
        BASE_LAND_Y,
        continentalness: tv.continentalness,
        erosion: tv.erosion,
        ridges: tv.ridges,
        peaksValleys: tv.peaksValleys,
        terrainNoise,
        cliffNoise,
        peakNoise,
        jaggedNoise,
      }),
      Desert: TerrainModules.desert.getHeight({ BASE_LAND_Y, continentalMask, bigDuneNoise, duneDetailNoise, rockMaskNoise }),
      'Snowy Plains': TerrainModules.snowyPlains.getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }),
      Forest: TerrainModules.oakForest.getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }),
      'Jungle Forest': TerrainModules.jungleForest.getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }),
      Plains: TerrainModules.plains.getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }),
    };

    let blendedHeight = 0;
    let blendedWeight = 0;
    for (const [name, weight] of Object.entries(weights)) {
      const w = Number(weight) || 0;
      if (w <= 0) continue;
      const hBiome = biomeHeights[name];
      if (!Number.isFinite(hBiome)) continue;
      blendedHeight += hBiome * w;
      blendedWeight += w;
    }
    if (blendedWeight <= 0) {
      blendedHeight = biomeHeights.Plains;
      blendedWeight = 1;
    } else {
      blendedHeight /= blendedWeight;
    }

    const selectedBiomeHeight = biomeHeights[biome] ?? blendedHeight;
    const selectedBiomeWeight = clamp01(Number(weights[biome] || 0));
    const dominantBlend = 0.35 + selectedBiomeWeight * 0.45;
    let h = lerp(blendedHeight, selectedBiomeHeight, dominantBlend);

    const mountainWeight = Number(weights.Mountains || 0);
    h += detailNoise * (0.36 + mountainWeight * 0.64);

    const riverInfluence = getRiverMask(wx, wz);
    h = TerrainModules.river.applyHeight({ height: h, riverInfluence, SEA_LEVEL });

    const ravine = getRavineMask(wx, wz);
    const oceanWeight = Number(weights.Ocean || 0);
    if (ravine > 0.84 && oceanWeight < 0.72) h -= (ravine - 0.84) * 55;

    if (mountainWeight > 0.52 && h < SEA_LEVEL + 8) h = SEA_LEVEL + 8;
    if (h < SEA_LEVEL - 6 && oceanWeight < 0.52) h = SEA_LEVEL - 6;

    const biomeInfo = getBiomeInfo(biome, TerrainModules);
    if (Number.isFinite(biomeInfo?.maxHeight)) h = Math.min(h, biomeInfo.maxHeight);

    return Math.floor(h);
  }

  window.SingleplayerBiomeMap = {
    BIOME_CLIMATE_TARGETS,
    biomeWeights,
    getBiome,
    getBiomeInfo,
    getNoiseGroundHeight,
    getTerrainModuleForBiome,
    isOceanBiomeName,
    sampleClimateVector,
    sampleTerrainVector,
  };
})();
