(function () {
  window.WorldgenLayerPrograms.river_zoom_64_32 = function ({ ops, wx, wz, value }) {
    return ops.zoomNumeric(value, wx, wz, 64, 32, 3001);
  };
})();
