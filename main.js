
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { gsap } from 'gsap';

// --- 기본 설정 ---
let scene, camera, renderer, controls;
let particles = null;
const clock = new THREE.Clock();
const PARTICLE_COUNT = 50000;

// --- 상태 관리 ---
let isPaused = false;
let isViewerMode = false;
let animationSpeed = 0.35;
let gsapAnimation = null; // GSAP 애니메이션 인스턴스
const mouse = new THREE.Vector2(-100, -100);
const raycaster = new THREE.Raycaster();
let interactionPlane;

// --- 임시 벡터 ---
const tempVec3 = new THREE.Vector3();
const tempMousePoint = new THREE.Vector3(-1000, -1000, -1000);

// --- UI 요소 ---
const colorPicker = document.getElementById('colorPicker');
const sizeSlider = document.getElementById('sizeSlider');
const toothScaleSlider = document.getElementById('toothScaleSlider');
const speedSlider = document.getElementById('speedSlider');
const speedControl = document.getElementById('speedControl');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const actionControls = document.getElementById('actionControls');
const helpBtn = document.getElementById('helpBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const manualModal = document.getElementById('manualModal');
const langEnBtn = document.getElementById('langEnBtn');
const langKoBtn = document.getElementById('langKoBtn');
const manualEn = document.getElementById('manualEn');
const manualKo = document.getElementById('manualKo');

// UI 요소 추가
const controlsToggleBtn = document.getElementById('controlsToggleBtn');
const controlsPanel = document.getElementById('controlsPanel');

// --- 초기화 ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 5, 40);

    const container = document.getElementById('container');
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const pointLight = new THREE.PointLight(0xffffff, 0.7);
    pointLight.position.set(10, 20, 30);
    scene.add(pointLight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.minDistance = 5; // 카메라가 모델에 접근할 수 있는 최소 거리
    controls.maxDistance = 200; // 카메라가 모델에서 멀어질 수 있는 최대 거리

    const planeGeometry = new THREE.PlaneGeometry(200, 200);
    interactionPlane = new THREE.Mesh(planeGeometry, new THREE.MeshBasicMaterial({ visible: false }));
    interactionPlane.lookAt(camera.position);
    scene.add(interactionPlane);

    const animationModeBtn = document.getElementById('animationModeBtn');
    const viewerModeBtn = document.getElementById('viewerModeBtn');
    const colorPreset1 = document.getElementById('colorPreset1');
    const colorPreset2 = document.getElementById('colorPreset2');
    const colorPreset3 = document.getElementById('colorPreset3');

    // 이벤트 리스너
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('mousemove', onMouseMove, false);
    window.addEventListener('touchmove', onTouchMove, false);
    window.addEventListener('touchend', onTouchEnd, false);
    window.addEventListener('wheel', onMouseWheel, false); // 마우스 휠 이벤트 리스너 추가
    animationModeBtn.addEventListener('click', () => setMode(false)); // 애니메이션 모드
    viewerModeBtn.addEventListener('click', () => setMode(true));  // 뷰어 모드
    colorPicker.addEventListener('input', (e) => particles.material.color.set(e.target.value));
    colorPreset1.addEventListener('click', () => particles.material.color.set('#00bcd4'));
    colorPreset2.addEventListener('click', () => particles.material.color.set('#e91e63'));
    colorPreset3.addEventListener('click', () => particles.material.color.set('#ffc107'));
    sizeSlider.addEventListener('input', (e) => particles.material.size = parseFloat(e.target.value));
    toothScaleSlider.addEventListener('input', (e) => {
        const scale = parseFloat(e.target.value);
        if (particles) {
            particles.scale.set(scale, scale, scale);
            fitCameraToModel(); // 스케일 변경 후 카메라 재조정
        }
    });
    speedSlider.addEventListener('input', (e) => animationSpeed = parseFloat(e.target.value));
    pauseBtn.addEventListener('click', togglePause);
    resetBtn.addEventListener('click', resetAnimation);

    // 뷰포인트 버튼 이벤트 리스너
    document.getElementById('frontViewBtn').addEventListener('click', () => setCameraView('front'));
    document.getElementById('sideViewBtn').addEventListener('click', () => setCameraView('side'));
    document.getElementById('topViewBtn').addEventListener('click', () => setCameraView('top'));
    document.getElementById('bottomViewBtn').addEventListener('click', () => setCameraView('bottom'));
    document.getElementById('fitViewBtn').addEventListener('click', fitCameraToModel);

    // 매뉴얼 관련 이벤트 리스너
    helpBtn.addEventListener('click', () => manualModal.classList.remove('hidden'));
    closeModalBtn.addEventListener('click', () => manualModal.classList.add('hidden'));
    manualModal.addEventListener('click', (e) => {
        if (e.target === manualModal) { // 모달 배경 클릭 시 닫기
            manualModal.classList.add('hidden');
        }
    });
    langEnBtn.addEventListener('click', () => switchLanguage('en'));
    langKoBtn.addEventListener('click', () => switchLanguage('ko'));

    // 컨트롤 패널 토글 버튼 이벤트 리스너
    controlsToggleBtn.addEventListener('click', () => {
        controlsPanel.classList.toggle('hidden');
    });

    // 초기 로드 시 컨트롤 패널 가시성 설정 (모바일에서는 숨김)
    if (window.innerWidth < 768) {
        controlsPanel.classList.add('hidden');
    } else {
        controlsPanel.classList.remove('hidden');
    }

    loadModelAndSetup();
}

// --- 모델 로드 ---
function loadModelAndSetup() {
    const loader = new OBJLoader();
    loader.load('./models/teeth.obj', (object) => {
        let firstMeshGeometry = null;
        object.traverse((child) => {
            if (child.isMesh && !firstMeshGeometry) {
                firstMeshGeometry = child.geometry;
            }
        });

        let firstMesh = null;
        object.traverse((child) => {
            if (child.isMesh && !firstMesh) {
                firstMesh = child; // 메시 자체를 저장
            }
        });

        if (!firstMesh) {
            console.error("No mesh found in the OBJ file.");
            return;
        }

        firstMesh.geometry.center();
        // firstMesh.geometry.scale(1.0, 1.0, 1.0); // 이제 슬라이더로 제어
        const initialScale = parseFloat(toothScaleSlider.value);
        firstMesh.scale.set(initialScale, initialScale, initialScale);

        createParticleSystem(firstMesh); // 메시 객체를 전달
        fitCameraToModel(); // 모델 로드 후 카메라를 모델에 맞게 조정
        setMode(false); // 초기 모드 설정 (애니메이션 모드로 시작)
        animate();
    });
}

// --- 파티클 시스템 생성 ---
function createParticleSystem(mesh) { // mesh 객체를 인자로 받음
    const particlesGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const targetPositions = new Float32Array(PARTICLE_COUNT * 3);
    const randomPositions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 3).fill(0);

    const sampler = new MeshSurfaceSampler(mesh).build(); // mesh 객체를 전달
    const tempPosition = new THREE.Vector3();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        sampler.sample(tempPosition);
        targetPositions[i3] = tempPosition.x;
        targetPositions[i3 + 1] = tempPosition.y;
        targetPositions[i3 + 2] = tempPosition.z;

        const radius = 30 + Math.random() * 30;
        const phi = Math.random() * Math.PI * 2;
        const theta = Math.random() * Math.PI;
        randomPositions[i3] = radius * Math.sin(theta) * Math.cos(phi);
        randomPositions[i3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
        randomPositions[i3 + 2] = radius * Math.cos(theta);
        
        // 초기 위치를 targetPositions으로 설정하여 모델이 바로 보이도록 함
        positions[i3] = targetPositions[i3];
        positions[i3+1] = targetPositions[i3+1];
        positions[i3+2] = targetPositions[i3+2];
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeometry.setAttribute('targetPosition', new THREE.BufferAttribute(targetPositions, 3));
    particlesGeometry.setAttribute('randomPosition', new THREE.BufferAttribute(randomPositions, 3));
    particlesGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    const particlesMaterial = new THREE.PointsMaterial({
        color: new THREE.Color(colorPicker.value),
        size: parseFloat(sizeSlider.value),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });

    particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);
}

// --- 애니메이션 루프 ---
function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();
    const deltaTime = clock.getDelta();

    if (isPaused || isViewerMode) {
        controls.update();
        renderer.render(scene, camera);
        return;
    }

    if (particles) {
        const progress = (Math.sin(elapsedTime * animationSpeed) + 1) / 2;
        const positions = particles.geometry.attributes.position;
        const targets = particles.geometry.attributes.targetPosition;
        const randoms = particles.geometry.attributes.randomPosition;
        const velocities = particles.geometry.attributes.velocity;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(interactionPlane);
        if (intersects.length > 0) {
            tempMousePoint.copy(intersects[0].point);
        } else {
            tempMousePoint.set(-1000, -1000, -1000);
        }

        // Declare these outside the animate function, similar to tempVec3
const tempTargetPos = new THREE.Vector3();
const tempRandomPos = new THREE.Vector3();
const tempCurrentVel = new THREE.Vector3();
const tempRepulsionForce = new THREE.Vector3();
const tempTargetForce = new THREE.Vector3();

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const currentPos = tempVec3.fromBufferAttribute(positions, i);
            tempTargetPos.fromBufferAttribute(targets, i);
            tempRandomPos.fromBufferAttribute(randoms, i);
            tempCurrentVel.fromBufferAttribute(velocities, i);

            const lerpTarget = tempTargetPos.lerpVectors(tempTargetPos, tempRandomPos, progress);

            const distance = currentPos.distanceTo(tempMousePoint);
            tempRepulsionForce.set(0, 0, 0); // Reset for each particle
            if (distance < 5) {
                const repulsionStrength = (1 - (distance / 5)) * 10;
                tempRepulsionForce.subVectors(currentPos, tempMousePoint).normalize().multiplyScalar(repulsionStrength);
            }

            tempTargetForce.subVectors(lerpTarget, currentPos).multiplyScalar(0.01);
            tempCurrentVel.add(tempTargetForce);
            tempCurrentVel.add(tempRepulsionForce.multiplyScalar(deltaTime));
            tempCurrentVel.multiplyScalar(0.94);

            currentPos.add(tempCurrentVel);

            positions.setXYZ(i, currentPos.x, currentPos.y, currentPos.z);
            velocities.setXYZ(i, tempCurrentVel.x, tempCurrentVel.y, tempCurrentVel.z);
        }
        positions.needsUpdate = true;
    }
    
    controls.update();
    renderer.render(scene, camera);
}

// --- 이벤트 핸들러 ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(event) {
    if (isViewerMode) return;
    updateMousePosition(event.clientX, event.clientY);
}

function onTouchMove(event) {
    if (isViewerMode) return;
    // 여러 터치 중 첫 번째 터치만 사용
    if (event.touches.length > 0) {
        updateMousePosition(event.touches[0].clientX, event.touches[0].clientY);
    }
}

function onTouchEnd(event) {
    // 터치가 끝나면 마우스 위치를 화면 밖으로 이동시켜 인터랙션 중지
    mouse.x = -100;
    mouse.y = -100;
}

function updateMousePosition(x, y) {
    mouse.x = (x / window.innerWidth) * 2 - 1;
    mouse.y = -(y / window.innerHeight) * 2 + 1;
}

function onMouseWheel(event) {
    if (isViewerMode) {
        event.preventDefault(); // 기본 스크롤 동작 방지

        let currentValue = parseFloat(toothScaleSlider.value);
        const step = parseFloat(toothScaleSlider.step);
        const min = parseFloat(toothScaleSlider.min);
        const max = parseFloat(toothScaleSlider.max);

        if (event.deltaY < 0) { // 휠을 위로 (확대)
            currentValue = Math.min(max, currentValue + step);
        } else { // 휠을 아래로 (축소)
            currentValue = Math.max(min, currentValue - step);
        }
        // step 단위로 정확하게 반올림
        currentValue = Math.round(currentValue / step) * step;
        toothScaleSlider.value = currentValue;
        toothScaleSlider.dispatchEvent(new Event('input')); // input 이벤트 강제 발생
    }
}

function togglePause() {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    if (!isPaused) clock.getDelta();
}

function resetAnimation() {
    clock.elapsedTime = 0;
    if (isPaused) togglePause();
}

function switchLanguage(lang) {
    if (lang === 'en') {
        manualEn.classList.remove('hidden');
        manualKo.classList.add('hidden');
        langEnBtn.classList.replace('bg-gray-600', 'bg-sky-600');
        langKoBtn.classList.replace('bg-sky-600', 'bg-gray-600');
    } else if (lang === 'ko') {
        manualKo.classList.remove('hidden');
        manualEn.classList.add('hidden');
        langKoBtn.classList.replace('bg-gray-600', 'bg-sky-600');
        langEnBtn.classList.replace('bg-sky-600', 'bg-gray-600');
    }
}

function setMode(toViewerMode) {
    isViewerMode = toViewerMode;
    const animationModeBtn = document.getElementById('animationModeBtn');
    const viewerModeBtn = document.getElementById('viewerModeBtn');
    const viewpointControls = document.getElementById('viewpointControls');

    // 기존 애니메이션 중지
    if (gsapAnimation) {
        gsapAnimation.kill();
    }

    // 모든 버튼의 색상 클래스를 초기화하는 헬퍼 함수
    const clearButtonColors = (btn) => {
        btn.classList.remove(
            'bg-green-500', 'hover:bg-green-600',
            'bg-green-700', 'hover:bg-green-800', // 추가: 초기 HTML에 있던 클래스
            'bg-blue-500', 'hover:bg-blue-600',
            'bg-blue-700', 'hover:bg-blue-800', // 추가: 초기 HTML에 있던 클래스
            'bg-gray-600', 'hover:bg-gray-700'
        );
    };

    clearButtonColors(animationModeBtn);
    clearButtonColors(viewerModeBtn);

    if (isViewerMode) {
        // 뷰어 모드 활성화
        viewerModeBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
        animationModeBtn.classList.add('bg-gray-600', 'hover:bg-gray-700'); // 비활성화 색상

        speedControl.style.display = 'none';
        actionControls.style.display = 'none';
        viewpointControls.classList.remove('hidden'); // 뷰어 모드일 때 버튼 표시
        // 뷰어 모드에서는 컨트롤 패널을 항상 보이도록
        controlsPanel.classList.remove('hidden');
        controls.autoRotate = false;

        gsapAnimation = gsap.to(particles.geometry.attributes.position.array, {
            duration: 2,
            ease: 'power3.inOut',
            endArray: particles.geometry.attributes.targetPosition.array,
            onUpdate: () => {
                particles.geometry.attributes.position.needsUpdate = true;
            }
        });

    } else {
        // 애니메이션 모드 활성화
        animationModeBtn.classList.add('bg-green-500', 'hover:bg-green-600');
        viewerModeBtn.classList.add('bg-gray-600', 'hover:bg-gray-700'); // 비활성화 색상

        speedControl.style.display = 'block';
        actionControls.style.display = 'flex';
        viewpointControls.classList.add('hidden'); // 애니메이션 모드일 때 버튼 숨김
        // 애니메이션 모드에서는 컨트롤 패널을 기본적으로 숨김 (모바일에서)
        if (window.innerWidth < 768) {
            controlsPanel.classList.add('hidden');
        }
        controls.autoRotate = true;
        // GSAP가 제어하던 파티클의 속도를 초기화하여 lerp 애니메이션이 자연스럽게 이어지도록 함
        particles.geometry.attributes.velocity.array.fill(0);
    }
}




// --- 카메라 뷰 설정 ---
function setCameraView(view) {
    if (!particles) return; // 파티클이 없으면 함수 실행 중단

    const target = new THREE.Vector3(0, 0, 0); // 모델의 중심
    let newPosition;

    const box = new THREE.Box3().setFromObject(particles);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.2; // 약간의 여백 추가

    switch (view) {
        case 'front':
            newPosition = new THREE.Vector3(0, 0, cameraZ);
            break;
        case 'side':
            newPosition = new THREE.Vector3(cameraZ, 0, 0);
            break;
        case 'top':
            newPosition = new THREE.Vector3(0, cameraZ, 0);
            break;
        case 'bottom':
            newPosition = new THREE.Vector3(0, -cameraZ, 0);
            break;
        default:
            newPosition = camera.position.clone();
    }

    gsap.to(camera.position, {
        duration: 1,
        x: newPosition.x,
        y: newPosition.y,
        z: newPosition.z,
        onUpdate: () => controls.update(),
        onComplete: () => {
            controls.target.copy(target);
            controls.update();
        }
    });
}

// --- 카메라를 모델에 맞게 조정 ---
function fitCameraToModel() {
    if (!particles) return;

    const box = new THREE.Box3().setFromObject(particles);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

    cameraZ *= 1.2; // 약간의 여백 추가

    gsap.to(camera.position, {
        duration: 1,
        x: center.x,
        y: center.y,
        z: center.z + cameraZ,
        onUpdate: () => controls.update(),
        onComplete: () => {
            controls.target.copy(center);
            controls.update();
        }
    });
}

// --- 시작 ---
init();
