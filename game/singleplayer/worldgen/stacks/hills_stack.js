(function () {
  class HillsStack {
    constructor(layerOps) {
      this.ops = layerOps;
    }

    sample(x, z) {
      return this.ops.regionHills(x, z);
    }
  }

  window.WorldgenStacks = window.WorldgenStacks || {};
  window.WorldgenStacks.HillsStack = HillsStack;
})();
