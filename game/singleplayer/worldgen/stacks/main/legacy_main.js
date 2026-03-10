(function () {
  window.WorldgenStacksMain = window.WorldgenStacksMain || {};
  window.WorldgenStacksMain.sampleLegacyMain = function (stack, wx, wz) {
    // Layer 1 (legacy-main): initial binary seed map.
    // - 1 cell = 4096 world blocks.
    // - LAND probability is exactly 1/10; OCEAN is 9/10.
    // - Uses the quadratic congruential RNG via stack.ops.island(...).
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

    // Layers 5-7 in legacy-main: three consecutive AddIsland passes at the same
    // resolution (~1024 blocks per cell). Each pass uses the exact same rule set;
    // different salts keep each pass stochastically distinct.
    const addIsland1024_l5 = (x, z) => stack.addIsland(zoom1024, x, z, 4);
    const addIsland1024_l6 = (x, z) => stack.addIsland(addIsland1024_l5, x, z, 5);
    const addIsland1024_l7 = (x, z) => stack.addIsland(addIsland1024_l6, x, z, 6);
    const removeOcean1024 = (x, z) => stack.removeTooMuchOcean(addIsland1024_l7, x, z);

    // Layer 9: Add Temperatures (4:1:1 warm/cold/freezing over land).
    const temp1024_l9 = (x, z) => stack.addTemperatures(removeOcean1024, x, z);

    // Layer 10: Add Island again, now applied on the climate-seeded map so offshore
    // additions inherit climate directly (no post-merge temperature expansion step).
    const addIsland1024_l10_land = (x, z) => stack.addIsland(removeOcean1024, x, z, 7);
    const addIsland1024_l10_temp = (x, z) => stack.addIsland(temp1024_l9, x, z, 7);

    // Layer 11: Warm -> Temperate buffering around cold/freezing neighbors.
    const tempAfterWarmToTemperate_l11 = (x, z) => stack.warmToTemperate(addIsland1024_l10_temp, x, z);
    // Layer 12: Freezing -> Cold buffering around warm/temperate neighbors.
    const tempAfterFreezingToCold_l12 = (x, z) => stack.freezingToCold(tempAfterWarmToTemperate_l11, x, z);
    const variantTemp1024 = (x, z) => stack.addBiomeVariants(tempAfterFreezingToCold_l12, x, z);

    // Layer 14: zoom 1024 -> 512 on both land and temperature maps.
    // Both calls use the same fuzzy-zoom rule (`stack.zoom`) so borders gain jagged detail
    // at the same stage, while salts stay distinct to avoid cache-key collisions.
    const L14_ZOOM_LAND_SALT = 8;
    const L14_ZOOM_TEMP_SALT = 9;
    const zoomLand512 = (x, z) => stack.zoom(addIsland1024_l10_land, x, z, L14_ZOOM_LAND_SALT);
    const zoomTemp512 = (x, z) => stack.zoom(variantTemp1024, x, z, L14_ZOOM_TEMP_SALT);

    // Layer 15: final major continent-scale zoom (512 -> 256) on both maps.
    // This is still the same fuzzy-zoom operator, just at a smaller regional scale.
    const L15_ZOOM_LAND_SALT = 10;
    const L15_ZOOM_TEMP_SALT = 11;
    const zoomLand256 = (x, z) => stack.zoom(zoomLand512, x, z, L15_ZOOM_LAND_SALT);
    const zoomTemp256 = (x, z) => stack.zoom(zoomTemp512, x, z, L15_ZOOM_TEMP_SALT);

    // Layer 16: Add Island at 256 scale (same AddIsland rule set as earlier passes).
    // At this resolution it mostly adds small coastal islands / peninsula bumps and
    // trims isolated one-cell land specks.
    const addIsland256_l16 = (x, z) => stack.addIsland(zoomLand256, x, z, 12);
    const mushroom256 = (x, z) => stack.addMushroomIsland(addIsland256_l16, x, z);
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
