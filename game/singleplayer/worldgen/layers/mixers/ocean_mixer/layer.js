(function () {
  window.WorldgenLayerPrograms.mix_ocean = function ({ ops, biome, oceanTempNoise }) {
    if (biome === 'Ocean' || biome === 'Deep Ocean') {
      return ops.classifyOceanTemperature(oceanTempNoise);
    }
    return biome;
  };
})();
