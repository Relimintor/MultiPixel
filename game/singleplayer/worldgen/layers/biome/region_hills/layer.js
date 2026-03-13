(function () {
  window.WorldgenLayerPrograms.biome_region_hills = function ({ ops, wx, wz, value, hillNoise }) {
    return ops.regionHills(value, hillNoise, wx, wz, 64);
  };
})();
