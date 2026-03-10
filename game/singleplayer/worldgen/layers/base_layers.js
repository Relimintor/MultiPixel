(function () {
  const C = {
    OCEAN: 0,
    LAND: 1,
    DEEP_OCEAN: 2,
    WARM: 10,
    TEMPERATE: 11,
    COLD: 12,
    FREEZING: 13,
    SPECIAL: 14,
    WARM_SPECIAL: 15,
    TEMPERATE_SPECIAL: 16,
    COLD_SPECIAL: 17,
  };

  class LayerOps {
    constructor({ seed, random, perlin, settings = {} }) {
      this.seed = seed | 0;
      this.random = random;
      this.perlin = perlin;
      this.settings = settings;
    }

    toCell(wx, wz, scale) {
      return { x: Math.floor(wx / scale), z: Math.floor(wz / scale) };
    }

    island(cellX, cellZ) {
      // Seed larger continental anchors so later island-add passes connect into wider landmasses.
      return this.random.pick2D(cellX, cellZ, this.seed + 101, 8) === 0 ? C.LAND : C.OCEAN;
    }

    zoom(parentValue, wx, wz, fromScale, toScale, salt) {
      // "Photocopier" zoom: keep parent value, with occasional edge mistakes.
      const parent = this.toCell(wx, wz, fromScale);
      const child = this.toCell(wx, wz, toScale);
      const edgeX = (child.x % 2) === 1;
      const edgeZ = (child.z % 2) === 1;
      if (!edgeX && !edgeZ) return parentValue;

      const n = this.perlin.noise2D(parent.x * 0.27 + salt, parent.z * 0.27 - salt);
      const jitter = this.random.at2D(child.x, child.z, this.seed + salt + 900);
      const shouldMistake = (edgeX || edgeZ) && n > 0.78 && jitter < 0.46;
      if (!shouldMistake) return parentValue;

      if (parentValue === C.LAND) return C.OCEAN;
      if (parentValue === C.OCEAN) return C.LAND;
      return parentValue;
    }


    zoomNumeric(value, wx, wz, fromScale, toScale, salt) {
      const parent = this.toCell(wx, wz, fromScale);
      const child = this.toCell(wx, wz, toScale);
      const localX = (child.x % 2) * 2 - 1;
      const localZ = (child.z % 2) * 2 - 1;
      const n = this.perlin.noise2D(parent.x * 0.22 + salt * 0.01, parent.z * 0.22 - salt * 0.01);
      const jitter = this.random.at2D(child.x, child.z, this.seed + salt + 1200) * 2 - 1;
      const edgeBias = (localX + localZ) * 0.05;
      const mixedNoise = n * 0.68 + jitter * 0.32 + edgeBias;
      return value * 0.74 + mixedNoise * 0.26;
    }

    zoomClimate(temp, wx, wz, toScale, salt) {
      const c = this.toCell(wx, wz, toScale);
      const n = this.perlin.noise2D(c.x * 0.39 + salt, c.z * 0.39 - salt);
      if (temp === C.WARM && n > 0.74) return C.TEMPERATE;
      if (temp === C.COLD && n < -0.74) return C.FREEZING;
      if (temp === C.TEMPERATE && n > 0.82) return C.WARM;
      return temp;
    }

    addIsland(current, wx, wz, scale, salt) {
      const c = this.toCell(wx, wz, scale);
      const r = this.random.at2D(c.x, c.z, this.seed + salt);
      const localShape = this.perlin.noise2D(c.x * 0.43 + salt, c.z * 0.43 - salt);
      const continentalBand = this.perlin.noise2D(c.x * 0.16 + salt * 0.11, c.z * 0.16 - salt * 0.11);
      const bridgeBand = this.perlin.noise2D(c.x * 0.22 + 200 + salt, c.z * 0.22 - 200 - salt);
      const continentalBias = Math.max(0, Math.min(1, (continentalBand + 1) * 0.5));
      if (current === C.LAND) {
        // Keep terrain chunks connected by reducing erosion on continental cores.
        const erosionChance = 0.012 * (1 - continentalBias * 0.75);
        return (r < erosionChance && localShape < -0.72) ? C.OCEAN : C.LAND;
      }
      // Expand more aggressively on continent bands and occasionally bridge nearby oceans.
      const bridgeBoost = bridgeBand > 0.42 ? 0.12 : 0;
      const expansionChance = 0.18 + continentalBias * 0.28 + bridgeBoost;
      const shapeGate = localShape > (-0.04 - continentalBias * 0.14);
      return (r < expansionChance && shapeGate) ? C.LAND : C.OCEAN;
    }

    removeTooMuchOcean(current, wx, wz, scale) {
      if (current === C.LAND) return C.LAND;
      const c = this.toCell(wx, wz, scale);
      const n = this.perlin.noise2D(c.x * 0.37 + 17, c.z * 0.37 - 13);
      const r = this.random.at2D(c.x, c.z, this.seed + 222);
      return (n > 0.12 && r < 0.62) ? C.LAND : C.OCEAN;
    }

    addTemperatures(landMask, wx, wz, scale) {
      if (landMask !== C.LAND) return C.OCEAN;
      const c = this.toCell(wx, wz, scale);
      const r = this.random.at2D(c.x, c.z, this.seed + 303);
      const ratios = this.settings.temperatureRatios || { warm: 4 / 6, cold: 1 / 6, freezing: 1 / 6 };
      const warmCutoff = Math.max(0, Math.min(1, Number(ratios.warm) || (4 / 6)));
      const coldCutoff = Math.max(warmCutoff, Math.min(1, warmCutoff + (Number(ratios.cold) || (1 / 6))));
      const specialChance = Number(this.settings.specialRegionChance) || (1 / 13);
      const special = this.random.at2D(c.x, c.z, this.seed + 304) < specialChance;

      let baseTemp = C.FREEZING;
      if (r < warmCutoff) baseTemp = C.WARM;
      else if (r < coldCutoff) baseTemp = C.COLD;

      if (!special) return baseTemp;
      if (baseTemp === C.WARM) return C.WARM_SPECIAL;
      if (baseTemp === C.COLD) return C.COLD_SPECIAL;
      return C.TEMPERATE_SPECIAL;
    }

    warmToTemperate(temp, wx, wz, scale) {
      const special = temp === C.WARM_SPECIAL;
      if (temp !== C.WARM && !special) return temp;
      const c = this.toCell(wx, wz, scale);
      const n = this.perlin.noise2D(c.x * 0.41 + 90, c.z * 0.41 - 90);
      if (n < -0.08) return special ? C.TEMPERATE_SPECIAL : C.TEMPERATE;
      return temp;
    }

    freezingToCold(temp, wx, wz, scale) {
      if (temp !== C.FREEZING) return temp;
      const c = this.toCell(wx, wz, scale);
      const n = this.perlin.noise2D(c.x * 0.41 - 70, c.z * 0.41 + 77);
      return n > 0.32 ? C.COLD : temp;
    }

    addBiomeVariants(temp, wx, wz, scale) {
      // Layer 13: mark some climates as special biome candidates.
      // warm -> badlands, temperate -> jungle, cold -> giant taiga.
      if (temp !== C.WARM && temp !== C.TEMPERATE && temp !== C.COLD) return temp;
      const c = this.toCell(wx, wz, scale);
      const makeSpecial = this.random.pick2D(c.x, c.z, this.seed + 401, 13) === 0;
      if (!makeSpecial) return temp;
      if (temp === C.WARM) return C.WARM_SPECIAL;
      if (temp === C.COLD) return C.COLD_SPECIAL;
      return C.TEMPERATE_SPECIAL;
    }

    mushroomIsland(oceanMask, wx, wz, scale) {
      if (oceanMask !== C.OCEAN) return oceanMask;
      const c = this.toCell(wx, wz, scale);
      return this.random.pick2D(c.x, c.z, this.seed + 811, 100) === 0 ? 99 : oceanMask;
    }

    deepOcean(landMask, wx, wz, scale) {
      if (landMask === C.LAND || landMask === 99) return landMask;
      const c = this.toCell(wx, wz, scale);
      const n = this.perlin.noise2D(c.x * 0.49 + 33, c.z * 0.49 + 33);
      return n < -0.19 ? C.DEEP_OCEAN : C.OCEAN;
    }

    temperatureToBiome(temp, wx, wz, scale) {
      const c = this.toCell(wx, wz, scale);
      const r = this.random.at2D(c.x, c.z, this.seed + 1200);
      const humidityNoise = this.perlin.noise2D(c.x * 0.51 + 340, c.z * 0.51 - 210);
      const warmSpecial = temp === C.WARM_SPECIAL;
      const temperateSpecial = temp === C.TEMPERATE_SPECIAL || temp === C.SPECIAL;
      const coldSpecial = temp === C.COLD_SPECIAL;

      if (warmSpecial) return 'Badlands Plateau';
      if (temperateSpecial) return 'Jungle';
      if (coldSpecial) return 'Giant Tree Taiga';

      if (temp === C.WARM) {
        // Keep jungles in the hottest/wettest cells (humidity noise band 0.3..1.0).
        if (humidityNoise >= 0.3) return 'Jungle';
        if (r < 0.32) return 'Desert';
        if (r < 0.66) return 'Savanna';
        return 'Plains';
      }
      if (temp === C.TEMPERATE) {
        if (r < 0.50) return 'Forest';
        if (r < 0.80) return 'Plains';
        return 'Mountains';
      }
      if (temp === C.COLD) {
        if (r < 0.55) return 'Taiga';
        return 'Mountains';
      }
      if (temp === C.FREEZING) {
        if (r < 0.72) return 'Snowy Plains';
        return 'Snowy Mountains';
      }
      return 'Ocean';
    }

    bambooJungleVariant(biome, wx, wz, scale) {
      if (!this.settings.enableBambooJungleVariant) return biome;
      if (biome !== 'Jungle') return biome;
      const c = this.toCell(wx, wz, scale);
      const roll = this.random.pick2D(c.x, c.z, this.seed + 1301, 10);
      if (roll !== 0) return biome;
      return 'Bamboo Jungle';
    }

    sunflowerPlainsVariant(biome, wx, wz, scale) {
      if (!this.settings.enableSunflowerPlainsVariant) return biome;
      if (biome !== 'Plains') return biome;
      const c = this.toCell(wx, wz, scale);
      const roll = this.random.pick2D(c.x, c.z, this.seed + 1302, 57);
      if (roll !== 0) return biome;
      return 'Sunflower Plains';
    }

    biomeEdge(biome, wx, wz, scale) {
      const c = this.toCell(wx, wz, scale);
      const edge = this.perlin.noise2D(c.x * 0.57 + 201, c.z * 0.57 - 201);
      if (biome === 'Desert' && edge < -0.35) return 'Plains';
      if (biome === 'Snowy Plains' && edge > 0.35) return 'Mountains';
      return biome;
    }

    regionHills(biome, hillNoise, wx, wz, scale) {
      const c = this.toCell(wx, wz, scale);
      const roll = this.random.at2D(c.x, c.z, this.seed + 1400);
      const configuredHillChance = Number(this.settings.regionHillChance);
      const hillChance = Number.isFinite(configuredHillChance) ? Math.max(0, Math.min(1, configuredHillChance)) : 0.08;
      if (roll > hillChance) return biome;
      if (biome === 'Desert') return 'Desert Hills';
      if (biome === 'Forest' || biome === 'Birch Forest') return 'Wooded Hills';
      if (biome === 'Plains' || biome === 'Sunflower Plains') return 'Windswept Hills';
      if (biome === 'Jungle') return 'Jungle Hills';
      if (biome === 'Bamboo Jungle') return 'Bamboo Jungle Hills';
      if (biome === 'Taiga') return 'Taiga Hills';
      if (biome === 'Snowy Taiga') return 'Snowy Taiga Hills';
      if (biome === 'Savanna') return 'Savanna Plateau';
      if (biome === 'Badlands') return 'Eroded Badlands';
      if (biome === 'Mountains') return hillNoise > 0.56 ? 'Gravelly Mountains' : 'Wooded Mountains';
      if (biome === 'Snowy Tundra') return 'Snowy Mountains';
      if (biome === 'Ocean' && hillNoise > 0.5) return 'Plains';
      if (biome === 'Deep Ocean' && hillNoise > 0.55) return 'Forest';
      return biome;
    }

    shore(biome, wx, wz, scale) {
      const c = this.toCell(wx, wz, scale);
      const n = this.perlin.noise2D(c.x * 0.62 + 22, c.z * 0.62 - 22);
      if (biome === 'Mushroom Fields' && n > 0.42 && n < 0.54) return 'Mushroom Field Shore';
      if (biome === 'Snowy Tundra' || biome === 'Snowy Plains' || biome === 'Snowy Mountains' || biome === 'Snowy Taiga') {
        if (n > 0.38 && n < 0.52) return 'Snowy Beach';
      }
      if (biome === 'Mountains' || biome === 'Wooded Mountains' || biome === 'Gravelly Mountains') {
        if (n > 0.40 && n < 0.53) return 'Stone Shore';
      }
      if (biome !== 'Ocean' && biome !== 'Deep Ocean' && n > 0.38 && n < 0.5) return 'Beach';
      return biome;
    }

    smoothBiome(biome, wx, wz, scale) {
      const c = this.toCell(wx, wz, scale);
      const n = this.perlin.noise2D(c.x * 0.67 + 71, c.z * 0.67 - 71);
      if (n > 0.93) return 'Plains';
      if (n < -0.93 && biome === 'Desert Hills') return 'Desert';
      return biome;
    }

    whiteNoise(wx, wz, scale, salt) {
      const c = this.toCell(wx, wz, scale);
      return this.random.at2D(c.x, c.z, this.seed + salt) * 2 - 1;
    }

    riverFromPatchNoise(n) {
      return 1 - Math.min(1, Math.abs(n) / 0.12);
    }

    smoothValue(v, wx, wz, scale, salt) {
      const c = this.toCell(wx, wz, scale);
      const s1 = this.random.at2D(c.x + 1, c.z, this.seed + salt) * 2 - 1;
      const s2 = this.random.at2D(c.x, c.z + 1, this.seed + salt) * 2 - 1;
      return v * 0.65 + s1 * 0.175 + s2 * 0.175;
    }

    oceanTemperature(wx, wz, scale) {
      const c = this.toCell(wx, wz, scale);
      return this.perlin.noise2D(c.x * 0.19 + 110, c.z * 0.19 - 160);
    }

    classifyOceanTemperature(t) {
      if (t > 0.35) return 'Warm Ocean';
      if (t > 0.08) return 'Lukewarm Ocean';
      if (t < -0.42) return 'Frozen Ocean';
      return 'Cold Ocean';
    }

    voronoiBreakup(biome, wx, wz) {
      // Keep final biome map continuous at block scale.
      // The old high-frequency fallback created tiny 2x2/3x3 biome speckles.
      const coarseX = Math.floor(wx / 16);
      const coarseZ = Math.floor(wz / 16);
      const edgeNoise = this.perlin.noise2D(coarseX * 0.12 + 901, coarseZ * 0.12 - 901);
      if (edgeNoise > 0.995) return 'Plains';
      return biome;
    }
  }

  window.WorldgenLayers = window.WorldgenLayers || {};
  window.WorldgenLayers.Constants = C;
  window.WorldgenLayers.LayerOps = LayerOps;
})();
