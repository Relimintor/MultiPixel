(function () {
  window.WorldgenLayerPrograms.main_zoom_1024_512 = function ({ ops, wx, wz, value }) {
    return ops.zoom(value, wx, wz, 1024, 512, 8);
  };
  window.WorldgenLayerPrograms.main_zoom_climate_1024_512 = function ({ ops, wx, wz, value }) {
    return ops.zoomClimate(value, wx, wz, 512, 18);
  };
})();
