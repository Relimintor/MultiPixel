(function () {
  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  const DEFAULT_DAY_SEGMENTS = {
    sunrise: 2 * 60 * 1000,
    day: 8 * 60 * 1000,
    sunset: 2 * 60 * 1000,
    night: 8 * 60 * 1000,
  };

  const SingleplayerDayNightCycle = {
    create({ THREE, getScene, getLights, getBiomeAt, getPlayerPosition, getCurrentRenderDistance, getHasEffect, CHUNK_SIZE, daySegments = DEFAULT_DAY_SEGMENTS }) {
      const segments = {
        sunrise: Number(daySegments.sunrise) || DEFAULT_DAY_SEGMENTS.sunrise,
        day: Number(daySegments.day) || DEFAULT_DAY_SEGMENTS.day,
        sunset: Number(daySegments.sunset) || DEFAULT_DAY_SEGMENTS.sunset,
        night: Number(daySegments.night) || DEFAULT_DAY_SEGMENTS.night,
      };
      const cycleDuration = segments.sunrise + segments.day + segments.sunset + segments.night;
      let cycleTimeMs = segments.sunrise + segments.day / 2;

      function getTimePhaseInfo() {
        const t = cycleTimeMs % cycleDuration;
        const sunriseEnd = segments.sunrise;
        const dayEnd = sunriseEnd + segments.day;
        const sunsetEnd = dayEnd + segments.sunset;

        if (t < sunriseEnd) return { phase: 'Sunrise', localT: t / segments.sunrise };
        if (t < dayEnd) return { phase: 'Day', localT: (t - sunriseEnd) / segments.day };
        if (t < sunsetEnd) return { phase: 'Sunset', localT: (t - dayEnd) / segments.sunset };
        return { phase: 'Night', localT: (t - sunsetEnd) / segments.night };
      }

      function getSunFactor() {
        const phaseInfo = getTimePhaseInfo();
        if (phaseInfo.phase === 'Day') return 1;
        if (phaseInfo.phase === 'Night') return -0.85;
        if (phaseInfo.phase === 'Sunrise') return -0.85 + 1.85 * phaseInfo.localT;
        return 1 - 1.85 * phaseInfo.localT;
      }

      function getCurrentSkyLightCap() {
        const normalized = clamp01((getSunFactor() + 0.85) / 1.85);
        return Math.max(0, Math.min(15, Math.floor(normalized * 15)));
      }

      function setTimeByClock(hours, minutes) {
        const hh = Number.parseInt(hours, 10);
        const mm = Number.parseInt(minutes, 10);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return false;
        const minutesOfDay = hh * 60 + mm;
        cycleTimeMs = (minutesOfDay / 1440) * cycleDuration;
        updateSkyAndSun();
        return true;
      }

      function getFogDistances(renderDistance) {
        const radius = Math.max(1, Number(renderDistance) || 1);
        return {
          nearBase: Math.max(10, radius * CHUNK_SIZE * 0.12),
          nearDayBoost: Math.max(3, radius * CHUNK_SIZE * 0.04),
          farBase: Math.max(42, radius * CHUNK_SIZE * 0.52),
          farDayBoost: Math.max(10, radius * CHUNK_SIZE * 0.16),
        };
      }

      function getBiomeFogAndHumidityEffects() {
        const pos = getPlayerPosition();
        const wx = Math.floor(pos?.x || 0);
        const wz = Math.floor(pos?.z || 0);
        const biome = getBiomeAt(wx, wz);
        const hasBadlandsEffect = typeof getHasEffect === 'function' && getHasEffect('badlands');
        if (biome === 'Badlands' || hasBadlandsEffect) {
          return { humidity: 0.0, nearMul: 1.08, farMul: 0.78, fogTint: 0xe8cf8d };
        }
        if (biome === 'Jungle Forest') {
          return { humidity: 0.9, nearMul: 1.18, farMul: 0.7, fogTint: null };
        }
        return { humidity: 0.5, nearMul: 1.0, farMul: 1.0, fogTint: null };
      }

      function updateSkyAndSun() {
        const scene = getScene();
        const lights = getLights() || {};
        const { ambientLight, hemiLight, moonLight, dirLight } = lights;
        if (!scene?.background || !scene?.fog || !ambientLight || !hemiLight || !moonLight || !dirLight) return;

        const sunFactor = getSunFactor();
        const dayColor = new THREE.Color(0x87ceeb);
        const twilightColor = new THREE.Color(0x9a7d90);
        const nightColor = new THREE.Color(0x1a1a2e);

        let skyColor;
        if (sunFactor > 0.1) {
          const k = clamp01((sunFactor - 0.1) / 0.9);
          skyColor = twilightColor.clone().lerp(dayColor, k);
        } else {
          const k = clamp01((sunFactor + 0.85) / 0.95);
          skyColor = nightColor.clone().lerp(twilightColor, k);
        }

        const biomeEffects = getBiomeFogAndHumidityEffects();
        if (biomeEffects.fogTint) {
          const tint = new THREE.Color(biomeEffects.fogTint);
          skyColor.lerp(tint, 0.2);
        }
        scene.background.copy(skyColor);
        scene.fog.color.copy(skyColor);

        const angle = (cycleTimeMs / cycleDuration) * (2 * Math.PI);
        const daylight = Math.max(0, sunFactor + 0.1);
        const nightness = Math.max(0, -sunFactor);

        dirLight.intensity = Math.max(0.04, daylight) * 1.18;
        dirLight.position.x = Math.sin(angle) * 100;
        dirLight.position.y = Math.cos(angle) * 100;
        dirLight.position.z = Math.sin(angle) * 50;

        moonLight.intensity = 0.06 + nightness * 0.34;
        moonLight.position.x = -Math.sin(angle) * 85;
        moonLight.position.y = Math.max(8, -Math.cos(angle) * 85);
        moonLight.position.z = -Math.sin(angle) * 45;

        ambientLight.intensity = 0.26 + daylight * 0.45;
        hemiLight.intensity = 0.18 + daylight * 0.55;

        const fog = getFogDistances(getCurrentRenderDistance());
        scene.fog.near = (fog.nearBase + daylight * fog.nearDayBoost) * biomeEffects.nearMul;
        scene.fog.far = (fog.farBase + daylight * fog.farDayBoost) * biomeEffects.farMul;

        window.SingleplayerClimateState = window.SingleplayerClimateState || {};
        window.SingleplayerClimateState.humidity = biomeEffects.humidity;
      }

      function tick(deltaMs) {
        cycleTimeMs = (cycleTimeMs + deltaMs) % cycleDuration;
        updateSkyAndSun();
      }

      return {
        getTimePhaseInfo,
        getSunFactor,
        getCurrentSkyLightCap,
        setTimeByClock,
        updateSkyAndSun,
        tick,
      };
    }
  };

  window.SingleplayerDayNightCycle = SingleplayerDayNightCycle;
})();
