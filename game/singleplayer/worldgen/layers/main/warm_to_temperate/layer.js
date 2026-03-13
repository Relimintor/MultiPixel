(function () {
  window.WorldgenLayerPrograms.main_warm_to_temperate = function ({ ops, wx, wz, value }) {
    return ops.warmToTemperate(value, wx, wz, 1024);
  };
})();
