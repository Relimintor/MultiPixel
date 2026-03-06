(function () {
  window.WorldgenLayerPrograms.ocean_perlin_noise = function ({ ops, wx, wz }) {
    return ops.oceanTemperature(wx, wz, 256);
  };
})();
