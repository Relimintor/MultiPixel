(function () {
  function clamp01(v) {
    return Math.max(0, Math.min(1, Number(v) || 0));
  }

  function create({
    getRenderer,
    getCamera,
  }) {
    let nauseaLevel = 0;
    let phase = 0;
    const RAMP_UP_PER_SEC = 1.25;
    const RAMP_DOWN_PER_SEC = 0.75;

    function applyVisualState() {
      const renderer = getRenderer?.();
      const camera = getCamera?.();
      const canvas = renderer?.domElement;
      if (!canvas || !camera) return;

      const level = clamp01(nauseaLevel);
      if (level <= 0.001) {
        canvas.style.filter = '';
        canvas.style.transform = '';
        canvas.style.transformOrigin = '';
        camera.fov = 90;
        camera.updateProjectionMatrix();
        return;
      }

      phase += 0.065 + level * 0.08;
      const wobbleA = Math.sin(phase * 1.9) * level;
      const wobbleB = Math.cos(phase * 1.3 + 0.8) * level;
      const wobbleC = Math.sin(phase * 0.9 + 1.7) * level;

      const rotateDeg = wobbleA * 2.6;
      const skewX = wobbleB * 1.8;
      const skewY = wobbleC * 1.8;
      const scale = 1 + Math.abs(wobbleB) * 0.032;
      const offsetX = wobbleA * 10;
      const offsetY = wobbleC * 8;

      canvas.style.transformOrigin = '50% 50%';
      canvas.style.transform = `translate(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px) rotate(${rotateDeg.toFixed(2)}deg) skew(${skewX.toFixed(2)}deg, ${skewY.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
      canvas.style.filter = `blur(${(0.45 + level * 1.8).toFixed(2)}px) saturate(${(1 + level * 0.85).toFixed(2)}) hue-rotate(${(wobbleA * 10).toFixed(2)}deg) contrast(${(1 + level * 0.14).toFixed(2)})`;

      const fovTarget = 90 + Math.sin(phase * 1.7) * (1.2 + level * 3.4);
      camera.fov += (fovTarget - camera.fov) * 0.25;
      camera.updateProjectionMatrix();
    }

    function update({ deltaMs, inPortalBlock, portalIgnited = true }) {
      const dt = Math.max(0.001, Math.min(0.12, (Number(deltaMs) || 0) / 1000));
      const active = Boolean(inPortalBlock && portalIgnited);
      if (active) {
        nauseaLevel = Math.min(1, nauseaLevel + dt * RAMP_UP_PER_SEC);
      } else {
        nauseaLevel = Math.max(0, nauseaLevel - dt * RAMP_DOWN_PER_SEC);
      }
      applyVisualState();
    }

    function reset() {
      nauseaLevel = 0;
      applyVisualState();
    }

    return {
      update,
      reset,
    };
  }

  window.SingleplayerDimension1GlowstonePortal = { create };
})();
