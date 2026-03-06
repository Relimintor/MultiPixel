(function () {
  class HillsStack {
    constructor(layerOps) {
      this.ops = layerOps;
    }

    sample(wx, wz) {
      // White noise -> zoom 256->128 -> zoom 128->64
      let n = this.ops.whiteNoise(wx, wz, 256, 2001);
      n = this.ops.zoomNumeric(n, wx, wz, 256, 128, 2002);
      n = this.ops.zoomNumeric(n, wx, wz, 128, 64, 2003);
      return n;
    }
  }

  window.WorldgenStacks = window.WorldgenStacks || {};
  window.WorldgenStacks.HillsStack = HillsStack;
})();
