// Minimal worldgen WASM kernel for hot-path sampling.
// Exports:
//   cave_shape(wx, y, wz, cave_scale)
//   biome_jitter(wx, wz)
//   terrain_height_delta(wx, wz)

typedef unsigned int u32;

static inline int fast_floor(double x) {
  int i = (int)x;
  return (x < (double)i) ? (i - 1) : i;
}

static inline double fade(double t) {
  return t * t * (3.0 - 2.0 * t);
}

static inline u32 mix_u32(u32 h) {
  h ^= h >> 16;
  h *= 0x7feb352dU;
  h ^= h >> 15;
  h *= 0x846ca68bU;
  h ^= h >> 16;
  return h;
}

static inline double hash3(int x, int y, int z, u32 salt) {
  u32 h = (u32)x * 0x9E3779B1U;
  h ^= (u32)y * 0x85EBCA77U;
  h ^= (u32)z * 0xC2B2AE3DU;
  h ^= salt;
  h = mix_u32(h);
  return ((double)h / 4294967295.0) * 2.0 - 1.0;
}

static double value_noise3(double x, double y, double z, u32 salt) {
  int xi = fast_floor(x);
  int yi = fast_floor(y);
  int zi = fast_floor(z);

  double tx = x - (double)xi;
  double ty = y - (double)yi;
  double tz = z - (double)zi;

  double u = fade(tx);
  double v = fade(ty);
  double w = fade(tz);

  double c000 = hash3(xi, yi, zi, salt);
  double c100 = hash3(xi + 1, yi, zi, salt);
  double c010 = hash3(xi, yi + 1, zi, salt);
  double c110 = hash3(xi + 1, yi + 1, zi, salt);
  double c001 = hash3(xi, yi, zi + 1, salt);
  double c101 = hash3(xi + 1, yi, zi + 1, salt);
  double c011 = hash3(xi, yi + 1, zi + 1, salt);
  double c111 = hash3(xi + 1, yi + 1, zi + 1, salt);

  double x00 = c000 + (c100 - c000) * u;
  double x10 = c010 + (c110 - c010) * u;
  double x01 = c001 + (c101 - c001) * u;
  double x11 = c011 + (c111 - c011) * u;
  double y0 = x00 + (x10 - x00) * v;
  double y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

__attribute__((export_name("cave_shape")))
double cave_shape(double wx, double y, double wz, double cave_scale) {
  double n1 = value_noise3(wx * cave_scale, y * cave_scale * 1.7, wz * cave_scale, 0xA7F3C911U);
  double n2 = value_noise3(wx * cave_scale * 2.2 + 100.0, y * cave_scale * 1.1, wz * cave_scale * 2.2 + 100.0, 0x1F123BB5U);
  return n1 * 0.7 + n2 * 0.3;
}

__attribute__((export_name("biome_jitter")))
double biome_jitter(double wx, double wz) {
  return value_noise3(wx * 0.0081, 0.0, wz * 0.0081, 0xBC119D17U);
}

__attribute__((export_name("terrain_height_delta")))
double terrain_height_delta(double wx, double wz) {
  double base = value_noise3(wx * 0.0033, 0.0, wz * 0.0033, 0xD2A41E6BU);
  double detail = value_noise3(wx * 0.017, 0.0, wz * 0.017, 0x4E67C6A1U);
  return base * 0.75 + detail * 0.25;
}
