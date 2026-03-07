(function () {
  window.WorldgenLayerPrograms.mix_ocean = function ({ ops, biome, oceanTempNoise }) {
    if (biome === 'Ocean' || biome === 'Deep Ocean') {
      const oceanClass = ops.classifyOceanTemperature(oceanTempNoise);
      const isDeep = biome === 'Deep Ocean';
      if (!isDeep) return oceanClass;
      if (oceanClass === 'Frozen Ocean') return 'Deep Frozen Ocean';
      if (oceanClass === 'Warm Ocean') return 'Deep Lukewarm Ocean';
      if (oceanClass === 'Lukewarm Ocean') return 'Deep Lukewarm Ocean';
      return 'Deep Ocean';
    }
    return biome;
  };
})();
