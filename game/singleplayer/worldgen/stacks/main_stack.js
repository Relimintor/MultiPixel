(function () {
  const C = () => window.WorldgenLayers.Constants;

  class MainBiomeStack {
    constructor(layerOps) {
      this.ops = layerOps;
    }

    sampleLegacyMain(wx, wz) {
      // Exact requested order from image/text, with explicit scale transitions.
      const coarse = this.ops.toCell(wx, wz, 4096);
      let land = this.ops.island(coarse.x, coarse.z);                              // Island
      land = this.ops.zoom(land, wx, wz, 4096, 2048, 1);                           // Zoom 4096->2048
      land = this.ops.addIsland(land, wx, wz, 2048, 2);                            // Add Island
      land = this.ops.zoom(land, wx, wz, 2048, 1024, 3);                           // Zoom 2048->1024
      land = this.ops.addIsland(land, wx, wz, 1024, 4);                            // Add Island
      land = this.ops.addIsland(land, wx, wz, 1024, 5);                            // Add Island
      land = this.ops.addIsland(land, wx, wz, 1024, 6);                            // Add Island
      land = this.ops.removeTooMuchOcean(land, wx, wz, 1024);                      // Remove Too Much Ocean

      let temp = this.ops.addTemperatures(land, wx, wz, 1024);                     // Add Temperatures
      land = this.ops.addIsland(land, wx, wz, 1024, 7);                            // Add Island
      temp = this.ops.warmToTemperate(temp, wx, wz, 1024);                         // Warm -> Temperate
      temp = this.ops.freezingToCold(temp, wx, wz, 1024);                          // Freezing -> Cold
      temp = this.ops.addBiomeVariants(temp, wx, wz, 1024);                        // Add Biome Variants
      land = this.ops.zoom(land, wx, wz, 1024, 512, 8);                            // Zoom 1024->512
      temp = this.ops.zoomClimate(temp, wx, wz, 512, 18);
      land = this.ops.zoom(land, wx, wz, 512, 256, 9);                             // Zoom 512->256
      temp = this.ops.zoomClimate(temp, wx, wz, 256, 19);
      land = this.ops.addIsland(land, wx, wz, 256, 10);                            // Add Island
      land = this.ops.mushroomIsland(land, wx, wz, 256);                           // Add Mushroom Island
      land = this.ops.deepOcean(land, wx, wz, 256);                                // Add Deep Ocean

      return { land, temp };
    }

    sampleBiomeStack(wx, wz, baseLand, baseTemp, hillNoise) {
      // Second biome stack from text.
      let biome = this.ops.temperatureToBiome(baseTemp, wx, wz, 256);              // Temperature -> Biome
      biome = this.ops.bambooJungleVariant(biome, wx, wz, 256);                    // Bamboo Jungle (hook)
      biome = this.ops.zoom(biome, wx, wz, 256, 128, 20);                          // Zoom 256->128
      biome = this.ops.zoom(biome, wx, wz, 128, 64, 21);                           // Zoom 128->64
      biome = this.ops.biomeEdge(biome, wx, wz, 64);                               // Biome Edge
      biome = this.ops.regionHills(biome, hillNoise, wx, wz, 64);                  // Region Hills
      biome = this.ops.sunflowerPlainsVariant(biome, wx, wz, 64);                  // Sunflower Plains (hook)
      biome = this.ops.zoom(biome, wx, wz, 64, 32, 22);                            // Zoom 64->32
      const land32 = this.ops.addIsland(baseLand, wx, wz, 32, 23);                 // Add Island
      biome = land32 === C().LAND ? biome : 'Ocean';
      biome = this.ops.zoom(biome, wx, wz, 32, 16, 24);                            // Zoom 32->16
      biome = this.ops.shore(biome, wx, wz, 16);                                   // Shore
      biome = this.ops.zoom(biome, wx, wz, 16, 8, 25);                             // Zoom 16->8
      biome = this.ops.zoom(biome, wx, wz, 8, 4, 26);                              // Zoom 8->4
      biome = this.ops.smoothBiome(biome, wx, wz, 4);                              // Smooth

      return biome;
    }
  }

  window.WorldgenStacks = window.WorldgenStacks || {};
  window.WorldgenStacks.MainBiomeStack = MainBiomeStack;
})();
