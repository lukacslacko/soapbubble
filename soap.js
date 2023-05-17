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
    scene.add(new THREE.AmbientLight(0x404040));
    let pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(25, 50, 25);
    scene.add(pointLight);
    let pointLight2 = new THREE.PointLight(0xffffff, 2);
    pointLight2.position.set(-10, -20, -25);
    scene.add(pointLight2);
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    return { scene, camera, renderer };
}

export function createMesh(n = 20) {
    const geometry = new THREE.PlaneGeometry(2, 2, n, n);
    const wireframeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    // const material = new THREE.MeshNormalMaterial();
    const randomHue = Math.random();
    const material = new THREE.MeshPhongMaterial({ color: new THREE.Color().setHSL(randomHue, 1, .5), specular: 0x111111, shininess: 200 });
    // Make material double sided.
    material.side = THREE.DoubleSide;
    material.flatShading = true;
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

    get_dilation() {
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

function averageOfPoints(points, center) {
    const sum = points.reduce((sum, point) => sum.add(point.subtract(center).get_dilation()), new Point3D(0, 0, 0));
    return center.add(sum.divide(points.length));
}

function fourPointApproximation(pair1, pair2) {
    const len1 = pair1[0].subtract(pair1[1]).magnitude();
    const len2 = pair2[0].subtract(pair2[1]).magnitude();
    const ratio = len1 / (len1 + len2);
    return between(between(pair1[0], pair1[1], .5), between(pair2[0], pair2[1], .5), ratio);
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
        const pair1 = this.neighbors.map(neighbor => neighbor.getPoint());
        const inside_point = this.inside.getPoint();
        const inside_mirror = inside_point.add(this.plane_normal.multiply(2 * (this.plane_point.subtract(inside_point).dot(this.plane_normal))));
        const pair2 = [inside_point, inside_mirror];
        if (pair1.length == 2 && pair2.length == 2) {
            patch_point.setPoint(fourPointApproximation(pair1, pair2));
        } else {
            patch_point.setPoint(averageOfPoints(pair1.concat(pair2), patch_point.getPoint()));
        }
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
    constructor(n, estimate = p3d(0, 0, 0)) {
        const { mesh, wireframe } = createMesh(n);
        this.mesh = mesh;
        this.wireframe = wireframe;
        this.n = n;
        this.nextArray = new Float32Array(this.mesh.geometry.attributes.position.array);
        this.conditions = [];
        for (let x = 0; x < this.n; x++) {
            for (let y = 0; y < this.n; y++) {
                const index = (x * (this.n + 1) + y) * 3;
                this.mesh.geometry.attributes.position.array[index] = x/n + estimate.x;
                this.mesh.geometry.attributes.position.array[index + 1] = y/n + estimate.y;
                this.mesh.geometry.attributes.position.array[index + 2] = estimate.z;
            }
        }
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
                const pair1 = [this.getPatchPoint(uv(x - 1, y)).getPoint(), this.getPatchPoint(uv(x + 1, y)).getPoint()];
                const pair2 = [this.getPatchPoint(uv(x, y - 1)).getPoint(), this.getPatchPoint(uv(x, y + 1)).getPoint()];
                const average = fourPointApproximation(pair1, pair2);
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
        return new PatchPoint(this, 3 * (row * (this.mesh.geometry.parameters.widthSegments + 1) + column), uv);
    }
}

class PatchPoint {
    constructor(patch, index, uv) {
        this.patch = patch;
        this.index = index;
        this.uv = uv;
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

function quad_cylinder(n, r1fn, r2fn, hfn) {
    const patches = [new Patch(n), new Patch(n), new Patch(n), new Patch(n)];
    const sin = Math.sin;
    const cos = Math.cos;
    const pi = Math.PI;
    for (let idx = 0; idx < 4; idx++) {
        const next = (idx+1) % 4;
        const leftPatch = patches[idx];
        const rightPatch = patches[next];
        const angle = pi * idx / 2;
        for (let i = 0; i <= n; i++) {
            const ratio = i / n;
            leftPatch.setCondition(i, 0, pointFn(() => p3d(2 + r1fn() * cos(angle + pi/2 * ratio), r2fn() * sin(angle + pi/2 * ratio), hfn())));
            leftPatch.setCondition(i, n, pointFn(() => p3d(2 + r2fn() * cos(angle + pi/2 * ratio), r1fn() * sin(angle + pi/2 * ratio), -hfn())));
        }
        gluePatchEdges(leftPatch, RIGHT, rightPatch, LEFT);
    }
    return patches;
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

const TOP = 0;
const BOTTOM = 1;
const LEFT = 2;
const RIGHT = 3;

function gluePatchEdges(patch1, edge1, patch2, edge2) {
    const n = patch1.n;
    const glue_params = {
        [TOP]: {start: uv(0, n), dir: uv(1, 0), ortho: uv(0, -1)},
        [BOTTOM]: {start: uv(0, 0), dir: uv(1, 0), ortho: uv(0, 1)},
        [LEFT]: {start: uv(0, 0), dir: uv(0, 1), ortho: uv(1, 0)},
        [RIGHT]: {start: uv(n, 0), dir: uv(0, 1), ortho: uv(-1, 0)},
    };
    const glue1 = glue_params[edge1];
    const glue2 = glue_params[edge2];
    gluePatches(patch1, patch2, n, glue1.start, glue1.dir, glue1.ortho, glue2.start, glue2.dir, glue2.ortho);
}

function gluePatchCorners(corners) {
    const n = corners[0][0].n;
    const cornerUVs = {
        [[TOP, LEFT]]: uv(0, n),
        [[TOP, RIGHT]]: uv(n, n),
        [[BOTTOM, LEFT]]: uv(0, 0),
        [[BOTTOM, RIGHT]]: uv(n, 0),
    };
    const neighborUVs = {
        [[TOP, LEFT]]: [uv(0, n - 1), uv(1, n)],
        [[TOP, RIGHT]]: [uv(n - 1, n), uv(n, n - 1)],
        [[BOTTOM, LEFT]]: [uv(0, 1), uv(1, 0)],
        [[BOTTOM, RIGHT]]: [uv(n - 1, 0), uv(n, 1)],
    }
    let corner_patch_points = corners.map(([patch, one, two]) => patch.getPatchPoint(cornerUVs[[one, two]]));
    let neighbor_patch_points = [];
    for (let [patch, one, two] of corners) {
        neighbor_patch_points = neighbor_patch_points.concat(neighborUVs[[one, two]].map(uv => patch.getPatchPoint(uv)));
    }
    for (let patch_point of corner_patch_points) {
        patch_point.patch.setConditionUV(patch_point.uv, new AverageCorner(neighbor_patch_points));
    }
}

function fixPatchEdge(patch, edge, start, end) {
    const n = patch.n;
    const fix_params = {
        [TOP]: {start: uv(0, n), dir: uv(1, 0)},
        [BOTTOM]: {start: uv(0, 0), dir: uv(1, 0)},
        [LEFT]: {start: uv(0, 0), dir: uv(0, 1)},
        [RIGHT]: {start: uv(n, 0), dir: uv(0, 1)},
    };
    const fix = fix_params[edge];
    for (let i = 0; i <= n; i++) {
        const here = fix.start.add(fix.dir.scalar(i));
        patch.setConditionUV(here, pointFn(() => between(start(), end(), i/n)));
    }
}

let t = 0;

function square_trio(n) {
    const A = () => p3d(0, 0, 0);
    const B = () => p3d(1, 0, 0);
    const C = () => p3d(1, 1, 0);
    const D = () => p3d(0, 1, 0);
    // const E = () => p3d(0, 0, 1 + 0.2 * Math.sin(t * 50));
    // const F = () => p3d(1, 0, 1 + 0.2 * Math.cos(t * 50));
    const E = () => p3d(0, 0, 1);
    const F = () => p3d(1, 0, 1);
    const G = () => p3d(1, 1, 1);
    const H = () => p3d(0, 1, 1);

    const bottom = new Patch(n);
    const right = new Patch(n);
    const top = new Patch(n);

    fixPatchEdge(bottom, BOTTOM, A, B);
    fixPatchEdge(bottom, LEFT, A, D);
    fixPatchEdge(bottom, TOP, D, C);

    gluePatchEdges(bottom, RIGHT, right, BOTTOM);

    fixPatchEdge(right, LEFT, B, F);
    fixPatchEdge(right, RIGHT, C, G);

    gluePatchEdges(right, TOP, top, RIGHT);

    fixPatchEdge(top, BOTTOM, E, F);
    fixPatchEdge(top, LEFT, E, H);
    fixPatchEdge(top, TOP, H, G);

    return [bottom, right, top];
}

function scherk(n, floors, a) {
    let patches = [];
    for (let floor = 0; floor < floors; floor++) {
        const A = () => p3d(0, -a, floor);
        const B = () => p3d(a, 0, floor);
        const C = () => p3d(0, a, floor);
        const D = () => p3d(-a, 0, floor);

        const P = () => p3d(0, 0, floor);

        const E = () => p3d(0, -a, floor + 1);
        const F = () => p3d(a, 0, floor + 1);
        const G = () => p3d(0, a, floor + 1);
        const H = () => p3d(-a, 0, floor + 1);

        const Q = () => p3d(0, 0, floor + 1);

        const patchA = new Patch(n, P());
        const patchB = new Patch(n, P());
        const patchC = new Patch(n, P());
        const patchD = new Patch(n, P());

        patches.push(patchA);
        patches.push(patchB);
        patches.push(patchC);
        patches.push(patchD);

        fixPatchEdge(patchA, LEFT, A, E);
        fixPatchEdge(patchB, LEFT, B, F);
        fixPatchEdge(patchC, LEFT, C, G);
        fixPatchEdge(patchD, LEFT, D, H);

        if (floor == 0) {
            fixPatchEdge(patchA, BOTTOM, A, P);
            fixPatchEdge(patchB, BOTTOM, B, P);
            fixPatchEdge(patchC, BOTTOM, C, P);
            fixPatchEdge(patchD, BOTTOM, D, P);
        } else {
            gluePatchEdges(patchA, BOTTOM, patches[patches.length - 8], TOP);
            gluePatchEdges(patchB, BOTTOM, patches[patches.length - 7], TOP);
            gluePatchEdges(patchC, BOTTOM, patches[patches.length - 6], TOP);
            gluePatchEdges(patchD, BOTTOM, patches[patches.length - 5], TOP);
            gluePatchCorners([
                [patchA, BOTTOM, RIGHT], [patchB, BOTTOM, RIGHT], [patchC, BOTTOM, RIGHT], [patchD, BOTTOM, RIGHT],
                [patches[patches.length - 8], TOP, RIGHT], [patches[patches.length - 7], TOP, RIGHT], [patches[patches.length - 6], TOP, RIGHT], [patches[patches.length - 5], TOP, RIGHT]
            ]);
        }

        if (floor == floors - 1) {
            fixPatchEdge(patchA, TOP, E, Q);
            fixPatchEdge(patchB, TOP, F, Q);
            fixPatchEdge(patchC, TOP, G, Q);
            fixPatchEdge(patchD, TOP, H, Q);
        }

        if (floor % 2 == 0) {
            gluePatchEdges(patchA, RIGHT, patchB, RIGHT);
            gluePatchEdges(patchC, RIGHT, patchD, RIGHT);
        } else {
            gluePatchEdges(patchA, RIGHT, patchD, RIGHT);
            gluePatchEdges(patchB, RIGHT, patchC, RIGHT);
        }
    }

    return patches;
}

/*

function squarePatch(x, y, z) {
    // TODO: Implement this.
    // Create a logical square patch with the center at 1/2 * (x,y,z).
    // These square patches will be turned into real patches by glueSquarePatches.
}

function glueSquarePatches(square_patches, n) {
    // TODO: Implement this.
    // Create a patch for each square patch and
    // 1) fix their edges if they are on the boundary
    // 2) glue them together if they are adjacent
    // 3) glue their corners together if they are adjacent.
}

function scherk_doubly(n, a, b) {
    let square_patches = []
    for (let x = 0; x < a; x++) {
        for (let y = 0; y < b; y++) {
            if (x % 2 == 0) {
                square_patches.push(squarePatch(2*x, 2*y+1, -1));
            }
            if (y % 2 == 0) {
                square_patches.push(squarePatch(2*x+1, 2*y, -1));
            }
            if (x+y % 2 == 0) {
                square_patches.push(squarePatch(2*x+1, 2*y+1, 0));
            }
        }   
    }
    return glueSquarePatches(square_patches, n);
}
*/

export function renderResult() {
    const cos = Math.cos;
    const sin = Math.sin;
    const patches = quad_cylinder(20, () => 1, () => 1, () => .5).concat(cylinder(20, () => 1, () => 1, () => .5));
    // const patches = cylinder(20, () => 1, () => 1, () => 1 + 0.5 * sin(t*20));
    // const patches = half_cylinder(20, () => 1, () => .5);
    // const patches = square_trio(20);
    // const patches = scherk(20, 6, 2);
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
        patches.forEach(patch => patch.apply());
        patches.forEach(patch => patch.update());
        renderer.render(scene, camera);
    };
    animate();
}

renderResult();