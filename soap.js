import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Simple function to create a cube.
export function createCube() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshNormalMaterial();
    const cube = new THREE.Mesh(geometry, material);
    return cube;
}

// Set up a scene, camera, and renderer.
export function createScene() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    return { scene, camera, renderer };
}

// Create a 20x20 mesh.
export function createMesh() {
    const geometry = new THREE.PlaneGeometry(2, 2, 20, 20);
    // const material = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    const material = new THREE.MeshNormalMaterial();
    // Make material double sided.
    material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
}

// Make the mesh wave.
export function waveMesh(mesh, t) {
    let arr = mesh.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
        arr[i + 2] = (1 - arr[i]) * Math.sin(arr[i] * 10 + arr[i+1] * arr[i] + t) / 8;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
}

// Animate the wave.
export function animateWave(mesh, scene, camera, renderer) {
    let t = 0;
    const animate = function () {
        requestAnimationFrame(animate);
        waveMesh(mesh, t);
        t += .1;
        renderer.render(scene, camera);
    };
    animate();
}

// Add rotating with the mouse to the camera.
export function addMouseRotation(camera, renderer) {
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.enableZoom = true;
}

// Render a rotating cube.
export function renderCube() {
    const mesh = createMesh();
    waveMesh(mesh);
    const { scene, camera, renderer } = createScene();
    addMouseRotation(camera, renderer);
    addCubeToScene(mesh, scene);
    camera.position.z = 5;
    camera.position.y = 0;
    animateWave(mesh, scene, camera, renderer);
}

renderCube();