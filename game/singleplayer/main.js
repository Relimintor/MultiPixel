        // --- 1. CONFIGURATION ---
        const {
            CHUNK_SIZE,
            CHUNK_HEIGHT,
            WORLD_RADIUS,
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
            DEFAULT_PLAYER
        } = window.SingleplayerConfig;

        const { checkCraftingRecipe, consumeCraftingInputForOne } = window.CraftingSystem;
        const PickaxeSystem = window.PickaxeSystem || {};
        const BlockHardnessSystem = window.BlockHardnessSystem || {};
        const BlockBreakableSystem = window.BlockBreakableSystem || {};
        const SpawnLighting = window.SpawnLighting || {};

        window.__SINGLEPLAYER_BUILD__ = 'sp-2026-03-01-06';
        console.info('[Singleplayer build]', window.__SINGLEPLAYER_BUILD__);

        const TerrainModules = {};

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

        function resolveWorldSeed() {
            // Always use a fresh random seed per game load so terrain changes each time.
            // Optional override: if WORLD_GEN_SETTINGS.seed is provided, honor that value.
            const configuredSeed = normalizeWorldSeed(worldGenSettings.seed);
            if (configuredSeed) return configuredSeed;
            return Math.floor(Math.random() * 2147483646) + 1;
        }

        TerrainModules['ocean'] = window.OceanTerrain || {
            isBiome: function (ctx) { return ctx.climateNoise <= -0.2; },
            getHeight: function (ctx) { return ctx.SEA_LEVEL - 10 - ctx.terrainNoise * 5; }
        };

        TerrainModules['river'] = window.RiverTerrain || {
            getMask: function (ctx) {
                const scale = 0.001;
                const path = ctx.perlin.noise2D(ctx.wx * scale, ctx.wz * scale);
                return 1.0 - Math.min(1.0, Math.abs(path) / 0.08);
            },
            applyHeight: function (ctx) {
                if (ctx.riverInfluence <= 0.1) return ctx.height;
                return Math.max(ctx.height - ctx.riverInfluence * 15, ctx.SEA_LEVEL - 5);
            }
        };

        TerrainModules['oakForest'] = window.OakForestTerrain || {
            isBiome: function (ctx) { return ctx.distFromCenter < ctx.ISLAND_RADIUS || ctx.detailNoise > 0.1; },
            getHeight: function (ctx) { return ctx.BASE_LAND_Y + ctx.continentalMask * 12 + ctx.terrainNoise * 7; }
        };

        TerrainModules['desert'] = window.DesertTerrain || {
            isBiome: function (ctx) { return ctx.climateNoise > 0.2 && ctx.moistureNoise < 0.2; },
            getHeight: function (ctx) { return ctx.BASE_LAND_Y + 3 + ctx.continentalMask * 10 + ctx.terrainNoise * 5; }
        };

        TerrainModules['plains'] = window.PlainsTerrain || {
            isBiome: function () { return true; },
            getHeight: function (ctx) { return ctx.BASE_LAND_Y + ctx.continentalMask * 8 + ctx.terrainNoise * 2; }
        };

        TerrainModules['snowyPlains'] = window.SnowyPlainsTerrain || {
            isBiome: function (ctx) { return ctx.tempNoise < -0.34 && ctx.humidityNoise > -0.12 && ctx.mountainNoise < 0.58; },
            getHeight: function (ctx) { return ctx.BASE_LAND_Y + ctx.continentalMask * 6 + ctx.terrainNoise * 2 - ctx.erosionNoise; }
        };

        TerrainModules['jungleForest'] = window.JungleForestTerrain || {
            isBiome: function (ctx) { return ctx.tempNoise > 0.45 && ctx.humidityNoise > 0.35 && ctx.mountainNoise < 0.78; },
            getHeight: function (ctx) { return ctx.BASE_LAND_Y + 2 + ctx.continentalMask * 9.5 + ctx.terrainNoise * 6.6 - ctx.erosionNoise * 0.9; }
        };

        TerrainModules['mountains'] = window.MountainsTerrain || {
            isBiome: function (ctx) { return ctx.mountainNoise > 0.62 && ctx.climateNoise > -0.15; },
            getHeight: function (ctx) { return ctx.BASE_LAND_Y + 10 + ctx.continentalMask * 14 + ctx.terrainNoise * 14 + ctx.ridgeNoise * 8; }
        };

        // --- DAY/NIGHT CYCLE CONFIG ---
        const DAY_SEGMENTS = { sunrise: 2 * 60 * 1000, day: 8 * 60 * 1000, sunset: 2 * 60 * 1000, night: 8 * 60 * 1000 };
        const DAY_CYCLE_DURATION = DAY_SEGMENTS.sunrise + DAY_SEGMENTS.day + DAY_SEGMENTS.sunset + DAY_SEGMENTS.night;
        let cycleTimeMs = DAY_SEGMENTS.sunrise + DAY_SEGMENTS.day / 2; // Start near noon
        let lastTime = 0; // For delta time calculation
        let ambientLight, hemiLight, moonLight, dirLight; // global lighting rig

        const SWIM_SPEED_FACTOR = 0.58;
        const SWIM_VERTICAL_SPEED = 0.1;
        const SWIM_SINK_SPEED = -0.028;
        const SWIM_SPRINT_MULTIPLIER = 1.35;
        const BREATH_MAX = 20;
        const BREATH_DRAIN_PER_SEC = BREATH_MAX / 15;
        const BREATH_REGEN_PER_SEC = BREATH_MAX / 4;
        const DROWN_DAMAGE_INTERVAL_SEC = 1;
        const AIR_POP_DURATION_SEC = 0.5;

        // Three.js specific materials created after textures are loaded
        let materials = {};

// --- 2. CREATE PERLIN INSTANCE ---
let worldSeed = resolveWorldSeed();
const perlinInstance = new PerlinNoise(worldSeed);

// Make it globally accessible for biomes
window.perlin = perlinInstance;

        // --- 2. GAME STATE & THREE.JS SETUP ---

      
        const player = {
            velocity: new THREE.Vector3(),
            direction: new THREE.Vector3(),
            moveSpeed: DEFAULT_PLAYER.moveSpeed,
            baseMoveSpeed: DEFAULT_PLAYER.moveSpeed,
            sprintMultiplier: DEFAULT_PLAYER.sprintMultiplier,
            rotationSpeed: DEFAULT_PLAYER.rotationSpeed,
            isJumping: false,
            canMove: false,
            keys: {},
            health: DEFAULT_PLAYER.health,
            maxHealth: DEFAULT_PLAYER.maxHealth,
            fallStartY: 0, 
            inAir: false,
            isMoving: false,
            isSwimming: false
        };

      
        let inventory = new Array(TOTAL_INV_SIZE).fill(null);
        let selectedHotbarIndex = 0; // 0-8
        let isInventoryOpen = false;
        let isCreativeMode = false;
        let isCreativeMenuOpen = false;
        const creativeCatalog = [];
        const playerPrivileges = { fly: false, speed: false, noclip: false };
        let isFlyActive = false;
        let lastSpaceTapAt = 0;
        const FLY_VERTICAL_SPEED = 0.24;

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
        const airState = {
            value: BREATH_MAX,
            drownTimerSec: 0,
            popTimerSec: 0,
            wasUnderLiquid: false,
        };
        let breakingCrackMesh = null;
        let breakParticleTexture = null;
        let lavaParticleTexture = null;
        const activeWorldParticles = [];
        const particleSpritePool = [];
        const particleMaterials = { break: null, lava: null };
        let lavaParticleScanMs = 0;
        let lastPhysicsTickMs = 0;
        const dirtyChunkRemeshReasons = new Map();
        let blockUpdateBatchDepth = 0;
        const batchedChunkRemeshNeeds = new Map();

        function chunkKeyFromCoords(cx, cz) {
            return `${cx},${cz}`;
        }

        // Mesh caching policy:
        // keep chunk meshes in GPU buffers and only remesh on explicit triggers.
        function requestChunkRemesh(cx, cz, reason = 'block') {
            const key = chunkKeyFromCoords(cx, cz);
            const rank = { load: 0, neighbor: 1, block: 2, lighting: 3 };
            const prev = dirtyChunkRemeshReasons.get(key);
            if (!prev || (rank[reason] ?? 0) >= (rank[prev] ?? 0)) {
                dirtyChunkRemeshReasons.set(key, reason);
            }
        }

        function requestChunkAndNeighborsRemesh(cx, cz, reason = 'neighbor') {
            requestChunkRemesh(cx, cz, reason);
            requestChunkRemesh(cx - 1, cz, reason);
            requestChunkRemesh(cx + 1, cz, reason);
            requestChunkRemesh(cx, cz - 1, reason);
            requestChunkRemesh(cx, cz + 1, reason);
        }

        function rebuildDirtyChunkMeshes(forceAll = false) {
            if (dirtyChunkRemeshReasons.size === 0) return 0;
            const budget = forceAll ? MESH_REBUILD_BUDGET_FORCE : MESH_REBUILD_BUDGET_PER_FRAME;
            let processed = 0;

            const pending = Array.from(dirtyChunkRemeshReasons.entries());
            for (const [key, reason] of pending) {
                if (processed >= budget) break;
                dirtyChunkRemeshReasons.delete(key);
                const g = chunks.get(key);
                if (!g) continue;
                const forceRemesh = reason === 'lighting';
                updateChunkGeometry(g, g.userData.chunkData, forceRemesh);
                processed++;
            }
            return processed;
        }

        function markBatchedChunkRemeshNeed(cx, cz, includeNeighbors = false) {
            const key = chunkKeyFromCoords(cx, cz);
            const prev = batchedChunkRemeshNeeds.get(key);
            batchedChunkRemeshNeeds.set(key, Boolean(prev || includeNeighbors));
        }

        function beginBlockUpdateBatch() {
            blockUpdateBatchDepth++;
        }

        function endBlockUpdateBatch() {
            if (blockUpdateBatchDepth <= 0) return;
            blockUpdateBatchDepth--;
            if (blockUpdateBatchDepth > 0) return;

            for (const [key, includeNeighbors] of batchedChunkRemeshNeeds.entries()) {
                const [cxs, czs] = key.split(',');
                const cx = Number(cxs);
                const cz = Number(czs);
                if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;
                requestChunkRemesh(cx, cz, 'block');
                if (includeNeighbors) requestChunkAndNeighborsRemesh(cx, cz, 'neighbor');
            }
            batchedChunkRemeshNeeds.clear();
        }

        function applyBlockUpdateBatch(cb) {
            beginBlockUpdateBatch();
            try {
                return cb();
            } finally {
                endBlockUpdateBatch();
            }
        }
        let physicsCursorY = 1;

        const MOBILE_ASSET_BASE = `${window.SingleplayerConfig?.REPO_BASE_PREFIX || ''}/game/singleplayer/assets/mobile`;
        const coarsePointer = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
        const noHover = window.matchMedia ? window.matchMedia('(hover: none)').matches : false;
        const touchCapable = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
        const mobileControls = {
            // User can choose mode from the start screen; this is the suggested default.
            autoEnabled: coarsePointer || (touchCapable && noHover) || (touchCapable && window.innerWidth <= 1024),
            enabled: false,
            initialized: false,
            moveX: 0,
            moveY: 0,
            sprint: false,
            jump: false,
            joystickPointerId: null,
            worldTouchActive: false,
            worldTouchStartMs: 0,
            worldTouchPointerId: null,
            miningTimer: null,
            isMiningTouch: false,
            lookPointerId: null,
            lastLookX: 0,
            lastLookY: 0,
        };

        const deviceMemoryGb = typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null;
        const cpuThreads = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null;
        const prefersReducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
        const isLowEndDevice = Boolean(
            prefersReducedMotion ||
            (deviceMemoryGb !== null && deviceMemoryGb <= 4) ||
            (cpuThreads !== null && cpuThreads <= 4)
        );
        function computeRenderPixelRatio() {
            const rawDeviceRatio = window.devicePixelRatio || 1;
            const ratioCap = isLowEndDevice ? 1 : 1.5;
            // Limit drawing-buffer pixel count to avoid huge VRAM/RAM spikes on large displays.
            const maxRenderPixels = isLowEndDevice ? 2_000_000 : 3_000_000;
            const viewportPixels = Math.max(1, window.innerWidth * window.innerHeight);
            const budgetRatio = Math.sqrt(maxRenderPixels / viewportPixels);
            const safeRatio = Math.max(0.75, Math.min(ratioCap, budgetRatio));
            return Math.min(rawDeviceRatio, safeRatio);
        }

        let targetRenderPixelRatio = computeRenderPixelRatio();
        const configuredChunkRenderDistance = Math.floor(Number(worldGenSettings.chunkRenderDistance) || 4);
        const baseChunkRenderDistance = Math.max(4, Math.min(WORLD_RADIUS, configuredChunkRenderDistance));
        let currentChunkLoadRadius = baseChunkRenderDistance;
        // Backward-compatible alias for code paths that still reference the old name.
        let effectiveChunkLoadRadius = currentChunkLoadRadius;
        const ENTITY_ACTIVATION_RANGE = Math.max(24, Number(worldGenSettings.entityActivationRange) || 72);
        const ENTITY_ACTIVATION_RANGE_SQ = ENTITY_ACTIVATION_RANGE * ENTITY_ACTIVATION_RANGE;
        const CHUNK_UPDATE_INTERVAL_MS = isLowEndDevice ? 220 : 90;
        const FRUSTUM_CULL_INTERVAL_MS = isLowEndDevice ? 120 : 60;
        const FOG_BASE_NEAR = Math.max(12, effectiveChunkLoadRadius * CHUNK_SIZE * 0.18);
        const FOG_DAY_NEAR_BOOST = Math.max(4, effectiveChunkLoadRadius * CHUNK_SIZE * 0.05);
        const FOG_BASE_FAR = Math.max(54, effectiveChunkLoadRadius * CHUNK_SIZE * 0.72);
        const FOG_DAY_FAR_BOOST = Math.max(16, effectiveChunkLoadRadius * CHUNK_SIZE * 0.22);
        const chunkOffsetsByRadius = new Map();
        let lastChunkUpdateMs = -Infinity;
        let lastFrustumCullMs = -Infinity;
        let lastChunkCoordX = Number.NaN;
        let lastChunkCoordZ = Number.NaN;
     

      
        let scene, camera, renderer, perlin, raycaster;
        let worldGenerator = null;
        let spawnBiomeName = 'Plains';
        let wasmRuntime = window.WorldgenWasmRuntime || null;
        let lightingSystem = null;
        const torchLightsByChunk = new Map();
        const frustum = new THREE.Frustum();
        const cameraViewProj = new THREE.Matrix4();
        const frustumTempCenter = new THREE.Vector3();
        const frustumTempSphere = new THREE.Sphere();
        const lastFrustumCameraPos = new THREE.Vector3();
        const lastFrustumCameraQuat = new THREE.Quaternion();
        let hasFrustumCameraState = false;
        const chunks = new Map();
        const sparseAirChunkKeys = new Set();
        const worldGroup = new THREE.Group();
        let yawObject, pitchObject; 
        let cameraViewMode = 0; // 0=first, 1=second, 2=third
        let playerAvatar = null;
        let playerAvatarParts = null;
        let steveSkinTexture = null;
        let steveSkinFailed = false;
        let steveSkinReady = false;
        let steveSkinLoadPromise = null;
        let firstPersonHandEl = null;
        let firstPersonHeldItemEl = null;
        let inventorySkinRigEl = null;
        let skinSystem = null;
        let iglooStructureDef = null;
        const gnomeEntities = [];
        const pigEntities = [];
        const zombieEntities = [];
        const wolfEntities = [];
        const pigMobDef = window.SingleplayerMobData?.categories?.passive?.pig || null;
        const pigGoalPriority = Array.isArray(pigMobDef?.behavior?.goals)
            ? [...pigMobDef.behavior.goals].sort((a, b) => a.priority - b.priority)
            : [];
        let pigTexture = null;
        let zombieTexture = null;
        let zombieSpawnTimerMs = 0;
        let eatOverlayEl = null;
        let eatItemEl = null;
        let eatingAnimState = { active: false, timeMs: 0, durationMs: 0, itemId: 0, particleMs: 0 };
        
        // Calculate the world boundary coordinates
        const WORLD_MAX_COORD = Number.POSITIVE_INFINITY;
        const WORLD_MIN_COORD = Number.NEGATIVE_INFINITY;
        
        // --- 3. CORE UTILITIES ---

        function isSolid(type) { return SOLID_BLOCKS.includes(type); }
       
        function isLiquid(type) { return LIQUID_BLOCKS.includes(type); }

        function getChunkOffsetsForRadius(radius) {
            const cached = chunkOffsetsByRadius.get(radius);
            if (cached) return cached;
            const offsets = [];
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    offsets.push({ dx, dz, dist2: dx * dx + dz * dz });
                }
            }
            offsets.sort((a, b) => a.dist2 - b.dist2);
            chunkOffsetsByRadius.set(radius, offsets);
            return offsets;
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
                
                const promise = new Promise((resolve, reject) => {
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
                            const matId = getMaterialIdByTextureKey(key);
                            const matCfg = matId >= 0 ? blockMaterials[matId] : {};
                            materials[key] = new THREE.MeshStandardMaterial({
                                map: texture,
                                side: key === 'LEAVES' ? THREE.DoubleSide : THREE.FrontSide,
                                transparent: matCfg.transparent || false,
                                alphaTest: key === 'LEAVES' ? 0.5 : 0,
                                depthWrite: true,
                                opacity: matCfg.opacity || 1.0,
                                vertexColors: true,
                            });
                            resolve();
                        },
                        undefined,
                        (err) => {
                            // This error is expected since the files don't exist in the runtime environment
                            console.error(`Error loading texture from specified path: ${path}. Block will use solid color fallback.`, err);
                            // Still resolve so the game can continue
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

        async function init() {
            
            await applySelectedTexturePackOverrides();
            await loadAssets(); // Load all textures and materials first!
            await loadIglooStructure();
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
            camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
            
            yawObject = new THREE.Object3D();
            pitchObject = new THREE.Object3D();
            pitchObject.position.y = 1.6; 
            
            pitchObject.add(camera);
            yawObject.add(pitchObject);
            scene.add(yawObject);

            await ensureSteveSkinTextureLoaded();
            playerAvatar = createPlayerAvatar();
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

    
            await loadPigTexture();
            await loadZombieTexture();
            generateWorld();
            spawnInitialPigs();
            spawnInitialWolves();
            setupPointerLockControls();
            setupKeyboardControls();
            setupBlockInteraction();
            setupInputModeChooser();
            initChatSystem();
            setInitialPlayerPosition();
            
          
            renderHearts();
            renderAirBubbles(false);
            updateHotbarUI();
            skinSystem = window.SingleplayerSkinSystem?.create({ showGameMessage }) || null;
            const closeBtn = document.getElementById('inventory-close-btn');
            const closeIcon = document.getElementById('inventory-close-icon');
            const editSkinBtn = document.getElementById('edit-skin-btn');
            const editSkinIcon = document.getElementById('edit-skin-icon');
            const furnaceCloseBtn = document.getElementById('furnace-close-btn');
            const furnaceCloseIcon = document.getElementById('furnace-close-icon');
            const chestCloseBtn = document.getElementById('chest-close-btn');
            const chestCloseIcon = document.getElementById('chest-close-icon');
            const assetBasePath = `${window.SingleplayerConfig?.REPO_BASE_PREFIX || ''}/game/singleplayer/assets`;
            const closeIconPath = `${assetBasePath}/mobile/cdb_clear.png`;
            const editSkinIconPath = `${assetBasePath}/ui/inventory/edit_skin_button.png`;
            if (closeIcon) closeIcon.src = closeIconPath;
            if (editSkinIcon) editSkinIcon.src = editSkinIconPath;
            if (furnaceCloseIcon) furnaceCloseIcon.src = closeIconPath;
            if (chestCloseIcon) chestCloseIcon.src = closeIconPath;
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
            if (editSkinBtn) editSkinBtn.addEventListener('click', () => {
                window.location.href = `${window.SingleplayerConfig?.REPO_BASE_PREFIX || '/MultiPixel'}/game/singleplayer/edit/index.html`;
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
            setupFirstPersonHandOverlay();
            setupInventorySkinRig();
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
            
            // Dummy items for testing inventory fix
            addToInventory(5, 5); // Wood Log (for crafting)
            addToInventory(59, 64),

            
            // Set initial sky state
            updateSkyAndSun(); 
            
            animate(0);
        }
        
        // --- Day/Night Cycle Logic ---
        function getTimePhaseInfo() {
            const t = cycleTimeMs % DAY_CYCLE_DURATION;
            const sunriseEnd = DAY_SEGMENTS.sunrise;
            const dayEnd = sunriseEnd + DAY_SEGMENTS.day;
            const sunsetEnd = dayEnd + DAY_SEGMENTS.sunset;

            if (t < sunriseEnd) return { phase: 'Sunrise', localT: t / DAY_SEGMENTS.sunrise };
            if (t < dayEnd) return { phase: 'Day', localT: (t - sunriseEnd) / DAY_SEGMENTS.day };
            if (t < sunsetEnd) return { phase: 'Sunset', localT: (t - dayEnd) / DAY_SEGMENTS.sunset };
            return { phase: 'Night', localT: (t - sunsetEnd) / DAY_SEGMENTS.night };
        }

        function getSunFactor() {
            const phaseInfo = getTimePhaseInfo();
            if (phaseInfo.phase === 'Day') return 1;
            if (phaseInfo.phase === 'Night') return -0.85;
            if (phaseInfo.phase === 'Sunrise') return -0.85 + 1.85 * phaseInfo.localT;
            return 1 - 1.85 * phaseInfo.localT;
        }

        function getCurrentSkyLightCap() {
            const normalized = Math.max(0, Math.min(1, (getSunFactor() + 0.85) / 1.85));
            return Math.max(0, Math.min(15, Math.floor(normalized * 15)));
        }

        function setTimeByClock(hours, minutes) {
            const hh = Number.parseInt(hours, 10);
            const mm = Number.parseInt(minutes, 10);
            if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
            if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return false;
            const minutesOfDay = hh * 60 + mm;
            const dayProgress = minutesOfDay / 1440;
            cycleTimeMs = dayProgress * DAY_CYCLE_DURATION;
            updateSkyAndSun();
            return true;
        }

        function getFogDistances(renderDistance) {
            const radius = Math.max(4, Math.min(WORLD_RADIUS, Number(renderDistance) || 4));
            return {
                nearBase: Math.max(10, radius * CHUNK_SIZE * 0.12),
                nearDayBoost: Math.max(3, radius * CHUNK_SIZE * 0.04),
                farBase: Math.max(42, radius * CHUNK_SIZE * 0.52),
                farDayBoost: Math.max(10, radius * CHUNK_SIZE * 0.16),
            };
        }


        function getBiomeFogAndHumidityEffects() {
            const wx = Math.floor(yawObject?.position?.x || 0);
            const wz = Math.floor(yawObject?.position?.z || 0);
            const biome = getBiome(wx, wz);
            if (biome === 'Jungle Forest') {
                return { humidity: 0.9, nearMul: 1.18, farMul: 0.7 };
            }
            return { humidity: 0.5, nearMul: 1.0, farMul: 1.0 };
        }

        function setRenderDistance(amount) {
            const parsed = Number.parseInt(amount, 10);
            if (!Number.isFinite(parsed)) return false;
            const clamped = Math.max(4, Math.min(WORLD_RADIUS, parsed));
            if (clamped === currentChunkLoadRadius) return true;
            currentChunkLoadRadius = clamped;
            effectiveChunkLoadRadius = currentChunkLoadRadius;
            lastChunkUpdateMs = -Infinity;
            ensureChunksAroundPlayer(true);
            return true;
        }

        function setCameraFov(amount) {
            const parsed = Number.parseFloat(amount);
            if (!Number.isFinite(parsed)) return false;
            const clamped = Math.max(50, Math.min(120, parsed));
            camera.fov = clamped;
            camera.updateProjectionMatrix();
            return true;
        }

        function getCameraFov() {
            return Number(camera?.fov || 90);
        }

        function updateSkyAndSun() {
            const sunFactor = getSunFactor();

            const dayColor = new THREE.Color(0x87ceeb);
            const twilightColor = new THREE.Color(0x9a7d90);
            const nightColor = new THREE.Color(0x1a1a2e);

            let skyColor;
            if (sunFactor > 0.1) {
                const k = Math.min(1, Math.max(0, (sunFactor - 0.1) / 0.9));
                skyColor = twilightColor.clone().lerp(dayColor, k);
            } else {
                const k = Math.min(1, Math.max(0, (sunFactor + 0.85) / 0.95));
                skyColor = nightColor.clone().lerp(twilightColor, k);
            }

            scene.background.copy(skyColor);
            scene.fog.color.copy(skyColor);

            const angle = (cycleTimeMs / DAY_CYCLE_DURATION) * (2 * Math.PI);
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
            const fog = getFogDistances(currentChunkLoadRadius);
            const biomeEffects = getBiomeFogAndHumidityEffects();
            scene.fog.near = (fog.nearBase + daylight * fog.nearDayBoost) * biomeEffects.nearMul;
            scene.fog.far = (fog.farBase + daylight * fog.farDayBoost) * biomeEffects.farMul;
            window.SingleplayerClimateState = window.SingleplayerClimateState || {};
            window.SingleplayerClimateState.humidity = biomeEffects.humidity;
        }


     
        function addToInventory(blockId, amount = 1) {
         
            for (let i = 0; i < TOTAL_INV_SIZE; i++) {
                if (inventory[i] && inventory[i].id === blockId && inventory[i].count < 64) {
                    const capacity = 64 - inventory[i].count;
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
                    inventory[i] = { id: blockId, count: amount };
                    updateHotbarUI();
                    if(isInventoryOpen) renderInventoryScreen();
                    showGameMessage(`+${amount} ${blockMaterials[blockId].name}`);
                    return true;
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

        function showGameMessage(msg) {
            const el = document.getElementById('game-message');
            el.textContent = msg;
            el.style.opacity = 1;
            setTimeout(() => { el.style.opacity = 0; }, 2000);
        }

        async function loadIglooStructure() {
            const path = './terrain/snowy_plains/structures/igloo.json';
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

        async function loadPigTexture() {
            const path = window.SingleplayerConfig?.ASSET_FILEPATHS?.PIG_TEXTURE;
            if (!path) return;
            pigTexture = await new Promise((resolve) => {
                new THREE.TextureLoader().load(path, (t) => {
                    t.magFilter = THREE.NearestFilter;
                    t.minFilter = THREE.NearestFilter;
                    t.flipY = false;
                    t.wrapS = THREE.ClampToEdgeWrapping;
                    t.wrapT = THREE.ClampToEdgeWrapping;
                    resolve(t);
                }, undefined, () => resolve(null));
            });
        }

        async function loadZombieTexture() {
            const path = window.SingleplayerConfig?.ASSET_FILEPATHS?.ZOMBIE_TEXTURE;
            if (!path) return;
            zombieTexture = await new Promise((resolve) => {
                new THREE.TextureLoader().load(path, (t) => {
                    t.magFilter = THREE.NearestFilter;
                    t.minFilter = THREE.NearestFilter;
                    t.flipY = false;
                    t.wrapS = THREE.ClampToEdgeWrapping;
                    t.wrapT = THREE.ClampToEdgeWrapping;
                    resolve(t);
                }, undefined, () => resolve(null));
            });
        }

        function createAtlasFaceTexture(baseTex, rect, atlasW = 64, atlasH = 32) {
            if (!baseTex || !rect) return null;
            const [x, y, w, h] = rect;
            const tex = baseTex.clone();
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.flipY = false;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.repeat.set(w / atlasW, h / atlasH);
            tex.offset.set(x / atlasW, 1 - ((y + h) / atlasH));
            tex.needsUpdate = true;
            return tex;
        }

        function buildMobPartFaceRects(x, y, w, h, d) {
            return {
                0: [x, y + d, w, h],
                1: [x + w + d, y + d, w, h],
                2: [x + w, y, w, d],
                3: [x + w + d, y, w, d],
                4: [x + w, y + d, w, h],
                5: [x + (w * 2) + d, y + d, w, h],
            };
        }

        function createPigPart(dim, rects) {
            const mats = [];
            for (let i = 0; i < 6; i++) {
                const faceTex = createAtlasFaceTexture(pigTexture, rects[i], 64, 32);
                mats.push(new THREE.MeshStandardMaterial({ map: faceTex || null, color: faceTex ? 0xffffff : 0xe8b6b8, roughness: 0.92 }));
            }
            return new THREE.Mesh(new THREE.BoxGeometry(dim[0], dim[1], dim[2]), mats);
        }

        function createPigMesh() {
            const U = 1 / 16;
            const pig = new THREE.Group();

            const body = createPigPart([10 * U, 8 * U, 16 * U], buildMobPartFaceRects(28, 8, 10, 8, 16));
            body.position.y = 10 * U;
            pig.add(body);

            const head = createPigPart([8 * U, 8 * U, 8 * U], buildMobPartFaceRects(0, 0, 8, 8, 8));
            head.position.set(0, 11 * U, 10 * U);
            pig.add(head);

            const legRects = buildMobPartFaceRects(0, 16, 4, 6, 4);
            const legOffsets = [[-3*U, 3*U, 5*U], [3*U, 3*U, 5*U], [-3*U, 3*U, -5*U], [3*U, 3*U, -5*U]];
            const legs = [];
            for (const off of legOffsets) {
                const leg = createPigPart([4 * U, 6 * U, 4 * U], legRects);
                leg.position.set(off[0], off[1], off[2]);
                pig.add(leg);
                legs.push(leg);
            }

            const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 1.0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
            hitbox.position.set(0, 0.5, 0);
            hitbox.userData.pigHitbox = true;
            pig.add(hitbox);
            pig.userData.pigHitbox = hitbox;
            pig.userData.pigHead = head;
            pig.userData.pigLegs = legs;
            return pig;
        }

        function createWolfMesh() {
            const U = 1 / 16;
            const wolf = new THREE.Group();
            const furMat = new THREE.MeshStandardMaterial({ color: 0x9ea4ad, roughness: 0.9 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x676d75, roughness: 0.92 });

            const body = new THREE.Mesh(new THREE.BoxGeometry(10 * U, 6 * U, 16 * U), furMat);
            body.position.y = 9 * U;
            wolf.add(body);

            const neck = new THREE.Mesh(new THREE.BoxGeometry(6 * U, 6 * U, 6 * U), darkMat);
            neck.position.set(0, 10 * U, 7 * U);
            wolf.add(neck);

            const head = new THREE.Mesh(new THREE.BoxGeometry(6 * U, 6 * U, 6 * U), furMat);
            head.position.set(0, 11 * U, 11 * U);
            wolf.add(head);

            const legOffsets = [[-3*U, 3*U, 5*U], [3*U, 3*U, 5*U], [-3*U, 3*U, -5*U], [3*U, 3*U, -5*U]];
            const legs = [];
            for (const off of legOffsets) {
                const leg = new THREE.Mesh(new THREE.BoxGeometry(3 * U, 6 * U, 3 * U), darkMat);
                leg.position.set(off[0], off[1], off[2]);
                wolf.add(leg);
                legs.push(leg);
            }

            const tailPivot = new THREE.Group();
            tailPivot.position.set(0, 9 * U, -8 * U);
            const tail = new THREE.Mesh(new THREE.BoxGeometry(2 * U, 6 * U, 2 * U), darkMat);
            tail.position.set(0, 2.5 * U, -0.5 * U);
            tailPivot.add(tail);
            wolf.add(tailPivot);

            const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.95, 1.05), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
            hitbox.position.set(0, 0.5, 0);
            hitbox.userData.wolfHitbox = true;
            wolf.add(hitbox);
            wolf.userData.wolfHitbox = hitbox;
            wolf.userData.wolfParts = { head, legs, tailPivot, neck };
            return wolf;
        }

        function getZombiePartRects(partName) {
            // Minecraft 64x64 skin layout (classic model):
            // right arm/leg use upper-sheet regions, left arm/leg use lower-sheet regions.
            if (partName === 'head') return buildMobPartFaceRects(0, 0, 8, 8, 8);
            if (partName === 'body') return buildMobPartFaceRects(16, 16, 8, 12, 4);
            if (partName === 'rightArm') return buildMobPartFaceRects(40, 16, 4, 12, 4);
            if (partName === 'leftArm') return buildMobPartFaceRects(32, 48, 4, 12, 4);
            if (partName === 'rightLeg') return buildMobPartFaceRects(0, 16, 4, 12, 4);
            if (partName === 'leftLeg') return buildMobPartFaceRects(16, 48, 4, 12, 4);
            return null;
        }

        function createZombiePart(dim, rects) {
            const mats = [];
            for (let i = 0; i < 6; i++) {
                const faceTex = createAtlasFaceTexture(zombieTexture, rects[i], 64, 64);
                mats.push(new THREE.MeshStandardMaterial({ map: faceTex || null, color: faceTex ? 0xffffff : 0x72b86a, roughness: 0.88 }));
            }
            return new THREE.Mesh(new THREE.BoxGeometry(dim[0], dim[1], dim[2]), mats);
        }

        function createZombieMesh() {
            const U = 1 / 16;
            const root = new THREE.Group();

            const body = createZombiePart([8 * U, 12 * U, 4 * U], getZombiePartRects('body'));
            body.position.y = 18 * U;
            root.add(body);

            const head = createZombiePart([8 * U, 8 * U, 8 * U], getZombiePartRects('head'));
            head.position.y = 28 * U;
            root.add(head);

            const rightArmPivot = new THREE.Group();
            rightArmPivot.position.set(6 * U, 24 * U, 0);
            const rightArm = createZombiePart([4 * U, 12 * U, 4 * U], getZombiePartRects('rightArm'));
            rightArm.position.set(0, -6 * U, 0);
            rightArmPivot.add(rightArm);

            const leftArmPivot = new THREE.Group();
            leftArmPivot.position.set(-6 * U, 24 * U, 0);
            const leftArm = createZombiePart([4 * U, 12 * U, 4 * U], getZombiePartRects('leftArm'));
            leftArm.position.set(0, -6 * U, 0);
            leftArmPivot.add(leftArm);

            const rightLegPivot = new THREE.Group();
            rightLegPivot.position.set(2 * U, 12 * U, 0);
            const rightLeg = createZombiePart([4 * U, 12 * U, 4 * U], getZombiePartRects('rightLeg'));
            rightLeg.position.set(0, -6 * U, 0);
            rightLegPivot.add(rightLeg);

            const leftLegPivot = new THREE.Group();
            leftLegPivot.position.set(-2 * U, 12 * U, 0);
            const leftLeg = createZombiePart([4 * U, 12 * U, 4 * U], getZombiePartRects('leftLeg'));
            leftLeg.position.set(0, -6 * U, 0);
            leftLegPivot.add(leftLeg);

            root.add(leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot);

            const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
            hitbox.position.set(0, 0.9, 0);
            hitbox.userData.zombieHitbox = true;
            root.add(hitbox);
            root.userData.zombieHitbox = hitbox;
            root.userData.zombieParts = { head, leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot };
            return root;
        }

        function getColumnTopFromData(data, lx, lz) {
            for (let y = CHUNK_HEIGHT - 2; y >= 1; y--) {
                const idx = lx + y * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT;
                const block = data[idx];
                if (block !== 0 && block !== 6) return y;
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

        function spawnPigAt(wx, wz) {
            const y = getSurfaceYForEntity(wx, wz);
            if (y < SEA_LEVEL || y > SEA_LEVEL + 24) return false;
            const under = getBlockType(Math.floor(wx), y - 1, Math.floor(wz));
            if (under !== 1 && under !== 2) return false;
            const lightLevel = lightingSystem ? lightingSystem.getCombinedLight(Math.floor(wx), y, Math.floor(wz)) : 15;
            if (lightLevel < 7) return false;
            return spawnPigAtExact(wx, y, wz);
        }

        function spawnPigAtExact(wx, y, wz) {
            const pigRoot = createPigMesh();
            pigRoot.position.set(Math.floor(wx) + 0.5, y, Math.floor(wz) + 0.5);
            scene.add(pigRoot);
            pigEntities.push({
                root: pigRoot,
                hp: 8,
                panicUntilMs: 0,
                dir: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
                changeDirMs: 900 + Math.random() * 1800,
                groundProbeMs: 0,
                targetY: y,
                bobPhase: Math.random() * Math.PI * 2,
                lookYaw: 0,
                lookPitch: 0,
                lookTargetYaw: 0,
                lookTargetPitch: 0,
                nextLookChangeMs: 0,
            });
            return true;
        }

        function spawnInitialPigs() {
            let spawned = 0;
            for (let i = 0; i < 120 && spawned < 10; i++) {
                const wx = (Math.random() * 2 - 1) * (WORLD_RADIUS * CHUNK_SIZE * 0.72);
                const wz = (Math.random() * 2 - 1) * (WORLD_RADIUS * CHUNK_SIZE * 0.72);
                if (spawnPigAt(wx, wz)) spawned++;
            }
        }

        function spawnInitialWolves() {
            let spawned = 0;
            for (let i = 0; i < 180 && spawned < 8; i++) {
                const wx = (Math.random() * 2 - 1) * (WORLD_RADIUS * CHUNK_SIZE * 0.68);
                const wz = (Math.random() * 2 - 1) * (WORLD_RADIUS * CHUNK_SIZE * 0.68);
                if (spawnWolfAt(wx, wz)) spawned++;
            }
        }

        function spawnMobById(mobId, amount = 1) {
            const id = Number.parseInt(mobId, 10);
            if (!Number.isFinite(id)) return 0;
            const qty = Math.max(1, Math.min(64, Number.parseInt(amount, 10) || 1));
            let spawned = 0;

            for (let i = 0; i < qty; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 3 + Math.random() * 6;
                const wx = yawObject.position.x + Math.cos(angle) * dist;
                const wz = yawObject.position.z + Math.sin(angle) * dist;
                const ok = id === 1 ? spawnPigAt(wx, wz) : (id === 2 ? spawnZombieAt(wx, wz) : (id === 3 ? spawnWolfForCommand(wx, wz) : false));
                if (ok) spawned++;
            }
            return spawned;
        }

        function getHeldItemMobKey() {
            const held = inventory[selectedHotbarIndex];
            if (!held) return '';
            const mat = blockMaterials[held.id] || {};
            return String(mat.key || mat.name || '').toLowerCase().replace(/\s+/g, '_');
        }

        function findPigTemptDirection(pig) {
            const temptItems = new Set((pigMobDef?.behavior?.temptItems || []).map((item) => String(item).toLowerCase()));
            if (!temptItems.size) return null;
            const heldKey = getHeldItemMobKey();
            if (!heldKey || !temptItems.has(heldKey)) return null;
            const toPlayer = new THREE.Vector3(yawObject.position.x - pig.root.position.x, 0, yawObject.position.z - pig.root.position.z);
            const dist = toPlayer.length();
            if (dist < 1.2 || dist > 14) return null;
            return toPlayer.normalize();
        }

        function choosePigPriorityGoal(pig, nowMs, nx, nz) {
            const inLiquid = isLiquid(getBlockType(Math.floor(pig.root.position.x), Math.floor(pig.root.position.y), Math.floor(pig.root.position.z)));
            const panicActive = pig.panicUntilMs > nowMs;
            const temptDir = findPigTemptDirection(pig);

            for (const goal of pigGoalPriority) {
                if (goal.key === 'float' && inLiquid) {
                    return { key: goal.key, speed: 1.2, dir: pig.dir.clone(), forceRaise: true, avoidWater: false };
                }
                if (goal.key === 'panic' && panicActive) {
                    return { key: goal.key, speed: 1.35, dir: pig.dir.clone(), forceRaise: false, avoidWater: true };
                }
                if (goal.key === 'tempt' && temptDir) {
                    return { key: goal.key, speed: 0.95, dir: temptDir, forceRaise: false, avoidWater: true };
                }
                if (goal.key === 'stroll') {
                    const nextBlock = getBlockType(Math.floor(nx), Math.floor(pig.root.position.y), Math.floor(nz));
                    if (isLiquid(nextBlock)) {
                        const turnDir = new THREE.Vector3(-pig.dir.z, 0, pig.dir.x);
                        if (turnDir.lengthSq() > 0.000001) turnDir.normalize();
                        return { key: goal.key, speed: 0.75, dir: turnDir, forceRaise: false, avoidWater: true };
                    }
                    return { key: goal.key, speed: 0.75, dir: pig.dir.clone(), forceRaise: false, avoidWater: true };
                }
                if (goal.key === 'lookAtPlayer') {
                    const toPlayer = new THREE.Vector3(yawObject.position.x - pig.root.position.x, 0, yawObject.position.z - pig.root.position.z);
                    if (toPlayer.lengthSq() > 0.000001 && toPlayer.length() < 8) {
                        return { key: goal.key, speed: 0.6, dir: toPlayer.normalize(), forceRaise: false, avoidWater: true, lookAtPlayer: true };
                    }
                }
                if (goal.key === 'idleLook') {
                    return { key: goal.key, speed: 0.55, dir: pig.dir.clone(), forceRaise: false, avoidWater: true, idleLook: true };
                }
            }
            return { key: 'default', speed: 0.75, dir: pig.dir.clone(), forceRaise: false, avoidWater: true };
        }

        function updatePigs(time, deltaMs) {
            if (!pigEntities.length) return;
            const dt = Math.max(0.001, Math.min(0.05, deltaMs / 1000));
            const nowMs = performance.now();
            for (const pig of pigEntities) {
                if (!isEntityActiveAt(pig.root.position)) continue;

                pig.changeDirMs -= deltaMs;
                if (pig.changeDirMs <= 0) {
                    pig.changeDirMs = 900 + Math.random() * 1800;
                    pig.dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                }

                const probeNx = pig.root.position.x + pig.dir.x * 0.75 * dt;
                const probeNz = pig.root.position.z + pig.dir.z * 0.75 * dt;
                const activeGoal = choosePigPriorityGoal(pig, nowMs, probeNx, probeNz);
                if (activeGoal?.dir?.lengthSq() > 0.000001) pig.dir.copy(activeGoal.dir.normalize());

                const speed = activeGoal?.speed || 0.75;
                const nx = pig.root.position.x + pig.dir.x * speed * dt;
                const nz = pig.root.position.z + pig.dir.z * speed * dt;

                pig.groundProbeMs -= deltaMs;
                if (pig.groundProbeMs <= 0) {
                    pig.groundProbeMs = 220 + Math.random() * 180;
                    pig.targetY = getSurfaceYForEntity(nx, nz, pig.targetY);
                }

                if (activeGoal?.forceRaise) {
                    pig.targetY = Math.max(pig.targetY, pig.root.position.y + 0.065);
                }

                if (pig.targetY > 0) {
                    pig.root.position.x = nx;
                    pig.root.position.z = nz;
                    pig.root.position.y += (pig.targetY - pig.root.position.y) * Math.min(1, dt * (activeGoal?.forceRaise ? 14 : 10));
                }
                pig.root.rotation.y = Math.atan2(pig.dir.x, pig.dir.z);

                if (activeGoal?.lookAtPlayer) {
                    const toPlayer = new THREE.Vector3(yawObject.position.x - pig.root.position.x, yawObject.position.y + 1.4 - pig.root.position.y, yawObject.position.z - pig.root.position.z);
                    const yaw = Math.atan2(toPlayer.x, toPlayer.z) - pig.root.rotation.y;
                    const pitch = Math.atan2(toPlayer.y, Math.max(0.01, Math.hypot(toPlayer.x, toPlayer.z)));
                    pig.lookTargetYaw = Math.max(-0.55, Math.min(0.55, yaw));
                    pig.lookTargetPitch = Math.max(-0.3, Math.min(0.3, pitch));
                    pig.nextLookChangeMs = 0;
                } else {
                    pig.nextLookChangeMs -= deltaMs;
                    if (pig.nextLookChangeMs <= 0) {
                        pig.nextLookChangeMs = 700 + Math.random() * 1400;
                        pig.lookTargetYaw = (Math.random() - 0.5) * 0.8;
                        pig.lookTargetPitch = (Math.random() - 0.5) * 0.26;
                    }
                }

                pig.lookYaw += (pig.lookTargetYaw - pig.lookYaw) * Math.min(1, dt * 6);
                pig.lookPitch += (pig.lookTargetPitch - pig.lookPitch) * Math.min(1, dt * 6);

                const head = pig.root.userData.pigHead;
                if (head) {
                    head.rotation.y = pig.lookYaw;
                    head.rotation.x = pig.lookPitch;
                }

                const moving = speed > 0.62 || activeGoal?.forceRaise;
                const swing = moving ? Math.sin(time * 0.008 + pig.bobPhase) * 0.17 : 0;
                const legs = pig.root.userData.pigLegs || [];
                if (legs[0]) legs[0].rotation.x = swing;
                if (legs[1]) legs[1].rotation.x = -swing;
                if (legs[2]) legs[2].rotation.x = -swing;
                if (legs[3]) legs[3].rotation.x = swing;
            }
        }

        function getPigHitFromCrosshair() {
            if (!pigEntities.length) return null;
            raycaster.setFromCamera({ x: 0, y: 0 }, camera);
            const hitboxes = pigEntities.map(p => p.root.userData.pigHitbox).filter(Boolean);
            const hits = raycaster.intersectObjects(hitboxes, false);
            if (!hits.length) return null;
            const hitObj = hits[0].object;
            return pigEntities.find((p) => p.root.userData.pigHitbox === hitObj) || null;
        }

        function hurtPig(pig, amount = 4, source = 'player') {
            if (!pig) return;
            pig.hp -= amount;
            if (pig.hp > 0) {
                pig.changeDirMs = 0;
                pig.panicUntilMs = performance.now() + 3800;
                pig.dir.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2).normalize();
                if (source === 'player') showGameMessage('Pig: oink!');
                return;
            }
            const idx = pigEntities.indexOf(pig);
            if (idx >= 0) pigEntities.splice(idx, 1);
            scene.remove(pig.root);
            const drops = 1 + Math.floor(Math.random() * 3);
            addToInventory(89, drops);
            showGameMessage(`+${drops} Raw Porkchop`);
            if (Math.random() < 0.22) {
                addToInventory(95, 1);
                addToInventory(2, 1);
                showGameMessage('+1 Bone +1 Dirt');
            }
        }

        function spawnWolfAt(wx, wz) {
            const y = getSurfaceYForEntity(wx, wz);
            if (y < SEA_LEVEL || y > SEA_LEVEL + 24) return false;
            const under = getBlockType(Math.floor(wx), y - 1, Math.floor(wz));
            if (under !== 1 && under !== 2) return false;
            const lightLevel = lightingSystem ? lightingSystem.getCombinedLight(Math.floor(wx), y, Math.floor(wz)) : 15;
            if (lightLevel < 7) return false;
            const biome = getBiome(Math.floor(wx), Math.floor(wz));
            if (biome !== 'Forest') return false;
            return spawnWolfAtExact(wx, y, wz);
        }

        function spawnWolfAtExact(wx, y, wz) {
            const root = createWolfMesh();
            root.position.set(Math.floor(wx) + 0.5, y, Math.floor(wz) + 0.5);
            scene.add(root);
            wolfEntities.push({
                root,
                hp: 16,
                tamed: false,
                attackCooldownMs: 0,
                dir: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
                changeDirMs: 800 + Math.random() * 1400,
                groundProbeMs: 0,
                targetY: y,
                bobPhase: Math.random() * Math.PI * 2,
                retargetMs: 0,
                combatTarget: null,
                combatTargetType: null,
            });
            return true;
        }

        function spawnWolfForCommand(wx, wz) {
            if (spawnWolfAt(wx, wz)) return true;
            const y = getSurfaceYForEntity(wx, wz);
            if (y < SEA_LEVEL || y > SEA_LEVEL + 36) return false;
            const under = getBlockType(Math.floor(wx), y - 1, Math.floor(wz));
            if (under !== 1 && under !== 2 && under !== 3 && under !== 7 && under !== 15) return false;
            const lightLevel = lightingSystem ? lightingSystem.getCombinedLight(Math.floor(wx), y, Math.floor(wz)) : 15;
            if (lightLevel < 7) return false;
            return spawnWolfAtExact(wx, y, wz);
        }

        function getWolfHitFromCrosshair() {
            if (!wolfEntities.length) return null;
            raycaster.setFromCamera({ x: 0, y: 0 }, camera);
            const hitboxes = wolfEntities.map(w => w.root.userData.wolfHitbox).filter(Boolean);
            const hits = raycaster.intersectObjects(hitboxes, false);
            if (!hits.length) return null;
            const hitObj = hits[0].object;
            return wolfEntities.find((w) => w.root.userData.wolfHitbox === hitObj) || null;
        }

        function hurtWolf(wolf, amount = 4) {
            if (!wolf) return;
            wolf.hp -= amount;
            if (wolf.hp > 0) {
                wolf.changeDirMs = 0;
                wolf.dir.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2).normalize();
                showGameMessage(wolf.tamed ? 'Dog: whine!' : 'Wolf: growl!');
                return;
            }
            const idx = wolfEntities.indexOf(wolf);
            if (idx >= 0) wolfEntities.splice(idx, 1);
            scene.remove(wolf.root);
            showGameMessage(wolf.tamed ? 'Your dog died.' : 'Wolf defeated.');
        }

        function commandTamedWolvesAttack(target, targetType) {
            if (!target) return;
            for (const wolf of wolfEntities) {
                if (!isEntityActiveAt(wolf.root.position)) continue;
                if (!wolf.tamed) continue;
                wolf.combatTarget = target;
                wolf.combatTargetType = targetType;
                wolf.changeDirMs = 0;
            }
        }

        function updateWolves(time, deltaMs) {
            if (!wolfEntities.length) return;
            const dt = Math.max(0.001, Math.min(0.05, deltaMs / 1000));
            const playerPos = yawObject.position;

            for (let i = wolfEntities.length - 1; i >= 0; i--) {
                const wolf = wolfEntities[i];
                wolf.attackCooldownMs = Math.max(0, wolf.attackCooldownMs - deltaMs);
                wolf.changeDirMs -= deltaMs;
                wolf.retargetMs -= deltaMs;

                let targetPos = null;
                let targetDist = Infinity;

                if (wolf.combatTargetType === 'pig' && (!wolf.combatTarget || pigEntities.indexOf(wolf.combatTarget) < 0)) {
                    wolf.combatTarget = null;
                    wolf.combatTargetType = null;
                }
                if (wolf.combatTargetType === 'zombie' && (!wolf.combatTarget || zombieEntities.indexOf(wolf.combatTarget) < 0)) {
                    wolf.combatTarget = null;
                    wolf.combatTargetType = null;
                }

                if (!wolf.combatTarget && !wolf.tamed && wolf.retargetMs <= 0) {
                    wolf.retargetMs = 500 + Math.random() * 420;
                    let bestPig = null;
                    let bestDist = 11;
                    for (const pig of pigEntities) {
                if (!isEntityActiveAt(pig.root.position)) continue;
                        const d = pig.root.position.distanceTo(wolf.root.position);
                        if (d < bestDist) {
                            bestDist = d;
                            bestPig = pig;
                        }
                    }
                    if (bestPig) {
                        wolf.combatTarget = bestPig;
                        wolf.combatTargetType = 'pig';
                    }
                }

                if (wolf.combatTarget) {
                    targetPos = wolf.combatTarget.root.position;
                    targetDist = targetPos.distanceTo(wolf.root.position);
                    const toTarget = new THREE.Vector3(targetPos.x - wolf.root.position.x, 0, targetPos.z - wolf.root.position.z);
                    if (toTarget.lengthSq() > 0.00001) {
                        toTarget.normalize();
                        wolf.dir.copy(toTarget);
                    }
                } else if (wolf.tamed) {
                    const toPlayer = new THREE.Vector3(playerPos.x - wolf.root.position.x, 0, playerPos.z - wolf.root.position.z);
                    targetDist = toPlayer.length();
                    if (targetDist > 3.25) {
                        toPlayer.normalize();
                        wolf.dir.copy(toPlayer);
                    } else if (wolf.changeDirMs <= 0) {
                        wolf.changeDirMs = 1200 + Math.random() * 800;
                        wolf.dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                    }
                } else if (wolf.changeDirMs <= 0) {
                    wolf.changeDirMs = 1000 + Math.random() * 1800;
                    wolf.dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                }

                const speed = wolf.combatTarget ? 1.15 : (wolf.tamed ? 1.0 : 0.82);
                const nx = wolf.root.position.x + wolf.dir.x * speed * dt;
                const nz = wolf.root.position.z + wolf.dir.z * speed * dt;

                wolf.groundProbeMs -= deltaMs;
                if (wolf.groundProbeMs <= 0) {
                    wolf.groundProbeMs = 180 + Math.random() * 120;
                    wolf.targetY = getSurfaceYForEntity(nx, nz, wolf.targetY);
                }
                if (wolf.targetY > 0) {
                    wolf.root.position.x = nx;
                    wolf.root.position.z = nz;
                    wolf.root.position.y += (wolf.targetY - wolf.root.position.y) * Math.min(1, dt * 11);
                }
                wolf.root.rotation.y = Math.atan2(wolf.dir.x, wolf.dir.z);

                if (wolf.combatTarget && targetDist < 1.35 && wolf.attackCooldownMs <= 0) {
                    wolf.attackCooldownMs = 650;
                    if (wolf.combatTargetType === 'pig') hurtPig(wolf.combatTarget, 4, 'wolf');
                    else if (wolf.combatTargetType === 'zombie') hurtZombie(wolf.combatTarget, 3);
                }

                const parts = wolf.root.userData.wolfParts || {};
                const walk = Math.sin(time * 0.011 + wolf.bobPhase) * (wolf.combatTarget ? 0.4 : 0.24);
                const legs = parts.legs || [];
                if (legs[0]) legs[0].rotation.x = walk;
                if (legs[1]) legs[1].rotation.x = -walk;
                if (legs[2]) legs[2].rotation.x = -walk;
                if (legs[3]) legs[3].rotation.x = walk;
                if (parts.tailPivot) {
                    const wag = wolf.tamed ? Math.sin(time * 0.03 + wolf.bobPhase) * 0.5 : 0.12;
                    parts.tailPivot.rotation.x = -0.55 + wag;
                }
            }
        }

        function getZombieHitFromCrosshair() {
            if (!zombieEntities.length) return null;
            raycaster.setFromCamera({ x: 0, y: 0 }, camera);
            const hitboxes = zombieEntities.map(z => z.root.userData.zombieHitbox).filter(Boolean);
            const hits = raycaster.intersectObjects(hitboxes, false);
            if (!hits.length) return null;
            const hitObj = hits[0].object;
            return zombieEntities.find((z) => z.root.userData.zombieHitbox === hitObj) || null;
        }

        function hurtZombie(zombie, amount = 4) {
            if (!zombie) return;
            zombie.hp -= amount;
            if (zombie.hp > 0) return;
            const idx = zombieEntities.indexOf(zombie);
            if (idx >= 0) zombieEntities.splice(idx, 1);
            scene.remove(zombie.root);
            const drops = 1 + Math.floor(Math.random() * 2);
            addToInventory(92, drops);
            showGameMessage(`+${drops} Rotten Flesh`);
        }

        function canZombieSeeSky(wx, wy, wz) {
            for (let y = wy + 1; y < CHUNK_HEIGHT; y++) {
                const b = getBlockType(wx, y, wz);
                if (b !== 0 && !isLiquid(b)) return false;
            }
            return true;
        }

        function findHostileSpawnY(wx, wz) {
            const x = Math.floor(wx);
            const z = Math.floor(wz);
            for (let y = CHUNK_HEIGHT - 3; y >= 2; y--) {
                const under = getBlockType(x, y - 1, z);
                const feet = getBlockType(x, y, z);
                const head = getBlockType(x, y + 1, z);
                if (!isSolid(under) || isLiquid(under) || under === 6) continue;
                if (feet !== 0 || head !== 0) continue;
                const skyLightLevel = lightingSystem ? lightingSystem.getSkyLightLevel(x, y, z) : 0;
                if (skyLightLevel > 7) continue;
                const blockLightLevel = lightingSystem ? lightingSystem.getBlockLightLevel(x, y, z) : 0;
                if (blockLightLevel > 7) continue;
                if (lightingSystem && lightingSystem.hasNearbyBlockLightSource(x, y, z, 7)) continue;
                return y;
            }
            return -1;
        }

        function spawnZombieAt(wx, wz) {
            const y = findHostileSpawnY(wx, wz);
            if (y <= 0) return false;
            const under = getBlockType(Math.floor(wx), y - 1, Math.floor(wz));
            if (under === 0 || isLiquid(under)) return false;

            const root = createZombieMesh();
            root.position.set(Math.floor(wx) + 0.5, y, Math.floor(wz) + 0.5);
            scene.add(root);
            zombieEntities.push({
                root,
                hp: 20,
                attackCooldownMs: 0,
                attackReach: 1.2 + Math.random() * 0.5,
                burnTickMs: 0,
                inDirectSunlight: false,
                sunProbeMs: 0,
                targetY: y,
                groundProbeMs: 0,
            });
            return true;
        }

        function trySpawnNightZombie(deltaMs) {
            const phase = getTimePhaseInfo().phase;
            if (phase !== 'Night') return;
            zombieSpawnTimerMs -= deltaMs;
            if (zombieSpawnTimerMs > 0) return;
            zombieSpawnTimerMs = 2200 + Math.random() * 3200;
            if (zombieEntities.length >= 8) return;

            const angle = Math.random() * Math.PI * 2;
            const dist = 14 + Math.random() * 20;
            const wx = yawObject.position.x + Math.cos(angle) * dist;
            const wz = yawObject.position.z + Math.sin(angle) * dist;
            spawnZombieAt(wx, wz);
        }


        function isZombieInDirectSunlight(wx, wy, wz) {
            if (!lightingSystem) return canZombieSeeSky(wx, wy, wz);
            if (!lightingSystem.isOpenToSky(wx, wy, wz)) return false;
            const skyLight = lightingSystem.getSkyLightLevel(wx, wy, wz);
            return skyLight >= 12;
        }

        function updateZombies(time, deltaMs) {
            if (!zombieEntities.length) return;
            const dt = Math.max(0.001, Math.min(0.05, deltaMs / 1000));
            const phase = getTimePhaseInfo().phase;
            const burningTime = phase === 'Day' || phase === 'Sunrise';
            const playerPos = yawObject.position;

            for (let i = zombieEntities.length - 1; i >= 0; i--) {
                const z = zombieEntities[i];
                if (!isEntityActiveAt(z.root.position)) continue;
                const toPlayerFlat = new THREE.Vector3(playerPos.x - z.root.position.x, 0, playerPos.z - z.root.position.z);
                const distFlat = toPlayerFlat.length();
                if (distFlat > 0.001) toPlayerFlat.normalize();
                const dy = (playerPos.y + 0.9) - (z.root.position.y + 0.9);
                const dist3D = Math.hypot(distFlat, dy);

                const speed = 1.18;
                const nx = z.root.position.x + toPlayerFlat.x * speed * dt;
                const nz = z.root.position.z + toPlayerFlat.z * speed * dt;

                z.groundProbeMs -= deltaMs;
                if (z.groundProbeMs <= 0) {
                    z.groundProbeMs = 180;
                    z.targetY = getSurfaceYForEntity(nx, nz, z.targetY);
                }

                if (z.targetY > 0) {
                    z.root.position.x = nx;
                    z.root.position.z = nz;
                    z.root.position.y += (z.targetY - z.root.position.y) * Math.min(1, dt * 12);
                }

                if (distFlat > 0.1) z.root.rotation.y = Math.atan2(toPlayerFlat.x, toPlayerFlat.z);

                const parts = z.root.userData.zombieParts;
                if (parts) {
                    const walk = Math.sin(time * 0.01 + i) * 0.52;
                    parts.leftLegPivot.rotation.x = walk;
                    parts.rightLegPivot.rotation.x = -walk;

                    // Minecraft-like zombie gait: both arms held forward, swaying while walking.
                    const armSwing = Math.sin(time * 0.01 + i + Math.PI * 0.2) * 0.20;
                    parts.leftArmPivot.rotation.x = -1.35 + armSwing;
                    parts.rightArmPivot.rotation.x = -1.35 - armSwing;
                }

                z.attackCooldownMs = Math.max(0, z.attackCooldownMs - deltaMs);
                if (dist3D < (z.attackReach || 1.35) && z.attackCooldownMs <= 0) {
                    z.attackCooldownMs = 900;
                    takeDamage(3);
                }

                const zx = Math.floor(z.root.position.x);
                const zy = Math.floor(z.root.position.y + 1.6);
                const zz = Math.floor(z.root.position.z);
                const inLiquid = isLiquid(getBlockType(zx, zy, zz));

                z.sunProbeMs = (z.sunProbeMs ?? 0) - deltaMs;
                if (z.sunProbeMs <= 0) {
                    z.sunProbeMs = 220;
                    z.inDirectSunlight = isZombieInDirectSunlight(zx, zy, zz);
                }

                if (burningTime && !inLiquid && z.inDirectSunlight) {
                    z.burnTickMs += deltaMs;
                    if (z.burnTickMs >= 900) {
                        z.burnTickMs = 0;
                        hurtZombie(z, 2);
                    }
                } else {
                    z.burnTickMs = 0;
                }
            }
        }

        function setupEatingOverlay() {
            if (eatOverlayEl) return;
            const root = document.createElement('div');
            root.id = 'eat-overlay';
            root.className = 'hidden';
            const item = document.createElement('div');
            item.id = 'eat-item';
            root.appendChild(item);
            document.body.appendChild(root);
            eatOverlayEl = root;
            eatItemEl = item;
        }

        function startEatingAnimation(itemId) {
            if (!eatOverlayEl || !eatItemEl) setupEatingOverlay();
            const texKey = blockMaterials[itemId]?.textureKey;
            const img = texKey ? ASSET_FILEPATHS[texKey] : null;
            if (img) {
                eatItemEl.style.backgroundImage = `url('${img}')`;
                eatItemEl.style.backgroundSize = 'contain';
                eatItemEl.style.backgroundRepeat = 'no-repeat';
                eatItemEl.style.backgroundPosition = 'center';
                eatItemEl.style.backgroundColor = 'transparent';
            } else {
                eatItemEl.style.backgroundImage = 'none';
                eatItemEl.style.backgroundColor = '#cda173';
            }
            eatOverlayEl.classList.remove('hidden');
            eatingAnimState = { active: true, timeMs: 0, durationMs: 900, itemId, particleMs: 0 };
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
            const foodCfg = held.id === 89 ? { hunger: 3 } : (held.id === 90 ? { hunger: 8 } : (held.id === 92 ? { hunger: 4 } : null));
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
                getMobById: (id) => window.SingleplayerMobConfig?.byId?.[id] || null,
                spawnMobById,
                setTimeByClock,
                setRenderDistance,
                getRenderDistance: () => currentChunkLoadRadius,
                setFov: setCameraFov,
                getFov: getCameraFov,
                setGameMode,
                openCreativeMenu,
                closeCreativeMenu,
                grantPrivilege,
                ungrantPrivilege,
                teleportToCoordinates,
                teleportToBiome,
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
                .filter((mat) => mat && Number.isFinite(mat.id) && mat.id !== 0)
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
                    slot.appendChild(countSpan);
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
                } else if (targetItem.id === heldItem.id && targetItem.count < 64) {
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
                    } else if (targetItem.id === heldItem.id && targetItem.count < 64) {
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
                } else if (targetItem.id === heldItem.id && targetItem.count < 64) {
                    // 2. COMBINE (Stacking)
                    const capacity = 64 - targetItem.count;
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
                heldItem = { id: itemId, count: 64 };
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
                    } else if (heldItem.id === ref.state.output.id && heldItem.count + ref.state.output.count <= 64) {
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
                    else if (heldItem.id === recipeResult.id && heldItem.count + recipeResult.recipeOutputPerCraft <= 64) {
                        
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
                    } else if (targetItem.id === heldItem.id && targetItem.count < 64) {
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
                    slot.appendChild(countSpan);
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
                    creativeGrid?.appendChild(createSlot({ id, count: 64 }, i, 'creative-item'));
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
                heldDiv.appendChild(countSpan);
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

            const effectiveTool = equippedTool && equippedTool.toolType === 'shovel'
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
            raycaster.setFromCamera({ x: 0, y: 0 }, camera);

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
            raycaster.setFromCamera({ x: 0, y: 0 }, camera);
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
            if (!item || !isSolid(item.id)) return;

            const placePos = hit.point.clone().add(hit.face.normal.clone().multiplyScalar(0.01));
            const px = Math.floor(placePos.x), py = Math.floor(placePos.y), pz = Math.floor(placePos.z);
            const playerBox = new THREE.Box3(
                new THREE.Vector3(yawObject.position.x - PLAYER_RADIUS, yawObject.position.y, yawObject.position.z - PLAYER_RADIUS),
                new THREE.Vector3(yawObject.position.x + PLAYER_RADIUS, yawObject.position.y + PLAYER_HEIGHT, yawObject.position.z + PLAYER_RADIUS)
            );
            const blockBox = new THREE.Box3(
                new THREE.Vector3(px, py, pz), new THREE.Vector3(px + 1, py + 1, pz + 1)
            );

            if (!playerBox.intersectsBox(blockBox)) {
                if (modifyWorld(placePos, item.id)) consumeSelectedItem();
            }
        }

        function onPointerDown(event) {
            if (event.pointerType === 'touch') return;
            if (!player.canMove || isInventoryOpen) return;

            raycaster.setFromCamera({ x: 0, y: 0 }, camera);
            const meshes = [];
            worldGroup.children.forEach(g => g.children.forEach(m => meshes.push(m)));
            const intersects = raycaster.intersectObjects(meshes, true);
            if (!intersects.length) return;

            if (event.button === 0) {
                const wolfHit = getWolfHitFromCrosshair();
                if (wolfHit) {
                    const held = inventory[selectedHotbarIndex];
                    if (!wolfHit.tamed && held && held.id === 95) {
                        consumeSelectedItem();
                        if (Math.random() < 0.68) {
                            wolfHit.tamed = true;
                            const neck = wolfHit.root.userData?.wolfParts?.neck;
                            if (neck?.material) neck.material.color.setHex(0xc64444);
                            showGameMessage('Wolf tamed! It is now your dog.');
                        } else {
                            showGameMessage('The wolf refused the bone.');
                        }
                    } else {
                        hurtWolf(wolfHit, 4);
                    }
                    return;
                }

                const zombieHit = getZombieHitFromCrosshair();
                if (zombieHit) {
                    hurtZombie(zombieHit, 4);
                    commandTamedWolvesAttack(zombieHit, 'zombie');
                    return;
                }
                const pigHit = getPigHitFromCrosshair();
                if (pigHit) {
                    hurtPig(pigHit, 4, 'player');
                    commandTamedWolvesAttack(pigHit, 'pig');
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
            const lightingSensitive = Boolean(oldMat?.emissive || newMat?.emissive || oldType === 22 || newType === 22 || oldType === 4 || newType === 4 || oldType === 33 || newType === 33);
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
            const bodyY = Math.floor(yawObject.position.y + PLAYER_HEIGHT * 0.5);
            const eyeY = Math.floor(yawObject.position.y + 1.62);

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

        function isColliding() {
            if (playerPrivileges.noclip && playerPrivileges.fly && isFlyActive) return false;

            const px = yawObject.position.x;
            const py = yawObject.position.y;
            const pz = yawObject.position.z;
            const r = PLAYER_RADIUS;
            const h = PLAYER_HEIGHT; 

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
                        if (isSolid(type)) return true;
                    }
                }
            }
            return false;
        }

        const BIOME_CLIMATE_TARGETS = [
            { name: 'Desert', temp: 0.09, humidity: -0.12, continentalness: 0.18, erosion: 0.08, weirdness: 0.06 },
            { name: 'Forest', temp: 0.0, humidity: 0.16, continentalness: 0.14, erosion: 0.06, weirdness: -0.04 },
            { name: 'Jungle Forest', temp: 0.95, humidity: 0.9, continentalness: 0.2, erosion: 0.03, weirdness: 0.0 },
            { name: 'Plains', temp: -0.02, humidity: 0.02, continentalness: 0.1, erosion: 0.2, weirdness: 0.02 },
            { name: 'Snowy Plains', temp: -0.52, humidity: 0.04, continentalness: 0.12, erosion: 0.18, weirdness: -0.02 },
        ];

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

        function getBiome(wx, wz) {
            if (worldGenerator) return worldGenerator.sampleBiome(wx, wz);

            const { climate, weights } = biomeWeights(wx, wz);
            if ((weights['Ocean'] || 0) > 0.68) return 'Ocean';
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
            if (worldGenerator) return worldGenerator.sampleRavineMask(wx, wz);
            const warp = perlin.noise2D(wx * 0.001 + 250, wz * 0.001 + 250) * 30;
            const line = Math.abs(perlin.noise2D(wx * 0.0018 + warp, wz * 0.0018));
            return 1.0 - Math.min(1.0, line / 0.043);
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
            if (USE_WASM_CAVE_SAMPLING && wasmRuntime?.has && wasmRuntime.has('caveShape')) {
                const out = wasmRuntime.call('caveShape', wx, y, wz, CAVE_SCALE);
                if (typeof out === 'number' && Number.isFinite(out)) return out;
            }

            const n1 = perlin.noise3D(wx * CAVE_SCALE, y * CAVE_SCALE * 1.7, wz * CAVE_SCALE);
            const n2 = perlin.noise3D(wx * CAVE_SCALE * 2.2 + 100, y * CAVE_SCALE * 1.1, wz * CAVE_SCALE * 2.2 + 100);
            return n1 * 0.7 + n2 * 0.3;
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
            const mobileBtn = document.getElementById('mode-mobile-btn');
            const pcBtn = document.getElementById('mode-pc-btn');
            if (!mobileBtn || !pcBtn) return;

            const applyMode = (mode) => {
                const mobile = mode === 'mobile';
                mobileControls.enabled = mobile;
                mobileBtn.classList.toggle('active', mobile);
                pcBtn.classList.toggle('active', !mobile);
                if (mobile) {
                    if (mobileControls.initialized) setMobileHudVisible(true);
                    else setupMobileControls();
                } else {
                    setMobileHudVisible(false);
                }
            };

            mobileBtn.addEventListener('click', (e) => { e.preventDefault(); applyMode('mobile'); });
            pcBtn.addEventListener('click', (e) => { e.preventDefault(); applyMode('pc'); });
            applyMode(mobileControls.autoEnabled ? 'mobile' : 'pc');
        }

        function setMobileHudVisible(visible) {
            const controlsEl = document.getElementById('mobile-controls');
            const crosshair = document.getElementById('crosshair');
            if (controlsEl) {
                if (visible) controlsEl.classList.add('active');
                else controlsEl.classList.remove('active');
            }
            if (crosshair) crosshair.style.opacity = visible ? 0 : 1;
        }

        function switchToDesktopMode() {
            if (!mobileControls.enabled) return;
            mobileControls.enabled = false;
            mobileControls.moveX = 0;
            mobileControls.moveY = 0;
            mobileControls.sprint = false;
            mobileControls.jump = false;
            mobileControls.worldTouchActive = false;
            mobileControls.lookPointerId = null;
            setMobileHudVisible(false);
            if (!isInventoryOpen) {
                const el = document.body;
                if (document.pointerLockElement !== el) {
                    el.requestPointerLock();
                }
            }
        }



        function setupMobileControls() {
            if (!mobileControls.enabled || mobileControls.initialized) return;
            mobileControls.initialized = true;

            const controlsEl = document.getElementById('mobile-controls');
            const joyWrap = document.getElementById('mobile-joystick');
            const joyBg = document.getElementById('mobile-joystick-bg');
            const joyCenter = document.getElementById('mobile-joystick-center');
            const jumpBtn = document.getElementById('mobile-jump-btn');
            const invBtn = document.getElementById('mobile-inventory-btn');
            const fastBtn = document.getElementById('mobile-fast-btn');
            const camBtn = document.getElementById('mobile-camera-btn');
            const chatBtn = document.getElementById('mobile-chat-btn');

            if (!controlsEl || !joyWrap || !joyBg || !joyCenter || !jumpBtn || !invBtn || !fastBtn) return;

            setMobileHudVisible(true);
            joyBg.src = `${MOBILE_ASSET_BASE}/joystick_off.png`;
            joyCenter.src = `${MOBILE_ASSET_BASE}/joystick_center.png`;
            jumpBtn.src = `${MOBILE_ASSET_BASE}/jump_btn.png`;
            invBtn.src = `${MOBILE_ASSET_BASE}/inventory_btn.png`;
            fastBtn.src = `${MOBILE_ASSET_BASE}/fast_btn.png`;
            if (camBtn) camBtn.src = `${MOBILE_ASSET_BASE}/camera_btn.png`;
            if (chatBtn) {
                chatBtn.src = `${MOBILE_ASSET_BASE}/chat_btn.png`;
                chatBtn.onerror = () => {
                    chatBtn.onerror = null;
                    chatBtn.src = `${MOBILE_ASSET_BASE}/inventory_btn.png`;
                };
            }
            document.getElementById('instructions').style.opacity = 0;
            player.canMove = true;

            function resetJoystick() {
                mobileControls.moveX = 0;
                mobileControls.moveY = 0;
                mobileControls.joystickPointerId = null;
                joyCenter.style.left = '40px';
                joyCenter.style.top = '40px';
                joyBg.src = `${MOBILE_ASSET_BASE}/joystick_off.png`;
            }

            joyBg.addEventListener('pointerdown', (e) => {
                mobileControls.joystickPointerId = e.pointerId;
                joyBg.setPointerCapture(e.pointerId);
                joyBg.src = `${MOBILE_ASSET_BASE}/joystick_bg.png`;
                e.preventDefault();
            });

            joyBg.addEventListener('pointermove', (e) => {
                if (mobileControls.joystickPointerId !== e.pointerId) return;
                const rect = joyWrap.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const dx = e.clientX - cx;
                const dy = e.clientY - cy;
                const maxR = 44;
                const len = Math.hypot(dx, dy) || 1;
                const clamped = Math.min(maxR, len);
                const nx = (dx / len) * clamped;
                const ny = (dy / len) * clamped;
                mobileControls.moveX = nx / maxR;
                mobileControls.moveY = ny / maxR;
                joyCenter.style.left = `${40 + nx}px`;
                joyCenter.style.top = `${40 + ny}px`;
            });

            const releaseJoystick = (e) => {
                if (mobileControls.joystickPointerId !== e.pointerId) return;
                resetJoystick();
            };
            joyBg.addEventListener('pointerup', releaseJoystick);
            joyBg.addEventListener('pointercancel', releaseJoystick);

            const holdButton = (el, key) => {
                const start = (e) => { mobileControls[key] = true; e.preventDefault(); };
                const end = (e) => { mobileControls[key] = false; e.preventDefault(); };
                el.addEventListener('pointerdown', start);
                el.addEventListener('pointerup', end);
                el.addEventListener('pointercancel', end);
                el.addEventListener('pointerleave', end);
            };

            holdButton(jumpBtn, 'jump');
            holdButton(fastBtn, 'sprint');

            invBtn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                toggleInventory();
            });
            if (camBtn) camBtn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                toggleCameraViewMode();
            });
            if (chatBtn) chatBtn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                window.SingleplayerChat?.toggle?.();
            });

            const mobileControlTargets = new Set([joyBg, jumpBtn, invBtn, fastBtn, camBtn, chatBtn]);
            window.addEventListener('pointerdown', (e) => {
                if (!mobileControls.enabled || !player.canMove || isInventoryOpen) return;
                if (mobileControlTargets.has(e.target)) return;
                if (e.pointerType !== 'touch') return;
                mobileControls.worldTouchActive = true;
                mobileControls.worldTouchPointerId = e.pointerId;
                mobileControls.worldTouchStartMs = performance.now();
                mobileControls.isMiningTouch = false;
                mobileControls.lookPointerId = e.pointerId;
                mobileControls.lastLookX = e.clientX;
                mobileControls.lastLookY = e.clientY;
                if (mobileControls.miningTimer) clearTimeout(mobileControls.miningTimer);
                mobileControls.miningTimer = setTimeout(() => {
                    if (!mobileControls.worldTouchActive) return;
                    const target = getTargetBlockFromCrosshair();
                    if (!target) return;
                    isLeftMouseDown = true;
                    mobileControls.isMiningTouch = true;
                    beginMiningTarget(target);
                    updateBreakingOverlay();
                }, 180);
            }, { passive: false });

            window.addEventListener('pointermove', (e) => {
                if (!mobileControls.enabled || !player.canMove) return;
                if (isInventoryOpen) {
                    updateSkinPreviewLook(e.clientX, e.clientY);
                    return;
                }
                if (e.pointerType !== 'touch') return;
                if (mobileControls.lookPointerId !== e.pointerId) return;

                const dx = e.clientX - mobileControls.lastLookX;
                const dy = e.clientY - mobileControls.lastLookY;
                mobileControls.lastLookX = e.clientX;
                mobileControls.lastLookY = e.clientY;

                yawObject.rotation.y -= dx * player.rotationSpeed * 0.85;
                pitchObject.rotation.x -= dy * player.rotationSpeed * 0.85;
                pitchObject.rotation.x = Math.max(-1.5, Math.min(1.5, pitchObject.rotation.x));
            }, { passive: true });

            const endWorldTouch = (e) => {
                if (!mobileControls.enabled || e.pointerType !== 'touch') return;
                if (mobileControls.worldTouchPointerId !== e.pointerId) return;
                if (mobileControls.miningTimer) clearTimeout(mobileControls.miningTimer);

                const wasMining = mobileControls.isMiningTouch;
                const touchDuration = performance.now() - mobileControls.worldTouchStartMs;
                mobileControls.worldTouchActive = false;
                mobileControls.worldTouchPointerId = null;
                mobileControls.isMiningTouch = false;
                mobileControls.lookPointerId = null;
                isLeftMouseDown = false;
                miningState.active = false;
                updateBreakingOverlay();

                if (!wasMining && touchDuration < 220) {
                    interactOrPlaceAtCrosshair();
                }
            };

            window.addEventListener('pointerup', endWorldTouch, { passive: false });
            window.addEventListener('pointercancel', endWorldTouch, { passive: false });
        }

        function setupPointerLockControls() {
            const el = document.body;
            document.addEventListener('pointerlockchange', () => {
                if (mobileControls.enabled) return;
                if (document.pointerLockElement === el) {
                    player.canMove = true;
                    if(isInventoryOpen) toggleInventory(); 
                    document.getElementById('instructions').style.opacity = 0;
                    document.getElementById('crosshair').style.opacity = 1;
                } else {
                    player.canMove = false;
                    if(!isInventoryOpen) {
                        document.getElementById('instructions').style.opacity = 1;
                                }
                }
            });
            document.addEventListener('mousemove', e => {
                if (mobileControls.enabled) return;
                if (!player.canMove || isInventoryOpen) return;
                yawObject.rotation.y -= e.movementX * player.rotationSpeed;
                pitchObject.rotation.x -= e.movementY * player.rotationSpeed;
                pitchObject.rotation.x = Math.max(-1.5, Math.min(1.5, pitchObject.rotation.x));
            });
            document.getElementById('instructions').onclick = () => {
                if (mobileControls.enabled) {
                    player.canMove = true;
                    document.getElementById('instructions').style.opacity = 0;
                    return;
                }
                if(!isInventoryOpen) el.requestPointerLock();
            };
        }

        function ensureSteveSkinTextureLoaded() {
            if (steveSkinReady && steveSkinTexture) return Promise.resolve(true);
            if (steveSkinFailed) return Promise.resolve(false);
            if (steveSkinLoadPromise) return steveSkinLoadPromise;

            const skinPaths = getPlayerAssetCandidates('character.png');
            steveSkinLoadPromise = new Promise((resolve) => {
                const loader = new THREE.TextureLoader();
                const tryLoad = (index) => {
                    if (index >= skinPaths.length) {
                        steveSkinFailed = true;
                        steveSkinTexture = null;
                        resolve(false);
                        return;
                    }
                    loader.load(
                        skinPaths[index],
                        (tex) => {
                            tex.magFilter = THREE.NearestFilter;
                            tex.minFilter = THREE.NearestFilter;
                            tex.flipY = false;
                            steveSkinTexture = tex;
                            steveSkinReady = true;
                            resolve(true);
                        },
                        undefined,
                        () => tryLoad(index + 1)
                    );
                };
                tryLoad(0);
            });
            return steveSkinLoadPromise;
        }

        function getSteveSkinTexture() {
            if (!steveSkinTexture || !steveSkinReady) return null;
            return steveSkinTexture;
        }

        function getPlayerAssetCandidates(fileName) {
            const repoPrefix = window.SingleplayerConfig?.REPO_BASE_PREFIX || '';
            const fromRepo = `${repoPrefix}/game/singleplayer/assets/player/${fileName}`;
            return [fromRepo, `./assets/player/${fileName}`].filter((v, i, arr) => v && arr.indexOf(v) === i);
        }

        function getPreferredPlayerAssetPath(fileName) {
            return getPlayerAssetCandidates(fileName)[0];
        }

        function createSkinFaceTexture(rect) {
            const [x, y, w, h] = rect;
            const src = getSteveSkinTexture();
            if (!src) return null;
            if (!src.image) return null;
            const atlasW = src.image.naturalWidth || src.image.width || 64;
            const atlasH = src.image.naturalHeight || src.image.height || 64;
            const tex = src.clone();
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.flipY = false;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.repeat.set(w / atlasW, h / atlasH);
            tex.offset.set(x / atlasW, 1 - ((y + h) / atlasH));
            tex.needsUpdate = true;
            return tex;
        }


        function isModernSkinLayout() {
            const tex = getSteveSkinTexture();
            const img = tex && tex.image ? tex.image : null;
            const h = img ? (img.naturalHeight || img.height || 0) : 0;
            return h >= 64;
        }
function buildPartFaceRects(x, y, w, h, d) {
    return {
        // Three.js BoxGeometry material order:
        // 0:+X, 1:-X, 2:+Y, 3:-Y, 4:+Z, 5:-Z

        0: [x + d + w, y + d, d, h],          // +X right
        1: [x, y + d, d, h],                  // -X left
        2: [x + d, y, w, d],                  // +Y top
        3: [x + d + w, y, w, d],              // -Y bottom
        4: [x + d, y + d, w, h],              // +Z front
        5: [x + d + w + d, y + d, w, h],      // -Z back
    };
}

        function getSkinPartRects(partName, overlay = false) {
            const modern = isModernSkinLayout();
            if (partName === 'head') return buildPartFaceRects(overlay ? 32 : 0, 0, 8, 8, 8);

            if (partName === 'body') {
                if (overlay && !modern) return null;
                return buildPartFaceRects(16, overlay ? 32 : 16, 8, 12, 4);
            }

            if (partName === 'rightArm') {
                if (overlay && !modern) return null;
                return buildPartFaceRects(40, overlay ? 32 : 16, 4, 12, 4);
            }

            if (partName === 'leftArm') {
                if (modern) return buildPartFaceRects(overlay ? 48 : 32, 48, 4, 12, 4);
                if (overlay) return null;
                return buildPartFaceRects(40, 16, 4, 12, 4);
            }

            if (partName === 'rightLeg') {
                if (overlay && !modern) return null;
                return buildPartFaceRects(0, overlay ? 32 : 16, 4, 12, 4);
            }

            if (partName === 'leftLeg') {
                if (modern) return buildPartFaceRects(overlay ? 0 : 16, 48, 4, 12, 4);
                if (overlay) return null;
                return buildPartFaceRects(0, 16, 4, 12, 4);
            }

            return null;
        }

        function createStevePartMesh(dim, faceRects, overlayFaceRects = null) {
            const createMaterials = (rects, isOverlay) => {
                const mats = [];
                for (let i = 0; i < 6; i++) {
                    const faceTex = rects ? createSkinFaceTexture(rects[i]) : null;
                    mats.push(new THREE.MeshStandardMaterial({
                        map: faceTex || null,
                        color: faceTex ? 0xffffff : 0x000000,
                        transparent: !!isOverlay,
                        alphaTest: isOverlay ? 0.1 : 0,
                        opacity: faceTex ? 1 : 0,
                        roughness: 1,
                        metalness: 0,
                        depthWrite: !isOverlay,
                    }));
                }
                return mats;
            };

            if (!overlayFaceRects) {
                return new THREE.Mesh(new THREE.BoxGeometry(dim[0], dim[1], dim[2]), createMaterials(faceRects, false));
            }

            const group = new THREE.Group();
            const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(dim[0], dim[1], dim[2]), createMaterials(faceRects, false));
            group.add(baseMesh);

            const inflate = (0.5 / 16);
            const overlayMesh = new THREE.Mesh(
                new THREE.BoxGeometry(dim[0] + inflate, dim[1] + inflate, dim[2] + inflate),
                createMaterials(overlayFaceRects, true)
            );
            group.add(overlayMesh);
            return group;
        }

        function setupFirstPersonHandOverlay() {
            if (firstPersonHandEl) return;
            const hand = document.createElement('div');
            hand.id = 'firstperson-hand';

            const held = document.createElement('div');
            held.id = 'firstperson-held-item';

            const wieldPath = getPreferredPlayerAssetPath('wieldhand.png');
            const skinPath = getPreferredPlayerAssetPath('character.png');

            const probe = new Image();
            probe.onload = () => {
                hand.style.backgroundImage = `url('${wieldPath}')`;
                hand.style.backgroundSize = '100% 100%';
                hand.style.backgroundPosition = 'center';
            };
            probe.onerror = () => {
                // Minetest-like fallback: use right-arm section from skin atlas as wield hand.
                hand.style.backgroundImage = `url('${skinPath}')`;
                hand.style.backgroundSize = '64px 64px';
                hand.style.backgroundPosition = '-44px -20px';
                hand.classList.add('fallback');
            };
            probe.src = wieldPath;

            document.body.appendChild(held);
            document.body.appendChild(hand);
            firstPersonHandEl = hand;
            firstPersonHeldItemEl = held;
        }

        function setupInventorySkinRig() {
            const preview = document.getElementById('inventory-skin-preview');
            if (!preview || inventorySkinRigEl) return;
            const skinPath = getPreferredPlayerAssetPath('character.png');

            const rig = document.createElement('div');
            rig.id = 'inventory-skin-rig';
            rig.innerHTML = `
                <div id="inv-skin-head" class="inv-skin-part"></div>
                <div id="inv-skin-body" class="inv-skin-part"></div>
                <div id="inv-skin-arm-left" class="inv-skin-part"></div>
                <div id="inv-skin-arm-right" class="inv-skin-part"></div>
                <div id="inv-skin-leg-left" class="inv-skin-part"></div>
                <div id="inv-skin-leg-right" class="inv-skin-part"></div>
            `;
            preview.innerHTML = '';
            preview.appendChild(rig);
            inventorySkinRigEl = rig;

            const setPart = (id, x, y, w, h) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.style.backgroundImage = `url('${skinPath}')`;
                el.style.backgroundPosition = `-${x}px -${y}px`;
                el.style.width = `${w}px`;
                el.style.height = `${h}px`;
            };

            const modern = isModernSkinLayout();
            setPart('inv-skin-head', 8, 8, 8, 8);
            setPart('inv-skin-body', 20, 20, 8, 12);
            setPart('inv-skin-arm-left', ...(modern ? [36, 52, 4, 12] : [44, 20, 4, 12]));
            setPart('inv-skin-arm-right', 44, 20, 4, 12);
            setPart('inv-skin-leg-left', ...(modern ? [20, 52, 4, 12] : [4, 20, 4, 12]));
            setPart('inv-skin-leg-right', 4, 20, 4, 12);
        }

        function updateFirstPersonHand(time) {
            if (!firstPersonHandEl || !firstPersonHeldItemEl) return;
            const firstPerson = cameraViewMode === 0 && !isInventoryOpen;
            firstPersonHandEl.style.display = firstPerson ? 'block' : 'none';
            firstPersonHeldItemEl.style.display = firstPerson ? 'block' : 'none';
            if (!firstPerson) return;

            const moveSwing = player.isMoving ? Math.sin(time * 0.013) * 10 : 0;
            const minePunch = miningSwingTimerMs > 0 ? (Math.sin((Math.max(0, 180 - miningSwingTimerMs) / 180) * Math.PI) * 20 - 9) : 0;
            const totalSwing = moveSwing + minePunch;
            firstPersonHandEl.style.transform = `translateY(${Math.max(-10, totalSwing)}px) rotate(${totalSwing * 0.36}deg)`;
            firstPersonHeldItemEl.style.transform = `translateY(${Math.max(-10, totalSwing)}px)`;

            const held = inventory[selectedHotbarIndex];
            if (!held) {
                firstPersonHeldItemEl.innerHTML = '';
                return;
            }
            const mat = blockMaterials[held.id];
            if (!mat) {
                firstPersonHeldItemEl.innerHTML = '';
                return;
            }
            if (mat.textured && mat.textureKey && ASSET_FILEPATHS[mat.textureKey]) {
                const src = ASSET_FILEPATHS[mat.textureKey];
                firstPersonHeldItemEl.innerHTML = `<img src="${src}" class="fp-held-icon" alt="held item" />`;
            } else {
                const colorHex = (mat.color ? mat.color.toString(16).padStart(6, '0') : '7f8c8d');
                firstPersonHeldItemEl.innerHTML = `<div class="fp-held-color" style="background:#${colorHex}"></div>`;
            }
        }

        function createPlayerAvatar() {
            const avatar = new THREE.Group();
            const U = 1 / 16; // Minecraft unit scale

            const head = createStevePartMesh(
                [8 * U, 8 * U, 8 * U],
                getSkinPartRects('head', false),
                getSkinPartRects('head', true)
            );
            head.position.y = 28 * U;

            const body = createStevePartMesh(
                [8 * U, 12 * U, 4 * U],
                getSkinPartRects('body', false),
                getSkinPartRects('body', true)
            );
            body.position.y = 18 * U;

            const rightArmPivot = new THREE.Group();
            rightArmPivot.position.set(6 * U, 24 * U, 0);
            const rightArm = createStevePartMesh(
                [4 * U, 12 * U, 4 * U],
                getSkinPartRects('rightArm', false),
                getSkinPartRects('rightArm', true)
            );
            rightArm.position.set(0, -6 * U, 0);
            rightArmPivot.add(rightArm);

            const leftArmPivot = new THREE.Group();
            leftArmPivot.position.set(-6 * U, 24 * U, 0);
            const leftArm = createStevePartMesh(
                [4 * U, 12 * U, 4 * U],
                getSkinPartRects('leftArm', false),
                getSkinPartRects('leftArm', true)
            );
            leftArm.position.set(0, -6 * U, 0);
            leftArmPivot.add(leftArm);

            const rightLegPivot = new THREE.Group();
            rightLegPivot.position.set(2 * U, 12 * U, 0);
            const rightLeg = createStevePartMesh(
                [4 * U, 12 * U, 4 * U],
                getSkinPartRects('rightLeg', false),
                getSkinPartRects('rightLeg', true)
            );
            rightLeg.position.set(0, -6 * U, 0);
            rightLegPivot.add(rightLeg);

            const leftLegPivot = new THREE.Group();
            leftLegPivot.position.set(-2 * U, 12 * U, 0);
            const leftLeg = createStevePartMesh(
                [4 * U, 12 * U, 4 * U],
                getSkinPartRects('leftLeg', false),
                getSkinPartRects('leftLeg', true)
            );
            leftLeg.position.set(0, -6 * U, 0);
            leftLegPivot.add(leftLeg);

            avatar.add(body, head, leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot);
            playerAvatarParts = {
                body,
                head,
                leftArm,
                rightArm,
                leftLeg,
                rightLeg,
                leftArmPivot,
                rightArmPivot,
                leftLegPivot,
                rightLegPivot,
            };
            return avatar;
        }

        function applyCameraMode() {
            // camera is parented to pitchObject; use local transforms for mode.
            if (cameraViewMode === 0) {
                camera.position.set(0, 0, 0);
                camera.rotation.y = 0;
                if (playerAvatar) playerAvatar.visible = false;
                if (firstPersonHandEl) firstPersonHandEl.style.display = 'block';
                if (firstPersonHeldItemEl) firstPersonHeldItemEl.style.display = 'block';
                showGameMessage('First-person view enabled');
            } else if (cameraViewMode === 1) {
                camera.position.set(0, 1.2, -2.6);
                camera.rotation.y = Math.PI;
                if (playerAvatar) playerAvatar.visible = true;
                if (firstPersonHandEl) firstPersonHandEl.style.display = 'none';
                if (firstPersonHeldItemEl) firstPersonHeldItemEl.style.display = 'none';
                showGameMessage('Second-person view enabled');
            } else {
                camera.position.set(0, 0.1, 3.6);
                camera.rotation.y = 0;
                if (playerAvatar) playerAvatar.visible = true;
                if (firstPersonHandEl) firstPersonHandEl.style.display = 'none';
                if (firstPersonHeldItemEl) firstPersonHeldItemEl.style.display = 'none';
                showGameMessage('Third-person view enabled');
            }
        }

        function toggleCameraViewMode() {
            cameraViewMode = (cameraViewMode + 1) % 3;
            applyCameraMode();
        }

        function updatePlayerAvatarVisuals(time) {
            if (!playerAvatarParts) return;

            const isFlyingPose = playerPrivileges.fly && isFlyActive;

            if (playerAvatar) {
                playerAvatar.rotation.x = (player.isSwimming || isFlyingPose) ? -Math.PI / 2 : 0;
                playerAvatar.rotation.z = 0;
            }

            if (isFlyingPose) {
                playerAvatarParts.leftLegPivot.rotation.x = 0;
                playerAvatarParts.rightLegPivot.rotation.x = 0;
                playerAvatarParts.leftArmPivot.rotation.x = 1.25;
                playerAvatarParts.rightArmPivot.rotation.x = -1.45;
            } else if (player.isSwimming) {
                const stroke = time * 0.02;
                const legKick = Math.sin(time * 0.028) * 0.25;
                playerAvatarParts.leftLegPivot.rotation.x = legKick;
                playerAvatarParts.rightLegPivot.rotation.x = -legKick;
                playerAvatarParts.leftArmPivot.rotation.x = stroke;
                playerAvatarParts.rightArmPivot.rotation.x = stroke + Math.PI;
            } else {
                const swing = player.isMoving ? Math.sin(time * 0.015) * 0.7 : 0;
                const mineStroke = miningSwingTimerMs > 0 ? (Math.sin((Math.max(0, 180 - miningSwingTimerMs) / 180) * Math.PI) * 1.45 - 0.7) : 0;
                playerAvatarParts.leftLegPivot.rotation.x = swing;
                playerAvatarParts.rightLegPivot.rotation.x = -swing;
                playerAvatarParts.leftArmPivot.rotation.x = -swing * 0.75;
                playerAvatarParts.rightArmPivot.rotation.x = swing * 0.6 + mineStroke;
            }

            if (inventorySkinRigEl) {
                const swing = player.isMoving ? Math.sin(time * 0.015) * 0.7 : 0;
                const mineStroke = miningSwingTimerMs > 0 ? (Math.sin((Math.max(0, 180 - miningSwingTimerMs) / 180) * Math.PI) * 1.45 - 0.7) : 0;
                const sdeg = swing * 40;
                const mineDeg = mineStroke * 50;
                const lLeg = document.getElementById('inv-skin-leg-left');
                const rLeg = document.getElementById('inv-skin-leg-right');
                const lArm = document.getElementById('inv-skin-arm-left');
                const rArm = document.getElementById('inv-skin-arm-right');
                if (lLeg) lLeg.style.transform = `rotate(${sdeg}deg)`;
                if (rLeg) rLeg.style.transform = `rotate(${-sdeg}deg)`;
                if (lArm) lArm.style.transform = `rotate(${-sdeg * 0.75}deg)`;
                if (rArm) rArm.style.transform = `rotate(${sdeg * 0.6 + mineDeg}deg)`;
            }
        }

        function toggleInventorySkinPreview() {
            if (skinSystem) {
                skinSystem.toggleInventorySkinPreview();
                return;
            }
            showGameMessage('Skin editor opened in preview mode');
            const preview = document.getElementById('inventory-skin-preview');
            if (!preview) return;
            preview.classList.toggle('active');
        }

        function updateSkinPreviewLook(clientX, clientY) {
            if (skinSystem) {
                skinSystem.updateSkinPreviewLook(clientX, clientY, isInventoryOpen);
                return;
            }
            const head = document.getElementById('inventory-skin-head');
            const wrap = document.getElementById('inventory-skin-preview');
            if (!head || !wrap || !isInventoryOpen) return;
            const rect = wrap.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = Math.max(-1, Math.min(1, (clientX - cx) / (rect.width / 2)));
            const dy = Math.max(-1, Math.min(1, (clientY - cy) / (rect.height / 2)));
            head.style.setProperty('--skin-look-x', `${dx * 28}deg`);
            head.style.setProperty('--skin-look-y', `${-dy * 20}deg`);
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
            const rawName = String(biomeName || 'Plains');
            const normalized = rawName.toLowerCase();
            let baseChance = Number(map[rawName]);
            if (!Number.isFinite(baseChance)) {
                if (normalized.includes('forest') || normalized.includes('jungle') || normalized.includes('taiga')) {
                    baseChance = Number(map.Forest ?? 0.19);
                } else if (normalized.includes('plains') || normalized.includes('river') || normalized.includes('swamp') || normalized.includes('savanna')) {
                    baseChance = Number(map.Plains ?? 0.06);
                } else if (normalized.includes('mushroom')) {
                    baseChance = 0.017;
                } else {
                    baseChance = Number(map.Plains ?? 0.06);
                }
            }
            let adjusted = baseChance;
            if (topY > SEA_LEVEL + 26) adjusted *= 0.7;
            if (topY < SEA_LEVEL + 2) adjusted *= 0.5;
            return Math.max(0, Math.min(0.45, adjusted));
        }

        function isTreeBiome(biomeName) {
            const normalized = String(biomeName || '').toLowerCase();
            if (!normalized) return false;
            if (normalized.includes('ocean') || normalized.includes('desert') || normalized.includes('snowy') || normalized.includes('mountain')) return false;
            return true;
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


        function chooseJungleTreeProfile({ topY, wx, wz, seaLevel, hashRand2D }) {
            const useLarge = hashRand2D(wx, wz, 911) < 0.28;
            return {
                style: useLarge ? 'jungle_large' : 'jungle_small',
                trunkHeight: useLarge
                    ? (8 + Math.floor(hashRand2D(wx, wz, 913) * 4))
                    : (5 + Math.floor(hashRand2D(wx, wz, 157) * 3)),
            };
        }

        function jungleTreeLayout(treeStyle, relY) {
            if (treeStyle === 'jungle_large') {
                const profile = window.JungleLargeTree;
                if (profile?.canopyRadius) return { radius: profile.canopyRadius(relY), trunkOffsets: profile.trunkOffsets || [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }] };
                if (relY >= 2) return { radius: 2, trunkOffsets: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }] };
                if (relY >= 1) return { radius: 3, trunkOffsets: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }] };
                if (relY >= 0) return { radius: 4, trunkOffsets: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }] };
                if (relY >= -1) return { radius: 4, trunkOffsets: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }] };
                return { radius: 3, trunkOffsets: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }] };
            }

            const profile = window.JungleSmallTree;
            if (profile?.canopyRadius) return { radius: profile.canopyRadius(relY), trunkOffsets: profile.trunkOffsets || [{ x: 0, z: 0 }] };
            if (relY >= 1) return { radius: 1, trunkOffsets: [{ x: 0, z: 0 }] };
            if (relY >= 0) return { radius: 2, trunkOffsets: [{ x: 0, z: 0 }] };
            if (relY >= -1) return { radius: 2, trunkOffsets: [{ x: 0, z: 0 }] };
            return { radius: 1, trunkOffsets: [{ x: 0, z: 0 }] };
        }

        function canPlaceMinecraftLikeTree(data, x, z, topY, trunkHeight, treeStyle = 'oak') {
            if (x < 2 || x > CHUNK_SIZE - 3 || z < 2 || z > CHUNK_SIZE - 3) return false;
            const trunkTopY = topY + trunkHeight;
            if (trunkTopY + 2 >= CHUNK_HEIGHT) return false;

            // Trunk clearance: validate every trunk column.
            const trunkOffsets = treeStyle === 'jungle_mountain' ? [{ x: 0, z: 0 }] : jungleTreeLayout(treeStyle, 0).trunkOffsets;
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
                    : jungleTreeLayout(treeStyle, rel).radius;
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
            const isJungleTree = treeStyle === 'jungle_small' || treeStyle === 'jungle_large' || treeStyle === 'jungle_mountain';
            const trunkType = treeStyle === 'glass_mushroom' ? 80 : (isJungleTree ? 96 : 5);
            const leafType = treeStyle === 'glass_mushroom' ? 26 : (isJungleTree ? 97 : 6);
            const trunkOffsets = treeStyle === 'jungle_mountain' ? [{ x: 0, z: 0 }] : jungleTreeLayout(treeStyle, 0).trunkOffsets;
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
                    : jungleTreeLayout(treeStyle, rel).radius;
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

            const crownY = trunkTopY + 2;
            if (crownY < CHUNK_HEIGHT) {
                const crownIdx = x + crownY * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_HEIGHT;
                if (data[crownIdx] === 0) data[crownIdx] = leafType;
            }
        }
        
        const oakTreeDecoration = {
            tryGenerateTreeAtColumn({ data, x, z, wx, wz, biome, isRiver, riverInfluence, worldGenSettings, seaLevel, chunkSize, chunkHeight, octaveNoise2D, hashRand2D, fallbackTreeCandidates }) {
                if (!isTreeBiome(biome) || isRiver) return false;

                let topY = -1;
                for (let yy = chunkHeight - 2; yy >= 1; yy--) {
                    const tidx = x + yy * chunkSize + z * chunkSize * chunkHeight;
                    const ttype = data[tidx];
                    if (ttype !== 0 && ttype !== 4 && ttype !== 6 && ttype !== 97) {
                        topY = yy;
                        break;
                    }
                }

                const minTreeY = Math.max(seaLevel - 2, 2);
                const maxTreeY = Math.min(chunkHeight - 8, seaLevel + 68);
                if (topY < minTreeY || topY > maxTreeY) return false;

                const topIdx = x + topY * chunkSize + z * chunkSize * chunkHeight;
                const topType = data[topIdx];
                const validGround = (topType === 1 || topType === 2 || topType === 3 || topType === 7 || topType === 28);
                if (!validGround) return false;

                const treeNoise = octaveNoise2D(wx, wz, 2, 0.56, 2.0, 0.028, 700, -350) * 0.5 + 0.5;
                const scatter = hashRand2D(wx, wz, 99);
                const density = treeNoise * 0.6 + scatter * 0.4;
                const chance = getTreeSpawnChanceForBiome(biome, topY);
                const clusterBonus = Number(worldGenSettings.treeClusterBonus ?? 0.12);
                const nearbyTree = hasNearbyTreeTrunk(data, x, z, 3);
                const spacingGate = Number(worldGenSettings.treeMinSpacingChance ?? 0.65);
                const spawnRoll = hashRand2D(wx, wz, 431);
                const shouldTrySpawn = (spawnRoll < (chance + density * clusterBonus)) && (!nearbyTree || spawnRoll < spacingGate * 0.75);
                if (!shouldTrySpawn) {
                    fallbackTreeCandidates.push({ x, z, topY, wx, wz, biome });
                    return false;
                }

                const isJungleForest = biome === 'Jungle Forest';
                const jungleProfile = isJungleForest
                    ? chooseJungleTreeProfile({ topY, wx, wz, seaLevel, hashRand2D })
                    : null;
                const trunkHeight = isJungleForest
                    ? jungleProfile.trunkHeight
                    : (4 + Math.floor(hashRand2D(wx, wz, 157) * 2));
                const treeStyle = biome === 'Mushroom Fields'
                    ? 'glass_mushroom'
                    : (isJungleForest ? jungleProfile.style : 'oak');
                if (!canPlaceMinecraftLikeTree(data, x, z, topY, trunkHeight, treeStyle)) {
                    fallbackTreeCandidates.push({ x, z, topY, wx, wz, biome });
                    return false;
                }

                if (data[topIdx] === 2) data[topIdx] = 1;
                placeMinecraftLikeTree(data, x, z, topY, trunkHeight, wx, wz, treeStyle);
                return true;
            },
            placeFallbackTree({ data, cx, cz, fallbackTreeCandidates, hashRand2D, chunkSize }) {
                if (!fallbackTreeCandidates.length) return false;
                const pick = Math.floor(hashRand2D(cx, cz, 6083) * fallbackTreeCandidates.length);
                const candidate = fallbackTreeCandidates[Math.max(0, Math.min(fallbackTreeCandidates.length - 1, pick))];
                if (!candidate) return false;

                const { x, z, topY, wx, wz, biome } = candidate;
                const isJungleForest = biome === 'Jungle Forest';
                const jungleProfile = isJungleForest
                    ? chooseJungleTreeProfile({ topY, wx, wz, seaLevel: SEA_LEVEL, hashRand2D })
                    : null;
                const trunkHeight = isJungleForest
                    ? jungleProfile.trunkHeight
                    : (4 + Math.floor(hashRand2D(wx, wz, 157) * 2));
                const treeStyle = biome === 'Mushroom Fields'
                    ? 'glass_mushroom'
                    : (isJungleForest ? jungleProfile.style : 'oak');
                if (!canPlaceMinecraftLikeTree(data, x, z, topY, trunkHeight, treeStyle)) return false;

                const topIdx = x + topY * chunkSize + z * chunkSize * CHUNK_HEIGHT;
                if (data[topIdx] === 2) data[topIdx] = 1;
                placeMinecraftLikeTree(data, x, z, topY, trunkHeight, wx, wz, treeStyle);
                return true;
            }
        };

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
                     const ravineMask = getRavineMask(wx, wz);
                     const ravineTopCap = Math.max(3, h - RAVINE_SURFACE_SAFETY_DEPTH);
                     const canCarveRavine = ravineMask > RAVINE_ACTIVATION_THRESHOLD && ravineTopCap > 3;
                     const ravineStrength = canCarveRavine
                        ? ((ravineMask - RAVINE_ACTIVATION_THRESHOLD) / (1 - RAVINE_ACTIVATION_THRESHOLD))
                        : 0;
                     const ravineTop = canCarveRavine ? Math.min(ravineTopCap, CHUNK_HEIGHT - 1) : 0;
                     const ravineMaxDepth = canCarveRavine ? (12 + Math.floor(ravineStrength * 8)) : 0;
                     const ravineBottom = canCarveRavine ? Math.max(3, ravineTop - ravineMaxDepth) : 0;
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
                             
                            // --- RIVER BED OVERRIDE ---
                            if (isRiver && y < SEA_LEVEL - 1) { 
                                // If it's part of the river path and below the water line, make it stone/dirt bed
                                // Use sand/dirt near the surface of the riverbed
                                if (y > SEA_LEVEL - 3) t = (biome === 'Desert' ? 7 : 2); // Sand/Dirt bed near top
                                else t = 3; // Stone bed deep down
                            }
                            
                         } else if (y < SEA_LEVEL) {
                             t = 0; // Start as air above the land height
                             
                             // --- WATER FILLING ---
                             if (isRiver) {
                                 t = isFrozenRiver ? 59 : 4; // River water / ice
                             } 
                             // If it's the ocean biome, fill the area above ground and below sea level with water
                             else if (biome === 'Ocean') {
                                 t = 4;
                             }
                             // Otherwise (on dry land, above h, below sea level, not river) it remains air (t=0)
                         }
                         
                        // --- Cave Generation Pass (layered Perlin for bigger cave systems) ---
                        if (y > CAVE_MIN_Y && y < h - CAVE_MAX_Y_OFFSET && (h - y) >= (CAVE_SURFACE_SAFETY_DEPTH + 2)) {
                            if (t === 3 || t === 2 || t === 7 || t === 13 || t === 28 || t === 59) {
                                const caveShape = sampleCaveShape(wx, y, wz);

                                const depth = Math.max(0, (h - y) / Math.max(1, h));
                                const nearSurfaceGuard = depth < 0.2 ? 0.1 : (depth < 0.35 ? 0.05 : 0);
                                const dynamicThreshold = CAVE_THRESHOLD + nearSurfaceGuard - Math.min(0.1, depth * 0.14);
                                const tunnelNoise = Math.abs(perlin.noise3D(wx * CAVE_SCALE * 0.7, y * CAVE_SCALE * 0.45, wz * CAVE_SCALE * 0.7));

                                if (caveShape > dynamicThreshold || (depth > 0.55 && tunnelNoise < 0.05)) {
                                    t = 0;
                                }
                            }
                        }
                         
                         
// 🔹 Optimized Ravine Generation
if (canCarveRavine) {
    const strength = ravineStrength;
    if (y <= ravineTop && y >= ravineBottom) {
        const mid = (ravineTop + ravineBottom) / 2;
        const halfHeight = (ravineTop - ravineBottom) / 2;
        const verticalFactor = 1 - Math.abs(y - mid) / halfHeight;

        // Reduce noise impact
        const widthNoise = octaveNoise2D(wx, wz, 2, 0.5, 2.0, 0.04, 812, -245);
        const widthFactor = strength * verticalFactor + widthNoise * 0.06;

        if (widthFactor > 0.42) {
            // 🔥 Lava very deep underground (only really deep)
            if (y < 6) {
                t = 33;
            }
            // 🌊 Water below sea level
            else if (y < SEA_LEVEL - 1) {
                t = 4;
            }
            // 🌫 Air above sea level
            else {
                t = 0;
            }
        }
    }
}
                             
                             
                             
    // Coal ore pass: mineable by hand, faster with pickaxe.
if ((t === 3 || t === 13) && y > 6 && y < Math.min(CHUNK_HEIGHT - 6, h - 2)) {
    const veinNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.09, 1450, -870);
    const depthBias = 1 - (y / CHUNK_HEIGHT);
    const oreRoll = hashRand2D(wx + y * 13, wz - y * 7, 301);
    if (veinNoise > 0.12 && oreRoll < (0.06 + depthBias * 0.08)) {
        t = 18;
    }
}

// Copper ore pass
if ((t === 3 || t === 13) && y > 6 && y < Math.min(CHUNK_HEIGHT - 6, h - 2)) {
    const veinNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.07, 5555, -666);
    const depthBias = 1 - (y / CHUNK_HEIGHT);
    const oreRoll = hashRand2D(wx + y * 13, wz - y * 7, 302);

    if (veinNoise > 0.20 && oreRoll < (0.06 + depthBias * 0.08)) {
        t = 35; // copper ore
    }
}

// Iron ore pass
if ((t === 3 || t === 13) && y > 4 && y < CHUNK_HEIGHT * 0.6) {
    const veinNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.07, 2222, -333);
    const depthBias = 1 - (y / CHUNK_HEIGHT);
    const oreRoll = hashRand2D(wx + y * 17, wz - y * 11, 777);

    if (veinNoise > 0.18 && oreRoll < (0.04 + depthBias * 0.06)) {
        t = 30; // iron ore
    }
}

// Gold ore pass
if ((t === 3 || t === 13) && y > 2 && y < CHUNK_HEIGHT * 0.4) {
    const veinNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.08, 9999, -1234);
    const depthBias = 1 - (y / CHUNK_HEIGHT);
    const oreRoll = hashRand2D(wx + y * 19, wz - y * 13, 303);

    if (veinNoise > 0.25 && oreRoll < (0.03 + depthBias * 0.05)) {
        t = 40; // gold ore
    }
}

// Diamond ore pass
if ((t === 3 || t === 13) && y > 2 && y < CHUNK_HEIGHT * 0.2) {
    const veinNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.08, 11111, -8930);
    const depthBias = 1 - (y / CHUNK_HEIGHT);
    const oreRoll = hashRand2D(wx + y * 21, wz - y * 15, 303);

    if (veinNoise > 0.30 && oreRoll < (0.02 + depthBias * 0.03)) {
        t = 43; // diamond ore
    }
}

// Emerald ore pass
if ((t === 3 || t === 13) && y > 2 && y < CHUNK_HEIGHT * 0.2) {
    const veinNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.08, 23498, -19840);
    const depthBias = 1 - (y / CHUNK_HEIGHT);
    const oreRoll = hashRand2D(wx + y * 26, wz - y * 17, 303);

    if (veinNoise > 0.34 && oreRoll < (0.025 + depthBias * 0.02)) {
        t = 54; // emerald ore
    }
}



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
             if (treesPlacedInChunk === 0) {
                 oakTreeDecoration?.placeFallbackTree?.({
                     data,
                     cx,
                     cz,
                     fallbackTreeCandidates,
                     hashRand2D,
                     chunkSize: CHUNK_SIZE,
                     chunkHeight: CHUNK_HEIGHT
                 });
             }

             const heightmap = buildChunkHeightmap(data);
             const spawnedPigs = [];
             const spawnedWolves = [];
             placeIglooInChunk(data, cx, cz, spawnedGnomes);
             placeDesertWellInChunk(data, cx, cz, spawnedPigs);
             placeWolfPackInChunk(data, heightmap, cx, cz, spawnedWolves);
             return { data, heightmap, spawnedGnomes, spawnedPigs, spawnedWolves };
        }

        function placeIglooInChunk(data, cx, cz, spawnedGnomes) {
            const snowyTerrain = window.SnowyPlainsTerrain || {};
            const iglooRules = snowyTerrain.structures?.igloo;
            if (!iglooRules || !iglooStructureDef) return;
            const canSpawn = snowyTerrain.shouldSpawnIgloo
                ? snowyTerrain.shouldSpawnIgloo({ cx, cz, hashRand2D, spawnChance: iglooRules.spawnChancePerChunk })
                : false;
            if (!canSpawn) return;

            const radius = Math.max(2, Math.min(6, Number(iglooStructureDef.radius) || 4));
            const centerX = Math.floor(CHUNK_SIZE / 2);
            const centerZ = Math.floor(CHUNK_SIZE / 2);
            if (centerX - radius < 1 || centerX + radius >= CHUNK_SIZE - 1 || centerZ - radius < 1 || centerZ + radius >= CHUNK_SIZE - 1) return;

            const idx = (lx, ly, lz) => lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT;
            const getColumnTop = (lx, lz) => {
                for (let y = CHUNK_HEIGHT - 2; y >= 1; y--) {
                    const t = data[idx(lx, y, lz)];
                    if (t !== 0 && t !== 4) return y;
                }
                return -1;
            };

            const centerTopY = getColumnTop(centerX, centerZ);
            if (centerTopY < SEA_LEVEL) return;
            const requiredGround = iglooRules.validSurfaceBlockId ?? 15;
            if (data[idx(centerX, centerTopY, centerZ)] !== requiredGround) return;

            const maxSlope = Number(iglooStructureDef.maxSurfaceSlope) || 2;
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const lx = centerX + dx;
                    const lz = centerZ + dz;
                    const topY = getColumnTop(lx, lz);
                    if (topY < 1 || Math.abs(topY - centerTopY) > maxSlope) return;
                }
            }

            const floorBlock = Number(iglooStructureDef.floorBlockId) || 59;
            const wallBlock = Number(iglooStructureDef.wallBlockId) || 15;
            const windowBlock = Number(iglooStructureDef.windowBlockId) || wallBlock;
            const domeHeight = Number(iglooStructureDef.interiorHeadroom) || 3;
            const doorHeight = Math.max(2, Number(iglooStructureDef.doorHeight) || 2);

            const centerY = centerTopY + 1;
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    const lx = centerX + dx;
                    const lz = centerZ + dz;
                    if (dist <= radius - 0.35) data[idx(lx, centerTopY, lz)] = floorBlock;

                    for (let dy = 0; dy <= domeHeight; dy++) {
                        const ly = centerY + dy;
                        if (ly < 1 || ly >= CHUNK_HEIGHT - 1) continue;
                        const shellDist = Math.sqrt(dx * dx + dz * dz + (dy * 1.22) * (dy * 1.22));
                        if (shellDist <= radius + 0.18 && shellDist >= radius - 1.05) {
                            data[idx(lx, ly, lz)] = wallBlock;
                        } else if (shellDist < radius - 1.05) {
                            data[idx(lx, ly, lz)] = 0;
                        }
                    }
                }
            }

            for (let dy = 0; dy < doorHeight; dy++) {
                const ly = centerY + dy;
                data[idx(centerX, ly, centerZ + radius)] = 0;
                data[idx(centerX, ly, centerZ + radius - 1)] = 0;
            }
            data[idx(centerX - radius + 1, centerY + 1, centerZ)] = windowBlock;
            data[idx(centerX + radius - 1, centerY + 1, centerZ)] = windowBlock;

            const worldX = cx * CHUNK_SIZE + centerX;
            const worldZ = cz * CHUNK_SIZE + centerZ;
            const gnomeY = centerTopY + (Number(iglooStructureDef.gnomeSpawnOffsetY) || 1);
            spawnedGnomes.push({ wx: worldX, wy: gnomeY, wz: worldZ });
        }

        function placeDesertWellInChunk(data, cx, cz, spawnedPigs) {
            const centerX = Math.floor(CHUNK_SIZE / 2);
            const centerZ = Math.floor(CHUNK_SIZE / 2);
            const worldX = cx * CHUNK_SIZE + centerX;
            const worldZ = cz * CHUNK_SIZE + centerZ;

            if (getBiome(worldX, worldZ) !== 'Desert') return;
            if (hashRand2D(cx, cz, 9127) > 0.08) return;

            const idx = (lx, ly, lz) => lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT;
            const getColumnTop = (lx, lz) => {
                for (let y = CHUNK_HEIGHT - 2; y >= 1; y--) {
                    const t = data[idx(lx, y, lz)];
                    if (t !== 0 && t !== 4) return y;
                }
                return -1;
            };

            const radius = 2;
            if (centerX - radius < 2 || centerX + radius >= CHUNK_SIZE - 2 || centerZ - radius < 2 || centerZ + radius >= CHUNK_SIZE - 2) return;

            const topY = getColumnTop(centerX, centerZ);
            if (topY < SEA_LEVEL - 1) return;
            if (data[idx(centerX, topY, centerZ)] !== 7) return;

            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const lx = centerX + dx;
                    const lz = centerZ + dz;
                    const y = getColumnTop(lx, lz);
                    if (y < 1 || Math.abs(y - topY) > 1) return;
                    const ground = data[idx(lx, y, lz)];
                    if (ground !== 7 && ground !== 13) return;
                }
            }

            const sandstone = 13;
            const water = 4;
            const copperBlock = 34;
            const wellY = topY + 1;

            // 5x5 sandstone base
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    data[idx(centerX + dx, wellY, centerZ + dz)] = sandstone;
                }
            }

            // water basin cross
            data[idx(centerX, wellY, centerZ)] = water;
            data[idx(centerX + 1, wellY, centerZ)] = water;
            data[idx(centerX - 1, wellY, centerZ)] = water;
            data[idx(centerX, wellY, centerZ + 1)] = water;
            data[idx(centerX, wellY, centerZ - 1)] = water;

            // copper block under center
            if (wellY - 1 >= 1) data[idx(centerX, wellY - 1, centerZ)] = copperBlock;

            // pillars
            for (let py = wellY + 1; py <= wellY + 3; py++) {
                data[idx(centerX - 1, py, centerZ - 1)] = sandstone;
                data[idx(centerX - 1, py, centerZ + 1)] = sandstone;
                data[idx(centerX + 1, py, centerZ - 1)] = sandstone;
                data[idx(centerX + 1, py, centerZ + 1)] = sandstone;
            }

            // roof
            const roofY = wellY + 4;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    data[idx(centerX + dx, roofY, centerZ + dz)] = sandstone;
                }
            }

            spawnedPigs.push({ wx: worldX + 0.5, wy: wellY + 1, wz: worldZ + 0.5 });
        }

        function placeWolfPackInChunk(data, heightmap, cx, cz, spawnedWolves) {
            const centerX = Math.floor(CHUNK_SIZE / 2);
            const centerZ = Math.floor(CHUNK_SIZE / 2);
            const worldX = cx * CHUNK_SIZE + centerX;
            const worldZ = cz * CHUNK_SIZE + centerZ;
            if (getBiome(worldX, worldZ) !== 'Forest') return;
            if (hashRand2D(cx, cz, 7701) > 0.12) return;

            const idx = (lx, ly, lz) => lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_HEIGHT;
            const getColumnTop = (lx, lz) => {
                for (let y = CHUNK_HEIGHT - 2; y >= 1; y--) {
                    const t = data[idx(lx, y, lz)];
                    if (t !== 0 && t !== 4) return y;
                }
                return -1;
            };

            const packSize = 1 + Math.floor(hashRand2D(cx, cz, 7702) * 5);
            for (let i = 0; i < packSize; i++) {
                const rx = Math.floor(hashRand2D(cx * 37 + i * 7, cz * 53 + i * 11, 7703) * CHUNK_SIZE);
                const rz = Math.floor(hashRand2D(cx * 41 + i * 13, cz * 29 + i * 17, 7704) * CHUNK_SIZE);
                if (rx < 1 || rz < 1 || rx >= CHUNK_SIZE - 1 || rz >= CHUNK_SIZE - 1) continue;
                const topY = getColumnTop(rx, rz);
                if (topY < SEA_LEVEL || topY > SEA_LEVEL + 24) continue;
                const under = data[idx(rx, topY, rz)];
                if (under !== 1 && under !== 2) continue;
                spawnedWolves.push({ wx: cx * CHUNK_SIZE + rx + 0.5, wy: topY + 1, wz: cz * CHUNK_SIZE + rz + 0.5 });
            }
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
                for (const pig of generated.spawnedPigs) spawnPigAtExact(pig.wx, pig.wy, pig.wz);
            }
            if (generated.spawnedWolves && generated.spawnedWolves.length) {
                for (const wolf of generated.spawnedWolves) spawnWolfAtExact(wolf.wx, wolf.wy, wolf.wz);
            }
            return group;
        }


        function computeChunkHash(data) {
            let h = 2166136261 >>> 0;
            for (let i = 0; i < data.length; i++) {
                h ^= data[i] & 0xff;
                h = Math.imul(h, 16777619) >>> 0;
            }
            return h >>> 0;
        }

        function isChunkAllAir(data) {
            for (let i = 0; i < data.length; i++) {
                if (data[i] !== 0) return false;
            }
            return true;
        }

        function convertChunkToSparseAir(chunkGroup) {
            if (!chunkGroup || !chunkGroup.userData) return;
            const cx = chunkGroup.userData.cx;
            const cz = chunkGroup.userData.cz;
            const chunkKey = `${cx},${cz}`;

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
            sparseAirChunkKeys.add(chunkKey);
            dirtyChunkRemeshReasons.delete(chunkKey);
        }

        function updateChunkFrustumCulling() {
            camera.updateMatrixWorld();
            cameraViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            frustum.setFromProjectionMatrix(cameraViewProj);

            // Conservative chunk-level culling only: rely on frustum test to avoid directional popping.
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

        function updateChunkAndNeighbors(centerGroup, lx, lz) {
            const cx = centerGroup.userData.cx;
            const cz = centerGroup.userData.cz;
            const needsNeighbors = (lx === 0 || lx === CHUNK_SIZE - 1 || lz === 0 || lz === CHUNK_SIZE - 1);

            if (blockUpdateBatchDepth > 0) {
                markBatchedChunkRemeshNeed(cx, cz, needsNeighbors);
                return;
            }

            requestChunkRemesh(cx, cz, 'block');
            if (needsNeighbors) {
                requestChunkAndNeighborsRemesh(cx, cz, 'neighbor');
            }
            rebuildDirtyChunkMeshes();
        }
        
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
                if (materials[key] && materials[key].map) return key; 
                return `textures/Fallback.png`;
            }
            if (id === 4) return 'WATER'; 
            if (id === 5) return 'WOOD';  
            
            // For non-textured blocks that might have been assigned a vertex color
            return 'COLORED_OPAQUE';
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

        function syncTorchLightsForChunk(group, torchPositions) {
            if (!scene) return;
            const chunkKey = `${group.userData.cx},${group.userData.cz}`;
            removeTorchLightsForChunk(chunkKey);
            if (!torchPositions || torchPositions.length === 0) return;

            const maxLightsPerChunk = 24;
            const created = [];
            for (let i = 0; i < torchPositions.length && created.length < maxLightsPerChunk; i++) {
                const p = torchPositions[i];
                const light = new THREE.PointLight(0xffc88a, 0.88, 12, 2);
                light.position.set(p.x + 0.5, p.y + 0.62, p.z + 0.5);
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

            const faces = [
                { name: 'posX', dir: [1,0,0], corners: [[1,1,1],[1,0,1],[1,0,0],[1,1,0]], uv: [0,1, 0,0, 1,0, 1,1] },
                { name: 'negX', dir: [-1,0,0], corners: [[0,1,0],[0,0,0],[0,0,1],[0,1,1]], uv: [0,1, 0,0, 1,0, 1,1] },
                { name: 'top', dir: [0,1,0], corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], uv: [0,1, 0,0, 1,0, 1,1] },
                { name: 'bottom', dir: [0,-1,0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], uv: [0,1, 0,0, 1,0, 1,1] },
                { name: 'posZ', dir: [0,0,1], corners: [[0,1,1],[0,0,1],[1,0,1],[1,1,1]], uv: [0,1, 0,0, 1,0, 1,1] },
                { name: 'negZ', dir: [0,0,-1], corners: [[1,1,0],[1,0,0],[0,0,0],[0,1,0]], uv: [0,1, 0,0, 1,0, 1,1] }
            ];
            const torchFaces = [
                { name: 'posX', dir: [1,0,0], corners: [[0.5625,0.8,0.5625],[0.5625,0.05,0.5625],[0.5625,0.05,0.4375],[0.5625,0.8,0.4375]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'negX', dir: [-1,0,0], corners: [[0.4375,0.8,0.4375],[0.4375,0.05,0.4375],[0.4375,0.05,0.5625],[0.4375,0.8,0.5625]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'top', dir: [0,1,0], corners: [[0.4375,0.8,0.5625],[0.5625,0.8,0.5625],[0.5625,0.8,0.4375],[0.4375,0.8,0.4375]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'bottom', dir: [0,-1,0], corners: [[0.4375,0.05,0.4375],[0.5625,0.05,0.4375],[0.5625,0.05,0.5625],[0.4375,0.05,0.5625]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'posZ', dir: [0,0,1], corners: [[0.4375,0.8,0.5625],[0.4375,0.05,0.5625],[0.5625,0.05,0.5625],[0.5625,0.8,0.5625]], uv: [0,1,0,0,1,0,1,1] },
                { name: 'negZ', dir: [0,0,-1], corners: [[0.5625,0.8,0.4375],[0.5625,0.05,0.4375],[0.4375,0.05,0.4375],[0.4375,0.8,0.4375]], uv: [0,1,0,0,1,0,1,1] }
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
                                if (mat.transparent || (mat.textured && mat.textureKey === 'LEAVES')) continue;
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
                                if (mat.transparent || (mat.textured && mat.textureKey === 'LEAVES')) continue;
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
                                if (mat.transparent || (mat.textured && mat.textureKey === 'LEAVES')) continue;
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
                        if (isTorch) torchPositions.push({ x: x + cx * CS, y, z: z + cz * CS });
                        const isTrans = mat.transparent || (mat.textured && mat.textureKey === 'LEAVES');
                        if (!isTorch && !isTrans) continue;
                        const activeFaces = isTorch ? torchFaces : faces;

                        for (let i = 0; i < 6; i++) {
                            const f = activeFaces[i];
                            const nid = get(x + f.dir[0], y + f.dir[1], z + f.dir[2]);
                            let draw = false;
                            if (isTorch) draw = true;
                            else if (shouldDrawFace(id, nid)) draw = true;
                            if (!draw) continue;

                            const materialKey = getMaterialKey(id, f.dir);
                            const faceName = f.name || getFaceName(f.dir);
                            const uvInfo = getFaceUvInfo(id, faceName, f.uv);
                            const wx = x + cx * CS;
                            const wz = z + cz * CS;
                            const corners = f.corners.map((c) => [wx + c[0], y + c[1], wz + c[2]]);
                            emitQuad(id, materialKey, f.dir, corners, uvInfo.uv, !isTorch);
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

            syncTorchLightsForChunk(group, torchPositions);
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
            const key = String(raw || '').toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
            const map = {
                plains: 'Plains',
                forest: 'Forest',
                'oak forest': 'Forest',
                oak_forest: 'Forest',
                desert: 'Desert',
                mountains: 'Mountains',
                mountain: 'Mountains',
                snowy: 'Snowy Plains',
                'snowy plains': 'Snowy Plains',
                snow: 'Snowy Plains',
                jungle: 'Jungle Forest',
                'jungle forest': 'Jungle Forest',
                ocean: 'Ocean',
            };
            return map[key] || '';
        }

        function teleportToBiome(rawBiomeName) {
            const targetBiome = normalizeBiomeCommandName(rawBiomeName);
            if (!targetBiome) return { ok: false, message: 'Unknown biome. Try plains, forest, oak_forest, desert, mountains, snowy_plains, jungle.' };
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
                            if (biome === 'Ocean' || biome === 'Frozen River') continue;
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
                            if (biome === 'Ocean' || biome === 'Frozen River') continue;
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
                            if (biome === 'Ocean' || biome === 'Frozen River') continue;
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
                            if (biome === 'Ocean' || biome === 'Frozen River') continue;
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
                            if (biome === 'Ocean' || biome === 'Frozen River') continue;
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
            // Small hysteresis band prevents rapid load/unload thrashing when crossing chunk borders.
            return currentChunkLoadRadius + 1;
        }

        function ensureChunksAroundPlayer(forceUpdate = false, nowMs = performance.now()) {
            if (!yawObject) return;
            const playerChunkX = Math.floor(yawObject.position.x / CHUNK_SIZE);
            const playerChunkZ = Math.floor(yawObject.position.z / CHUNK_SIZE);
            const sameChunk = playerChunkX === lastChunkCoordX && playerChunkZ === lastChunkCoordZ;
            if (!forceUpdate && sameChunk && (nowMs - lastChunkUpdateMs) < CHUNK_UPDATE_INTERVAL_MS) return;

            lastChunkCoordX = playerChunkX;
            lastChunkCoordZ = playerChunkZ;
            lastChunkUpdateMs = nowMs;

            const loadRadius = currentChunkLoadRadius;
            const keepRadius = getChunkRetentionRadius();

            const budget = forceUpdate ? CHUNK_CREATION_BUDGET_FORCE : CHUNK_CREATION_BUDGET_PER_TICK;
            if (budget > 0) {
                const offsets = getChunkOffsetsForRadius(loadRadius);
                const loadRadiusSq = loadRadius * loadRadius;
                let created = 0;
                for (let i = 0; i < offsets.length && created < budget; i++) {
                    const off = offsets[i];
                    if (off.dist2 > loadRadiusSq) continue;
                    const cx = playerChunkX + off.dx;
                    const cz = playerChunkZ + off.dz;
                    const chunkKey = `${cx},${cz}`;
                    if (chunks.has(chunkKey) || sparseAirChunkKeys.has(chunkKey)) continue;
                    createChunk(cx, cz);
                    created++;
                }
            }

            const chunkKeysToRemove = [];
            const keepRadiusSq = keepRadius * keepRadius;
            for (const [chunkKey, chunkGroup] of chunks.entries()) {
                const dx = chunkGroup.userData.cx - playerChunkX;
                const dz = chunkGroup.userData.cz - playerChunkZ;
                const dist2 = dx * dx + dz * dz;
                if (dist2 > keepRadiusSq) {
                    chunkKeysToRemove.push(chunkKey);
                }
            }

            for (const chunkKey of chunkKeysToRemove) {
                const chunkGroup = chunks.get(chunkKey);
                if (!chunkGroup) continue;
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
        }

        function generateWorld() {
            ensureChunksAroundPlayer(true);
        }

        function processMeshUpdateQueue() {
            // Spread chunk mesh rebuilds across frames to avoid spikes.
            rebuildDirtyChunkMeshes(false);
        }

        function maybeUpdateChunkFrustumCulling(nowMs) {
            const intervalElapsed = (nowMs - lastFrustumCullMs) >= FRUSTUM_CULL_INTERVAL_MS;

            const movedSq = hasFrustumCameraState ? camera.position.distanceToSquared(lastFrustumCameraPos) : Infinity;
            const rotatedDelta = hasFrustumCameraState ? (1 - Math.abs(camera.quaternion.dot(lastFrustumCameraQuat))) : Infinity;
            const cameraChanged = movedSq > 0.04 || rotatedDelta > 0.00008;

            if (!intervalElapsed && !cameraChanged) return;

            lastFrustumCullMs = nowMs;
            lastFrustumCameraPos.copy(camera.position);
            lastFrustumCameraQuat.copy(camera.quaternion);
            hasFrustumCameraState = true;
            updateChunkFrustumCulling();
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


        function animate(time) {
            requestAnimationFrame(animate);
            const delta = lastTime ? (time - lastTime) : 0;
            lastTime = time;

            cycleTimeMs = (cycleTimeMs + delta) % DAY_CYCLE_DURATION;
            updateSkyAndSun();

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
                updatePigs(time, delta);
                updateWolves(time, delta);
                trySpawnNightZombie(delta);
                updateZombies(time, delta);
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
                updatePigs(time, delta);
                updateWolves(time, delta);
                updateZombies(time, delta);
                updateEatingAnimation(delta, time);
                maybeSpawnLavaParticles(delta);
                updateWorldParticles(delta);
                processMeshUpdateQueue();
                miningState.active = false;
                updateBreakingOverlay();
            }
            updateCoordinatesUI();
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
