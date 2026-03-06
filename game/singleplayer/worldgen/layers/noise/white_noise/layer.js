(function () {
  window.WorldgenLayerPrograms.noise_white = function ({ ops, wx, wz }) {
    return ops.whiteNoise(wx, wz, 256, 2001);
  };
})();
