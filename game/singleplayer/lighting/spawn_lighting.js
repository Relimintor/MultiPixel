(function () {
  function create({ getBlockType, isLiquid, CHUNK_HEIGHT }) {
    const EMISSIVE_BLOCK_LIGHT = { 4: 2, 9: 4 };

    function isOpenToSky(wx, wy, wz) {
      for (let y = CHUNK_HEIGHT - 1; y > wy; y--) {
        const b = getBlockType(wx, y, wz);
        if (b !== 0 && !isLiquid(b)) return false;
      }
      return true;
    }

    function getSkyLightLevel(wx, wy, wz) {
      if (isOpenToSky(wx, wy, wz)) return 15;
      let light = 0;
      for (let y = CHUNK_HEIGHT - 1; y > wy; y--) {
        const b = getBlockType(wx, y, wz);
        if (b !== 0 && !isLiquid(b)) {
          light = Math.max(0, light - 4);
        } else {
          light = Math.min(15, light + 1);
        }
      }
      return light;
    }

    function getBlockLightLevel(wx, wy, wz) {
      let best = 0;
      const r = 4;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            const b = getBlockType(wx + dx, wy + dy, wz + dz);
            const emit = EMISSIVE_BLOCK_LIGHT[b] || 0;
            if (!emit) continue;
            const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
            const val = Math.max(0, emit - dist);
            if (val > best) best = val;
          }
        }
      }
      return best;
    }

    function getCombinedLight(wx, wy, wz) {
      return Math.max(getSkyLightLevel(wx, wy, wz), getBlockLightLevel(wx, wy, wz));
    }

    return { isOpenToSky, getSkyLightLevel, getBlockLightLevel, getCombinedLight };
  }

  window.SpawnLighting = { create };
})();
