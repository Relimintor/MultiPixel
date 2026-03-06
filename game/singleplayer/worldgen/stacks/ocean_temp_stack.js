(function () {
  class OceanTempStack {
    constructor(layerOps) {
      this.ops = layerOps;
    }

    sample(wx, wz) {
      // Perlin -> zoom 256->128 -> 128->64 -> 64->32 -> 32->16 -> 16->8 -> 8->4
      let t = this.ops.oceanTemperature(wx, wz, 256);
      t = this.ops.zoomNumeric(t, wx, wz, 256, 128, 4001);
      t = this.ops.zoomNumeric(t, wx, wz, 128, 64, 4002);
      t = this.ops.zoomNumeric(t, wx, wz, 64, 32, 4003);
      t = this.ops.zoomNumeric(t, wx, wz, 32, 16, 4004);
      t = this.ops.zoomNumeric(t, wx, wz, 16, 8, 4005);
      t = this.ops.zoomNumeric(t, wx, wz, 8, 4, 4006);
      return Number(t);
    }
  }

  window.WorldgenStacks = window.WorldgenStacks || {};
  window.WorldgenStacks.OceanTempStack = OceanTempStack;
})();
