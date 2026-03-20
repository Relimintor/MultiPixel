// --- Configuration ---
const CONFIG = {
    radius: 5.5,
    baseScale: 1.0,
    activeScale: 1.8,
    colors: {
        default: 0x444444,
        active: 0x00ffff,
        wireframe: 0xffffff
    }
};

const MENU_ITEMS = [
    { name: "MultiPixel", id: "single" },
    { name: "MultiPlayer", id: "multi" },
    { name: "Coding",       id: "coding" },
    { name: "Rapturo",         id: "Rapturo" },
    { name: "Credits",      id: "credits" }
];

let selectedIndex = 0;
let isModalOpen = false;

const swooshAudio = document.getElementById('swoosh-audio');
function playSwoosh() {
    if (swooshAudio) {
        swooshAudio.currentTime = 0;
        swooshAudio.play().catch(e => console.log("Audio play failed (user interaction needed first):", e));
    }
}

// --- Three.js Setup ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050505, 0.04);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 10;
camera.position.y = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0x404040, 2);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0x00ffff, 1, 30);
pointLight.position.set(0, 5, 8);
scene.add(pointLight);

const spotLight = new THREE.SpotLight(0xff00ff, 2);
spotLight.position.set(-10, 10, 5);
scene.add(spotLight);

// --- Object Creation ---
const objects = [];
const labels = [];
const uiLayer = document.getElementById('ui-layer');
const carouselGroup = new THREE.Group();
scene.add(carouselGroup);

const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const angleStep = (Math.PI * 2) / MENU_ITEMS.length;

function createLabel(text) {
    const div = document.createElement('div');
    div.className = 'label';
    div.textContent = text;
    uiLayer.appendChild(div);
    return div;
}

MENU_ITEMS.forEach((item, index) => {
    const material = new THREE.MeshStandardMaterial({
        color: CONFIG.colors.default,
        roughness: 0.4,
        metalness: 0.8
    });

    const cube = new THREE.Mesh(geometry, material);

    const wireGeo = new THREE.EdgesGeometry(geometry);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.3 });
    const wireframe = new THREE.LineSegments(wireGeo, wireMat);
    cube.add(wireframe);

    const theta = index * angleStep;
    cube.position.x = CONFIG.radius * Math.sin(theta);
    cube.position.z = CONFIG.radius * Math.cos(theta);
    cube.lookAt(0, 0, 0);
    cube.rotation.y += Math.PI;

    carouselGroup.add(cube);

    objects.push({
        mesh: cube,
        wireframe: wireframe,
        baseY: cube.position.y,
        angle: theta
    });

    labels.push(createLabel(item.name));
});

// --- Interaction Logic ---
function updateSelection() {
    labels.forEach((label, i) => {
        label.classList.toggle('active', i === selectedIndex);
    });
}

function onKeyDown(e) {
    if (isModalOpen) {
        if (e.key === 'Escape') closeModal();
        return;
    }

    switch (e.key) {
        case 'ArrowRight':
            selectedIndex = (selectedIndex + 1) % MENU_ITEMS.length;
            playSwoosh();
            updateSelection();
            break;
        case 'ArrowLeft':
            selectedIndex = (selectedIndex - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
            playSwoosh();
            updateSelection();
            break;
        case 'Enter':
            triggerAction(MENU_ITEMS[selectedIndex].name);
            break;
    }
}

window.addEventListener('keydown', onKeyDown);

// Touch support
let touchStartX = 0;
window.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].screenX);
window.addEventListener('touchend', e => {
    const touchEndX = e.changedTouches[0].screenX;
    if (touchEndX < touchStartX - 50) onKeyDown({ key: 'ArrowRight' });
    if (touchEndX > touchStartX + 50) onKeyDown({ key: 'ArrowLeft' });
});

// Click support
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', (event) => {
    if (event.target.classList.contains('hud-icon') || isModalOpen) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        let clickedObj = intersects[0].object;
        while (clickedObj.parent && clickedObj.parent !== carouselGroup) {
            clickedObj = clickedObj.parent;
        }

        const foundIndex = objects.findIndex(o => o.mesh === clickedObj);

        if (foundIndex !== -1) {
            if (foundIndex === selectedIndex) {
                triggerAction(MENU_ITEMS[selectedIndex].name);
            } else {
                selectedIndex = foundIndex;
                playSwoosh();
                updateSelection();
            }
        }
    }
});

// --- UI Functions ---
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');

function triggerAction(name) {
    modalTitle.textContent = name;
    modalDesc.textContent = `Initializing ${name} module...`;
    modal.classList.add('show');
    isModalOpen = true;

    // After a short delay, navigate if a page exists
    setTimeout(() => {
        const routes = {
            "SinglePlayer": "singleplayer/index.html",
            "MultiPlayer": "multiplayer/multiplayer.html",
            "Coding": "coding/coding.html",
            "Rapturo": "rapturo/rapturo.html",
            "Credits": "credits/credits.html"
        };

        if (routes[name]) {
            window.location.href = routes[name];
        }
    }, 800); // gives time for modal animation
}


window.openProfile = function () {
    triggerAction("User Profile");
};

window.openSettings = function () {
    const icon = document.getElementById('settings-icon');
    icon.classList.remove('clicked');
    void icon.offsetWidth;
    icon.classList.add('clicked');
    playSwoosh();
    setTimeout(() => triggerAction("Settings"), 300);
};

window.closeModal = function () {
    modal.classList.remove('show');
    isModalOpen = false;
};

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const time = Date.now() * 0.001;

    const targetRotation = -selectedIndex * angleStep;
    let currentRot = carouselGroup.rotation.y;

    if (Math.abs(targetRotation - currentRot) > Math.PI) {
        currentRot += targetRotation > currentRot ? Math.PI * 2 : -Math.PI * 2;
        carouselGroup.rotation.y = currentRot;
    }

    carouselGroup.rotation.y += (targetRotation - carouselGroup.rotation.y) * 0.1;

    objects.forEach((obj, index) => {
        const isSelected = index === selectedIndex;

        const targetScale = isSelected ? CONFIG.activeScale : CONFIG.baseScale;
        obj.mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);

        const targetColor = new THREE.Color(isSelected ? CONFIG.colors.active : CONFIG.colors.default);
        obj.mesh.material.color.lerp(targetColor, 0.1);
        obj.mesh.material.emissive.lerp(
            isSelected ? new THREE.Color(0x004444) : new THREE.Color(0x000000),
            0.1
        );

        obj.wireframe.material.color.setHex(isSelected ? 0xffffff : 0x444444);
        obj.wireframe.material.opacity = isSelected ? 0.8 : 0.3;

        if (isSelected) {
            obj.mesh.rotation.x = Math.sin(time) * 0.1;
            obj.mesh.rotation.y = Math.PI + Math.sin(time * 2) * 0.1;
        } else {
            obj.mesh.rotation.y = Math.PI;
        }

        obj.mesh.position.y = Math.sin(time * 2 + index) * 0.2;

        const tempV = new THREE.Vector3();
        obj.mesh.getWorldPosition(tempV);
        tempV.y += isSelected ? 1.5 : 0.9;
        tempV.project(camera);

        const x = (tempV.x * .5 + .5) * window.innerWidth;
        const y = (tempV.y * -.5 + .5) * window.innerHeight;

        labels[index].style.transform =
            `translate(-50%, -50%) translate(${x}px, ${y}px)`;

        const worldPos = new THREE.Vector3();
        obj.mesh.getWorldPosition(worldPos);
        const dist = worldPos.distanceTo(camera.position);
        const opacity = Math.max(0, 1 - (dist - 4) / 10);

        labels[index].style.opacity = isSelected ? 1 : opacity * 0.5;
        labels[index].style.zIndex = isSelected ? 100 : 1;
    });

    renderer.render(scene, camera);
}

updateSelection();
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
