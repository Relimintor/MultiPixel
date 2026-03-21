(function () {
  const UndergroundOresWorldgen = {
    applyOrePasses({ blockId, wx, y, wz, surfaceHeight, CHUNK_HEIGHT, hashRand2D, octaveNoise2D }) {
      let nextBlockId = blockId;
      const isStoneLike = nextBlockId === 3 || nextBlockId === 13;
      if (!isStoneLike) return nextBlockId;

      if (y > 6 && y < Math.min(CHUNK_HEIGHT - 6, surfaceHeight - 2)) {
        const coalNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.09, 1450, -870);
        const coalDepthBias = 1 - (y / CHUNK_HEIGHT);
        const coalRoll = hashRand2D(wx + y * 13, wz - y * 7, 301);
        if (coalNoise > 0.12 && coalRoll < (0.06 + coalDepthBias * 0.08)) nextBlockId = 18;
      }

      if (nextBlockId === 3 || nextBlockId === 13) {
        if (y > 6 && y < Math.min(CHUNK_HEIGHT - 6, surfaceHeight - 2)) {
          const copperNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.07, 5555, -666);
          const copperDepthBias = 1 - (y / CHUNK_HEIGHT);
          const copperRoll = hashRand2D(wx + y * 13, wz - y * 7, 302);
          if (copperNoise > 0.20 && copperRoll < (0.06 + copperDepthBias * 0.08)) nextBlockId = 35;
        }
      }

      if (nextBlockId === 3 || nextBlockId === 13) {
        if (y > 4 && y < CHUNK_HEIGHT * 0.6) {
          const ironNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.07, 2222, -333);
          const ironDepthBias = 1 - (y / CHUNK_HEIGHT);
          const ironRoll = hashRand2D(wx + y * 17, wz - y * 11, 777);
          if (ironNoise > 0.18 && ironRoll < (0.04 + ironDepthBias * 0.06)) nextBlockId = 30;
        }
      }

      if (nextBlockId === 3 || nextBlockId === 13) {
        if (y > 2 && y < CHUNK_HEIGHT * 0.4) {
          const goldNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.08, 9999, -1234);
          const goldDepthBias = 1 - (y / CHUNK_HEIGHT);
          const goldRoll = hashRand2D(wx + y * 19, wz - y * 13, 303);
          if (goldNoise > 0.25 && goldRoll < (0.03 + goldDepthBias * 0.05)) nextBlockId = 40;
        }
      }

      if (nextBlockId === 3 || nextBlockId === 13) {
        if (y > 2 && y < CHUNK_HEIGHT * 0.2) {
          const diamondNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.08, 11111, -8930);
          const diamondDepthBias = 1 - (y / CHUNK_HEIGHT);
          const diamondRoll = hashRand2D(wx + y * 21, wz - y * 15, 303);
          if (diamondNoise > 0.30 && diamondRoll < (0.02 + diamondDepthBias * 0.03)) nextBlockId = 43;
        }
      }

      if (nextBlockId === 3 || nextBlockId === 13) {
        if (y > 2 && y < CHUNK_HEIGHT * 0.2) {
          const emeraldNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.08, 23498, -19840);
          const emeraldDepthBias = 1 - (y / CHUNK_HEIGHT);
          const emeraldRoll = hashRand2D(wx + y * 26, wz - y * 17, 303);
          if (emeraldNoise > 0.34 && emeraldRoll < (0.025 + emeraldDepthBias * 0.02)) nextBlockId = 54;
        }
      }

      return nextBlockId;
    }
  };

  window.UndergroundOresWorldgen = UndergroundOresWorldgen;
})();
