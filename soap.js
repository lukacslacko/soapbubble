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

export function createMesh(n = 20) {
    const geometry = new THREE.PlaneGeometry(2, 2, n, n);
    const wireframeMaterial = new THREE.MeshBasicMaterial({color: 0xffffff, wireframe: true});
    const material = new THREE.MeshNormalMaterial();
    // Make material double sided.
    material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, material);
    const wireframe = new THREE.Mesh(geometry, wireframeMaterial);
    
    return {mesh, wireframe};
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

class Point3D {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    add(point) {
        return new Point3D(this.x + point.x, this.y + point.y, this.z + point.z);
    }

    subtract(point) {
        return new Point3D(this.x - point.x, this.y - point.y, this.z - point.z);
    }

    multiply(scalar) {
        return new Point3D(this.x * scalar, this.y * scalar, this.z * scalar);
    }

    divide(scalar) {
        return new Point3D(this.x / scalar, this.y / scalar, this.z / scalar);
    }

    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    normalize() {
        return this.divide(this.magnitude());
    }

    dot(point) {
        return this.x * point.x + this.y * point.y + this.z * point.z;
    }

    cross(point) {
        return new Point3D(
            this.y * point.z - this.z * point.y,
            this.z * point.x - this.x * point.z,
            this.x * point.y - this.y * point.x
        );
    }
}

function p3d(x, y, z) {
    return new Point3D(x, y, z);
}

function nearestPointOnSegment(point, segmentStart, segmentEnd) {
    const segment = segmentEnd.subtract(segmentStart);
    const segmentLength = segment.magnitude();
    const segmentDirection = segment.normalize();
    const pointVector = point.subtract(segmentStart);
    const dot = segmentDirection.dot(pointVector);
    if (dot <= 0) {
        return segmentStart;
    } else if (dot >= segmentLength) {
        return segmentEnd;
    } else {
        return segmentStart.add(segmentDirection.multiply(dot));
    }
}

function averageOfPoints(points) {
    const sum = points.reduce((sum, point) => sum.add(point), new Point3D(0, 0, 0));
    return sum.divide(points.length);
}

class FixCorner {
    constructor(point) {
        this.point = point;
    }

    apply(patch_point) {
        patch_point.setPoint(this.point);
    }
}

function fixCorner(point) {
    return new FixCorner(point);
}

class AverageCorner {
    constructor(patch_points) {
        this.patch_points = patch_points;
    }

    apply(patch_point) {
        const points = this.patch_points.map(patch_point => patch_point.getPoint());
        const average = averageOfPoints(points);
        patch_point.setPoint(average);
    }
}

class SegmentEdge {
    constructor(segment_start, segment_end) {
        this.segment_start = segment_start;
        this.segment_end = segment_end;
    }

    apply(patch_point) {
        let indices = [patch_point.index - 3, patch_point.index + 3, patch_point.index - (patch_point.patch.n + 1) * 3, patch_point.index + (patch_point.patch.n + 1) * 3];
        indices = indices.filter(index => index >= 0 && index < patch_point.patch.mesh.geometry.attributes.position.array.length);
        const points = indices.map(index => new PatchPoint(patch_point.patch, index).getPoint());
        const point = averageOfPoints(points);
        const nearest = nearestPointOnSegment(point, this.segment_start, this.segment_end);
        patch_point.setPoint(nearest);
    }
}

function segmentEdge(segment_start, segment_end) {
    return new SegmentEdge(segment_start, segment_end);
}

class Condition {
    constructor(patch_point, condition) {
        this.patch_point = patch_point;
        this.condition = condition;
    }

    apply() {
        this.condition.apply(this.patch_point);
    }

    update() {
        this.patch_point.update();
    }
}

function condition(patch, row, column, condition) {
    return new Condition(
        new PatchPoint(patch, 3* (row * (patch.mesh.geometry.parameters.widthSegments + 1) + column)), condition);
}

class Patch {
    constructor(n) {
        const {mesh, wireframe} = createMesh(n);
        this.mesh = mesh;
        this.wireframe = wireframe;
        this.n = n;
    }

    setConditions(corners, edges) {
        const n = this.n;
        this.conditions = [condition(this, 0, 0, corners[0]), condition(this, 0, n, corners[1]), condition(this, n, n, corners[2]), condition(this, n, 0, corners[3])];
        for (let i = 1; i < n; i++) {
            this.conditions.push(condition(this, 0, i, edges[0]));
            this.conditions.push(condition(this, i, n, edges[1]));
            this.conditions.push(condition(this, n, i, edges[2]));
            this.conditions.push(condition(this, i, 0, edges[3]));
        }
        this.nextArray = new Float32Array(this.mesh.geometry.attributes.position.array);
    }

    apply() {
        for (let x = 1; x < this.n; x++) {
            for (let y = 1; y < this.n; y++) {
                for (let d = 0; d < 3; d++) {
                    const index = (x * (this.n + 1) + y) * 3 + d;
                    this.nextArray[index] = (
                        this.mesh.geometry.attributes.position.array[index - 3] + 
                        this.mesh.geometry.attributes.position.array[index + 3] + 
                        this.mesh.geometry.attributes.position.array[index - (this.n + 1) * 3] + 
                        this.mesh.geometry.attributes.position.array[index + (this.n + 1) * 3]) / 4;
                }
            }
        }
        this.conditions.forEach(condition => condition.apply());
    }

    update() {
        for (let x = 1; x < this.n; x++) {
            for (let y = 1; y < this.n; y++) {
                for (let d = 0; d < 3; d++) {
                    const index = (x * (this.n + 1) + y) * 3 + d;
                    this.mesh.geometry.attributes.position.array[index] = this.nextArray[index];
                }
            }
        }
        this.conditions.forEach(condition => condition.update());
        this.mesh.geometry.attributes.position.needsUpdate = true;
        this.mesh.geometry.computeVertexNormals();
        this.wireframe.geometry.attributes.position.needsUpdate = true;
    }
}

class PatchPoint {
    constructor(patch, index) {
        this.patch = patch;
        this.index = index;
    }

    getPoint() {
        return new Point3D(
            this.patch.mesh.geometry.attributes.position.array[this.index],
            this.patch.mesh.geometry.attributes.position.array[this.index + 1],
            this.patch.mesh.geometry.attributes.position.array[this.index + 2]);
    }

    setPoint(point) {
        this.nextPoint = point;
    }

    update() {
        this.patch.mesh.geometry.attributes.position.array[this.index] = this.nextPoint.x;
        this.patch.mesh.geometry.attributes.position.array[this.index + 1] = this.nextPoint.y;
        this.patch.mesh.geometry.attributes.position.array[this.index + 2] = this.nextPoint.z;
    }
}

// Add rotating with the mouse to the camera.
export function addMouseRotation(camera, renderer) {
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.enableZoom = true;
}

export function renderResult() {
    const patch = new Patch(25);
    patch.setConditions(
        [fixCorner(p3d(-1, -1, 1)), fixCorner(p3d(-1, 1, -1)), fixCorner(p3d(1, 1, 1)), fixCorner(p3d(1, -1, -1))], 
        [
            segmentEdge(p3d(-1, -1, 1), p3d(-1, 1, -1)), 
            segmentEdge(p3d(-1, 1, -1), p3d(1, 1, 1)),
            segmentEdge(p3d(1, 1, 1), p3d(1, -1, -1)),
            segmentEdge(p3d(1, -1, -1), p3d(-1, -1, 1))
        ]);
    const { scene, camera, renderer } = createScene();
    scene.add(patch.mesh);
    scene.add(patch.wireframe);
    addMouseRotation(camera, renderer);
    camera.position.z = 5;
    camera.position.y = 0;
    // Trivial animation.
    const animate = function () {
        requestAnimationFrame(animate);
        patch.apply();
        patch.update();
        renderer.render(scene, camera);
    }
    animate();
}

renderResult();