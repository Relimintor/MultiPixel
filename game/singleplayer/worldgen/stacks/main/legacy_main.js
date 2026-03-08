(function () {
  window.WorldgenStacksMain = window.WorldgenStacksMain || {};
  window.WorldgenStacksMain.sampleLegacyMain = function (stack, wx, wz) {
    const MAIN_ISLAND_CELL_SCALE = 4096;
    const x4096 = Math.floor(wx / MAIN_ISLAND_CELL_SCALE);
    const z4096 = Math.floor(wz / MAIN_ISLAND_CELL_SCALE);
    const x256 = Math.floor(wx / 256);
    const z256 = Math.floor(wz / 256);

    const island4096 = (x, z) => stack.cached('island_4096', x, z, () => stack.ops.island(x, z));
    // Zoom passes in legacy main all use stack.zoom(...), which is the shared fuzzy 2x upscaler.
    const zoom2048 = (x, z) => stack.zoom(island4096, x, z, 1);
    const addIsland2048 = (x, z) => stack.addIsland(zoom2048, x, z, 2);
    const zoom1024 = (x, z) => stack.zoom(addIsland2048, x, z, 3);
    const addIsland1024a = (x, z) => stack.addIsland(zoom1024, x, z, 4);
    const addIsland1024b = (x, z) => stack.addIsland(addIsland1024a, x, z, 5);
    const addIsland1024c = (x, z) => stack.addIsland(addIsland1024b, x, z, 6);
    const removeOcean1024 = (x, z) => stack.removeTooMuchOcean(addIsland1024c, x, z);
    const temp1024 = (x, z) => stack.addTemperatures(removeOcean1024, x, z);
    const addIslandPostTemp1024 = (x, z) => stack.addIsland(removeOcean1024, x, z, 7);
    const tempPostIsland1024 = (x, z) => stack.expandTemperatureToLand(temp1024, addIslandPostTemp1024, x, z, 2213);
    const warmTemp1024 = (x, z) => stack.warmToTemperate(tempPostIsland1024, x, z);
    const coldTemp1024 = (x, z) => stack.freezingToCold(warmTemp1024, x, z);
    const variantTemp1024 = (x, z) => stack.addBiomeVariants(coldTemp1024, x, z);
    const zoomLand512 = (x, z) => stack.zoom(addIslandPostTemp1024, x, z, 8);
    const zoomTemp512 = (x, z) => stack.zoom(variantTemp1024, x, z, 9);
    const zoomLand256 = (x, z) => stack.zoom(zoomLand512, x, z, 10);
    const zoomTemp256 = (x, z) => stack.zoom(zoomTemp512, x, z, 11);
    const addIsland256 = (x, z) => stack.addIsland(zoomLand256, x, z, 12);
    const mushroom256 = (x, z) => stack.addMushroomIsland(addIsland256, x, z);
    const deepOcean256 = (x, z) => stack.addDeepOcean(mushroom256, x, z);
    const tempAligned256 = (x, z) => stack.expandTemperatureToLand(zoomTemp256, deepOcean256, x, z, 2214);

    return {
      island: island4096(x4096, z4096),
      land: deepOcean256(x256, z256),
      temp: tempAligned256(x256, z256),
      landFn256: deepOcean256,
      tempFn256: tempAligned256,
    };
  };
})();
