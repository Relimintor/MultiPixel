(function () {
  class BiomePipeline {
    constructor({ seed, random, perlin }) {
      this.ops = new window.WorldgenLayers.LayerOps({ seed, random, perlin });
      this.main = new window.WorldgenStacks.MainBiomeStack(this.ops);
      this.river = new window.WorldgenStacks.RiverStack(this.ops);
      this.oceanTemp = new window.WorldgenStacks.OceanTempStack(this.ops);
      this.hills = new window.WorldgenStacks.HillsStack(this.ops);
      this.constants = window.WorldgenLayers.Constants;
    }

    sample(wx, wz) {
      const main = this.main.sample(wx, wz);
      const riverMask = this.river.sampleMask(wx, wz);
      const oceanTemp = this.oceanTemp.sample(wx, wz);
      const hills = this.hills.sample(wx, wz);

      let biome;
      if (main.deepOcean === 99) {
        biome = 'Forest'; // mushroom fields compatibility proxy for existing block/decor set
      } else if (main.deepOcean === this.constants.OCEAN || main.deepOcean === this.constants.DEEP_OCEAN) {
        biome = 'Ocean';
      } else {
        biome = this.main.temperatureToBiome(main.temp, wx, wz);
        biome = this.main.applyVariants(biome, wx, wz);
      }

      if (biome === 'Plains' && hills > 0.58) biome = 'Mountains';
      if (biome !== 'Ocean' && biome !== 'Forest' && main.shore > 0.42 && main.shore < 0.55) biome = 'Plains';

      return {
        biome,
        riverMask,
        oceanTemp,
        hills,
        tempBand: main.temp,
      };
    }
  }

  window.WorldgenPipeline = window.WorldgenPipeline || {};
  window.WorldgenPipeline.BiomePipeline = BiomePipeline;
})();
