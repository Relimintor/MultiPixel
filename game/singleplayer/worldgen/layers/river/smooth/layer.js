(function () {
  window.WorldgenLayerPrograms.river_smooth = function ({ ops, wx, wz, value }) {
    const smooth = ops.smoothValue(value, wx, wz, 4, 3005);
    return Math.max(0, Math.min(1, smooth));
  };
})();
