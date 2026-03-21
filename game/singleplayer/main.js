        // --- 1. CONFIGURATION ---
        const {
            CHUNK_SIZE,
            CHUNK_HEIGHT,
            WORLD_RADIUS,
            BLOCK_SIZE,
            SEA_LEVEL,
            BASE_LAND_Y,
            ISLAND_RADIUS,
            WORLD_GEN_SETTINGS,
            CAVE_SCALE,
            CAVE_THRESHOLD,
            CAVE_MIN_Y,
            CAVE_MAX_Y_OFFSET,
            PLAYER_HEIGHT,
            PLAYER_RADIUS,
            GRAVITY,
            JUMP_POWER,
            INV_COLS,
            INV_ROWS,
            HOTBAR_SLOTS,
            TOTAL_INV_SIZE,
            ASSET_FILEPATHS,
            blockMaterials,
            SOLID_BLOCKS,
            LIQUID_BLOCKS,
            SIDE_RENDER_BLOCK_IDS = [],
            DEFAULT_PLAYER
        } = window.SingleplayerConfig;

        const { checkCraftingRecipe, consumeCraftingInputForOne } = window.CraftingSystem;
        const PickaxeSystem = window.PickaxeSystem || {};
        const BlockHardnessSystem = window.BlockHardnessSystem || {};
        const BlockBreakableSystem = window.BlockBreakableSystem || {};
        const SpawnLighting = window.SpawnLighting || {};

        window.__SINGLEPLAYER_BUILD__ = 'sp-2026-03-01-06';
        console.info('[Singleplayer build]', window.__SINGLEPLAYER_BUILD__);

        const TerrainModules = {
            ocean: window.OceanTerrain || {},
            river: window.RiverTerrain || {},
            oakForest: window.OakForestTerrain || {},
            desert: window.DesertTerrain || {},
            plains: window.PlainsTerrain || {},
            snowyPlains: window.SnowyPlainsTerrain || {},
            jungleForest: window.JungleForestTerrain || {},
            mountains: window.MountainsTerrain || {},
        };

        const worldGenSettings = WORLD_GEN_SETTINGS || {};
        const wasmSettings = worldGenSettings.wasm || {};
        const terrainCarvingSettings = worldGenSettings.terrainCarving || {};
        const CAVE_SURFACE_SAFETY_DEPTH = Math.max(2, Number(terrainCarvingSettings.caveSurfaceSafetyDepth) || 7);
        const RAVINE_SURFACE_SAFETY_DEPTH = Math.max(3, Number(terrainCarvingSettings.ravineSurfaceSafetyDepth) || 8);
        const RAVINE_ACTIVATION_THRESHOLD = Math.max(0.75, Math.min(0.98, Number(terrainCarvingSettings.ravineActivationThreshold) || 0.9));
        const CHUNK_CREATION_BUDGET_PER_TICK = Math.max(1, Math.floor(Number(worldGenSettings.chunkCreationBudgetPerTick) || 3));
        const CHUNK_CREATION_BUDGET_FORCE = Math.max(CHUNK_CREATION_BUDGET_PER_TICK, Math.floor(Number(worldGenSettings.chunkCreationBudgetOnForceUpdate) || 10));
        const BLOCK_UPDATES_PER_TICK_MAX = Math.max(1, Math.floor(Number(worldGenSettings.blockUpdatesPerTickMax) || 100));
        const FLUID_UPDATES_PER_TICK_MAX = Math.max(1, Math.floor(Number(worldGenSettings.fluidUpdatesPerTickMax) || 100));
        const REDSTONE_UPDATES_PER_TICK_MAX = Math.max(0, Math.floor(Number(worldGenSettings.redstoneUpdatesPerTickMax) || 100));
        const MESH_REBUILD_BUDGET_PER_FRAME = Math.max(1, Math.floor(Number(worldGenSettings.meshRebuildBudgetPerFrame) || 2));
        const MESH_REBUILD_BUDGET_FORCE = Math.max(MESH_REBUILD_BUDGET_PER_FRAME, Math.floor(Number(worldGenSettings.meshRebuildBudgetOnForceUpdate) || (MESH_REBUILD_BUDGET_PER_FRAME * 4)));
        const USE_WASM_CAVE_SAMPLING = Boolean(wasmSettings.enabled && wasmSettings.preferCaveSampling);

        function normalizeWorldSeed(seedValue) {
            const parsed = Number(seedValue);
            if (!Number.isFinite(parsed)) return null;
            const normalized = Math.abs(Math.floor(parsed)) % 2147483647;
            return normalized > 0 ? normalized : 1;
        }

        function normalizeBiomeLookupKey(value) {
            return String(value || '').toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
        }

        function buildBiomeProfiles() {
            const profiles = [];
            const addProfile = (moduleKey, meta, inherited = {}) => {
                if (!meta?.name) return;
                profiles.push({
                    moduleKey,
                    ...inherited,
                    ...meta,
                    aliases: Array.isArray(meta.aliases) ? meta.aliases : [],
                });
            };

            Object.entries(TerrainModules).forEach(([moduleKey, terrainModule]) => {
                const meta = terrainModule?.meta;
                if (!meta) return;
                addProfile(moduleKey, meta);
                const variants = Array.isArray(meta.variants) ? meta.variants : [];
                variants.forEach((variant) => addProfile(moduleKey, {
                    ...meta,
                    ...variant,
                    variants: undefined,
                    aliases: variant.aliases,
                }, {
                    baseName: meta.name,
                    villageKey: variant.villageKey ?? meta.villageKey,
                    treeEligible: variant.treeEligible ?? meta.treeEligible,
                    treeSpawnChance: variant.treeSpawnChance ?? meta.treeSpawnChance,
                    treeDensityKey: variant.treeDensityKey ?? meta.treeDensityKey,
                    climateTarget: variant.climateTarget ?? meta.climateTarget,
                    isOcean: variant.isOcean ?? meta.isOcean,
                }));
            });
            return profiles;
        }

        const BIOME_PROFILES = buildBiomeProfiles();
        const BIOME_PROFILE_BY_LOOKUP = new Map();
        BIOME_PROFILES.forEach((profile) => {
            BIOME_PROFILE_BY_LOOKUP.set(normalizeBiomeLookupKey(profile.name), profile);
            profile.aliases.forEach((alias) => BIOME_PROFILE_BY_LOOKUP.set(normalizeBiomeLookupKey(alias), profile));
        });
        const VILLAGE_BIOME_KEYS = Array.from(new Set(BIOME_PROFILES.map((profile) => profile.villageKey).filter(Boolean)));

        function resolveBiomeProfile(rawBiome) {
            return BIOME_PROFILE_BY_LOOKUP.get(normalizeBiomeLookupKey(rawBiome)) || null;
        }

        function formatVillageBiomeKeyList() {
            return VILLAGE_BIOME_KEYS.join(', ');
        }

        const villagePieceDesignRegistry = (() => {
            const existing = window.SingleplayerVillagePieceRegistry;
            if (existing?.register && existing?.get) return existing;
            const definitions = new Map();
            const normalizePiece = (value) => String(value || '').toLowerCase().trim().replace(/\.json$/i, '');
            return window.SingleplayerVillagePieceRegistry = {
                definitions,
                register(definition) {
                    const biomeKey = normalizeVillageBiomeKey(definition?.biome || definition?.biomeKey || '');
                    const pieceId = normalizePiece(definition?.pieceId || definition?.id || '');
                    if (!biomeKey || !pieceId || !definition?.design) return false;
                    definitions.set(`${biomeKey}:${pieceId}`, {
                        biomeKey,
                        pieceId,
                        ...definition,
                        design: { ...(definition.design || {}) },
                    });
                    return true;
                },
                get(biomeKey, pieceId) {
                    return definitions.get(`${normalizeVillageBiomeKey(biomeKey)}:${normalizePiece(pieceId)}`) || null;
                },
            };
        })();
        const villagePieceDesignLoaders = new Map();

        function normalizeVillagePieceId(pieceId) {
            return String(pieceId || '').toLowerCase().trim().replace(/\.json$/i, '');
        }

        function getVillagePieceDesignScriptPath(biomeKey, pieceId) {
            const normalizedBiomeKey = normalizeVillageBiomeKey(biomeKey) || String(biomeKey || '').trim();
            const normalizedPieceId = normalizeVillagePieceId(pieceId);
            if (!normalizedBiomeKey || !normalizedPieceId) return '';
            return `./structures/villages/${normalizedBiomeKey}/${normalizedPieceId}.js`;
        }

        function getVillagePieceDesign(biomeKey, pieceId) {
            return villagePieceDesignRegistry.get(biomeKey, pieceId)?.design || null;
        }

        async function ensureVillagePieceDesignLoaded(biomeKey, pieceId) {
            const normalizedBiomeKey = normalizeVillageBiomeKey(biomeKey);
            const normalizedPieceId = normalizeVillagePieceId(pieceId);
            if (!normalizedBiomeKey || !normalizedPieceId) return null;
            const existingDesign = getVillagePieceDesign(normalizedBiomeKey, normalizedPieceId);
            if (existingDesign) return existingDesign;

            const loaderKey = `${normalizedBiomeKey}:${normalizedPieceId}`;
            if (!villagePieceDesignLoaders.has(loaderKey)) {
                villagePieceDesignLoaders.set(loaderKey, new Promise((resolve) => {
                    const scriptPath = getVillagePieceDesignScriptPath(normalizedBiomeKey, normalizedPieceId);
                    if (!scriptPath) return resolve(null);
                    const script = document.createElement('script');
                    script.src = `${scriptPath}?v=1`;
                    script.async = true;
                    script.onload = () => resolve(getVillagePieceDesign(normalizedBiomeKey, normalizedPieceId));
                    script.onerror = () => {
                        console.warn('[VillagePieceDesign] failed to load', scriptPath);
                        resolve(null);
                    };
                    document.head.appendChild(script);
                }));
            }
            return villagePieceDesignLoaders.get(loaderKey);
        }

        async function loadVillagePieceDesigns(biomeKey, pieceIds) {
            const designs = {};
            const ids = Array.isArray(pieceIds) ? pieceIds : [];
            await Promise.all(ids.map(async (pieceId) => {
                const normalizedPieceId = normalizeVillagePieceId(pieceId);
                if (!normalizedPieceId) return;
                const design = await ensureVillagePieceDesignLoaded(biomeKey, normalizedPieceId);
                if (design) designs[normalizedPieceId] = design;
            }));
            return designs;
        }

        async function loadVillagePieceDefinitions(biomeKey, pieceIds) {
            const definitions = {};
            const ids = Array.isArray(pieceIds) ? pieceIds : [];
            await Promise.all(ids.map(async (pieceId) => {
                const normalizedPieceId = normalizeVillagePieceId(pieceId);
                if (!normalizedPieceId) return;
                const path = `./structures/villages/${normalizeVillageBiomeKey(biomeKey)}/${normalizedPieceId}.json`;
                try {
                    const res = await fetch(path, { cache: 'no-store' });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    definitions[normalizedPieceId] = await res.json();
                } catch (err) {
                    console.warn('[VillagePiece] failed to load', path, err);
                }
            }));
            return definitions;
        }

        function resolveWorldSeed() {
            // Always use a fresh random seed per game load so terrain changes each time.
            // Optional override: if WORLD_GEN_SETTINGS.seed is provided, honor that value.
            const configuredSeed = normalizeWorldSeed(worldGenSettings.seed);
            if (configuredSeed) return configuredSeed;
            return Math.floor(Math.random() * 2147483646) + 1;
        }

        let lastTime = 0; // For delta time calculation
        let inventoryEntityUpdateAccumulatorMs = 0;
        let ambientLight, hemiLight, moonLight, dirLight; // global lighting rig
        let dayNightCycle = null;

        const BREATH_MAX = 20;
        const playerRuntime = window.SingleplayerPlayerCore.createRuntime({
            THREE,
            DEFAULT_PLAYER,
            TOTAL_INV_SIZE,
            BREATH_MAX,
            coarsePointer: window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false,
            noHover: window.matchMedia ? window.matchMedia('(hover: none)').matches : false,
            touchCapable: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
            PLAYER_HEIGHT,
        });
        const {
            constants: {
                INVENTORY_ENTITY_UPDATE_INTERVAL_MS,
                SWIM_SPEED_FACTOR,
                SWIM_VERTICAL_SPEED,
                SWIM_SINK_SPEED,
                SWIM_SPRINT_MULTIPLIER,
                BREATH_DRAIN_PER_SEC,
                BREATH_REGEN_PER_SEC,
                DROWN_DAMAGE_INTERVAL_SEC,
                AIR_POP_DURATION_SEC,
                DEFAULT_LOOK_SENSITIVITY,
                DEFAULT_INTERACTION_REACH,
                FLY_VERTICAL_SPEED,
                PLAYER_EYE_HEIGHT_RATIO,
                MOB_COLLISION_RADIUS,
            },
            player,
        } = playerRuntime;
        let currentLookSensitivity = DEFAULT_LOOK_SENSITIVITY;
        let currentInteractionReach = DEFAULT_INTERACTION_REACH;

        // Three.js specific materials created after textures are loaded
        let materials = {};

// --- 2. CREATE PERLIN INSTANCE ---
        let worldSeed = resolveWorldSeed();
const perlinInstance = new PerlinNoise(worldSeed);

// Make it globally accessible for biomes
window.perlin = perlinInstance;

        // --- 2. GAME STATE & THREE.JS SETUP ---

        function setSensitivity(amount) {
            const parsed = Number(amount);
            if (!Number.isFinite(parsed) || parsed <= 0) return false;
            currentLookSensitivity = parsed;
            player.rotationSpeed = DEFAULT_PLAYER.rotationSpeed * (parsed / DEFAULT_LOOK_SENSITIVITY);
            return true;
        }

        function getSensitivity() {
            return currentLookSensitivity;
        }

        function setReach(amount) {
            const parsed = Number(amount);
            if (!Number.isFinite(parsed) || parsed <= 0) return false;
            currentInteractionReach = parsed;
            if (raycaster) raycaster.far = parsed;
            return true;
        }

        function getReach() {
            return currentInteractionReach;
        }

        function prepareCrosshairRaycast() {
            if (!raycaster || !camera) return false;
            raycaster.far = currentInteractionReach;
            raycaster.setFromCamera({ x: 0, y: 0 }, camera);
            return true;
        }

        const adaptiveCrosshairController = window.SingleplayerAdaptiveCrosshair?.createController({
            element: 'crosshair',
            initialState: 'default',
            visible: true,
        }) || null;
        const ADAPTIVE_CROSSHAIR_SAMPLE_INTERVAL_MS = 50;
        const SELF_USE_ITEM_IDS = new Set([89, 90, 92, 109, 111, 112]);
        let crosshairStyleKey = 'idle';
        let lastAdaptiveCrosshairSampleAt = -Infinity;
        let lastAdaptiveCrosshairResult = null;

        function setCrosshairVisible(visible) {
            const crosshair = document.getElementById('crosshair');
            const nextVisible = visible !== false;
            if (adaptiveCrosshairController?.setVisible) {
                adaptiveCrosshairController.setVisible(nextVisible);
            } else if (crosshair) {
                crosshair.style.opacity = nextVisible ? 1 : 0;
            }
        }

        function applyCrosshairStyle(styleKey) {
            const nextStyleKey = styleKey || 'idle';
            if (crosshairStyleKey === nextStyleKey) {
                adaptiveCrosshairController?.setState(nextStyleKey);
                return;
            }
            crosshairStyleKey = nextStyleKey;
            adaptiveCrosshairController?.setState(nextStyleKey);
        }

        function shouldUseSelfCrosshair() {
            const held = inventory[selectedHotbarIndex];
            return Boolean(held && SELF_USE_ITEM_IDS.has(held.id));
        }

        function getCrosshairEntityTarget() {
            if (!prepareCrosshairRaycast()) return null;
            const hitboxes = [];
            const pushHitboxes = (entities, hitboxKey, profile) => {
                for (const entity of entities) {
                    const hitbox = entity?.root?.userData?.[hitboxKey];
                    if (!hitbox) continue;
                    hitboxes.push({ hitbox, profile });
                }
            };
            pushHitboxes(zombieMob?.getEntities?.() || [], 'zombieHitbox', { style: 'hostile' });
            pushHitboxes(wolfMob?.getEntities?.() || [], 'wolfHitbox', { style: 'passive' });
            pushHitboxes(pandaMob?.getEntities?.() || [], 'pandaHitbox', { style: 'passive' });
            pushHitboxes(villagerMob?.getEntities?.() || [], 'villagerHitbox', { style: 'interact' });
            pushHitboxes(pigMob?.getEntities?.() || [], 'pigHitbox', { style: 'passive' });
            if (!hitboxes.length) return null;
            const hits = raycaster.intersectObjects(hitboxes.map((entry) => entry.hitbox), false);
            if (!hits.length) return null;
            const hitObj = hits[0].object;
            return hitboxes.find((entry) => entry.hitbox === hitObj)?.profile || null;
        }

        function getCrosshairBlockStyle() {
            if (miningState.active) return 'mining';
            const target = getTargetBlockFromCrosshair();
            if (!target) return 'idle';
            if (target.blockId === 9 || target.blockId === 23 || target.blockId === 82) return 'interact';
            const miningInfo = getMiningDurationMs(target.blockId);
            if (!Number.isFinite(miningInfo?.durationMs)) return 'blocked';
            if (miningInfo?.reason === 'tool_too_weak') return 'blocked';
            return 'idle';
        }

        function resolveAdaptiveCrosshairResult() {
            const entityTarget = getCrosshairEntityTarget();
            if (entityTarget?.style) {
                return { visible: true, style: entityTarget.style };
            }
            const blockStyle = getCrosshairBlockStyle();
            if (blockStyle !== 'idle') {
                return { visible: true, style: blockStyle };
            }
            return { visible: true, style: shouldUseSelfCrosshair() ? 'use_self' : 'idle' };
        }

        function applyAdaptiveCrosshairResult(nextResult) {
            if (!lastAdaptiveCrosshairResult || lastAdaptiveCrosshairResult.visible !== nextResult.visible) {
                setCrosshairVisible(nextResult.visible);
            }
            if (!lastAdaptiveCrosshairResult || lastAdaptiveCrosshairResult.style !== nextResult.style) {
                applyCrosshairStyle(nextResult.style);
            }
            lastAdaptiveCrosshairResult = nextResult;
        }

        function updateAdaptiveCrosshair(force = false) {
            const now = performance.now();
            if (mobileControls.enabled || !player.canMove || isInventoryOpen) {
                lastAdaptiveCrosshairSampleAt = now;
                applyAdaptiveCrosshairResult({ visible: false, style: 'idle' });
                return;
            }
            if (!force
                && lastAdaptiveCrosshairResult?.visible
                && (now - lastAdaptiveCrosshairSampleAt) < ADAPTIVE_CROSSHAIR_SAMPLE_INTERVAL_MS) {
                return;
            }
            lastAdaptiveCrosshairSampleAt = now;
            applyAdaptiveCrosshairResult(resolveAdaptiveCrosshairResult());
        }

      
        let inventory = playerRuntime.inventory;
        const knockbackEnchantByItemId = new Map();
        let selectedHotbarIndex = playerRuntime.selectedHotbarIndex; // 0-8
        let isInventoryOpen = playerRuntime.isInventoryOpen;
        let isCreativeMode = playerRuntime.isCreativeMode;
        let isCreativeMenuOpen = playerRuntime.isCreativeMenuOpen;
        const creativeCatalog = playerRuntime.creativeCatalog;
        const playerPrivileges = playerRuntime.playerPrivileges;
        let isFlyActive = playerRuntime.isFlyActive;
        let lastSpaceTapAt = playerRuntime.lastSpaceTapAt;

        // --- NEW CRAFTING STATE VARIABLES ---
        let isCraftingTableOpen = false;
        let isFurnaceOpen = false;
        let activeFurnaceKey = null;
        let activeChestKey = null;
        const furnaceStates = new Map();
        const chestStates = new Map();
        let craftingInput = new Array(4).fill(null); // 2x2 Grid
        let craftingTableInput = new Array(9).fill(null); // 3x3 Grid
        let craftingOutput = null; 
        let heldItem = null; 
        let heldItemSourceIndex = -1; 
        let heldItemSourceType = null; 

        // Mining / breaking state
        const BREAKING_TEXTURE_BASE = `${window.SingleplayerConfig?.REPO_BASE_PREFIX || '/MultiPixel'}/game/singleplayer/assets/breaking`;
        const BREAKING_PARTICLE_BASE = `${BREAKING_TEXTURE_BASE}/particles`;
        let miningState = { active: false, key: null, blockPos: null, targetType: 0, elapsedMs: 0, neededMs: 0, missMs: 0, dropOnBreak: true, particleMs: 0 };
        let miningSwingTimerMs = 0;
        let isLeftMouseDown = false;
        const breakingStageTextures = new Array(10).fill(null);
        const airState = playerRuntime.airState;
        let breakingCrackMesh = null;
        let breakParticleTexture = null;
        let lavaParticleTexture = null;
        const activeWorldParticles = [];
        const particleSpritePool = [];
        const particleMaterials = { break: null, lava: null };
        let lavaParticleScanMs = 0;
        let lastPhysicsTickMs = 0;
        function chunkKeyFromCoords(cx, cz) {
            return `${cx},${cz}`;
        }

        let remeshOptimizations = null;

        function requestChunkRemesh(cx, cz, reason = 'block') {
            remeshOptimizations?.requestChunkRemesh?.(cx, cz, reason);
        }

        function requestChunkAndNeighborsRemesh(cx, cz, reason = 'neighbor') {
            remeshOptimizations?.requestChunkAndNeighborsRemesh?.(cx, cz, reason);
        }

        function rebuildDirtyChunkMeshes(forceAll = false) {
            return remeshOptimizations?.rebuildDirtyChunkMeshes?.(forceAll) || 0;
        }

        function markBatchedChunkRemeshNeed(cx, cz, includeNeighbors = false) {
            remeshOptimizations?.markBatchedChunkRemeshNeed?.(cx, cz, includeNeighbors);
        }

        function beginBlockUpdateBatch() {
            remeshOptimizations?.beginBlockUpdateBatch?.();
        }

        function endBlockUpdateBatch() {
            remeshOptimizations?.endBlockUpdateBatch?.();
        }

        function applyBlockUpdateBatch(cb) {
            if (!remeshOptimizations?.applyBlockUpdateBatch) return cb();
            return remeshOptimizations.applyBlockUpdateBatch(cb);
        }
        let physicsCursorY = 1;

        const MOBILE_ASSET_BASE = `${window.SingleplayerConfig?.REPO_BASE_PREFIX || ''}/game/singleplayer/assets/mobile`;
        const mobileControls = playerRuntime.mobileControls;
        const mobileDeviceControls = window.SingleplayerDeviceMobile?.create?.({
            mobileControls,
            mobileAssetBase: MOBILE_ASSET_BASE,
            player,
            getIsInventoryOpen: () => isInventoryOpen,
            getYawObject: () => yawObject,
            getPitchObject: () => pitchObject,
            setCrosshairVisible: (visible) => setCrosshairVisible(visible),
            toggleInventory: () => toggleInventory(),
            toggleCameraViewMode: () => toggleCameraViewMode(),
            toggleChat: () => window.SingleplayerChat?.toggle?.(),
            updateSkinPreviewLook: (x, y) => updateSkinPreviewLook(x, y),
            getTargetBlockFromCrosshair: () => getTargetBlockFromCrosshair(),
            beginMiningTarget: (target) => beginMiningTarget(target),
            updateBreakingOverlay: () => updateBreakingOverlay(),
            interactOrPlaceAtCrosshair: () => interactOrPlaceAtCrosshair(),
            getMiningState: () => miningState,
            setIsLeftMouseDown: (value) => { isLeftMouseDown = value; },
            getIsLeftMouseDown: () => isLeftMouseDown,
        }) || null;
        const pcDeviceControls = window.SingleplayerDevicePc?.create?.({
            mobileControls,
            player,
            getIsInventoryOpen: () => isInventoryOpen,
            getYawObject: () => yawObject,
            getPitchObject: () => pitchObject,
            setCrosshairVisible: (visible) => setCrosshairVisible(visible),
            toggleInventory: () => toggleInventory(),
        }) || null;

        const renderOptimizationSettings = window.SingleplayerRenderOptimizations?.create?.({
            windowRef: window,
            navigatorRef: navigator,
            worldGenSettings,
            WORLD_RADIUS,
            CHUNK_SIZE,
        }) || {};
        const isLowEndDevice = Boolean(renderOptimizationSettings.isLowEndDevice);
        function computeRenderPixelRatio() {
            if (renderOptimizationSettings.computeRenderPixelRatio) {
                return renderOptimizationSettings.computeRenderPixelRatio();
            }
            return window.devicePixelRatio || 1;
        }

        let targetRenderPixelRatio = Number(renderOptimizationSettings.initialRenderPixelRatio) || computeRenderPixelRatio();
        const baseChunkRenderDistance = Math.max(4, Math.min(WORLD_RADIUS, Number(renderOptimizationSettings.baseChunkRenderDistance) || 4));
        let currentChunkLoadRadius = baseChunkRenderDistance;
        // Backward-compatible alias for code paths that still reference the old name.
        let effectiveChunkLoadRadius = currentChunkLoadRadius;
        const ENTITY_ACTIVATION_RANGE = Math.max(24, Number(worldGenSettings.entityActivationRange) || 72);
        const ENTITY_ACTIVATION_RANGE_SQ = ENTITY_ACTIVATION_RANGE * ENTITY_ACTIVATION_RANGE;
        const CHUNK_UPDATE_INTERVAL_MS = Math.max(1, Number(renderOptimizationSettings.chunkUpdateIntervalMs) || 90);
        const FRUSTUM_CULL_INTERVAL_MS = Math.max(1, Number(renderOptimizationSettings.frustumCullIntervalMs) || 60);
        const FOG_BASE_NEAR = Number(renderOptimizationSettings.fogBaseNear) || Math.max(12, effectiveChunkLoadRadius * CHUNK_SIZE * 0.18);
        const FOG_DAY_NEAR_BOOST = Number(renderOptimizationSettings.fogDayNearBoost) || Math.max(4, effectiveChunkLoadRadius * CHUNK_SIZE * 0.05);
        const FOG_BASE_FAR = Number(renderOptimizationSettings.fogBaseFar) || Math.max(54, effectiveChunkLoadRadius * CHUNK_SIZE * 0.72);
        const FOG_DAY_FAR_BOOST = Number(renderOptimizationSettings.fogDayFarBoost) || Math.max(16, effectiveChunkLoadRadius * CHUNK_SIZE * 0.22);
     

      
        let scene, camera, renderer, perlin, raycaster;
        let worldGenerator = null;
        let spawnBiomeName = 'Plains';
        let wasmRuntime = window.WorldgenWasmRuntime || null;
        let lightingSystem = null;
        const torchLightsByChunk = new Map();
        const chunks = new Map();
        const sparseAirChunkKeys = new Set();
        const worldGroup = new THREE.Group();
        let frustumOptimizations = null;
        let chunkStreamOptimizations = null;
        let defaultPlayerSkin = null;
        let dirtToGrassLoop = null;
        let waypointsMod = null;
        let pigMob = null;
        let zombieMob = null;
        let wolfMob = null;
        let pandaMob = null;
        let villagerMob = null;
        remeshOptimizations = window.SingleplayerChunkRemeshOptimizations?.create?.({
            getChunkKey: chunkKeyFromCoords,
            getChunk: (key) => chunks.get(key),
            updateChunkGeometry,
            meshRebuildBudgetPerFrame: MESH_REBUILD_BUDGET_PER_FRAME,
            meshRebuildBudgetForce: MESH_REBUILD_BUDGET_FORCE,
        }) || null;
        dayNightCycle = window.SingleplayerDayNightCycle?.create?.({
            THREE,
            getScene: () => scene,
            getLights: () => ({ ambientLight, hemiLight, moonLight, dirLight }),
            getBiomeAt: (x, z) => getBiome(x, z),
            getPlayerPosition: () => yawObject?.position,
            getCurrentRenderDistance: () => currentChunkLoadRadius,
            CHUNK_SIZE,
        }) || null;
        defaultPlayerSkin = window.SingleplayerDefaultSkin?.create?.({
            THREE,
            playerRuntime,
            player,
            getCamera: () => camera,
            getPlayerPrivileges: () => playerPrivileges,
            getIsFlyActive: () => isFlyActive,
            getIsInventoryOpen: () => isInventoryOpen,
            getSelectedHotbarIndex: () => selectedHotbarIndex,
            getInventory: () => inventory,
            getBlockMaterials: () => blockMaterials,
            getAssetFilepaths: () => ASSET_FILEPATHS,
            getMiningSwingTimerMs: () => miningSwingTimerMs,
            showGameMessage,
        }) || null;
        dirtToGrassLoop = window.SingleplayerDirtToGrassLoop?.create?.({
            CHUNK_SIZE,
            CHUNK_HEIGHT,
            getYawObject: () => yawObject,
            getChunks: () => chunks,
            getBlockType,
            getColumnTopFromData,
            setBlockTypeRaw,
        }) || null;
        waypointsMod = window.SingleplayerWaypoints?.create?.({
            THREE,
            getCamera: () => camera,
            getRenderer: () => renderer,
            getPlayerPosition: () => yawObject?.position || null,
            showGameMessage,
        }) || null;
        pigMob = window.SingleplayerPigMob?.create?.({
            THREE,
            getScene: () => scene,
            getYawObject: () => yawObject,
            getInventory: () => inventory,
            getSelectedHotbarIndex: () => selectedHotbarIndex,
            getLightingSystem: () => lightingSystem,
            getRaycaster: () => raycaster,
            prepareCrosshairRaycast,
            getSurfaceYForEntity,
            getBlockType,
            isLiquid,
            isSolid,
            isEntityActiveAt,
            applyMobCommandHeight,
            applyHitFeedback,
            tickMobHitFeedback,
            showGameMessage,
        }) || null;
        zombieMob = window.SingleplayerZombieMob?.create?.({
            THREE,
            getScene: () => scene,
            CHUNK_HEIGHT,
            getYawObject: () => yawObject,
            getLightingSystem: () => lightingSystem,
            getTimePhaseInfo,
            getRaycaster: () => raycaster,
            prepareCrosshairRaycast,
            getSurfaceYForEntity,
            getBlockType,
            isLiquid,
            isSolid,
            isEntityActiveAt,
            applyMobCommandHeight,
            applyHitFeedback,
            tickMobHitFeedback,
            takeDamage,
            addToInventory,
            showGameMessage,
        }) || null;
        wolfMob = window.SingleplayerWolfMob?.create?.({
            THREE,
            getScene: () => scene,
            getYawObject: () => yawObject,
            getRaycaster: () => raycaster,
            prepareCrosshairRaycast,
            getSurfaceYForEntity,
            isEntityActiveAt,
            applyMobCommandHeight,
            applyHitFeedback,
            showGameMessage,
            getPigEntities: () => pigMob?.getEntities?.() || [],
            getZombieEntities: () => zombieMob?.getEntities?.() || [],
            hurtPig: (pig, amount, source, sourcePos, extraKnockback) => pigMob?.hurt?.(pig, amount, source, sourcePos, extraKnockback),
            hurtZombie: (zombie, amount, sourcePos, extraKnockback) => zombieMob?.hurt?.(zombie, amount, sourcePos, extraKnockback),
        }) || null;
        pandaMob = window.SingleplayerPandaMob?.create?.({
            THREE,
            getScene: () => scene,
            getYawObject: () => yawObject,
            getRaycaster: () => raycaster,
            prepareCrosshairRaycast,
            getSurfaceYForEntity,
            isEntityActiveAt,
            applyMobCommandHeight,
            applyHitFeedback,
            tickMobHitFeedback,
            showGameMessage,
            addToInventory,
            takeDamage,
        }) || null;
        villagerMob = window.SingleplayerVillagerMob?.create?.({
            THREE,
            getScene: () => scene,
            getYawObject: () => yawObject,
            getRaycaster: () => raycaster,
            prepareCrosshairRaycast,
            getSurfaceYForEntity,
            getBlockType,
            isLiquid,
            isEntityActiveAt,
            applyMobCommandHeight,
            applyHitFeedback,
            tickMobHitFeedback,
            showGameMessage,
            getZombieEntities: () => zombieMob?.getEntities?.() || [],
            createStevePartMesh,
            getSkinPartRects,
        }) || null;
        let yawObject, pitchObject; 
        let currentPlayerHeight = playerRuntime.currentPlayerHeight;

        function getPlayerEyeHeight(height = currentPlayerHeight) {
            return height * PLAYER_EYE_HEIGHT_RATIO;
        }

        function syncPlayerHeightVisuals() {
            if (pitchObject) {
                pitchObject.position.y = getPlayerEyeHeight();
            }
            const playerAvatar = defaultPlayerSkin?.getPlayerAvatar?.();
            if (playerAvatar) {
                const avatarScale = currentPlayerHeight / PLAYER_HEIGHT;
                playerAvatar.scale.set(avatarScale, avatarScale, avatarScale);
            }
        }

        function getPlayerHeight() {
            return currentPlayerHeight / BLOCK_SIZE;
        }

        function setPlayerHeight(heightBlocks) {
            const parsed = Number(heightBlocks);
            if (!Number.isFinite(parsed) || parsed <= 0) return false;
            currentPlayerHeight = parsed * BLOCK_SIZE;
            syncPlayerHeightVisuals();
            return true;
        }
        let iglooStructureDef = null;
        const villageTemplatesByBiomeKey = new Map();
        const gnomeEntities = [];
        let bambooGrowthTimerMs = 0;
        let eatOverlayEl = playerRuntime.eatOverlayEl;
        let eatItemEl = playerRuntime.eatItemEl;
        let eatingAnimState = playerRuntime.eatingAnimState;
        
        // Calculate the world boundary coordinates
        const WORLD_MAX_COORD = Number.POSITIVE_INFINITY;
        const WORLD_MIN_COORD = Number.NEGATIVE_INFINITY;
        

        const PlayerMobInteractions = window.SingleplayerPlayerMobInteractions;

        function applyHitFeedback(entity, sourcePos = null, amount = 4, extraKnockback = 0) {
            PlayerMobInteractions.applyHitFeedback({ entity, sourcePos, amount, extraKnockback, yawObject, THREE });
        }

        function tickMobHitFeedback(entity, deltaMs) {
            PlayerMobInteractions.tickMobHitFeedback(entity, deltaMs);
        }

        function resolveMobEntityPushing() {
            PlayerMobInteractions.resolveMobEntityPushing({
                yawObject,
                PLAYER_RADIUS,
                pigEntities: pigMob?.getEntities?.() || [],
                wolfEntities: wolfMob?.getEntities?.() || [],
                pandaEntities: pandaMob?.getEntities?.() || [],
                zombieEntities: zombieMob?.getEntities?.() || [],
                villagerEntities: villagerMob?.getEntities?.() || [],
                gnomeEntities,
                mobCollisionRadius: MOB_COLLISION_RADIUS,
            });
        }

        // --- 3. CORE UTILITIES ---

        function isSolid(type) { return SOLID_BLOCKS.includes(type); }

        function getBlockBounds(type) {
            const bounds = blockMaterials[type]?.bounds;
            if (!bounds) return null;
            return {
                minX: Number.isFinite(bounds.minX) ? bounds.minX : 0,
                minY: Number.isFinite(bounds.minY) ? bounds.minY : 0,
                minZ: Number.isFinite(bounds.minZ) ? bounds.minZ : 0,
                maxX: Number.isFinite(bounds.maxX) ? bounds.maxX : 1,
                maxY: Number.isFinite(bounds.maxY) ? bounds.maxY : 1,
                maxZ: Number.isFinite(bounds.maxZ) ? bounds.maxZ : 1,
            };
        }

        function getBlockWorldBox(wx, wy, wz, type) {
            if (!type || !isSolid(type)) return null;
            const bounds = getBlockBounds(type) || { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 };
            return new THREE.Box3(
                new THREE.Vector3(wx + bounds.minX, wy + bounds.minY, wz + bounds.minZ),
                new THREE.Vector3(wx + bounds.maxX, wy + bounds.maxY, wz + bounds.maxZ)
            );
        }
       
        function isLiquid(type) { return LIQUID_BLOCKS.includes(type); }

        function getChunkOffsetsForRadius(radius) {
            return chunkStreamOptimizations?.getChunkOffsetsForRadius?.(radius) || [];
        }

        function getTexturePackScriptPath(packId) {
            if (!packId) return '';
            const repoPrefix = window.SingleplayerConfig?.REPO_BASE_PREFIX || '';
            return `${repoPrefix}/game/singleplayer/edit/texturepack/${packId}/main.js`;
        }

        function toPackAssetPath(packId, relativeAssetPath) {
            const repoPrefix = window.SingleplayerConfig?.REPO_BASE_PREFIX || '';
            return `${repoPrefix}/game/singleplayer/edit/texturepack/${packId}/${relativeAssetPath}`;
        }

        async function applySelectedTexturePackOverrides() {
            const selectedPackId = localStorage.getItem('singleplayer.texturePackId');
            if (!selectedPackId) return;

            const scriptPath = getTexturePackScriptPath(selectedPackId);
            if (!scriptPath) return;

            const registered = [];
            const registry = {
                register(pack) {
                    if (!pack || !pack.id) return;
                    registered.push(pack);
                }
            };
            window.SingleplayerTexturePackRegistry = registry;

            const loaded = await new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = `${scriptPath}?v=1`;
                script.async = true;
                script.onload = () => resolve(true);
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
            });

            const activePack = loaded ? registered.find((pack) => pack.id === selectedPackId) : null;
            const overrides = activePack?.assetOverrides || null;
            if (!overrides || typeof overrides !== 'object') return;

            for (const key in overrides) {
                if (!Object.prototype.hasOwnProperty.call(ASSET_FILEPATHS, key)) continue;
                const relativePath = String(overrides[key] || '').trim();
                if (!relativePath) continue;
                ASSET_FILEPATHS[key] = toPackAssetPath(selectedPackId, relativePath);
            }

            console.info('[TexturePack] applied', selectedPackId);
        }
        
        async function loadAssets() {
            const loader = new THREE.TextureLoader();
            const texturePromises = [];

            // 1. Load textures specified in ASSET_FILEPATHS using the literal relative paths
            for (const key in ASSET_FILEPATHS) {
                // Skip UI assets which are loaded via <img> tags
                if (key === 'HEART' || key === 'FOOD') continue; 

                const path = ASSET_FILEPATHS[key];
                
                const promise = new Promise((resolve) => {
                    const matId = getMaterialIdByTextureKey(key);
                    const matCfg = matId >= 0 ? blockMaterials[matId] : {};
                    const isDoubleSidedCutout = key === 'LEAVES' || matCfg.renderAs === 'cross' || matCfg.renderAs === 'plane' || matCfg.renderAs === 'plane_x';
                    loader.load(
                        path, // <-- DIRECTLY using the calculated path
                        (texture) => {
                            texture.magFilter = THREE.NearestFilter; // Sharp pixel look
                            texture.minFilter = THREE.NearestMipmapNearestFilter;
                            texture.generateMipmaps = true;
                            texture.wrapS = THREE.RepeatWrapping;
                            texture.wrapT = THREE.RepeatWrapping;
                            if (renderer && renderer.capabilities) {
                                texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
                            }
                            materials[key] = new THREE.MeshStandardMaterial({
                                map: texture,
                                side: isDoubleSidedCutout ? THREE.DoubleSide : THREE.FrontSide,
                                transparent: matCfg.transparent || false,
                                alphaTest: key === 'LEAVES' || matCfg.alphaCutout ? 0.5 : 0,
                                depthWrite: true,
                                opacity: matCfg.opacity || 1.0,
                                emissive: matCfg.emissive || 0x000000,
                                emissiveIntensity: matCfg.emissive ? 0.65 : 0,
                                vertexColors: true,
                            });
                            resolve();
                        },
                        undefined,
                        (err) => {
                            console.error(`Error loading texture from specified path: ${path}. Block will use solid color fallback.`, err);
                            materials[key] = new THREE.MeshStandardMaterial({
                                color: matCfg.color || 0xd1c17e,
                                side: isDoubleSidedCutout ? THREE.DoubleSide : THREE.FrontSide,
                                transparent: matCfg.transparent || false,
                                alphaTest: key === 'LEAVES' || matCfg.alphaCutout ? 0.5 : 0,
                                depthWrite: true,
                                opacity: matCfg.opacity || 1.0,
                                emissive: matCfg.emissive || 0x000000,
                                emissiveIntensity: matCfg.emissive ? 0.55 : 0,
                                vertexColors: true,
                            });
                            resolve(); 
                        }
                    );
                });
                texturePromises.push(promise);
            }
            
            // 2. Create fallback materials for non-textured/missing blocks (Wood, Water, and fallbacks)
            materials.WOOD = new THREE.MeshStandardMaterial({ color: blockMaterials[5].color, roughness: 0.9 });
            materials.WATER = new THREE.MeshStandardMaterial({ 
                color: blockMaterials[4].color, 
                transparent: true, 
                opacity: blockMaterials[4].opacity,
                side: THREE.DoubleSide,
                roughness: 0.1
            });
            // Fallback material for textured blocks if loading failed
            materials.DIRT_FALLBACK = new THREE.MeshStandardMaterial({ color: 0x594334, roughness: 0.9 });
            materials.STONE_FALLBACK = new THREE.MeshStandardMaterial({ color: 0x7F8C8D, roughness: 0.9 });
            materials.LEAVES_FALLBACK = new THREE.MeshStandardMaterial({ color: 0x27AE60, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
            materials.SAND_FALLBACK = new THREE.MeshStandardMaterial({ color: 0xf5deb3, roughness: 0.9 }); 
            materials.CRAFTING_TABLE_SIDE_FALLBACK = new THREE.MeshStandardMaterial({ color: 0x8D6E63, roughness: 0.9 }); // Fallback for crafting table
            
            // Material for blocks using vertex colors
            materials.COLORED_OPAQUE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });


            await Promise.all(texturePromises);
            console.log("Assets loading attempted with specified relative paths.");
        }
        
        function getMaterialIdByTextureKey(key) {
            for (const id in blockMaterials) {
                const mat = blockMaterials[id];
                if (mat.textureKey === key) return parseInt(id);
                if (mat.textureByFace) {
                    for (const faceKey in mat.textureByFace) {
                        if (mat.textureByFace[faceKey] === key) return parseInt(id);
                    }
                }
            }
            return -1;
        }

        // --- 4. INITIALIZATION ---

        function setupEatingOverlay() {
            if (eatOverlayEl && eatItemEl && document.body.contains(eatOverlayEl) && document.body.contains(eatItemEl)) return eatOverlayEl;

            eatOverlayEl = document.getElementById('eat-overlay');
            if (!eatOverlayEl) {
                eatOverlayEl = document.createElement('div');
                eatOverlayEl.id = 'eat-overlay';
                eatOverlayEl.className = 'hidden';
                document.body.appendChild(eatOverlayEl);
            }

            eatItemEl = document.getElementById('eat-item');
            if (!eatItemEl) {
                eatItemEl = document.createElement('img');
                eatItemEl.id = 'eat-item';
                eatItemEl.alt = 'Eating item';
                eatItemEl.draggable = false;
                eatOverlayEl.appendChild(eatItemEl);
            } else if (eatItemEl.parentElement !== eatOverlayEl) {
                eatOverlayEl.appendChild(eatItemEl);
            }

            playerRuntime.eatOverlayEl = eatOverlayEl;
            playerRuntime.eatItemEl = eatItemEl;
            return eatOverlayEl;
        }

        function startEatingAnimation(itemId) {
            setupEatingOverlay();
            if (!eatOverlayEl || !eatItemEl) return false;

            const mat = blockMaterials?.[itemId] || null;
            const imgPath = getMaterialIconPath(mat);
            if (imgPath) {
                eatItemEl.src = imgPath;
                eatItemEl.style.display = '';
                eatItemEl.style.backgroundColor = '';
                eatItemEl.style.border = 'none';
            } else {
                eatItemEl.removeAttribute('src');
                const colorHex = mat?.color ? mat.color.toString(16).padStart(6, '0') : '7F8C8D';
                eatItemEl.style.display = 'block';
                eatItemEl.style.backgroundColor = `#${colorHex}`;
                eatItemEl.style.border = '8px solid rgba(255, 255, 255, 0.12)';
            }
            eatItemEl.style.transform = 'translate(-50%, -50%)';
            eatOverlayEl.classList.remove('hidden');
            eatingAnimState.active = true;
            eatingAnimState.timeMs = 0;
            eatingAnimState.particleMs = 0;
            eatingAnimState.durationMs = 850;
            eatingAnimState.itemId = itemId;
            return true;
        }

        async function init() {
            
            await applySelectedTexturePackOverrides();
            await loadAssets(); // Load all textures and materials first!
            await loadIglooStructure();
            await loadVillageTemplates();
            preloadBreakingTextures();

            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x87ceeb); // FIX: Initialize background color
            // Sky/Fog color set by updateSkyAndSun()
            scene.fog = new THREE.Fog(0x87ceeb, 20, 120); 

            if (typeof PerlinNoise !== 'undefined') {
                worldSeed = resolveWorldSeed();
                perlin = new PerlinNoise(worldSeed);
                // Intentionally avoid worldgen/* runtime and use terrain/* + noise/* flow.
                worldGenerator = null;
                const spawnBiomePool = ['Snowy Plains', 'Plains', 'Forest', 'Desert'];
                const spawnPick = Math.floor(Math.random() * spawnBiomePool.length);
                spawnBiomeName = spawnBiomePool[Math.max(0, Math.min(spawnBiomePool.length - 1, spawnPick))] || 'Plains';
                console.info('[World seed]', worldSeed, '[Preferred spawn biome]', spawnBiomeName);
                lightingSystem = SpawnLighting.create ? SpawnLighting.create({ getBlockType, isLiquid, CHUNK_HEIGHT, getSkyLightCap: getCurrentSkyLightCap }) : null;
            } else {
                console.error("PerlinNoise library failed to load.");
                return;
            }
            
            raycaster = new THREE.Raycaster();
            raycaster.far = currentInteractionReach;
            camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
            
            yawObject = new THREE.Object3D();
            pitchObject = new THREE.Object3D();
            syncPlayerHeightVisuals();
            
            pitchObject.add(camera);
            yawObject.add(pitchObject);
            scene.add(yawObject);

            await ensureSteveSkinTextureLoaded();
            const playerAvatar = createPlayerAvatar();
            playerAvatar.visible = false;
            yawObject.add(playerAvatar);
            applyCameraMode();

            // Lighting (premium-feel sky rig + sun/moon + emissive local lights)
            ambientLight = new THREE.AmbientLight(0x606060, 0.65);
            hemiLight = new THREE.HemisphereLight(0x9ad8ff, 0x1f1a16, 0.52);
            moonLight = new THREE.DirectionalLight(0x6f82ff, 0.12);
            moonLight.position.set(-40, 80, -25);
            scene.add(ambientLight);
            scene.add(hemiLight);
            scene.add(moonLight);
            dirLight = new THREE.DirectionalLight(0xffffff, 1.5); 
            dirLight.position.set(50, 100, 50);
            scene.add(dirLight);
            scene.add(worldGroup);

    
            await pigMob?.loadTexture?.();
            await pandaMob?.loadTexture?.();
            await zombieMob?.loadTexture?.();
            generateWorld();
            pigMob?.spawnInitial?.();
            wolfMob?.spawnInitial?.();
            pandaMob?.spawnInitial?.();
            setupPointerLockControls();
            setupKeyboardControls();
            setupBlockInteraction();
            setupInputModeChooser();
            initChatSystem();
            setInitialPlayerPosition();
            
          
            renderHearts();
            renderAirBubbles(false);
            updateHotbarUI();
            waypointsMod?.initUi?.();
            waypointsMod?.setInventoryOpen?.(false);
            const closeBtn = document.getElementById('inventory-close-btn');
            const closeIcon = document.getElementById('inventory-close-icon');
            const furnaceCloseBtn = document.getElementById('furnace-close-btn');
            const furnaceCloseIcon = document.getElementById('furnace-close-icon');
            const chestCloseBtn = document.getElementById('chest-close-btn');
            const chestCloseIcon = document.getElementById('chest-close-icon');
            const assetBasePath = `${window.SingleplayerConfig?.REPO_BASE_PREFIX || ''}/game/singleplayer/assets`;
            const closeIconPath = `${assetBasePath}/mobile/cdb_clear.png`;
            if (closeIcon) closeIcon.src = closeIconPath;
            if (furnaceCloseIcon) furnaceCloseIcon.src = closeIconPath;
            if (chestCloseIcon) chestCloseIcon.src = closeIconPath;
            defaultPlayerSkin?.initSkinUi?.();
            const creativeCloseIcon = document.getElementById('creative-close-icon');
            const creativeInventoryIcon = document.getElementById('creative-inventory-icon');
            if (creativeCloseIcon) creativeCloseIcon.src = closeIconPath;
            if (creativeInventoryIcon) creativeInventoryIcon.src = ASSET_FILEPATHS.CHEST_NORMAL || `${assetBasePath}/textures/chest/normal.png`;
            const creativeCloseBtn = document.getElementById('creative-close-btn');
            const creativeInventoryBtn = document.getElementById('creative-inventory-btn');
            if (creativeCloseBtn) creativeCloseBtn.addEventListener('click', () => {
                if (isCreativeMenuOpen) closeCreativeMenu();
            });
            if (creativeInventoryBtn) creativeInventoryBtn.addEventListener('click', () => {
                if (!isCreativeMenuOpen) return;
                closeCreativeMenu();
                toggleInventory();
            });
            if (closeBtn) closeBtn.addEventListener('click', () => {
                if (isInventoryOpen) toggleInventory();
            });
            if (furnaceCloseBtn) furnaceCloseBtn.addEventListener('click', () => {
                if (isInventoryOpen) toggleInventory();
            });
            if (chestCloseBtn) chestCloseBtn.addEventListener('click', () => {
                if (isInventoryOpen) toggleInventory();
            });
            if (window.HungerSystem) {
                window.HungerSystem.init({
                    messageCallback: showGameMessage,
                    onRegenerateHealth: (halfHeart) => {
                        if (player.health < player.maxHealth) {
                            player.health = Math.min(player.maxHealth, player.health + (halfHeart || 1));
                            renderHearts();
                        }
                    },
                    onStarveDamageTick: (amount) => {
                        if (player.health > 1) takeDamage(amount || 1);
                    }
                });
            }
            
           // Renderer setup
            renderer = new THREE.WebGLRenderer({ antialias: !isLowEndDevice });
            renderer.setSize(window.innerWidth, window.innerHeight);
            targetRenderPixelRatio = computeRenderPixelRatio();
            renderer.setPixelRatio(targetRenderPixelRatio);
            document.body.appendChild(renderer.domElement);
            setupEatingOverlay();
            
            window.addEventListener('resize', onWindowResize);
            document.addEventListener('contextmenu', e => e.preventDefault()); 
            
           
            document.addEventListener('wheel', (e) => {
                if(isInventoryOpen) return;
                if (e.deltaY > 0) {
                    selectedHotbarIndex = (selectedHotbarIndex + 1) % HOTBAR_SLOTS;
                } else {
                    selectedHotbarIndex = (selectedHotbarIndex - 1 + HOTBAR_SLOTS) % HOTBAR_SLOTS;
                }
                updateHotbarUI();
            });

            document.addEventListener('mousemove', (e) => {
                const heldDiv = document.getElementById('held-item-cursor');
                if (isInventoryOpen && heldDiv) {
                    heldDiv.style.left = `${e.clientX + 10}px`;
                    heldDiv.style.top = `${e.clientY + 10}px`;
                    updateSkinPreviewLook(e.clientX, e.clientY);
                }
            });
            
            // Set initial sky state
            updateSkyAndSun(); 
            
            animate(0);
        }
        
        // --- Day/Night Cycle Logic ---
        function getTimePhaseInfo() {
            return dayNightCycle?.getTimePhaseInfo?.() || { phase: 'Day', localT: 1 };
        }

        function getSunFactor() {
            return dayNightCycle?.getSunFactor?.() ?? 1;
        }

        function getCurrentSkyLightCap() {
            return dayNightCycle?.getCurrentSkyLightCap?.() ?? 15;
        }

        function setTimeByClock(hours, minutes) {
            return dayNightCycle?.setTimeByClock?.(hours, minutes) || false;
        }

        function updateSkyAndSun() {
            dayNightCycle?.updateSkyAndSun?.();
        }

        function setRenderDistance(amount) {
            const parsed = Number.parseInt(amount, 10);
            if (!Number.isFinite(parsed)) return false;
            const normalized = Math.max(1, parsed);
            if (normalized === currentChunkLoadRadius) return true;
            currentChunkLoadRadius = normalized;
            effectiveChunkLoadRadius = currentChunkLoadRadius;
            updateSkyAndSun();
            ensureChunksAroundPlayer(true);
            return true;
        }

        function setCameraFov(amount) {
            const parsed = Number.parseFloat(amount);
            if (!Number.isFinite(parsed)) return false;
            const normalized = Math.max(1, parsed);
            camera.fov = normalized;
            camera.updateProjectionMatrix();
            return true;
        }

        function getCameraFov() {
            return Number(camera?.fov || 90);
        }

        function getMaxStackSize(itemId) {
            const itemDef = blockMaterials[itemId];
            return itemDef?.toolType || itemDef?.nonStackable ? 1 : 64;
        }

        function shouldShowItemCount(item) {
            return !!item && getMaxStackSize(item.id) > 1 && item.count > 1;
        }

        function addToInventory(blockId, amount = 1) {
            const maxStack = getMaxStackSize(blockId);
         
            for (let i = 0; i < TOTAL_INV_SIZE; i++) {
                if (inventory[i] && inventory[i].id === blockId && inventory[i].count < maxStack) {
                    const capacity = maxStack - inventory[i].count;
                    const transfer = Math.min(amount, capacity);
                    inventory[i].count += transfer;
                    amount -= transfer;
                    if (amount === 0) {
                        updateHotbarUI();
                        if(isInventoryOpen) renderInventoryScreen();
                        showGameMessage(`+${transfer} ${blockMaterials[blockId].name}`);
                        return true;
                    }
                }
            }
          
            for (let i = 0; i < TOTAL_INV_SIZE; i++) {
                if (inventory[i] === null) {
                    const transfer = Math.min(amount, maxStack);
                    inventory[i] = { id: blockId, count: transfer };
                    amount -= transfer;
                    updateHotbarUI();
                    if(isInventoryOpen) renderInventoryScreen();
                    showGameMessage(`+${transfer} ${blockMaterials[blockId].name}`);
                    if (amount <= 0) return true;
                }
            }
            showGameMessage("Inventory Full!");
            return false;
        }

        function consumeSelectedItem() {
            const item = inventory[selectedHotbarIndex];
            if (item) {
                item.count--;
                if (item.count <= 0) {
                    inventory[selectedHotbarIndex] = null;
                }
                updateHotbarUI();
                if(isInventoryOpen) renderInventoryScreen();
                return true;
            }
            return false;
        }

        function getSelectedItemId() {
            const held = inventory[selectedHotbarIndex];
            return held ? held.id : null;
        }

        function setSelectedHotbarItem(itemId, count = 1) {
            if (!Number.isFinite(itemId) || itemId <= 0 || count <= 0) {
                inventory[selectedHotbarIndex] = null;
            } else {
                inventory[selectedHotbarIndex] = { id: itemId, count: count };
            }
            updateHotbarUI();
            if (isInventoryOpen) renderInventoryScreen();
            return true;
        }

        function setItemKnockbackEnchant(itemId, amount) {
            if (!Number.isFinite(itemId) || itemId <= 0) return false;
            const level = Math.max(1, Math.min(400, Number(amount) || 1));
            knockbackEnchantByItemId.set(itemId, level);
            return true;
        }

        function getHeldKnockbackEnchantLevel() {
            const held = inventory[selectedHotbarIndex];
            if (!held) return 0;
            return Number(knockbackEnchantByItemId.get(held.id) || 0);
        }

        function getHeldMeleeProfile() {
            const held = inventory[selectedHotbarIndex];
            const heldDef = held ? blockMaterials[held.id] : null;
            if (heldDef?.toolType === 'dagger') {
                return {
                    damage: Number(heldDef.meleeDamage) || 3,
                    range: Math.max(0, Number(heldDef.attackRange) || 1.5),
                    toolType: 'dagger',
                };
            }
            return { damage: 4, range: Infinity, toolType: heldDef?.toolType || null };
        }

        function isTargetWithinMeleeRange(target, maxRange) {
            if (!target?.root || !Number.isFinite(maxRange)) return true;
            return target.root.position.distanceTo(yawObject.position) <= maxRange;
        }

        function showGameMessage(msg) {
            const el = document.getElementById('game-message');
            el.textContent = msg;
            el.style.opacity = 1;
            setTimeout(() => { el.style.opacity = 0; }, 2000);
        }

        async function loadIglooStructure() {
            const path = './structures/villages/snowy_plains/igloo.json';
            try {
                const res = await fetch(path, { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                iglooStructureDef = await res.json();
            } catch (err) {
                console.warn('[Igloo] Failed to load structure json, using fallback.', err);
                iglooStructureDef = {
                    radius: 4,
                    wallBlockId: 15,
                    floorBlockId: 59,
                    windowBlockId: 80,
                    doorHeight: 2,
                    interiorHeadroom: 3,
                    maxSurfaceSlope: 2,
                    gnomeSpawnOffsetY: 1
                };
            }
        }


        function normalizeVillageBiomeKey(rawBiome) {
            return resolveBiomeProfile(rawBiome)?.villageKey || '';
        }

        function getVillageTemplateForBiome(rawBiome) {
            const biomeKey = normalizeVillageBiomeKey(rawBiome);
            if (!biomeKey) return null;
            return villageTemplatesByBiomeKey.get(biomeKey) || null;
        }

        function getPathBlockIdFromTemplate(template, fallbackId = 17) {
            const name = String(template?.pathBlock || '').toLowerCase().trim();
            const byName = {
                cobblestone: 17,
                gravel: 28,
                bridge_planks: 8,
                oak_planks: 8,
                sandstone: 13,
                packed_ice: 81,
                snow_block: 15
            };
            return byName[name] || fallbackId;
        }

        function getDefaultVillageLayout() {
            return {
                wellConnectors: [
                    { id: 'well-n', x: 0, z: -4, dir: 'N' },
                    { id: 'well-e', x: 4, z: 0, dir: 'E' },
                    { id: 'well-s', x: 0, z: 4, dir: 'S' },
                    { id: 'well-w', x: -4, z: 0, dir: 'W' }
                ],
                buildings: [
                    { id: 'house-a', offsetX: 12, offsetZ: 9, size: 5, doorDirs: ['W'] },
                    { id: 'house-b', offsetX: -12, offsetZ: 9, size: 5, doorDirs: ['E'] },
                    { id: 'house-c', offsetX: 12, offsetZ: -9, size: 5, doorDirs: ['W', 'N'] },
                    { id: 'house-d', offsetX: -12, offsetZ: -9, size: 5, doorDirs: ['E'] },
                    { id: 'house-e', offsetX: 0, offsetZ: 15, size: 5, doorDirs: ['N', 'S'] },
                    { id: 'house-f', offsetX: 0, offsetZ: -15, size: 5, doorDirs: ['S'] }
                ],
                road: {
                    maxDoorLinkDistance: 22,
                    wellConnectorExtension: 8,
                    doorExtension: 4,
                    mainRoadLength: 18,
                    width: 1
                },
                maxBranchDepth: 1,
                maxFoundationSlope: 3
            };
        }

        async function loadVillageTemplates() {
            const biomeKeys = VILLAGE_BIOME_KEYS.slice();
            const fallbackLayout = getDefaultVillageLayout();
            await Promise.all(biomeKeys.map(async (biomeKey) => {
                const path = `./structures/villages/${biomeKey}/village.json`;
                try {
                    const res = await fetch(path, { cache: 'no-store' });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const parsed = await res.json();
                    const layout = parsed?.layout && typeof parsed.layout === 'object' ? parsed.layout : fallbackLayout;
                    const pieceDesigns = await loadVillagePieceDesigns(biomeKey, parsed?.pieces);
                    const pieceDefinitions = await loadVillagePieceDefinitions(biomeKey, parsed?.pieces);
                    villageTemplatesByBiomeKey.set(biomeKey, { ...parsed, layout, pieceDesigns, pieceDefinitions });
                } catch (err) {
                    console.warn(`[Village] Failed to load ${path}, using defaults.`, err);
                    villageTemplatesByBiomeKey.set(biomeKey, {
                        id: 'village_template',
                        biome: biomeKey,
                        pathBlock: 'cobblestone',
                        layout: fallbackLayout,
                        pieceDesigns: {},
                        pieceDefinitions: {}
                    });
                }
            }));
        }

        function createNameTagSprite(label) {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 8, 256, 48);
            ctx.font = 'bold 30px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#8ad8ff';
            ctx.fillText(label, 128, 34);

            const tex = new THREE.CanvasTexture(canvas);
            tex.minFilter = THREE.LinearFilter;
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(1.35, 0.34, 1);
            return sprite;
        }


        function getVillagePaletteForBiome(rawBiome, template) {
            const biome = normalizeBiomeCommandName(rawBiome) || getBiome(Math.floor(yawObject?.position?.x || 0), Math.floor(yawObject?.position?.z || 0));
            const layout = template?.layout || {};
            const isDesert = biome === 'Desert';
            return {
                wall: Number(layout.defaultHouseWallBlockId) || (isDesert ? 13 : 8),
                roof: Number(layout.defaultHouseRoofBlockId) || 17,
                path: Number(layout.pathBlockId) || getPathBlockIdFromTemplate(template, 17),
                water: Number(layout.wellWaterBlockId) || 4,
            };
        }

        function getVillagePieceDesignFromTemplate(template, biomeKey, pieceId) {
            const normalizedPieceId = normalizeVillagePieceId(pieceId);
            if (!normalizedPieceId) return null;
            return template?.pieceDesigns?.[normalizedPieceId] || getVillagePieceDesign(biomeKey, normalizedPieceId) || null;
        }

        function normalizeVillagePieceCategory(category, pieceId = '') {
            const normalizedCategory = String(category || '').trim().toLowerCase();
            if (normalizedCategory === 'tree') return 'platform';
            if (!normalizedCategory && String(pieceId || '').toLowerCase().includes('platform')) return 'platform';
            return normalizedCategory;
        }

        function getVillagePieceDefinitionFromTemplate(template, biomeKey, pieceId) {
            const normalizedPieceId = normalizeVillagePieceId(pieceId);
            if (!normalizedPieceId) return null;
            const definition = template?.pieceDefinitions?.[normalizedPieceId] || null;
            const design = getVillagePieceDesignFromTemplate(template, biomeKey, normalizedPieceId);
            return {
                ...(definition || {}),
                id: normalizedPieceId,
                biome: definition?.biome || biomeKey,
                category: normalizeVillagePieceCategory(definition?.category || design?.category, normalizedPieceId),
                footprint: definition?.footprint || design?.footprint || null,
                size: Number(definition?.size || design?.size) || undefined,
                weight: Math.max(1, Number(definition?.weight || design?.weight) || 1),
                doorDirs: Array.isArray(definition?.doorDirs) && definition.doorDirs.length
                    ? definition.doorDirs
                    : (Array.isArray(design?.doorDirs) ? design.doorDirs : []),
                design,
            };
        }

        function getVillageFootprintFromDesign(design, fallbackSize = 5) {
            const width = Math.max(3, Number(design?.footprint?.width || design?.size || fallbackSize) || fallbackSize);
            const depth = Math.max(3, Number(design?.footprint?.depth || design?.size || fallbackSize) || fallbackSize);
            return {
                width: width % 2 === 0 ? width + 1 : width,
                depth: depth % 2 === 0 ? depth + 1 : depth,
            };
        }

        function resolveVillageDesignBlockId(blockRef, context) {
            if (blockRef === null || blockRef === undefined || blockRef === '' || blockRef === 'skip') return null;
            if (typeof blockRef === 'number' && Number.isFinite(blockRef)) return blockRef;
            const normalized = String(blockRef).toLowerCase().trim();
            const named = {
                air: 0,
                wall: context.wallId,
                roof: context.roofId,
                beam: context.beamId,
                floor: context.floorId,
                window: context.windowId,
                foundation: context.foundationId,
                support: context.foundationId,
                chest: 82,
                water: context.waterId,
                path: context.pathId,
                dirt: 2,
            };
            if (Object.prototype.hasOwnProperty.call(named, normalized)) return named[normalized];
            const parsed = Number(blockRef);
            return Number.isFinite(parsed) ? parsed : null;
        }

        function placeVillageLinearFeature(centerX, centerZ, blockId, design = null) {
            const pathBlockId = Number(design?.blockId) || blockId;
            const footprint = getVillageFootprintFromDesign(design, 7);
            const axis = String(design?.axis || 'z').toLowerCase() === 'x' ? 'x' : 'z';
            const halfWidth = Math.floor(footprint.width / 2);
            const halfDepth = Math.floor(footprint.depth / 2);
            const minX = centerX - (axis === 'x' ? halfDepth : halfWidth);
            const maxX = centerX + (axis === 'x' ? halfDepth : halfWidth);
            const minZ = centerZ - (axis === 'z' ? halfDepth : halfWidth);
            const maxZ = centerZ + (axis === 'z' ? halfDepth : halfWidth);
            let placedAny = false;
            for (let x = minX; x <= maxX; x++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const floorY = getSurfaceYForEntity(x, z);
                    if (!Number.isFinite(floorY) || floorY < 2 || floorY >= CHUNK_HEIGHT - 4) continue;
                    setBlockTypeRaw(x, floorY, z, pathBlockId, true);
                    if (design?.supportBlockId) {
                        for (let y = floorY - 1; y >= Math.max(1, floorY - (Number(design.supportDepth) || 4)); y--) {
                            setBlockTypeRaw(x, y, z, Number(design.supportBlockId), true);
                        }
                    }
                    placedAny = true;
                }
            }
            if (!placedAny) return { ok: false, message: 'Could not place linear structure on current terrain.' };
            ensureChunksAroundPlayer(true);
            return { ok: true, x: centerX, y: getSurfaceYForEntity(centerX, centerZ), z: centerZ };
        }

        function placeVillagePlatform(centerX, centerZ, baseBlockId, design = null) {
            const deckBlockId = Number(design?.deckBlockId) || baseBlockId;
            const footprint = getVillageFootprintFromDesign(design, 7);
            const halfW = Math.floor(footprint.width / 2);
            const halfD = Math.floor(footprint.depth / 2);
            const floorY = getSurfaceYForEntity(centerX, centerZ);
            if (!Number.isFinite(floorY) || floorY < 2 || floorY >= CHUNK_HEIGHT - 6) return { ok: false, message: 'Could not place platform on current terrain.' };
            const deckY = floorY + Math.max(1, Number(design?.deckHeight) || 3);
            const supportId = Number(design?.supportBlockId) || deckBlockId;
            for (let x = centerX - halfW; x <= centerX + halfW; x++) {
                for (let z = centerZ - halfD; z <= centerZ + halfD; z++) {
                    setBlockTypeRaw(x, deckY, z, deckBlockId, true);
                }
            }
            const supportOffsets = design?.supportOffsets || [
                { x: -halfW, z: -halfD },
                { x: halfW, z: -halfD },
                { x: -halfW, z: halfD },
                { x: halfW, z: halfD },
            ];
            for (const offset of supportOffsets) {
                const sx = centerX + Number(offset.x || 0);
                const sz = centerZ + Number(offset.z || 0);
                const groundY = getSurfaceYForEntity(sx, sz);
                for (let y = (Number.isFinite(groundY) ? groundY + 1 : floorY + 1); y < deckY; y++) {
                    setBlockTypeRaw(sx, y, sz, supportId, true);
                }
            }
            ensureChunksAroundPlayer(true);
            return { ok: true, x: centerX, y: deckY, z: centerZ };
        }

        function placeVillageFarm(centerX, centerZ, palette, design = null) {
            const borderBlockId = Number(design?.borderBlockId) || palette.path;
            const cropBlockId = Number(design?.cropBlockId) || 2;
            const waterBlockId = Number(design?.waterBlockId) || palette.water;
            const footprint = getVillageFootprintFromDesign(design, 9);
            const halfW = Math.floor(footprint.width / 2);
            const halfD = Math.floor(footprint.depth / 2);
            const floorY = getSurfaceYForEntity(centerX, centerZ);
            if (!Number.isFinite(floorY) || floorY < 2 || floorY >= CHUNK_HEIGHT - 5) return { ok: false, message: 'Could not place farm on current terrain.' };
            for (let x = centerX - halfW; x <= centerX + halfW; x++) {
                for (let z = centerZ - halfD; z <= centerZ + halfD; z++) {
                    const edge = x === centerX - halfW || x === centerX + halfW || z === centerZ - halfD || z === centerZ + halfD;
                    setBlockTypeRaw(x, floorY, z, edge ? borderBlockId : cropBlockId, true);
                    if (!edge && x === centerX) {
                        setBlockTypeRaw(x, floorY + 1, z, waterBlockId, true);
                    }
                }
            }
            ensureChunksAroundPlayer(true);
            return { ok: true, x: centerX, y: floorY + 1, z: centerZ };
        }

        function placeSimpleVillageHouse(centerX, centerZ, size, wallId, roofId) {
            const half = Math.max(2, Math.floor(size / 2));
            const minX = centerX - half;
            const maxX = centerX + half;
            const minZ = centerZ - half;
            const maxZ = centerZ + half;

            const floorY = getSurfaceYForEntity(centerX, centerZ);
            if (!Number.isFinite(floorY) || floorY < 2 || floorY >= CHUNK_HEIGHT - 5) return { ok: false, message: 'Could not place building on current terrain.' };

            for (let x = minX; x <= maxX; x++) {
                for (let z = minZ; z <= maxZ; z++) {
                    setBlockTypeRaw(x, floorY, z, wallId, true);
                }
            }

            for (let y = floorY + 1; y <= floorY + 3; y++) {
                for (let x = minX; x <= maxX; x++) {
                    for (let z = minZ; z <= maxZ; z++) {
                        const isWall = x === minX || x === maxX || z === minZ || z === maxZ;
                        setBlockTypeRaw(x, y, z, isWall ? wallId : 0, true);
                    }
                }
            }

            for (let x = minX - 1; x <= maxX + 1; x++) {
                for (let z = minZ - 1; z <= maxZ + 1; z++) {
                    setBlockTypeRaw(x, floorY + 4, z, roofId, true);
                }
            }

            const doorX = centerX;
            const doorZ = minZ;
            setBlockTypeRaw(doorX, floorY + 1, doorZ, 0, true);
            setBlockTypeRaw(doorX, floorY + 2, doorZ, 0, true);

            ensureChunksAroundPlayer(true);
            return { ok: true, x: centerX, y: floorY + 1, z: centerZ };
        }

        function placeSimpleVillageWell(centerX, centerZ, baseBlockId, waterBlockId, design = null) {
            baseBlockId = Number(design?.baseBlockId) || baseBlockId;
            waterBlockId = Number(design?.waterBlockId) || waterBlockId;
            const floorY = getSurfaceYForEntity(centerX, centerZ);
            if (!Number.isFinite(floorY) || floorY < 2 || floorY >= CHUNK_HEIGHT - 5) return { ok: false, message: 'Could not place well on current terrain.' };

            const radius = Math.max(1, Number(design?.radius) || 2);
            const waterRadius = Math.max(0, Number(design?.waterRadius) || 0);
            const pillarHeight = Math.max(2, Number(design?.pillarHeight) || 3);
            const roofHeight = Math.max(1, Number(design?.roofHeight) || 1);
            const pillarOffset = Math.max(1, Number(design?.pillarOffset) || 1);
            for (let x = centerX - radius; x <= centerX + radius; x++) {
                for (let z = centerZ - radius; z <= centerZ + radius; z++) {
                    setBlockTypeRaw(x, floorY, z, baseBlockId, true);
                    if (Math.abs(x - centerX) <= waterRadius && Math.abs(z - centerZ) <= waterRadius) {
                        setBlockTypeRaw(x, floorY + 1, z, waterBlockId, true);
                    }
                }
            }

            if (waterRadius === 0) {
                setBlockTypeRaw(centerX, floorY + 1, centerZ, waterBlockId, true);
            }

            const pillars = design?.pillarOffsets || [[-pillarOffset, -pillarOffset], [-pillarOffset, pillarOffset], [pillarOffset, -pillarOffset], [pillarOffset, pillarOffset]];
            for (const [ox, oz] of pillars) {
                for (let y = floorY + 1; y <= floorY + pillarHeight; y++) {
                    setBlockTypeRaw(centerX + ox, y, centerZ + oz, baseBlockId, true);
                }
            }
            const roofRadius = Math.max(1, Number(design?.roofRadius) || pillarOffset);
            for (let y = floorY + pillarHeight + 1; y <= floorY + pillarHeight + roofHeight; y++) {
                for (let x = centerX - roofRadius; x <= centerX + roofRadius; x++) {
                    for (let z = centerZ - roofRadius; z <= centerZ + roofRadius; z++) {
                        setBlockTypeRaw(x, y, z, baseBlockId, true);
                    }
                }
            }

            ensureChunksAroundPlayer(true);
            return { ok: true, x: centerX, y: floorY + 1, z: centerZ };
        }

        function spawnVillageStructure(rawBiomeName, rawBuildingName) {
            if (!yawObject) return { ok: false, message: 'Player not ready.' };
            const biomeKey = normalizeVillageBiomeKey(rawBiomeName);
            if (!biomeKey) return { ok: false, message: `Unknown village biome. Try ${formatVillageBiomeKeyList()}.` };

            const template = villageTemplatesByBiomeKey.get(biomeKey) || getVillageTemplateForBiome(rawBiomeName);
            if (!template) return { ok: false, message: `Village template for biome ${biomeKey} is not loaded.` };

            const requested = String(rawBuildingName || '').toLowerCase().trim().replace(/\.json$/i, '');
            if (!requested) return { ok: false, message: 'Please provide building:<json_name>.' };

            const pieces = Array.isArray(template.pieces) ? template.pieces.map((p) => String(p || '').toLowerCase()) : [];
            if (pieces.length && !pieces.includes(requested)) {
                return { ok: false, message: `Building ${requested} not found in ${biomeKey} village pieces: ${pieces.join(', ')}.` };
            }

            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawObject.quaternion);
            const centerX = Math.floor(yawObject.position.x + forward.x * 12);
            const centerZ = Math.floor(yawObject.position.z + forward.z * 12);
            const palette = getVillagePaletteForBiome(rawBiomeName, template);

            if (requested === 'well') {
                const pieceDesign = getVillagePieceDesignFromTemplate(template, biomeKey, requested);
                const placed = placeSimpleVillageWell(centerX, centerZ, palette.path, palette.water, pieceDesign);
                if (!placed.ok) return placed;
                return { ok: true, message: `Spawned village/${requested}.json in ${biomeKey} at ${placed.x}, ${placed.y}, ${placed.z}.` };
            }

            const layout = template.layout || getDefaultVillageLayout();
            const layoutEntry = Array.isArray(layout.buildings)
                ? layout.buildings.find((b) => String(b?.piece || b?.id || '').toLowerCase().includes(requested) || requested.includes('house'))
                : null;
            const pieceDefinition = getVillagePieceDefinitionFromTemplate(template, biomeKey, requested);
            const pieceDesign = pieceDefinition?.design || getVillagePieceDesignFromTemplate(template, biomeKey, requested);
            const footprint = getVillageFootprintFromDesign(pieceDefinition?.footprint ? { footprint: pieceDefinition.footprint, size: pieceDefinition?.size } : pieceDesign, Number(layoutEntry?.size) || 5);
            const size = Math.max(footprint.width, footprint.depth, requested.includes('church') ? 7 : 0, requested.includes('igloo') ? (Number(iglooStructureDef?.radius) ? Number(iglooStructureDef.radius) * 2 + 1 : 7) : 0);
            const category = normalizeVillagePieceCategory(pieceDefinition?.category || pieceDesign?.category || requested, requested);
            let placed = null;
            if (category.includes('street') || category.includes('bridge')) {
                placed = placeVillageLinearFeature(centerX, centerZ, palette.path, pieceDesign);
            } else if (category.includes('platform')) {
                placed = placeVillagePlatform(centerX, centerZ, palette.wall, pieceDesign);
            } else if (category.includes('farm')) {
                placed = placeVillageFarm(centerX, centerZ, palette, pieceDesign);
            } else {
                placed = placeGroundedHouse(centerX, centerZ, size, palette.wall, palette.roof, pieceDesign?.doorDirs || layoutEntry?.doorDirs, biomeKey, pieceDesign);
            }
            if (!placed?.ok) return placed || { ok: false, message: 'Could not place structure.' };
            return { ok: true, message: `Spawned village/${requested}.json in ${biomeKey} at ${placed.x}, ${placed.y}, ${placed.z}.` };
        }

        function spawnGnomeAt(wx, wy, wz) {
            const gnome = new THREE.Group();
            gnome.position.set(wx + 0.5, wy, wz + 0.5);

            const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshStandardMaterial({ color: 0x3d70ff, roughness: 0.7 }));
            body.position.y = 0.95;
            gnome.add(body);

            const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), new THREE.MeshStandardMaterial({ color: 0x7ea2ff, roughness: 0.65 }));
            head.position.y = 1.55;
            gnome.add(head);

            const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.2), new THREE.MeshStandardMaterial({ color: 0x2a4bc0, roughness: 0.8 }));
            leftLeg.position.set(-0.18, 0.28, 0);
            gnome.add(leftLeg);

            const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.2), new THREE.MeshStandardMaterial({ color: 0x2a4bc0, roughness: 0.8 }));
            rightLeg.position.set(0.18, 0.28, 0);
            gnome.add(rightLeg);

            const tag = createNameTagSprite('gnomes');
            tag.position.y = 2.15;
            gnome.add(tag);

            gnomeEntities.push({ root: gnome, head, leftLeg, rightLeg, phase: Math.random() * Math.PI * 2 });
            scene.add(gnome);
        }

        function isEntityActiveAt(position, rangeSq = ENTITY_ACTIVATION_RANGE_SQ) {
            if (!yawObject || !position) return true;
            const dx = position.x - yawObject.position.x;
            const dz = position.z - yawObject.position.z;
            return (dx * dx + dz * dz) <= rangeSq;
        }

        function updateGnomes(time) {
            if (!gnomeEntities.length) return;
            const lookTarget = new THREE.Vector3(yawObject.position.x, 0, yawObject.position.z);
            for (const g of gnomeEntities) {
                if (!isEntityActiveAt(g.root.position)) continue;
                const swing = Math.sin(time * 0.007 + g.phase) * 0.16;
                g.leftLeg.position.z = swing;
                g.rightLeg.position.z = -swing;
                lookTarget.y = g.root.position.y + 1.55;
                g.head.lookAt(lookTarget);
            }
        }


        function getColumnTopFromData(data, lx, lz) {
            for (let y = CHUNK_HEIGHT - 2; y >= 1; y--) {
                const idx = lx + y * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT;
                const block = data[idx];
                if (block === 0 || block === 6) continue;
                if (blockMaterials[block]?.renderAs) continue;
                return y;
            }
            return -1;
        }

        function buildChunkHeightmap(data) {
            const heightmap = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
            for (let x = 0; x < CHUNK_SIZE; x++) {
                for (let z = 0; z < CHUNK_SIZE; z++) {
                    heightmap[x + z * CHUNK_SIZE] = getColumnTopFromData(data, x, z);
                }
            }
            return heightmap;
        }

        function updateChunkHeightmapColumn(group, lx, lz) {
            if (!group?.userData?.heightmap || !group?.userData?.chunkData) return;
            if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
            const hm = group.userData.heightmap;
            hm[lx + lz * CHUNK_SIZE] = getColumnTopFromData(group.userData.chunkData, lx, lz);
        }

        function getSurfaceYForEntity(wx, wz, startY = null) {
            const x = Math.floor(wx);
            const z = Math.floor(wz);

            const cx = Math.floor(x / CHUNK_SIZE);
            const cz = Math.floor(z / CHUNK_SIZE);
            const key = `${cx},${cz}`;
            const loaded = chunks.get(key);
            if (loaded?.userData?.heightmap) {
                const lx = x - cx * CHUNK_SIZE;
                const lz = z - cz * CHUNK_SIZE;
                const top = loaded.userData.heightmap[lx + lz * CHUNK_SIZE];
                if (top >= 1) {
                    const candidate = top + 1;
                    const under = getBlockType(x, candidate - 1, z);
                    const feet = getBlockType(x, candidate, z);
                    if (isSolid(under) && !isLiquid(under) && feet === 0) return candidate;
                }
            }

            if (Number.isFinite(startY)) {
                const from = Math.min(CHUNK_HEIGHT - 2, Math.floor(startY) + 3);
                const to = Math.max(2, Math.floor(startY) - 6);
                for (let y = from; y >= to; y--) {
                    const under = getBlockType(x, y - 1, z);
                    const feet = getBlockType(x, y, z);
                    if (isSolid(under) && !isLiquid(under) && feet === 0) return y;
                }
            }

            for (let y = CHUNK_HEIGHT - 2; y >= 2; y--) {
                const under = getBlockType(x, y - 1, z);
                const feet = getBlockType(x, y, z);
                if (isSolid(under) && !isLiquid(under) && feet === 0) return y;
            }
            return -1;
        }

        function applyMobCommandHeight(root, heightBlocks, defaultHeight) {
            const parsed = Number(heightBlocks);
            if (!Number.isFinite(parsed) || parsed <= 0) return;
            const scale = parsed / (defaultHeight || parsed);
            root.scale.setScalar(scale);
        }

        function spawnMobById(mobId, amount = 1, heightBlocks = null) {
            const id = Number.parseInt(mobId, 10);
            const count = Math.max(1, Math.min(64, Number.parseInt(amount, 10) || 1));
            if (!Number.isFinite(id)) return 0;
            if (!yawObject) return 0;
            let spawned = 0;
            for (let i = 0; i < count; i++) {
                const wx = yawObject.position.x + (Math.random() - 0.5) * 4;
                const wz = yawObject.position.z + (Math.random() - 0.5) * 4;
                const ok = id === 1
                    ? pigMob?.spawnAt?.(wx, wz, heightBlocks)
                    : (id === 2
                        ? zombieMob?.spawnAt?.(wx, wz, heightBlocks)
                        : (id === 3
                            ? wolfMob?.spawnForCommand?.(wx, wz, heightBlocks)
                            : (id === 4
                                ? pandaMob?.spawnForCommand?.(wx, wz, heightBlocks)
                                : (id === 5
                                    ? villagerMob?.spawnForCommand?.(wx, wz, heightBlocks)
                                    : false))));
                if (ok) spawned++;
            }
            return spawned;
        }

        function spawnEatingParticle() {

            if (!eatOverlayEl) return;
            const p = document.createElement('div');
            p.className = 'eat-particle';
            p.style.left = `${44 + Math.random() * 28}%`;
            p.style.top = `${48 + Math.random() * 16}%`;
            p.style.backgroundImage = `url('${BREAKING_PARTICLE_BASE}/break_particle.png')`;
            p.style.backgroundSize = 'cover';
            p.style.transform = `scale(${0.6 + Math.random() * 0.7})`;
            eatOverlayEl.appendChild(p);
            setTimeout(() => p.remove(), 620);
        }

        function updateEatingAnimation(deltaMs, time) {
            if (!eatingAnimState.active) return;
            eatingAnimState.timeMs += deltaMs;
            eatingAnimState.particleMs += deltaMs;
            if (eatItemEl) {
                const bob = Math.sin(time * 0.02) * 10;
                eatItemEl.style.transform = `translate(-50%, -50%) translateY(${bob}px)`;
            }
            if (eatingAnimState.particleMs >= 110) {
                eatingAnimState.particleMs = 0;
                spawnEatingParticle();
            }
            if (eatingAnimState.timeMs >= eatingAnimState.durationMs) {
                eatingAnimState.active = false;
                if (eatOverlayEl) eatOverlayEl.classList.add('hidden');
            }
        }

        function tryEatSelectedItem() {
            const held = inventory[selectedHotbarIndex];
            if (!held) return false;
            const foodByItemId = {
                89: { hunger: 3 },
                90: { hunger: 8 },
                92: { hunger: 4 },
                109: { hunger: 2 },
                111: { hunger: 2 },
                112: { hunger: 6 },
            };
            const foodCfg = foodByItemId[held.id] || null;
            if (!foodCfg) return false;
            if (window.HungerSystem && window.HungerSystem.canConsume && !window.HungerSystem.canConsume()) {
                showGameMessage('You are full.');
                return true;
            }
            if (window.HungerSystem?.consume) window.HungerSystem.consume(foodCfg.hunger);
            consumeSelectedItem();
            startEatingAnimation(held.id);
            return true;
        }

        function initChatSystem() {
            if (!window.SingleplayerChat || !window.SingleplayerChat.init) return;

            window.SingleplayerChat.init({
                showGameMessage,
                addToInventory,
                getBlockById: (id) => blockMaterials[id] || null,
                getSelectedItemId,
                setItemKnockbackEnchant,
                getMobById: (id) => window.SingleplayerMobConfig?.byId?.[id] || null,
                spawnMobById,
                spawnVillageStructure,
                setTimeByClock,
                setRenderDistance,
                getRenderDistance: () => currentChunkLoadRadius,
                setFov: setCameraFov,
                getFov: getCameraFov,
                setSensitivity,
                getSensitivity,
                setReach,
                getReach,
                setPlayerHeight,
                getPlayerHeight,
                setGameMode,
                openCreativeMenu,
                closeCreativeMenu,
                grantPrivilege,
                ungrantPrivilege,
                teleportToCoordinates,
                teleportToBiome,
                teleportToVillageStructure,
                teleportToRuinStructure,
                openCommandHelp: () => window.SingleplayerChat?.openCommandHelp?.(),
                mobileAssetBase: MOBILE_ASSET_BASE,
                onOpen: () => {
                    player.canMove = false;
                    player.keys = {};
                    if (document.pointerLockElement) document.exitPointerLock();
                },
                onClose: () => {
                    if (isInventoryOpen) return;
                    player.canMove = true;
                    if (!mobileControls.enabled) {
                        const el = document.body;
                        if (document.pointerLockElement !== el) el.requestPointerLock();
                    }
                }
            });
        }

     
        function renderHearts() {
            const container = document.getElementById('health-container');
            if (!container) return;
            container.innerHTML = '';

            const fullHeartPath = ASSET_FILEPATHS.HEART_FULL || ASSET_FILEPATHS.HEART;
            const halfHeartPath = ASSET_FILEPATHS.HEART_HALF || fullHeartPath;
            const emptyHeartPath = ASSET_FILEPATHS.HEART_EMPTY || fullHeartPath;

            const maxHearts = Math.max(1, Math.floor((player.maxHealth || 20) / 2));
            const healthUnits = Math.max(0, Math.min(Math.round(Number(player.health) || 0), maxHearts * 2));

            for (let i = 0; i < maxHearts; i++) {
                const filledUnits = Math.max(0, Math.min(2, healthUnits - i * 2));
                const heartSlot = document.createElement('div');
                heartSlot.className = 'status-slot';

                const baseHeartImg = document.createElement('img');
                baseHeartImg.src = emptyHeartPath;
                baseHeartImg.alt = 'Heart Container';
                baseHeartImg.className = 'heart-icon';
                heartSlot.appendChild(baseHeartImg);

                if (filledUnits > 0) {
                    const overlayHeartImg = document.createElement('img');
                    overlayHeartImg.src = filledUnits === 2 ? fullHeartPath : halfHeartPath;
                    overlayHeartImg.alt = filledUnits === 2 ? 'Full Heart' : 'Half Heart';
                    overlayHeartImg.className = 'heart-icon status-slot-overlay';
                    heartSlot.appendChild(overlayHeartImg);
                }

                container.appendChild(heartSlot);
            }
        }

        function getMaterialIconPath(mat) {
            if (!mat || !mat.textured) return '';
            const faceKey = mat.textureByFace?.posX || mat.textureByFace?.posZ;
            const preferredKey = faceKey || mat.textureKey;
            return ASSET_FILEPATHS[preferredKey] || ASSET_FILEPATHS[mat.textureKey] || '';
        }

        function buildCreativeCatalog() {
            creativeCatalog.length = 0;
            const seen = new Set();
            const entries = Object.values(blockMaterials || {})
                .filter((mat) => mat && Number.isFinite(mat.id) && mat.id !== 0 && !mat.notInCreative)
                .sort((a, b) => a.id - b.id);
            entries.forEach((mat) => {
                if (seen.has(mat.id)) return;
                seen.add(mat.id);
                creativeCatalog.push(mat.id);
            });
        }

        function setGameMode(mode) {
            const normalized = String(mode || '').toLowerCase();
            if (normalized !== 'creative' && normalized !== 'survival') return false;
            isCreativeMode = normalized === 'creative';
            return true;
        }

        function openCreativeMenu() {
            const creativeScreen = document.getElementById('creative-screen');
            const hud = document.getElementById('hud');
            if (!creativeScreen) return false;
            isInventoryOpen = true;
            isCreativeMenuOpen = true;
            isCraftingTableOpen = false;
            isFurnaceOpen = false;
            activeFurnaceKey = null;
            activeChestKey = null;
            buildCreativeCatalog();
            renderInventoryScreen();
            waypointsMod?.setInventoryOpen?.(false);
            creativeScreen.classList.remove('hidden');
            document.getElementById('inventory-screen')?.classList.add('hidden');
            document.getElementById('furnace-screen')?.classList.add('hidden');
            document.getElementById('chest-screen')?.classList.add('hidden');
            hud?.classList.add('opacity-0');
            if (!mobileControls.enabled) document.exitPointerLock();
            player.keys = {};
            return true;
        }

        function closeCreativeMenu() {
            const creativeScreen = document.getElementById('creative-screen');
            const hud = document.getElementById('hud');
            if (!isCreativeMenuOpen) return false;
            isCreativeMenuOpen = false;
            isInventoryOpen = false;
            creativeScreen?.classList.add('hidden');
            hud?.classList.remove('opacity-0');
            if (!mobileControls.enabled) document.body.requestPointerLock();
            if (heldItem && !addToInventory(heldItem.id, heldItem.count)) {
                showGameMessage('Inventory Full!');
            }
            heldItem = null;
            heldItemSourceIndex = -1;
            heldItemSourceType = null;
            renderHeldItem();
            updateHotbarUI();
            waypointsMod?.setInventoryOpen?.(false);
            return true;
        }

        function grantPrivilege(name) {
            const key = String(name || '').toLowerCase();
            if (key === 'all') {
                grantPrivilege('fly');
                grantPrivilege('speed');
                grantPrivilege('noclip');
                return true;
            }
            if (key !== 'fly' && key !== 'speed' && key !== 'noclip') return false;
            if (key === 'noclip' && !playerPrivileges.fly) {
                showGameMessage('Grant fly first before noclip.');
                return false;
            }
            playerPrivileges[key] = true;
            if (key === 'fly') {
                showGameMessage('Fly privilege granted. Double-space to start flying.');
            } else if (key === 'speed') {
                showGameMessage('Speed enabled. Hold E to boost movement.');
            } else if (key === 'noclip') {
                showGameMessage('Noclip enabled while flying.');
            }
            return true;
        }

        function ungrantPrivilege(name) {
            const key = String(name || '').toLowerCase();
            if (key === 'all') {
                ungrantPrivilege('noclip');
                ungrantPrivilege('speed');
                ungrantPrivilege('fly');
                return true;
            }
            if (key !== 'fly' && key !== 'speed' && key !== 'noclip') return false;
            playerPrivileges[key] = false;
            if (key === 'fly') {
                isFlyActive = false;
                player.velocity.y = 0;
                player.isJumping = false;
                playerPrivileges.noclip = false;
            }
            showGameMessage(`${key} privilege removed.`);
            return true;
        }


        function updateCoordinatesUI() {
            const el = document.getElementById('coordinates-display');
            if (!el || !yawObject) return;
            const x = Math.floor(yawObject.position.x);
            const y = Math.floor(yawObject.position.y);
            const z = Math.floor(yawObject.position.z);
            el.textContent = `XYZ: ${x}, ${y}, ${z}`;
        }

        function updateHotbarUI() {

            const hotbar = document.getElementById('hotbar');
            hotbar.innerHTML = '';
            
          
            for(let i=0; i<HOTBAR_SLOTS; i++) {
                const slot = document.createElement('div');
                slot.className = `inv-slot w-10 h-10 md:w-12 md:h-12 transition-transform ${i === selectedHotbarIndex ? 'selected' : ''}`;
                
                const item = inventory[i];
                if (item) {
                    const mat = blockMaterials[item.id];
                    let imgPath = '';
                    let colorStyle = '';

                    if (mat.textured) {
                        // --- USING DIRECT PATH FOR HOTBAR ICON ---
                        imgPath = getMaterialIconPath(mat);
                    } else {
                        const colorHex = mat.color ? mat.color.toString(16).padStart(6, '0') : '7F8C8D';
                        colorStyle = `background-color: #${colorHex};`;
                    }
                    
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'w-full h-full p-1'; 

                    if (imgPath) {
                        itemDiv.innerHTML = `<img src="${imgPath}" alt="${mat.name}" class="texture-icon w-full h-full">`;
                    } else {
                        itemDiv.style.cssText = `width: 80%; height: 80%; ${colorStyle} border: 1px solid rgba(0,0,0,0.1);`;
                    }
                    
                    slot.appendChild(itemDiv);

                    const countSpan = document.createElement('span');
                    countSpan.className = 'item-count';
                    countSpan.textContent = item.count;
                    if (shouldShowItemCount(item)) slot.appendChild(countSpan);
                }
                slot.addEventListener('click', () => {
                     // Check if not in inventory screen, then select
                    if (!isInventoryOpen) {
                        selectedHotbarIndex = i;
                        updateHotbarUI();
                    }
                });
                hotbar.appendChild(slot);
            }
        }

        // --- CRAFTING SYSTEM LOGIC ---

        // Helper function for inventory item management


        function getOrCreateFurnaceState(key) {
            if (!key) return null;
            if (!furnaceStates.has(key)) {
                const state = (window.FurnaceSystem && window.FurnaceSystem.createState)
                    ? window.FurnaceSystem.createState()
                    : { input: null, fuel: null, output: null, burnTime: 0, maxBurnTime: 0, cookTime: 0, cookTimeTarget: 8 };
                furnaceStates.set(key, state);
            }
            return furnaceStates.get(key);
        }

        function getFurnaceSlotRef(slotType) {
            const state = getOrCreateFurnaceState(activeFurnaceKey);
            if (!state) return null;
            if (slotType === 'furnace-input') return { state, key: 'input' };
            if (slotType === 'furnace-fuel') return { state, key: 'fuel' };
            if (slotType === 'furnace-output') return { state, key: 'output' };
            return null;
        }

        function getOrCreateChestState(key) {
            if (!key) return null;
            if (!chestStates.has(key)) {
                chestStates.set(key, new Array(27).fill(null));
            }
            return chestStates.get(key);
        }

        function seedChestStateWithLoot(key, items = []) {
            if (!key) return false;
            const slots = new Array(27).fill(null);
            items.slice(0, 27).forEach((item, index) => {
                if (!item || !Number.isFinite(item.id) || item.id <= 0 || !Number.isFinite(item.count) || item.count <= 0) return;
                slots[index] = { id: item.id, count: item.count };
            });
            chestStates.set(key, slots);
            return true;
        }

        function resolveInventorySlotTarget(slotIndex, slotType = 'inv') {
            let slotArray;
            let finalIndex = slotIndex;

            if (slotType === 'hotbar' || slotType === 'creative-hotbar') {
                slotArray = inventory;
            } else if (slotType === 'main-inv') {
                finalIndex = HOTBAR_SLOTS + slotIndex;
                slotArray = inventory;
            } else if (slotType === 'craft-input') {
                slotArray = craftingInput;
            } else if (slotType === 'craft-table-input') {
                slotArray = craftingTableInput;
            } else if (slotType === 'furnace-input' || slotType === 'furnace-fuel') {
                const ref = getFurnaceSlotRef(slotType);
                if (ref) slotArray = [ref.state[ref.key]];
                finalIndex = 0;
            } else if (slotType === 'chest') {
                slotArray = getOrCreateChestState(activeChestKey);
            }

            return { slotArray, finalIndex };
        }

        function handleInventoryRightClick(slotIndex, slotType = 'inv') {
            if (!isInventoryOpen || slotType === 'output') return;

            if (slotType === 'creative-item') {
                const itemId = creativeCatalog[slotIndex];
                if (!Number.isFinite(itemId) || !blockMaterials[itemId]) return;
                heldItem = { id: itemId, count: 1 };
                heldItemSourceIndex = -1;
                heldItemSourceType = 'creative-item';
                renderHeldItem();
                updateHotbarUI();
                return;
            }

            const { slotArray, finalIndex } = resolveInventorySlotTarget(slotIndex, slotType);
            if (!slotArray) return;
            const targetItem = slotArray[finalIndex];

            if (!heldItem) {
                if (targetItem && targetItem.count > 1) {
                    const split = Math.ceil(targetItem.count / 2);
                    targetItem.count -= split;
                    heldItem = { id: targetItem.id, count: split };
                    if (targetItem.count <= 0) slotArray[finalIndex] = null;
                }
            } else {
                if (!targetItem) {
                    slotArray[finalIndex] = { id: heldItem.id, count: 1 };
                    heldItem.count -= 1;
                } else if (targetItem.id === heldItem.id && targetItem.count < getMaxStackSize(targetItem.id)) {
                    targetItem.count += 1;
                    heldItem.count -= 1;
                }
                if (heldItem && heldItem.count <= 0) {
                    heldItem = null;
                    heldItemSourceIndex = -1;
                    heldItemSourceType = null;
                }
            }

            if (slotType === 'furnace-output') return;
            if (slotType === 'furnace-input' || slotType === 'furnace-fuel') {
                const ref = getFurnaceSlotRef(slotType);
                if (!ref) return;
                const targetItem = ref.state[ref.key];
                if (!heldItem) {
                    if (targetItem && targetItem.count > 1) {
                        const split = Math.ceil(targetItem.count / 2);
                        targetItem.count -= split;
                        heldItem = { id: targetItem.id, count: split };
                        if (targetItem.count <= 0) ref.state[ref.key] = null;
                    }
                } else {
                    if (!targetItem) {
                        ref.state[ref.key] = { id: heldItem.id, count: 1 };
                        heldItem.count -= 1;
                    } else if (targetItem.id === heldItem.id && targetItem.count < getMaxStackSize(targetItem.id)) {
                        targetItem.count += 1;
                        heldItem.count -= 1;
                    }
                    if (heldItem && heldItem.count <= 0) heldItem = null;
                }
                renderInventoryScreen();
                updateHotbarUI();
                return;
            }
            if (slotType === 'craft-input' || slotType === 'craft-table-input') {
                const inputGrid = isCraftingTableOpen ? craftingTableInput : craftingInput;
                const gridWidth = isCraftingTableOpen ? 3 : 2;
                craftingOutput = checkCraftingRecipe(inputGrid, gridWidth);
            }

            renderInventoryScreen();
            updateHotbarUI();
        }

        function manageSlot(targetItem, targetSlotArray, targetIndex) {
            
            if (!heldItem) {
                // --- PICK UP ---
                if (targetItem) {
                    heldItem = targetItem;
                    targetSlotArray[targetIndex] = null;
                    heldItemSourceIndex = targetIndex;
                    heldItemSourceType = targetIndex < HOTBAR_SLOTS ? 'hotbar' : 
                                         (targetSlotArray === inventory ? 'inv' : 
                                         (targetSlotArray === craftingInput ? 'craft' : 'craft-table'));
                }
            } else {
                // --- PLACE / SWAP / COMBINE ---
                if (!targetItem) {
                    // 1. PLACE HELD ITEM
                    targetSlotArray[targetIndex] = heldItem;
                    heldItem = null;
                    heldItemSourceIndex = -1;
                    heldItemSourceType = null;
                } else if (targetItem.id === heldItem.id && targetItem.count < getMaxStackSize(targetItem.id)) {
                    // 2. COMBINE (Stacking)
                    const capacity = getMaxStackSize(targetItem.id) - targetItem.count;
                    const transfer = Math.min(heldItem.count, capacity);
                    
                    targetItem.count += transfer;
                    heldItem.count -= transfer;
                    
                    if (heldItem.count <= 0) {
                        heldItem = null;
                        heldItemSourceIndex = -1;
                        heldItemSourceType = null;
                    }
                } else {
                    // 3. SWAP
                    const temp = targetItem;
                    targetSlotArray[targetIndex] = heldItem;
                    heldItem = temp;
                }
            }
        }


        function handleInventoryClick(slotIndex, slotType = 'inv') {
            if (!isInventoryOpen) return;

            if (slotType === 'creative-item') {
                const itemId = creativeCatalog[slotIndex];
                if (!Number.isFinite(itemId) || !blockMaterials[itemId]) return;
                heldItem = { id: itemId, count: getMaxStackSize(itemId) };
                heldItemSourceIndex = -1;
                heldItemSourceType = 'creative-item';
                renderHeldItem();
                updateHotbarUI();
                return;
            }
            
            let { slotArray, finalIndex } = resolveInventorySlotTarget(slotIndex, slotType);
            
            if (slotType === 'furnace-output') {
                const ref = getFurnaceSlotRef(slotType);
                if (ref && ref.state.output) {
                    if (!heldItem) {
                        heldItem = { ...ref.state.output };
                        ref.state.output = null;
                    } else if (heldItem.id === ref.state.output.id && heldItem.count + ref.state.output.count <= getMaxStackSize(ref.state.output.id)) {
                        heldItem.count += ref.state.output.count;
                        ref.state.output = null;
                    }
                }
                renderInventoryScreen();
                updateHotbarUI();
                return;
            }

            if (slotType === 'output') {
                
                // Determine which crafting grid is active
                const inputGrid = isCraftingTableOpen ? craftingTableInput : craftingInput;
                const gridWidth = isCraftingTableOpen ? 3 : 2;
                
                // Check recipe using the external file function
                const recipeResult = checkCraftingRecipe(inputGrid, gridWidth);

                if (recipeResult) {
                    // 1. If heldItem is empty, pick up one craft's worth
                    if (heldItem === null) {
                        if (consumeCraftingInputForOne(inputGrid, recipeResult, gridWidth)) {
                            heldItem = { id: recipeResult.id, count: recipeResult.recipeOutputPerCraft };
                        }
                    } 
                    // 2. If heldItem is the same and not full, combine one craft's worth
                    else if (heldItem.id === recipeResult.id && heldItem.count + recipeResult.recipeOutputPerCraft <= getMaxStackSize(recipeResult.id)) {
                        
                        if (consumeCraftingInputForOne(inputGrid, recipeResult, gridWidth)) {
                            heldItem.count += recipeResult.recipeOutputPerCraft; 
                        }
                    }
                    
                    // After any output interaction, recalculate the next crafting output
                    craftingOutput = checkCraftingRecipe(inputGrid, gridWidth);
                }
            }

            if (slotType === 'furnace-input' || slotType === 'furnace-fuel') {
                const ref = getFurnaceSlotRef(slotType);
                if (ref) {
                    const tempArray = [ref.state[ref.key]];
                    manageSlot(tempArray[0], tempArray, 0);
                    ref.state[ref.key] = tempArray[0];
                }
            } else if (slotArray) {
                manageSlot(slotArray[finalIndex], slotArray, finalIndex);
                
                // If the change was in the crafting input grid, recalculate output
                if (slotType === 'furnace-output') return;
            if (slotType === 'furnace-input' || slotType === 'furnace-fuel') {
                const ref = getFurnaceSlotRef(slotType);
                if (!ref) return;
                const targetItem = ref.state[ref.key];
                if (!heldItem) {
                    if (targetItem && targetItem.count > 1) {
                        const split = Math.ceil(targetItem.count / 2);
                        targetItem.count -= split;
                        heldItem = { id: targetItem.id, count: split };
                        if (targetItem.count <= 0) ref.state[ref.key] = null;
                    }
                } else {
                    if (!targetItem) {
                        ref.state[ref.key] = { id: heldItem.id, count: 1 };
                        heldItem.count -= 1;
                    } else if (targetItem.id === heldItem.id && targetItem.count < getMaxStackSize(targetItem.id)) {
                        targetItem.count += 1;
                        heldItem.count -= 1;
                    }
                    if (heldItem && heldItem.count <= 0) heldItem = null;
                }
                renderInventoryScreen();
                updateHotbarUI();
                return;
            }
            if (slotType === 'craft-input' || slotType === 'craft-table-input') {
                    const inputGrid = isCraftingTableOpen ? craftingTableInput : craftingInput;
                    const gridWidth = isCraftingTableOpen ? 3 : 2;
                    craftingOutput = checkCraftingRecipe(inputGrid, gridWidth);
                }
            }
            
            renderInventoryScreen(); 
            updateHotbarUI(); 
        }
        
        function renderInventoryScreen() {
            const usingFurnaceScreen = isFurnaceOpen;
            const usingChestScreen = isInventoryOpen && !isFurnaceOpen && !!activeChestKey;
            const mainGrid = document.getElementById(
                usingFurnaceScreen ? 'furnace-main-inventory-grid' : (usingChestScreen ? 'chest-main-inventory-grid' : 'main-inventory-grid')
            );
            const hotbarGrid = document.getElementById(
                usingFurnaceScreen ? 'furnace-hotbar-grid' : (usingChestScreen ? 'chest-hotbar-grid' : 'inventory-hotbar-grid')
            );

            const craftInputGrid2x2 = document.getElementById('crafting-input-grid');
            const craftOutputSlot2x2 = document.getElementById('crafting-output-slot-container');
            const craftInputGrid3x3 = document.getElementById('crafting-table-grid');
            const craftOutputSlot3x3 = document.getElementById('crafting-table-output-slot');
            const furnaceInputSlot = document.getElementById('furnace-input-slot');
            const furnaceFuelSlot = document.getElementById('furnace-fuel-slot');
            const furnaceOutputSlot = document.getElementById('furnace-output-slot');
            const chestGrid = document.getElementById('chest-grid');
            const creativeGrid = document.getElementById('creative-item-grid');
            const creativeHotbarGrid = document.getElementById('creative-hotbar-grid');

            if (!mainGrid || !hotbarGrid) return;

            const waypointMenuEnabled = isInventoryOpen && !usingFurnaceScreen && !usingChestScreen && !isCreativeMenuOpen;
            waypointsMod?.renderWaypointUi?.({ enabled: waypointMenuEnabled });

            mainGrid.innerHTML = '';
            hotbarGrid.innerHTML = '';
            if (craftInputGrid2x2) craftInputGrid2x2.innerHTML = '';
            if (craftOutputSlot2x2) craftOutputSlot2x2.innerHTML = '';
            if (craftInputGrid3x3) craftInputGrid3x3.innerHTML = '';
            if (craftOutputSlot3x3) craftOutputSlot3x3.innerHTML = '';
            if (furnaceInputSlot) furnaceInputSlot.innerHTML = '';
            if (furnaceFuelSlot) furnaceFuelSlot.innerHTML = '';
            if (furnaceOutputSlot) furnaceOutputSlot.innerHTML = '';
            if (chestGrid) chestGrid.innerHTML = '';
            if (creativeGrid) creativeGrid.innerHTML = '';
            if (creativeHotbarGrid) creativeHotbarGrid.innerHTML = '';

            const mainStart = HOTBAR_SLOTS;

            const createSlot = (item, index, type) => {
                const slot = document.createElement('div');
                slot.className = 'inv-slot';
                slot.dataset.index = index;
                slot.dataset.type = type;
                slot.onclick = () => handleInventoryClick(index, type);
                slot.oncontextmenu = (e) => {
                    e.preventDefault();
                    handleInventoryRightClick(index, type);
                };

                if (item) {
                    const mat = blockMaterials[item.id];
                    let imgPath = '';
                    let colorStyle = '';

                    if (mat.textured) imgPath = getMaterialIconPath(mat);
                    else {
                        const colorHex = mat.color ? mat.color.toString(16).padStart(6, '0') : '7F8C8D';
                        colorStyle = `background-color: #${colorHex};`;
                    }

                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'w-full h-full p-1';
                    if (imgPath) itemDiv.innerHTML = `<img src="${imgPath}" alt="${mat.name}" class="texture-icon w-full h-full">`;
                    else itemDiv.style.cssText = `width: 80%; height: 80%; ${colorStyle} border: 1px solid rgba(0,0,0,0.1);`;

                    slot.appendChild(itemDiv);
                    const countSpan = document.createElement('span');
                    countSpan.className = 'item-count';
                    countSpan.textContent = item.count;
                    if (shouldShowItemCount(item)) slot.appendChild(countSpan);
                }
                return slot;
            };

            for (let i = 0; i < HOTBAR_SLOTS; i++) hotbarGrid.appendChild(createSlot(inventory[i], i, 'hotbar'));
            for (let r = 0; r < INV_ROWS; r++) {
                for (let c = 0; c < INV_COLS; c++) {
                    const invIndex = mainStart + r * INV_COLS + c;
                    const displayIndex = r * INV_COLS + c;
                    mainGrid.appendChild(createSlot(inventory[invIndex], displayIndex, 'main-inv'));
                }
            }


            if (isCreativeMenuOpen) {
                for (let i = 0; i < creativeCatalog.length; i++) {
                    const id = creativeCatalog[i];
                    creativeGrid?.appendChild(createSlot({ id, count: getMaxStackSize(id) }, i, 'creative-item'));
                }
                for (let i = 0; i < HOTBAR_SLOTS; i++) {
                    creativeHotbarGrid?.appendChild(createSlot(inventory[i], i, 'creative-hotbar'));
                }
                renderHeldItem();
                return;
            }

            if (usingFurnaceScreen && activeFurnaceKey) {
                const state = getOrCreateFurnaceState(activeFurnaceKey);
                if (furnaceInputSlot) furnaceInputSlot.appendChild(createSlot(state.input, 0, 'furnace-input'));
                if (furnaceFuelSlot) furnaceFuelSlot.appendChild(createSlot(state.fuel, 0, 'furnace-fuel'));
                if (furnaceOutputSlot) {
                    const outSlot = createSlot(state.output, 0, 'furnace-output');
                    outSlot.style.backgroundColor = '#6495ed';
                    furnaceOutputSlot.appendChild(outSlot);
                }
                renderHeldItem();
                return;
            }

            if (usingChestScreen && activeChestKey && chestGrid) {
                const chestState = getOrCreateChestState(activeChestKey);
                for (let i = 0; i < chestState.length; i++) chestGrid.appendChild(createSlot(chestState[i], i, 'chest'));
                renderHeldItem();
                return;
            }

            if (isCraftingTableOpen) {
                for (let i = 0; i < 9; i++) craftInputGrid3x3.appendChild(createSlot(craftingTableInput[i], i, 'craft-table-input'));
                const outputSlotEl = createSlot(craftingOutput, 0, 'output');
                outputSlotEl.style.backgroundColor = '#6495ed';
                craftOutputSlot3x3.appendChild(outputSlotEl);
            } else {
                for (let i = 0; i < 4; i++) craftInputGrid2x2.appendChild(createSlot(craftingInput[i], i, 'craft-input'));
                const outputSlotEl = createSlot(craftingOutput, 0, 'output');
                outputSlotEl.style.backgroundColor = '#6495ed';
                craftOutputSlot2x2.appendChild(outputSlotEl);
            }

            renderHeldItem();
        }

        // --- Renders the item attached to the mouse cursor when inventory is open ---
        function renderHeldItem() {
            let heldDiv = document.getElementById('held-item-cursor');
            
            heldDiv.innerHTML = '';
            
            if (heldItem) {
                const item = heldItem;
                const mat = blockMaterials[item.id];
                
                heldDiv.style.opacity = 1;
                heldDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                heldDiv.style.borderRadius = '4px';
                heldDiv.style.border = '1px solid white';
                
                const itemDiv = document.createElement('div');
                itemDiv.className = 'w-full h-full p-1 flex items-center justify-center';

                let imgPath = '';
                let colorStyle = '';

                if (mat.textured) {
                    imgPath = getMaterialIconPath(mat);
                } else {
                    const colorHex = mat.color ? mat.color.toString(16).padStart(6, '0') : '7F8C8D';
                    colorStyle = `background-color: #${colorHex};`;
                }
                
                if (imgPath) {
                    itemDiv.innerHTML = `<img src="${imgPath}" alt="${mat.name}" class="texture-icon w-full h-full">`;
                } else {
                    itemDiv.style.cssText = `width: 80%; height: 80%; ${colorStyle} border: 1px solid rgba(0,0,0,0.1);`;
                }

                heldDiv.appendChild(itemDiv);

                const countSpan = document.createElement('span');
                countSpan.className = 'item-count !text-lg !right-1 !bottom-0'; // make count larger for clarity
                countSpan.textContent = item.count;
                if (shouldShowItemCount(item)) heldDiv.appendChild(countSpan);
            } else {
                heldDiv.style.opacity = 0;
                heldDiv.style.backgroundColor = 'transparent';
                heldDiv.style.border = 'none';
            }
        }
        // --- END: Renders the item attached to the mouse cursor when inventory is open ---


        function toggleInventory(openTableMode = false) {
            const invScreen = document.getElementById('inventory-screen');
            const furnaceScreen = document.getElementById('furnace-screen');
            const chestScreen = document.getElementById('chest-screen');
            const hud = document.getElementById('hud');
            const container2x2 = document.getElementById('crafting-2x2-container');
            const container3x3 = document.getElementById('crafting-3x3-container');
            const inventoryPanel = document.getElementById('inventory-panel');

            if (isCreativeMenuOpen) {
                closeCreativeMenu();
                return;
            }

            if (isInventoryOpen) {
                isInventoryOpen = false;
                isCraftingTableOpen = false;
                isFurnaceOpen = false;
                activeFurnaceKey = null;
                activeChestKey = null;
                if (invScreen) invScreen.classList.add('hidden');
                if (furnaceScreen) furnaceScreen.classList.add('hidden');
                if (chestScreen) chestScreen.classList.add('hidden');
                if (inventoryPanel) inventoryPanel.classList.add('inventory-mode');
                hud.classList.remove('opacity-0');
                if (!mobileControls.enabled) document.body.requestPointerLock();

                if (heldItem) {
                    if (!addToInventory(heldItem.id, heldItem.count)) {
                        console.log('Inventory full, item lost on close (simplified logic)');
                    }
                    heldItem = null;
                    heldItemSourceIndex = -1;
                    heldItemSourceType = null;
                }
                renderHeldItem();
                updateHotbarUI();
                waypointsMod?.setInventoryOpen?.(false);
                return;
            }

            isInventoryOpen = true;
            isCraftingTableOpen = openTableMode;
            isFurnaceOpen = false;
            activeFurnaceKey = null;
            activeChestKey = null;

            if (isCraftingTableOpen) {
                container2x2.classList.add('hidden');
                container3x3.classList.remove('hidden');
                if (inventoryPanel) inventoryPanel.classList.remove('inventory-mode');
            } else {
                container2x2.classList.remove('hidden');
                container3x3.classList.add('hidden');
                if (inventoryPanel) inventoryPanel.classList.add('inventory-mode');
            }

            heldItem = null;
            heldItemSourceIndex = -1;
            heldItemSourceType = null;

            const inputGrid = isCraftingTableOpen ? craftingTableInput : craftingInput;
            const gridWidth = isCraftingTableOpen ? 3 : 2;
            craftingOutput = checkCraftingRecipe(inputGrid, gridWidth);

            renderInventoryScreen();
            waypointsMod?.setInventoryOpen?.(true);
            if (invScreen) invScreen.classList.remove('hidden');
            if (furnaceScreen) furnaceScreen.classList.add('hidden');
            if (chestScreen) chestScreen.classList.add('hidden');
            hud.classList.add('opacity-0');
            if (!mobileControls.enabled) document.exitPointerLock();
            player.keys = {};
        }

        function openFurnaceScreen(furnaceKey) {
            const invScreen = document.getElementById('inventory-screen');
            const furnaceScreen = document.getElementById('furnace-screen');
            const chestScreen = document.getElementById('chest-screen');
            const hud = document.getElementById('hud');

            isInventoryOpen = true;
            isCraftingTableOpen = false;
            isFurnaceOpen = true;
            const inventoryPanel = document.getElementById('inventory-panel');
            if (inventoryPanel) inventoryPanel.classList.add('inventory-mode');
            activeFurnaceKey = furnaceKey;
            activeChestKey = null;

            heldItem = null;
            heldItemSourceIndex = -1;
            heldItemSourceType = null;

            renderInventoryScreen();
            waypointsMod?.setInventoryOpen?.(false);
            if (invScreen) invScreen.classList.add('hidden');
            if (furnaceScreen) furnaceScreen.classList.remove('hidden');
            if (chestScreen) chestScreen.classList.add('hidden');
            hud.classList.add('opacity-0');
            if (!mobileControls.enabled) document.exitPointerLock();
            player.keys = {};
        }

        function openChestScreen(chestKey) {
            const invScreen = document.getElementById('inventory-screen');
            const furnaceScreen = document.getElementById('furnace-screen');
            const chestScreen = document.getElementById('chest-screen');
            const hud = document.getElementById('hud');

            isInventoryOpen = true;
            isCraftingTableOpen = false;
            isFurnaceOpen = false;
            const inventoryPanel = document.getElementById('inventory-panel');
            if (inventoryPanel) inventoryPanel.classList.add('inventory-mode');
            activeFurnaceKey = null;
            activeChestKey = chestKey;
            getOrCreateChestState(chestKey);

            heldItem = null;
            heldItemSourceIndex = -1;
            heldItemSourceType = null;

            renderInventoryScreen();
            waypointsMod?.setInventoryOpen?.(false);
            if (invScreen) invScreen.classList.add('hidden');
            if (furnaceScreen) furnaceScreen.classList.add('hidden');
            if (chestScreen) chestScreen.classList.remove('hidden');
            hud.classList.add('opacity-0');
            if (!mobileControls.enabled) document.exitPointerLock();
            player.keys = {};
        }

        function getMiningDurationMs(blockId) {
            const hardnessGrade = BlockHardnessSystem.getHardness
                ? BlockHardnessSystem.getHardness(blockId)
                : 6;

            if (hardnessGrade < 0) {
                return { durationMs: Infinity, allowed: false, reason: 'unbreakable' };
            }
            if (hardnessGrade === 0) {
                return { durationMs: 0, allowed: true, reason: null };
            }

            const held = inventory[selectedHotbarIndex];
            const equippedPickaxe = PickaxeSystem.getEquippedPickaxe ? PickaxeSystem.getEquippedPickaxe(held) : null;
            const equippedTool = PickaxeSystem.getEquippedTool ? PickaxeSystem.getEquippedTool(held) : equippedPickaxe;
            const breakable = BlockBreakableSystem.canBreakBlock
                ? BlockBreakableSystem.canBreakBlock(blockId, equippedPickaxe)
                : { canBreak: true, dropsItems: true, reason: null };

            if (!breakable.canBreak) {
                return {
                    durationMs: Infinity,
                    allowed: false,
                    reason: breakable.reason || 'unbreakable',
                    requiredTier: breakable.requiredTier || null,
                    dropOnBreak: false,
                };
            }

            const legacyHardness = BlockHardnessSystem.toLegacyHardness
                ? BlockHardnessSystem.toLegacyHardness(hardnessGrade)
                : Math.max(0.2, hardnessGrade / 5);

            const effectiveTool = equippedTool && (equippedTool.toolType === 'shovel' || equippedTool.toolType === 'axe')
                ? equippedTool
                : (breakable.dropsItems ? equippedPickaxe : null);

            if (PickaxeSystem.getMiningTimeMs) {
                return {
                    durationMs: PickaxeSystem.getMiningTimeMs(blockId, legacyHardness, effectiveTool),
                    allowed: true,
                    reason: breakable.reason || null,
                    requiredTier: breakable.requiredTier || null,
                    dropOnBreak: breakable.dropsItems !== false,
                };
            }

            return {
                durationMs: hardnessGrade * 150,
                allowed: true,
                reason: breakable.reason || null,
                requiredTier: breakable.requiredTier || null,
                dropOnBreak: breakable.dropsItems !== false,
            };
        }

        function preloadBreakingTextures() {
            const loader = new THREE.TextureLoader();
            for (let i = 0; i < 10; i++) {
                loader.load(`${BREAKING_TEXTURE_BASE}/${i}.png`, (tex) => {
                    tex.magFilter = THREE.NearestFilter;
                    tex.minFilter = THREE.NearestFilter;
                    breakingStageTextures[i] = tex;
                });
            }
            loader.load(`${BREAKING_PARTICLE_BASE}/break_particle.png`, (tex) => {
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                breakParticleTexture = tex;
                particleMaterials.break = null;
            }, undefined, () => {
                breakParticleTexture = null;
                particleMaterials.break = null;
            });
            loader.load(`${BREAKING_PARTICLE_BASE}/lava.png`, (tex) => {
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                lavaParticleTexture = tex;
                particleMaterials.lava = null;
            }, undefined, () => {
                lavaParticleTexture = null;
                particleMaterials.lava = null;
            });
        }

        function getOrCreateParticleMaterial(kind) {
            if (particleMaterials[kind]) return particleMaterials[kind];
            const tex = kind === 'lava' ? lavaParticleTexture : breakParticleTexture;
            particleMaterials[kind] = new THREE.SpriteMaterial({
                map: tex || null,
                color: kind === 'lava' ? 0xffa347 : 0xffffff,
                transparent: true,
                opacity: kind === 'lava' ? 0.92 : 0.95,
                depthWrite: false,
            });
            return particleMaterials[kind];
        }

        function spawnWorldParticle(kind, position, velocity, lifeMs, scale = 0.22) {
            if (!scene) return;
            if (activeWorldParticles.length > 260) return;

            const mat = getOrCreateParticleMaterial(kind);
            let sprite = particleSpritePool.pop();
            if (!sprite) {
                sprite = new THREE.Sprite(mat);
            } else {
                sprite.material = mat;
                sprite.visible = true;
            }

            sprite.scale.set(scale, scale, scale);
            sprite.position.copy(position);
            sprite.material.opacity = kind === 'lava' ? 0.92 : 0.95;
            scene.add(sprite);
            activeWorldParticles.push({
                sprite,
                vel: velocity.clone(),
                ageMs: 0,
                lifeMs,
                gravity: kind === 'lava' ? -3.2 : -7.2,
                drag: kind === 'lava' ? 0.9 : 0.82,
            });
        }

        function emitBreakParticles(wx, wy, wz, count = 8, burst = false) {
            for (let i = 0; i < count; i++) {
                const px = wx + 0.2 + Math.random() * 0.6;
                const py = wy + 0.2 + Math.random() * 0.6;
                const pz = wz + 0.2 + Math.random() * 0.6;
                const speed = burst ? (1.4 + Math.random() * 1.7) : (0.6 + Math.random() * 0.9);
                const vel = new THREE.Vector3((Math.random() - 0.5) * speed, (Math.random() * 0.9 + 0.25) * speed, (Math.random() - 0.5) * speed);
                const life = burst ? (420 + Math.random() * 300) : (230 + Math.random() * 180);
                spawnWorldParticle('break', new THREE.Vector3(px, py, pz), vel, life, burst ? 0.16 : 0.13);
            }
        }

        function maybeSpawnLavaParticles(deltaMs) {
            lavaParticleScanMs += deltaMs;
            if (lavaParticleScanMs < 120) return;
            lavaParticleScanMs = 0;

            const baseX = Math.floor(yawObject.position.x);
            const baseY = Math.floor(yawObject.position.y);
            const baseZ = Math.floor(yawObject.position.z);

            const samples = activeWorldParticles.length > 180 ? 8 : 14;
            for (let i = 0; i < samples; i++) {
                const wx = baseX + Math.floor((Math.random() - 0.5) * 20);
                const wy = Math.max(2, Math.min(CHUNK_HEIGHT - 3, baseY + Math.floor((Math.random() - 0.5) * 10)));
                const wz = baseZ + Math.floor((Math.random() - 0.5) * 20);
                const t = getBlockType(wx, wy, wz);
                const isLava = t === 33 || (t >= 60 && t <= 66);
                if (!isLava) continue;

                const above = getBlockType(wx, wy + 1, wz);
                const below = getBlockType(wx, wy - 1, wz);
                const airAbove = above === 0;
                const airBelow = below === 0;

                if (airAbove && Math.random() < 0.2) {
                    const pos = new THREE.Vector3(wx + 0.5 + (Math.random() - 0.5) * 0.26, wy + 1.02, wz + 0.5 + (Math.random() - 0.5) * 0.26);
                    const vel = new THREE.Vector3((Math.random() - 0.5) * 0.35, 1.1 + Math.random() * 1.0, (Math.random() - 0.5) * 0.35);
                    spawnWorldParticle('lava', pos, vel, 620 + Math.random() * 420, 0.18 + Math.random() * 0.1);
                }

                if (airBelow && Math.random() < 0.5) {
                    const pos = new THREE.Vector3(wx + 0.5 + (Math.random() - 0.5) * 0.18, wy - 0.05, wz + 0.5 + (Math.random() - 0.5) * 0.18);
                    const vel = new THREE.Vector3((Math.random() - 0.5) * 0.08, -(1.0 + Math.random() * 1.1), (Math.random() - 0.5) * 0.08);
                    spawnWorldParticle('lava', pos, vel, 520 + Math.random() * 320, 0.14 + Math.random() * 0.08);
                }
            }
        }

        function updateWorldParticles(deltaMs) {
            if (!activeWorldParticles.length) return;
            const dt = Math.min(0.05, Math.max(0, deltaMs / 1000));
            for (let i = activeWorldParticles.length - 1; i >= 0; i--) {
                const p = activeWorldParticles[i];
                p.ageMs += deltaMs;
                p.vel.y += p.gravity * dt;
                p.vel.multiplyScalar(Math.max(0.01, 1 - (1 - p.drag) * dt * 18));
                p.sprite.position.addScaledVector(p.vel, dt);
                const fade = 1 - (p.ageMs / p.lifeMs);
                p.sprite.material.opacity = Math.max(0, fade);
                if (p.ageMs >= p.lifeMs) {
                    scene.remove(p.sprite);
                    p.sprite.visible = false;
                    particleSpritePool.push(p.sprite);
                    activeWorldParticles.splice(i, 1);
                }
            }
        }

        function ensureBreakingCrackMesh() {
            if (breakingCrackMesh) return;
            const geom = new THREE.BoxGeometry(1.01, 1.01, 1.01);
            const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
            breakingCrackMesh = new THREE.Mesh(geom, mat);
            breakingCrackMesh.visible = false;
            worldGroup.add(breakingCrackMesh);
        }

        function getTargetBlockFromCrosshair() {
            if (!raycaster || !camera) return null;
            if (!prepareCrosshairRaycast()) return null;

            const meshes = [];
            worldGroup.children.forEach(g => {
                if (g === breakingCrackMesh) return;
                if (g.isMesh) meshes.push(g);
                else if (g.children) {
                    g.children.forEach(m => {
                        if (m !== breakingCrackMesh) meshes.push(m);
                    });
                }
            });

            const intersects = raycaster.intersectObjects(meshes, true);
            if (intersects.length <= 0) return null;

            for (const hit of intersects) {
                if (!hit.face || !hit.face.normal) continue;
                const pos = hit.point.clone().sub(hit.face.normal.clone().multiplyScalar(0.03));
                const wx = Math.floor(pos.x), wy = Math.floor(pos.y), wz = Math.floor(pos.z);
                const blockId = getBlockType(wx, wy, wz);
                if (blockId === 0 || blockId === 4) {
                    const dir = raycaster.ray.direction.clone();
                    const altPos = hit.point.clone().sub(dir.multiplyScalar(0.12));
                    const ax = Math.floor(altPos.x), ay = Math.floor(altPos.y), az = Math.floor(altPos.z);
                    const altId = getBlockType(ax, ay, az);
                    if (altId !== 0 && altId !== 4) return { pos: altPos, wx: ax, wy: ay, wz: az, blockId: altId };
                    continue;
                }
                return { pos, wx, wy, wz, blockId };
            }

            return null;
        }

        function beginMiningTarget(target) {
            const miningInfo = getMiningDurationMs(target.blockId);
            const neededMs = miningInfo.durationMs;
            if (!isFinite(neededMs)) {
                showGameMessage('This block is unbreakable.');
                return false;
            }
            if (miningInfo.reason === 'tool_too_weak') {
                const tier = miningInfo.requiredTier || 0;
                const tierName = tier <= 1 ? 'wooden pickaxe' : tier === 2 ? 'stone pickaxe' : tier <= 4 ? 'copper pickaxe' : tier === 5 ? 'iron pickaxe' : 'better pickaxe';
                showGameMessage(`Breaks, but no drops without ${tierName}.`);
            }
            miningSwingTimerMs = Math.max(miningSwingTimerMs, 170);
            miningState = {
                active: true,
                key: `${target.wx},${target.wy},${target.wz}`,
                blockPos: target.pos,
                targetType: target.blockId,
                elapsedMs: 0,
                neededMs,
                missMs: 0,
                dropOnBreak: miningInfo.dropOnBreak !== false,
                particleMs: 0,
            };
            return true;
        }

        function updateBreakingOverlay() {
            ensureBreakingCrackMesh();
            const overlay = document.getElementById('breaking-overlay');
            if (overlay) overlay.style.opacity = 0;

            if (!miningState.active || !isFinite(miningState.neededMs) || !miningState.blockPos) {
                if (breakingCrackMesh) breakingCrackMesh.visible = false;
                return;
            }

            const progress = Math.min(1, miningState.elapsedMs / Math.max(1, miningState.neededMs));
            const stage = Math.min(9, Math.floor(progress * 10));
            const tex = breakingStageTextures[stage];

            const wx = Math.floor(miningState.blockPos.x);
            const wy = Math.floor(miningState.blockPos.y);
            const wz = Math.floor(miningState.blockPos.z);
            breakingCrackMesh.position.set(wx + 0.5, wy + 0.5, wz + 0.5);
            if (tex) breakingCrackMesh.material.map = tex;
            breakingCrackMesh.material.needsUpdate = true;
            breakingCrackMesh.visible = true;
        }


        function setupBlockInteraction() {
            window.addEventListener('pointerdown', onPointerDown, false);
            window.addEventListener('pointerup', onPointerUp, false);
            window.addEventListener('pointercancel', onPointerUp, false);
        }

        function onPointerUp(event) {
            if (event.pointerType === 'touch') return;
            if (event.button !== 0) return;
            isLeftMouseDown = false;
            miningState.active = false;
            updateBreakingOverlay();
        }

        function interactOrPlaceAtCrosshair() {
            if (tryEatSelectedItem()) return;
            if (!prepareCrosshairRaycast()) return;
            const meshes = [];
            worldGroup.children.forEach(g => g.children.forEach(m => meshes.push(m)));
            const intersects = raycaster.intersectObjects(meshes, true);
            if (!intersects.length) return;

            const hit = intersects[0];
            const targetBlockPos = hit.point.clone().sub(hit.face.normal.clone().multiplyScalar(0.01));
            const wx = Math.floor(targetBlockPos.x);
            const wy = Math.floor(targetBlockPos.y);
            const wz = Math.floor(targetBlockPos.z);
            const targetBlockId = getBlockType(wx, wy, wz);

            if (targetBlockId === 9) {
                toggleInventory(true);
                return;
            }
            if (targetBlockId === 23) {
                openFurnaceScreen(`${wx},${wy},${wz}`);
                return;
            }
            if (targetBlockId === 82) {
                openChestScreen(`${wx},${wy},${wz}`);
                return;
            }

            const item = inventory[selectedHotbarIndex];
            if (!item) return;

            const placePos = hit.point.clone().add(hit.face.normal.clone().multiplyScalar(0.01));
            const px = Math.floor(placePos.x);
            const py = Math.floor(placePos.y);
            const pz = Math.floor(placePos.z);

            const bucketContext = {
                heldItemId: item.id,
                targetBlockId,
                targetPos: { wx, wy, wz },
                placePos: { wx: px, wy: py, wz: pz },
                getBlock: getBlockType,
                setBlock: (xw, yw, zw, newType) => setBlockTypeRaw(xw, yw, zw, newType, true),
                setSelectedItem: setSelectedHotbarItem,
                showGameMessage,
            };
            if (window.SingleplayerWaterBucket?.tryInteract?.(bucketContext)) return;
            if (window.SingleplayerLavaBucket?.tryInteract?.(bucketContext)) return;

            if (!isPlaceableBlock(item.id)) return;

            const playerBox = new THREE.Box3(
                new THREE.Vector3(yawObject.position.x - PLAYER_RADIUS, yawObject.position.y, yawObject.position.z - PLAYER_RADIUS),
                new THREE.Vector3(yawObject.position.x + PLAYER_RADIUS, yawObject.position.y + currentPlayerHeight, yawObject.position.z + PLAYER_RADIUS)
            );
            const blockBox = getBlockWorldBox(px, py, pz, item.id) || new THREE.Box3(
                new THREE.Vector3(px, py, pz), new THREE.Vector3(px + 1, py + 1, pz + 1)
            );

            if (!playerBox.intersectsBox(blockBox)) {
                const placedId = item.id === 101 ? 99 : item.id;
                if (modifyWorld(placePos, placedId)) consumeSelectedItem();
            }
        }

        function onPointerDown(event) {
            if (event.pointerType === 'touch') return;
            if (!player.canMove || isInventoryOpen) return;

            if (!prepareCrosshairRaycast()) return;
            const meshes = [];
            worldGroup.children.forEach(g => g.children.forEach(m => meshes.push(m)));
            const intersects = raycaster.intersectObjects(meshes, true);
            if (!intersects.length) return;

            if (event.button === 0) {
                const attackKnockback = getHeldKnockbackEnchantLevel();
                const meleeProfile = getHeldMeleeProfile();
                const wolfHit = wolfMob?.getHitFromCrosshair?.();
                if (wolfHit && isTargetWithinMeleeRange(wolfHit, meleeProfile.range)) {
                    const held = inventory[selectedHotbarIndex];
                    if (!wolfHit.tamed && held && held.id === 95) {
                        consumeSelectedItem();
                        if (Math.random() < 0.68) {
                            wolfMob?.tame?.(wolfHit);
                            showGameMessage('Wolf tamed! It is now your dog.');
                        } else {
                            showGameMessage('The wolf refused the bone.');
                        }
                    } else {
                        wolfMob?.hurt?.(wolfHit, meleeProfile.damage, yawObject.position, attackKnockback);
                    }
                    return;
                }

                const pandaHit = pandaMob?.getHitFromCrosshair?.();
                if (pandaHit && isTargetWithinMeleeRange(pandaHit, meleeProfile.range)) {
                    pandaMob?.hurt?.(pandaHit, meleeProfile.damage, 'player', yawObject.position, attackKnockback);
                    return;
                }

                const zombieHit = zombieMob?.getHitFromCrosshair?.();
                if (zombieHit && isTargetWithinMeleeRange(zombieHit, meleeProfile.range)) {
                    zombieMob?.hurt?.(zombieHit, meleeProfile.damage, yawObject.position, attackKnockback);
                    wolfMob?.commandTamedAttack?.(zombieHit, 'zombie');
                    return;
                }

                const villagerHit = villagerMob?.getHitFromCrosshair?.();
                if (villagerHit && isTargetWithinMeleeRange(villagerHit, meleeProfile.range)) {
                    villagerMob?.hurt?.(villagerHit, meleeProfile.damage, 'player', yawObject.position, attackKnockback);
                    return;
                }

                const pigHit = pigMob?.getHitFromCrosshair?.();
                if (pigHit && isTargetWithinMeleeRange(pigHit, meleeProfile.range)) {
                    pigMob?.hurt?.(pigHit, meleeProfile.damage, 'player', yawObject.position, attackKnockback);
                    wolfMob?.commandTamedAttack?.(pigHit, 'pig');
                    return;
                }
                isLeftMouseDown = true;
                const target = getTargetBlockFromCrosshair();
                if (target) {
                    beginMiningTarget(target);
                    updateBreakingOverlay();
                }
            } else if (event.button === 2) {
                interactOrPlaceAtCrosshair();
            }
        }

        function setBlockTypeRaw(wx, wy, wz, newType, deferGeometryUpdate = false) {
            const cx = Math.floor(wx / CHUNK_SIZE);
            const cz = Math.floor(wz / CHUNK_SIZE);
            const chunkId = `${cx},${cz}`;
            const group = chunks.get(chunkId);
            if (!group) return false;
            if (wy < 0 || wy >= CHUNK_HEIGHT) return false;

            const lx = wx - cx * CHUNK_SIZE;
            const lz = wz - cz * CHUNK_SIZE;
            if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return false;

            const index = lx + wy * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT;
            const chunkData = group.userData.chunkData;
            const oldType = chunkData[index];
            if (oldType === newType) return false;
            chunkData[index] = newType;

            // Chunk meshing rebuild triggers:
            // - block changes
            // - neighbor chunk changes (edge edits)
            // - lighting-affecting changes (deferred through same dirty queue)
            requestChunkRemesh(cx, cz, 'block');
            if (lx <= 0) requestChunkRemesh(cx - 1, cz, 'neighbor');
            if (lx >= CHUNK_SIZE - 1) requestChunkRemesh(cx + 1, cz, 'neighbor');
            if (lz <= 0) requestChunkRemesh(cx, cz - 1, 'neighbor');
            if (lz >= CHUNK_SIZE - 1) requestChunkRemesh(cx, cz + 1, 'neighbor');

            updateChunkHeightmapColumn(group, lx, lz);

            const oldMat = blockMaterials[oldType];
            const newMat = blockMaterials[newType];
            const lightingSensitive = Boolean(oldMat?.emissive || newMat?.emissive || oldType === 22 || newType === 22 || oldType === 4 || newType === 4 || oldType === 33 || newType === 33 || oldType === 119 || newType === 119);
            if (lightingSensitive) requestChunkAndNeighborsRemesh(cx, cz, 'lighting');

            if (newType === 0 && isChunkAllAir(chunkData)) {
                convertChunkToSparseAir(group);
            }

            return true;
        }

        function swapBlocksRaw(wx1, wy1, wz1, wx2, wy2, wz2) {
            const a = getBlockType(wx1, wy1, wz1);
            const b = getBlockType(wx2, wy2, wz2);
            if (!setBlockTypeRaw(wx1, wy1, wz1, b, true)) return false;
            setBlockTypeRaw(wx2, wy2, wz2, a, true);
            return true;
        }

        let physicsTickCounter = 0;

        function applyBlockPhysics(nowMs) {
            if (!window.WaterPhysics || !window.SandPhysics || !window.LavaPhysics) return;
            if (nowMs - lastPhysicsTickMs < 50) return;
            lastPhysicsTickMs = nowMs;
            physicsTickCounter++;

            const centerCx = Math.floor(yawObject.position.x / CHUNK_SIZE);
            const centerCz = Math.floor(yawObject.position.z / CHUNK_SIZE);
            const activeRadius = 3;
            const maxUpdates = BLOCK_UPDATES_PER_TICK_MAX;
            const maxFluidUpdates = FLUID_UPDATES_PER_TICK_MAX;
            // Reserved cap for redstone-style systems when enabled.
            const maxRedstoneUpdates = REDSTONE_UPDATES_PER_TICK_MAX;

            let updates = 0;
            let fluidUpdates = 0;
            let redstoneUpdates = 0;

            const startY = physicsCursorY;
            const bandHeight = 34;
            const endY = Math.min(CHUNK_HEIGHT - 2, startY + bandHeight);
            physicsCursorY = endY >= CHUNK_HEIGHT - 2 ? 1 : endY;

            for (let cx = centerCx - activeRadius; cx <= centerCx + activeRadius; cx++) {
                for (let cz = centerCz - activeRadius; cz <= centerCz + activeRadius; cz++) {
                    const group = chunks.get(`${cx},${cz}`);
                    if (!group) continue;
                    const data = group.userData.chunkData;

                   for (let y = endY; y >= startY && updates < maxUpdates; y--)
                        for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE && updates < maxUpdates; i++) {
                            const x = i % CHUNK_SIZE;
                            const z = (i * 7 + y * 3) % CHUNK_SIZE;
                            const idx = x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_HEIGHT;
                            const type = data[idx];
                            const isWater = type === 4 || (type >= 47 && type <= 53);
                            const isLava = type === 33 || (type >= 60 && type <= 66);
                            const isFluid = isWater || isLava;
                            const isSandLike = type === 7;
                            if (!isFluid && !isSandLike) continue;
                            if (isFluid && fluidUpdates >= maxFluidUpdates) continue;


                            const wx = cx * CHUNK_SIZE + x;
                            const wz = cz * CHUNK_SIZE + z;
                            const ctx = {
                                wx, wy: y, wz,
                                getBlock: getBlockType,
                                setBlock: (xw, yw, zw, nt) => setBlockTypeRaw(xw, yw, zw, nt, true),
                                swapBlocks: swapBlocksRaw,
                                gameTick: physicsTickCounter,
                                random: Math.random,
                            };

                           let changed = false;
                                
                                if (isWater) {
                                        changed = window.WaterPhysics.tryUpdate(ctx);
                                } else if (isLava) {
                                        changed = window.LavaPhysics.tryUpdate(ctx);
                                } else if (isSandLike) {
                                        changed = window.SandPhysics.tryUpdate(ctx);
                                }
                                if (changed) {
                                    updates++;
                                    if (isFluid) fluidUpdates++;
                                }

                                // Redstone budget hook (system may be absent in this build).
                                if (maxRedstoneUpdates > 0 && window.RedstoneSystem?.tryUpdate && redstoneUpdates < maxRedstoneUpdates) {
                                    const redChanged = window.RedstoneSystem.tryUpdate(ctx);
                                    if (redChanged) {
                                        updates++;
                                        redstoneUpdates++;
                                    }
                                }
                        }
                    }
                }
            }

        function modifyWorld(posVector, newType, options = {}) {
            const wx = Math.floor(posVector.x);
            const wy = Math.floor(posVector.y);
            const wz = Math.floor(posVector.z);

            const cx = Math.floor(wx / CHUNK_SIZE);
            const cz = Math.floor(wz / CHUNK_SIZE);
            const chunkId = `${cx},${cz}`;
            const group = chunks.get(chunkId);

            if (!group) return false;

            const lx = wx - cx * CHUNK_SIZE;
            const lz = wz - cz * CHUNK_SIZE;
            
            if (wy < 0 || wy >= CHUNK_HEIGHT) return false;

            const index = lx + wy * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT;
            const chunkData = group.userData.chunkData;
            
            const oldType = chunkData[index];
            
            if (newType === 0) {
                if (oldType === 0 || oldType === 4) return false;
                if (blockMaterials[oldType]?.unbreakable) return false;

                const shouldDrop = options.dropItems !== false;
                if (shouldDrop) {
                    const drop = PickaxeSystem.getDrop ? PickaxeSystem.getDrop(oldType) : { id: oldType, count: 1 };
                    if (drop && drop.id > 0 && drop.count > 0) addToInventory(drop.id, drop.count);
                }
                chunkData[index] = 0;
                emitBreakParticles(wx, wy, wz, 14, true);
            } else {
               
                if (oldType !== 0 && oldType !== 4) return false; 
                chunkData[index] = newType;
            }

            updateChunkHeightmapColumn(group, lx, lz);

            if (chunkData[index] === 0 && isChunkAllAir(chunkData)) {
                convertChunkToSparseAir(group);
                return true;
            }

            updateChunkAndNeighbors(group, lx, lz);
            return true;
        }

        // Bulk block update path (e.g. explosions): collect updates and enqueue remesh once.
        function modifyWorldBatch(positions, newType, options = {}) {
            if (!Array.isArray(positions) || positions.length === 0) return 0;
            let changed = 0;
            applyBlockUpdateBatch(() => {
                for (const pos of positions) {
                    if (!pos) continue;
                    if (modifyWorld(pos, newType, options)) changed++;
                }
            });
            return changed;
        }

    
        function getRiverMask(wx, wz) {
            if (worldGenerator) return worldGenerator.sampleRiverMask(wx, wz);
            return TerrainModules['river'].getMask({ perlin, wx, wz });
        }

        function getPlayerLiquidState() {
            const px = Math.floor(yawObject.position.x);
            const pz = Math.floor(yawObject.position.z);
            const feetY = Math.floor(yawObject.position.y + 0.1);
            const bodyY = Math.floor(yawObject.position.y + currentPlayerHeight * 0.5);
            const eyeY = Math.floor(yawObject.position.y + getPlayerEyeHeight());

            const feet = getBlockType(px, feetY, pz);
            const body = getBlockType(px, bodyY, pz);
            const eye = getBlockType(px, eyeY, pz);

            const feetLiquid = isLiquid(feet);
            const bodyLiquid = isLiquid(body);
            const eyeLiquid = isLiquid(eye);

            return {
                isInLiquid: feetLiquid || bodyLiquid,
                isUnderLiquid: eyeLiquid,
                feetBlock: feet,
                bodyBlock: body,
                eyeBlock: eye,
            };
        }

        function renderAirBubbles(isUnderLiquid) {
            const container = document.getElementById('air-container');
            if (!container) return;

            if (!isUnderLiquid && airState.value >= BREATH_MAX - 0.001) {
                container.style.display = 'none';
                container.innerHTML = '';
                return;
            }

            container.style.display = 'flex';
            container.innerHTML = '';

            const fullAirPath = ASSET_FILEPATHS.AIR_FULL || '';
            const popAirPath = ASSET_FILEPATHS.AIR_POP || fullAirPath;
            const goneAirPath = ASSET_FILEPATHS.AIR_GONE || fullAirPath;
            const maxBubbles = Math.ceil(BREATH_MAX / 2);
            const units = Math.max(0, Math.min(BREATH_MAX, Math.round(airState.value)));

            for (let i = 0; i < maxBubbles; i++) {
                const bubbleUnits = Math.max(0, Math.min(2, units - i * 2));
                const airImg = document.createElement('img');
                airImg.className = 'air-icon';

                if (bubbleUnits === 2) {
                    airImg.src = fullAirPath;
                    airImg.alt = 'Air Bubble';
                } else if (bubbleUnits === 1) {
                    if (airState.popTimerSec > 0) {
                        airImg.src = popAirPath;
                        airImg.alt = 'Air Pop';
                    } else {
                        airImg.src = goneAirPath;
                        airImg.alt = 'Air Empty';
                    }
                } else {
                    airImg.src = goneAirPath;
                    airImg.alt = 'Air Empty';
                }
                container.appendChild(airImg);
            }
        }

        function updateBreathing(dtSec, isUnderLiquid) {
            if (isUnderLiquid) {
                const before = airState.value;
                airState.value = Math.max(0, airState.value - BREATH_DRAIN_PER_SEC * dtSec);

                if (before > 1 && airState.value <= 1) {
                    airState.popTimerSec = AIR_POP_DURATION_SEC;
                }

                if (airState.value <= 0.001) {
                    airState.drownTimerSec += dtSec;
                    if (airState.drownTimerSec >= DROWN_DAMAGE_INTERVAL_SEC) {
                        airState.drownTimerSec = 0;
                        takeDamage(1);
                    }
                } else {
                    airState.drownTimerSec = 0;
                }
            } else {
                airState.value = Math.min(BREATH_MAX, airState.value + BREATH_REGEN_PER_SEC * dtSec);
                airState.drownTimerSec = 0;
            }

            if (airState.popTimerSec > 0) {
                airState.popTimerSec = Math.max(0, airState.popTimerSec - dtSec);
            }

            airState.wasUnderLiquid = isUnderLiquid;
            renderAirBubbles(isUnderLiquid);
        }

        function updatePlayerMovement() {
            if (!player.canMove || isInventoryOpen) return;

            // --- World Border Check ---
            const prevX = yawObject.position.x;
            const prevZ = yawObject.position.z;

            // Apply world movement
            const liquidState = getPlayerLiquidState();
            const isSwimming = liquidState.isInLiquid;
            player.isSwimming = isSwimming;

            player.direction.set(0, 0, 0);

            const walkForward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawObject.quaternion);
            const walkRight = new THREE.Vector3(1, 0, 0).applyQuaternion(yawObject.quaternion);
            walkForward.y = 0; walkForward.normalize();
            walkRight.y = 0; walkRight.normalize();

            const swimForward = camera.getWorldDirection(new THREE.Vector3()).normalize();
            const swimRight = new THREE.Vector3().crossVectors(swimForward, new THREE.Vector3(0, 1, 0));
            if (swimRight.lengthSq() > 0.0001) swimRight.normalize();

            const forward = isSwimming ? swimForward : walkForward;
            const right = isSwimming ? swimRight : walkRight;

            if (player.keys['w']) player.direction.add(forward);
            if (player.keys['s']) player.direction.sub(forward);
            if (player.keys['a']) player.direction.sub(right);
            if (player.keys['d']) player.direction.add(right);
            if (mobileControls.enabled) {
                player.direction.add(right.clone().multiplyScalar(mobileControls.moveX));
                player.direction.add(forward.clone().multiplyScalar(-mobileControls.moveY));
            }
            if (player.direction.lengthSq() > 0) player.direction.normalize();

            const isMoving = player.direction.lengthSq() > 0;
            player.isMoving = isMoving;

            const isSprinting = isMoving && (player.keys['e'] || mobileControls.sprint);
            const speedBoostMultiplier = (isSprinting && playerPrivileges.speed) ? 1.85 : 1;
            const isFlying = playerPrivileges.fly && isFlyActive;
            if (window.HungerSystem && !isFlying) {
                window.HungerSystem.update(performance.now(), { isMoving, isSprinting, isJumping: player.isJumping });
            }
            const hungerMultiplier = isFlying ? 1 : (window.HungerSystem ? window.HungerSystem.getSpeedMultiplier() : 1);

            if (isFlying) {
                const flySprintMultiplier = isSprinting ? (1.55 * speedBoostMultiplier) : speedBoostMultiplier;
                const flyBaseSpeed = player.baseMoveSpeed * 1.12 * flySprintMultiplier;
                player.moveSpeed = flyBaseSpeed;
                player.velocity.x = player.direction.x * player.moveSpeed;
                player.velocity.z = player.direction.z * player.moveSpeed;

                const flyUp = !!(player.keys[' '] || mobileControls.jump);
                const flyDown = !!player.keys['shift'];
                if (flyUp && !flyDown) {
                    player.velocity.y = FLY_VERTICAL_SPEED * (isSprinting ? flySprintMultiplier : 1);
                } else if (flyDown && !flyUp) {
                    player.velocity.y = -FLY_VERTICAL_SPEED * (isSprinting ? flySprintMultiplier : 1);
                } else {
                    player.velocity.y = 0;
                }
                player.isJumping = false;
            } else if (isSwimming) {
                const swimSprintMultiplier = isSprinting ? SWIM_SPRINT_MULTIPLIER : 1;
                player.moveSpeed = player.baseMoveSpeed * SWIM_SPEED_FACTOR * swimSprintMultiplier * hungerMultiplier;
                player.velocity.x = player.direction.x * player.moveSpeed;
                player.velocity.z = player.direction.z * player.moveSpeed;

                const swimUp = !!(player.keys[' '] || mobileControls.jump);
                const swimDown = !!player.keys['shift'];
                if (swimUp && !swimDown) {
                    player.velocity.y = SWIM_VERTICAL_SPEED;
                } else if (swimDown && !swimUp) {
                    player.velocity.y = -SWIM_VERTICAL_SPEED;
                } else {
                    player.velocity.y = SWIM_SINK_SPEED;
                }
                player.isJumping = false;
            } else {
                const sprintMultiplier = isSprinting ? player.sprintMultiplier * speedBoostMultiplier : 1;
                player.moveSpeed = player.baseMoveSpeed * sprintMultiplier * hungerMultiplier;
                player.velocity.x = player.direction.x * player.moveSpeed;
                player.velocity.z = player.direction.z * player.moveSpeed;
                player.velocity.y += GRAVITY;

                if ((player.keys[' '] || mobileControls.jump) && !player.isJumping) {
                    player.velocity.y = JUMP_POWER;
                    player.isJumping = true;
                }
            }


           
            yawObject.position.x += player.velocity.x;
            if (isColliding()) yawObject.position.x -= player.velocity.x;

           
            yawObject.position.z += player.velocity.z;
            if (isColliding()) yawObject.position.z -= player.velocity.z;

            yawObject.position.y += player.velocity.y;
            
            
            // --- World Border Enforcement ---
            let changedX = false;
            let changedZ = false;

            if (yawObject.position.x + PLAYER_RADIUS > WORLD_MAX_COORD) {
                yawObject.position.x = WORLD_MAX_COORD - PLAYER_RADIUS;
                changedX = true;
            } else if (yawObject.position.x - PLAYER_RADIUS < WORLD_MIN_COORD) {
                yawObject.position.x = WORLD_MIN_COORD + PLAYER_RADIUS;
                changedX = true;
            }
            if (yawObject.position.z + PLAYER_RADIUS > WORLD_MAX_COORD) {
                yawObject.position.z = WORLD_MAX_COORD - PLAYER_RADIUS;
                changedZ = true;
            } else if (yawObject.position.z - PLAYER_RADIUS < WORLD_MIN_COORD) {
                yawObject.position.z = WORLD_MIN_COORD + PLAYER_RADIUS;
                changedZ = true;
            }
            
            if (changedX || changedZ) {
                showGameMessage("The world ends here, L!");
                player.velocity.x = 0;
                player.velocity.z = 0;
            }
            // --- End World Border Enforcement ---
         
            if (player.velocity.y < -0.1 && !player.inAir) {
                player.inAir = true;
                player.fallStartY = yawObject.position.y;
            }

            if (isColliding()) {
                yawObject.position.y -= player.velocity.y; // Step back
                
              
                if (player.velocity.y < 0) {
                    player.isJumping = false;

                    const supportTop = findSupportingBlockTop(yawObject.position.x, yawObject.position.y, yawObject.position.z);
                    if (supportTop !== null) yawObject.position.y = supportTop;

                    if (player.inAir) {
                        const fallDist = player.fallStartY - yawObject.position.y;
                        if (fallDist > 4 && !player.isSwimming) { // 4 blocks safe fall
                            const dmg = Math.floor(fallDist - 3);
                            takeDamage(dmg);
                        }
                        player.inAir = false;
                    }

                    yawObject.position.y = Math.round(yawObject.position.y * 100) / 100;
                } else {
                   
                    player.velocity.y = 0;
                }
                player.velocity.y = 0;
            }
            
           
            if (yawObject.position.y < -10) {
                takeDamage(999);
                setInitialPlayerPosition();
                player.velocity.set(0,0,0);
            }
        }

        function takeDamage(amount) {
            player.health -= amount;
            if (player.health < 0) player.health = 0;
            renderHearts();
            showGameMessage(`Lol!! -${amount} HP`);
            
            if (player.health <= 0) {
                showGameMessage("YOU DIED! Skill issue...");
                setTimeout(() => {
                    player.health = player.maxHealth;
                    renderHearts();
                    setInitialPlayerPosition();
                    inventory = new Array(TOTAL_INV_SIZE).fill(null);
                    if (window.HungerSystem?.setValue) window.HungerSystem.setValue(20);
                    airState.value = BREATH_MAX;
                    airState.drownTimerSec = 0;
                    airState.popTimerSec = 0;
                    renderAirBubbles(false);
                    updateHotbarUI();
                }, 1000);
            }
        }

        function findSupportingBlockTop(px, py, pz) {
            const r = PLAYER_RADIUS;
            const minX = Math.floor(px - r);
            const maxX = Math.floor(px + r);
            const minY = Math.max(0, Math.floor(py) - 1);
            const maxY = Math.min(CHUNK_HEIGHT - 1, Math.floor(py + 0.6));
            const minZ = Math.floor(pz - r);
            const maxZ = Math.floor(pz + r);
            let bestTop = -Infinity;

            for (let x = minX; x <= maxX; x++) {
                for (let y = minY; y <= maxY; y++) {
                    for (let z = minZ; z <= maxZ; z++) {
                        const type = getBlockType(x, y, z);
                        if (!isSolid(type) || isLiquid(type)) continue;
                        const blockBox = getBlockWorldBox(x, y, z, type);
                        if (!blockBox) continue;
                        if (px + r <= blockBox.min.x || px - r >= blockBox.max.x) continue;
                        if (pz + r <= blockBox.min.z || pz - r >= blockBox.max.z) continue;
                        const top = blockBox.max.y;
                        if (top <= py + 0.2 && top > bestTop) bestTop = top;
                    }
                }
            }

            return Number.isFinite(bestTop) ? bestTop : null;
        }

        function isColliding() {
            if (playerPrivileges.noclip && playerPrivileges.fly && isFlyActive) return false;

            const px = yawObject.position.x;
            const py = yawObject.position.y;
            const pz = yawObject.position.z;
            const r = PLAYER_RADIUS;
            const h = currentPlayerHeight; 

            const playerBox = new THREE.Box3(
                new THREE.Vector3(px - r, py, pz - r),
                new THREE.Vector3(px + r, py + h, pz + r)
            );

            const minX = Math.floor(px - r);
            const maxX = Math.floor(px + r);
            const minY = Math.floor(py);
            const maxY = Math.floor(py + h);
            const minZ = Math.floor(pz - r);
            const maxZ = Math.floor(pz + r);

            for (let x = minX; x <= maxX; x++) {
                for (let y = minY; y <= maxY; y++) {
                    for (let z = minZ; z <= maxZ; z++) {
                        const type = getBlockType(x, y, z);
                        if (!isSolid(type)) continue;
                        const blockBox = getBlockWorldBox(x, y, z, type);
                        if (blockBox && playerBox.intersectsBox(blockBox)) return true;
                    }
                }
            }
            return false;
        }

        const BIOME_CLIMATE_TARGETS = BIOME_PROFILES
            .filter((profile) => profile.climateTarget)
            .map((profile) => ({ name: profile.name, ...profile.climateTarget }));

        function sampleClimateVector(wx, wz, y = SEA_LEVEL) {
            const rawTemp = octaveNoise3D(wx, y, wz, 3, 0.52, 2.0, 0.00048, -600, 170, 300);
            const rawHumidity = octaveNoise3D(wx, y, wz, 3, 0.55, 2.0, 0.00072, 320, -240, -130);
            return {
                // Boost climate spread so hot/cold and wet/dry zones actually form large regions.
                temp: Math.max(-1, Math.min(1, rawTemp * 2.1)),
                humidity: Math.max(-1, Math.min(1, rawHumidity * 2.0)),
                continentalness: octaveNoise3D(wx, y, wz, 3, 0.52, 2.0, 0.00145, 200, 90, 200),
                erosion: octaveNoise3D(wx, y, wz, 4, 0.5, 2.05, 0.0039, 180, -120, -90),
                weirdness: octaveNoise3D(wx, y, wz, 4, 0.5, 2.0, 0.0021, -510, 380, 140),
            };
        }

        function chooseBiomeByClimate(vec) {
            let best = 'Plains';
            let bestDist = Infinity;
            for (const t of BIOME_CLIMATE_TARGETS) {
                const dTemp = vec.temp - t.temp;
                const dHum = vec.humidity - t.humidity;
                const dCont = vec.continentalness - t.continentalness;
                const dEro = vec.erosion - t.erosion;
                const dWeird = vec.weirdness - t.weirdness;
                const dist = dTemp*dTemp + dHum*dHum + dCont*dCont + dEro*dEro + dWeird*dWeird;
                if (dist < bestDist) {
                    bestDist = dist;
                    best = t.name;
                }
            }
            return best;
        }


        function clamp01(v) { return Math.max(0, Math.min(1, v)); }
        function smoothstep(edge0, edge1, x) {
            if (edge0 === edge1) return x < edge0 ? 0 : 1;
            const t = clamp01((x - edge0) / (edge1 - edge0));
            return t * t * (3 - 2 * t);
        }
        function lerp(a, b, t) { return a + (b - a) * t; }
        function biomeWeights(wx, wz) {
            const tv = sampleTerrainVector(wx, wz);
            const climate = sampleClimateVector(wx, wz, SEA_LEVEL + 8);
            const mountainNoise = (Math.abs(octaveNoise2D(wx, wz, 3, 0.56, 2.0, 0.0013, -400, 750)) + 1) * 0.5;
            const continentalNoise = (tv.continentalness + 1) * 0.5;

            const oceanW = smoothstep(0.36, 0.02, continentalNoise);
            const mountainW = smoothstep(0.50, 0.80, mountainNoise) * smoothstep(0.34, 0.90, continentalNoise);
            const desertW = smoothstep(0.02, 0.48, climate.temp) * smoothstep(0.24, -0.30, climate.humidity) * smoothstep(0.30, 0.90, continentalNoise);
            const snowyW = smoothstep(-0.20, -0.64, climate.temp) * smoothstep(-0.18, 0.50, climate.humidity) * smoothstep(0.22, 0.86, continentalNoise) * (1 - mountainW * 0.70);
            const jungleHumidityW = smoothstep(0.30, 1.0, climate.humidity);
            const jungleTempW = smoothstep(0.55, 0.98, climate.temp);
            const jungleW = jungleHumidityW * jungleTempW * smoothstep(0.22, 0.92, continentalNoise) * (1 - mountainW * 0.55);
            const forestW = smoothstep(-0.12, 0.44, climate.humidity) * smoothstep(-0.28, 0.40, climate.temp) * (1 - desertW * 0.72) * (1 - jungleW * 0.7);
            const plainsW = (0.16 + smoothstep(0.14, 0.66, continentalNoise) * 0.14) * (1 - jungleW * 0.5);

            const adaptiveDesertFloor = climate.temp > 0.26 && climate.humidity < 0.12 ? 0.018 : 0;
            const adaptiveSnowyFloor = climate.temp < -0.30 ? 0.018 : 0;
            const adaptiveJungleFloor = climate.temp > 0.52 && climate.humidity > 0.40 ? 0.018 : 0;
            const desertBlendW = Math.max(desertW, adaptiveDesertFloor);
            const snowyBlendW = Math.max(snowyW, adaptiveSnowyFloor);
            const jungleBlendW = Math.max(jungleW, adaptiveJungleFloor);

            const total = oceanW + mountainW + desertBlendW + snowyBlendW + forestW + plainsW + jungleBlendW;
            if (total <= 0) {
                return {
                    tv,
                    climate,
                    weights: { Ocean: 0, Mountains: 0, Desert: 0, Forest: 0, 'Jungle Forest': 0, Plains: 1, 'Snowy Plains': 0 }
                };
            }

            return {
                tv,
                climate,
                weights: {
                    Ocean: oceanW / total,
                    Mountains: mountainW / total,
                    Desert: desertBlendW / total,
                    Forest: forestW / total,
                    'Jungle Forest': jungleBlendW / total,
                    Plains: plainsW / total,
                    'Snowy Plains': snowyBlendW / total,
                }
            };
        }

        function isOceanBiomeName(biomeName) {
            return Boolean(resolveBiomeProfile(biomeName)?.isOcean);
        }

        function getBiome(wx, wz) {
            if (worldGenerator) return worldGenerator.sampleBiome(wx, wz);

            const { climate, weights } = biomeWeights(wx, wz);
            if ((weights['Ocean'] || 0) > 0.68) {
                const coastalBand = (weights['Ocean'] || 0) < 0.84;
                if (coastalBand) return 'Coast Ocean';

                const temp = Number(climate.temp) || 0;
                if (temp >= 0.62) return 'Warm Ocean';
                if (temp >= 0.28) return 'Lukewarm Ocean';
                if (temp <= -0.60) return 'Frozen Ocean';
                if (temp <= -0.24) return 'Cold Ocean';
                return 'Ocean';
            }
            if ((weights['Mountains'] || 0) > 0.72) return 'Mountains';

            // Let every land biome compete directly from climate + weighted noise.
            // This removes spawn-band gating so hot/cold/wet/dry borders can touch naturally.
            let bestBiome = 'Plains';
            let bestScore = -Infinity;

            for (const target of BIOME_CLIMATE_TARGETS) {
                const dTemp = climate.temp - target.temp;
                const dHum = climate.humidity - target.humidity;
                const dCont = climate.continentalness - target.continentalness;
                const dEro = climate.erosion - target.erosion;
                const dWeird = climate.weirdness - target.weirdness;
                const climateDist = dTemp * dTemp + dHum * dHum + dCont * dCont + dEro * dEro + dWeird * dWeird;
                const score = -climateDist + (Number(weights[target.name] || 0) * 0.65);
                if (score > bestScore) {
                    bestScore = score;
                    bestBiome = target.name;
                }
            }

            return bestBiome;
        }

        function getRavineMask(wx, wz) {
            return window.UndergroundRavinesWorldgen?.getRavineMask?.({
                wx,
                wz,
                worldGenerator,
                perlin,
            });
        }

        function octaveNoise2D(x, z, octaves, persistence, lacunarity, scale, offsetX = 0, offsetZ = 0) {
            let amp = 1;
            let freq = 1;
            let sum = 0;
            let norm = 0;
            for (let i = 0; i < octaves; i++) {
                sum += perlin.noise2D((x + offsetX) * scale * freq, (z + offsetZ) * scale * freq) * amp;
                norm += amp;
                amp *= persistence;
                freq *= lacunarity;
            }
            return norm > 0 ? (sum / norm) : 0;
        }

        function octaveNoise3D(x, y, z, octaves, persistence, lacunarity, scale, offsetX = 0, offsetY = 0, offsetZ = 0) {
            let amp = 1;
            let freq = 1;
            let sum = 0;
            let norm = 0;
            for (let i = 0; i < octaves; i++) {
                sum += perlin.noise3D((x + offsetX) * scale * freq, (y + offsetY) * scale * freq, (z + offsetZ) * scale * freq) * amp;
                norm += amp;
                amp *= persistence;
                freq *= lacunarity;
            }
            return norm > 0 ? (sum / norm) : 0;
        }

        function hashRand2D(wx, wz, salt = 0) {
            if (worldGenerator) return worldGenerator.hashRand2D(wx, wz, salt);
            let h = (Math.imul(wx | 0, 374761393) ^ Math.imul(wz | 0, 668265263) ^ Math.imul((worldSeed + salt) | 0, 2246822519)) >>> 0;
            h = (h ^ (h >>> 13)) >>> 0;
            h = Math.imul(h, 1274126177) >>> 0;
            h = (h ^ (h >>> 16)) >>> 0;
            return h / 4294967296;
        }

        function sampleCaveShape(wx, y, wz) {
            return window.UndergroundCavesWorldgen?.sampleCaveShape?.({
                wx,
                y,
                wz,
                USE_WASM_CAVE_SAMPLING,
                wasmRuntime,
                CAVE_SCALE,
                perlin,
            });
        }

        function sampleTerrainVector(wx, wz) {
            // Multi-noise vector: continentalness/erosion/weirdness/humidity.
            const continentalness = octaveNoise2D(wx, wz, 3, 0.52, 2.0, 0.00145, 200, 200);
            const erosion = octaveNoise2D(wx, wz, 4, 0.5, 2.05, 0.0039, 180, -90);
            const weirdness = octaveNoise2D(wx, wz, 4, 0.5, 2.0, 0.0021, -510, 140);
            const humidity = octaveNoise2D(wx, wz, 3, 0.55, 2.0, 0.0011, 320, -130);
            const peaksValleys = 1 - Math.abs(weirdness);
            const ridges = Math.pow(Math.max(0, peaksValleys), 1.8);
            return { continentalness, erosion, weirdness, humidity, peaksValleys, ridges };
        }

        function getNoiseGroundHeight(wx, wz, biome, worldSample = null) {
            if (worldGenerator) return worldGenerator.getHeight(wx, wz, biome, worldSample);
            const tv = sampleTerrainVector(wx, wz);
            const biomeData = biomeWeights(wx, wz);
            const weights = biomeData.weights || {};
            const continentalMask = (tv.continentalness + 1) * 0.5;
            const terrainNoise = (perlin.noise2D(wx * 0.02, wz * 0.02) + 1) * 0.5;
            const detailNoise = (perlin.noise2D(wx * 0.045, wz * 0.045) + 1) * 0.5;
            const erosionNoise = (tv.erosion + 1) * 0.5;
            const peakNoise = Math.abs(perlin.noise2D(wx * 0.007 - 250, wz * 0.007 + 400));
            const jaggedNoise = Math.abs(octaveNoise2D(wx, wz, 5, 0.46, 2.25, 0.013, -1200, 950));
            const cliffNoise = Math.abs(perlin.noise2D(wx * 0.012 - 910, wz * 0.012 + 260));
            const deepNoise = (perlin.noise2D(wx * 0.01 - 200, wz * 0.01 + 430) + 1) * 0.5;
            const bigDuneNoise = (perlin.noise2D(wx * 0.016 + 15, wz * 0.016 - 15) + 1) * 0.5;
            const duneDetailNoise = (perlin.noise2D(wx * 0.038 + 120, wz * 0.038 - 70) + 1) * 0.5;
            const rockMaskNoise = (perlin.noise2D(wx * 0.009 - 510, wz * 0.009 + 230) + 1) * 0.5;

            const biomeHeights = {
                Ocean: TerrainModules['ocean'].getHeight({ SEA_LEVEL, deepNoise, terrainNoise }),
                Mountains: TerrainModules['mountains'].getHeight({
                    BASE_LAND_Y,
                    continentalness: tv.continentalness,
                    erosion: tv.erosion,
                    ridges: tv.ridges,
                    peaksValleys: tv.peaksValleys,
                    terrainNoise,
                    cliffNoise,
                    peakNoise,
                    jaggedNoise,
                }),
                Desert: TerrainModules['desert'].getHeight({ BASE_LAND_Y, continentalMask, bigDuneNoise, duneDetailNoise, rockMaskNoise }),
                'Snowy Plains': TerrainModules['snowyPlains'].getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }),
                Forest: TerrainModules['oakForest'].getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }),
                'Jungle Forest': TerrainModules['jungleForest'].getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }),
                Plains: TerrainModules['plains'].getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }),
            };

            let blendedHeight = 0;
            let blendedWeight = 0;
            for (const [name, weight] of Object.entries(weights)) {
                const w = Number(weight) || 0;
                if (w <= 0) continue;
                const hBiome = biomeHeights[name];
                if (!Number.isFinite(hBiome)) continue;
                blendedHeight += hBiome * w;
                blendedWeight += w;
            }
            if (blendedWeight <= 0) {
                blendedHeight = biomeHeights.Plains;
                blendedWeight = 1;
            } else {
                blendedHeight /= blendedWeight;
            }

            const selectedBiomeHeight = biomeHeights[biome] ?? blendedHeight;
            const selectedBiomeWeight = clamp01(Number(weights[biome] || 0));
            const dominantBlend = 0.35 + selectedBiomeWeight * 0.45;
            let h = lerp(blendedHeight, selectedBiomeHeight, dominantBlend);

            const mountainWeight = Number(weights['Mountains'] || 0);
            h += detailNoise * (0.36 + mountainWeight * 0.64);

            const riverInfluence = getRiverMask(wx, wz);
            h = TerrainModules['river'].applyHeight({ height: h, riverInfluence, SEA_LEVEL });

            const ravine = getRavineMask(wx, wz);
            const oceanWeight = Number(weights['Ocean'] || 0);
            if (ravine > 0.84 && oceanWeight < 0.72) h -= (ravine - 0.84) * 55;

            if (mountainWeight > 0.52 && h < SEA_LEVEL + 8) h = SEA_LEVEL + 8;
            if (h < SEA_LEVEL - 6 && oceanWeight < 0.52) h = SEA_LEVEL - 6;
            return Math.floor(h);
        }


        function getBlockType(wx, wy, wz) {
            if (wy < 0 || wy >= CHUNK_HEIGHT) return 0;
            const cx = Math.floor(wx / CHUNK_SIZE);
            const cz = Math.floor(wz / CHUNK_SIZE);
            const id = `${cx},${cz}`;
            if (chunks.has(id)) {
                const group = chunks.get(id);
                const lx = wx - group.userData.cx * CHUNK_SIZE;
                const lz = wz - group.userData.cz * CHUNK_SIZE;
                return group.userData.chunkData[lx + wy * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT];
            }
            if (sparseAirChunkKeys.has(id)) return 0;
            
            // For blocks outside loaded chunks but inside the boundary, use noise (Fallback)
            const biome = getBiome(wx, wz); // Calculate biome for fallback
            const h = getNoiseGroundHeight(wx, wz, biome); 
            if (wy === 0) return 14;
            if (wy < h) {
                if (biome === 'Desert') return 7;
                if (biome === 'Snowy Plains') return wy >= h - 1 ? 15 : 59;
                if (biome === 'Mountains') {
                    if (wy >= h - 1 && h > SEA_LEVEL + 16) return 15;
                    return 3;
                }
                return wy >= h - 1 ? 1 : (wy >= h - 4 ? 2 : 3);
            }
            if (wy < SEA_LEVEL) return 4;
            return 0;
        }

       

        function setupInputModeChooser() {
            return mobileDeviceControls?.setupInputModeChooser?.() || undefined;
        }

        function setMobileHudVisible(visible) {
            return mobileDeviceControls?.setMobileHudVisible?.(visible) || undefined;
        }

        function switchToDesktopMode() {
            return mobileDeviceControls?.switchToDesktopMode?.() || undefined;
        }

        function setupMobileControls() {
            return mobileDeviceControls?.setupMobileControls?.() || undefined;
        }

        function setupPointerLockControls() {
            return pcDeviceControls?.setupPointerLockControls?.() || undefined;
        }

        function ensureSteveSkinTextureLoaded() {
            return defaultPlayerSkin?.ensureSteveSkinTextureLoaded?.() || Promise.resolve(false);
        }

        function getSteveSkinTexture() {
            return defaultPlayerSkin?.getSteveSkinTexture?.() || null;
        }

        function getPlayerAssetCandidates(fileName) {
            return defaultPlayerSkin?.getPlayerAssetCandidates?.(fileName) || [];
        }

        function getPreferredPlayerAssetPath(fileName) {
            return defaultPlayerSkin?.getPreferredPlayerAssetPath?.(fileName) || '';
        }

        function createSkinFaceTexture(rect) {
            return defaultPlayerSkin?.createSkinFaceTexture?.(rect) || null;
        }

        function isModernSkinLayout() {
            return defaultPlayerSkin?.isModernSkinLayout?.() || false;
        }

        function buildPartFaceRects(x, y, w, h, d) {
            return defaultPlayerSkin?.buildPartFaceRects?.(x, y, w, h, d) || null;
        }

        function getSkinPartRects(partName, overlay = false) {
            return defaultPlayerSkin?.getSkinPartRects?.(partName, overlay) || null;
        }

        function createStevePartMesh(dim, faceRects, overlayFaceRects = null) {
            return defaultPlayerSkin?.createStevePartMesh?.(dim, faceRects, overlayFaceRects) || null;
        }

        function setupFirstPersonHandOverlay() {
            defaultPlayerSkin?.setupFirstPersonHandOverlay?.();
        }

        function setupInventorySkinRig() {
            defaultPlayerSkin?.setupInventorySkinRig?.();
        }

        function updateFirstPersonHand(time) {
            defaultPlayerSkin?.updateFirstPersonHand?.(time);
        }

        function createPlayerAvatar() {
            return defaultPlayerSkin?.createPlayerAvatar?.() || new THREE.Group();
        }

        function applyCameraMode() {
            defaultPlayerSkin?.applyCameraMode?.();
        }

        function toggleCameraViewMode() {
            defaultPlayerSkin?.toggleCameraViewMode?.();
        }

        function updatePlayerAvatarVisuals(time) {
            defaultPlayerSkin?.updatePlayerAvatarVisuals?.(time);
        }

        function toggleInventorySkinPreview() {
            defaultPlayerSkin?.toggleInventorySkinPreview?.();
        }

        function updateSkinPreviewLook(clientX, clientY) {
            defaultPlayerSkin?.updateSkinPreviewLook?.(clientX, clientY);
        }

        function setupKeyboardControls() {
            document.addEventListener('keydown', e => {
                const k = e.key.toLowerCase();
                if (k === 'y' || k === 'i') {
                    if (isCreativeMenuOpen) {
                        closeCreativeMenu();
                    } else {
                        toggleInventory();
                    }
                    return;
                }
                if (k === 'escape' && isInventoryOpen) {
                    if (isCreativeMenuOpen) closeCreativeMenu();
                    else toggleInventory();
                    return;
                }
                if (k === 'c') {
                    toggleCameraViewMode();
                    return;
                }
                if (k === 't') {
                    e.preventDefault();
                    window.SingleplayerChat?.toggle?.();
                    return;
                }
                if (k === ' ' && playerPrivileges.fly && !isInventoryOpen && !window.SingleplayerChat?.isOpen?.() && !e.repeat) {
                    const now = Date.now();
                    if (now - lastSpaceTapAt <= 280) {
                        isFlyActive = !isFlyActive;
                        player.velocity.y = 0;
                        player.isJumping = false;
                        showGameMessage(isFlyActive ? 'Flying enabled.' : 'Flying disabled.');
                        lastSpaceTapAt = 0;
                    } else {
                        lastSpaceTapAt = now;
                    }
                }
                if (window.SingleplayerChat?.isOpen?.()) {
                    return;
                }
                if (!isInventoryOpen) {
                    player.keys[k] = true;
                    if (k >= '1' && k <= '9') {
                        selectedHotbarIndex = parseInt(k) - 1;
                        updateHotbarUI();
                    }
                }
            });
            document.addEventListener('keyup', e => player.keys[e.key.toLowerCase()] = false);
        }


        function getTreeSpawnChanceForBiome(biomeName, topY) {
            const map = worldGenSettings.treeDensityByBiome || {};
            const profile = resolveBiomeProfile(biomeName);
            const rawName = String(biomeName || profile?.name || 'Plains');
            const densityKeys = [rawName, profile?.name, profile?.terrainKey, profile?.treeDensityKey].filter(Boolean);
            let baseChance = Number.NaN;
            for (const key of densityKeys) {
                baseChance = Number(map[key]);
                if (Number.isFinite(baseChance)) break;
            }
            if (!Number.isFinite(baseChance)) baseChance = Number(profile?.treeSpawnChance);
            if (!Number.isFinite(baseChance)) baseChance = Number(map.Plains ?? 0.06);
            let adjusted = baseChance;
            if (topY > SEA_LEVEL + 26) adjusted *= 0.7;
            if (topY < SEA_LEVEL + 2) adjusted *= 0.5;
            return Math.max(0, Math.min(0.45, adjusted));
        }

        function isTreeBiome(biomeName) {
            return Boolean(resolveBiomeProfile(biomeName)?.treeEligible);
        }

        function hasNearbyTreeTrunk(data, x, z, radius) {
            for (let ox = -radius; ox <= radius; ox++) {
                for (let oz = -radius; oz <= radius; oz++) {
                    if (ox === 0 && oz === 0) continue;
                    const tx = x + ox;
                    const tz = z + oz;
                    if (tx < 0 || tx >= CHUNK_SIZE || tz < 0 || tz >= CHUNK_SIZE) continue;
                    for (let y = CHUNK_HEIGHT - 2; y >= 1; y--) {
                        const idx = tx + y * CHUNK_SIZE + tz * CHUNK_SIZE * CHUNK_HEIGHT;
                        const block = data[idx];
                        if (block === 5 || block === 96) return true;
                        if (block !== 0 && block !== 6 && block !== 97) break;
                    }
                }
            }
            return false;
        }


        function resolveMinecraftLikeTreeProfile(treeStyle = 'oak') {
            const oakProfile = window.OakTreeGeneration?.resolveOakTreeProfile?.(treeStyle);
            if (oakProfile) return oakProfile;
            if (treeStyle === 'jungle_large') return window.JungleLargeTree || null;
            if (treeStyle === 'jungle_small') return window.JungleSmallTree || null;
            return null;
        }

        function chooseJungleTreeProfile({ topY, wx, wz, seaLevel, hashRand2D }) {
            const useLarge = hashRand2D(wx, wz, 911) < 0.1;
            const profile = resolveMinecraftLikeTreeProfile(useLarge ? 'jungle_large' : 'jungle_small');
            if (!profile?.trunkHeight) return null;
            return {
                style: profile.style,
                trunkHeight: profile.trunkHeight({ topY, wx, wz, seaLevel, hashRand2D }),
            };
        }

        function getMinecraftLikeTreeLayout(treeStyle, relY) {
            const profile = resolveMinecraftLikeTreeProfile(treeStyle);
            if (!profile?.canopyRadius) return null;
            return {
                radius: profile.canopyRadius(relY),
                trunkOffsets: profile.trunkOffsets || [{ x: 0, z: 0 }],
                crownRadius: Number.isFinite(profile.crownRadius) ? profile.crownRadius : 0,
            };
        }

        function canPlaceMinecraftLikeTree(data, x, z, topY, trunkHeight, treeStyle = 'oak') {
            if (x < 2 || x > CHUNK_SIZE - 3 || z < 2 || z > CHUNK_SIZE - 3) return false;
            const trunkTopY = topY + trunkHeight;
            if (trunkTopY + 2 >= CHUNK_HEIGHT) return false;

            // Trunk clearance: validate every trunk column.
            const trunkOffsets = treeStyle === 'jungle_mountain' ? [{ x: 0, z: 0 }] : getMinecraftLikeTreeLayout(treeStyle, 0).trunkOffsets;
            for (let y = topY + 1; y <= trunkTopY; y++) {
                for (const offset of trunkOffsets) {
                    const tx = x + offset.x;
                    const tz = z + offset.z;
                    if (tx < 0 || tx >= CHUNK_SIZE || tz < 0 || tz >= CHUNK_SIZE) return false;
                    const idx = tx + y * CHUNK_SIZE + tz * CHUNK_SIZE * CHUNK_HEIGHT;
                    const b = data[idx];
                    if (b !== 0 && b !== 6 && b !== 97) return false;
                }
            }

            // Crown clearance: validate just the canopy layers that we actually place.
            for (let y = trunkTopY - 2; y <= trunkTopY + 1; y++) {
                if (y < 1 || y >= CHUNK_HEIGHT) continue;
                const rel = y - trunkTopY;
                const radius = treeStyle === 'jungle_mountain'
                    ? (rel >= 1 ? 2 : (rel === 0 ? 3 : (rel === -1 ? 3 : 2)))
                    : getMinecraftLikeTreeLayout(treeStyle, rel).radius;
                for (let ox = -radius; ox <= radius; ox++) {
                    for (let oz = -radius; oz <= radius; oz++) {
                        const tx = x + ox;
                        const tz = z + oz;
                        if (tx < 0 || tx >= CHUNK_SIZE || tz < 0 || tz >= CHUNK_SIZE) return false;
                        const idx = tx + y * CHUNK_SIZE + tz * CHUNK_SIZE * CHUNK_HEIGHT;
                        const b = data[idx];
                        if (b !== 0 && b !== 6 && b !== 97) return false;
                    }
                }
            }

            const crownIdx = x + (trunkTopY + 2) * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_HEIGHT;
            const crownBlock = data[crownIdx];
            return crownBlock === 0 || crownBlock === 6 || crownBlock === 97;
        }

        function placeMinecraftLikeTree(data, x, z, topY, trunkHeight, wx, wz, treeStyle = 'oak') {
            const trunkTopY = topY + trunkHeight;
            const treeProfile = treeStyle === 'jungle_mountain' ? null : resolveMinecraftLikeTreeProfile(treeStyle);
            const trunkType = treeStyle === 'glass_mushroom' ? 80 : (treeProfile?.trunkBlockId ?? 5);
            const leafType = treeStyle === 'glass_mushroom' ? 26 : (treeProfile?.leafBlockId ?? 6);
            const trunkOffsets = treeStyle === 'jungle_mountain' ? [{ x: 0, z: 0 }] : (treeProfile?.trunkOffsets || getMinecraftLikeTreeLayout(treeStyle, 0)?.trunkOffsets || [{ x: 0, z: 0 }]);
            for (let i = 1; i <= trunkHeight; i++) {
                const ty = topY + i;
                for (const offset of trunkOffsets) {
                    const tx = x + offset.x;
                    const tz = z + offset.z;
                    if (tx < 0 || tx >= CHUNK_SIZE || tz < 0 || tz >= CHUNK_SIZE) continue;
                    const idx = tx + ty * CHUNK_SIZE + tz * CHUNK_SIZE * CHUNK_HEIGHT;
                    data[idx] = trunkType;
                }
            }

            for (let y = trunkTopY - 2; y <= trunkTopY + 1; y++) {
                if (y < 1 || y >= CHUNK_HEIGHT) continue;
                const rel = y - trunkTopY;
                const radius = treeStyle === 'jungle_mountain'
                    ? (rel >= 1 ? 2 : (rel === 0 ? 3 : (rel === -1 ? 3 : 2)))
                    : getMinecraftLikeTreeLayout(treeStyle, rel).radius;
                for (let ox = -radius; ox <= radius; ox++) {
                    for (let oz = -radius; oz <= radius; oz++) {
                        if (Math.abs(ox) === radius && Math.abs(oz) === radius && hashRand2D(wx + ox * 31, wz + oz * 17 + y * 7, 611) < 0.35) continue;
                        const tx = x + ox;
                        const tz = z + oz;
                        if (tx < 0 || tx >= CHUNK_SIZE || tz < 0 || tz >= CHUNK_SIZE) continue;
                        const idx = tx + y * CHUNK_SIZE + tz * CHUNK_SIZE * CHUNK_HEIGHT;
                        if (data[idx] === 0) data[idx] = leafType;
                    }
                }
            }

            const crownRadius = treeStyle === 'jungle_mountain'
                ? 0
                : (treeProfile?.crownRadius ?? getMinecraftLikeTreeLayout(treeStyle, 0)?.crownRadius ?? 0);
            const crownY = trunkTopY + 2;
            if (crownY < CHUNK_HEIGHT) {
                for (let ox = -crownRadius; ox <= crownRadius; ox++) {
                    for (let oz = -crownRadius; oz <= crownRadius; oz++) {
                        const tx = x + ox;
                        const tz = z + oz;
                        if (tx < 0 || tx >= CHUNK_SIZE || tz < 0 || tz >= CHUNK_SIZE) continue;
                        const crownIdx = tx + crownY * CHUNK_SIZE + tz * CHUNK_SIZE * CHUNK_HEIGHT;
                        if (data[crownIdx] === 0) data[crownIdx] = leafType;
                    }
                }
            }
        }
        
        const oakTreeDecoration = window.OakTreeGeneration?.createOakTreeDecoration?.({
            isTreeBiome,
            getTreeSpawnChanceForBiome,
            hasNearbyTreeTrunk,
            chooseJungleTreeProfile,
            canPlaceMinecraftLikeTree,
            placeMinecraftLikeTree,
            seaLevel: SEA_LEVEL,
            chunkHeight: CHUNK_HEIGHT,
        });

        function generateChunkData(cx, cz) {
             const data = new Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
             const spawnedGnomes = [];
             const fallbackTreeCandidates = [];
             let treesPlacedInChunk = 0;
             
             for (let x = 0; x < CHUNK_SIZE; x++) {
                 for (let z = 0; z < CHUNK_SIZE; z++) {
                     const wx = cx * CHUNK_SIZE + x;
                     const wz = cz * CHUNK_SIZE + z;
                     
                     // Phase 1: biome map template + macro height outline
                     const worldSample = worldGenerator ? worldGenerator.sample(wx, wz) : null;
                     const biome = worldSample ? (worldSample.gameplayBiome || worldSample.biome) : getBiome(wx, wz);
                     const h = getNoiseGroundHeight(wx, wz, biome, worldSample);

                     const riverInfluence = worldSample ? worldSample.riverMask : getRiverMask(wx, wz);
                     const isFrozenRiver = !!worldSample && (worldSample.biome === 'Frozen River' || worldSample.tempBand === (window.WorldgenLayers?.Constants?.FREEZING ?? 13));
                     const RIVER_WIDTH_THRESHOLD = 0.1;
                     const isRiver = !worldSample?.noRiver && riverInfluence > RIVER_WIDTH_THRESHOLD;
                     const isOcean = isOceanBiomeName(biome);
                     const hasAquaticFloor = isRiver || isOcean;
                     const gravelPatchNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.08, 1642, 977);
                     const hasGravelPatch = hasAquaticFloor && gravelPatchNoise > 0.58;
                     const isWarmOcean = biome === 'Warm Ocean';
                     const isColdOcean = biome === 'Cold Ocean';
                     const isCoastOcean = biome === 'Coast Ocean';
                     const ravineProfile = window.UndergroundRavinesWorldgen?.createRavineColumnProfile?.({
                        wx,
                        wz,
                        surfaceHeight: h,
                        getRavineMask,
                        RAVINE_SURFACE_SAFETY_DEPTH,
                        RAVINE_ACTIVATION_THRESHOLD,
                        CHUNK_HEIGHT,
                     }) || { canCarveRavine: false, ravineStrength: 0, ravineTop: 0, ravineBottom: 0, ravineMask: 0, ravineMaxDepth: 0 };
                     for (let y = 0; y < CHUNK_HEIGHT; y++) {
                         let t = 0; // Block type

                         if (y === 0) {
                             t = 14; // Bedrock floor
                             data[x + y*CHUNK_SIZE + z*CHUNK_SIZE*CHUNK_HEIGHT] = t;
                             continue;
                         }

                         if (y < h) {
                            const distFromSurface = h - 1 - y;

                            if (worldGenerator?.terrain?.surfaceBlockForBiome) {
                                t = worldGenerator.terrain.surfaceBlockForBiome(biome, y, h, SEA_LEVEL);
                            } else if (biome === 'Desert') {
                                t = distFromSurface < 5 ? 7 : 13;
                            } else if (biome === 'Snowy Plains') {
                                t = distFromSurface === 0 ? 15 : 59;
                            } else if (biome === 'Mountains') {
                                t = distFromSurface === 0 && h > SEA_LEVEL + 20 ? 15 : 3;
                            } else {
                                const isBeachZone = h >= SEA_LEVEL - 1 && h <= SEA_LEVEL + 2;
                                if (distFromSurface === 0) t = isBeachZone ? 7 : 1;
                                else if (distFromSurface < 4) t = isBeachZone ? 7 : 2;
                                else t = 3;
                            }

                            if (biome === 'Mountains' && t !== 0) {
                                // Keep mountain silhouettes rugged, but avoid swiss-cheese cliff faces.
                                const ridgeRough = Math.abs(perlin.noise3D(wx * 0.017 + 310, y * 0.024, wz * 0.017 - 145));
                                const microBreak = Math.abs(perlin.noise3D(wx * 0.035 - 980, y * 0.045, wz * 0.035 + 410));
                                const carvingBand = distFromSurface >= 3 && distFromSurface <= 9;
                                const shouldCarve = carvingBand && ridgeRough > 0.92 && microBreak > 0.9;
                                if (shouldCarve) t = 0;
                            }
                             
                            // --- OCEAN/RIVER BED OVERRIDE ---
                            if (hasAquaticFloor && y < SEA_LEVEL - 1) {
                                // Ocean floor material profile by biome:
                                // - Coast Ocean: sand
                                // - Cold Ocean: gravel
                                // - Warm Ocean: sand with gravel patches
                                // Rivers/default oceans keep a sandy cap over stone.
                                if (isColdOcean) {
                                    t = 28;
                                } else if (isCoastOcean) {
                                    t = 7;
                                } else if (isWarmOcean) {
                                    if (distFromSurface <= 1) t = hasGravelPatch ? 28 : 7;
                                    else if (distFromSurface < 3) t = hasGravelPatch ? 28 : 7;
                                    else t = 3;
                                } else if (distFromSurface === 0) {
                                    t = hasGravelPatch ? 28 : 7;
                                } else if (distFromSurface < 3) {
                                    t = hasGravelPatch && distFromSurface < 2 ? 28 : 7;
                                } else {
                                    t = 3;
                                }
                            }
                            
                         } else if (y < SEA_LEVEL) {
                             t = 0; // Start as air above the land height
                             
                             // --- WATER FILLING ---
                             if (isRiver) {
                                 t = isFrozenRiver ? 59 : 4; // River water / ice
                             } 
                             // If it's the ocean biome, fill the area above ground and below sea level with water
                             else if (isOcean) {
                                 t = 4;
                             }
                             // Otherwise (on dry land, above h, below sea level, not river) it remains air (t=0)
                         }
                         
                        t = window.UndergroundCavesWorldgen?.carveBlock?.({
                            blockId: t,
                            wx,
                            y,
                            wz,
                            surfaceHeight: h,
                            perlin,
                            CAVE_SCALE,
                            CAVE_THRESHOLD,
                            CAVE_MIN_Y,
                            CAVE_MAX_Y_OFFSET,
                            CAVE_SURFACE_SAFETY_DEPTH,
                            sampleCaveShape,
                        }) ?? t;
                         
                         
                        t = window.UndergroundRavinesWorldgen?.applyRavineBlock?.({
                            blockId: t,
                            y,
                            ravineProfile,
                            wx,
                            wz,
                            octaveNoise2D,
                            SEA_LEVEL,
                        }) ?? t;

                        t = window.UndergroundOresWorldgen?.applyOrePasses?.({
                            blockId: t,
                            wx,
                            y,
                            wz,
                            surfaceHeight: h,
                            CHUNK_HEIGHT,
                            hashRand2D,
                            octaveNoise2D,
                        }) ?? t;

                         data[x + y*CHUNK_SIZE + z*CHUNK_SIZE*CHUNK_HEIGHT] = t;
                     }
                  
                     // --- Tree Generation (Minecraft-like oaks on natural low/mid elevations) ---
                     if (oakTreeDecoration?.tryGenerateTreeAtColumn?.({
                         data,
                         x,
                         z,
                         wx,
                         wz,
                         biome,
                         isRiver,
                         riverInfluence,
                         worldGenSettings,
                         seaLevel: SEA_LEVEL,
                         chunkSize: CHUNK_SIZE,
                         chunkHeight: CHUNK_HEIGHT,
                         octaveNoise2D,
                         hashRand2D,
                         fallbackTreeCandidates
                     })) {
                         treesPlacedInChunk++;
                     }
                 }
             }
             const chunkCenterBiome = getBiome(cx * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2), cz * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2));
             const minimumTreesForChunk = chunkCenterBiome === 'Jungle Forest' ? 5 : (chunkCenterBiome === 'Forest' ? 2 : 0);
             while (treesPlacedInChunk < minimumTreesForChunk) {
                 const placedFallbackTree = oakTreeDecoration?.placeFallbackTree?.({
                     data,
                     cx,
                     cz,
                     fallbackTreeCandidates,
                     hashRand2D,
                     chunkSize: CHUNK_SIZE,
                     chunkHeight: CHUNK_HEIGHT
                 });
                 if (!placedFallbackTree) break;
                 treesPlacedInChunk++;
             }

             placeAmethystGeodesInChunk(data, cx, cz);
             const heightmap = buildChunkHeightmap(data);
             const spawnedPigs = [];
             const spawnedWolves = [];
             const spawnedPandas = [];
             const spawnedVillagers = [];
             window.SnowyPlainsWorldgen?.placeIglooInChunk?.({
                 data,
                 cx,
                 cz,
                 spawnedGnomes,
                 hashRand2D,
                 getBiome,
                 iglooStructureDef,
                 CHUNK_SIZE,
                 CHUNK_HEIGHT,
                 SEA_LEVEL
             });
             const placedVillage = placeVillageInChunk(data, cx, cz, spawnedVillagers);
             placeRuinsInChunk(data, cx, cz);
             if (!placedVillage) {
                 window.DesertWorldgen?.placeDesertWellInChunk?.({
                     data,
                     cx,
                     cz,
                     spawnedPigs,
                     hashRand2D,
                     getBiome,
                     CHUNK_SIZE,
                     CHUNK_HEIGHT,
                     SEA_LEVEL
                 });
             }
             window.OakForestWorldgen?.placeWolfPackInChunk?.({
                 data,
                 heightmap,
                 cx,
                 cz,
                 spawnedWolves,
                 hashRand2D,
                 getBiome,
                 CHUNK_SIZE,
                 CHUNK_HEIGHT,
                 SEA_LEVEL
             });
             window.JungleForestWorldgen?.placePandaPackInChunk?.({
                 data,
                 heightmap,
                 cx,
                 cz,
                 spawnedPandas,
                 hashRand2D,
                 getBiome,
                 CHUNK_SIZE,
                 CHUNK_HEIGHT,
                 SEA_LEVEL
             });
             window.JungleForestWorldgen?.placeBambooInChunk?.({
                 data,
                 cx,
                 cz,
                 hashRand2D,
                 getBiome,
                 hasNearbyTreeTrunk,
                 CHUNK_SIZE,
                 CHUNK_HEIGHT,
                 SEA_LEVEL
             });
             placePumpkinPatchInChunk(data, cx, cz);
             window.JungleForestWorldgen?.placeMelonsInChunk?.({
                 data,
                 cx,
                 cz,
                 hashRand2D,
                 getBiome,
                 worldGenSettings,
                 CHUNK_SIZE,
                 CHUNK_HEIGHT,
                 SEA_LEVEL
             });
             window.SideFloraWorldgen?.placeFlowerPatchesInChunk?.({
                 data,
                 cx,
                 cz,
                 hashRand2D,
                 getBiome,
                 blockMaterials,
                 CHUNK_SIZE,
                 CHUNK_HEIGHT,
             });
             return { data, heightmap, spawnedGnomes, spawnedPigs, spawnedWolves, spawnedPandas, spawnedVillagers };
        }


        function placeVillageInChunk(data, cx, cz, spawnedVillagers = []) {
            const vg = window.VillageGeneration || {};
            if (!vg.getVillageRegionCandidate) return false;

            const regionSize = Number(vg.DEFAULT_STRUCTURE_REGION_SIZE) || 384;
            const chance = Number(vg.DEFAULT_VILLAGE_CHANCE_PER_REGION) || 0.36;
            const pathHalfLen = 96;
            const chunkMinX = cx * CHUNK_SIZE;
            const chunkMinZ = cz * CHUNK_SIZE;
            const chunkMaxX = chunkMinX + CHUNK_SIZE - 1;
            const chunkMaxZ = chunkMinZ + CHUNK_SIZE - 1;
            const influenceRadius = pathHalfLen + 80;

            const regionMinX = Math.floor((chunkMinX - influenceRadius) / regionSize);
            const regionMaxX = Math.floor((chunkMaxX + influenceRadius) / regionSize);
            const regionMinZ = Math.floor((chunkMinZ - influenceRadius) / regionSize);
            const regionMaxZ = Math.floor((chunkMaxZ + influenceRadius) / regionSize);

            const idx = (lx, ly, lz) => lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT;
            const getColumnTop = (lx, lz) => {
                for (let y = CHUNK_HEIGHT - 2; y >= 1; y--) {
                    const topBlock = data[idx(lx, y, lz)];
                    if (topBlock !== 0 && topBlock !== 4) return y;
                }
                return -1;
            };

            const placedVillages = new Set();
            let placedAny = false;

            const DIR_VECTORS = {
                N: { dx: 0, dz: -1 },
                S: { dx: 0, dz: 1 },
                E: { dx: 1, dz: 0 },
                W: { dx: -1, dz: 0 }
            };

            const OPPOSITE_DIR = { N: 'S', S: 'N', E: 'W', W: 'E' };

            function isWaterType(t) {
                return t === 4 || t === 47 || t === 48;
            }

            function setSurfaceBlock(wx, wz, blockId) {
                if (wx < chunkMinX || wx > chunkMaxX || wz < chunkMinZ || wz > chunkMaxZ) return;
                const lx = wx - chunkMinX;
                const lz = wz - chunkMinZ;
                const top = getColumnTop(lx, lz);
                if (top < 1 || top >= CHUNK_HEIGHT - 2) return;
                data[idx(lx, top, lz)] = blockId;
            }

            function placeSolid(wx, wy, wz, blockId) {
                if (wx < chunkMinX || wx > chunkMaxX || wz < chunkMinZ || wz > chunkMaxZ) return;
                if (wy < 1 || wy >= CHUNK_HEIGHT - 1) return;
                const lx = wx - chunkMinX;
                const lz = wz - chunkMinZ;
                data[idx(lx, wy, lz)] = blockId;
            }

            function getGroundYAt(wx, wz) {
                if (wx < chunkMinX || wx > chunkMaxX || wz < chunkMinZ || wz > chunkMaxZ) return null;
                const lx = wx - chunkMinX;
                const lz = wz - chunkMinZ;
                const top = getColumnTop(lx, lz);
                return top > 0 ? top : null;
            }

            function getSurfaceTypeAt(wx, wz) {
                const gy = getGroundYAt(wx, wz);
                if (!Number.isFinite(gy)) return null;
                if (wx < chunkMinX || wx > chunkMaxX || wz < chunkMinZ || wz > chunkMaxZ) return null;
                const lx = wx - chunkMinX;
                const lz = wz - chunkMinZ;
                return data[idx(lx, gy, lz)] ?? null;
            }

            function asPathKey(wx, wz) {
                return `${wx},${wz}`;
            }

            function parsePathKey(key) {
                const [x, z] = String(key).split(',').map((n) => Number(n));
                return { x, z };
            }

            function seedRand01(seedA, seedB, salt) {
                return hashRand2D(seedA * 131 + salt * 17, seedB * 97 - salt * 23, 29000 + salt);
            }

            function getConnectorPoint(centerX, centerZ, size, dir) {
                const half = Math.floor(size / 2);
                const v = DIR_VECTORS[dir] || DIR_VECTORS.N;
                return {
                    x: centerX + v.dx * (half + 1),
                    z: centerZ + v.dz * (half + 1),
                    dir
                };
            }

            function pathfindAroundBuildings(start, goal, blockedKeys, maxRadius = 220) {
                const sx = start.x;
                const sz = start.z;
                const gx = goal.x;
                const gz = goal.z;
                const minX = Math.min(sx, gx) - maxRadius;
                const maxX = Math.max(sx, gx) + maxRadius;
                const minZ = Math.min(sz, gz) - maxRadius;
                const maxZ = Math.max(sz, gz) + maxRadius;

                const q = [{ x: sx, z: sz }];
                const visited = new Set([asPathKey(sx, sz)]);
                const parent = new Map();
                let found = false;
                const dirs = [DIR_VECTORS.N, DIR_VECTORS.E, DIR_VECTORS.S, DIR_VECTORS.W];

                while (q.length) {
                    const cur = q.shift();
                    if (cur.x === gx && cur.z === gz) {
                        found = true;
                        break;
                    }
                    for (const d of dirs) {
                        const nx = cur.x + d.dx;
                        const nz = cur.z + d.dz;
                        if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
                        const nk = asPathKey(nx, nz);
                        if (visited.has(nk)) continue;
                        if (blockedKeys.has(nk) && !(nx === gx && nz === gz) && !(nx === sx && nz === sz)) continue;
                        visited.add(nk);
                        parent.set(nk, asPathKey(cur.x, cur.z));
                        q.push({ x: nx, z: nz });
                    }
                }

                if (!found) return null;
                const out = [];
                let k = asPathKey(gx, gz);
                while (k) {
                    out.push(parsePathKey(k));
                    if (k === asPathKey(sx, sz)) break;
                    k = parent.get(k);
                }
                out.reverse();
                return out;
            }

            function placeGroundedHouse(centerX, centerZ, size, wallId, roofId, doorDirs, biomeStyleKey = 'plains', design = null) {
                const footprint = getVillageFootprintFromDesign(design, size);
                const sizeForPlacement = Math.max(footprint.width, footprint.depth, size);
                const half = Math.floor(sizeForPlacement / 2);
                let minGround = Infinity;
                let maxGround = -Infinity;
                for (let x = centerX - half; x <= centerX + half; x++) {
                    for (let z = centerZ - half; z <= centerZ + half; z++) {
                        const gy = getGroundYAt(x, z);
                        if (Number.isFinite(gy)) {
                            minGround = Math.min(minGround, gy);
                            maxGround = Math.max(maxGround, gy);
                        }
                    }
                }

                const baseY = Number.isFinite(minGround) ? Math.min(CHUNK_HEIGHT - 10, minGround + 1) : 70;
                const height = Math.max(3, Number(design?.wallHeight) || 4);
                const wallTopY = baseY + height;
                const roofY = wallTopY + 1;
                const beamId = Number(design?.beamBlockId) || (biomeStyleKey === 'jungle_forest' ? 96 : 5);
                const floorId = Number(design?.floorBlockId) || ((biomeStyleKey === 'desert' || biomeStyleKey === 'snowy_plains') ? wallId : 8);
                const windowId = Number(design?.windowBlockId) || (biomeStyleKey === 'snowy_plains' ? 80 : 26);
                const foundationId = Number(design?.foundationBlockId) || ((biomeStyleKey === 'desert' || biomeStyleKey === 'snowy_plains') ? wallId : 17);

                if (Array.isArray(design?.structure?.layers) && design.structure.layers.length) {
                    for (let x = centerX - half; x <= centerX + half; x++) {
                        for (let z = centerZ - half; z <= centerZ + half; z++) {
                            const gy = getGroundYAt(x, z);
                            if (Number.isFinite(gy)) {
                                for (let fy = gy + 1; fy <= baseY; fy++) placeSolid(x, fy, z, foundationId);
                            }
                        }
                    }
                    const tokens = design?.tokens || design?.structure?.tokens || {};
                    const blockContext = { wallId, roofId, beamId, floorId, windowId, foundationId, pathId: null, waterId: null };
                    for (const layer of design.structure.layers) {
                        const rows = Array.isArray(layer?.rows) ? layer.rows : [];
                        const layerDepth = rows.length;
                        const layerWidth = rows.reduce((max, row) => Math.max(max, String(row || '').length), 0);
                        const startZ = centerZ - Math.floor(layerDepth / 2);
                        const startX = centerX - Math.floor(layerWidth / 2);
                        const y = baseY + Math.floor(Number(layer?.yOffset) || 0);
                        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                            const row = String(rows[rowIndex] || '');
                            for (let colIndex = 0; colIndex < row.length; colIndex++) {
                                const token = row[colIndex];
                                const blockRef = Object.prototype.hasOwnProperty.call(tokens, token) ? tokens[token] : (token === ' ' ? 'skip' : null);
                                const blockId = resolveVillageDesignBlockId(blockRef, blockContext);
                                if (blockId === null) continue;
                                placeSolid(startX + colIndex, y, startZ + rowIndex, blockId);
                            }
                        }
                    }
                    const dirs = Array.isArray(doorDirs) && doorDirs.length ? doorDirs : (Array.isArray(design?.doorDirs) && design.doorDirs.length ? design.doorDirs : ['N']);
                    const resultDoors = dirs.map((dirRaw) => String(dirRaw || '').toUpperCase()).filter((dir) => DIR_VECTORS[dir]).map((dir) => getConnectorPoint(centerX, centerZ, sizeForPlacement, dir));
                    return {
                        ok: true,
                        x: centerX,
                        y: baseY + 1,
                        z: centerZ,
                        doors: resultDoors,
                        baseY,
                        slopeDelta: Number.isFinite(maxGround) && Number.isFinite(minGround) ? (maxGround - minGround) : 0
                    };
                }

                for (let x = centerX - half; x <= centerX + half; x++) {
                    for (let z = centerZ - half; z <= centerZ + half; z++) {
                        const gy = getGroundYAt(x, z);
                        if (Number.isFinite(gy)) {
                            for (let fy = gy + 1; fy <= baseY; fy++) placeSolid(x, fy, z, foundationId);
                        }
                        const edge = x === centerX - half || x === centerX + half || z === centerZ - half || z === centerZ + half;
                        const isCorner = (x === centerX - half || x === centerX + half) && (z === centerZ - half || z === centerZ + half);

                        placeSolid(x, baseY, z, floorId);

                        for (let y = baseY + 1; y <= wallTopY; y++) {
                            if (edge) {
                                placeSolid(x, y, z, isCorner ? beamId : wallId);
                            } else {
                                placeSolid(x, y, z, 0);
                            }
                        }
                    }
                }

                const windowRows = Array.isArray(design?.windowRows) && design.windowRows.length
                    ? design.windowRows.map((offset) => baseY + Math.max(1, Number(offset) || 1))
                    : [baseY + 2, baseY + 3];
                if (sizeForPlacement >= 5 && design?.windows !== false) {
                    for (const y of windowRows) {
                        placeSolid(centerX, y, centerZ - half, windowId);
                        placeSolid(centerX, y, centerZ + half, windowId);
                        placeSolid(centerX - half, y, centerZ, windowId);
                        placeSolid(centerX + half, y, centerZ, windowId);
                    }
                }

                const resultDoors = [];
                const dirs = Array.isArray(doorDirs) && doorDirs.length ? doorDirs : (Array.isArray(design?.doorDirs) && design.doorDirs.length ? design.doorDirs : ['N']);
                const usedDoorCells = new Set();
                for (const dirRaw of dirs) {
                    const dir = String(dirRaw || '').toUpperCase();
                    const v = DIR_VECTORS[dir];
                    if (!v) continue;
                    const wallX = centerX + v.dx * half;
                    const wallZ = centerZ + v.dz * half;
                    placeSolid(wallX, baseY + 1, wallZ, 0);
                    placeSolid(wallX, baseY + 2, wallZ, 0);
                    usedDoorCells.add(asPathKey(wallX, wallZ));
                    resultDoors.push(getConnectorPoint(centerX, centerZ, sizeForPlacement, dir));
                }

                const roofLayers = Array.isArray(design?.roofLayers) && design.roofLayers.length
                    ? design.roofLayers
                    : [{ yOffset: 0, inset: 0, edgeOnly: true }, { yOffset: 1, inset: 1, edgeOnly: false }];
                for (const layer of roofLayers) {
                    const inset = Math.max(0, Number(layer?.inset) || 0);
                    const y = roofY + Math.max(0, Number(layer?.yOffset) || 0);
                    const minRoof = centerX - half + inset;
                    const maxRoof = centerX + half - inset;
                    const minRoofZ = centerZ - half + inset;
                    const maxRoofZ = centerZ + half - inset;
                    for (let x = minRoof; x <= maxRoof; x++) {
                        for (let z = minRoofZ; z <= maxRoofZ; z++) {
                            const roofEdge = x === minRoof || x === maxRoof || z === minRoofZ || z === maxRoofZ;
                            if (layer?.edgeOnly === false || roofEdge) placeSolid(x, y, z, roofId);
                        }
                    }
                }

                const chestCandidates = Array.isArray(design?.chestOffsets) && design.chestOffsets.length
                    ? design.chestOffsets.map((offset) => ({ x: centerX + Number(offset.x || 0), z: centerZ + Number(offset.z || 0) }))
                    : [
                        { x: centerX - half + 1, z: centerZ - half + 1 },
                        { x: centerX + half - 1, z: centerZ - half + 1 },
                        { x: centerX - half + 1, z: centerZ + half - 1 },
                        { x: centerX + half - 1, z: centerZ + half - 1 }
                    ];
                if (design?.placeChest !== false) for (const cand of chestCandidates) {
                    const key = asPathKey(cand.x, cand.z);
                    if (usedDoorCells.has(key)) continue;
                    placeSolid(cand.x, baseY + 1, cand.z, 82);
                    break;
                }

                return {
                    ok: true,
                    x: centerX,
                    y: baseY + 1,
                    z: centerZ,
                    doors: resultDoors,
                    baseY,
                    slopeDelta: Number.isFinite(maxGround) && Number.isFinite(minGround) ? (maxGround - minGround) : 0
                };
            }

            for (let rx = regionMinX; rx <= regionMaxX; rx++) {
                for (let rz = regionMinZ; rz <= regionMaxZ; rz++) {
                    const candidateInfo = vg.getVillageRegionCandidate({
                        regionX: rx,
                        regionZ: rz,
                        hashRand2D,
                        getBiomeAt: (x, z) => getBiome(Math.floor(x), Math.floor(z)),
                        chance,
                        regionSize
                    });
                    if (!candidateInfo?.allowed || !candidateInfo.candidate) continue;

                    const coreX = Math.floor(candidateInfo.candidate.worldX);
                    const coreZ = Math.floor(candidateInfo.candidate.worldZ);
                    const villageKey = `${coreX},${coreZ}`;
                    if (placedVillages.has(villageKey)) continue;

                    if (coreX + influenceRadius < chunkMinX || coreX - influenceRadius > chunkMaxX || coreZ + influenceRadius < chunkMinZ || coreZ - influenceRadius > chunkMaxZ) {
                        continue;
                    }

                    const biome = getBiome(coreX, coreZ);
                    const template = getVillageTemplateForBiome(biome) || {};
                    const layout = template.layout || getDefaultVillageLayout();
                    const roadCfg = layout.road || {};
                    const biomeKey = normalizeVillageBiomeKey(biome);
                    const allowWaterSpawn = biomeKey === 'ocean' || biomeKey === 'jungle_forest';
                    const isDesert = biome === 'Desert';
                    const wellBlock = Number(layout.wellBlockId) || (isDesert ? 13 : 17);
                    const pathBlock = Number(layout.pathBlockId) || getPathBlockIdFromTemplate(template, 17);
                    const houseWall = Number(layout.defaultHouseWallBlockId) || (isDesert ? 13 : 8);
                    const houseRoof = Number(layout.defaultHouseRoofBlockId) || 17;
                    const water = Number(layout.wellWaterBlockId) || 4;
                    const minSpacing = Math.max(34, Number(layout.minPointSpacing) || 34);
                    const maxSpacing = Math.max(minSpacing, Number(layout.maxPointSpacing) || 64);
                    const maxBuildings = Math.max(1, Number(layout.maxBuildings) || 9);
                    const roadWidth = Math.min(1, Math.max(0, Number(roadCfg.width) || 1)); // <=3 blocks total
                    const branchDepthLimit = Math.max(0, Number(layout.maxBranchDepth) || 1);
                    const maxFoundationSlope = Math.max(1, Number(layout.maxFoundationSlope) || 3);
                    const mainRoadLength = Math.max(8, Number(roadCfg.mainRoadLength) || 18);

                    for (let wx = coreX - 2; wx <= coreX + 2; wx++) {
                        for (let wz = coreZ - 2; wz <= coreZ + 2; wz++) {
                            const gy = getGroundYAt(wx, wz);
                            if (!Number.isFinite(gy)) continue;
                            placeSolid(wx, gy + 1, wz, wellBlock);
                        }
                    }
                    const centerY = getGroundYAt(coreX, coreZ);
                    if (Number.isFinite(centerY)) {
                        placeSolid(coreX, centerY + 1, coreZ, water);
                        placeSolid(coreX - 1, centerY + 1, coreZ, water);
                        placeSolid(coreX + 1, centerY + 1, coreZ, water);
                        placeSolid(coreX, centerY + 1, coreZ - 1, water);
                        placeSolid(coreX, centerY + 1, coreZ + 1, water);
                    }

                    const houseTemplates = Array.isArray(layout.buildings) && layout.buildings.length
                        ? layout.buildings
                        : getDefaultVillageLayout().buildings;
                    const configuredPieceIds = Array.isArray(template?.pieces) && template.pieces.length
                        ? template.pieces
                        : Object.keys(template?.pieceDefinitions || {});
                    const placeableVillagePieces = configuredPieceIds
                        .map((pieceId) => getVillagePieceDefinitionFromTemplate(template, biomeKey, pieceId))
                        .filter((piece) => {
                            const category = normalizeVillagePieceCategory(piece?.category, piece?.id);
                            return category === 'house' || category === 'church' || category === 'farm' || category === 'platform' || category === 'igloo';
                        });
                    const piecePlacementCounts = new Map();

                    function chooseVillagePieceForSlot(tpl, step) {
                        const explicitPieceId = normalizeVillagePieceId(tpl?.piece || tpl?.structure);
                        if (explicitPieceId) {
                            const explicitPiece = getVillagePieceDefinitionFromTemplate(template, biomeKey, explicitPieceId);
                            if (explicitPiece) return explicitPiece;
                        }
                        const candidates = placeableVillagePieces.filter((piece) => {
                            const category = normalizeVillagePieceCategory(piece?.category, piece?.id);
                            if (category === 'church' && (piecePlacementCounts.get('church') || 0) >= 1) return false;
                            if (category === 'igloo' && (piecePlacementCounts.get('igloo') || 0) >= 1) return false;
                            return true;
                        });
                        const pool = candidates.length ? candidates : placeableVillagePieces;
                        if (!pool.length) return getVillagePieceDefinitionFromTemplate(template, biomeKey, 'house_small') || { id: 'house_small', category: 'house', footprint: { width: 7, depth: 7 }, weight: 1, design: null };
                        const totalWeight = pool.reduce((sum, piece) => sum + Math.max(1, Number(piece?.weight) || 1), 0);
                        let roll = seedRand01(coreX + step * 3, coreZ - step * 5, 200 + step) * totalWeight;
                        for (const piece of pool) {
                            roll -= Math.max(1, Number(piece?.weight) || 1);
                            if (roll <= 0) return piece;
                        }
                        return pool[pool.length - 1];
                    }

                    const wellConnectors = Array.isArray(layout.wellConnectors) && layout.wellConnectors.length
                        ? layout.wellConnectors
                        : getDefaultVillageLayout().wellConnectors;

                    const allPoints = [];
                    const openPoints = [];
                    const pointDepth = new Map();
                    let pointCounter = 0;
                    const buildingBlocked = new Set();
                    const buildingCenters = [];

                    for (const conn of wellConnectors) {
                        const cxOff = Number(conn.x);
                        const czOff = Number(conn.z);
                        if (!Number.isFinite(cxOff) || !Number.isFinite(czOff)) continue;
                        const dir = String(conn.dir || '').toUpperCase();
                        const pt = { id: String(conn.id || `well-${pointCounter++}`), x: coreX + cxOff, z: coreZ + czOff, dir: dir || 'N', kind: 'well' };
                        allPoints.push(pt);
                        openPoints.push(pt);
                        pointDepth.set(pt.id, 0);
                    }

                    const pathSegments = [];

                    function addBuildingObstacle(centerX, centerZ, size) {
                        const half = Math.floor(size / 2);
                        for (let x = centerX - half; x <= centerX + half; x++) {
                            for (let z = centerZ - half; z <= centerZ + half; z++) {
                                buildingBlocked.add(asPathKey(x, z));
                            }
                        }
                    }

                    function canPlaceAt(centerX, centerZ, size) {
                        const half = Math.floor(size / 2);
                        let minY = Infinity;
                        let maxY = -Infinity;
                        for (let x = centerX - half; x <= centerX + half; x++) {
                            for (let z = centerZ - half; z <= centerZ + half; z++) {
                                if (buildingBlocked.has(asPathKey(x, z))) return false;
                                const gy = getGroundYAt(x, z);
                                if (!Number.isFinite(gy)) return false;
                                minY = Math.min(minY, gy);
                                maxY = Math.max(maxY, gy);
                                if (!allowWaterSpawn) {
                                    const st = getSurfaceTypeAt(x, z);
                                    if (isWaterType(st)) return false;
                                }
                            }
                        }
                        if (maxY - minY > maxFoundationSlope) return false;
                        return true;
                    }

                    const placementAttempts = maxBuildings * 18;
                    let placedBuildings = 0;

                    for (let step = 0; step < placementAttempts && placedBuildings < maxBuildings && openPoints.length; step++) {
                        const srcIdx = Math.floor(seedRand01(coreX + step, coreZ - step, 1 + step) * openPoints.length);
                        const src = openPoints[srcIdx];
                        if (!src) continue;
                        const srcDepth = pointDepth.get(src.id) || 0;
                        if (srcDepth > branchDepthLimit) continue;

                        const tpl = houseTemplates[Math.floor(seedRand01(coreX + step * 3, coreZ - step * 5, 2 + step) * houseTemplates.length)] || houseTemplates[0];
                        const selectedPiece = chooseVillagePieceForSlot(tpl, step);
                        const pieceId = normalizeVillagePieceId(selectedPiece?.id || tpl.piece || tpl.structure || (String(tpl.id || '').toLowerCase().includes('church') ? 'church_small' : 'house_small'));
                        const pieceDesign = selectedPiece?.design || getVillagePieceDesignFromTemplate(template, biomeKey, pieceId);
                        const footprint = getVillageFootprintFromDesign(selectedPiece?.footprint ? { footprint: selectedPiece.footprint, size: selectedPiece?.size } : pieceDesign, Number(tpl.size) || 5);
                        const size = Math.max(3, footprint.width, footprint.depth, Number(tpl.size) || 5);
                        const pieceCategory = normalizeVillagePieceCategory(selectedPiece?.category || pieceDesign?.category || 'house', pieceId);
                        const dist = minSpacing + Math.floor(seedRand01(coreX - step * 7, coreZ + step * 11, 3 + step) * (maxSpacing - minSpacing + 1));
                        const dir = String(src.dir || 'N').toUpperCase();
                        const vec = DIR_VECTORS[dir] || DIR_VECTORS.N;
                        const primaryDoorDir = OPPOSITE_DIR[dir] || 'S';

                        const targetPointX = src.x + vec.dx * dist;
                        const targetPointZ = src.z + vec.dz * dist;
                        const half = Math.floor(size / 2);
                        const doorVec = DIR_VECTORS[primaryDoorDir] || DIR_VECTORS.S;
                        const centerX = targetPointX - doorVec.dx * (half + 1);
                        const centerZ = targetPointZ - doorVec.dz * (half + 1);

                        let tooClose = false;
                        for (const p of allPoints) {
                            const man = Math.abs(p.x - targetPointX) + Math.abs(p.z - targetPointZ);
                            if (man < minSpacing) {
                                tooClose = true;
                                break;
                            }
                        }
                        if (tooClose) continue;

                        if (!canPlaceAt(centerX, centerZ, size)) continue;

                        const wall = Number(tpl.wallBlockId) || houseWall;
                        const roof = Number(tpl.roofBlockId) || houseRoof;
                        const extraDoors = Array.isArray(tpl.doorDirs) ? tpl.doorDirs : (Array.isArray(selectedPiece?.doorDirs) ? selectedPiece.doorDirs : (Array.isArray(pieceDesign?.doorDirs) ? pieceDesign.doorDirs : []));
                        const doorDirs = Array.from(new Set([primaryDoorDir, ...extraDoors.map((d) => String(d || '').toUpperCase()).filter((d) => DIR_VECTORS[d]) ]));

                        let built = null;
                        if (pieceCategory.includes('farm')) {
                            built = placeVillageFarm(centerX, centerZ, { path: pathBlock, water }, pieceDesign);
                        } else if (pieceCategory.includes('platform')) {
                            built = placeVillagePlatform(centerX, centerZ, wall, pieceDesign);
                        } else {
                            built = placeGroundedHouse(centerX, centerZ, size, wall, roof, doorDirs, biomeKey, pieceDesign);
                        }
                        if (!built?.ok) continue;
                        if (!Array.isArray(built.doors) || !built.doors.length) {
                            built.doors = [getConnectorPoint(centerX, centerZ, size, primaryDoorDir)];
                        }
                        piecePlacementCounts.set(pieceCategory, (piecePlacementCounts.get(pieceCategory) || 0) + 1);
                        if (pieceCategory.includes('house') || pieceCategory.includes('church') || pieceCategory.includes('igloo')) {
                            spawnedVillagers.push({ wx: centerX + 0.5, wy: built.baseY + 1, wz: centerZ + 0.5, homeX: centerX + 0.5, homeZ: centerZ + 0.5, centerX: coreX + 0.5, centerZ: coreZ + 0.5, poiTargets: [{ key: 'well', x: coreX + 0.5, z: coreZ + 0.5 }] });
                        }
                        addBuildingObstacle(centerX, centerZ, size);
                        buildingCenters.push({ x: centerX, z: centerZ, size });

                        const mainDoor = built.doors.find((d) => d.dir === primaryDoorDir) || built.doors[0];
                        if (mainDoor) {
                            const path = pathfindAroundBuildings(src, mainDoor, buildingBlocked, 180);
                            if (path && path.length > 1) pathSegments.push(path);
                        }

                        const outwardDoor = built.doors.find((d) => d.dir !== primaryDoorDir);
                        if (outwardDoor) {
                            const id = `${String(tpl.id || 'building')}-${pointCounter++}`;
                            const pt = { id, x: outwardDoor.x, z: outwardDoor.z, dir: outwardDoor.dir, kind: 'door' };
                            allPoints.push(pt);
                            openPoints.push(pt);
                            pointDepth.set(id, srcDepth + 1);
                        }

                        placedBuildings++;
                    }

                    const pathCells = new Set();
                    for (const p of allPoints.filter((pt) => pt.kind === 'well')) {
                        const vec = DIR_VECTORS[p.dir] || { dx: 0, dz: 0 };
                        if (!vec.dx && !vec.dz) continue;
                        for (let i = 0; i < mainRoadLength; i++) {
                            const tx = p.x + vec.dx * i;
                            const tz = p.z + vec.dz * i;
                            if (!buildingBlocked.has(asPathKey(tx, tz))) pathCells.add(asPathKey(tx, tz));
                        }
                    }
                    for (const seg of pathSegments) {
                        for (const cell of seg) pathCells.add(asPathKey(cell.x, cell.z));
                    }

                    const connectedEdges = new Set();
                    const doorPoints = allPoints.filter((p) => p.kind === 'door');
                    for (const door of doorPoints) {
                        const nearest = doorPoints
                            .filter((p) => p.id !== door.id && !connectedEdges.has(`${door.id}->${p.id}`))
                            .sort((a, b) => (Math.abs(a.x - door.x) + Math.abs(a.z - door.z)) - (Math.abs(b.x - door.x) + Math.abs(b.z - door.z)))[0];
                        if (!nearest) continue;
                        const dist = Math.abs(door.x - nearest.x) + Math.abs(door.z - nearest.z);
                        if (dist <= Math.max(4, Number(roadCfg.maxDoorLinkDistance) || 26)) {
                            const link = pathfindAroundBuildings(door, nearest, buildingBlocked, 180);
                            if (link && link.length > 1) {
                                for (const cell of link) pathCells.add(asPathKey(cell.x, cell.z));
                                connectedEdges.add(`${door.id}->${nearest.id}`);
                                connectedEdges.add(`${nearest.id}->${door.id}`);
                            }
                        }
                    }

                    for (const p of allPoints) {
                        const vec = DIR_VECTORS[p.dir] || { dx: 0, dz: 0 };
                        const extensionLen = p.kind === 'well'
                            ? Math.max(1, Number(roadCfg.wellConnectorExtension) || 8)
                            : Math.max(1, Number(roadCfg.doorExtension) || 5);
                        if (!vec.dx && !vec.dz) continue;
                        let ex = p.x;
                        let ez = p.z;
                        for (let i = 0; i < extensionLen; i++) {
                            ex += vec.dx;
                            ez += vec.dz;
                            if (!buildingBlocked.has(asPathKey(ex, ez))) pathCells.add(asPathKey(ex, ez));
                        }
                    }

                    for (const key of pathCells) {
                        const [sx, sz] = key.split(',');
                        const px = Number(sx);
                        const pz = Number(sz);
                        for (let ox = -roadWidth; ox <= roadWidth; ox++) {
                            for (let oz = -roadWidth; oz <= roadWidth; oz++) {
                                if (Math.abs(ox) + Math.abs(oz) > roadWidth) continue;
                                const tx = px + ox;
                                const tz = pz + oz;
                                if (buildingBlocked.has(asPathKey(tx, tz))) continue;
                                setSurfaceBlock(tx, tz, pathBlock);
                            }
                        }
                    }

                    placedVillages.add(villageKey);
                    placedAny = true;
                }
            }

            return placedAny;
        }










        function placeRuinsInChunk(data, cx, cz) {
            const rg = window.RuinsGeneration || {};
            if (!rg.getRuinRegionCandidate || !rg.getBiomeDefinition) return false;

            const regionSize = Number(rg.DEFAULT_RUIN_REGION_SIZE) || 256;
            const chance = Number(rg.DEFAULT_RUIN_CHANCE_PER_REGION) || 0.28;
            const influenceRadius = 18;
            const chunkMinX = cx * CHUNK_SIZE;
            const chunkMinZ = cz * CHUNK_SIZE;
            const chunkMaxX = chunkMinX + CHUNK_SIZE - 1;
            const chunkMaxZ = chunkMinZ + CHUNK_SIZE - 1;
            const regionMinX = Math.floor((chunkMinX - influenceRadius) / regionSize);
            const regionMaxX = Math.floor((chunkMaxX + influenceRadius) / regionSize);
            const regionMinZ = Math.floor((chunkMinZ - influenceRadius) / regionSize);
            const regionMaxZ = Math.floor((chunkMaxZ + influenceRadius) / regionSize);

            const idx = (lx, ly, lz) => lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT;
            const getColumnTop = (lx, lz) => {
                for (let y = CHUNK_HEIGHT - 2; y >= 1; y--) {
                    const topBlock = data[idx(lx, y, lz)];
                    if (topBlock !== 0 && topBlock !== 4) return y;
                }
                return -1;
            };
            const getGroundYAt = (wx, wz) => {
                if (wx < chunkMinX || wx > chunkMaxX || wz < chunkMinZ || wz > chunkMaxZ) return null;
                const lx = wx - chunkMinX;
                const lz = wz - chunkMinZ;
                const top = getColumnTop(lx, lz);
                return top > 0 ? top : null;
            };
            const placeSolid = (wx, wy, wz, blockId) => {
                if (wx < chunkMinX || wx > chunkMaxX || wz < chunkMinZ || wz > chunkMaxZ) return false;
                if (wy < 1 || wy >= CHUNK_HEIGHT - 1) return false;
                data[idx(wx - chunkMinX, wy, wz - chunkMinZ)] = blockId;
                return true;
            };
            const placedRuins = new Set();
            let placedAny = false;

            function choosePaletteBlock(blocks, seedX, seedZ, salt) {
                if (!Array.isArray(blocks) || !blocks.length) return 17;
                const roll = hashRand2D(seedX + salt * 7, seedZ - salt * 11, 42400 + salt);
                return blocks[Math.floor(roll * blocks.length) % blocks.length];
            }

            function placeColumn(wx, wz, height, blocks, seedX, seedZ, salt) {
                const groundY = getGroundYAt(wx, wz);
                if (!Number.isFinite(groundY)) return;
                for (let step = 1; step <= height; step++) {
                    const blockId = choosePaletteBlock(blocks, seedX + wx, seedZ + wz, salt + step);
                    placeSolid(wx, groundY + step, wz, blockId);
                }
            }

            function placeRuinAt(coreX, coreZ, biomeKey) {
                const def = rg.getBiomeDefinition(biomeKey);
                if (!def) return false;
                const columns = [
                    { x: 0, z: 0, h: 4 },
                    { x: 1, z: 0, h: 3 }, { x: 2, z: 0, h: 2 }, { x: 3, z: 0, h: 1 },
                    { x: 0, z: 1, h: 3 }, { x: 0, z: 2, h: 2 }, { x: 0, z: 3, h: 1 },
                    { x: -1, z: 0, h: 3 }, { x: -2, z: 0, h: 2 }, { x: -3, z: 0, h: 1 },
                    { x: 0, z: -1, h: 3 }, { x: 0, z: -2, h: 2 }, { x: 0, z: -3, h: 1 },
                ];
                const fillerOffsets = [
                    { x: 1, z: 1 }, { x: -1, z: -1 }, { x: 1, z: -1 }, { x: -1, z: 1 },
                    { x: 2, z: 1 }, { x: 1, z: 2 }, { x: -2, z: -1 }, { x: -1, z: -2 },
                ];

                columns.forEach((column, index) => placeColumn(coreX + column.x, coreZ + column.z, column.h, def.blocks, coreX, coreZ, index + 1));
                fillerOffsets.forEach((offset, index) => {
                    const roll = hashRand2D(coreX + offset.x * 3, coreZ + offset.z * 5, 42500 + index);
                    if (roll > 0.62) return;
                    const height = 1 + Math.floor(hashRand2D(coreX - offset.x * 7, coreZ + offset.z * 11, 42600 + index) * 2);
                    placeColumn(coreX + offset.x, coreZ + offset.z, height, def.blocks, coreX, coreZ, 30 + index);
                });

                const chestRoll = hashRand2D(coreX, coreZ, 42700);
                if (chestRoll < 0.20) {
                    const chestOffsets = [{ x: 1, z: 1 }, { x: -1, z: -1 }, { x: 1, z: -1 }, { x: -1, z: 1 }];
                    const chosen = chestOffsets[Math.floor(hashRand2D(coreX, coreZ, 42701) * chestOffsets.length) % chestOffsets.length];
                    const chestX = coreX + chosen.x;
                    const chestZ = coreZ + chosen.z;
                    const groundY = getGroundYAt(chestX, chestZ);
                    if (Number.isFinite(groundY) && placeSolid(chestX, groundY + 1, chestZ, 82)) {
                        placeSolid(chestX, groundY, chestZ, def.chestBaseBlockId);
                        const chestKey = `${chestX},${groundY + 1},${chestZ}`;
                        const loot = window.RuinsChestLoot?.generateLoot?.({ hashRand2D, seedX: coreX, seedZ: coreZ, biomeKey }) || [];
                        seedChestStateWithLoot(chestKey, loot);
                    }
                }

                return true;
            }

            for (let rx = regionMinX; rx <= regionMaxX; rx++) {
                for (let rz = regionMinZ; rz <= regionMaxZ; rz++) {
                    const candidateInfo = rg.getRuinRegionCandidate({
                        regionX: rx,
                        regionZ: rz,
                        hashRand2D,
                        getBiomeAt: (x, z) => getBiome(Math.floor(x), Math.floor(z)),
                        chance,
                        regionSize,
                    });
                    if (!candidateInfo?.allowed || !candidateInfo.candidate) continue;

                    const coreX = Math.floor(candidateInfo.candidate.worldX);
                    const coreZ = Math.floor(candidateInfo.candidate.worldZ);
                    const ruinKey = `${coreX},${coreZ}`;
                    if (placedRuins.has(ruinKey)) continue;
                    if (coreX + influenceRadius < chunkMinX || coreX - influenceRadius > chunkMaxX || coreZ + influenceRadius < chunkMinZ || coreZ - influenceRadius > chunkMaxZ) continue;

                    const biomeKey = normalizeRuinBiomeKey(getBiome(coreX, coreZ));
                    if (!biomeKey || biomeKey !== candidateInfo.candidate.biomeKey) continue;
                    if (!placeRuinAt(coreX, coreZ, biomeKey)) continue;

                    placedRuins.add(ruinKey);
                    placedAny = true;
                }
            }

            return placedAny;
        }








        function placePumpkinPatchInChunk(data, cx, cz) {
            const pumpkinCfg = worldGenSettings.decorations?.pumpkins || {};
            if (pumpkinCfg.enabled === false) return;
            const chancePerChunk = Number(pumpkinCfg.chancePerChunk);
            const spawnChance = Number.isFinite(chancePerChunk) ? chancePerChunk : (1 / 32);
            if (hashRand2D(cx, cz, 12101) > spawnChance) return;

            const PUMPKIN_BLOCK_ID = 110;
            const idx = (lx, ly, lz) => lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT;
            const getColumnTop = (lx, lz) => {
                for (let y = CHUNK_HEIGHT - 2; y >= 1; y--) {
                    const t = data[idx(lx, y, lz)];
                    if (t !== 0 && t !== 4) return y;
                }
                return -1;
            };

            const minPatch = Math.max(1, Math.floor(Number(pumpkinCfg.minPatch) || 3));
            const maxPatch = Math.max(minPatch, Math.floor(Number(pumpkinCfg.maxPatch) || 7));
            const count = minPatch + Math.floor(hashRand2D(cx * 5, cz * 7, 12102) * (maxPatch - minPatch + 1));
            for (let i = 0; i < count; i++) {
                const lx = 1 + Math.floor(hashRand2D(cx * 19 + i * 3, cz * 23 - i * 5, 12103) * (CHUNK_SIZE - 2));
                const lz = 1 + Math.floor(hashRand2D(cx * 29 - i * 7, cz * 31 + i * 11, 12104) * (CHUNK_SIZE - 2));
                const topY = getColumnTop(lx, lz);
                if (topY < SEA_LEVEL - 1 || topY >= CHUNK_HEIGHT - 2) continue;
                const ground = data[idx(lx, topY, lz)];
                if (ground !== 1 && ground !== 2 && ground !== 7) continue;
                if (data[idx(lx, topY + 1, lz)] !== 0) continue;
                data[idx(lx, topY + 1, lz)] = PUMPKIN_BLOCK_ID;
            }
        }



        function placeAmethystGeodesInChunk(data, cx, cz) {
            window.UndergroundGeodesWorldgen?.placeAmethystGeodesInChunk?.({
                data,
                cx,
                cz,
                hashRand2D,
                worldGenSettings,
                CHUNK_SIZE,
                CHUNK_HEIGHT,
            });
        }

        function computeChunkHash(data) {
            return remeshOptimizations?.computeChunkHash?.(data) || 0;
        }

        function isChunkAllAir(data) {
            return chunkStreamOptimizations?.isChunkAllAir?.(data) || false;
        }

        function createChunk(cx, cz) {

            const generated = generateChunkData(cx, cz);
            const data = generated.data;
            const heightmap = generated.heightmap || buildChunkHeightmap(data);
            const chunkKey = `${cx},${cz}`;

            if (isChunkAllAir(data)) {
                sparseAirChunkKeys.add(chunkKey);
                return null;
            }

            sparseAirChunkKeys.delete(chunkKey);
            const group = new THREE.Group();
            group.userData = { chunkData: data, heightmap, cx, cz, meshHash: null, frustumRadius: Math.sqrt((CHUNK_SIZE*CHUNK_SIZE)*0.5 + (CHUNK_HEIGHT*CHUNK_HEIGHT)*0.25) };
            chunks.set(chunkKey, group);
            requestChunkRemesh(cx, cz, 'load');
            worldGroup.add(group);
            if (generated.spawnedGnomes && generated.spawnedGnomes.length) {
                for (const g of generated.spawnedGnomes) spawnGnomeAt(g.wx, g.wy, g.wz);
            }
            if (generated.spawnedPigs && generated.spawnedPigs.length) {
                for (const pig of generated.spawnedPigs) pigMob?.spawnAtExact?.(pig.wx, pig.wy, pig.wz);
            }
            if (generated.spawnedWolves && generated.spawnedWolves.length) {
                for (const wolf of generated.spawnedWolves) wolfMob?.spawnAtExact?.(wolf.wx, wolf.wy, wolf.wz);
            }
            if (generated.spawnedPandas && generated.spawnedPandas.length) {
                for (const panda of generated.spawnedPandas) pandaMob?.spawnAtExact?.(panda.wx, panda.wy, panda.wz);
            }
            if (generated.spawnedVillagers && generated.spawnedVillagers.length) {
                for (const villager of generated.spawnedVillagers) {
                    villagerMob?.spawnAtExact?.(villager.wx, villager.wy, villager.wz, { x: villager.homeX, z: villager.homeZ }, { x: villager.centerX ?? villager.homeX, z: villager.centerZ ?? villager.homeZ }, villager.poiTargets || null);
                }
            }
            return group;
        }


        function disposeLoadedChunkByKey(chunkKey) {
            const chunkGroup = chunks.get(chunkKey);
            if (!chunkGroup || !chunkGroup.userData) return;
            removeTorchLightsForChunk(chunkKey);
            worldGroup.remove(chunkGroup);
            if (chunkGroup.children) {
                for (const child of chunkGroup.children) {
                    if (child.geometry) child.geometry.dispose();
                }
            }
            if (chunkGroup.userData?.meshesByKey) {
                chunkGroup.userData.meshesByKey.clear();
            }
            chunks.delete(chunkKey);
        }

        function convertChunkToSparseAir(chunkGroup) {
            if (!chunkGroup || !chunkGroup.userData) return;
            const chunkKey = `${chunkGroup.userData.cx},${chunkGroup.userData.cz}`;
            disposeLoadedChunkByKey(chunkKey);
            sparseAirChunkKeys.add(chunkKey);
            remeshOptimizations?.deleteChunk?.(chunkKey);
        }

        function updateChunkFrustumCulling() {
            frustumOptimizations?.updateChunkFrustumCulling?.();
        }

        function updateChunkAndNeighbors(centerGroup, lx, lz) {
            const cx = centerGroup.userData.cx;
            const cz = centerGroup.userData.cz;
            const needsNeighbors = (lx === 0 || lx === CHUNK_SIZE - 1 || lz === 0 || lz === CHUNK_SIZE - 1);

            if (remeshOptimizations?.isBatchActive?.()) {
                markBatchedChunkRemeshNeed(cx, cz, needsNeighbors);
                return;
            }

            requestChunkRemesh(cx, cz, 'block');
            if (needsNeighbors) {
                requestChunkAndNeighborsRemesh(cx, cz, 'neighbor');
            }
            rebuildDirtyChunkMeshes();
        }

        frustumOptimizations = window.SingleplayerFrustumOptimizations?.create?.({
            THREE,
            getCamera: () => camera,
            chunks,
            CHUNK_SIZE,
            CHUNK_HEIGHT,
            intervalMs: FRUSTUM_CULL_INTERVAL_MS,
        }) || null;

        chunkStreamOptimizations = window.SingleplayerChunkStreamOptimizations?.create?.({
            getYawObject: () => yawObject,
            getCurrentChunkLoadRadius: () => currentChunkLoadRadius,
            getChunkCreationBudgetPerTick: () => CHUNK_CREATION_BUDGET_PER_TICK,
            getChunkCreationBudgetForce: () => CHUNK_CREATION_BUDGET_FORCE,
            getChunkKey: chunkKeyFromCoords,
            getChunkEntries: () => chunks.entries(),
            hasChunk: (key) => chunks.has(key),
            hasSparseAirChunk: (key) => sparseAirChunkKeys.has(key),
            createChunk,
            removeChunk: disposeLoadedChunkByKey,
            CHUNK_SIZE,
            chunkUpdateIntervalMs: CHUNK_UPDATE_INTERVAL_MS,
        }) || null;
        
        // Maps block ID to the THREE.js material key/fallback key
        function getMaterialKey(id, faceDir) {
            const mat = blockMaterials[id];
            
            if (mat.textured) {
                let key = mat.textureKey;
                if (mat.textureByFace && faceDir) {
                    if (faceDir[1] === 1) key = mat.textureByFace.top || key;
                    else if (faceDir[1] === -1) key = mat.textureByFace.bottom || key;
                    else if (faceDir[0] === 1) key = mat.textureByFace.posX || key;
                    else if (faceDir[0] === -1) key = mat.textureByFace.negX || key;
                    else if (faceDir[2] === 1) key = mat.textureByFace.posZ || key;
                    else if (faceDir[2] === -1) key = mat.textureByFace.negZ || key;
                }
                // Use the loaded material key if it exists, otherwise use a colored fallback key
                if (materials[key]) return key; 
                return 'COLORED_OPAQUE';
            }
            if (id === 4) return 'WATER'; 
            if (id === 5) return 'WOOD';  
            
            // For non-textured blocks that might have been assigned a vertex color
            return 'COLORED_OPAQUE';
        }

        const sideRenderBlockIds = new Set(SIDE_RENDER_BLOCK_IDS);

        function getSideRenderMode(id) {
            if (!sideRenderBlockIds.has(id)) return null;
            return blockMaterials[id]?.renderAs || 'cross';
        }

        function isPlaceableBlock(id) {
            return isSolid(id) || Boolean(blockMaterials[id]?.placeable);
        }

        function getFaceName(faceDir) {
            if (faceDir[1] === 1) return 'top';
            if (faceDir[1] === -1) return 'bottom';
            if (faceDir[0] === 1) return 'posX';
            if (faceDir[0] === -1) return 'negX';
            if (faceDir[2] === 1) return 'posZ';
            if (faceDir[2] === -1) return 'negZ';
            return null;
        }

        function getFaceUVs(blockId, faceName, fallbackUv) {
            const mat = blockMaterials[blockId];
            const rect = mat?.textureUvByFace?.[faceName];
            if (!rect) return fallbackUv;

            const atlas = Math.max(1, Number(mat.uvAtlasSize) || 64);
            const [x, y, w, h] = rect;
            const u0 = x / atlas;
            const v0 = 1 - ((y + h) / atlas);
            const u1 = (x + w) / atlas;
            const v1 = 1 - (y / atlas);
            return [u0, v1, u0, v0, u1, v0, u1, v1];
        }

        function removeTorchLightsForChunk(chunkKey) {
            const entries = torchLightsByChunk.get(chunkKey);
            if (!entries) return;
            for (const light of entries) {
                scene.remove(light);
            }
            torchLightsByChunk.delete(chunkKey);
        }

        function syncTorchLightsForChunk(group, torchPositions, glowstonePositions = []) {
            if (!scene) return;
            const chunkKey = `${group.userData.cx},${group.userData.cz}`;
            removeTorchLightsForChunk(chunkKey);
            if ((!torchPositions || torchPositions.length === 0) && (!glowstonePositions || glowstonePositions.length === 0)) return;

            const maxLightsPerChunk = 24;
            const created = [];
            for (let i = 0; i < (torchPositions?.length || 0) && created.length < maxLightsPerChunk; i++) {
                const p = torchPositions[i];
                const light = new THREE.PointLight(0xffc88a, 0.88, 12, 2);
                light.position.set(p.x + 0.5, p.y + 0.62, p.z + 0.5);
                scene.add(light);
                created.push(light);
            }
            for (let i = 0; i < (glowstonePositions?.length || 0) && created.length < maxLightsPerChunk; i++) {
                const p = glowstonePositions[i];
                const glowCfg = blockMaterials[p.id] || {};
                const light = new THREE.PointLight(glowCfg.emissive || 0xffd27a, glowCfg.lightIntensity || 1.15, glowCfg.lightRadius || 13, 2);
                light.position.set(p.x + 0.5, p.y + 0.5, p.z + 0.5);
                scene.add(light);
                created.push(light);
            }
            if (created.length) torchLightsByChunk.set(chunkKey, created);
        }

        function updateChunkGeometry(group, data, forceRemesh = false) {

            // Chunk meshing pipeline: blocks -> greedy mesh -> vertex buffer -> GPU.
            const nextHash = computeChunkHash(data);
            if (!forceRemesh && group.userData.meshHash === nextHash && group.children.length > 0) return;
            group.userData.meshHash = nextHash;

            const meshesByKey = group.userData.meshesByKey || new Map();
            group.userData.meshesByKey = meshesByKey;

            // Map to hold CPU-side staging arrays before single VBO upload per chunk material.
            const geometryData = {}; 
            
            const cx = group.userData.cx;
            const cz = group.userData.cz;
            const torchPositions = [];
            const glowstonePositions = [];

            const faces = [
                { name: 'posX', dir: [1,0,0], corners: [[1,1,1],[1,0,1],[1,0,0],[1,1,0]], uv: [0,1, 0,0, 1,0, 1,1] },
                { name: 'negX', dir: [-1,0,0], corners: [[0,1,0],[0,0,0],[0,0,1],[0,1,1]], uv: [0,1, 0,0, 1,0, 1,1] },
                { name: 'top', dir: [0,1,0], corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], uv: [0,1, 0,0, 1,0, 1,1] },
                { name: 'bottom', dir: [0,-1,0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], uv: [0,1, 0,0, 1,0, 1,1] },
                { name: 'posZ', dir: [0,0,1], corners: [[0,1,1],[0,0,1],[1,0,1],[1,1,1]], uv: [0,1, 0,0, 1,0, 1,1] },
                { name: 'negZ', dir: [0,0,-1], corners: [[1,1,0],[1,0,0],[0,0,0],[0,1,0]], uv: [0,1, 0,0, 1,0, 1,1] }
            ];
            const slabFaces = [
                { name: 'posX', dir: [1,0,0], corners: [[1,0.5,1],[1,0,1],[1,0,0],[1,0.5,0]], uv: [0,0.5, 0,0, 1,0, 1,0.5] },
                { name: 'negX', dir: [-1,0,0], corners: [[0,0.5,0],[0,0,0],[0,0,1],[0,0.5,1]], uv: [0,0.5, 0,0, 1,0, 1,0.5] },
                { name: 'top', dir: [0,1,0], corners: [[0,0.5,1],[1,0.5,1],[1,0.5,0],[0,0.5,0]], uv: [0,1, 0,0, 1,0, 1,1] },
                { name: 'bottom', dir: [0,-1,0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], uv: [0,1, 0,0, 1,0, 1,1] },
                { name: 'posZ', dir: [0,0,1], corners: [[0,0.5,1],[0,0,1],[1,0,1],[1,0.5,1]], uv: [0,0.5, 0,0, 1,0, 1,0.5] },
                { name: 'negZ', dir: [0,0,-1], corners: [[1,0.5,0],[1,0,0],[0,0,0],[0,0.5,0]], uv: [0,0.5, 0,0, 1,0, 1,0.5] }
            ];
            const torchFaces = [
                { name: 'posX', dir: [1,0,0], corners: [[0.5625,0.8,0.5625],[0.5625,0.05,0.5625],[0.5625,0.05,0.4375],[0.5625,0.8,0.4375]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'negX', dir: [-1,0,0], corners: [[0.4375,0.8,0.4375],[0.4375,0.05,0.4375],[0.4375,0.05,0.5625],[0.4375,0.8,0.5625]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'top', dir: [0,1,0], corners: [[0.4375,0.8,0.5625],[0.5625,0.8,0.5625],[0.5625,0.8,0.4375],[0.4375,0.8,0.4375]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'bottom', dir: [0,-1,0], corners: [[0.4375,0.05,0.4375],[0.5625,0.05,0.4375],[0.5625,0.05,0.5625],[0.4375,0.05,0.5625]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'posZ', dir: [0,0,1], corners: [[0.4375,0.8,0.5625],[0.4375,0.05,0.5625],[0.5625,0.05,0.5625],[0.5625,0.8,0.5625]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'negZ', dir: [0,0,-1], corners: [[0.5625,0.8,0.4375],[0.5625,0.05,0.4375],[0.4375,0.05,0.4375],[0.4375,0.8,0.4375]], uv: [0,1,0,0,1,0,1,1] }
            ];

            const bambooStageFaces = [
                { name: 'posX', dir: [1,0,0], corners: [[0.56,0.72,0.56],[0.56,0.0,0.56],[0.56,0.0,0.44],[0.56,0.72,0.44]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'negX', dir: [-1,0,0], corners: [[0.44,0.72,0.44],[0.44,0.0,0.44],[0.44,0.0,0.56],[0.44,0.72,0.56]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'top', dir: [0,1,0], corners: [[0.44,0.72,0.56],[0.56,0.72,0.56],[0.56,0.72,0.44],[0.44,0.72,0.44]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'bottom', dir: [0,-1,0], corners: [[0.44,0.0,0.44],[0.56,0.0,0.44],[0.56,0.0,0.56],[0.44,0.0,0.56]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'posZ', dir: [0,0,1], corners: [[0.44,0.72,0.56],[0.44,0.0,0.56],[0.56,0.0,0.56],[0.56,0.72,0.56]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'negZ', dir: [0,0,-1], corners: [[0.56,0.72,0.44],[0.56,0.0,0.44],[0.44,0.0,0.44],[0.44,0.72,0.44]], uv: [0,1,0,0,1,0,1,1] }
            ];
            const bambooStalkFaces = [
                { name: 'posX', dir: [1,0,0], corners: [[0.55,1.0,0.55],[0.55,0.0,0.55],[0.55,0.0,0.45],[0.55,1.0,0.45]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'negX', dir: [-1,0,0], corners: [[0.45,1.0,0.45],[0.45,0.0,0.45],[0.45,0.0,0.55],[0.45,1.0,0.55]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'top', dir: [0,1,0], corners: [[0.45,1.0,0.55],[0.55,1.0,0.55],[0.55,1.0,0.45],[0.45,1.0,0.45]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'bottom', dir: [0,-1,0], corners: [[0.45,0.0,0.45],[0.55,0.0,0.45],[0.55,0.0,0.55],[0.45,0.0,0.55]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'posZ', dir: [0,0,1], corners: [[0.45,1.0,0.55],[0.45,0.0,0.55],[0.55,0.0,0.55],[0.55,1.0,0.55]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'negZ', dir: [0,0,-1], corners: [[0.55,1.0,0.45],[0.55,0.0,0.45],[0.45,0.0,0.45],[0.45,1.0,0.45]], uv: [0,1,0,0,1,0,1,1] }
            ];
            const crossPlantFaces = [
                { dir: [0.7071, 0, -0.7071], corners: [[0.1464,1,0.1464],[0.1464,0,0.1464],[0.8536,0,0.8536],[0.8536,1,0.8536]], uv: [0,1,0,0,1,0,1,1] },
                { dir: [-0.7071, 0, 0.7071], corners: [[0.8536,1,0.8536],[0.8536,0,0.8536],[0.1464,0,0.1464],[0.1464,1,0.1464]], uv: [0,1,0,0,1,0,1,1] },
                { dir: [0.7071, 0, 0.7071], corners: [[0.1464,1,0.8536],[0.1464,0,0.8536],[0.8536,0,0.1464],[0.8536,1,0.1464]], uv: [0,1,0,0,1,0,1,1] },
                { dir: [-0.7071, 0, -0.7071], corners: [[0.8536,1,0.1464],[0.8536,0,0.1464],[0.1464,0,0.8536],[0.1464,1,0.8536]], uv: [0,1,0,0,1,0,1,1] },
            ];
            const singlePlaneFaces = [
                { name: 'posZ', dir: [0, 0, 1], corners: [[0.15,1,0.5],[0.15,0,0.5],[0.85,0,0.5],[0.85,1,0.5]], uv: [0,1,0,0,1,0,1,1] },
            ];
            const singlePlaneFacesX = [
                { name: 'posX', dir: [1, 0, 0], corners: [[0.5,1,0.15],[0.5,0,0.15],[0.5,0,0.85],[0.5,1,0.85]], uv: [0,1,0,0,1,0,1,1] },
            ];


            const CH = CHUNK_HEIGHT;
            const CS = CHUNK_SIZE;

            const get = (x,y,z) => {
                if (x < 0 || x >= CS || z < 0 || z >= CS || y < 0 || y >= CH) {
                    const wx = x + cx * CS;
                    const wz = z + cz * CS;
                    return getBlockType(wx, y, wz);
                }
                return data[x + y * CS + z * CS * CH];
            };

            const isTransparentBlock = (id) => {
                const mat = blockMaterials[id];
                return Boolean(mat && (mat.transparent || (mat.textured && mat.textureKey === 'LEAVES')));
            };

            // Face culling core rule:
            // if neighbor block is not AIR and both sides are opaque, the face is hidden and skipped.
            const shouldCullFace = (id, nid) => {
                if (nid === 0) return false;
                const selfTransparent = isTransparentBlock(id);
                const neighborTransparent = isTransparentBlock(nid);
                if (!selfTransparent && !neighborTransparent) return true;
                if (selfTransparent && nid === id) return true;
                return false;
            };

            const shouldDrawFace = (id, nid) => !shouldCullFace(id, nid);

            const getFaceUvInfo = (blockId, faceName, fallbackUv) => {
                const mat = blockMaterials[blockId];
                const rect = mat?.textureUvByFace?.[faceName];
                if (!rect) return { uv: fallbackUv, canTile: true };

                // Greedy quads should always tile by merged block size so textures
                // render in rows/columns based on quad length instead of stretching.
                return { uv: getFaceUVs(blockId, faceName, fallbackUv), canTile: true };
            };

            const scaledUv = (uv, repeatU, repeatV) => {
                const u0 = Math.min(uv[0], uv[2], uv[4], uv[6]);
                const u1 = Math.max(uv[0], uv[2], uv[4], uv[6]);
                const v0 = Math.min(uv[1], uv[3], uv[5], uv[7]);
                const v1 = Math.max(uv[1], uv[3], uv[5], uv[7]);
                const du = Math.max(0.000001, u1 - u0);
                const dv = Math.max(0.000001, v1 - v0);
                const out = new Array(8);
                for (let i = 0; i < 4; i++) {
                    const bu = (uv[i * 2] - u0) / du;
                    const bv = (uv[i * 2 + 1] - v0) / dv;
                    out[i * 2] = u0 + du * (bu * repeatU);
                    out[i * 2 + 1] = v0 + dv * (bv * repeatV);
                }
                return out;
            };

            const ensureGeometryData = (materialKey) => {
                if (!geometryData[materialKey]) geometryData[materialKey] = { pos: [], norm: [], col: [], uv: [] };
                return geometryData[materialKey];
            };

            const isAOOccluder = (id) => {
                if (!id) return false;
                if (id === 22) return false;
                const mat = blockMaterials[id];
                if (!mat) return false;
                return !(mat.transparent || (mat.textured && mat.textureKey === 'LEAVES'));
            };

            const sampleAOFromCorner = (dir, corners, cornerIndex) => {
                const c = corners[cornerIndex];
                const center = [
                    (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) * 0.25,
                    (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) * 0.25,
                    (corners[0][2] + corners[1][2] + corners[2][2] + corners[3][2]) * 0.25,
                ];

                const normalAxis = Math.abs(dir[0]) > 0 ? 0 : (Math.abs(dir[1]) > 0 ? 1 : 2);
                const tangentAxes = normalAxis === 0 ? [1, 2] : (normalAxis === 1 ? [0, 2] : [0, 1]);
                const a1 = tangentAxes[0];
                const a2 = tangentAxes[1];
                const s1 = c[a1] >= center[a1] ? 1 : -1;
                const s2 = c[a2] >= center[a2] ? 1 : -1;

                const wc = [Math.floor(c[0]), Math.floor(c[1]), Math.floor(c[2])];
                wc[normalAxis] = dir[normalAxis] > 0 ? wc[normalAxis] : (wc[normalAxis] - 1);

                const outer = (sign) => sign > 0 ? 0 : -1;
                const inner = (sign) => sign > 0 ? -1 : 0;

                const side1 = wc.slice();
                side1[a1] += outer(s1);
                side1[a2] += inner(s2);

                const side2 = wc.slice();
                side2[a1] += inner(s1);
                side2[a2] += outer(s2);

                const cornerCell = wc.slice();
                cornerCell[a1] += outer(s1);
                cornerCell[a2] += outer(s2);

                const s1Occ = isAOOccluder(getBlockType(side1[0], side1[1], side1[2])) ? 1 : 0;
                const s2Occ = isAOOccluder(getBlockType(side2[0], side2[1], side2[2])) ? 1 : 0;
                const cOcc = isAOOccluder(getBlockType(cornerCell[0], cornerCell[1], cornerCell[2])) ? 1 : 0;

                const aoLevel = (s1Occ && s2Occ) ? 0 : (3 - (s1Occ + s2Occ + cOcc));
                return Math.max(0, Math.min(1, aoLevel / 3));
            };

            const emitQuad = (id, materialKey, dir, corners, uvValues, useAO = true) => {
                const gd = ensureGeometryData(materialKey);
                const triOrder = [0, 1, 2, 0, 2, 3];
                const ao = useAO ? [
                    sampleAOFromCorner(dir, corners, 0),
                    sampleAOFromCorner(dir, corners, 1),
                    sampleAOFromCorner(dir, corners, 2),
                    sampleAOFromCorner(dir, corners, 3),
                ] : [1, 1, 1, 1];
                const baseColorHex = blockMaterials[id].color || 0xd1c17e;
                const baseColor = new THREE.Color(baseColorHex);
                const isTextured = Boolean(materials[materialKey] && materials[materialKey].map);

                for (const ti of triOrder) {
                    const c = corners[ti];
                    gd.pos.push(c[0], c[1], c[2]);
                    gd.norm.push(dir[0], dir[1], dir[2]);
                    if (isTextured) {
                        gd.uv.push(uvValues[ti * 2], uvValues[ti * 2 + 1]);
                        const a = ao[ti];
                        gd.col.push(a, a, a);
                    } else {
                        const a = ao[ti];
                        gd.col.push(baseColor.r * a, baseColor.g * a, baseColor.b * a);
                    }
                }
            };

            const greedyFaces = [
                { name: 'top', dir: [0, 1, 0], axis: 'y', sign: 1 },
                { name: 'bottom', dir: [0, -1, 0], axis: 'y', sign: -1 },
                { name: 'posX', dir: [1, 0, 0], axis: 'x', sign: 1 },
                { name: 'negX', dir: [-1, 0, 0], axis: 'x', sign: -1 },
                { name: 'posZ', dir: [0, 0, 1], axis: 'z', sign: 1 },
                { name: 'negZ', dir: [0, 0, -1], axis: 'z', sign: -1 },
            ];

            for (const face of greedyFaces) {
                if (face.axis === 'y') {
                    for (let y = 0; y < CH; y++) {
                        const visited = Array(CS * CS).fill(false);
                        for (let z = 0; z < CS; z++) {
                            for (let x = 0; x < CS; x++) {
                                const mi = x + z * CS;
                                if (visited[mi]) continue;
                                const id = get(x, y, z);
                                if (id === 0 || id === 22) continue;
                                const mat = blockMaterials[id];
                                if (mat.transparent || (mat.textured && mat.textureKey === 'LEAVES') || mat.shape) continue;
                                const nid = get(x, y + face.sign, z);
                                if (!shouldDrawFace(id, nid)) continue;
                                const materialKey = getMaterialKey(id, face.dir);
                                const uvInfo = getFaceUvInfo(id, face.name, [0,1, 0,0, 1,0, 1,1]);
                                let w = 1;
                                while (x + w < CS) {
                                    const ni = x + w + z * CS;
                                    if (visited[ni]) break;
                                    const id2 = get(x + w, y, z);
                                    if (id2 !== id) break;
                                    if (getMaterialKey(id2, face.dir) !== materialKey) break;
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
                                        if (getMaterialKey(id2, face.dir) !== materialKey) break outerY;
                                        if (!shouldDrawFace(id2, get(x + k, y + face.sign, z + h))) break outerY;
                                    }
                                    h++;
                                }
                                for (let dz = 0; dz < h; dz++) for (let dx = 0; dx < w; dx++) visited[(x + dx) + (z + dz) * CS] = true;
                                const wx = cx * CS + x;
                                const wz = cz * CS + z;
                                const py = face.sign > 0 ? y + 1 : y;
                                const corners = face.sign > 0
                                    ? [[wx, py, wz + h], [wx + w, py, wz + h], [wx + w, py, wz], [wx, py, wz]]
                                    : [[wx, py, wz], [wx + w, py, wz], [wx + w, py, wz + h], [wx, py, wz + h]];
                                const uv = uvInfo.canTile ? scaledUv(uvInfo.uv, w, h) : uvInfo.uv;
                                emitQuad(id, materialKey, face.dir, corners, uv);
                            }
                        }
                    }
                } else if (face.axis === 'x') {
                    for (let x = 0; x < CS; x++) {
                        const visited = Array(CH * CS).fill(false);
                        for (let z = 0; z < CS; z++) {
                            for (let y = 0; y < CH; y++) {
                                const mi = y + z * CH;
                                if (visited[mi]) continue;
                                const id = get(x, y, z);
                                if (id === 0 || id === 22) continue;
                                const mat = blockMaterials[id];
                                if (mat.transparent || (mat.textured && mat.textureKey === 'LEAVES') || mat.shape) continue;
                                const nid = get(x + face.sign, y, z);
                                if (!shouldDrawFace(id, nid)) continue;
                                const materialKey = getMaterialKey(id, face.dir);
                                const uvInfo = getFaceUvInfo(id, face.name, [0,1, 0,0, 1,0, 1,1]);
                                let w = 1;
                                while (y + w < CH) {
                                    const ni = (y + w) + z * CH;
                                    if (visited[ni]) break;
                                    const id2 = get(x, y + w, z);
                                    if (id2 !== id) break;
                                    if (getMaterialKey(id2, face.dir) !== materialKey) break;
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
                                        if (getMaterialKey(id2, face.dir) !== materialKey) break outerX;
                                        if (!shouldDrawFace(id2, get(x + face.sign, y + k, z + h))) break outerX;
                                    }
                                    h++;
                                }
                                for (let dz = 0; dz < h; dz++) for (let dy = 0; dy < w; dy++) visited[(y + dy) + (z + dz) * CH] = true;
                                const wx = cx * CS + x;
                                const wz = cz * CS + z;
                                const px = face.sign > 0 ? wx + 1 : wx;
                                const corners = face.sign > 0
                                    ? [[px, y + w, wz + h], [px, y, wz + h], [px, y, wz], [px, y + w, wz]]
                                    : [[px, y + w, wz], [px, y, wz], [px, y, wz + h], [px, y + w, wz + h]];
                                const uv = uvInfo.canTile ? scaledUv(uvInfo.uv, h, w) : uvInfo.uv;
                                emitQuad(id, materialKey, face.dir, corners, uv);
                            }
                        }
                    }
                } else {
                    for (let z = 0; z < CS; z++) {
                        const visited = Array(CH * CS).fill(false);
                        for (let x = 0; x < CS; x++) {
                            for (let y = 0; y < CH; y++) {
                                const mi = y + x * CH;
                                if (visited[mi]) continue;
                                const id = get(x, y, z);
                                if (id === 0 || id === 22) continue;
                                const mat = blockMaterials[id];
                                if (mat.transparent || (mat.textured && mat.textureKey === 'LEAVES') || mat.shape) continue;
                                const nid = get(x, y, z + face.sign);
                                if (!shouldDrawFace(id, nid)) continue;
                                const materialKey = getMaterialKey(id, face.dir);
                                const uvInfo = getFaceUvInfo(id, face.name, [0,1, 0,0, 1,0, 1,1]);
                                let w = 1;
                                while (y + w < CH) {
                                    const ni = (y + w) + x * CH;
                                    if (visited[ni]) break;
                                    const id2 = get(x, y + w, z);
                                    if (id2 !== id) break;
                                    if (getMaterialKey(id2, face.dir) !== materialKey) break;
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
                                        if (getMaterialKey(id2, face.dir) !== materialKey) break outerZ;
                                        if (!shouldDrawFace(id2, get(x + h, y + k, z + face.sign))) break outerZ;
                                    }
                                    h++;
                                }
                                for (let dx = 0; dx < h; dx++) for (let dy = 0; dy < w; dy++) visited[(y + dy) + (x + dx) * CH] = true;
                                const wx = cx * CS + x;
                                const wz = cz * CS + z;
                                const pz = face.sign > 0 ? wz + 1 : wz;
                                const corners = face.sign > 0
                                    ? [[wx, y + w, pz], [wx, y, pz], [wx + h, y, pz], [wx + h, y + w, pz]]
                                    : [[wx + h, y + w, pz], [wx + h, y, pz], [wx, y, pz], [wx, y + w, pz]];
                                const uv = uvInfo.canTile ? scaledUv(uvInfo.uv, h, w) : uvInfo.uv;
                                emitQuad(id, materialKey, face.dir, corners, uv);
                            }
                        }
                    }
                }
            }

            // Keep non-cube/transparent blocks on classic meshing path.
            for (let x = 0; x < CS; x++) {
                for (let z = 0; z < CS; z++) {
                    for (let y = 0; y < CH; y++) {
                        const id = get(x, y, z);
                        if (id === 0) continue;
                        const mat = blockMaterials[id];
                        const isTorch = id === 22;
                        const isBambooStage = id === 99 || id === 100;
                        const isBambooStalk = id === 101;
                        const isSlab = mat.shape === 'slab';
                        const sideRenderMode = getSideRenderMode(id);
                        const isSideRenderBlock = Boolean(sideRenderMode);
                        if (isTorch) torchPositions.push({ x: x + cx * CS, y, z: z + cz * CS });
                        if (id === 119) glowstonePositions.push({ x: x + cx * CS, y, z: z + cz * CS, id });
                        const isTrans = mat.transparent || (mat.textured && mat.textureKey === 'LEAVES');
                        if (!isTorch && !isBambooStage && !isBambooStalk && !isSlab && !isSideRenderBlock && !isTrans) continue;
                        const activeFaces = isSideRenderBlock
                            ? (sideRenderMode === 'plane'
                                ? singlePlaneFaces
                                : (sideRenderMode === 'plane_x' ? singlePlaneFacesX : crossPlantFaces))
                            : (isTorch ? torchFaces : (isBambooStalk ? bambooStalkFaces : (isBambooStage ? bambooStageFaces : (isSlab ? slabFaces : faces))));

                        for (let i = 0; i < activeFaces.length; i++) {
                            const f = activeFaces[i];
                            const nid = get(x + f.dir[0], y + f.dir[1], z + f.dir[2]);
                            let draw = false;
                            if (isTorch || isBambooStage || isBambooStalk || isSlab || isSideRenderBlock) draw = true;
                            else if (shouldDrawFace(id, nid)) draw = true;
                            if (!draw) continue;

                            const materialKey = getMaterialKey(id, f.dir);
                            const faceName = f.name || getFaceName(f.dir) || 'posX';
                            const uvInfo = getFaceUvInfo(id, faceName, f.uv);
                            const wx = x + cx * CS;
                            const wz = z + cz * CS;
                            const corners = f.corners.map((c) => [wx + c[0], y + c[1], wz + c[2]]);
                            emitQuad(id, materialKey, f.dir, corners, uvInfo.uv, !(isTorch || isBambooStage || isBambooStalk || isSideRenderBlock));
                        }
                    }
                }
            }
            // Generate / update chunk VBO meshes for all accumulated materials.
            const activeKeys = new Set(Object.keys(geometryData));
            for (const key of activeKeys) {
                const gd = geometryData[key];
                if (!gd || gd.pos.length === 0) continue;

                const geom = new THREE.BufferGeometry();
                const posAttr = new THREE.Float32BufferAttribute(gd.pos, 3);
                const normAttr = new THREE.Float32BufferAttribute(gd.norm, 3);
                posAttr.setUsage(THREE.StaticDrawUsage);
                normAttr.setUsage(THREE.StaticDrawUsage);
                geom.setAttribute('position', posAttr);
                geom.setAttribute('normal', normAttr);

                let currentMaterial = materials[key];

                // Set UVs if material is textured (i.e., it has a map)
                if (currentMaterial && currentMaterial.map && gd.uv.length > 0) {
                    const uvAttr = new THREE.Float32BufferAttribute(gd.uv, 2);
                    uvAttr.setUsage(THREE.StaticDrawUsage);
                    geom.setAttribute('uv', uvAttr);
                }

                // Set vertex colors for AO tint / color fallback.
                if (gd.col.length > 0) {
                    const colAttr = new THREE.Float32BufferAttribute(gd.col, 3);
                    colAttr.setUsage(THREE.StaticDrawUsage);
                    geom.setAttribute('color', colAttr);

                    // For non-textured materials keep vertex-color pipeline.
                    if (!(currentMaterial && currentMaterial.map) && key !== 'WATER') {
                       currentMaterial = materials.COLORED_OPAQUE;
                    }
                }

                const existing = meshesByKey.get(key);
                if (existing) {
                    const oldGeom = existing.geometry;
                    existing.geometry = geom;
                    existing.material = currentMaterial;
                    existing.visible = true;
                    if (oldGeom) oldGeom.dispose();
                } else {
                    const mesh = new THREE.Mesh(geom, currentMaterial);
                    mesh.frustumCulled = true;
                    meshesByKey.set(key, mesh);
                    group.add(mesh);
                }
            }

            // Remove stale material VBOs no longer needed for this chunk.
            for (const [key, mesh] of meshesByKey.entries()) {
                if (activeKeys.has(key)) continue;
                if (mesh.geometry) mesh.geometry.dispose();
                group.remove(mesh);
                meshesByKey.delete(key);
            }

            syncTorchLightsForChunk(group, torchPositions, glowstonePositions);
        }

        const SPAWN_MIN_LIGHT_LEVEL = 7;

        function isSafeSpawnSpot(x, z) {
            const wx = Math.floor(x);
            const wz = Math.floor(z);

            for (let y = CHUNK_HEIGHT - 3; y >= 2; y--) {
                const under = getBlockType(wx, y - 1, wz);
                const feet = getBlockType(wx, y, wz);
                const head = getBlockType(wx, y + 1, wz);

                if (!isSolid(under) || isLiquid(under) || under === 6) continue;
                if (feet !== 0 || head !== 0) continue;

                let blocked = false;
                for (let dx = -1; dx <= 1 && !blocked; dx++) {
                    for (let dz = -1; dz <= 1 && !blocked; dz++) {
                        const f = getBlockType(wx + dx, y, wz + dz);
                        const h = getBlockType(wx + dx, y + 1, wz + dz);
                        const u = getBlockType(wx + dx, y - 1, wz + dz);
                        if (isLiquid(f) || isLiquid(h) || isLiquid(u)) blocked = true;
                    }
                }
                if (blocked) continue;

                if (lightingSystem && !lightingSystem.isOpenToSky(wx, y, wz)) continue;
                const lightLevel = lightingSystem ? lightingSystem.getCombinedLight(wx, y, wz) : 15;
                if (lightLevel < SPAWN_MIN_LIGHT_LEVEL) continue;

                return { y, lightLevel };
            }
            return null;
        }

        function teleportToCoordinates(x, y, z) {
            if (!yawObject) return { ok: false, message: 'Player not ready.' };
            const tx = Number(x);
            const ty = Number(y);
            const tz = Number(z);
            if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) {
                return { ok: false, message: 'Invalid coordinates.' };
            }
            const safeY = Math.max(2, Math.min(CHUNK_HEIGHT - 2, Math.floor(ty)));
            yawObject.position.set(tx, safeY, tz);
            player.velocity.set(0, 0, 0);
            player.isJumping = false;
            ensureChunksAroundPlayer(true);
            return { ok: true, message: `Teleported to ${Math.floor(tx)}, ${Math.floor(safeY)}, ${Math.floor(tz)}.` };
        }

        function normalizeBiomeCommandName(raw) {
            return resolveBiomeProfile(raw)?.name || '';
        }

        function teleportToBiome(rawBiomeName) {
            const targetBiome = normalizeBiomeCommandName(rawBiomeName);
            if (!targetBiome) return { ok: false, message: 'Unknown biome. Try plains, forest, oak_forest, desert, mountains, snowy_plains, jungle, ocean.' };
            const biomeAnchorSearchRadius = 2400;
            const biomeAnchorStep = 6;
            const localSpawnSearchRadius = 96;

            function tryFindSpawnAround(originX, originZ, matchBiome) {
                for (let r = 0; r <= localSpawnSearchRadius; r++) {
                    for (let dx = -r; dx <= r; dx++) {
                        const edgeZ = r;
                        for (const dz of [-edgeZ, edgeZ]) {
                            const x = originX + dx;
                            const z = originZ + dz;
                            const wx = Math.floor(x);
                            const wz = Math.floor(z);
                            const biome = getBiome(wx, wz);
                            if (matchBiome && biome !== matchBiome) continue;
                            if (isOceanBiomeName(biome) || biome === 'Frozen River') continue;
                            if (getRiverMask(wx, wz) > 0.45) continue;
                            const safe = isSafeSpawnSpot(x, z);
                            if (safe) return { x, z, safe, biome };
                        }
                    }
                    for (let dz = -r + 1; dz <= r - 1; dz++) {
                        const edgeX = r;
                        for (const dx of [-edgeX, edgeX]) {
                            const x = originX + dx;
                            const z = originZ + dz;
                            const wx = Math.floor(x);
                            const wz = Math.floor(z);
                            const biome = getBiome(wx, wz);
                            if (matchBiome && biome !== matchBiome) continue;
                            if (isOceanBiomeName(biome) || biome === 'Frozen River') continue;
                            if (getRiverMask(wx, wz) > 0.45) continue;
                            const safe = isSafeSpawnSpot(x, z);
                            if (safe) return { x, z, safe, biome };
                        }
                    }
                }
                return null;
            }

            for (let r = 0; r <= biomeAnchorSearchRadius; r += biomeAnchorStep) {
                for (let d = -r; d <= r; d += biomeAnchorStep) {
                    const candidates = [[d, r], [d, -r], [r, d], [-r, d]];
                    for (const [x, z] of candidates) {
                        if (Math.abs(x) > biomeAnchorSearchRadius || Math.abs(z) > biomeAnchorSearchRadius) continue;
                        const wx = Math.floor(x);
                        const wz = Math.floor(z);
                        if (getBiome(wx, wz) !== targetBiome) continue;
                        const spawn = tryFindSpawnAround(wx + 0.5, wz + 0.5, targetBiome);
                        if (!spawn) continue;
                        yawObject.position.set(spawn.x, spawn.safe.y, spawn.z);
                        player.velocity.set(0, 0, 0);
                        player.isJumping = false;
                        ensureChunksAroundPlayer(true);
                        return { ok: true, biome: targetBiome, message: `Teleported to ${targetBiome} at ${Math.floor(spawn.x)}, ${Math.floor(spawn.safe.y)}, ${Math.floor(spawn.z)}.` };
                    }
                }
            }

            return { ok: false, message: `Could not find nearby ${targetBiome}.` };
        }


        function normalizeVillageBiomeName(rawBiomeName) {
            const profile = resolveBiomeProfile(rawBiomeName);
            return profile?.villageKey ? profile.name : '';
        }

        function normalizeRuinBiomeKey(rawBiomeName) {
            return window.RuinsGeneration?.normalizeRuinBiomeKey?.(rawBiomeName) || '';
        }

        function formatRuinBiomeKeyList() {
            return (window.RuinsGeneration?.VALID_RUIN_BIOMES || ['desert', 'plains', 'jungle']).join(', ');
        }

        function teleportToVillageStructure(rawBiomeName) {
            const targetBiome = normalizeVillageBiomeName(rawBiomeName);
            if (!targetBiome) {
                return { ok: false, message: `Village biome must be one of: ${formatVillageBiomeKeyList()}.` };
            }

            const vg = window.VillageGeneration || {};
            const regionSize = Number(vg.DEFAULT_STRUCTURE_REGION_SIZE) || 384;
            const chance = Number(vg.DEFAULT_VILLAGE_CHANCE_PER_REGION) || 0.36;
            const searchRegionRadius = 22;

            function biomeMatchesVillageTarget(actualBiome) {
                return normalizeVillageBiomeKey(actualBiome) === normalizeVillageBiomeKey(targetBiome);
            }

            for (let r = 0; r <= searchRegionRadius; r++) {
                for (let rx = -r; rx <= r; rx++) {
                    for (const rz of [-r, r]) {
                        const cx = rx;
                        const cz = rz;
                        const candidateInfo = vg.getVillageRegionCandidate
                            ? vg.getVillageRegionCandidate({
                                regionX: cx,
                                regionZ: cz,
                                hashRand2D,
                                getBiomeAt: (x, z) => getBiome(Math.floor(x), Math.floor(z)),
                                chance,
                                regionSize
                            })
                            : null;
                        if (!candidateInfo?.allowed || !candidateInfo.candidate) continue;

                        const wx = Math.floor(candidateInfo.candidate.worldX);
                        const wz = Math.floor(candidateInfo.candidate.worldZ);
                        const biome = getBiome(wx, wz);
                        if (!biomeMatchesVillageTarget(biome)) continue;

                        const h = getNoiseGroundHeight(wx, wz, biome);
                        const y = isOceanBiomeName(biome) ? Math.max(4, Math.floor(h) + 4) : Math.max(4, Math.floor(h) + 3);

                        yawObject.position.set(wx + 0.5, y, wz + 0.5);
                        player.velocity.set(0, 0, 0);
                        player.isJumping = false;
                        ensureChunksAroundPlayer(true);
                        return {
                            ok: true,
                            structure: 'village',
                            biome: targetBiome,
                            message: `Teleported to village core well in ${targetBiome} at ${wx}, ${Math.floor(y)}, ${wz}.`
                        };
                    }
                }
                for (let rz = -r + 1; rz <= r - 1; rz++) {
                    for (const rx of [-r, r]) {
                        const cx = rx;
                        const cz = rz;
                        const candidateInfo = vg.getVillageRegionCandidate
                            ? vg.getVillageRegionCandidate({
                                regionX: cx,
                                regionZ: cz,
                                hashRand2D,
                                getBiomeAt: (x, z) => getBiome(Math.floor(x), Math.floor(z)),
                                chance,
                                regionSize
                            })
                            : null;
                        if (!candidateInfo?.allowed || !candidateInfo.candidate) continue;

                        const wx = Math.floor(candidateInfo.candidate.worldX);
                        const wz = Math.floor(candidateInfo.candidate.worldZ);
                        const biome = getBiome(wx, wz);
                        if (!biomeMatchesVillageTarget(biome)) continue;

                        const h = getNoiseGroundHeight(wx, wz, biome);
                        const y = isOceanBiomeName(biome) ? Math.max(4, Math.floor(h) + 4) : Math.max(4, Math.floor(h) + 3);

                        yawObject.position.set(wx + 0.5, y, wz + 0.5);
                        player.velocity.set(0, 0, 0);
                        player.isJumping = false;
                        ensureChunksAroundPlayer(true);
                        return {
                            ok: true,
                            structure: 'village',
                            biome: targetBiome,
                            message: `Teleported to village core well in ${targetBiome} at ${wx}, ${Math.floor(y)}, ${wz}.`
                        };
                    }
                }
            }

            return { ok: false, message: `Could not find village candidate in biome ${targetBiome}.` };
        }

        function teleportToRuinStructure(rawBiomeName) {
            const rg = window.RuinsGeneration || {};
            const targetBiomeKey = normalizeRuinBiomeKey(rawBiomeName);
            if (!targetBiomeKey) {
                return { ok: false, message: `Ruins biome must be one of: ${formatRuinBiomeKeyList()}.` };
            }

            const regionSize = Number(rg.DEFAULT_RUIN_REGION_SIZE) || 256;
            const chance = Number(rg.DEFAULT_RUIN_CHANCE_PER_REGION) || 0.28;
            const searchRegionRadius = 26;

            for (let r = 0; r <= searchRegionRadius; r++) {
                for (let rx = -r; rx <= r; rx++) {
                    for (const rz of [-r, r]) {
                        const candidateInfo = rg.getRuinRegionCandidate?.({
                            regionX: rx,
                            regionZ: rz,
                            hashRand2D,
                            getBiomeAt: (x, z) => getBiome(Math.floor(x), Math.floor(z)),
                            chance,
                            regionSize,
                        });
                        if (!candidateInfo?.allowed || !candidateInfo.candidate) continue;
                        if (candidateInfo.candidate.biomeKey !== targetBiomeKey) continue;

                        const wx = Math.floor(candidateInfo.candidate.worldX);
                        const wz = Math.floor(candidateInfo.candidate.worldZ);
                        const biome = getBiome(wx, wz);
                        const y = Math.max(4, Math.floor(getNoiseGroundHeight(wx, wz, biome)) + 4);
                        yawObject.position.set(wx + 0.5, y, wz + 0.5);
                        player.velocity.set(0, 0, 0);
                        player.isJumping = false;
                        ensureChunksAroundPlayer(true);
                        return {
                            ok: true,
                            structure: 'ruins',
                            biome: rg.biomeDisplayNameFromKey?.(targetBiomeKey) || targetBiomeKey,
                            message: `Teleported to ruins in ${rg.biomeDisplayNameFromKey?.(targetBiomeKey) || targetBiomeKey} at ${wx}, ${Math.floor(y)}, ${wz}.`,
                        };
                    }
                }
                for (let rz = -r + 1; rz <= r - 1; rz++) {
                    for (const rx of [-r, r]) {
                        const candidateInfo = rg.getRuinRegionCandidate?.({
                            regionX: rx,
                            regionZ: rz,
                            hashRand2D,
                            getBiomeAt: (x, z) => getBiome(Math.floor(x), Math.floor(z)),
                            chance,
                            regionSize,
                        });
                        if (!candidateInfo?.allowed || !candidateInfo.candidate) continue;
                        if (candidateInfo.candidate.biomeKey !== targetBiomeKey) continue;

                        const wx = Math.floor(candidateInfo.candidate.worldX);
                        const wz = Math.floor(candidateInfo.candidate.worldZ);
                        const biome = getBiome(wx, wz);
                        const y = Math.max(4, Math.floor(getNoiseGroundHeight(wx, wz, biome)) + 4);
                        yawObject.position.set(wx + 0.5, y, wz + 0.5);
                        player.velocity.set(0, 0, 0);
                        player.isJumping = false;
                        ensureChunksAroundPlayer(true);
                        return {
                            ok: true,
                            structure: 'ruins',
                            biome: rg.biomeDisplayNameFromKey?.(targetBiomeKey) || targetBiomeKey,
                            message: `Teleported to ruins in ${rg.biomeDisplayNameFromKey?.(targetBiomeKey) || targetBiomeKey} at ${wx}, ${Math.floor(y)}, ${wz}.`,
                        };
                    }
                }
            }

            return { ok: false, message: `Could not find ruins candidate in biome ${targetBiomeKey}.` };
        }

        function setInitialPlayerPosition() {
            const localSpawnSearchRadius = 96;
            const biomeAnchorSearchRadius = 1400;
            const biomeAnchorStep = 6;

            function tryFindBiomeAnchor(targetBiome) {
                if (!targetBiome) return null;
                for (let r = 0; r <= biomeAnchorSearchRadius; r += biomeAnchorStep) {
                    for (let d = -r; d <= r; d += biomeAnchorStep) {
                        const candidates = [
                            [d, r],
                            [d, -r],
                            [r, d],
                            [-r, d],
                        ];
                        for (const [x, z] of candidates) {
                            if (Math.abs(x) > biomeAnchorSearchRadius || Math.abs(z) > biomeAnchorSearchRadius) continue;
                            const wx = Math.floor(x);
                            const wz = Math.floor(z);
                            const biome = getBiome(wx, wz);
                            if (biome !== targetBiome) continue;
                            if (isOceanBiomeName(biome) || biome === 'Frozen River') continue;
                            if (getRiverMask(wx, wz) > 0.58) continue;
                            return { x: wx + 0.5, z: wz + 0.5, biome };
                        }
                    }
                }
                return null;
            }

            function tryFindSpawnAround(originX, originZ, matchBiome) {
                for (let r = 0; r <= localSpawnSearchRadius; r++) {
                    for (let dx = -r; dx <= r; dx++) {
                        const edgeZ = r;
                        for (const dz of [-edgeZ, edgeZ]) {
                            const x = originX + dx;
                            const z = originZ + dz;
                            const wx = Math.floor(x);
                            const wz = Math.floor(z);
                            const biome = getBiome(wx, wz);
                            if (matchBiome && biome !== matchBiome) continue;
                            if (isOceanBiomeName(biome) || biome === 'Frozen River') continue;
                            if (getRiverMask(wx, wz) > 0.45) continue;
                            const safe = isSafeSpawnSpot(x, z);
                            if (safe) return { x, z, safe, biome };
                        }
                    }
                    for (let dz = -r + 1; dz <= r - 1; dz++) {
                        const edgeX = r;
                        for (const dx of [-edgeX, edgeX]) {
                            const x = originX + dx;
                            const z = originZ + dz;
                            const wx = Math.floor(x);
                            const wz = Math.floor(z);
                            const biome = getBiome(wx, wz);
                            if (matchBiome && biome !== matchBiome) continue;
                            if (isOceanBiomeName(biome) || biome === 'Frozen River') continue;
                            if (getRiverMask(wx, wz) > 0.45) continue;
                            const safe = isSafeSpawnSpot(x, z);
                            if (safe) return { x, z, safe, biome };
                        }
                    }
                }
                return null;
            }

            const preferredAnchor = tryFindBiomeAnchor(spawnBiomeName);
            const preferredSpawn = preferredAnchor
                ? tryFindSpawnAround(preferredAnchor.x, preferredAnchor.z, spawnBiomeName)
                : null;
            const nearbyPreferredSpawn = preferredSpawn || tryFindSpawnAround(0.5, 0.5, spawnBiomeName);
            const fallbackSpawn = nearbyPreferredSpawn || tryFindSpawnAround(0.5, 0.5, null);

            if (fallbackSpawn) {
                yawObject.position.set(fallbackSpawn.x, fallbackSpawn.safe.y, fallbackSpawn.z);
                showGameMessage(`Spawned in ${fallbackSpawn.biome} (pref ${spawnBiomeName}, light ${fallbackSpawn.safe.lightLevel})`);
                console.info('[Actual spawn biome]', fallbackSpawn.biome, 'at', Math.floor(fallbackSpawn.x), Math.floor(fallbackSpawn.z), '[Preferred]', spawnBiomeName);
                return;
            }

            yawObject.position.set(0.5, SEA_LEVEL + 8, 0.5);
        }



        function getChunkRetentionRadius() {
            return chunkStreamOptimizations?.getChunkRetentionRadius?.() || (currentChunkLoadRadius + 1);
        }

        function ensureChunksAroundPlayer(forceUpdate = false, nowMs = performance.now()) {
            chunkStreamOptimizations?.ensureChunksAroundPlayer?.(forceUpdate, nowMs);
        }

        function generateWorld() {
            ensureChunksAroundPlayer(true);
        }

        function processMeshUpdateQueue() {
            rebuildDirtyChunkMeshes(false);
        }

        function maybeUpdateChunkFrustumCulling(nowMs) {
            frustumOptimizations?.maybeUpdateChunkFrustumCulling?.(nowMs);
        }

        function updateMining(deltaMs) {
            miningSwingTimerMs = Math.max(0, miningSwingTimerMs - deltaMs);
            if (!isLeftMouseDown) {
                miningState.active = false;
                updateBreakingOverlay();
                return;
            }

            const target = getTargetBlockFromCrosshair();
            if (!target) {
                if (miningState.active) {
                    miningState.missMs += deltaMs;
                    if (miningState.missMs <= 220) {
                        updateBreakingOverlay();
                        return;
                    }
                }
                miningState.active = false;
                updateBreakingOverlay();
                return;
            }

            miningState.missMs = 0;
            const currentKey = `${target.wx},${target.wy},${target.wz}`;
            if (!miningState.active || miningState.key !== currentKey) {
                beginMiningTarget(target);
                updateBreakingOverlay();
                return;
            }

            miningState.elapsedMs += deltaMs;
            miningState.particleMs = (miningState.particleMs || 0) + deltaMs;
            if (miningState.particleMs >= 95 && miningState.blockPos) {
                const wx = Math.floor(miningState.blockPos.x);
                const wy = Math.floor(miningState.blockPos.y);
                const wz = Math.floor(miningState.blockPos.z);
                emitBreakParticles(wx, wy, wz, 3, false);
                miningSwingTimerMs = 180;
                miningState.particleMs = 0;
            }
            updateBreakingOverlay();

            if (miningState.elapsedMs >= miningState.neededMs) {
                const { blockPos, targetType } = miningState;
                const wx = Math.floor(blockPos.x);
                const wy = Math.floor(blockPos.y);
                const wz = Math.floor(blockPos.z);
                const current = getBlockType(wx, wy, wz);
                if (current === targetType) modifyWorld(blockPos, 0, { dropItems: miningState.dropOnBreak !== false });
                miningSwingTimerMs = 150;
                miningState.active = false;
            }
        }



        function updateBambooGrowth(deltaMs) {
            bambooGrowthTimerMs += deltaMs;
            const tickMs = Number(window.JungleDecorationConfig?.bamboo?.growthTickMs) || 1100;
            if (bambooGrowthTimerMs < tickMs) return;
            bambooGrowthTimerMs = 0;

            const growthRollChance = Number(window.JungleDecorationConfig?.bamboo?.growthRollChance) || 0.18;
            const chunkEntries = Array.from(chunks.values());
            if (!chunkEntries.length) return;
            const sampleCount = Math.min(3, chunkEntries.length);
            for (let sIdx = 0; sIdx < sampleCount; sIdx++) {
                const g = chunkEntries[Math.floor(Math.random() * chunkEntries.length)];
                if (!g?.userData?.chunkData) continue;
                const data = g.userData.chunkData;
                const cx = g.userData.cx;
                const cz = g.userData.cz;
                for (let tries = 0; tries < 24; tries++) {
                    const lx = Math.floor(Math.random() * CHUNK_SIZE);
                    const lz = Math.floor(Math.random() * CHUNK_SIZE);
                    const y = getColumnTopFromData(data, lx, lz) + 1;
                    if (y <= 0 || y >= CHUNK_HEIGHT - 1) continue;
                    const idx = lx + y * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT;
                    const id = data[idx];
                    if (id !== 99 && id !== 100) continue;
                    if (Math.random() > growthRollChance) continue;
                    data[idx] = id === 99 ? 100 : 101;
                    const wx = cx * CHUNK_SIZE + lx;
                    const wz = cz * CHUNK_SIZE + lz;
                    updateChunkAndNeighbors(g, lx, lz);
                    if (id === 100 && y + 1 < CHUNK_HEIGHT && getBlockType(wx, y + 1, wz) === 0 && Math.random() < 0.45) {
                        setBlockTypeRaw(wx, y + 1, wz, 101, true);
                        updateChunkAndNeighbors(g, lx, lz);
                    }
                    break;
                }
            }
        }

        function canDirtSpreadToGrass(wx, wy, wz) {
            return dirtToGrassLoop?.canDirtSpreadToGrass?.(wx, wy, wz) || false;
        }

        function updateGrassSpread(deltaMs) {
            dirtToGrassLoop?.updateGrassSpread?.(deltaMs);
        }

        function animate(time) {

            requestAnimationFrame(animate);
            const delta = lastTime ? (time - lastTime) : 0;
            lastTime = time;

            dayNightCycle?.tick?.(delta);

            const liquidState = getPlayerLiquidState();
            updateBreathing(delta / 1000, liquidState.isUnderLiquid);

            if(!isInventoryOpen) {
                updatePlayerMovement();
                updateMining(delta);
                maybeSpawnLavaParticles(delta);
                updateWorldParticles(delta);
                applyBlockPhysics(time);
                ensureChunksAroundPlayer(false, time);
                maybeUpdateChunkFrustumCulling(time);
                updateGnomes(time);
                pigMob?.update?.(time, delta);
                wolfMob?.update?.(time, delta);
                pandaMob?.update?.(time, delta);
                villagerMob?.update?.(time, delta);
                updateBambooGrowth(delta);
                updateGrassSpread(delta);
                zombieMob?.trySpawnNight?.(delta);
                zombieMob?.update?.(time, delta);
                resolveMobEntityPushing();
                updateEatingAnimation(delta, time);
                updatePlayerAvatarVisuals(time);
                updateFirstPersonHand(time);
                processMeshUpdateQueue();
                const dtSec = delta / 1000;
                if (window.FurnaceSystem) {
                    for (const state of furnaceStates.values()) window.FurnaceSystem.updateState(state, dtSec);
                    if (isInventoryOpen && isFurnaceOpen) renderInventoryScreen();
                }
            } else {
                updatePlayerAvatarVisuals(time);
                updateFirstPersonHand(time);
                inventoryEntityUpdateAccumulatorMs += delta;
                if (inventoryEntityUpdateAccumulatorMs >= INVENTORY_ENTITY_UPDATE_INTERVAL_MS) {
                    const simDelta = Math.min(250, inventoryEntityUpdateAccumulatorMs);
                    inventoryEntityUpdateAccumulatorMs = 0;
                    pigMob?.update?.(time, simDelta);
                    wolfMob?.update?.(time, simDelta);
                    pandaMob?.update?.(time, simDelta);
                    villagerMob?.update?.(time, simDelta);
                    zombieMob?.update?.(time, simDelta);
                    resolveMobEntityPushing();
                }
                updateEatingAnimation(delta, time);
                maybeSpawnLavaParticles(delta);
                updateWorldParticles(delta);
                processMeshUpdateQueue();
                miningState.active = false;
                updateBreakingOverlay();
            }
            updateAdaptiveCrosshair();
            updateCoordinatesUI();
            waypointsMod?.update?.(time, delta);
            renderer.render(scene, camera);
        }
        
        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            targetRenderPixelRatio = computeRenderPixelRatio();
            renderer.setPixelRatio(targetRenderPixelRatio);
        }

        window.onload = init;
