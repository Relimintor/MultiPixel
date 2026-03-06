(function () {
  const C = () => window.WorldgenLayers.Constants;

  class MainBiomeStack {
    constructor(layerOps) {
      this.ops = layerOps;
    }

    sample(x, z) {
      const coarseX = Math.floor(x / 4096);
      const coarseZ = Math.floor(z / 4096);

      // Island + progressive zoom/add-island style evolution.
      let land = this.ops.island(coarseX, coarseZ);
      land = this.ops.zoomWithNoise(x, z, 4096, 1, -0.1);
      land = this.ops.addIsland(land, x, z, 2);
      land = this.ops.zoomWithNoise(x, z, 2048, 3, -0.06);
      land = this.ops.addIsland(land, x, z, 4);
      land = this.ops.addIsland(land, x, z, 5);
      land = this.ops.addIsland(land, x, z, 6);
      land = this.ops.removeTooMuchOcean(land, x, z);

      // Temperature path.
      let temp = this.ops.addTemperatures(land, x, z);
      temp = this.ops.warmToTemperate(temp, x, z);
      temp = this.ops.freezingToCold(temp, x, z);

      // Mid/late stack operators.
      const deepOcean = this.ops.deepOcean(land, x, z);
      const mushroom = this.ops.mushroomIsland(deepOcean, x, z);
      const hills = this.ops.regionHills(x, z);
      const shore = this.ops.shoreMask(x, z);

      return { land, temp, deepOcean: mushroom, hills, shore };
    }

    temperatureToBiome(temp, x, z) {
      const Cx = C();
      const r = this.ops.random.at2D(x >> 5, z >> 5, this.ops.seed + 1200);

      if (temp === Cx.WARM) {
        if (r < 0.5) return 'Desert';
        if (r < 0.83) return 'Plains';
        return 'Forest';
      }
      if (temp === Cx.TEMPERATE) {
        if (r < 0.57) return 'Plains';
        if (r < 0.87) return 'Forest';
        return 'Mountains';
      }
      if (temp === Cx.COLD) {
        if (r < 0.45) return 'Forest';
        if (r < 0.8) return 'Mountains';
        return 'Snowy Plains';
      }
      if (temp === Cx.FREEZING) return 'Snowy Plains';
      if (temp === Cx.SPECIAL) {
        if (r < 1 / 3) return 'Desert';
        if (r < 2 / 3) return 'Forest';
        return 'Mountains';
      }
      return 'Ocean';
    }

    applyVariants(baseBiome, x, z) {
      const bambooTry = this.ops.random.pick2D(x >> 3, z >> 3, this.ops.seed + 1300, 10) === 0;
      const sunflowerTry = this.ops.random.pick2D(x >> 3, z >> 3, this.ops.seed + 1301, 57) === 0;
      // Placeholder hooks for future biome IDs while keeping existing biome set compatibility.
      if (baseBiome === 'Forest' && bambooTry) return 'Forest';
      if (baseBiome === 'Plains' && sunflowerTry) return 'Plains';
      return baseBiome;
    }
  }

  window.WorldgenStacks = window.WorldgenStacks || {};
  window.WorldgenStacks.MainBiomeStack = MainBiomeStack;
})();
