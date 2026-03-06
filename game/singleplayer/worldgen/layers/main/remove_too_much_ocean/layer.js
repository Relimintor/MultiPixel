(function () {
  window.WorldgenLayerPrograms.main_remove_too_much_ocean = function ({ ops, wx, wz, value }) {
    return ops.removeTooMuchOcean(value, wx, wz, 1024);
  };
})();
