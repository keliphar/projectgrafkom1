import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import TWEEN from '@tweenjs/tween.js';

// INIT===============================================

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

const container = document.getElementById('container');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

window.addEventListener('resize', onWindowResize);

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

const clock = new THREE.Clock();
const GRAVITY = 30;
const STEPS_PER_FRAME = 2;

const worldOctree = new Octree();

const playerCollider = new Capsule(new THREE.Vector3(-9, 0.8, 5), new THREE.Vector3(-9, 1.2, 5), 0.8);

const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
const keyStates = {};
let mouseTime = 0;
let isCollidingWithDoor = false;

let knife, kar98k;
let currentWeapon = 'knife';

const loader = new GLTFLoader();
loader.load('/Knife/karambit.glb', (gltf) => {
    knife = gltf.scene;
    knife.scale.set(0.1, 0.1, 0.1);
    knife.position.set(0.5, -0.5, -1);
    knife.rotation.set(4.5, Math.PI, -21);

    knife.userData.initialPosition = knife.position.clone();
    knife.userData.initialRotation = knife.rotation.clone();

    knife.traverse((node) => {
        if (node.isMesh) {
            node.renderOrder = 9999;
            node.material.depthTest = false;
        }
    });

    camera.add(knife);
    scene.add(camera);
}, undefined, (error) => {
    console.error('Error loading knife:', error);
});

loader.load('/Gun/kar98k.glb', (gltf) => {
    kar98k = gltf.scene;
    kar98k.scale.set(0.4, 0.4, 0.4);
    kar98k.position.set(0.5, -0.5, -1);
    kar98k.rotation.set(0, Math.PI / 2, 0);

    kar98k.userData.initialPosition = kar98k.position.clone();
    kar98k.userData.initialRotation = kar98k.rotation.clone();

    kar98k.traverse((node) => {
        if (node.isMesh) {
            if (node.material.map) {
                node.material.map.encoding = THREE.sRGBEncoding;
            }
            node.material.needsUpdate = true;
        }
    });

    camera.add(kar98k);
    kar98k.visible = false; // Initially hide the gun
}, undefined, (error) => {
    console.error('Error loading gun:', error);
});

document.addEventListener('keydown', (event) => {
    keyStates[event.code] = true;

    if (event.code === 'KeyE' && !isWeaponSwitching) {
        toggleWeapon();
    }

    if (event.code === 'KeyF' && isLeverHighlighted && !isDoorRotating) {
        rotateDoor();
    }
});

document.addEventListener('keyup', (event) => {
    keyStates[event.code] = false;
});

container.addEventListener('click', (event) => {
    if (document.pointerLockElement !== document.body) {
        document.body.requestPointerLock();
    }
});

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === document.body) {
        document.addEventListener('mousedown', onDocumentMouseDown);
    } else {
        document.removeEventListener('mousedown', onDocumentMouseDown);
    }
});

function onDocumentMouseDown(event) {
    if (event.button === 0) {
        mouseTime = performance.now();
        startSpin();
    }
}

document.body.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === document.body) {
        camera.rotation.y -= event.movementX / 1000;
        camera.rotation.x -= event.movementY / 1000;
    }
});

function playerCollisions() {
    const result = worldOctree.capsuleIntersect(playerCollider);

    playerOnFloor = false;

    if (result) {
        playerOnFloor = result.normal.y > 0;

        if (!playerOnFloor) {
            playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity));
        }

        // Check if player is colliding with the door
        if (doorBoundingBox && doorBoundingBox.containsPoint(playerCollider.start)) {
            playerVelocity.set(0, 0, 0);
        } else {
            playerCollider.translate(result.normal.multiplyScalar(result.depth));
        }
    }
}

function updatePlayer(deltaTime) {
    let damping = Math.exp(-4 * deltaTime) - 1;

    if (!playerOnFloor) {
        playerVelocity.y -= GRAVITY * deltaTime;
        damping *= 0.1;
    }

    playerVelocity.addScaledVector(playerVelocity, damping);

    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPosition);

    playerCollisions();

    camera.position.copy(playerCollider.end);
    camera.position.y += 0.6;
    
}

function getForwardVector() {
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    return playerDirection;
}

function getSideVector() {
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    playerDirection.cross(camera.up);
    return playerDirection;
}
function controls(deltaTime) {
    if (isCollidingWithDoor) return;

    const speedDelta = deltaTime * (playerOnFloor ? 25 : 8);

    if (keyStates['KeyW']) {
        playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));
    }

    if (keyStates['KeyS']) {
        playerVelocity.add(getForwardVector().multiplyScalar(-speedDelta));
    }

    if (keyStates['KeyA']) {
        playerVelocity.add(getSideVector().multiplyScalar(-speedDelta));
    }

    if (keyStates['KeyD']) {
        playerVelocity.add(getSideVector().multiplyScalar(speedDelta));
    }

    if (playerOnFloor) {
        if (keyStates['Space']) {
            playerVelocity.y = 10;
        }
    }
}

function teleportPlayerIfOob() {
    if (camera.position.y <= -25) {
        playerCollider.start.set(-9, 0.8, 5);
        playerCollider.end.set(-9, 1.2, 5);
        playerCollider.radius = 0.8;
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0);
    }
}

let building1, building2, building3, building4, chamber, longwall1, longwall2, longwall3, longwall4, longwall5, longwall6, longwall7, longwall8, lever, table, rotatingdoor, doorframe, fotresswall1, wallgun1, wallgun2, wallgun3, wallgun4;
let mixer_chamber;
let mixer_wallgun1, mixer_wallgun2, mixer_wallgun3, mixer_wallgun4;
let doorBoundingBox;

// Building 1================
loader.load('/Building/building1.glb', function (gltf) {
    building1 = gltf.scene;
    building1.position.set(-16, 0, -13.3);
    building1.scale.set(2, 2, 2);
    building1.rotation.set(0, 0, 0);
    building1.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });
    scene.add(building1);
    worldOctree.fromGraphNode(building1);
});

// Building 2================
loader.load('/Building/building1.glb', function (gltf) {
    building2 = gltf.scene;
    building2.position.set(-16, 0, -5);
    building2.scale.set(2, 2, 2);
    building2.rotation.set(0, 0, 0);
    building2.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });
    scene.add(building2);
    worldOctree.fromGraphNode(building2);
});

// Building 3================
loader.load('/Building/building2.glb', function (gltf) {
    building3 = gltf.scene;
    building3.position.set(-15.5, 0, -17);
    building3.scale.set(2.1, 2.1, 2.1);
    building3.rotation.set(0, 0, 0);
    building3.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });
    scene.add(building3);
    worldOctree.fromGraphNode(building3);
});

// Building 4================
loader.load('/Building/house_valo.glb', function (gltf) {
    building4 = gltf.scene;
    building4.position.set(-16, -0.2, 15);
    building4.scale.set(1, 1, 1);
    building4.rotation.set(0, 0, 0);
    building4.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });
    scene.add(building4);
    worldOctree.fromGraphNode(building4);
});

// Rotating Door================
loader.load('/Wall/rotatingdoor.glb', function (gltf) {
    rotatingdoor = gltf.scene;
    rotatingdoor.scale.set(3, 3, 3);
    rotatingdoor.rotation.set(0, Math.PI / 2, 0);
    rotatingdoor.position.set(10, 0, -7);
    scene.add(rotatingdoor);
});

// DoorFrame
loader.load('/Wall/doorframe.glb', function (gltf) {
    doorframe = gltf.scene;
    doorframe.scale.set(3, 2.8, 3.5);
    doorframe.rotation.set(0, Math.PI + (Math.PI / 2), 0);
    doorframe.position.set(8, -2, -4);
    worldOctree.fromGraphNode( doorframe )
    scene.add(doorframe);
});

// Table
loader.load( '/Lever/table.glb', function ( gltf ) {
    table = gltf.scene;
    table.scale.set(0.02, 0.02, 0.02);
    table.rotation.set(0, Math.PI / 2, 0);
    table.position.set(3, -0.845, -4);
    
	scene.add( table );
    worldOctree.fromGraphNode( table )
});

// Lever
loader.load( '/Lever/lever.glb', function ( gltf ) {
    lever = gltf.scene;
    lever.scale.set(1, 1, 1);
    lever.rotation.set(0, Math.PI / 2, 0);
    lever.position.set(3, 0.7, -4);

	scene.add( lever );
    worldOctree.fromGraphNode( lever )
});

// FotressWall1
loader.load('/Wall/fotresswall.glb', function (gltf) {
    fotresswall1 = gltf.scene;
    fotresswall1.scale.set(2.6, 2.8, 4);
    fotresswall1.rotation.set(0, Math.PI + (Math.PI / 2), 0);
    fotresswall1.position.set(9, -2, -16.3);
    worldOctree.fromGraphNode( fotresswall1 )
    scene.add(fotresswall1);
});

// FotressWall2
loader.load('/Wall/fotresswall.glb', function (gltf) {
    fotresswall1 = gltf.scene;
    fotresswall1.scale.set(3.9, 2.8, 4);
    fotresswall1.rotation.set(0, Math.PI + (Math.PI / 2), 0);
    fotresswall1.position.set(9, -2, 13.2);
    worldOctree.fromGraphNode( fotresswall1 )
    scene.add(fotresswall1);
});

// longwall1 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall1 = gltf.scene;
    longwall1.scale.set(2, 2, 2);
    longwall1.rotation.set(0, 0, 0);
    longwall1.position.set(-10, 0, -24.7);
	scene.add( longwall1 );
    worldOctree.fromGraphNode( longwall1 )
});

//longwall2 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall2 = gltf.scene;
    longwall2.scale.set(2, 2, 2);
    longwall2.rotation.set(0, 90 * (Math.PI / 180), 0);
    longwall2.position.set(-24.5, 0, -6);
	scene.add( longwall2 );
    worldOctree.fromGraphNode( longwall2 )
});

//longwall3 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall3 = gltf.scene;
    longwall3.scale.set(2, 2, 2);
    longwall3.rotation.set(0, 90 * (Math.PI / 180), 0);
    longwall3.position.set(-24.3, 0, 6.3);
	scene.add( longwall3 );
    worldOctree.fromGraphNode( longwall3 )
});

//longwall4 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall4 = gltf.scene;
    longwall4.scale.set(2, 2, 2);
    longwall4.rotation.set(0, -1 * (Math.PI / 180), 0);
    longwall4.position.set(-10, 0, 25);
	scene.add( longwall4 );
    worldOctree.fromGraphNode( longwall4 )
});

//longwall5 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall5 = gltf.scene;
    longwall5.scale.set(2, 2, 2);
    longwall5.rotation.set(0, 90 * (Math.PI / 180), 0);
    longwall5.position.set(24.5, 0, -6);
    // longwall5.traverse((node) => {
    //     if (node.isMesh) {
    //       node.castShadow = true;
    //       node.receiveShadow = true;
    //     }
    // });

	scene.add( longwall5 );
    worldOctree.fromGraphNode( longwall5 )
});

//longwall6 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall6 = gltf.scene;
    longwall6.scale.set(2, 2, 2);
    longwall6.rotation.set(0, 90 * (Math.PI / 180), 0);
    longwall6.position.set(24.7, 0, 6.3);
    // longwall6.traverse((node) => {
    //     if (node.isMesh) {
    //       node.castShadow = true;
    //       node.receiveShadow = true;
    //     }
    // });

	scene.add( longwall6 );
    worldOctree.fromGraphNode( longwall6 )
});

// longwall7 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall7 = gltf.scene;
    longwall7.scale.set(2, 2, 2);
    longwall7.rotation.set(0, 0, 0);
    longwall7.position.set(8, 0, -24.7);
    // longwall7.traverse((node) => {
    //     if (node.isMesh) {
    //       node.castShadow = true;
    //       node.receiveShadow = true;
    //     }
    // });

	scene.add( longwall7 );
    worldOctree.fromGraphNode( longwall7 )
});

//longwall8 =========================
loader.load( '/Wall/longwall.glb', function ( gltf ) {
    longwall8 = gltf.scene;
    longwall8.scale.set(2, 2, 2);
    longwall8.rotation.set(0, -1 * (Math.PI / 180), 0);
    longwall8.position.set(8, 0, 25);
    // longwall8.traverse((node) => {
    //     if (node.isMesh) {
    //       node.castShadow = true;
    //       node.receiveShadow = true;
    //     }
    // });

	scene.add( longwall8 );
    worldOctree.fromGraphNode( longwall8 )
});

// chamber =========================
loader.load('/Agent/cham.glb', function (gltf) {
    chamber = gltf.scene;
    chamber.scale.set(1.1, 1.1, 1.1);
    chamber.rotation.set(0, 0, 0);
    chamber.position.set(0, 0, -20);
    chamber.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    scene.add(chamber);
    worldOctree.fromGraphNode(chamber);

    // Create an AnimationMixer and pass in the model's animations
    mixer_chamber = new THREE.AnimationMixer(chamber);
    // Play the first animation in the model's animation array
    const action = mixer_chamber.clipAction(gltf.animations[0]);
    action.play();

    // Create an invisible barrier around the chamber to prevent collisions
    const barrierGeometry = new THREE.BoxGeometry(1, 2, 2);  // Adjust the size as needed
    const barrierMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, visible: false });
    const barrier = new THREE.Mesh(barrierGeometry, barrierMaterial);

    // Position the barrier around the chamber
    barrier.position.set(0, 1, -21);  // Adjust the position to match the chamber

    scene.add(barrier);
    worldOctree.fromGraphNode(barrier);
});

//Gun Tower 1
loader.load('/WallGun/guntower.glb', function (gltf) {
    wallgun1 = gltf.scene;
    wallgun1.scale.set(0.02, 0.05, 0.04);
    wallgun1.rotation.set(0, 180 * (Math.PI / 180), 0);
    wallgun1.position.set(9, 9, -13);
    wallgun1.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    scene.add(wallgun1);
    worldOctree.fromGraphNode(wallgun1);

    // Create an AnimationMixer and pass in the model's animations
    mixer_wallgun1 = new THREE.AnimationMixer(wallgun1);
    // Play the first animation in the model's animation array
    const action = mixer_wallgun1.clipAction(gltf.animations[0]);
    action.play();
});

//Gun Tower 2
loader.load('/WallGun/guntower.glb', function (gltf) {
    wallgun2 = gltf.scene;
    wallgun2.scale.set(0.02, 0.05, 0.04);
    wallgun2.rotation.set(0, 180 * (Math.PI / 180), 0);
    wallgun2.position.set(9, 9, -20);
    wallgun2.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    scene.add(wallgun2);
    worldOctree.fromGraphNode(wallgun2);

    // Create an AnimationMixer and pass in the model's animations
    mixer_wallgun2 = new THREE.AnimationMixer(wallgun2);
    console.log(gltf.animations[0]);
    // Play the first animation in the model's animation array
    const action = mixer_wallgun2.clipAction(gltf.animations[0]);
    action.play();
});

//Gun Tower 3
loader.load('/WallGun/guntower.glb', function (gltf) {
    wallgun3 = gltf.scene;
    wallgun3.scale.set(0.02, 0.05, 0.04);
    wallgun3.rotation.set(0, 180 * (Math.PI / 180), 0);
    wallgun3.position.set(9, 9, 10);
    wallgun3.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    scene.add(wallgun3);
    worldOctree.fromGraphNode(wallgun3);

    // Create an AnimationMixer and pass in the model's animations
    mixer_wallgun3 = new THREE.AnimationMixer(wallgun3);
    // Play the first animation in the model's animation array
    const action = mixer_wallgun3.clipAction(gltf.animations[0]);
    action.play();
});

//Gun Tower 4
loader.load('/WallGun/guntower.glb', function (gltf) {
    wallgun4 = gltf.scene;
    wallgun4.scale.set(0.02, 0.05, 0.04);
    wallgun4.rotation.set(0, 180 * (Math.PI / 180), 0);
    wallgun4.position.set(9, 9, 20);
    wallgun4.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    scene.add(wallgun4);
    worldOctree.fromGraphNode(wallgun4);

    // Create an AnimationMixer and pass in the model's animations
    mixer_wallgun4 = new THREE.AnimationMixer(wallgun4);
    console.log(gltf.animations[0]);
    // Play the first animation in the model's animation array
    const action = mixer_wallgun4.clipAction(gltf.animations[0]);
    action.play();
});

// ROTATING DOOR ==============================================================
let isDoorRotating = false;
const rotatingDoorSpeed = Math.PI / 4; // Rotating door speed (radians per second)
let rotatingDoorAngle = 0;
const rotatingDoorAxis = new THREE.Vector3(0, 1, 0);

let isDoorOpen = false; // Status awal pintu (tertutup)

// Function to rotate the door
function rotateDoor() {
    if (!isDoorRotating) {
        isDoorRotating = true;
        const targetAngle = isDoorOpen ? rotatingDoorAngle - Math.PI / 2 : rotatingDoorAngle + Math.PI / 2;

        const doorTween = new TWEEN.Tween({ angle: rotatingDoorAngle })
            .to({ angle: targetAngle }, (Math.PI / 2) / rotatingDoorSpeed * 1000)
            .easing(TWEEN.Easing.Quadratic.InOut)
            .onUpdate(({ angle }) => {
                const deltaAngle = angle - rotatingDoorAngle;
                rotatingdoor.rotateOnAxis(rotatingDoorAxis, deltaAngle);
                rotatingDoorAngle = angle;
            })
            .onComplete(() => {
                isDoorRotating = false;
                isDoorOpen = !isDoorOpen; // Ubah status pintu setelah animasi selesai
            });

        doorTween.start();
    }
}


const raycaster = new THREE.Raycaster();
const rayDirection = new THREE.Vector3();

function checkCollisionWithDoorRaycasting() {
    const playerPosition = new THREE.Vector3();
    playerCollider.getCenter(playerPosition);

    // Set the direction of the ray to the camera's direction
    camera.getWorldDirection(rayDirection);

    // Set the origin and direction of the ray
    raycaster.set(playerPosition, rayDirection);

    // Check for intersections with the door
    const intersects = raycaster.intersectObject(rotatingdoor, true);

    if (intersects.length > 0) {
        const intersection = intersects[0];
        const distance = intersection.distance;
        const collisionThreshold = 1.0; // Adjust the threshold as needed

        if (distance < collisionThreshold) {
            // Collision detected
            isCollidingWithDoor = true;
            playerVelocity.set(0, 0, 0);
        } else {
            isCollidingWithDoor = false;
        }
    } else {
        isCollidingWithDoor = false;
    }
}


// Add these variables at the beginning of your script
let isLeverHighlighted = false;
const leverMessage = document.getElementById('leverMessage'); // Element to show lever message

// Add these functions to handle lever proximity and highlighting
function checkLeverProximityAndOrientation() {
    if (!lever) return;

    const leverPosition = new THREE.Vector3();
    lever.getWorldPosition(leverPosition);
    const playerPosition = new THREE.Vector3();
    playerCollider.getCenter(playerPosition);

    const distance = leverPosition.distanceTo(playerPosition);
    const forwardVector = getForwardVector();
    const directionToLever = leverPosition.clone().sub(playerPosition).normalize();

    if (distance < 3 && forwardVector.dot(directionToLever) > 0.7) {
        if (!isLeverHighlighted) {
            highlightLever(true);
            leverMessage.style.display = 'block';
            isLeverHighlighted = true;
        }
    } else {
        if (isLeverHighlighted) {
            highlightLever(false);
            leverMessage.style.display = 'none';
            isLeverHighlighted = false;
        }
    }
}

function highlightLever(highlight) {
    if (!lever) return;

    lever.traverse((node) => {
        if (node.isMesh) {
            node.material.emissive = new THREE.Color(highlight ? 0x00ff00 : 0x000000);
            node.material.emissiveIntensity = highlight ? 0.5 : 0;
        }
    });
}

// FLOOR======================
const floorSize = 50;
const tileSize = 10;
const numTiles = Math.ceil(floorSize / tileSize);

const floorGeometry = new THREE.PlaneGeometry(tileSize * numTiles, tileSize * numTiles, numTiles, numTiles);
const floorMaterial = new THREE.MeshPhongMaterial({ color: 0x999999, depthWrite: true });

const floorLoader = new THREE.TextureLoader();
const floorTexture = floorLoader.load('/Floor/tile.jpg');
floorTexture.wrapS = THREE.RepeatWrapping;
floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(numTiles, numTiles);
floorMaterial.map = floorTexture;

const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
floorMesh.castShadow = true;
scene.add(floorMesh);

worldOctree.fromGraphNode(floorMesh);

// BACKGROUND
const backgroundGeometry = new THREE.SphereGeometry(500, 32, 32);

const backgroundTextureLoader = new THREE.TextureLoader();
const backgroundTexture = backgroundTextureLoader.load('/Background/ascentmap.jpg', (texture) => {
    texture.encoding = THREE.sRGBEncoding;
});

const backgroundMaterial = new THREE.MeshBasicMaterial({
    map: backgroundTexture,
    side: THREE.BackSide
});

const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
backgroundMesh.position.set(0, 0, 0);
scene.add(backgroundMesh);

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;

scene.background = new THREE.Color(0xa0a0a0);

// LIGHTING
const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 512;  // Reduced shadow map size
directionalLight.shadow.mapSize.height = 512; // Reduced shadow map size
scene.add(directionalLight);

// Animation variables
let isSpinning = false;
let spinStartTime = 0;
const spinDuration = 500;
let isWeaponSwitching = false;

function startSpin() {
    if (!isSpinning) {
        isSpinning = true;
        spinStartTime = performance.now();
    }
}

function handleSpin() {
    if (isSpinning) {
        const elapsedTime = performance.now() - spinStartTime;
        if (elapsedTime < spinDuration) {
            const spinAngle = (elapsedTime / spinDuration) * Math.PI * 2;
            const twistAngle = Math.sin((elapsedTime / spinDuration) * Math.PI * 4) * 0.2;
            const spinKar = (elapsedTime / spinDuration) * Math.PI * 2;
            if (currentWeapon === 'knife') {
                knife.rotation.y = spinAngle;
                knife.rotation.z = twistAngle;
            } else {
                kar98k.rotation.x = spinKar;
            }
        } else {
            isSpinning = false;
            if (currentWeapon === 'knife') {
                knife.rotation.copy(knife.userData.initialRotation);
            } else {
                kar98k.rotation.copy(kar98k.userData.initialRotation);
            }
            isWeaponSwitching = false; // Allow weapon switching again
        }
    }
}

function preventKnifeClipping() {
    if (knife.position.y <= -1.5) {
        knife.position.copy(knife.userData.initialPosition);
    }
}

function preventGunClipping() {
    if (kar98k.position.y <= -1.5) {
        kar98k.position.copy(kar98k.userData.initialPosition);
    }
}

function toggleWeapon() {
    if (knife && kar98k && !isWeaponSwitching) {
        isWeaponSwitching = true;
        startSpin(); // Start the spin animation
        if (currentWeapon === 'knife') {
            knife.visible = false;
            kar98k.visible = true;
            currentWeapon = 'kar98k';
        } else {
            knife.visible = true;
            kar98k.visible = false;
            currentWeapon = 'knife';
        }
    }
}
function animate() {
    requestAnimationFrame(animate);

    const deltaTime = Math.min(0.05, clock.getDelta() * 1.15) / STEPS_PER_FRAME;

    for (let i = 0; i < STEPS_PER_FRAME; i++) {
        controls(deltaTime);
        updatePlayer(deltaTime);
        teleportPlayerIfOob();
    }

    handleSpin();
    preventKnifeClipping();
    preventGunClipping();
    checkLeverProximityAndOrientation();
    checkCollisionWithDoorRaycasting();


    if (mixer_chamber) {
        mixer_chamber.update(deltaTime);
    }
    if (mixer_wallgun1) {
        mixer_wallgun1.update(deltaTime);
    }
    if (mixer_wallgun2) {
        mixer_wallgun2.update(deltaTime);
    }
    if (mixer_wallgun3) {
        mixer_wallgun3.update(deltaTime);
    }
    if (mixer_wallgun4) {
        mixer_wallgun4.update(deltaTime);
    }

    TWEEN.update();
    renderer.render(scene, camera);
}


animate();