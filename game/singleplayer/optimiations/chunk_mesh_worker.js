self.onmessage = (event) => {
  const msg = event.data || {};
  if (msg.type !== 'mesh') return;

  const {
    requestId,
    chunkKey,
    CS,
    CH,
    data,
    east,
    west,
    north,
    south,
    blockMeta,
  } = msg;

  const getMeta = (id) => blockMeta[String(id)] || null;

  const normalizeBlockId = (value) => {
    const id = Number(value);
    if (!Number.isFinite(id)) return 0;
    return Math.floor(id);
  };

  const idx = (x, y, z) => x + y * CS + z * CS * CH;

  const get = (x, y, z) => {
    if (y < 0 || y >= CH) return 0;
    if (x < 0) {
      if (!west) return 0;
      return normalizeBlockId(west[idx(x + CS, y, z)]);
    }
    if (x >= CS) {
      if (!east) return 0;
      return normalizeBlockId(east[idx(x - CS, y, z)]);
    }
    if (z < 0) {
      if (!north) return 0;
      return normalizeBlockId(north[idx(x, y, z + CS)]);
    }
    if (z >= CS) {
      if (!south) return 0;
      return normalizeBlockId(south[idx(x, y, z - CS)]);
    }
    return normalizeBlockId(data[idx(x, y, z)]);
  };

  const isTransparentBlock = (id) => {
    const mat = getMeta(id);
    return Boolean(mat && (mat.transparent || (mat.textured && mat.textureKey === 'LEAVES')));
  };

  const shouldCullFace = (id, nid) => {
    if (nid === 0) return false;
    const selfMat = getMeta(id);
    const neighborMat = getMeta(nid);
    const selfIsSlab = selfMat?.shape === 'slab';
    const neighborIsSlab = neighborMat?.shape === 'slab';
    if (selfIsSlab || neighborIsSlab) return false;
    const selfTransparent = isTransparentBlock(id);
    const neighborTransparent = isTransparentBlock(nid);
    if (!selfTransparent && !neighborTransparent) return true;
    if (selfTransparent && nid === id) return true;
    return false;
  };

  const shouldDrawFace = (id, nid) => !shouldCullFace(id, nid);

  const facePasses = [
    { name: 'top', axis: 'y', sign: 1 },
    { name: 'bottom', axis: 'y', sign: -1 },
    { name: 'posX', axis: 'x', sign: 1 },
    { name: 'negX', axis: 'x', sign: -1 },
    { name: 'posZ', axis: 'z', sign: 1 },
    { name: 'negZ', axis: 'z', sign: -1 },
  ];

  const quads = [];

  for (const face of facePasses) {
    if (face.axis === 'y') {
      for (let y = 0; y < CH; y++) {
        const visited = new Uint8Array(CS * CS);
        for (let z = 0; z < CS; z++) {
          for (let x = 0; x < CS; x++) {
            const mi = x + z * CS;
            if (visited[mi]) continue;
            const id = get(x, y, z);
            if (id === 0 || id === 22) continue;
            const mat = getMeta(id);
            if (!mat) continue;
            if (mat.transparent || (mat.textured && mat.textureKey === 'LEAVES') || mat.shape) continue;
            const nid = get(x, y + face.sign, z);
            if (!shouldDrawFace(id, nid)) continue;

            let w = 1;
            while (x + w < CS) {
              const ni = x + w + z * CS;
              if (visited[ni]) break;
              const id2 = get(x + w, y, z);
              if (id2 !== id) break;
              if (!shouldDrawFace(id2, get(x + w, y + face.sign, z))) break;
              w++;
            }

            let h = 1;
            outerY: while (z + h < CS) {
              for (let k = 0; k < w; k++) {
                const ni = (x + k) + (z + h) * CS;
                if (visited[ni]) break outerY;
                const id2 = get(x + k, y, z + h);
                if (id2 !== id) break outerY;
                if (!shouldDrawFace(id2, get(x + k, y + face.sign, z + h))) break outerY;
              }
              h++;
            }

            for (let dz = 0; dz < h; dz++) {
              for (let dx = 0; dx < w; dx++) visited[(x + dx) + (z + dz) * CS] = 1;
            }

            quads.push({ id, face: face.name, x, y, z, w, h });
          }
        }
      }
    } else if (face.axis === 'x') {
      for (let x = 0; x < CS; x++) {
        const visited = new Uint8Array(CH * CS);
        for (let z = 0; z < CS; z++) {
          for (let y = 0; y < CH; y++) {
            const mi = y + z * CH;
            if (visited[mi]) continue;
            const id = get(x, y, z);
            if (id === 0 || id === 22) continue;
            const mat = getMeta(id);
            if (!mat) continue;
            if (mat.transparent || (mat.textured && mat.textureKey === 'LEAVES') || mat.shape) continue;
            const nid = get(x + face.sign, y, z);
            if (!shouldDrawFace(id, nid)) continue;

            let w = 1;
            while (y + w < CH) {
              const ni = (y + w) + z * CH;
              if (visited[ni]) break;
              const id2 = get(x, y + w, z);
              if (id2 !== id) break;
              if (!shouldDrawFace(id2, get(x + face.sign, y + w, z))) break;
              w++;
            }

            let h = 1;
            outerX: while (z + h < CS) {
              for (let k = 0; k < w; k++) {
                const ni = (y + k) + (z + h) * CH;
                if (visited[ni]) break outerX;
                const id2 = get(x, y + k, z + h);
                if (id2 !== id) break outerX;
                if (!shouldDrawFace(id2, get(x + face.sign, y + k, z + h))) break outerX;
              }
              h++;
            }

            for (let dz = 0; dz < h; dz++) {
              for (let dy = 0; dy < w; dy++) visited[(y + dy) + (z + dz) * CH] = 1;
            }

            quads.push({ id, face: face.name, x, y, z, w, h });
          }
        }
      }
    } else {
      for (let z = 0; z < CS; z++) {
        const visited = new Uint8Array(CH * CS);
        for (let x = 0; x < CS; x++) {
          for (let y = 0; y < CH; y++) {
            const mi = y + x * CH;
            if (visited[mi]) continue;
            const id = get(x, y, z);
            if (id === 0 || id === 22) continue;
            const mat = getMeta(id);
            if (!mat) continue;
            if (mat.transparent || (mat.textured && mat.textureKey === 'LEAVES') || mat.shape) continue;
            const nid = get(x, y, z + face.sign);
            if (!shouldDrawFace(id, nid)) continue;

            let w = 1;
            while (y + w < CH) {
              const ni = (y + w) + x * CH;
              if (visited[ni]) break;
              const id2 = get(x, y + w, z);
              if (id2 !== id) break;
              if (!shouldDrawFace(id2, get(x, y + w, z + face.sign))) break;
              w++;
            }

            let h = 1;
            outerZ: while (x + h < CS) {
              for (let k = 0; k < w; k++) {
                const ni = (y + k) + (x + h) * CH;
                if (visited[ni]) break outerZ;
                const id2 = get(x + h, y + k, z);
                if (id2 !== id) break outerZ;
                if (!shouldDrawFace(id2, get(x + h, y + k, z + face.sign))) break outerZ;
              }
              h++;
            }

            for (let dx = 0; dx < h; dx++) {
              for (let dy = 0; dy < w; dy++) visited[(y + dy) + (x + dx) * CH] = 1;
            }

            quads.push({ id, face: face.name, x, y, z, w, h });
          }
        }
      }
    }
  }

  self.postMessage({ type: 'meshResult', requestId, chunkKey, quads });
};
