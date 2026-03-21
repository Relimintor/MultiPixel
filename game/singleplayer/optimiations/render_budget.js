(function () {
  const SingleplayerRenderOptimizations = {
    create({ windowRef = window, navigatorRef = navigator, worldGenSettings = {}, WORLD_RADIUS, CHUNK_SIZE }) {
      const deviceMemoryGb = typeof navigatorRef.deviceMemory === 'number' ? navigatorRef.deviceMemory : null;
      const cpuThreads = typeof navigatorRef.hardwareConcurrency === 'number' ? navigatorRef.hardwareConcurrency : null;
      const prefersReducedMotion = windowRef.matchMedia ? windowRef.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
      const isLowEndDevice = Boolean(
        prefersReducedMotion ||
        (deviceMemoryGb !== null && deviceMemoryGb <= 4) ||
        (cpuThreads !== null && cpuThreads <= 4)
      );

      function computeRenderPixelRatio() {
        const rawDeviceRatio = windowRef.devicePixelRatio || 1;
        const ratioCap = isLowEndDevice ? 1 : 1.5;
        const maxRenderPixels = isLowEndDevice ? 2_000_000 : 3_000_000;
        const viewportPixels = Math.max(1, windowRef.innerWidth * windowRef.innerHeight);
        const budgetRatio = Math.sqrt(maxRenderPixels / viewportPixels);
        const safeRatio = Math.max(0.75, Math.min(ratioCap, budgetRatio));
        return Math.min(rawDeviceRatio, safeRatio);
      }

      const configuredChunkRenderDistance = Math.floor(Number(worldGenSettings.chunkRenderDistance) || 4);
      const baseChunkRenderDistance = Math.max(4, Math.min(WORLD_RADIUS, configuredChunkRenderDistance));

      return {
        deviceMemoryGb,
        cpuThreads,
        prefersReducedMotion,
        isLowEndDevice,
        computeRenderPixelRatio,
        initialRenderPixelRatio: computeRenderPixelRatio(),
        baseChunkRenderDistance,
        chunkUpdateIntervalMs: isLowEndDevice ? 220 : 90,
        frustumCullIntervalMs: isLowEndDevice ? 120 : 60,
        fogBaseNear: Math.max(12, baseChunkRenderDistance * CHUNK_SIZE * 0.18),
        fogDayNearBoost: Math.max(4, baseChunkRenderDistance * CHUNK_SIZE * 0.05),
        fogBaseFar: Math.max(54, baseChunkRenderDistance * CHUNK_SIZE * 0.72),
        fogDayFarBoost: Math.max(16, baseChunkRenderDistance * CHUNK_SIZE * 0.22),
      };
    }
  };

  window.SingleplayerRenderOptimizations = SingleplayerRenderOptimizations;
})();
