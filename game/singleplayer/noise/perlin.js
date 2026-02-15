(function () {
  class PerlinNoise {
    constructor(seed = Math.random() * 65536) {
      this.p = new Uint8Array(512);
      const permutation = new Uint8Array(256);
      for (let i = 0; i < 256; i++) permutation[i] = i;

      let s = seed >>> 0;
      const rand = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };

      for (let i = 255; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const t = permutation[i];
        permutation[i] = permutation[j];
        permutation[j] = t;
      }

      for (let i = 0; i < 512; i++) this.p[i] = permutation[i & 255];
    }

    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(t, a, b) { return a + t * (b - a); }

    grad(hash, x, y, z) {
      const h = hash & 15;
      const u = h < 8 ? x : y;
      const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
      return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise(x, y, z) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const Z = Math.floor(z) & 255;

      x -= Math.floor(x);
      y -= Math.floor(y);
      z -= Math.floor(z);

      const u = this.fade(x);
      const v = this.fade(y);
      const w = this.fade(z);

      const A = this.p[X] + Y;
      const AA = this.p[A] + Z;
      const AB = this.p[A + 1] + Z;
      const B = this.p[X + 1] + Y;
      const BA = this.p[B] + Z;
      const BB = this.p[B + 1] + Z;

      return this.lerp(w,
        this.lerp(v,
          this.lerp(u, this.grad(this.p[AA], x, y, z), this.grad(this.p[BA], x - 1, y, z)),
          this.lerp(u, this.grad(this.p[AB], x, y - 1, z), this.grad(this.p[BB], x - 1, y - 1, z))
        ),
        this.lerp(v,
          this.lerp(u, this.grad(this.p[AA + 1], x, y, z - 1), this.grad(this.p[BA + 1], x - 1, y, z - 1)),
          this.lerp(u, this.grad(this.p[AB + 1], x, y - 1, z - 1), this.grad(this.p[BB + 1], x - 1, y - 1, z - 1))
        )
      );
    }

    noise2D(x, y) {
      return this.noise(x, y, 0);
    }

    noise3D(x, y, z) {
      return this.noise(x, y, z);
    }
  }

  window.PerlinNoise = PerlinNoise;
})();
