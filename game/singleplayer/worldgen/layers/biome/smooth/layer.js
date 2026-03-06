(function () {
  window.WorldgenLayerPrograms.biome_smooth = function ({ ops, wx, wz, value }) {
    return ops.smoothBiome(value, wx, wz, 4);
  };
})();
