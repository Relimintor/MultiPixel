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

        window.__SINGLEPLAYER_BUILD__ = 'sp-2026-03-01-03';
        console.info('[Singleplayer build]', window.__SINGLEPLAYER_BUILD__);

        const TerrainModules = {};

        const worldGenSettings = WORLD_GEN_SETTINGS || {};

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
        const dirtyChunkKeys = new Set();
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
     

      
        let scene, camera, renderer, perlin, raycaster;
        let worldGenerator = null;
        let lightingSystem = null;
        const torchLightsByChunk = new Map();
        const frustum = new THREE.Frustum();
        const cameraViewProj = new THREE.Matrix4();
        const frustumTempCenter = new THREE.Vector3();
        const frustumTempSphere = new THREE.Sphere();
        const chunks = new Map();
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
                worldGenerator = new window.WorldgenCore.InfiniteWorldGenerator({
                    seed: worldSeed,
                    perlin,
                    seaLevel: SEA_LEVEL,
                    baseLandY: BASE_LAND_Y,
                    chunkSize: CHUNK_SIZE,
                    chunkHeight: CHUNK_HEIGHT,
                });
                console.info('[World seed]', worldSeed);
                lightingSystem = SpawnLighting.create ? SpawnLighting.create({ getBlockType, isLiquid, CHUNK_HEIGHT }) : null;
            } else {
                console.error("PerlinNoise library failed to load.");
                return;
            }
            
            raycaster = new THREE.Raycaster();
            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            
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
            if (closeBtn) closeBtn.addEventListener('click', () => {
                if (isInventoryOpen) toggleInventory();
            });
            if (editSkinBtn) editSkinBtn.addEventListener('click', () => {
                toggleInventorySkinPreview();
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
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
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
            addToInventory(2, 64); // Dirt
            addToInventory(5, 5); // Wood Log (for crafting)
            addToInventory(6, 1); // Leaves
            addToInventory(14, 42);
            addToInventory(11, 42);
            addToInventory(12, 42);      
            addToInventory(72, 42);      
            addToInventory(73, 42);      
            addToInventory(74, 42);      
            addToInventory(75, 42);      
            addToInventory(34, 42);      
            addToInventory(37, 42);      
            addToInventory(76, 42);      
            addToInventory(77, 42);      
            addToInventory(78, 42);      
            addToInventory(36, 42);  
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

        function updateSkyAndSun() {
            const phaseInfo = getTimePhaseInfo();
            let sunFactor = 0;

            if (phaseInfo.phase === 'Day') sunFactor = 1;
            else if (phaseInfo.phase === 'Night') sunFactor = -0.85;
            else if (phaseInfo.phase === 'Sunrise') sunFactor = -0.85 + 1.85 * phaseInfo.localT;
            else sunFactor = 1 - 1.85 * phaseInfo.localT;

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
            scene.fog.near = 20 + daylight * 8;
            scene.fog.far = 105 + daylight * 38;
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

        function updateGnomes(time) {
            if (!gnomeEntities.length) return;
            const lookTarget = new THREE.Vector3(yawObject.position.x, 0, yawObject.position.z);
            for (const g of gnomeEntities) {
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

        function getZombiePartRects(partName) {
            if (partName === 'head') return buildMobPartFaceRects(0, 0, 8, 8, 8);
            if (partName === 'body') return buildMobPartFaceRects(16, 16, 8, 12, 4);
            if (partName === 'rightArm') return buildMobPartFaceRects(40, 16, 4, 12, 4);
            if (partName === 'leftArm') return buildMobPartFaceRects(40, 16, 4, 12, 4);
            if (partName === 'rightLeg') return buildMobPartFaceRects(0, 16, 4, 12, 4);
            if (partName === 'leftLeg') return buildMobPartFaceRects(0, 16, 4, 12, 4);
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
            leftArm.scale.x = -1;
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
            leftLeg.scale.x = -1;
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

        function getSurfaceYForEntity(wx, wz, startY = null) {
            const x = Math.floor(wx);
            const z = Math.floor(wz);

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
            return spawnPigAtExact(wx, y, wz);
        }

        function spawnPigAtExact(wx, y, wz) {
            const pigRoot = createPigMesh();
            pigRoot.position.set(Math.floor(wx) + 0.5, y, Math.floor(wz) + 0.5);
            scene.add(pigRoot);
            pigEntities.push({
                root: pigRoot,
                hp: 8,
                dir: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
                changeDirMs: 900 + Math.random() * 1800,
                groundProbeMs: 0,
                targetY: y,
                bobPhase: Math.random() * Math.PI * 2,
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
                const ok = id === 1 ? spawnPigAt(wx, wz) : (id === 2 ? spawnZombieAt(wx, wz) : false);
                if (ok) spawned++;
            }
            return spawned;
        }

        function updatePigs(time, deltaMs) {
            if (!pigEntities.length) return;
            const dt = Math.max(0.001, Math.min(0.05, deltaMs / 1000));
            for (const pig of pigEntities) {
                pig.changeDirMs -= deltaMs;
                if (pig.changeDirMs <= 0) {
                    pig.changeDirMs = 900 + Math.random() * 1800;
                    pig.dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                }

                const speed = 0.75;
                const nx = pig.root.position.x + pig.dir.x * speed * dt;
                const nz = pig.root.position.z + pig.dir.z * speed * dt;

                pig.groundProbeMs -= deltaMs;
                if (pig.groundProbeMs <= 0) {
                    pig.groundProbeMs = 220 + Math.random() * 180;
                    pig.targetY = getSurfaceYForEntity(nx, nz, pig.targetY);
                }

                if (pig.targetY > 0) {
                    pig.root.position.x = nx;
                    pig.root.position.z = nz;
                    pig.root.position.y += (pig.targetY - pig.root.position.y) * Math.min(1, dt * 10);
                }
                pig.root.rotation.y = Math.atan2(pig.dir.x, pig.dir.z);

                const swing = Math.sin(time * 0.008 + pig.bobPhase) * 0.17;
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

        function hurtPig(pig, amount = 4) {
            if (!pig) return;
            pig.hp -= amount;
            if (pig.hp > 0) {
                pig.changeDirMs = 0;
                pig.dir.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2).normalize();
                showGameMessage('Pig: oink!');
                return;
            }
            const idx = pigEntities.indexOf(pig);
            if (idx >= 0) pigEntities.splice(idx, 1);
            scene.remove(pig.root);
            const drops = 1 + Math.floor(Math.random() * 3);
            addToInventory(89, drops);
            showGameMessage(`+${drops} Raw Porkchop`);
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

        function spawnZombieAt(wx, wz) {
            const y = getSurfaceYForEntity(wx, wz);
            if (y < SEA_LEVEL || y > SEA_LEVEL + 26) return false;
            const under = getBlockType(Math.floor(wx), y - 1, Math.floor(wz));
            if (under === 0 || isLiquid(under)) return false;

            const root = createZombieMesh();
            root.position.set(Math.floor(wx) + 0.5, y, Math.floor(wz) + 0.5);
            scene.add(root);
            zombieEntities.push({
                root,
                hp: 20,
                attackCooldownMs: 0,
                burnTickMs: 0,
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

        function updateZombies(time, deltaMs) {
            if (!zombieEntities.length) return;
            const dt = Math.max(0.001, Math.min(0.05, deltaMs / 1000));
            const phase = getTimePhaseInfo().phase;
            const burningTime = phase === 'Day' || phase === 'Sunrise';
            const playerPos = yawObject.position;

            for (let i = zombieEntities.length - 1; i >= 0; i--) {
                const z = zombieEntities[i];
                const toPlayer = new THREE.Vector3(playerPos.x - z.root.position.x, 0, playerPos.z - z.root.position.z);
                const dist = toPlayer.length();
                if (dist > 0.001) toPlayer.normalize();

                const speed = 1.18;
                const nx = z.root.position.x + toPlayer.x * speed * dt;
                const nz = z.root.position.z + toPlayer.z * speed * dt;

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

                if (dist > 0.1) z.root.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

                const parts = z.root.userData.zombieParts;
                if (parts) {
                    const walk = Math.sin(time * 0.01 + i) * 0.45;
                    parts.leftLegPivot.rotation.x = walk;
                    parts.rightLegPivot.rotation.x = -walk;
                    parts.leftArmPivot.rotation.x = -walk;
                    parts.rightArmPivot.rotation.x = walk;
                }

                z.attackCooldownMs = Math.max(0, z.attackCooldownMs - deltaMs);
                if (dist < 1.35 && z.attackCooldownMs <= 0) {
                    z.attackCooldownMs = 900;
                    takeDamage(3);
                }

                const zx = Math.floor(z.root.position.x);
                const zy = Math.floor(z.root.position.y + 1.6);
                const zz = Math.floor(z.root.position.z);
                const inLiquid = isLiquid(getBlockType(zx, zy, zz));
                if (burningTime && !inLiquid && canZombieSeeSky(zx, zy, zz)) {
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
            p.style.backgroundImage = `url('${BREAKING_PARTICLE_BASE}/break_particles.png')`;
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
                        imgPath = ASSET_FILEPATHS[mat.textureKey];
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

            if (slotType === 'hotbar') {
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

                    if (mat.textured) imgPath = ASSET_FILEPATHS[mat.textureKey];
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
                    imgPath = ASSET_FILEPATHS[mat.textureKey]; // Direct path
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
                const zombieHit = getZombieHitFromCrosshair();
                if (zombieHit) {
                    hurtZombie(zombieHit, 4);
                    return;
                }
                const pigHit = getPigHitFromCrosshair();
                if (pigHit) {
                    hurtPig(pigHit, 4);
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
            if (chunkData[index] === newType) return false;
            chunkData[index] = newType;

            if (deferGeometryUpdate) {
                dirtyChunkKeys.add(chunkId);
                if (lx <= 0) dirtyChunkKeys.add(`${cx-1},${cz}`);
                if (lx >= CHUNK_SIZE - 1) dirtyChunkKeys.add(`${cx+1},${cz}`);
                if (lz <= 0) dirtyChunkKeys.add(`${cx},${cz-1}`);
                if (lz >= CHUNK_SIZE - 1) dirtyChunkKeys.add(`${cx},${cz+1}`);
            } else {
                updateChunkAndNeighbors(group, lx, lz);
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
            const maxUpdates = 360;

            let updates = 0;

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
                            if (!isWater && !isLava && type !== 7) continue;


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
                                } else if (type === 7) {
                                        changed = window.SandPhysics.tryUpdate(ctx);
                                }
                                if (changed) updates++;
                        }
                    }
                }
            }

            if (dirtyChunkKeys.size > 0) {
                for (const key of dirtyChunkKeys) {
                    const g = chunks.get(key);
                    if (g) updateChunkGeometry(g, g.userData.chunkData);
                }
                dirtyChunkKeys.clear();
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

           
            updateChunkAndNeighbors(group, lx, lz);
            return true;
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
            if (window.HungerSystem) {
                window.HungerSystem.update(performance.now(), { isMoving, isSprinting, isJumping: player.isJumping });
            }
            const hungerMultiplier = window.HungerSystem ? window.HungerSystem.getSpeedMultiplier() : 1;

            if (isSwimming) {
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
                const sprintMultiplier = isSprinting ? player.sprintMultiplier : 1;
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
            { name: 'Plains', temp: -0.02, humidity: 0.02, continentalness: 0.1, erosion: 0.2, weirdness: 0.02 },
            { name: 'Snowy Plains', temp: -0.52, humidity: 0.04, continentalness: 0.12, erosion: 0.18, weirdness: -0.02 },
        ];

        function sampleClimateVector(wx, wz, y = SEA_LEVEL) {
            return {
                temp: octaveNoise3D(wx, y, wz, 3, 0.52, 2.0, 0.00048, -600, 170, 300),
                humidity: octaveNoise3D(wx, y, wz, 3, 0.55, 2.0, 0.00072, 320, -240, -130),
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
            const forestW = smoothstep(-0.12, 0.44, climate.humidity) * smoothstep(-0.28, 0.40, climate.temp) * (1 - desertW * 0.72);
            const plainsW = 0.16 + smoothstep(0.14, 0.66, continentalNoise) * 0.14;

            const total = oceanW + mountainW + desertW + snowyW + forestW + plainsW;
            if (total <= 0) {
                return {
                    tv,
                    climate,
                    weights: { Ocean: 0, Mountains: 0, Desert: 0, Forest: 0, Plains: 1, 'Snowy Plains': 0 }
                };
            }

            return {
                tv,
                climate,
                weights: {
                    Ocean: oceanW / total,
                    Mountains: mountainW / total,
                    Desert: desertW / total,
                    Forest: forestW / total,
                    Plains: plainsW / total,
                    'Snowy Plains': snowyW / total,
                }
            };
        }

        function getBiome(wx, wz) {
            if (worldGenerator) return worldGenerator.sampleBiome(wx, wz);
            return 'Plains';
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

        function getNoiseGroundHeight(wx, wz, biome) {
            if (worldGenerator) return worldGenerator.getHeight(wx, wz, biome);
            const tv = sampleTerrainVector(wx, wz);
            const continentalMask = (tv.continentalness + 1) * 0.5;
            const terrainNoise = (perlin.noise2D(wx * 0.02, wz * 0.02) + 1) * 0.5;
            const detailNoise = (perlin.noise2D(wx * 0.045, wz * 0.045) + 1) * 0.5;
            const erosionNoise = (tv.erosion + 1) * 0.5;
            const ridgeNoise = Math.abs(perlin.noise2D(wx * 0.02 + 50, wz * 0.02 + 50));
            const peakNoise = Math.abs(perlin.noise2D(wx * 0.007 - 250, wz * 0.007 + 400));
            const jaggedNoise = Math.abs(octaveNoise2D(wx, wz, 5, 0.46, 2.25, 0.013, -1200, 950));
            const cliffNoise = Math.abs(perlin.noise2D(wx * 0.012 - 910, wz * 0.012 + 260));
            const deepNoise = (perlin.noise2D(wx * 0.01 - 200, wz * 0.01 + 430) + 1) * 0.5;
            const bigDuneNoise = (perlin.noise2D(wx * 0.016 + 15, wz * 0.016 - 15) + 1) * 0.5;
            const duneDetailNoise = (perlin.noise2D(wx * 0.038 + 120, wz * 0.038 - 70) + 1) * 0.5;
            const rockMaskNoise = (perlin.noise2D(wx * 0.009 - 510, wz * 0.009 + 230) + 1) * 0.5;
            const { weights } = biomeWeights(wx, wz);

            const plainsH = TerrainModules['plains'].getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise });
            const forestH = TerrainModules['oakForest'].getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise });
            const desertH = TerrainModules['desert'].getHeight({ BASE_LAND_Y, continentalMask, bigDuneNoise, duneDetailNoise, rockMaskNoise });
            const snowyH = TerrainModules['snowyPlains'].getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise });
            const mountainH = TerrainModules['mountains'].getHeight({
                BASE_LAND_Y,
                continentalness: tv.continentalness,
                erosion: tv.erosion,
                ridges: tv.ridges,
                peaksValleys: tv.peaksValleys,
                terrainNoise,
                cliffNoise,
                peakNoise,
                jaggedNoise,
            });
            const oceanH = TerrainModules['ocean'].getHeight({ SEA_LEVEL, deepNoise, terrainNoise });

            let h =
                plainsH * weights['Plains'] +
                forestH * weights['Forest'] +
                desertH * weights['Desert'] +
                snowyH * weights['Snowy Plains'] +
                mountainH * weights['Mountains'] +
                oceanH * weights['Ocean'];

            const mountainWeight = weights['Mountains'];
            h += detailNoise * lerp(0.36, 1.0, mountainWeight);

            const riverInfluence = getRiverMask(wx, wz);
            h = TerrainModules['river'].applyHeight({ height: h, riverInfluence, SEA_LEVEL });

            const ravine = getRavineMask(wx, wz);
            if (ravine > 0.84 && weights['Ocean'] < 0.5) h -= (ravine - 0.84) * 55;

            if (mountainWeight > 0.5 && h < SEA_LEVEL + 8) h = SEA_LEVEL + 8;
            if (h < SEA_LEVEL - 6 && weights['Ocean'] < 0.5) h = SEA_LEVEL - 6;
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
            const mineSwing = miningState.active ? Math.sin(time * 0.04) * 14 : 0;
            const totalSwing = moveSwing + mineSwing;
            firstPersonHandEl.style.transform = `translateY(${Math.max(-6, totalSwing)}px) rotate(${totalSwing * 0.3}deg)`;
            firstPersonHeldItemEl.style.transform = `translateY(${Math.max(-6, totalSwing)}px)`;

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

            if (playerAvatar) {
                playerAvatar.rotation.x = player.isSwimming ? -Math.PI / 2 : 0;
                playerAvatar.rotation.z = 0;
            }

            if (player.isSwimming) {
                const stroke = time * 0.02;
                const legKick = Math.sin(time * 0.028) * 0.25;
                playerAvatarParts.leftLegPivot.rotation.x = legKick;
                playerAvatarParts.rightLegPivot.rotation.x = -legKick;
                playerAvatarParts.leftArmPivot.rotation.x = stroke;
                playerAvatarParts.rightArmPivot.rotation.x = stroke + Math.PI;
            } else {
                const swing = player.isMoving ? Math.sin(time * 0.015) * 0.7 : 0;
                playerAvatarParts.leftLegPivot.rotation.x = swing;
                playerAvatarParts.rightLegPivot.rotation.x = -swing;
                playerAvatarParts.leftArmPivot.rotation.x = -swing;
                playerAvatarParts.rightArmPivot.rotation.x = swing;
            }

            if (inventorySkinRigEl) {
                const swing = player.isMoving ? Math.sin(time * 0.015) * 0.7 : 0;
                const sdeg = swing * 40;
                const lLeg = document.getElementById('inv-skin-leg-left');
                const rLeg = document.getElementById('inv-skin-leg-right');
                const lArm = document.getElementById('inv-skin-arm-left');
                const rArm = document.getElementById('inv-skin-arm-right');
                if (lLeg) lLeg.style.transform = `rotate(${sdeg}deg)`;
                if (rLeg) rLeg.style.transform = `rotate(${-sdeg}deg)`;
                if (lArm) lArm.style.transform = `rotate(${-sdeg}deg)`;
                if (rArm) rArm.style.transform = `rotate(${sdeg}deg)`;
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
                    toggleInventory();
                    return;
                }
                if (k === 'escape' && isInventoryOpen) {
                    toggleInventory();
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
            const baseChance = Number(map[biomeName] ?? map.Plains ?? 0.04);
            let adjusted = baseChance;
            if (topY > SEA_LEVEL + 26) adjusted *= 0.7;
            if (topY < SEA_LEVEL + 2) adjusted *= 0.5;
            return Math.max(0, Math.min(0.45, adjusted));
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
                        if (block === 5) return true;
                        if (block !== 0 && block !== 6) break;
                    }
                }
            }
            return false;
        }

        function canPlaceMinecraftLikeTree(data, x, z, topY, trunkHeight) {
            if (x < 2 || x > CHUNK_SIZE - 3 || z < 2 || z > CHUNK_SIZE - 3) return false;
            const maxY = Math.min(CHUNK_HEIGHT - 2, topY + trunkHeight + 3);
            for (let y = topY + 1; y <= maxY; y++) {
                const rel = y - (topY + trunkHeight);
                const radius = rel >= 0 ? 1 : (rel >= -2 ? 2 : 1);
                for (let ox = -radius; ox <= radius; ox++) {
                    for (let oz = -radius; oz <= radius; oz++) {
                        const tx = x + ox;
                        const tz = z + oz;
                        if (tx < 0 || tx >= CHUNK_SIZE || tz < 0 || tz >= CHUNK_SIZE) return false;
                        const idx = tx + y * CHUNK_SIZE + tz * CHUNK_SIZE * CHUNK_HEIGHT;
                        const b = data[idx];
                        if (b !== 0 && b !== 6) return false;
                    }
                }
            }
            return true;
        }

        function placeMinecraftLikeTree(data, x, z, topY, trunkHeight, wx, wz) {
            const trunkTopY = topY + trunkHeight;
            for (let i = 1; i <= trunkHeight; i++) {
                const ty = topY + i;
                const idx = x + ty * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_HEIGHT;
                data[idx] = 5;
            }

            for (let y = trunkTopY - 2; y <= trunkTopY + 1; y++) {
                if (y < 1 || y >= CHUNK_HEIGHT) continue;
                const rel = y - trunkTopY;
                const radius = rel === 1 ? 1 : (rel === 0 ? 2 : (rel === -1 ? 2 : 1));
                for (let ox = -radius; ox <= radius; ox++) {
                    for (let oz = -radius; oz <= radius; oz++) {
                        if (Math.abs(ox) === radius && Math.abs(oz) === radius && hashRand2D(wx + ox * 31, wz + oz * 17 + y * 7, 611) < 0.35) continue;
                        const tx = x + ox;
                        const tz = z + oz;
                        if (tx < 0 || tx >= CHUNK_SIZE || tz < 0 || tz >= CHUNK_SIZE) continue;
                        const idx = tx + y * CHUNK_SIZE + tz * CHUNK_SIZE * CHUNK_HEIGHT;
                        if (data[idx] === 0) data[idx] = 6;
                    }
                }
            }

            const crownY = trunkTopY + 2;
            if (crownY < CHUNK_HEIGHT) {
                const crownIdx = x + crownY * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_HEIGHT;
                if (data[crownIdx] === 0) data[crownIdx] = 6;
            }
        }
        
        function generateChunkData(cx, cz) {
             const data = new Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
             const spawnedGnomes = [];
             
             for (let x = 0; x < CHUNK_SIZE; x++) {
                 for (let z = 0; z < CHUNK_SIZE; z++) {
                     const wx = cx * CHUNK_SIZE + x;
                     const wz = cz * CHUNK_SIZE + z;
                     
                     // Phase 1: biome map template + macro height outline
                     const worldSample = worldGenerator ? worldGenerator.sample(wx, wz) : null;
                     const biome = worldSample ? (worldSample.gameplayBiome || worldSample.biome) : getBiome(wx, wz);
                     const h = getNoiseGroundHeight(wx, wz, biome);

                     const riverInfluence = worldSample ? worldSample.riverMask : getRiverMask(wx, wz);
                     const isFrozenRiver = !!worldSample && (worldSample.biome === 'Frozen River' || worldSample.tempBand === (window.WorldgenLayers?.Constants?.FREEZING ?? 13));
                     const RIVER_WIDTH_THRESHOLD = 0.1;
                     const isRiver = !worldSample?.noRiver && riverInfluence > RIVER_WIDTH_THRESHOLD;
                     
                     let surfaceBlockType = 0; // Used for tree placement logic

                     for (let y = 0; y < CHUNK_HEIGHT; y++) {
                         let t = 0; // Block type

                         if (y === 0) {
                             t = 14; // Bedrock floor
                             data[x + y*CHUNK_SIZE + z*CHUNK_SIZE*CHUNK_HEIGHT] = t;
                             continue;
                         }

                         if (y < h) {
                            
                             const distFromSurface = h - 1 - y;

                             if (biome === 'Desert') {
                                 if (distFromSurface === 0) {
                                     t = 7;
                                     surfaceBlockType = 7;
                                 } else if (distFromSurface < 5) {
                                     t = 7;
                                 } else {
                                     t = 13;
                                 }
                             } else if (biome === 'Snowy Plains') {
                                 if (distFromSurface === 0) {
                                     t = 15;
                                     surfaceBlockType = 15;
                                 } else {
                                     t = 59;
                                 }
                             } else if (biome === 'Mountains') {
                                 const isSnowCap = h > SEA_LEVEL + 26;
                                 const cheese = perlin.noise3D(wx * 0.045, y * 0.062, wz * 0.045);
                                 const overhang = perlin.noise3D(wx * 0.02 + 700, y * 0.03, wz * 0.02 - 300);
                                 const density = (h - y) + cheese * 5.5 + overhang * 3.2 - ((CHUNK_HEIGHT - y) / CHUNK_HEIGHT) * 3.5;

                                 if (density <= 0.4 && distFromSurface <= 22) {
                                     t = 0; // allow cliffs/overhangs
                                 } else if (distFromSurface === 0) {
                                     t = isSnowCap ? 15 : 3;
                                     surfaceBlockType = t;
                                 } else {
                                     t = 3;
                                 }
                             } else { // Plains/Forest/Ocean Biome logic
                                 
                                 const isBeachZone = h >= SEA_LEVEL - 1 && h <= SEA_LEVEL + 2;

                                 if (distFromSurface === 0) {
                                     if (isBeachZone) {
                                         t = 7; // Sand for beaches
                                         surfaceBlockType = 7;
                                     } else {
                                         t = 1; // Grass for Plains and Forest
                                         surfaceBlockType = 1;
                                     }
                                 } else if (distFromSurface < 4) {
                                     if (isBeachZone) {
                                         t = 7; // Sand below beach
                                     } else {
                                         t = 2; // Dirt below grass
                                     }
                                 } else {
                                     t = 3; // Stone deep down
                                 }
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
                        if (y > CAVE_MIN_Y && y < h - CAVE_MAX_Y_OFFSET) {
                            if (t === 3 || t === 2 || t === 7 || t === 13) {
                                const n1 = perlin.noise3D(wx * CAVE_SCALE, y * CAVE_SCALE * 1.7, wz * CAVE_SCALE);
                                const n2 = perlin.noise3D(wx * CAVE_SCALE * 2.2 + 100, y * CAVE_SCALE * 1.1, wz * CAVE_SCALE * 2.2 + 100);
                                const caveShape = n1 * 0.7 + n2 * 0.3;

                                const depth = Math.max(0, (h - y) / Math.max(1, h));
                                const dynamicThreshold = CAVE_THRESHOLD - Math.min(0.14, depth * 0.2);
                                const tunnelNoise = Math.abs(perlin.noise3D(wx * CAVE_SCALE * 0.7, y * CAVE_SCALE * 0.45, wz * CAVE_SCALE * 0.7));

                                if (caveShape > dynamicThreshold || (depth > 0.35 && tunnelNoise < 0.06)) {
                                    t = 0;
                                }
                            }
                        }
                         
                         
// 🔹 Optimized Ravine Generation
const ravineMask = getRavineMask(wx, wz);

if (ravineMask > 0.78) {
    const strength = (ravineMask - 0.78) / 0.22;

    // Limit top slightly above terrain
    const ravineTop = Math.min(h + 6, CHUNK_HEIGHT - 1);

    // Reduce max depth for smaller chunks
    const maxDepth = 18 + Math.floor(strength * 12); // 18–30 blocks deep
    const ravineBottom = Math.max(3, ravineTop - maxDepth);

    if (y <= ravineTop && y >= ravineBottom) {
        const mid = (ravineTop + ravineBottom) / 2;
        const halfHeight = (ravineTop - ravineBottom) / 2;
        const verticalFactor = 1 - Math.abs(y - mid) / halfHeight;

        // Reduce noise impact
        const widthNoise = octaveNoise2D(wx, wz, 2, 0.5, 2.0, 0.04, 812, -245);
        const widthFactor = strength * verticalFactor + widthNoise * 0.1;

        if (widthFactor > 0.25) {
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
                     if (!isRiver && (biome === 'Forest' || biome === 'Plains')) {
                         let topY = -1;
                         for (let yy = CHUNK_HEIGHT - 2; yy >= 1; yy--) {
                             const tidx = x + yy * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_HEIGHT;
                             const ttype = data[tidx];
                             if (ttype !== 0 && ttype !== 4 && ttype !== 6) {
                                 topY = yy;
                                 break;
                             }
                         }

                         if (topY >= SEA_LEVEL && topY <= SEA_LEVEL + 20) {
                             const topIdx = x + topY * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_HEIGHT;
                             const topType = data[topIdx];
                             const validGround = (topType === 1 || topType === 2);
                             if (validGround) {
                                 const treeNoise = octaveNoise2D(wx, wz, 2, 0.56, 2.0, 0.028, 700, -350) * 0.5 + 0.5;
                                 const scatter = hashRand2D(wx, wz, 99);
                                 const density = treeNoise * 0.6 + scatter * 0.4;
                                 const chance = getTreeSpawnChanceForBiome(biome, topY);
                                 const clusterBonus = Number(worldGenSettings.treeClusterBonus ?? 0.12);
                                 const nearbyTree = hasNearbyTreeTrunk(data, x, z, 3);
                                 const spacingGate = Number(worldGenSettings.treeMinSpacingChance ?? 0.65);
                                 const spawnRoll = hashRand2D(wx, wz, 431);
                                 const shouldTrySpawn = (spawnRoll < (chance + density * clusterBonus)) && (!nearbyTree || spawnRoll < spacingGate * 0.75);

                                 if (shouldTrySpawn) {
                                     const trunkHeight = 4 + Math.floor(hashRand2D(wx, wz, 157) * 2); // 4-5
                                     if (canPlaceMinecraftLikeTree(data, x, z, topY, trunkHeight)) {
                                         if (data[topIdx] === 2) data[topIdx] = 1;
                                         placeMinecraftLikeTree(data, x, z, topY, trunkHeight, wx, wz);
                                     }
                                 }
                             }
                         }
                     }
                 }
             }
             const spawnedPigs = [];
             placeIglooInChunk(data, cx, cz, spawnedGnomes);
             placeDesertWellInChunk(data, cx, cz, spawnedPigs);
             return { data, spawnedGnomes, spawnedPigs };
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

        function createChunk(cx, cz) {
            const generated = generateChunkData(cx, cz);
            const data = generated.data;
            const group = new THREE.Group();
            group.userData = { chunkData: data, cx, cz, meshHash: null, frustumRadius: Math.sqrt((CHUNK_SIZE*CHUNK_SIZE)*0.5 + (CHUNK_HEIGHT*CHUNK_HEIGHT)*0.25) };
            updateChunkGeometry(group, data);
            chunks.set(`${cx},${cz}`, group);
            worldGroup.add(group);
            if (generated.spawnedGnomes && generated.spawnedGnomes.length) {
                for (const g of generated.spawnedGnomes) spawnGnomeAt(g.wx, g.wy, g.wz);
            }
            if (generated.spawnedPigs && generated.spawnedPigs.length) {
                for (const pig of generated.spawnedPigs) spawnPigAtExact(pig.wx, pig.wy, pig.wz);
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

        function updateChunkFrustumCulling() {
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

        function updateChunkAndNeighbors(centerGroup, lx, lz) {
            updateChunkGeometry(centerGroup, centerGroup.userData.chunkData);
            
           
            if (lx === 0 || lx === CHUNK_SIZE - 1 || lz === 0 || lz === CHUNK_SIZE - 1) {
                const cx = centerGroup.userData.cx;
                const cz = centerGroup.userData.cz;

                const neighborOffsets = [
                    [-1, 0], [1, 0], [0, -1], [0, 1]
                ];

                for (const [dx, dz] of neighborOffsets) {
                    const neighborId = `${cx + dx},${cz + dz}`;
                    const neighborGroup = chunks.get(neighborId);
                    if (neighborGroup) {
                        updateChunkGeometry(neighborGroup, neighborGroup.userData.chunkData);
                    }
                }
            }
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

        function updateChunkGeometry(group, data) {

            const nextHash = computeChunkHash(data);
            if (group.userData.meshHash === nextHash && group.children.length > 0) return;
            group.userData.meshHash = nextHash;

            while(group.children.length) group.remove(group.children[0]);
            
            // Map to hold position/normal/uv data arrays for each material key
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

            const get = (x,y,z) => {
                if(x<0||x>=16||z<0||z>=16||y<0||y>=96) {
                    const wx = x + cx*16;
                    const wz = z + cz*16;
                    return getBlockType(wx, y, wz); 
                }
                return data[x + y*16 + z*16*96];
            };

            for(let x=0; x<16; x++){
                for(let y=0; y<96; y++){
                    for(let z=0; z<16; z++){
                        const id = data[x + y*16 + z*16*96];
                        if(id===0) continue;
                        
                        const mat = blockMaterials[id];
                        const isTorch = id === 22;
                        if (isTorch) torchPositions.push({ x: x + cx*16, y, z: z + cz*16 });
                        const isTrans = mat.transparent || (mat.textured && mat.textureKey === 'LEAVES');
                        const activeFaces = isTorch ? torchFaces : faces;

                        for(let i=0; i<6; i++){
                            const f = activeFaces[i];
                            const nid = get(x+f.dir[0], y+f.dir[1], z+f.dir[2]);
                            const neighborMat = blockMaterials[nid];
                            
                            let draw = false;
                            if (isTorch) draw = true;
                            else if (nid === 0) draw = true;
                            else if (!isTrans && neighborMat?.transparent) draw = true;
                            else if (isTrans && nid !== id) draw = true;

                            if(draw) {
                                const materialKey = getMaterialKey(id, f.dir);
                                
                                if (!geometryData[materialKey]) {
                                    geometryData[materialKey] = { pos: [], norm: [], col: [], uv: [] };
                                }
                                const gd = geometryData[materialKey];
                                
                                const wx = x + cx*16;
                                const wz = z + cz*16;
                                const faceName = f.name || getFaceName(f.dir);
                                const uvValues = getFaceUVs(id, faceName, f.uv);
                                
                                const triOrder = [0, 1, 2, 0, 2, 3];
                                for (const ti of triOrder) {
                                    const c = f.corners[ti];
                                    gd.pos.push(wx + c[0], y + c[1], wz + c[2]);
                                    gd.norm.push(f.dir[0], f.dir[1], f.dir[2]);
                                    if (materials[materialKey] && materials[materialKey].map) {
                                        gd.uv.push(uvValues[ti * 2], uvValues[ti * 2 + 1]);
                                    } else {
                                        const color = blockMaterials[id].color || 0xd1c17e;
                                        const cc = new THREE.Color(color);
                                        gd.col.push(cc.r, cc.g, cc.b);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // Generate meshes for all accumulated materials
            for (const key in geometryData) {
                const gd = geometryData[key];
                if (gd.pos.length === 0) continue;
                
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.Float32BufferAttribute(gd.pos, 3));
                geom.getAttribute('position').setUsage(THREE.StaticDrawUsage);
                geom.setAttribute('normal', new THREE.Float32BufferAttribute(gd.norm, 3));

                let currentMaterial = materials[key];

                // Set UVs if material is textured (i.e., it has a map)
                if (currentMaterial && currentMaterial.map && gd.uv.length > 0) {
                    geom.setAttribute('uv', new THREE.Float32BufferAttribute(gd.uv, 2));
                }

                // Set vertex colors if data was accumulated (means texture failed or block is color-only)
                if (gd.col.length > 0) {
                    geom.setAttribute('color', new THREE.Float32BufferAttribute(gd.col, 3));

                    // If we have vertex colors AND it's not the transparent WATER material, use COLORED_OPAQUE.
                    if (key !== 'WATER') {
                       currentMaterial = materials.COLORED_OPAQUE;
                    }
                }

                const mesh = new THREE.Mesh(geom, currentMaterial);
                mesh.frustumCulled = true;
                group.add(mesh);
            }

            syncTorchLightsForChunk(group, torchPositions);
        }

        const SPAWN_MIN_LIGHT_LEVEL = 13;

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

        function setInitialPlayerPosition() {
            const searchRadius = 24;
            for (let r = 0; r <= searchRadius; r++) {
                for (let dx = -r; dx <= r; dx++) {
                    const edgeZ = r;
                    for (const dz of [-edgeZ, edgeZ]) {
                        const x = dx + 0.5;
                        const z = dz + 0.5;
                        const safe = isSafeSpawnSpot(x, z);
                        if (safe) {
                            yawObject.position.set(x, safe.y, z);
                            showGameMessage(`Spawned at light level ${safe.lightLevel}`);
                            return;
                        }
                    }
                }
                for (let dz = -r + 1; dz <= r - 1; dz++) {
                    const edgeX = r;
                    for (const dx of [-edgeX, edgeX]) {
                        const x = dx + 0.5;
                        const z = dz + 0.5;
                        const safe = isSafeSpawnSpot(x, z);
                        if (safe) {
                            yawObject.position.set(x, safe.y, z);
                            showGameMessage(`Spawned at light level ${safe.lightLevel}`);
                            return;
                        }
                    }
                }
            }

            yawObject.position.set(0.5, SEA_LEVEL + 8, 0.5);
        }


        function getChunkRetentionRadius() {
            return WORLD_RADIUS + 2;
        }

        function ensureChunksAroundPlayer() {
            if (!yawObject) return;
            const playerChunkX = Math.floor(yawObject.position.x / CHUNK_SIZE);
            const playerChunkZ = Math.floor(yawObject.position.z / CHUNK_SIZE);
            const loadRadius = WORLD_RADIUS;
            const keepRadius = getChunkRetentionRadius();

            for (let cx = playerChunkX - loadRadius; cx <= playerChunkX + loadRadius; cx++) {
                for (let cz = playerChunkZ - loadRadius; cz <= playerChunkZ + loadRadius; cz++) {
                    const chunkKey = `${cx},${cz}`;
                    if (!chunks.has(chunkKey)) createChunk(cx, cz);
                }
            }

            const chunkKeysToRemove = [];
            for (const [chunkKey, chunkGroup] of chunks.entries()) {
                const dx = chunkGroup.userData.cx - playerChunkX;
                const dz = chunkGroup.userData.cz - playerChunkZ;
                if (Math.abs(dx) > keepRadius || Math.abs(dz) > keepRadius) {
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
                chunks.delete(chunkKey);
            }
        }

        function generateWorld() {
            ensureChunksAroundPlayer();
        }

        function updateMining(deltaMs) {
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
                ensureChunksAroundPlayer();
                updateChunkFrustumCulling();
                updateGnomes(time);
                updatePigs(time, delta);
                trySpawnNightZombie(delta);
                updateZombies(time, delta);
                updateEatingAnimation(delta, time);
                updatePlayerAvatarVisuals(time);
                updateFirstPersonHand(time);
                const dtSec = delta / 1000;
                if (window.FurnaceSystem) {
                    for (const state of furnaceStates.values()) window.FurnaceSystem.updateState(state, dtSec);
                    if (isInventoryOpen && isFurnaceOpen) renderInventoryScreen();
                }
            } else {
                updateFirstPersonHand(time);
                updatePigs(time, delta);
                updateZombies(time, delta);
                updateEatingAnimation(delta, time);
                maybeSpawnLavaParticles(delta);
                updateWorldParticles(delta);
                miningState.active = false;
                updateBreakingOverlay();
            }
            renderer.render(scene, camera);
        }
        
        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        window.onload = init;
