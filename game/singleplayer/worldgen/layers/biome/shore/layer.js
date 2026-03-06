(function () {
  window.WorldgenLayerPrograms.biome_shore = function ({ ops, wx, wz, value }) {
    return ops.shore(value, wx, wz, 16);
  };
})();
