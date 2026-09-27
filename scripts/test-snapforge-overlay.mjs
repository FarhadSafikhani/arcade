import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';

const source = readFileSync(new URL('../src/games/snapforge/overlay3d.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
}).outputText.replace("from 'three'", `from '${import.meta.resolve('three')}'`);
const { configureOverlayCamera, overlayRotation, overlayToScreen, screenToOverlay } =
    await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function viewCamera(yaw, elevation) {
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    camera.position.set(Math.sin(yaw) * 25, elevation * 25, Math.cos(yaw) * 25);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    return camera;
}

function topFaceArea(rotation, camera, position = new THREE.Vector3(), scale = 1) {
    // Counterclockwise top-face triangle, viewed from above the brick.
    const points = [[-1, 0.36, 1], [1, 0.36, 1], [1, 0.36, -1]].map(coords =>
        new THREE.Vector3(...coords).applyQuaternion(rotation).multiplyScalar(scale).add(position).project(camera));
    const [a, b, c] = points;
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

test('overlay preserves pointer coordinates after viewport resizing', () => {
    const camera = new THREE.OrthographicCamera();
    for (const [width, height] of [[1295, 1272], [390, 844]]) {
        configureOverlayCamera(camera, width, height);
        for (const [x, y] of [[0, 0], [width / 2, height / 2], [width - 10, height - 20]]) {
            const position = screenToOverlay(x, y, height);
            const projected = position.clone().project(camera);
            assert.ok(Math.abs((projected.x + 1) * width / 2 - x) < 1e-8);
            assert.ok(Math.abs((1 - projected.y) * height / 2 - y) < 1e-8);
            assert.deepEqual(overlayToScreen(position, height).toArray(), [x, y]);
        }
    }
});

test('pickup preserves the visible top face instead of mirroring it into a culled back face', () => {
    const pileCamera = viewCamera(0, 0.85 / 0.72);
    const overlayCamera = new THREE.OrthographicCamera();
    configureOverlayCamera(overlayCamera, 1200, 900);
    const position = screenToOverlay(900, 400, 900);
    for (const yaw of [0, 0.8, 2.6, 4.4]) {
        const pilePose = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        const heldPose = overlayRotation(pileCamera, pilePose);
        assert.ok(topFaceArea(pilePose, pileCamera) > 0, 'pile top face is visible');
        assert.ok(topFaceArea(heldPose, overlayCamera, position, 24) > 0, 'held top face must remain visible');
        const base = new THREE.Vector3(0, 0.36, 0).applyQuaternion(heldPose).multiplyScalar(24).add(position).project(overlayCamera);
        const stud = new THREE.Vector3(0, 0.50, 0).applyQuaternion(heldPose).multiplyScalar(24).add(position).project(overlayCamera);
        assert.ok(stud.y > base.y, 'studs must project above the body');
    }
});

test('the top face stays visible throughout the held turn and at all four model views', () => {
    const overlayCamera = new THREE.OrthographicCamera();
    configureOverlayCamera(overlayCamera, 1200, 900);
    const pileCamera = viewCamera(0, 0.85 / 0.72);
    for (const pileYaw of [0, 0.8, 2.6, 4.4]) {
        const from = overlayRotation(pileCamera,
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pileYaw));
        for (const modelYaw of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
            for (const quarterTurn of [0, Math.PI / 2]) {
                const to = overlayRotation(viewCamera(modelYaw, 0.62),
                    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), quarterTurn));
                for (const time of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
                    const eased = time * time * (3 - 2 * time);
                    const pose = from.clone().slerp(to, eased);
                    assert.ok(topFaceArea(pose, overlayCamera, screenToOverlay(700, 400, 900), 24) > 0,
                        `top face flipped at time ${time}, pile yaw ${pileYaw}, model yaw ${modelYaw}`);
                }
            }
        }
    }
});
