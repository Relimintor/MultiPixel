(function () {
  const S = () => window.WorldgenStacksMain.shared;

  window.WorldgenStacksMain = window.WorldgenStacksMain || {};
  window.WorldgenStacksMain.sampleBiomeStack = function (stack, wx, wz, legacyMain, hillNoise) {
    const { C, isOceanBiome } = S();
    const x256 = Math.floor(wx / 256);
    const z256 = Math.floor(wz / 256);

    const biome256 = (x, z) => stack.cached('biome_256', x, z, () => {
      const landCell = legacyMain.landFn256(x, z);
      let tempCell = legacyMain.tempFn256(x, z);
      if (landCell === C().LAND && tempCell === C().OCEAN) {
        const neighbors = [
          legacyMain.tempFn256(x, z - 1),
          legacyMain.tempFn256(x, z + 1),
          legacyMain.tempFn256(x - 1, z),
          legacyMain.tempFn256(x + 1, z),
        ].filter((t) => t !== C().OCEAN);
        if (neighbors.length > 0) {
          const pick = Math.floor(stack.ops.random.at2D(x, z, stack.ops.seed + 2213) * neighbors.length);
          tempCell = neighbors[pick];
        } else {
          tempCell = stack.addTemperatures(() => C().LAND, x, z);
        }
      }
      let b = stack.ops.temperatureToBiome(tempCell, x * 256, z * 256, 256);
      if (landCell !== C().LAND && landCell !== 99) b = landCell === C().DEEP_OCEAN ? 'Deep Ocean' : 'Ocean';
      if (stack.settings.enableBambooJungleVariant) b = stack.ops.bambooJungleVariant(b, x * 256, z * 256, 256);
      return b;
    });

    const zoomBiome = (parentFn, x, z, salt) => stack.cached(`biome_zoom_${salt}`, x, z, () => {
      const px = x >> 1;
      const pz = z >> 1;
      const sx = x & 1;
      const sz = z & 1;
      const c00 = parentFn(px, pz);
      if (sx === 0 && sz === 0) return c00;
      const c10 = parentFn(px + 1, pz);
      const c01 = parentFn(px, pz + 1);
      const c11 = parentFn(px + 1, pz + 1);
      const roll = stack.ops.random.at2D(x, z, stack.ops.seed + salt);
      if (sx === 0 && sz === 1) return roll < 0.5 ? c00 : c01;
      if (sx === 1 && sz === 0) return roll < 0.5 ? c00 : c10;
      if (c10 === c01 && c01 === c11) return c10;
      if (c00 === c10 && c00 === c01) return c00;
      return [c00, c10, c01, c11][Math.floor(roll * 4)];
    });

    const biome128 = (x, z) => zoomBiome(biome256, x, z, 2001);
    const biome64Pre = (x, z) => zoomBiome(biome128, x, z, 2002);
    const biome64 = (x, z) => stack.cached('biome_64', x, z, () => {
      let b = biome64Pre(x, z);
      b = stack.ops.biomeEdge(b, x * 64, z * 64, 64);
      b = stack.ops.regionHills(b, hillNoise, x * 64, z * 64, 64);
      if (stack.settings.enableSunflowerPlainsVariant) b = stack.ops.sunflowerPlainsVariant(b, x * 64, z * 64, 64);
      return b;
    });
    const biome32 = (x, z) => zoomBiome(biome64, x, z, 2003);
    const biomeAddIsland32 = (x, z) => stack.cached('biome_add_island_32', x, z, () => {
      const center = biome32(x, z);
      if (!isOceanBiome(center)) return center;

      const north = biome32(x, z - 1);
      const south = biome32(x, z + 1);
      const west = biome32(x - 1, z);
      const east = biome32(x + 1, z);
      const neighbors = [north, south, west, east].filter((b) => !isOceanBiome(b));
      if (neighbors.length === 0) return center;

      const flipChance = stack.ops.random.at2D(x, z, stack.ops.seed + 2015);
      if (flipChance >= 0.22) return center;

      const pickRoll = stack.ops.random.at2D(x, z, stack.ops.seed + 2016);
      return neighbors[Math.floor(pickRoll * neighbors.length)];
    });

    const biome16Pre = (x, z) => zoomBiome(biomeAddIsland32, x, z, 2004);
    const biome16 = (x, z) => stack.cached('biome_16', x, z, () => stack.ops.shore(biome16Pre(x, z), x * 16, z * 16, 16));
    const biome8 = (x, z) => zoomBiome(biome16, x, z, 2005);
    const biome4Pre = (x, z) => zoomBiome(biome8, x, z, 2006);
    const biome4 = (x, z) => stack.cached('biome_4', x, z, () => stack.ops.smoothBiome(biome4Pre(x, z), x * 4, z * 4, 4));
    const biome2Pre = (x, z) => zoomBiome(biome4, x, z, 2007);
    const biome2 = (x, z) => stack.cached('biome_2', x, z, () => stack.ops.smoothBiome(biome2Pre(x, z), x * 2, z * 2, 2));
    const biome1Pre = (x, z) => zoomBiome(biome2, x, z, 2008);
    const biome1 = (x, z) => stack.cached('biome_1', x, z, () => stack.ops.smoothBiome(biome1Pre(x, z), x, z, 1));

    return biome1(wx, wz);
  };
})();
