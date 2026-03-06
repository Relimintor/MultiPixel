(function () {
  window.WorldgenLayerPrograms.main_add_deep_ocean = function ({ ops, wx, wz, value }) {
    return ops.deepOcean(value, wx, wz, 256);
  };
})();
