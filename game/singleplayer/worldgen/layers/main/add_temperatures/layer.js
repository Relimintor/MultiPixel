(function () {
  window.WorldgenLayerPrograms.main_add_temperatures = function ({ ops, wx, wz, land }) {
    return ops.addTemperatures(land, wx, wz, 1024);
  };
})();
