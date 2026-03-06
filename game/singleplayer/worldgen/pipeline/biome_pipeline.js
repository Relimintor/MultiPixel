(function () {
  const P = () => window.WorldgenLayerPrograms;

  const normalizeForGameplay = (biome) => {
    if (biome === 'Savanna') return 'Plains';
    if (biome === 'Badlands Plateau') return 'Desert';
    if (biome === 'Jungle' || biome === 'Bamboo Jungle' || biome === 'Giant Taiga') return 'Forest';
    if (biome === 'Sunflower Plains') return 'Plains';
    if (biome === 'Beach' || biome === 'Frozen Beach') return 'Plains';
    if (biome === 'Desert Hills') return 'Desert';
    if (biome === 'Wooded Hills') return 'Forest';
    if (biome === 'Windswept Hills') return 'Mountains';
    if (biome === 'Mushroom Fields') return 'Forest';
    if (biome === 'Deep Ocean' || biome.includes('Ocean')) return 'Ocean';
    return biome;
  };

  class BiomePipeline {
    constructor({ seed, random, perlin, settings = {} }) {
      this.settings = settings;
      const biomeSettings = {
        enableBambooJungleVariant: Boolean(settings.enableBambooJungleVariant),
        enableSunflowerPlainsVariant: Boolean(settings.enableSunflowerPlainsVariant),
        temperatureRatios: settings.temperatureRatios,
        specialRegionChance: settings.specialRegionChance,
        regionHillChance: settings.regionHillChance,
      };
      this.ops = new window.WorldgenLayers.LayerOps({ seed, random, perlin, settings: biomeSettings });
      this.main = new window.WorldgenStacks.MainBiomeStack(this.ops, biomeSettings);
      this.river = new window.WorldgenStacks.RiverStack(this.ops);
      this.oceanTemp = new window.WorldgenStacks.OceanTempStack(this.ops);
      this.hills = new window.WorldgenStacks.HillsStack(this.ops);
      this.constants = window.WorldgenLayers.Constants;
    }

    sample(wx, wz) {
      const p = P();
      const mainLegacy = this.main.sampleLegacyMain(wx, wz);
      const hillNoise = this.hills.sample(wx, wz);
      let biome = this.main.sampleBiomeStack(wx, wz, mainLegacy, hillNoise);

      const riverMask = this.river.sampleMask(wx, wz, hillNoise);
      const isMushroom = mainLegacy.land === 99;
      const isOcean = mainLegacy.land === this.constants.OCEAN || mainLegacy.land === this.constants.DEEP_OCEAN;
      const isDeepOcean = mainLegacy.land === this.constants.DEEP_OCEAN;
      if (isMushroom) biome = 'Mushroom Fields';
      if (isOcean) biome = isDeepOcean ? 'Deep Ocean' : 'Ocean';

      const freezeBand = mainLegacy.temp === this.constants.FREEZING;
      biome = p.mix_river({ biome, riverMask, freezeBand, isMushroom, isOcean });

      const oceanTempNoise = this.oceanTemp.sample(wx, wz);
      biome = p.mix_ocean({ ops: this.ops, biome, oceanTempNoise });
      const oceanTempClass = this.ops.classifyOceanTemperature(oceanTempNoise);

      biome = p.mix_voronoi_4_1({ ops: this.ops, biome, wx, wz });

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
