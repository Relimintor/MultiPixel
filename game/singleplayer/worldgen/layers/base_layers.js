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
  };

  class LayerOps {
    constructor({ seed, random, perlin }) {
      this.seed = seed | 0;
      this.random = random;
      this.perlin = perlin;
    }

    toCell(wx, wz, scale) {
      return { x: Math.floor(wx / scale), z: Math.floor(wz / scale) };
    }

    island(cellX, cellZ) {
      return this.random.at2D(cellX, cellZ, this.seed + 101) < 0.1 ? C.LAND : C.OCEAN;
    }

    zoom(parentValue, wx, wz, fromScale, toScale, salt) {
      // "Photocopier" zoom: mostly parent, with edge mistakes.
      const n = this.perlin.noise2D((wx / toScale) * 0.21 + salt, (wz / toScale) * 0.21 - salt);
      if (n > 0.72) {
        if (parentValue === C.LAND) return C.OCEAN;
        if (parentValue === C.OCEAN) return C.LAND;
      }
      return parentValue;
    }


    zoomNumeric(value, wx, wz, fromScale, toScale, salt) {
      const n = this.perlin.noise2D((wx / toScale) * 0.18 + salt * 0.01, (wz / toScale) * 0.18 - salt * 0.01);
      return value * 0.72 + n * 0.28;
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
      const n = this.perlin.noise2D(c.x * 0.43 + salt, c.z * 0.43 - salt);
      if (current === C.LAND) {
        // slight erosion
        return (r < 0.03 && n < -0.55) ? C.OCEAN : C.LAND;
      }
      // expand into water corners
      return (r < 0.22 && n > 0.12) ? C.LAND : C.OCEAN;
    }

    removeTooMuchOcean(current, wx, wz, scale) {
      if (current === C.LAND) return C.LAND;
      const c = this.toCell(wx, wz, scale);
      const n = this.perlin.noise2D(c.x * 0.37 + 17, c.z * 0.37 - 13);
      const r = this.random.at2D(c.x, c.z, this.seed + 222);
      return (n > 0.25 && r < 0.5) ? C.LAND : C.OCEAN;
    }

    addTemperatures(landMask, wx, wz, scale) {
      if (landMask !== C.LAND) return C.OCEAN;
      const c = this.toCell(wx, wz, scale);
      const r = this.random.at2D(c.x, c.z, this.seed + 303);
      const special = this.random.at2D(c.x, c.z, this.seed + 304) < (1 / 13);
      if (special) return C.SPECIAL;
      if (r < 4 / 6) return C.WARM;
      if (r < 5 / 6) return C.COLD;
      return C.FREEZING;
    }

    warmToTemperate(temp, wx, wz, scale) {
      if (temp !== C.WARM) return temp;
      const c = this.toCell(wx, wz, scale);
      const n = this.perlin.noise2D(c.x * 0.41 + 90, c.z * 0.41 - 90);
      return n < -0.08 ? C.TEMPERATE : temp;
    }

    freezingToCold(temp, wx, wz, scale) {
      if (temp !== C.FREEZING) return temp;
      const c = this.toCell(wx, wz, scale);
      const n = this.perlin.noise2D(c.x * 0.41 - 70, c.z * 0.41 + 77);
      return n > -0.02 ? C.COLD : temp;
    }

    addBiomeVariants(temp, wx, wz, scale) {
      // keeps climate type, marks via noise for diversified biome pick downstream.
      const c = this.toCell(wx, wz, scale);
      const n = this.perlin.noise2D(c.x * 0.53 + 6, c.z * 0.53 - 6);
      if (temp === C.TEMPERATE && n > 0.62) return C.TEMPERATE;
      return temp;
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

      if (temp === C.WARM) {
        if (r < 0.50) return 'Desert';
        if (r < 0.83) return 'Savanna';
        return 'Plains';
      }
      if (temp === C.TEMPERATE) {
        if (r < 0.58) return 'Forest';
        if (r < 0.85) return 'Plains';
        return 'Mountains';
      }
      if (temp === C.COLD) {
        if (r < 0.52) return 'Forest';
        if (r < 0.84) return 'Mountains';
        return 'Snowy Plains';
      }
      if (temp === C.FREEZING) return 'Snowy Plains';
      if (temp === C.SPECIAL) {
        if (r < 1 / 3) return 'Badlands Plateau';
        if (r < 2 / 3) return 'Jungle';
        return 'Giant Taiga';
      }
      return 'Ocean';
    }

    bambooJungleVariant(biome, wx, wz, scale) {
      if (biome !== 'Jungle') return biome;
      const c = this.toCell(wx, wz, scale);
      return this.random.pick2D(c.x, c.z, this.seed + 1300, 10) === 0 ? 'Bamboo Jungle' : biome;
    }

    sunflowerPlainsVariant(biome, wx, wz, scale) {
      if (biome !== 'Plains') return biome;
      const c = this.toCell(wx, wz, scale);
      return this.random.pick2D(c.x, c.z, this.seed + 1301, 57) === 0 ? 'Sunflower Plains' : biome;
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
      if (roll > 0.08) return biome;
      if (biome === 'Desert') return 'Mountains';
      if (biome === 'Forest') return 'Mountains';
      if (biome === 'Plains') return 'Mountains';
      if (biome === 'Ocean' && hillNoise > 0.5) return 'Plains';
      if (biome === 'Deep Ocean' && hillNoise > 0.55) return 'Forest';
      return biome;
    }

    shore(biome, wx, wz, scale) {
      const c = this.toCell(wx, wz, scale);
      const n = this.perlin.noise2D(c.x * 0.62 + 22, c.z * 0.62 - 22);
      if (biome !== 'Ocean' && biome !== 'Deep Ocean' && n > 0.38 && n < 0.5) return 'Beach';
      return biome;
    }

    smoothBiome(biome, wx, wz, scale) {
      const c = this.toCell(wx, wz, scale);
      const n = this.perlin.noise2D(c.x * 0.67 + 71, c.z * 0.67 - 71);
      if (n > 0.88) return 'Plains';
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
      const jx = this.perlin.noise2D(wx * 0.09 + 901, wz * 0.09 - 901);
      const jz = this.perlin.noise2D(wx * 0.09 - 377, wz * 0.09 + 377);
      if (Math.abs(jx) + Math.abs(jz) > 1.72) return 'Plains';
      return biome;
    }
  }

  window.WorldgenLayers = window.WorldgenLayers || {};
  window.WorldgenLayers.Constants = C;
  window.WorldgenLayers.LayerOps = LayerOps;
})();
