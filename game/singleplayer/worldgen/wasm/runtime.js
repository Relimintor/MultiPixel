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

    async init({ enabled = false, modulePath = 'worldgen/wasm/worldgen.wasm.base64' } = {}) {
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

      const instantiateFromResponse = async (res, path, imports) => {
        const useBase64Payload = String(path || '').toLowerCase().endsWith('.base64');
        if (useBase64Payload) {
          const b64Text = await res.text();
          const bytes = decodeBase64ToBytes(b64Text);
          if (!bytes) throw new Error('Base64 WASM payload was empty.');
          return WebAssembly.instantiate(bytes, imports);
        }

        const bytes = await res.arrayBuffer();
        return WebAssembly.instantiate(bytes, imports);
      };

      const instantiateFromPath = async (path, imports) => {
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) return { ok: false, status: res.status };

        const canStream = WebAssembly.instantiateStreaming && !String(path).toLowerCase().endsWith('.base64');
        const out = canStream
          ? await WebAssembly.instantiateStreaming(res, imports)
          : await instantiateFromResponse(res, path, imports);
        return { ok: true, out };
      };

      const instantiateWithFallback = async (imports) => {
        const candidates = [];
        candidates.push(modulePath);
        if (!String(modulePath).toLowerCase().endsWith('.base64')) {
          candidates.push(`${modulePath}.base64`);
        }

        let lastStatus = null;
        for (const path of candidates) {
          const result = await instantiateFromPath(path, imports);
          if (result.ok) return { instance: result.out.instance, loadedPath: path };
          lastStatus = result.status;
        }

        throw new Error(`Failed to fetch WASM module from ${candidates.join(' or ')}${lastStatus ? ` (last status ${lastStatus})` : ''}`);
      };

      try {
        const imports = {
          env: {
            abort() { throw new Error('WASM abort'); },
          },
        };

        const { instance, loadedPath } = await instantiateWithFallback(imports);

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

        console.info('[Worldgen WASM] enabled', { modulePath: loadedPath || modulePath });
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
