(function () {
  const SingleplayerFrustumOptimizations = {
    create({ THREE, getCamera, chunks, CHUNK_SIZE, CHUNK_HEIGHT, intervalMs }) {
      const frustum = new THREE.Frustum();
      const cameraViewProj = new THREE.Matrix4();
      const frustumTempCenter = new THREE.Vector3();
      const frustumTempSphere = new THREE.Sphere();
      const lastFrustumCameraPos = new THREE.Vector3();
      const lastFrustumCameraQuat = new THREE.Quaternion();
      let hasFrustumCameraState = false;
      let lastFrustumCullMs = -Infinity;

      function updateChunkFrustumCulling() {
        const camera = getCamera();
        if (!camera) return;
        camera.updateMatrixWorld();
        cameraViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(cameraViewProj);

        for (const group of chunks.values()) {
          frustumTempCenter.set(
            group.userData.cx * CHUNK_SIZE + CHUNK_SIZE * 0.5,
            CHUNK_HEIGHT * 0.5,
            group.userData.cz * CHUNK_SIZE + CHUNK_SIZE * 0.5
          );
          frustumTempSphere.center.copy(frustumTempCenter);
          frustumTempSphere.radius = group.userData.frustumRadius || 40;
          group.visible = frustum.intersectsSphere(frustumTempSphere);
        }
      }

      function maybeUpdateChunkFrustumCulling(nowMs) {
        const camera = getCamera();
        if (!camera) return false;

        const intervalElapsed = (nowMs - lastFrustumCullMs) >= intervalMs;
        const movedSq = hasFrustumCameraState ? camera.position.distanceToSquared(lastFrustumCameraPos) : Infinity;
        const rotatedDelta = hasFrustumCameraState ? (1 - Math.abs(camera.quaternion.dot(lastFrustumCameraQuat))) : Infinity;
        const cameraChanged = movedSq > 0.04 || rotatedDelta > 0.00008;

        if (!intervalElapsed && !cameraChanged) return false;

        lastFrustumCullMs = nowMs;
        lastFrustumCameraPos.copy(camera.position);
        lastFrustumCameraQuat.copy(camera.quaternion);
        hasFrustumCameraState = true;
        updateChunkFrustumCulling();
        return true;
      }

      return {
        updateChunkFrustumCulling,
        maybeUpdateChunkFrustumCulling,
      };
    }
  };

  window.SingleplayerFrustumOptimizations = SingleplayerFrustumOptimizations;
})();
