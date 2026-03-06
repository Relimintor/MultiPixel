(function () {
  class OceanTempStack {
    constructor(layerOps) {
      this.ops = layerOps;
    }

    sample(x, z) {
      return this.ops.oceanTemperature(x, z);
    }
  }

  window.WorldgenStacks = window.WorldgenStacks || {};
  window.WorldgenStacks.OceanTempStack = OceanTempStack;
})();
