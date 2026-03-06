(function () {
  const normalizeForGameplay = (biome) => {
    if (biome === 'Savanna') return 'Plains';
    if (biome === 'Badlands Plateau') return 'Desert';
    if (biome === 'Jungle' || biome === 'Bamboo Jungle' || biome === 'Giant Taiga') return 'Forest';
    if (biome === 'Sunflower Plains') return 'Plains';
    if (biome === 'Beach') return 'Plains';
    if (biome === 'Mushroom Fields') return 'Forest';
    if (biome === 'Deep Ocean' || biome.includes('Ocean')) return 'Ocean';
    return biome;
  };

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
      const mainLegacy = this.main.sampleLegacyMain(wx, wz);
      const hillNoise = this.hills.sample(wx, wz);
      let biome = this.main.sampleBiomeStack(wx, wz, mainLegacy.land, mainLegacy.temp, hillNoise);

      // River mixer.
      const riverMask = this.river.sampleMask(wx, wz, hillNoise);
      const isMushroom = mainLegacy.land === 99;
      const isOcean = mainLegacy.land === this.constants.OCEAN || mainLegacy.land === this.constants.DEEP_OCEAN;
      const isDeepOcean = mainLegacy.land === this.constants.DEEP_OCEAN;

      if (isMushroom) biome = 'Mushroom Fields';
      if (isOcean) biome = isDeepOcean ? 'Deep Ocean' : 'Ocean';

      const freezeBand = mainLegacy.temp === this.constants.FREEZING;
      const riverEnabled = !isMushroom && !isOcean;
      if (riverEnabled && riverMask > 0.24) {
        biome = freezeBand ? 'Frozen River' : 'River';
      }

      // Ocean mixer.
      const oceanTempNoise = this.oceanTemp.sample(wx, wz);
      const oceanTempClass = this.ops.classifyOceanTemperature(oceanTempNoise);
      if (biome === 'Ocean' || biome === 'Deep Ocean') {
        biome = oceanTempClass;
      }

      // Final Voronoi zoom (4->1 style edge breakup)
      biome = this.ops.voronoiBreakup(biome, wx, wz);

      return {
        biome,
        gameplayBiome: normalizeForGameplay(biome),
        riverMask,
        oceanTemp: oceanTempClass,
        hills: hillNoise,
        tempBand: mainLegacy.temp,
        noRiver: isMushroom,
        isMushroom,
      };
    }
  }

  window.WorldgenPipeline = window.WorldgenPipeline || {};
  window.WorldgenPipeline.BiomePipeline = BiomePipeline;
})();
