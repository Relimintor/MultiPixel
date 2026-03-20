(function () {
  const ORE_CONFIG = {
    coal: { blockId: 18, minY: 6, maxYFactor: null, maxYOffset: 2, noise: { octaves: 3, persistence: 0.5, lacunarity: 2.0, scale: 0.09, offsetX: 1450, offsetZ: -870 }, threshold: 0.12, baseChance: 0.06, depthScale: 0.08, salt: 301, xMul: 13, zMul: 7 },
    copper: { blockId: 35, minY: 6, maxYFactor: null, maxYOffset: 2, noise: { octaves: 3, persistence: 0.5, lacunarity: 2.0, scale: 0.07, offsetX: 5555, offsetZ: -666 }, threshold: 0.20, baseChance: 0.06, depthScale: 0.08, salt: 302, xMul: 13, zMul: 7 },
    iron: { blockId: 30, minY: 4, maxYFactor: 0.6, noise: { octaves: 3, persistence: 0.5, lacunarity: 2.0, scale: 0.07, offsetX: 2222, offsetZ: -333 }, threshold: 0.18, baseChance: 0.04, depthScale: 0.06, salt: 777, xMul: 17, zMul: 11 },
    gold: { blockId: 40, minY: 2, maxYFactor: 0.4, noise: { octaves: 3, persistence: 0.5, lacunarity: 2.0, scale: 0.08, offsetX: 9999, offsetZ: -1234 }, threshold: 0.25, baseChance: 0.03, depthScale: 0.05, salt: 303, xMul: 19, zMul: 13 },
    diamond: { blockId: 43, minY: 2, maxYFactor: 0.2, noise: { octaves: 3, persistence: 0.5, lacunarity: 2.0, scale: 0.08, offsetX: 11111, offsetZ: -8930 }, threshold: 0.30, baseChance: 0.02, depthScale: 0.03, salt: 304, xMul: 21, zMul: 15 },
    emerald: { blockId: 54, minY: 2, maxYFactor: 0.2, noise: { octaves: 3, persistence: 0.5, lacunarity: 2.0, scale: 0.08, offsetX: 23498, offsetZ: -19840 }, threshold: 0.34, baseChance: 0.025, depthScale: 0.02, salt: 305, xMul: 26, zMul: 17 },
  };

  function applySingleOrePass({ oreKey, blockType, y, h, CHUNK_HEIGHT, wx, wz, octaveNoise2D, hashRand2D, multiplier }) {
    const cfg = ORE_CONFIG[oreKey];
    if (!cfg) return blockType;
    if (!(blockType === 3 || blockType === 13)) return blockType;
    const maxY = Number.isFinite(cfg.maxYFactor) ? CHUNK_HEIGHT * cfg.maxYFactor : Math.min(CHUNK_HEIGHT - 6, h - (cfg.maxYOffset || 0));
    if (y <= cfg.minY || y >= maxY) return blockType;

    const veinNoise = octaveNoise2D(wx, wz, cfg.noise.octaves, cfg.noise.persistence, cfg.noise.lacunarity, cfg.noise.scale, cfg.noise.offsetX, cfg.noise.offsetZ);
    const depthBias = 1 - (y / CHUNK_HEIGHT);
    const oreRoll = hashRand2D(wx + y * cfg.xMul, wz - y * cfg.zMul, cfg.salt);
    const chance = (cfg.baseChance + depthBias * cfg.depthScale) * multiplier;
    if (veinNoise > cfg.threshold && oreRoll < chance) return cfg.blockId;
    return blockType;
  }

  function applyOrePasses({ blockType, y, h, CHUNK_HEIGHT, wx, wz, octaveNoise2D, hashRand2D, biomeInfo }) {
    const multipliers = biomeInfo?.oreSpawnRates || {};
    let nextType = blockType;
    for (const oreKey of Object.keys(ORE_CONFIG)) {
      const configured = Number(multipliers[oreKey]);
      const multiplier = Math.max(0, Number.isFinite(configured) ? configured : 1);
      nextType = applySingleOrePass({ oreKey, blockType: nextType, y, h, CHUNK_HEIGHT, wx, wz, octaveNoise2D, hashRand2D, multiplier });
    }
    return nextType;
  }

  window.SingleplayerChunkGenOres = {
    applyOrePasses,
  };
})();
