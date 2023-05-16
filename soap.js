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
    material.flatShading = true;
    // Make material double sided.
    material.side = THREE.DoubleSide;
    // Apply some transparency to the material.
    // material.transparent = true;
    // material.opacity = .5;
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

    seminormalize() {
        return this;
    }    

    static noise(amount = 1) {
        return new Point3D(
            amount * (Math.random() - .5),
            amount * (Math.random() - .5),
            amount * (Math.random() - .5));
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

let pre_normalize = true;

function averageOfPoints(points, center) {
    const sum = points.reduce((sum, point) => sum.add(pre_normalize ? point.subtract(center).seminormalize() : point.subtract(center)), new Point3D(0, 0, 0));
    return center.add(sum.divide(points.length));
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

class PointFn {
    constructor(fn) {
        this.fn = fn;
    }

    apply(patch_point) {
        patch_point.setPoint(this.fn());
    }
}

function pointFn(fn) {
    return new PointFn(fn);
}

class AverageCorner {
    constructor(patch_points) {
        this.patch_points = patch_points;
    }

    apply(patch_point) {
        const points = this.patch_points.map(patch_point => patch_point.getPoint());
        const average = averageOfPoints(points, patch_point.getPoint());
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
        const point = averageOfPoints(points, patch_point.getPoint());
        const nearest = nearestPointOnSegment(point, this.segment_start, this.segment_end);
        patch_point.setPoint(nearest);
    }
}

function segmentEdge(segment_start, segment_end) {
    return new SegmentEdge(segment_start, segment_end);
}

class MirrorEdge {
    constructor(plane_point, plane_normal, neighbors, inside) {
        this.plane_point = plane_point;
        this.plane_normal = plane_normal.normalize();
        this.neighbors = neighbors;
        this.inside = inside;
    }

    apply(patch_point) {
        let points = this.neighbors.map(neighbor => neighbor.getPoint());
        const inside_point = this.inside.getPoint();
        const inside_mirror = inside_point.add(this.plane_normal.multiply(2 * (this.plane_point.subtract(inside_point).dot(this.plane_normal))));
        points.push(inside_mirror);
        points.push(inside_point);
        patch_point.setPoint(averageOfPoints(points, patch_point.getPoint()));
    }
}

function mirrorEdge(plane_point, plane_normal, neighbors, inside) {
    return new MirrorEdge(plane_point, plane_normal, neighbors, inside);
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
        this.setCondition(uv.u, uv.v, condition);
    }

    setCondition(row, column, condition) {
        this.conditions.push(make_condition(this, row, column, condition));
    }

    apply() {
        for (let x = 1; x < this.n; x++) {
            for (let y = 1; y < this.n; y++) {
                const points = [this.getPatchPoint(uv(x - 1, y)), this.getPatchPoint(uv(x + 1, y)), this.getPatchPoint(uv(x, y - 1)), this.getPatchPoint(uv(x, y + 1))];
                const actual_points = points.map(point => point.getPoint());
                const average = averageOfPoints(actual_points, this.getPatchPoint(uv(x, y)).getPoint());
                const index = (x * (this.n + 1) + y) * 3;
                this.nextArray[index] = average.x;
                this.nextArray[index + 1] = average.y;
                this.nextArray[index + 2] = average.z;
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

function cylinder(n, r1fn, r2fn, hfn) {
    const leftPatch = new Patch(n);
    const rightPatch = new Patch(n);
    const sin = Math.sin;
    const cos = Math.cos;
    const pi = Math.PI;
    for (let i = 0; i <= n; i++) {
        const ratio = i / n;
        leftPatch.setCondition(0, i, pointFn(() => p3d(r1fn() * cos(pi * ratio), r2fn() * sin(pi * ratio), hfn())));
        leftPatch.setCondition(n, i, pointFn(() => p3d(r2fn() * cos(pi * ratio), r1fn() * sin(pi * ratio), -hfn())));
        rightPatch.setCondition(0, i, pointFn(() => p3d(r1fn() * cos(pi + pi * ratio), r2fn() * sin(pi + pi * ratio), hfn())));
        rightPatch.setCondition(n, i, pointFn(() => p3d(r2fn() * cos(pi + pi * ratio), r1fn() * sin(pi + pi * ratio), -hfn())));
    }
    gluePatches(leftPatch, rightPatch, n, uv(0, n), uv(1, 0), uv(0, -1), uv(0, 0), uv(1, 0), uv(0, 1));
    gluePatches(leftPatch, rightPatch, n, uv(0, 0), uv(1, 0), uv(0, 1), uv(0, n), uv(1, 0), uv(0, -1));
    return [leftPatch, rightPatch];
}

function half_cylinder(n, rfn, hfn) {
    const leftPatch = new Patch(n);
    const rightPatch = new Patch(n);
    const sin = Math.sin;
    const cos = Math.cos;
    const pi = Math.PI;
    for (let i = 0; i <= n; i++) {
        const ratio = i / n;
        leftPatch.setCondition(0, i, pointFn(() => p3d(rfn() * cos(pi * ratio), rfn() * sin(pi * ratio), hfn())));
        rightPatch.setCondition(0, i, pointFn(() => p3d(rfn() * cos(pi + pi * ratio), rfn() * sin(pi + pi * ratio), hfn())));

        let leftNeighbors = [];
        let rightNeighbors = [];
        if (i > 0 && i < n) {
            leftNeighbors = [leftPatch.getPatchPoint(uv(n, i - 1)), leftPatch.getPatchPoint(uv(n, i + 1))];
            rightNeighbors = [rightPatch.getPatchPoint(uv(n, i - 1)), rightPatch.getPatchPoint(uv(n, i + 1))];
        }
        leftPatch.setCondition(
            n, i,
            mirrorEdge(
                p3d(0, 0, 0),
                p3d(0, 0, 1),
                leftNeighbors,
                leftPatch.getPatchPoint(uv(n - 1, i))));
        rightPatch.setCondition(
            n, i,
            mirrorEdge(
                p3d(0, 0, 0),
                p3d(0, 0, 1),
                rightNeighbors,
                rightPatch.getPatchPoint(uv(n - 1, i))));

    }
    gluePatches(leftPatch, rightPatch, n, uv(0, n), uv(1, 0), uv(0, -1), uv(0, 0), uv(1, 0), uv(0, 1));
    gluePatches(leftPatch, rightPatch, n, uv(0, 0), uv(1, 0), uv(0, 1), uv(0, n), uv(1, 0), uv(0, -1));
    return [leftPatch, rightPatch];
}

function square_pair(n) {
    const leftPatch = new Patch(n);
    const rightPatch = new Patch(n);
    for (let i = 0; i <= n; i++) {
        leftPatch.setCondition(i, 0, pointFn(() => p3d(0, i/n, 0)));
        leftPatch.setCondition(n, i, pointFn(() => p3d(i/n, 1, 0)));
        leftPatch.setCondition(i, n, pointFn(() => p3d(1, i/n, 0)));
        rightPatch.setCondition(i, 0, pointFn(() => p3d(0, 0, i/n)));
        rightPatch.setCondition(n, i, pointFn(() => p3d(i/n, 0, 1)));
        rightPatch.setCondition(i, n, pointFn(() => p3d(1, 0, i/n)));
    }
    gluePatches(leftPatch, rightPatch, n, uv(0, 0), uv(0, 1), uv(1, 0), uv(0, 0), uv(0, 1), uv(1, 0));
    return [leftPatch, rightPatch];
}

export function renderResult() {
    const cos = Math.cos;
    const sin = Math.sin;
    let t = 0;
    // const patches = half_cylinder(20, () => 1, () => .5).concat(cylinder(20, () => 1, () => 1, () => .5));
    // const patches = cylinder(20, () => 1, () => 1, () => .5);
    // const patches = half_cylinder(20, () => 1, () => .5);
    const patches = square_pair(20);
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
        t += .001;
        if (t > 0.2) pre_normalize = true;
        patches.forEach(patch => patch.apply());
        patches.forEach(patch => patch.update());
        renderer.render(scene, camera);
    };
    animate();
}

renderResult();