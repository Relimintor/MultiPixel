(function () {
  window.WorldgenLayerPrograms.main_zoom_512_256 = function ({ ops, wx, wz, value }) {
    return ops.zoom(value, wx, wz, 512, 256, 9);
  };
  window.WorldgenLayerPrograms.main_zoom_climate_512_256 = function ({ ops, wx, wz, value }) {
    return ops.zoomClimate(value, wx, wz, 256, 19);
  };
})();
