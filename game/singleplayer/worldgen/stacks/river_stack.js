(function () {
  class RiverStack {
    constructor(layerOps) {
      this.ops = layerOps;
    }

    sampleMask(wx, wz, baseNoise64) {
      // zoom 64->32, empty, zoom 32->16, empty, zoom 16->8, zoom 8->4, noise->river, smooth
      let n = baseNoise64;
      n = this.ops.zoomNumeric(n, wx, wz, 64, 32, 3001);
      n = n; // empty layer
      n = this.ops.zoomNumeric(n, wx, wz, 32, 16, 3002);
      n = n; // empty layer
      n = this.ops.zoomNumeric(n, wx, wz, 16, 8, 3003);
      n = this.ops.zoomNumeric(n, wx, wz, 8, 4, 3004);
      const river = this.ops.riverFromPatchNoise(Number(n));
      const smooth = this.ops.smoothValue(river, wx, wz, 4, 3005);
      return Math.max(0, Math.min(1, smooth));
    }
  }

  window.WorldgenStacks = window.WorldgenStacks || {};
  window.WorldgenStacks.RiverStack = RiverStack;
})();
