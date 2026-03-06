(function () {
  const P = () => window.WorldgenLayerPrograms;

  class HillsStack {
    constructor(layerOps) {
      this.ops = layerOps;
    }

    sample(wx, wz) {
      const p = P();
      let n = p.noise_white({ ops: this.ops, wx, wz });
      n = p.noise_zoom_256_128({ ops: this.ops, wx, wz, value: n });
      n = p.noise_zoom_128_64({ ops: this.ops, wx, wz, value: n });
      return n;
    }
  }

  window.WorldgenStacks = window.WorldgenStacks || {};
  window.WorldgenStacks.HillsStack = HillsStack;
})();
