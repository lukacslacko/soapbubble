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
    const wireframeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    const material = new THREE.MeshNormalMaterial();
    // Make material double sided.
    material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, material);
    const wireframe = new THREE.Mesh(geometry, wireframeMaterial);

    return { mesh, wireframe };
}

// Make the mesh wave.
export function waveMesh(mesh, t) {
    let arr = mesh.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
        arr[i + 2] = (1 - arr[i]) * Math.sin(arr[i] * 10 + arr[i + 1] * arr[i] + t) / 8;
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

function between(P, Q, ratio) {
    return P.add(Q.subtract(P).multiply(ratio));
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

function make_condition(patch, row, column, condition) {
    return new Condition(
        new PatchPoint(patch, 3 * (row * (patch.mesh.geometry.parameters.widthSegments + 1) + column)), condition);
}

class Patch {
    constructor(n) {
        const { mesh, wireframe } = createMesh(n);
        this.mesh = mesh;
        this.wireframe = wireframe;
        this.n = n;
        this.nextArray = new Float32Array(this.mesh.geometry.attributes.position.array);
        this.conditions = [];
    }

    setConditionUV(uv, condition) {
        console.log("Set condition", uv.u, uv.v, condition);
        this.setCondition(uv.u, uv.v, condition);
    }

    setCondition(row, column, condition) {
        this.conditions.push(make_condition(this, row, column, condition));
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

    getPatchPoint(uv) {
        const row = uv.u;
        const column = uv.v;
        return new PatchPoint(this, 3 * (row * (this.mesh.geometry.parameters.widthSegments + 1) + column));
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

function hyperboloid(n) {
    const patch = new Patch(n);
    const A = p3d(-1, -1, 1);
    const B = p3d(-1, 1, -1);
    const C = p3d(1, 1, 1);
    const D = p3d(1, -1, -1);
    for (let i = 0; i <= n; i++) {
        const ratio = i / n;
        patch.setCondition(0, i, fixCorner(between(A, B, ratio)));
        patch.setCondition(i, n, fixCorner(between(B, C, ratio)));
        patch.setCondition(n, n - i, fixCorner(between(C, D, ratio)));
        patch.setCondition(n - i, 0, fixCorner(between(D, A, ratio)));
    }
    return [patch];
}

class UV {
    constructor(u, v) {
        this.u = u;
        this.v = v;
    }

    add(uv) {
        return new UV(this.u + uv.u, this.v + uv.v);
    }

    sub(uv) {
        return new UV(this.u - uv.u, this.v - uv.v);
    }

    scalar(scalar) {
        return new UV(this.u * scalar, this.v * scalar);
    }
}

function uv(u, v) {
    return new UV(u, v);
}

function gluePatches(leftPatch, rightPatch, n, leftStart, leftDir, leftOrtho, rightStart, rightDir, rightOrtho) {
    for (let i = 1; i < n; i++) {
        const leftHere = leftStart.add(leftDir.scalar(i));
        const leftInside = leftHere.add(leftOrtho);
        const rightHere = rightStart.add(rightDir.scalar(i));
        const rightInside = rightHere.add(rightOrtho);
        const corner = new AverageCorner([
            leftPatch.getPatchPoint(leftHere.add(leftDir)), 
            leftPatch.getPatchPoint(leftHere.sub(leftDir)),
            leftPatch.getPatchPoint(leftInside),
            rightPatch.getPatchPoint(rightInside)]);
        leftPatch.setConditionUV(leftHere, corner);
        rightPatch.setConditionUV(rightHere, corner);
    }
}

function cylinder(n, r, h) {
    const leftPatch = new Patch(n);
    const rightPatch = new Patch(n);
    const sin = Math.sin;
    const cos = Math.cos;
    const pi = Math.PI;
    for (let i = 0; i <= n; i++) {
        const ratio = i / n;
        leftPatch.setCondition(0, i, fixCorner(p3d(r * cos(pi * ratio), r * sin(pi * ratio), h)));
        leftPatch.setCondition(n, i, fixCorner(p3d(r * cos(pi * ratio), r * sin(pi * ratio), -h)));
        rightPatch.setCondition(0, i, fixCorner(p3d(r * cos(pi + pi * ratio), r * sin(pi + pi * ratio), h)));
        rightPatch.setCondition(n, i, fixCorner(p3d(r * cos(pi + pi * ratio), r * sin(pi + pi * ratio), -h)));
    }
    gluePatches(leftPatch, rightPatch, n, uv(0, n), uv(1, 0), uv(0, -1), uv(0, 0), uv(1, 0), uv(0, 1));
    gluePatches(leftPatch, rightPatch, n, uv(0, 0), uv(1, 0), uv(0, 1), uv(0, n), uv(1, 0), uv(0, -1));
    return [leftPatch, rightPatch];
}

export function renderResult() {
    const patches = cylinder(20, 1, 1);
    const { scene, camera, renderer } = createScene();
    patches.forEach(patch => {
        scene.add(patch.mesh);
        // scene.add(patch.wireframe);
    });
    addMouseRotation(camera, renderer);
    camera.position.z = 5;
    camera.position.y = 0;
    // Trivial animation.
    const animate = function () {
        requestAnimationFrame(animate);
        patches.forEach(patch => patch.apply());
        patches.forEach(patch => patch.update());
        renderer.render(scene, camera);
    };
    animate();
}

renderResult();