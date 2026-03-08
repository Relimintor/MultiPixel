(function () {
  const MAIN_ISLAND_CELL_SCALE = 4096;

  window.WorldgenLayerPrograms.main_island = function ({ ops, wx, wz }) {
    const c = ops.toCell(wx, wz, MAIN_ISLAND_CELL_SCALE);
    return ops.island(c.x, c.z);
  };
})();
