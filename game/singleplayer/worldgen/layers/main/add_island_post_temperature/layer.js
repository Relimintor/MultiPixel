(function () {
  window.WorldgenLayerPrograms.main_add_island_post_temperature = function ({ ops, wx, wz, value }) {
    return ops.addIsland(value, wx, wz, 1024, 7);
  };
})();
