(function () {
  const P = () => window.WorldgenLayerPrograms;


  const normalizeForGameplay = (biome) => {
    if (biome.includes('Ocean')) return 'Ocean';
    if (biome === 'Frozen River') return 'Snowy Plains';
    if (biome === 'River') return 'Plains';
    if (biome === 'Desert' || biome === 'Desert Hills' || biome === 'Badlands' || biome === 'Badlands Plateau' || biome === 'Wooded Badlands Plateau' || biome === 'Eroded Badlands') return 'Desert';
    if (biome === 'Mountains' || biome === 'Windswept Hills' || biome === 'Wooded Mountains' || biome === 'Gravelly Mountains' || biome === 'Mountain Edge') return 'Mountains';
    if (biome === 'Snowy Tundra' || biome === 'Snowy Plains' || biome === 'Snowy Mountains' || biome === 'Ice Spikes' || biome === 'Snowy Taiga' || biome === 'Snowy Taiga Hills' || biome === 'Snowy Taiga Mountains' || biome === 'Snowy Beach') return 'Snowy Plains';
    if (biome === 'Jungle' || biome === 'Jungle Hills' || biome === 'Jungle Edge' || biome === 'Bamboo Jungle' || biome === 'Bamboo Jungle Hills' || biome === 'Forest' || biome === 'Flower Forest' || biome === 'Birch Forest' || biome === 'Tall Birch Forest' || biome === 'Dark Forest' || biome === 'Taiga' || biome === 'Taiga Hills' || biome === 'Giant Tree Taiga' || biome === 'Giant Spruce Taiga' || biome === 'Wooded Hills' || biome === 'Mushroom Fields' || biome === 'Mushroom Field Shore') return 'Forest';
    if (biome === 'Savanna' || biome === 'Savanna Plateau' || biome === 'Shattered Savanna' || biome === 'Shattered Savanna Plateau' || biome === 'Plains' || biome === 'Sunflower Plains' || biome === 'Swamp' || biome === 'Beach' || biome === 'Stone Shore') return 'Plains';
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
