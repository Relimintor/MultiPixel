(function () {
  window.WorldgenLayerPrograms.river_noise_to_river = function ({ ops, value }) {
    return ops.riverFromPatchNoise(Number(value));
  };
})();
