(function () {
  window.WorldgenLayerPrograms.main_freezing_to_cold = function ({ ops, wx, wz, value }) {
    return ops.freezingToCold(value, wx, wz, 1024);
  };
})();
