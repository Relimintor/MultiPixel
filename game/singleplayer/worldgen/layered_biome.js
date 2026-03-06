(function () {
  const CELL = {
    OCEAN: 0,
    LAND: 1,
    WARM: 2,
    TEMPERATE: 3,
    COLD: 4,
    FREEZING: 5,
    SPECIAL: 6,
  };

  const BIOME = {
    OCEAN: 'Ocean',
    DEEP_OCEAN: 'Ocean',
    RIVER: 'River',
    FROZEN_RIVER: 'River',
    PLAINS: 'Plains',
    FOREST: 'Forest',
    DESERT: 'Desert',
    MOUNTAINS: 'Mountains',
    SNOWY_PLAINS: 'Snowy Plains',
    MUSHROOM: 'Mushroom Fields',
  };

  class LayeredBiomePipeline {
    constructor({ seed, random, perlin }) {
      this.seed = seed | 0;
      this.random = random;
      this.perlin = perlin;
    }

    at(wx, wz) {
      const main = this.mainStack(wx, wz);
      const river = this.riverStack(wx, wz);
      const oceanTemp = this.oceanTempStack(wx, wz);
      const finalBiome = this.mixBiome(main, river, oceanTemp);
      return {
        biome: finalBiome,
        riverMask: river.mask,
        hillMask: main.hillMask,
        deepOcean: main.deepOcean,
        tempBand: main.tempBand,
      };
    }

    mainStack(wx, wz) {
      const coarseX = Math.floor(wx / 4096);
      const coarseZ = Math.floor(wz / 4096);
      const island = this.islandLayer(coarseX, coarseZ);

      const zoomed = this.zoomAndIslands(wx, wz);
      const oceanFixed = this.removeTooMuchOcean(zoomed.land, wx, wz);
      const tempBand = this.temperatureLayer(oceanFixed, wx, wz);
      const biome = this.temperatureToBiome(tempBand, wx, wz);
      const withMushroom = this.mushroomLayer(biome, wx, wz);
      const deepOcean = this.deepOceanLayer(withMushroom, wx, wz);
      const hillMask = this.regionHillsNoise(wx, wz);
      const smoothedBiome = this.smoothBiome(deepOcean, wx, wz);

      return {
        island,
        land: oceanFixed,
        tempBand,
        biome: smoothedBiome,
        deepOcean,
        hillMask,
      };
    }

    islandLayer(x, z) {
      return this.random.valueAt2D(x, z, this.seed + 101) < 0.1 ? CELL.LAND : CELL.OCEAN;
    }

    zoomAndIslands(wx, wz) {
      const v = this.perlin.fbm2D(wx * 0.00035, wz * 0.00035, 4, 2, 0.52);
      const islandNoise = this.perlin.noise2D(wx * 0.0012 + 17, wz * 0.0012 - 31);
      return (v + islandNoise * 0.35) > -0.04 ? CELL.LAND : CELL.OCEAN;
    }

    removeTooMuchOcean(land, wx, wz) {
      if (land === CELL.LAND) return CELL.LAND;
      const n = this.perlin.noise2D(wx * 0.0018 + 90, wz * 0.0018 - 120);
      if (n > 0.35) return CELL.LAND;
      return CELL.OCEAN;
    }

    temperatureLayer(land, wx, wz) {
      if (land === CELL.OCEAN) return CELL.OCEAN;
      const t = this.perlin.noise2D(wx * 0.00085 - 111, wz * 0.00085 + 207);
      const special = this.random.valueAt2D(wx >> 4, wz >> 4, this.seed + 1337) < (1 / 13);
      if (t > 0.35) return special ? CELL.SPECIAL : CELL.WARM;
      if (t > -0.05) return special ? CELL.SPECIAL : CELL.TEMPERATE;
      if (t > -0.42) return special ? CELL.SPECIAL : CELL.COLD;
      return CELL.FREEZING;
    }

    temperatureToBiome(tempBand, wx, wz) {
      if (tempBand === CELL.OCEAN) return BIOME.OCEAN;

      if (tempBand === CELL.SPECIAL) {
        const pick = this.random.valueAt2D(wx >> 5, wz >> 5, this.seed + 71);
        if (pick < 0.34) return BIOME.DESERT;
        if (pick < 0.67) return BIOME.FOREST;
        return BIOME.MOUNTAINS;
      }

      const roll = this.random.valueAt2D(wx >> 5, wz >> 5, this.seed + 72);
      if (tempBand === CELL.WARM) {
        if (roll < 0.5) return BIOME.DESERT;
        if (roll < 0.83) return BIOME.PLAINS;
        return BIOME.FOREST;
      }
      if (tempBand === CELL.TEMPERATE) {
        if (roll < 0.55) return BIOME.PLAINS;
        if (roll < 0.85) return BIOME.FOREST;
        return BIOME.MOUNTAINS;
      }
      if (tempBand === CELL.COLD) {
        if (roll < 0.62) return BIOME.FOREST;
        if (roll < 0.82) return BIOME.MOUNTAINS;
        return BIOME.SNOWY_PLAINS;
      }
      return BIOME.SNOWY_PLAINS;
    }

    mushroomLayer(biome, wx, wz) {
      if (biome !== BIOME.OCEAN) return biome;
      const chance = this.random.valueAt2D(wx >> 6, wz >> 6, this.seed + 808);
      return chance < 0.01 ? BIOME.MUSHROOM : biome;
    }

    deepOceanLayer(biome, wx, wz) {
      if (biome !== BIOME.OCEAN) return biome;
      const d = this.perlin.noise2D(wx * 0.0014 + 420, wz * 0.0014 + 420);
      return d < -0.25 ? BIOME.DEEP_OCEAN : BIOME.OCEAN;
    }

    regionHillsNoise(wx, wz) {
      return this.perlin.noise2D(wx * 0.0125 + 600, wz * 0.0125 - 600);
    }

    smoothBiome(biome, wx, wz) {
      if (biome === BIOME.MOUNTAINS) {
        const soften = this.perlin.noise2D(wx * 0.005, wz * 0.005);
        if (soften < -0.64) return BIOME.FOREST;
      }
      return biome;
    }

    riverStack(wx, wz) {
      const n = this.perlin.fbm2D(wx * 0.0028, wz * 0.0028, 3, 2, 0.5);
      const edge = 1 - Math.min(1, Math.abs(n) / 0.08);
      const mask = Math.max(0, edge);
      return { mask };
    }

    oceanTempStack(wx, wz) {
      const t = this.perlin.fbm2D(wx * 0.0006 + 90, wz * 0.0006 - 170, 5, 2, 0.5);
      return t;
    }

    mixBiome(main, river, oceanTemp) {
      if (main.biome === BIOME.MUSHROOM) return BIOME.MUSHROOM;
      if (main.biome === BIOME.OCEAN) return BIOME.OCEAN;
      if (river.mask > 0.24) {
        if (main.tempBand === CELL.FREEZING || oceanTemp < -0.45) return BIOME.FROZEN_RIVER;
        return BIOME.RIVER;
      }
      if (main.hillMask > 0.58 && main.biome === BIOME.PLAINS) return BIOME.MOUNTAINS;
      return main.biome;
    }
  }

  window.LayeredBiomePipeline = LayeredBiomePipeline;
})();
