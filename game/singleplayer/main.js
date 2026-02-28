        // --- 1. CONFIGURATION ---
        const {
            CHUNK_SIZE,
            CHUNK_HEIGHT,
            WORLD_RADIUS,
            SEA_LEVEL,
            BASE_LAND_Y,
            ISLAND_RADIUS,
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

        window.__SINGLEPLAYER_BUILD__ = 'sp-2026-02-21-11';
        console.info('[Singleplayer build]', window.__SINGLEPLAYER_BUILD__);

        const TerrainModules = {};

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
        let ambientLight, dirLight; // Made global for modification in animate loop

        // Three.js specific materials created after textures are loaded
        let materials = {};

// --- 2. CREATE PERLIN INSTANCE ---
const seed = Math.random() * 65536; // or pick a fixed seed for consistent worlds
const perlinInstance = new PerlinNoise(seed);

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
            inAir: false
        };

      
        let inventory = new Array(TOTAL_INV_SIZE).fill(null);
        let selectedHotbarIndex = 0; // 0-8
        let isInventoryOpen = false;
        
        // --- NEW CRAFTING STATE VARIABLES ---
        let isCraftingTableOpen = false;
        let isFurnaceOpen = false;
        let activeFurnaceKey = null;
        const furnaceStates = new Map();
        let craftingInput = new Array(4).fill(null); // 2x2 Grid
        let craftingTableInput = new Array(9).fill(null); // 3x3 Grid
        let craftingOutput = null; 
        let heldItem = null; 
        let heldItemSourceIndex = -1; 
        let heldItemSourceType = null; 

        // Mining / breaking state
        const BREAKING_TEXTURE_BASE = `${window.SingleplayerConfig?.REPO_BASE_PREFIX || '/MultiPixel'}/game/singleplayer/assets/breaking`;
        let miningState = { active: false, key: null, blockPos: null, targetType: 0, elapsedMs: 0, neededMs: 0, missMs: 0, dropOnBreak: true };
        let isLeftMouseDown = false;
        const breakingStageTextures = new Array(10).fill(null);
        let breakingCrackMesh = null;
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
        let worldSeed = 0;
        let lightingSystem = null;
        const frustum = new THREE.Frustum();
        const cameraViewProj = new THREE.Matrix4();
        const chunks = new Map();
        const worldGroup = new THREE.Group();
        let yawObject, pitchObject; 
        let isThirdPersonView = false;
        let playerAvatar = null;
        let skinSystem = null;
        let iglooStructureDef = null;
        const gnomeEntities = [];
        
        // Calculate the world boundary coordinates
        const WORLD_MAX_COORD = (WORLD_RADIUS + 0.5) * CHUNK_SIZE;
        const WORLD_MIN_COORD = -(WORLD_RADIUS + 0.5) * CHUNK_SIZE;
        
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
                worldSeed = Math.floor(Math.random() * 2147483647);
                perlin = new PerlinNoise(worldSeed);
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

            playerAvatar = createPlayerAvatar();
            playerAvatar.visible = false;
            yawObject.add(playerAvatar);

            // Lighting (Made global: ambientLight, dirLight)
            ambientLight = new THREE.AmbientLight(0x606060, 1.2); 
            scene.add(ambientLight);
            dirLight = new THREE.DirectionalLight(0xffffff, 1.5); 
            dirLight.position.set(50, 100, 50);
            scene.add(dirLight);
            scene.add(worldGroup);

    
            generateWorld();
            setupPointerLockControls();
            setupKeyboardControls();
            setupBlockInteraction();
            setupInputModeChooser();
            initChatSystem();
            setInitialPlayerPosition();
            
          
            renderHearts();
            updateHotbarUI();
            skinSystem = window.SingleplayerSkinSystem?.create({ showGameMessage }) || null;
            const closeBtn = document.getElementById('inventory-close-btn');
            const closeIcon = document.getElementById('inventory-close-icon');
            const editSkinBtn = document.getElementById('edit-skin-btn');
            const editSkinIcon = document.getElementById('edit-skin-icon');
            const furnaceCloseBtn = document.getElementById('furnace-close-btn');
            const furnaceCloseIcon = document.getElementById('furnace-close-icon');
            const assetBasePath = `${window.SingleplayerConfig?.REPO_BASE_PREFIX || ''}/game/singleplayer/assets`;
            const closeIconPath = `${assetBasePath}/mobile/cdb_clear.png`;
            const editSkinIconPath = `${assetBasePath}/ui/inventory/edit_skin_button.png`;
            if (closeIcon) closeIcon.src = closeIconPath;
            if (editSkinIcon) editSkinIcon.src = editSkinIconPath;
            if (furnaceCloseIcon) furnaceCloseIcon.src = closeIconPath;
            if (closeBtn) closeBtn.addEventListener('click', () => {
                if (isInventoryOpen) toggleInventory();
            });
            if (editSkinBtn) editSkinBtn.addEventListener('click', () => {
                toggleInventorySkinPreview();
            });
            if (furnaceCloseBtn) furnaceCloseBtn.addEventListener('click', () => {
                if (isInventoryOpen) toggleInventory();
            });
            if (window.HungerSystem) {
                window.HungerSystem.init({ messageCallback: showGameMessage });
            }
            
           // Renderer setup
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
            document.body.appendChild(renderer.domElement);
            
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
            dirLight.intensity = Math.max(0.08, sunFactor + 0.2) * 1.2;
            dirLight.position.x = Math.sin(angle) * 100;
            dirLight.position.y = Math.cos(angle) * 100;
            dirLight.position.z = Math.sin(angle) * 50;

            ambientLight.intensity = Math.max(0.2, (sunFactor + 1) / 2) * 0.9;
            document.getElementById('time-of-day').textContent = phaseInfo.phase;
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

        function initChatSystem() {
            if (!window.SingleplayerChat || !window.SingleplayerChat.init) return;

            window.SingleplayerChat.init({
                showGameMessage,
                addToInventory,
                getBlockById: (id) => blockMaterials[id] || null,
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
            container.innerHTML = '';
            const hearts = Math.ceil(player.health / 2);
            // --- USING DIRECT PATH FOR UI HEART ---
            const heartPath = ASSET_FILEPATHS.HEART; 
            
            for(let i=0; i<hearts; i++) {
                const heartImg = document.createElement('img');
                heartImg.src = heartPath;
                heartImg.className = 'heart-icon';
                heartImg.alt = 'Full Heart';
                container.appendChild(heartImg);
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
            const mainGrid = document.getElementById(usingFurnaceScreen ? 'furnace-main-inventory-grid' : 'main-inventory-grid');
            const hotbarGrid = document.getElementById(usingFurnaceScreen ? 'furnace-hotbar-grid' : 'inventory-hotbar-grid');

            const craftInputGrid2x2 = document.getElementById('crafting-input-grid');
            const craftOutputSlot2x2 = document.getElementById('crafting-output-slot-container');
            const craftInputGrid3x3 = document.getElementById('crafting-table-grid');
            const craftOutputSlot3x3 = document.getElementById('crafting-table-output-slot');
            const furnaceInputSlot = document.getElementById('furnace-input-slot');
            const furnaceFuelSlot = document.getElementById('furnace-fuel-slot');
            const furnaceOutputSlot = document.getElementById('furnace-output-slot');

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
            const hud = document.getElementById('hud');
            const container2x2 = document.getElementById('crafting-2x2-container');
            const container3x3 = document.getElementById('crafting-3x3-container');
            const inventoryPanel = document.getElementById('inventory-panel');

            if (isInventoryOpen) {
                isInventoryOpen = false;
                isCraftingTableOpen = false;
                isFurnaceOpen = false;
                activeFurnaceKey = null;
                if (invScreen) invScreen.classList.add('hidden');
                if (furnaceScreen) furnaceScreen.classList.add('hidden');
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
            hud.classList.add('opacity-0');
            if (!mobileControls.enabled) document.exitPointerLock();
            player.keys = {};
        }

        function openFurnaceScreen(furnaceKey) {
            const invScreen = document.getElementById('inventory-screen');
            const furnaceScreen = document.getElementById('furnace-screen');
            const hud = document.getElementById('hud');

            isInventoryOpen = true;
            isCraftingTableOpen = false;
            isFurnaceOpen = true;
            const inventoryPanel = document.getElementById('inventory-panel');
            if (inventoryPanel) inventoryPanel.classList.add('inventory-mode');
            activeFurnaceKey = furnaceKey;

            heldItem = null;
            heldItemSourceIndex = -1;
            heldItemSourceType = null;

            renderInventoryScreen();
            if (invScreen) invScreen.classList.add('hidden');
            if (furnaceScreen) furnaceScreen.classList.remove('hidden');
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

            const effectivePickaxe = breakable.dropsItems ? equippedPickaxe : null;

            if (PickaxeSystem.getMiningTimeMs) {
                return {
                    durationMs: PickaxeSystem.getMiningTimeMs(blockId, legacyHardness, effectivePickaxe),
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
            } else {
               
                if (oldType !== 0 && oldType !== 4) return false; 
                chunkData[index] = newType;
            }

           
            updateChunkAndNeighbors(group, lx, lz);
            return true;
        }

    
        function getRiverMask(wx, wz) {
            return TerrainModules['river'].getMask({ perlin, wx, wz });
        }


        function updatePlayerMovement() {
            if (!player.canMove || isInventoryOpen) return;

            // --- World Border Check ---
            const prevX = yawObject.position.x;
            const prevZ = yawObject.position.z;

            // Apply world movement
            player.direction.set(0, 0, 0);
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawObject.quaternion);
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawObject.quaternion);
            forward.y = 0; forward.normalize();
            right.y = 0; right.normalize();

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
            const isSprinting = isMoving && (player.keys['e'] || mobileControls.sprint);
            if (window.HungerSystem) {
                window.HungerSystem.update(performance.now(), { isMoving, isSprinting });
            }
            const hungerMultiplier = window.HungerSystem ? window.HungerSystem.getSpeedMultiplier() : 1;
            const sprintMultiplier = isSprinting ? player.sprintMultiplier : 1;
            player.moveSpeed = player.baseMoveSpeed * sprintMultiplier * hungerMultiplier;

            player.velocity.x = player.direction.x * player.moveSpeed;
            player.velocity.z = player.direction.z * player.moveSpeed;
            player.velocity.y += GRAVITY;

          
            if ((player.keys[' '] || mobileControls.jump) && !player.isJumping) {
                player.velocity.y = JUMP_POWER;
                player.isJumping = true;
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
                        if (fallDist > 4) { // 4 blocks safe fall
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
            const { climate, weights } = biomeWeights(wx, wz);
            const contenders = ['Mountains', 'Desert', 'Forest', 'Snowy Plains', 'Ocean'];

            let bestSpecial = 'Plains';
            let bestSpecialW = 0;
            for (const biomeName of contenders) {
                const w = weights[biomeName] || 0;
                if (w > bestSpecialW) {
                    bestSpecialW = w;
                    bestSpecial = biomeName;
                }
            }

            const plainsW = weights['Plains'] || 0;

            // Prefer special biomes when they are clearly present.
            if (bestSpecialW > plainsW * 0.80 || bestSpecialW > 0.27) {
                return bestSpecial;
            }

            // Climate nudges to avoid a plains-only world.
            if (climate.temp < -0.38 && climate.humidity > -0.15) return 'Snowy Plains';
            if (climate.humidity > 0.20 && climate.temp > -0.30 && climate.temp < 0.42) return 'Forest';
            if (climate.temp > 0.18 && climate.humidity < -0.08) return 'Desert';

            return 'Plains';
        }

        function getRavineMask(wx, wz) {
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
            // Check world boundary before accessing chunk data
            if (wx < WORLD_MIN_COORD || wx >= WORLD_MAX_COORD || wz < WORLD_MIN_COORD || wz >= WORLD_MAX_COORD) {
                return 0; // Void outside the generated area
            }

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

        function createPlayerAvatar() {
            const avatar = new THREE.Group();
            const body = new THREE.Mesh(
                new THREE.BoxGeometry(0.75, 1.0, 0.35),
                new THREE.MeshStandardMaterial({ color: 0x4f95ff, roughness: 0.9 })
            );
            body.position.y = 0.95;
            const head = new THREE.Mesh(
                new THREE.BoxGeometry(0.52, 0.52, 0.52),
                new THREE.MeshStandardMaterial({ color: 0xe5bf9f, roughness: 0.85 })
            );
            head.position.y = 1.72;
            avatar.add(body);
            avatar.add(head);
            return avatar;
        }

        function toggleCameraViewMode() {
            isThirdPersonView = !isThirdPersonView;
            camera.position.set(0, isThirdPersonView ? 0.1 : 0, isThirdPersonView ? 3.6 : 0);
            if (playerAvatar) playerAvatar.visible = isThirdPersonView;
            showGameMessage(isThirdPersonView ? 'Third-person view enabled' : 'First-person view enabled');
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

      
        
        function generateChunkData(cx, cz) {
             const data = new Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
             const spawnedGnomes = [];
             
             for (let x = 0; x < CHUNK_SIZE; x++) {
                 for (let z = 0; z < CHUNK_SIZE; z++) {
                     const wx = cx * CHUNK_SIZE + x;
                     const wz = cz * CHUNK_SIZE + z;
                     
                     // Biomes > Terrain: Calculate biome once, then use it for all column data
                     const biome = getBiome(wx, wz); 
                     
                     // Height based on biome
                     const h = getNoiseGroundHeight(wx, wz, biome);

                     // Check if block is near the world boundary before applying changes
                     const isNearBoundary = wx < WORLD_MIN_COORD + 4 || wx >= WORLD_MAX_COORD - 4 || 
                                            wz < WORLD_MIN_COORD + 4 || wz >= WORLD_MAX_COORD - 4;
                     
                     const riverInfluence = getRiverMask(wx, wz);
                     const RIVER_WIDTH_THRESHOLD = 0.1;
                     const isRiver = riverInfluence > RIVER_WIDTH_THRESHOLD;
                     
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
                                 t = 4; // River water
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



                         if (isNearBoundary && y < SEA_LEVEL && (t === 4 || t === 0)) {
                             t = 3; 
                         } 

                         data[x + y*CHUNK_SIZE + z*CHUNK_SIZE*CHUNK_HEIGHT] = t;
                     }
                  
                     // --- Tree Generation (deterministic + chunk-safe placement) ---
                     if (!isRiver) {
                         let topY = -1;
                         for (let yy = CHUNK_HEIGHT - 2; yy >= 1; yy--) {
                             const tidx = x + yy * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_HEIGHT;
                             const ttype = data[tidx];
                             if (ttype !== 0 && ttype !== 4) {
                                 topY = yy;
                                 break;
                             }
                         }

                         if (topY >= SEA_LEVEL) {
                             const topIdx = x + topY * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_HEIGHT;
                             const topType = data[topIdx];
                             const validGround = (topType === 1 || topType === 2);
                             if (validGround && x > 0 && x < CHUNK_SIZE - 1 && z > 0 && z < CHUNK_SIZE - 1) {
                                 const treeNoise = octaveNoise2D(wx, wz, 2, 0.56, 2.0, 0.028, 700, -350) * 0.5 + 0.5;
                                 const scatter = hashRand2D(wx, wz, 99);
                                 const density = treeNoise * 0.6 + scatter * 0.4;
                                 const chance = 0.4;
                                 const denseBonus = 0.4;
                                     const shouldTrySpawn = true;

                                 if (shouldTrySpawn) {
                                     const heightLimit = 4 + Math.floor(hashRand2D(wx, wz, 157) * 3); // 4-6
                                     let obstructed = false;
                                     for (let ty = topY + 1; ty <= Math.min(CHUNK_HEIGHT - 2, topY + heightLimit + 2) && !obstructed; ty++) {
                                         const canopyRadius = ty >= topY + heightLimit - 2 ? 2 : 0;
                                         for (let ox = -canopyRadius; ox <= canopyRadius && !obstructed; ox++) {
                                             for (let oz = -canopyRadius; oz <= canopyRadius && !obstructed; oz++) {
                                                 const tx = x + ox;
                                                 const tz = z + oz;
                                                 if (tx < 0 || tx >= CHUNK_SIZE || tz < 0 || tz >= CHUNK_SIZE) continue;
                                                 const idx = tx + ty * CHUNK_SIZE + tz * CHUNK_SIZE * CHUNK_HEIGHT;
                                                 const b = data[idx];
                                                 if (b !== 0 && b !== 6) obstructed = true;
                                             }
                                         }
                                     }

                                     if (!obstructed) {
                                         if (data[topIdx] === 2) data[topIdx] = 1;
                                         for (let i = 1; i <= heightLimit; i++) {
                                             const ty = topY + i;
                                             if (ty >= CHUNK_HEIGHT) break;
                                             const idx = x + ty * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_HEIGHT;
                                             if (data[idx] === 0 || data[idx] === 6) data[idx] = 5;
                                         }

                                         for (let ly = -3; ly <= 1; ly++) {
                                             const yAbs = topY + heightLimit + ly;
                                             if (yAbs < 1 || yAbs >= CHUNK_HEIGHT) continue;
                                             const radius = ly >= 0 ? 1 : (ly === -1 ? 2 : (ly === -2 ? 2 : 1));
                                             for (let lx = -radius; lx <= radius; lx++) {
                                                 for (let lz = -radius; lz <= radius; lz++) {
                                                     if (lx * lx + lz * lz > radius * radius) continue;
                                                     const tx = x + lx;
                                                     const tz = z + lz;
                                                     if (tx < 0 || tx >= CHUNK_SIZE || tz < 0 || tz >= CHUNK_SIZE) continue;
                                                     const lidx = tx + yAbs * CHUNK_SIZE + tz * CHUNK_SIZE * CHUNK_HEIGHT;
                                                     if (data[lidx] === 0) data[lidx] = 6;
                                                 }
                                             }
                                         }
                                     }
                                 }
                             }
                         }
                     }
                 }
             }
             placeIglooInChunk(data, cx, cz, spawnedGnomes);
             return { data, spawnedGnomes };
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
                const center = new THREE.Vector3(
                    group.userData.cx * CHUNK_SIZE + CHUNK_SIZE * 0.5,
                    CHUNK_HEIGHT * 0.5,
                    group.userData.cz * CHUNK_SIZE + CHUNK_SIZE * 0.5
                );
                group.visible = frustum.intersectsSphere(new THREE.Sphere(center, group.userData.frustumRadius || 40));
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

        function updateChunkGeometry(group, data) {
            const nextHash = computeChunkHash(data);
            if (group.userData.meshHash === nextHash && group.children.length > 0) return;
            group.userData.meshHash = nextHash;

            while(group.children.length) group.remove(group.children[0]);
            
            // Map to hold position/normal/uv data arrays for each material key
            const geometryData = {}; 
            
            const cx = group.userData.cx;
            const cz = group.userData.cz;

            const faces = [
                { dir: [1,0,0], corners: [[1,1,1],[1,0,1],[1,0,0],[1,1,0]], uv: [0,1, 0,0, 1,0, 1,1] }, // Right
                { dir: [-1,0,0], corners: [[0,1,0],[0,0,0],[0,0,1],[0,1,1]], uv: [0,1, 0,0, 1,0, 1,1] }, // Left
                { dir: [0,1,0], corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], uv: [0,1, 0,0, 1,0, 1,1] }, // Top
                { dir: [0,-1,0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], uv: [0,1, 0,0, 1,0, 1,1] } ,// Bottom
                { dir: [0,0,1], corners: [[0,1,1],[0,0,1],[1,0,1],[1,1,1]], uv: [0,1, 0,0, 1,0, 1,1] }, // Back
                { dir: [0,0,-1], corners: [[1,1,0],[1,0,0],[0,0,0],[0,1,0]], uv: [0,1, 0,0, 1,0, 1,1] } // Front
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
                        const isTrans = mat.transparent || (mat.textured && mat.textureKey === 'LEAVES'); 
                        
                        for(let i=0; i<6; i++){
                            const f = faces[i];
                            const nid = get(x+f.dir[0], y+f.dir[1], z+f.dir[2]);
                            const neighborMat = blockMaterials[nid];
                            
                            let draw = false;
                            if (nid === 0) draw = true;
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
                                
                                const triOrder = [0, 1, 2, 0, 2, 3];
                                for (const ti of triOrder) {
                                    const c = f.corners[ti];
                                    gd.pos.push(wx + c[0], y + c[1], wz + c[2]);
                                    gd.norm.push(f.dir[0], f.dir[1], f.dir[2]);
                                    if (materials[materialKey] && materials[materialKey].map) {
                                        gd.uv.push(f.uv[ti * 2], f.uv[ti * 2 + 1]);
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


        function generateWorld() {
            let count = 0;
            for(let x=-WORLD_RADIUS; x<=WORLD_RADIUS; x++){
                for(let z=-WORLD_RADIUS; z<=WORLD_RADIUS; z++){
                    createChunk(x,z);
                    count++;
                }
            }
            document.getElementById('chunks-count').textContent = count;
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

            if(!isInventoryOpen) {
                updatePlayerMovement();
                updateMining(delta);
                applyBlockPhysics(time);
                updateChunkFrustumCulling();
                updateGnomes(time);
                const dtSec = delta / 1000;
                if (window.FurnaceSystem) {
                    for (const state of furnaceStates.values()) window.FurnaceSystem.updateState(state, dtSec);
                    if (isInventoryOpen && isFurnaceOpen) renderInventoryScreen();
                }
            } else {
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
