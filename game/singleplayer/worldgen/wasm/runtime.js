(function () {
  const noopBackend = {
    ready: false,
    caveShape: null,
    biomeJitter: null,
    terrainHeightDelta: null,
  };

  class WasmRuntime {
    constructor() {
      this.backend = noopBackend;
      this.initialized = false;
      this.failed = false;
      this.error = null;
    }

    async init({ enabled = false, modulePath = 'worldgen/wasm/worldgen.wasm' } = {}) {
      if (this.initialized || this.failed || !enabled) return this.backend;
      this.initialized = true;

      if (typeof WebAssembly === 'undefined') {
        this.failed = true;
        this.error = new Error('WebAssembly is not supported in this browser.');
        return this.backend;
      }

      try {
        const imports = {
          env: {
            abort() { throw new Error('WASM abort'); },
          },
        };

        let instance;
        if (WebAssembly.instantiateStreaming) {
          const res = await fetch(modulePath, { cache: 'no-store' });
          if (!res.ok) throw new Error(`Failed to fetch WASM module (${res.status})`);
          const out = await WebAssembly.instantiateStreaming(res, imports);
          instance = out.instance;
        } else {
          const res = await fetch(modulePath, { cache: 'no-store' });
          if (!res.ok) throw new Error(`Failed to fetch WASM module (${res.status})`);
          const bytes = await res.arrayBuffer();
          const out = await WebAssembly.instantiate(bytes, imports);
          instance = out.instance;
        }

        const exp = instance.exports || {};
        this.backend = {
          ready: true,
          caveShape: typeof exp.cave_shape === 'function' ? exp.cave_shape : null,
          biomeJitter: typeof exp.biome_jitter === 'function' ? exp.biome_jitter : null,
          terrainHeightDelta: typeof exp.terrain_height_delta === 'function' ? exp.terrain_height_delta : null,
        };

        if (!this.backend.caveShape && !this.backend.biomeJitter && !this.backend.terrainHeightDelta) {
          this.backend = noopBackend;
          throw new Error('WASM module loaded but did not export expected symbols.');
        }

        console.info('[Worldgen WASM] enabled', { modulePath });
      } catch (err) {
        this.failed = true;
        this.error = err;
        this.backend = noopBackend;
        console.warn('[Worldgen WASM] fallback to JS:', err?.message || err);
      }

      return this.backend;
    }

    has(name) {
      return !!(this.backend && this.backend.ready && this.backend[name]);
    }

    call(name, ...args) {
      if (!this.has(name)) return null;
      try {
        return this.backend[name](...args);
      } catch {
        return null;
      }
    }
  }

  window.WorldgenWasmRuntime = window.WorldgenWasmRuntime || new WasmRuntime();
})();
