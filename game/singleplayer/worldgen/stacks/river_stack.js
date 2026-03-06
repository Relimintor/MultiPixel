(function () {
  class RiverStack {
    constructor(layerOps) {
      this.ops = layerOps;
    }

    sampleMask(x, z) {
      // zoom 64->4 style patch seams + smooth.
      const n = this.ops.riverNoise(x, z);
      const smooth = (n * 0.7) + (Math.max(0, this.ops.riverNoise(x + 3, z - 3)) * 0.3);
      return Math.max(0, smooth);
    }
  }

  window.WorldgenStacks = window.WorldgenStacks || {};
  window.WorldgenStacks.RiverStack = RiverStack;
})();
