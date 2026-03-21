(function () {
  const SingleplayerDirtToGrassLoop = {
    create({ CHUNK_SIZE, CHUNK_HEIGHT, getYawObject, getChunks, getBlockType, getColumnTopFromData, setBlockTypeRaw }) {
      let grassSpreadTimerMs = 0;

      function canDirtSpreadToGrass(wx, wy, wz) {
        if (wy <= 0 || wy >= CHUNK_HEIGHT - 1) return false;
        if (getBlockType(wx, wy, wz) !== 2) return false;
        if (getBlockType(wx, wy + 1, wz) !== 0) return false;
        return (
          getBlockType(wx + 1, wy, wz) === 1
          || getBlockType(wx - 1, wy, wz) === 1
          || getBlockType(wx, wy, wz + 1) === 1
          || getBlockType(wx, wy, wz - 1) === 1
        );
      }

      function updateGrassSpread(deltaMs) {
        grassSpreadTimerMs += deltaMs;
        const tickMs = 350;
        if (grassSpreadTimerMs < tickMs) return;
        grassSpreadTimerMs = 0;

        const yawObject = getYawObject();
        if (!yawObject) return;
        const chunks = getChunks();
        const centerCx = Math.floor(yawObject.position.x / CHUNK_SIZE);
        const centerCz = Math.floor(yawObject.position.z / CHUNK_SIZE);
        const activeRadius = 3;
        const candidateChunks = [];

        for (let cx = centerCx - activeRadius; cx <= centerCx + activeRadius; cx++) {
          for (let cz = centerCz - activeRadius; cz <= centerCz + activeRadius; cz++) {
            const group = chunks.get(`${cx},${cz}`);
            if (group?.userData?.chunkData) candidateChunks.push(group);
          }
        }

        if (!candidateChunks.length) return;

        const sampleCount = Math.min(3, candidateChunks.length);
        for (let sampleIdx = 0; sampleIdx < sampleCount; sampleIdx++) {
          const group = candidateChunks[Math.floor(Math.random() * candidateChunks.length)];
          const data = group?.userData?.chunkData;
          const cx = group?.userData?.cx;
          const cz = group?.userData?.cz;
          if (!data || !Number.isFinite(cx) || !Number.isFinite(cz)) continue;

          for (let tries = 0; tries < 24; tries++) {
            const lx = Math.floor(Math.random() * CHUNK_SIZE);
            const lz = Math.floor(Math.random() * CHUNK_SIZE);
            const y = getColumnTopFromData(data, lx, lz);
            if (y <= 0 || y >= CHUNK_HEIGHT - 1) continue;

            const idx = lx + y * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT;
            if (data[idx] !== 2) continue;

            const wx = cx * CHUNK_SIZE + lx;
            const wz = cz * CHUNK_SIZE + lz;
            if (!canDirtSpreadToGrass(wx, y, wz)) continue;

            if (setBlockTypeRaw(wx, y, wz, 1, true)) break;
          }
        }
      }

      return {
        canDirtSpreadToGrass,
        updateGrassSpread,
      };
    }
  };

  window.SingleplayerDirtToGrassLoop = SingleplayerDirtToGrassLoop;
})();
