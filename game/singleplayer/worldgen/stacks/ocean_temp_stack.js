(function () {
  const P = () => window.WorldgenLayerPrograms;

  class OceanTempStack {
    constructor(layerOps) {
      this.ops = layerOps;
    }

    sample(wx, wz) {
      const p = P();
      let t = p.ocean_perlin_noise({ ops: this.ops, wx, wz });
      t = p.ocean_zoom_256_128({ ops: this.ops, wx, wz, value: t });
      t = p.ocean_zoom_128_64({ ops: this.ops, wx, wz, value: t });
      t = p.ocean_zoom_64_32({ ops: this.ops, wx, wz, value: t });
      t = p.ocean_zoom_32_16({ ops: this.ops, wx, wz, value: t });
      t = p.ocean_zoom_16_8({ ops: this.ops, wx, wz, value: t });
      t = p.ocean_zoom_8_4({ ops: this.ops, wx, wz, value: t });
      return Number(t);
    }
  }

  window.WorldgenStacks = window.WorldgenStacks || {};
  window.WorldgenStacks.OceanTempStack = OceanTempStack;
})();
