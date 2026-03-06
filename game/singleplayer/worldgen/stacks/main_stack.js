(function () {
  const C = () => window.WorldgenLayers.Constants;
  const P = () => window.WorldgenLayerPrograms;

  class MainBiomeStack {
    constructor(layerOps, settings = {}) {
      this.ops = layerOps;
      this.settings = settings;
    }

    sampleLegacyMain(wx, wz) {
      const p = P();
      let land = p.main_island({ ops: this.ops, wx, wz });
      land = p.main_zoom_4096_2048({ ops: this.ops, wx, wz, value: land });
      land = p.main_add_island_2048({ ops: this.ops, wx, wz, value: land });
      land = p.main_zoom_2048_1024({ ops: this.ops, wx, wz, value: land });
      land = p.main_add_island_1024_a({ ops: this.ops, wx, wz, value: land });
      land = p.main_add_island_1024_b({ ops: this.ops, wx, wz, value: land });
      land = p.main_add_island_1024_c({ ops: this.ops, wx, wz, value: land });
      land = p.main_remove_too_much_ocean({ ops: this.ops, wx, wz, value: land });

      let temp = p.main_add_temperatures({ ops: this.ops, wx, wz, land });
      land = p.main_add_island_post_temperature({ ops: this.ops, wx, wz, value: land });
      temp = p.main_warm_to_temperate({ ops: this.ops, wx, wz, value: temp });
      temp = p.main_freezing_to_cold({ ops: this.ops, wx, wz, value: temp });
      temp = p.main_add_biome_variants({ ops: this.ops, wx, wz, value: temp });

      land = p.main_zoom_1024_512({ ops: this.ops, wx, wz, value: land });
      temp = p.main_zoom_climate_1024_512({ ops: this.ops, wx, wz, value: temp });
      land = p.main_zoom_512_256({ ops: this.ops, wx, wz, value: land });
      temp = p.main_zoom_climate_512_256({ ops: this.ops, wx, wz, value: temp });
      land = p.main_add_island_256({ ops: this.ops, wx, wz, value: land });
      land = p.main_add_mushroom_island({ ops: this.ops, wx, wz, value: land });
      land = p.main_add_deep_ocean({ ops: this.ops, wx, wz, value: land });

      return { land, temp };
    }

    sampleBiomeStack(wx, wz, baseLand, baseTemp, hillNoise) {
      const p = P();
      let biome = p.biome_temperature_to_biome({ ops: this.ops, wx, wz, value: baseTemp });
      if (this.settings.enableBambooJungleVariant) {
        biome = p.biome_bamboo_jungle({ ops: this.ops, wx, wz, value: biome });
      }
      biome = p.biome_zoom_256_128({ ops: this.ops, wx, wz, value: biome });
      biome = p.biome_zoom_128_64({ ops: this.ops, wx, wz, value: biome });
      biome = p.biome_biome_edge({ ops: this.ops, wx, wz, value: biome });
      biome = p.biome_region_hills({ ops: this.ops, wx, wz, value: biome, hillNoise });
      if (this.settings.enableSunflowerPlainsVariant) {
        biome = p.biome_sunflower_plains({ ops: this.ops, wx, wz, value: biome });
      }
      biome = p.biome_zoom_64_32({ ops: this.ops, wx, wz, value: biome });
      const land32 = p.biome_add_island_32({ ops: this.ops, wx, wz, land: baseLand });
      biome = land32 === C().LAND ? biome : 'Ocean';
      biome = p.biome_zoom_32_16({ ops: this.ops, wx, wz, value: biome });
      biome = p.biome_shore({ ops: this.ops, wx, wz, value: biome });
      biome = p.biome_zoom_16_8({ ops: this.ops, wx, wz, value: biome });
      biome = p.biome_zoom_8_4({ ops: this.ops, wx, wz, value: biome });
      biome = p.biome_smooth({ ops: this.ops, wx, wz, value: biome });
      return biome;
    }
  }

  window.WorldgenStacks = window.WorldgenStacks || {};
  window.WorldgenStacks.MainBiomeStack = MainBiomeStack;
})();
