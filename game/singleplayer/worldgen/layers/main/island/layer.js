(function () {
  window.WorldgenLayerPrograms.main_island = function ({ ops, wx, wz }) {
    const c = ops.toCell(wx, wz, 4096);
    return ops.island(c.x, c.z);
  };
})();
