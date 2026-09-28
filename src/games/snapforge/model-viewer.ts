import * as THREE from 'three';
import { brickMesh, brickPosition, BRICK_HEIGHT, disposeBrick } from './brick3d';
import { SnapLevel } from './level';

export function openModelViewer(level: SnapLevel): void {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.createElement('dialog');
    dialog.className = 'model-viewer';
    dialog.setAttribute('aria-label', `View ${level.title}`);
    const heading = document.createElement('h2'); heading.textContent = level.title;
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close';
    close.className = 'model-viewer-close';
    const stage = document.createElement('div'); stage.className = 'model-viewer-stage';
    stage.setAttribute('aria-label', 'Drag to rotate model');
    const hint = document.createElement('p'); hint.textContent = 'Drag to rotate';
    dialog.append(heading, close, stage, hint);
    document.body.appendChild(dialog);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    stage.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xfff9e9);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a993, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(-6, 14, 9); scene.add(sun);
    const model = new THREE.Group(); scene.add(model);
    for (const brick of level.bricks) {
        const mesh = brickMesh(brick, level.palette[brick.color]);
        mesh.position.copy(brickPosition(brick, level)); model.add(mesh);
    }
    const maxWidth = Math.max(...level.bricks.map(brick => brick.x + brick.w));
    const maxDepth = Math.max(...level.bricks.map(brick => brick.y + brick.d));
    const maxHeight = Math.max(...level.bricks.map(brick => brick.z + (brick.h ?? 1))) * BRICK_HEIGHT;
    const radius = Math.max(maxWidth, maxDepth, maxHeight * 1.6) * 1.8;
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    camera.position.set(radius * .65, radius * .62, radius * .85);
    camera.lookAt(0, maxHeight / 2, 0);
    let lastX = 0;
    let frame = 0;
    stage.addEventListener('pointerdown', event => { lastX = event.clientX; stage.setPointerCapture(event.pointerId); });
    stage.addEventListener('pointermove', event => {
        if (!stage.hasPointerCapture(event.pointerId)) return;
        model.rotation.y += (event.clientX - lastX) * .008;
        lastX = event.clientX;
    });
    const render = () => {
        const width = stage.clientWidth, height = stage.clientHeight;
        if (width && height) {
            renderer.setSize(width, height, false);
            camera.aspect = width / height; camera.updateProjectionMatrix();
            renderer.render(scene, camera);
        }
        frame = requestAnimationFrame(render);
    };
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
        cancelAnimationFrame(frame);
        for (const child of [...model.children]) disposeBrick(child as THREE.Group);
        renderer.dispose(); renderer.forceContextLoss(); dialog.remove(); previousFocus?.focus();
    }, { once: true });
    dialog.showModal(); close.focus(); render();
}
