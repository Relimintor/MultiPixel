(function () {
  function fbm2D(perlin, x, z, octaves = 4, gain = 0.5, lacunarity = 2.0) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += perlin.noise2D(x * freq, z * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }

  function ridge2D(perlin, x, z, octaves = 4) {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(perlin.noise2D(x * freq, z * freq));
      sum += n * amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum;
  }

  window.WorldgenNoise = window.WorldgenNoise || {};
  window.WorldgenNoise.fbm2D = fbm2D;
  window.WorldgenNoise.ridge2D = ridge2D;
})();
