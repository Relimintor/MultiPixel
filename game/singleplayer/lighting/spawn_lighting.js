(function () {
  function create({ getBlockType, isLiquid, CHUNK_HEIGHT, getSkyLightCap }) {
    const EMISSIVE_BLOCK_LIGHT = { 22: 15, 33: 15 };

    function isOpaqueBlock(blockId) {
      if (blockId === 0) return false;
      if (isLiquid(blockId)) return false;
      if (blockId === 22) return false; // torch should not block light
      return true;
    }

    function isOpenToSky(wx, wy, wz) {
      for (let y = CHUNK_HEIGHT - 1; y > wy; y--) {
        const b = getBlockType(wx, y, wz);
        if (isOpaqueBlock(b)) return false;
      }
      return true;
    }

    function getSkyLightLevel(wx, wy, wz) {
      const cap = Math.max(0, Math.min(7, Math.floor(Number(getSkyLightCap ? getSkyLightCap() : 7))));
      if (cap <= 0) return 0;
      let light = 15;
      for (let y = CHUNK_HEIGHT - 1; y > wy; y--) {
        const b = getBlockType(wx, y, wz);
        if (b === 0) {
          light = Math.min(15, light + 0.02);
        } else if (isLiquid(b)) {
          light -= 0.6;
        } else if (b === 22) {
          light -= 0.25;
        } else {
          light -= 1.7;
        }
        if (light <= 0) return 0;
      }
      return Math.max(0, Math.min(cap, Math.floor(light)));
    }

    function getBlockLightLevel(wx, wy, wz) {
      let best = 0;
      const radius = 8;
      const radiusSq = radius * radius;

      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dz = -radius; dz <= radius; dz++) {
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq > radiusSq) continue;

            const sourceType = getBlockType(wx + dx, wy + dy, wz + dz);
            const emit = EMISSIVE_BLOCK_LIGHT[sourceType] || 0;
            if (!emit) continue;

            const dist = Math.sqrt(distSq);
            let occlusionPenalty = 0;
            const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
            if (steps > 1) {
              for (let i = 1; i < steps; i++) {
                const t = i / steps;
                const sx = wx + Math.round(dx * t);
                const sy = wy + Math.round(dy * t);
                const sz = wz + Math.round(dz * t);
                const sb = getBlockType(sx, sy, sz);
                if (isOpaqueBlock(sb)) {
                  occlusionPenalty += 1.2;
                  if (occlusionPenalty > 5.5) break;
                }
              }
            }

            const attenuation = dist * 1.35 + occlusionPenalty;
            const value = Math.max(0, emit - attenuation);
            if (value > best) best = value;
          }
        }
      }

      return Math.max(0, Math.min(15, Math.floor(best)));
    }


    function hasNearbyBlockLightSource(wx, wy, wz, radius = 7) {
      const r = Math.max(1, Number(radius) || 7);
      const rSq = r * r;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq > rSq) continue;
            const sourceType = getBlockType(wx + dx, wy + dy, wz + dz);
            if ((EMISSIVE_BLOCK_LIGHT[sourceType] || 0) > 0) return true;
          }
        }
      }
      return false;
    }

    function getCombinedLight(wx, wy, wz) {
      return Math.max(getSkyLightLevel(wx, wy, wz), getBlockLightLevel(wx, wy, wz));
    }

    return { isOpenToSky, getSkyLightLevel, getBlockLightLevel, getCombinedLight, hasNearbyBlockLightSource };
  }

  window.SpawnLighting = { create };
})();
