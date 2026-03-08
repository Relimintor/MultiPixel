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

      const decodeBase64ToBytes = (base64Text) => {
        const normalized = String(base64Text || '').trim();
        if (!normalized) return null;
        const binary = atob(normalized);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
      };

      const instantiateFromBytes = async (imports) => {
        const res = await fetch(modulePath, { cache: 'no-store' });
        if (res.ok) {
          const bytes = await res.arrayBuffer();
          return WebAssembly.instantiate(bytes, imports);
        }

        const b64Path = `${modulePath}.base64`;
        const b64Res = await fetch(b64Path, { cache: 'no-store' });
        if (!b64Res.ok) {
          throw new Error(`Failed to fetch WASM module (${res.status}) and fallback base64 (${b64Res.status})`);
        }

        const b64Text = await b64Res.text();
        const bytes = decodeBase64ToBytes(b64Text);
        if (!bytes) throw new Error('Base64 WASM fallback was empty.');
        return WebAssembly.instantiate(bytes, imports);
      };

      try {
        const imports = {
          env: {
            abort() { throw new Error('WASM abort'); },
          },
        };

        let instance;
        if (WebAssembly.instantiateStreaming) {
          // Prefer normal .wasm fetch path; if unavailable, fallback to text base64.
          const res = await fetch(modulePath, { cache: 'no-store' });
          if (res.ok) {
            const out = await WebAssembly.instantiateStreaming(res, imports);
            instance = out.instance;
          } else {
            const out = await instantiateFromBytes(imports);
            instance = out.instance;
          }
        } else {
          const out = await instantiateFromBytes(imports);
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
