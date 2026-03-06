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

    island(x, z) {
      return this.random.at2D(x, z, this.seed + 101) < 0.1 ? C.LAND : C.OCEAN;
    }

    zoomWithNoise(x, z, scale, salt, threshold = 0) {
      const n = this.perlin.noise2D(x / scale + salt * 0.0001, z / scale - salt * 0.0001);
      const w = this.perlin.noise2D(x / (scale * 0.45) - 7, z / (scale * 0.45) + 11) * 0.35;
      return (n + w) > threshold ? C.LAND : C.OCEAN;
    }

    addIsland(current, x, z, salt, chance = 0.22) {
      if (current === C.LAND) return C.LAND;
      const n = this.perlin.noise2D(x * 0.0018 + salt * 0.01, z * 0.0018 - salt * 0.01);
      const r = this.random.at2D(x >> 2, z >> 2, this.seed + salt);
      return (n > 0.28 && r < chance) ? C.LAND : current;
    }

    removeTooMuchOcean(current, x, z) {
      if (current === C.LAND) return C.LAND;
      const n = this.perlin.noise2D(x * 0.0012 + 17, z * 0.0012 - 37);
      const r = this.random.at2D(x >> 3, z >> 3, this.seed + 222);
      return (n > 0.34 && r < 0.5) ? C.LAND : C.OCEAN;
    }

    addTemperatures(landMask, x, z) {
      if (landMask !== C.LAND) return C.OCEAN;
      const r = this.random.at2D(x >> 4, z >> 4, this.seed + 303);
      const special = this.random.at2D(x >> 4, z >> 4, this.seed + 304) < (1 / 13);
      if (special) return C.SPECIAL;
      if (r < 4 / 6) return C.WARM;
      if (r < 5 / 6) return C.COLD;
      return C.FREEZING;
    }

    warmToTemperate(temp, x, z) {
      if (temp !== C.WARM) return temp;
      const n = this.perlin.noise2D(x * 0.0015 + 300, z * 0.0015 - 100);
      return n < -0.1 ? C.TEMPERATE : temp;
    }

    freezingToCold(temp, x, z) {
      if (temp !== C.FREEZING) return temp;
      const n = this.perlin.noise2D(x * 0.0015 - 260, z * 0.0015 + 120);
      return n > -0.05 ? C.COLD : temp;
    }

    deepOcean(landMask, x, z) {
      if (landMask === C.LAND) return C.LAND;
      const n = this.perlin.noise2D(x * 0.0017 + 610, z * 0.0017 + 610);
      return n < -0.24 ? C.DEEP_OCEAN : C.OCEAN;
    }

    mushroomIsland(oceanMask, x, z) {
      if (oceanMask !== C.OCEAN && oceanMask !== C.DEEP_OCEAN) return oceanMask;
      const r = this.random.pick2D(x >> 6, z >> 6, this.seed + 811, 100);
      return r === 0 ? 99 : oceanMask;
    }

    regionHills(x, z) {
      return this.perlin.noise2D(x * 0.0125 + 91, z * 0.0125 - 143);
    }

    shoreMask(x, z) {
      const n = this.perlin.noise2D(x * 0.0032 + 400, z * 0.0032 - 410);
      return n;
    }

    riverNoise(x, z) {
      const n = window.WorldgenNoise.fbm2D(this.perlin, x * 0.0028, z * 0.0028, 3, 0.5, 2.0);
      return 1 - Math.min(1, Math.abs(n) / 0.08);
    }

    oceanTemperature(x, z) {
      return window.WorldgenNoise.fbm2D(this.perlin, x * 0.0006 + 90, z * 0.0006 - 170, 5, 0.5, 2.0);
    }
  }

  window.WorldgenLayers = window.WorldgenLayers || {};
  window.WorldgenLayers.Constants = C;
  window.WorldgenLayers.LayerOps = LayerOps;
})();
