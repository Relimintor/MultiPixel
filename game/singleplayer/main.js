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
        const SpawnLighting = window.SpawnLighting || {};

        window.__SINGLEPLAYER_BUILD__ = 'sp-2026-02-14-11';
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
        let craftingInput = new Array(4).fill(null); // 2x2 Grid
        let craftingTableInput = new Array(9).fill(null); // 3x3 Grid
        let craftingOutput = null; 
        let heldItem = null; 
        let heldItemSourceIndex = -1; 
        let heldItemSourceType = null; 

        // Mining / breaking state
        const BREAKING_TEXTURE_BASE = `${window.SingleplayerConfig?.REPO_BASE_PREFIX || '/MultiPixel'}/game/singleplayer/assets/breaking`;
        const BLOCK_HARDNESS = { 1: 1.2, 2: 1.0, 3: 2.6, 5: 1.8, 6: 0.25, 7: 1.0, 8: 1.2, 9: 2.0, 13: 2.2, 14: Infinity, 15: 0.35, 17: 2.1, 18: 2.2, 20: 3.1 };
        let miningState = { active: false, key: null, blockPos: null, targetType: 0, elapsedMs: 0, neededMs: 0, missMs: 0 };
        let isLeftMouseDown = false;
        const breakingStageTextures = new Array(10).fill(null);
        let breakingCrackMesh = null;
        let lastPhysicsTickMs = 0;
        const dirtyChunkKeys = new Set();
        let physicsCursorY = 1;
     

      
        let scene, camera, renderer, perlin, raycaster;
        let worldSeed = 0;
        let lightingSystem = null;
        const chunks = new Map();
        const worldGroup = new THREE.Group();
        let yawObject, pitchObject; 
        
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
                            texture.minFilter = THREE.NearestFilter;
                            materials[key] = new THREE.MeshStandardMaterial({
                                map: texture,
                                side: key === 'LEAVES' ? THREE.DoubleSide : THREE.FrontSide,
                                transparent: blockMaterials[getMaterialIdByTextureKey(key)].transparent || false,
                                opacity: blockMaterials[getMaterialIdByTextureKey(key)].opacity || 1.0,
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
                if (blockMaterials[id].textureKey === key) return parseInt(id);
            }
            return -1;
        }

        // --- 4. INITIALIZATION ---

        async function init() {
            
            await loadAssets(); // Load all textures and materials first!
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
            setInitialPlayerPosition();
            
          
            renderHearts();
            updateHotbarUI();
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
                }
            });
            
            // Dummy items for testing inventory fix
            addToInventory(1, 1); // Grass
            addToInventory(2, 64); // Dirt
            addToInventory(3, 12); // Stone
            addToInventory(5, 5); // Wood Log (for crafting)
            addToInventory(6, 1); // Leaves
            addToInventory(7, 32); // Sand
            
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

            if (slotArray) {
                manageSlot(slotArray[finalIndex], slotArray, finalIndex);
                
                // If the change was in the crafting input grid, recalculate output
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
            const mainGrid = document.getElementById('main-inventory-grid');
            const hotbarGrid = document.getElementById('inventory-hotbar-grid');
            
            // 2x2 Elements
            const craftInputGrid2x2 = document.getElementById('crafting-input-grid');
            const craftOutputSlot2x2 = document.getElementById('crafting-output-slot-container');
            
            // 3x3 Elements
            const craftInputGrid3x3 = document.getElementById('crafting-table-grid');
            const craftOutputSlot3x3 = document.getElementById('crafting-table-output-slot');
            
            mainGrid.innerHTML = '';
            hotbarGrid.innerHTML = '';
            craftInputGrid2x2.innerHTML = '';
            craftOutputSlot2x2.innerHTML = '';
            craftInputGrid3x3.innerHTML = '';
            craftOutputSlot3x3.innerHTML = '';

            const mainStart = HOTBAR_SLOTS; 
            const mainEnd = TOTAL_INV_SIZE; 

            // Helper function to create a slot element
            const createSlot = (item, index, type) => {
                const slot = document.createElement('div');
                slot.className = 'inv-slot w-10 h-10 md:w-12 md:h-12';
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
                return slot;
            };

            // Hotbar grid (slots 0-8)
            for (let i = 0; i < HOTBAR_SLOTS; i++) {
                hotbarGrid.appendChild(createSlot(inventory[i], i, 'hotbar'));
            }

            // Main inventory grid (slots 9-35)
            for (let r = 0; r < INV_ROWS; r++) {
                for (let c = 0; c < INV_COLS; c++) {
                    const invIndex = mainStart + r * INV_COLS + c;
                    const displayIndex = r * INV_COLS + c; // Index relative to the main grid (0-26)
                    mainGrid.appendChild(createSlot(inventory[invIndex], displayIndex, 'main-inv'));
                }
            }

            // RENDER CRAFTING GRIDS BASED ON STATE
            if (isCraftingTableOpen) {
                // Render 3x3 Grid
                for (let i = 0; i < 9; i++) {
                    craftInputGrid3x3.appendChild(createSlot(craftingTableInput[i], i, 'craft-table-input'));
                }
                // Output Slot
                const outputSlotEl = createSlot(craftingOutput, 0, 'output');
                outputSlotEl.style.backgroundColor = '#6495ed'; 
                craftOutputSlot3x3.appendChild(outputSlotEl);
            } else {
                // Render 2x2 Grid
                for (let i = 0; i < 4; i++) {
                    craftInputGrid2x2.appendChild(createSlot(craftingInput[i], i, 'craft-input'));
                }
                // Output Slot
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
            const hud = document.getElementById('hud');
            
            // Elements to toggle
            const container2x2 = document.getElementById('crafting-2x2-container');
            const container3x3 = document.getElementById('crafting-3x3-container');

            if (isInventoryOpen) {
                // CLOSE INVENTORY
                isInventoryOpen = false;
                isCraftingTableOpen = false; // Reset table state
                invScreen.classList.add('hidden');
                hud.classList.remove('opacity-0');
                document.body.requestPointerLock();
                
                // --- Cleanup held item when closing inventory ---
                if (heldItem) {
                    // Try to return item to inventory
                    if (!addToInventory(heldItem.id, heldItem.count)) {
                        // If full, drop item (simplified: just delete for now or keep in heldItem? Let's keep logic simple and try to add)
                        console.log("Inventory full, item lost on close (simplified logic)");
                    }
                    heldItem = null;
                    heldItemSourceIndex = -1;
                    heldItemSourceType = null;
                }
                renderHeldItem(); 
                updateHotbarUI(); 

            } else {
                // OPEN INVENTORY
                isInventoryOpen = true;
                isCraftingTableOpen = openTableMode;
                
                // Toggle visibility of crafting grids
                if (isCraftingTableOpen) {
                    container2x2.classList.add('hidden');
                    container3x3.classList.remove('hidden');
                } else {
                    container2x2.classList.remove('hidden');
                    container3x3.classList.add('hidden');
                }

                heldItem = null; 
                heldItemSourceIndex = -1;
                heldItemSourceType = null;
                
                // Recalculate crafting output just before opening
                const inputGrid = isCraftingTableOpen ? craftingTableInput : craftingInput;
                const gridWidth = isCraftingTableOpen ? 3 : 2;
                craftingOutput = checkCraftingRecipe(inputGrid, gridWidth);
                
                renderInventoryScreen(); 
                invScreen.classList.remove('hidden');
                hud.classList.add('opacity-0');
                document.exitPointerLock(); 
                player.keys = {}; 
            }
        }
        
    

        function getMiningDurationMs(blockId) {
            const hardness = BLOCK_HARDNESS[blockId] ?? 1.5;
            const held = inventory[selectedHotbarIndex];
            const equippedPickaxe = PickaxeSystem.getEquippedPickaxe ? PickaxeSystem.getEquippedPickaxe(held) : null;
            if (PickaxeSystem.getMiningTimeMs) {
                return PickaxeSystem.getMiningTimeMs(blockId, hardness, equippedPickaxe);
            }
            return isFinite(hardness) ? hardness * 1000 : Infinity;
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
            const neededMs = getMiningDurationMs(target.blockId);
            if (!isFinite(neededMs)) {
                showGameMessage('Bedrock is unbreakable.');
                return false;
            }
            miningState = {
                active: true,
                key: `${target.wx},${target.wy},${target.wz}`,
                blockPos: target.pos,
                targetType: target.blockId,
                elapsedMs: 0,
                neededMs,
                missMs: 0,
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
        }

        function onPointerUp(event) {
            if (event.button !== 0) return;
            isLeftMouseDown = false;
            miningState.active = false;
            updateBreakingOverlay();
        }

        function onPointerDown(event) {
            if (!player.canMove || isInventoryOpen) return;

            raycaster.setFromCamera({ x: 0, y: 0 }, camera); 
            
          
            const meshes = [];
            worldGroup.children.forEach(g => g.children.forEach(m => meshes.push(m)));
            
            const intersects = raycaster.intersectObjects(meshes, true);

            if (intersects.length > 0) {
                const hit = intersects[0];
               
                // LEFT CLICK - Break
                if (event.button === 0) {
                    isLeftMouseDown = true;
                    const target = getTargetBlockFromCrosshair();
                    if (target) {
                        beginMiningTarget(target);
                        updateBreakingOverlay();
                    }
                } 
                // RIGHT CLICK - Interact or Place
                else if (event.button === 2) { 
                    
                    // 1. Check for Block Interaction (Crafting Table)
                    const targetBlockPos = hit.point.clone().sub(hit.face.normal.clone().multiplyScalar(0.01));
                    const wx = Math.floor(targetBlockPos.x);
                    const wy = Math.floor(targetBlockPos.y);
                    const wz = Math.floor(targetBlockPos.z);
                    const targetBlockId = getBlockType(wx, wy, wz);

                    if (targetBlockId === 9) { // 9 = Crafting Table
                        toggleInventory(true); // Open in Table Mode
                        return; 
                    }

                    // 2. Place Block Logic
                    const item = inventory[selectedHotbarIndex];
                    if (!item || !isSolid(item.id)) return; 

                    const placePos = hit.point.clone().add(hit.face.normal.clone().multiplyScalar(0.01));
                    
                    const px = Math.floor(placePos.x), py = Math.floor(placePos.y), pz = Math.floor(placePos.z);
                    const playerBox = new THREE.Box3(
                        new THREE.Vector3(yawObject.position.x - PLAYER_RADIUS, yawObject.position.y, yawObject.position.z - PLAYER_RADIUS),
                        new THREE.Vector3(yawObject.position.x + PLAYER_RADIUS, yawObject.position.y + PLAYER_HEIGHT, yawObject.position.z + PLAYER_RADIUS)
                    );
                    const blockBox = new THREE.Box3(
                        new THREE.Vector3(px, py, pz), new THREE.Vector3(px+1, py+1, pz+1)
                    );

                    if (!playerBox.intersectsBox(blockBox)) {
                        if (modifyWorld(placePos, item.id)) {
                            consumeSelectedItem();
                        }
                    }
                }
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

        function applyBlockPhysics(nowMs) {
            if (!window.WaterPhysics || !window.SandPhysics) return;
            if (nowMs - lastPhysicsTickMs < 90) return;
            lastPhysicsTickMs = nowMs;

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

                    for (let y = startY; y <= endY && updates < maxUpdates; y++) {
                        for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE && updates < maxUpdates; i++) {
                            const x = i % CHUNK_SIZE;
                            const z = (i * 7 + y * 3) % CHUNK_SIZE;
                            const idx = x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_HEIGHT;
                            const type = data[idx];
                            if (type !== 4 && type !== 7) continue;

                            const wx = cx * CHUNK_SIZE + x;
                            const wz = cz * CHUNK_SIZE + z;
                            const ctx = {
                                wx, wy: y, wz,
                                getBlock: getBlockType,
                                setBlock: (xw, yw, zw, nt) => setBlockTypeRaw(xw, yw, zw, nt, true),
                                swapBlocks: swapBlocksRaw,
                                random: Math.random,
                            };

                            const changed = type === 4 ? window.WaterPhysics.tryUpdate(ctx) : window.SandPhysics.tryUpdate(ctx);
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
        }

        function modifyWorld(posVector, newType) {
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

                const drop = PickaxeSystem.getDrop ? PickaxeSystem.getDrop(oldType) : { id: oldType, count: 1 };
                if (drop && drop.id > 0 && drop.count > 0) addToInventory(drop.id, drop.count);
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
            player.direction.normalize();

            const isMoving = player.direction.lengthSq() > 0;
            const isSprinting = isMoving && player.keys['e'];
            if (window.HungerSystem) {
                window.HungerSystem.update(performance.now(), { isMoving, isSprinting });
            }
            const hungerMultiplier = window.HungerSystem ? window.HungerSystem.getSpeedMultiplier() : 1;
            const sprintMultiplier = isSprinting ? player.sprintMultiplier : 1;
            player.moveSpeed = player.baseMoveSpeed * sprintMultiplier * hungerMultiplier;

            player.velocity.x = player.direction.x * player.moveSpeed;
            player.velocity.z = player.direction.z * player.moveSpeed;
            player.velocity.y += GRAVITY;

          
            if (player.keys[' '] && !player.isJumping) {
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
            { name: 'Desert', temp: 0.78, humidity: -0.62, continentalness: 0.55, erosion: 0.05, weirdness: 0.1, depth: 0.24 },
            { name: 'Forest', temp: 0.42, humidity: 0.62, continentalness: 0.46, erosion: 0.12, weirdness: -0.08, depth: 0.2 },
            { name: 'Plains', temp: 0.52, humidity: 0.1, continentalness: 0.42, erosion: 0.38, weirdness: 0.02, depth: 0.14 },
        ];

        function chooseBiomeByClimate(vec) {
            let best = 'Plains';
            let bestDist = Infinity;
            for (const t of BIOME_CLIMATE_TARGETS) {
                const dTemp = vec.temp - t.temp;
                const dHum = vec.humidity - t.humidity;
                const dCont = vec.continentalness - t.continentalness;
                const dEro = vec.erosion - t.erosion;
                const dWeird = vec.weirdness - t.weirdness;
                const dDepth = vec.depth - t.depth;
                const dist = dTemp*dTemp + dHum*dHum + dCont*dCont + dEro*dEro + dWeird*dWeird + dDepth*dDepth;
                if (dist < bestDist) {
                    bestDist = dist;
                    best = t.name;
                }
            }
            return best;
        }

        function getBiome(wx, wz) {
            const tv = sampleTerrainVector(wx, wz);
            const climateNoise = octaveNoise2D(wx, wz, 3, 0.52, 2.0, 0.00045, -600, 300);
            const moistureNoise = octaveNoise2D(wx, wz, 3, 0.55, 2.0, 0.0007, 1000, 1000);
            const detailNoise = octaveNoise2D(wx, wz, 3, 0.6, 2.0, 0.003, 0, 0);
            const mountainNoise = (Math.abs(octaveNoise2D(wx, wz, 3, 0.56, 2.0, 0.0013, -400, 750)) + 1) * 0.5;
            const continentalNoise = (tv.continentalness + 1) * 0.5;
            const distFromCenter = Math.sqrt(wx * wx + wz * wz);
            const riverMask = getRiverMask(wx, wz);

            if (TerrainModules['mountains'].isBiome({ mountainNoise, continentalNoise, climateNoise })) return 'Mountains';
            if (TerrainModules['ocean'].isBiome({ continentalNoise, climateNoise })) return 'Ocean';

            const climateVec = {
                temp: climateNoise,
                humidity: tv.humidity,
                continentalness: tv.continentalness,
                erosion: tv.erosion,
                weirdness: tv.weirdness,
                depth: tv.peaksValleys,
            };

            let selected = chooseBiomeByClimate(climateVec);

            if (selected === 'Desert') {
                const isDesert = TerrainModules['desert'].isBiome({
                    climateNoise,
                    moistureNoise: Math.min(moistureNoise, tv.humidity),
                    continentalNoise,
                });
                if (!isDesert || riverMask < 0.35) selected = 'Plains';
            }

            if (selected === 'Forest' && !TerrainModules['oakForest'].isBiome({ detailNoise, humidityNoise: tv.humidity, distFromCenter, ISLAND_RADIUS })) {
                selected = 'Plains';
            }

            return selected;
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

        function hashRand2D(wx, wz, salt = 0) {
            let h = (Math.imul(wx | 0, 374761393) ^ Math.imul(wz | 0, 668265263) ^ Math.imul((worldSeed + salt) | 0, 2246822519)) >>> 0;
            h ^= h >>> 13;
            h = Math.imul(h, 1274126177) >>> 0;
            h ^= h >>> 16;
            return h / 4294967295;
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
            const terrainNoise = (perlin.noise2D(wx * 0.03, wz * 0.03) + 1) * 0.5;
            const detailNoise = (perlin.noise2D(wx * 0.08, wz * 0.08) + 1) * 0.5;
            const erosionNoise = (tv.erosion + 1) * 0.5;
            const ridgeNoise = Math.abs(perlin.noise2D(wx * 0.02 + 50, wz * 0.02 + 50));
            const peakNoise = Math.abs(perlin.noise2D(wx * 0.007 - 250, wz * 0.007 + 400));
            const jaggedNoise = Math.abs(octaveNoise2D(wx, wz, 5, 0.46, 2.25, 0.013, -1200, 950));
            const cliffNoise = Math.abs(perlin.noise2D(wx * 0.012 - 910, wz * 0.012 + 260));
            const deepNoise = (perlin.noise2D(wx * 0.01 - 200, wz * 0.01 + 430) + 1) * 0.5;
            const duneNoise = (perlin.noise2D(wx * 0.045 + 15, wz * 0.045 - 15) + 1) * 0.5;

            let h;
            if (biome === 'Plains') {
                h = TerrainModules['plains'].getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise });
            } else if (biome === 'Forest') {
                h = TerrainModules['oakForest'].getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise });
            } else if (biome === 'Desert') {
                h = TerrainModules['desert'].getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, duneNoise });
            } else if (biome === 'Mountains') {
                h = TerrainModules['mountains'].getHeight({
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
            } else {
                h = TerrainModules['ocean'].getHeight({ SEA_LEVEL, deepNoise, terrainNoise });
            }

            h += detailNoise * (biome === 'Mountains' ? 1.2 : 0.7);

            const riverInfluence = getRiverMask(wx, wz);
            h = TerrainModules['river'].applyHeight({ height: h, riverInfluence, SEA_LEVEL });

            const ravine = getRavineMask(wx, wz);
            if (ravine > 0.84 && biome !== 'Ocean') h -= (ravine - 0.84) * 70;

            if (biome === 'Mountains' && h < SEA_LEVEL + 8) h = SEA_LEVEL + 8;
            if (h < SEA_LEVEL - 6 && biome !== 'Ocean') h = SEA_LEVEL - 6;
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
                if (biome === 'Mountains') {
                    if (wy >= h - 1 && h > SEA_LEVEL + 16) return 15;
                    return 3;
                }
                return 1;
            }
            if (wy < SEA_LEVEL) return 4;
            return 0;
        }

       
        function setupPointerLockControls() {
            const el = document.body;
            document.addEventListener('pointerlockchange', () => {
                if (document.pointerLockElement === el) {
                    player.canMove = true;
                    if(isInventoryOpen) toggleInventory(); 
                    document.getElementById('instructions').style.opacity = 0;
                    document.getElementById('crosshair').style.opacity = 1;
                } else {
                    player.canMove = false;
                    if(!isInventoryOpen) {
                        document.getElementById('instructions').style.opacity = 1;
                        document.getElementById('crosshair').style.opacity = 0;
                    }
                }
            });
            document.addEventListener('mousemove', e => {
                if (!player.canMove || isInventoryOpen) return;
                yawObject.rotation.y -= e.movementX * player.rotationSpeed;
                pitchObject.rotation.x -= e.movementY * player.rotationSpeed;
                pitchObject.rotation.x = Math.max(-1.5, Math.min(1.5, pitchObject.rotation.x));
            });
            document.getElementById('instructions').onclick = () => {
                if(!isInventoryOpen) el.requestPointerLock();
            };
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
                         
                         const ravineMask = getRavineMask(wx, wz);
                         if (ravineMask > 0.82) {
                             const ravineDepth = Math.floor((ravineMask - 0.82) * 70) + 10;
                             const ravineTop = Math.min(h + 6, CHUNK_HEIGHT - 1);
                             const ravineBottom = Math.max(2, ravineTop - ravineDepth);
                             if (y <= ravineTop && y >= ravineBottom) {
                                 if (y < SEA_LEVEL - 2) t = 4;
                                 else t = 0;
                             }
                         }

                         // Coal ore pass: mineable by hand, faster with pickaxe.
                         if (t === 3 && y > 6 && y < Math.min(CHUNK_HEIGHT - 6, h - 2)) {
                             const veinNoise = octaveNoise2D(wx, wz, 3, 0.5, 2.0, 0.09, 1450, -870);
                             const depthBias = 1 - (y / CHUNK_HEIGHT);
                             const oreRoll = hashRand2D(wx + y * 13, wz - y * 7, 301);
                             if (veinNoise > 0.12 && oreRoll < (0.06 + depthBias * 0.08)) {
                                 t = 18;
                             }
                         }

                         if (isNearBoundary && y < SEA_LEVEL && (t === 4 || t === 0)) {
                             t = 3; 
                         } 

                         data[x + y*CHUNK_SIZE + z*CHUNK_SIZE*CHUNK_HEIGHT] = t;
                     }
                  
                     // --- Tree Generation (Forest often, Plains occasionally) ---
                     if (surfaceBlockType === 1 && (biome === 'Forest' || biome === 'Plains') && !isRiver) { 
                         const densityNoise = octaveNoise2D(wx, wz, 3, 0.55, 2.0, 0.045, 700, -350) * 0.5 + 0.5;
                         const jitter = hashRand2D(wx, wz, 99);
                         const localScore = densityNoise * 0.68 + jitter * 0.32;

                         // Cell gating keeps distribution natural while guaranteeing regular spawn opportunities.
                         const cell = biome === 'Forest' ? 3 : 4;
                         const cellKeyX = Math.floor(wx / cell);
                         const cellKeyZ = Math.floor(wz / cell);
                         const cellRoll = hashRand2D(cellKeyX, cellKeyZ, biome === 'Forest' ? 211 : 223);
                         const chance = biome === 'Forest' ? 0.58 : 0.24;

                         if (localScore > (1.0 - chance) && cellRoll > 0.56) {
                             const th = 4 + Math.floor(hashRand2D(wx, wz, 157) * 4); // Tree height 4-7
                             // Trunk
                             for(let i=1; i<=th; i++) {
                                 const idx = x + (h-1+i)*CHUNK_SIZE + z*CHUNK_SIZE*CHUNK_HEIGHT;
                                 if ((h-1+i) < CHUNK_HEIGHT) data[idx] = 5; // Wood Log
                             }

                             // Leaves
                             for(let lx=-2; lx<=2; lx++){
                                 for(let lz=-2; lz<=2; lz++){
                                     for(let ly=th-2; ly<=th+1; ly++){
                                         if(Math.abs(lx)+Math.abs(lz)+Math.abs(ly-th) > 3) continue;
                                         const tx = x+lx; const tz = z+lz; const ty = h-1+ly;
                                         if(tx>=0 && tx<CHUNK_SIZE && tz>=0 && tz<CHUNK_SIZE && ty<CHUNK_HEIGHT) {
                                             const lidx = tx + ty*CHUNK_SIZE + tz*CHUNK_SIZE*CHUNK_HEIGHT;
                                             if(data[lidx]===0) data[lidx] = 6; // Leaves
                                         }
                                     }
                                 }
                             }
                         }
                     }
                 }
             }
             return data;
        }

        function createChunk(cx, cz) {
            const data = generateChunkData(cx, cz);
            const group = new THREE.Group();
            group.userData = { chunkData: data, cx, cz };
            updateChunkGeometry(group, data);
            chunks.set(`${cx},${cz}`, group);
            worldGroup.add(group);
            return group;
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
                const key = mat.textureKey;
                // Use the loaded material key if it exists, otherwise use a colored fallback key
                if (materials[key] && materials[key].map) return key; 
                return `${key}_FALLBACK`;
            }
            if (id === 4) return 'WATER'; 
            if (id === 5) return 'WOOD';  
            
            // For non-textured blocks that might have been assigned a vertex color
            return 'COLORED_OPAQUE';
        }

        function updateChunkGeometry(group, data) {
         
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
                                
                                for(let c of f.corners) {
                                    gd.pos.push(wx + c[0], y + c[1], wz + c[2]);
                                    gd.norm.push(f.dir[0], f.dir[1], f.dir[2]);
                                }
                                
                                
                                if (materials[materialKey] && materials[materialKey].map) {
                                    gd.uv.push(...f.uv);
                                } else {
                                    // Vertex color for non-textured blocks (like wood/water) or blocks whose texture failed to load
                                    const color = blockMaterials[id].color || 0xd1c17e; // Fallback color
                                    
                                    // Use THREE.Color object to get RGB components if the color is a number
                                    const c = new THREE.Color(color);
                                    
                                    gd.col.push(c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b);
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
                geom.setAttribute('normal', new THREE.Float32BufferAttribute(gd.norm, 3));
                
                let currentMaterial = materials[key];
                
                // Set UVs if material is textured (i.e., it has a map)
                if (currentMaterial && currentMaterial.map) {
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
                
                // Indices
                const idx = [];
                for(let i=0; i<gd.pos.length/3; i+=4) idx.push(i, i+1, i+2, i, i+2, i+3);
                geom.setIndex(idx);

                group.add(new THREE.Mesh(geom, currentMaterial));
            }
        }

        const SPAWN_MIN_LIGHT_LEVEL = 11;

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
                if (current === targetType) modifyWorld(blockPos, 0);
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
