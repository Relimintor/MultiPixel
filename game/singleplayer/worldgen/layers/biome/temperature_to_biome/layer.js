(function () {
  window.WorldgenLayerPrograms.biome_temperature_to_biome = function ({ ops, wx, wz, value }) {
    return ops.temperatureToBiome(value, wx, wz, 256);
  };
})();
