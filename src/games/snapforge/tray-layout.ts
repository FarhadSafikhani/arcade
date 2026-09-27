import * as THREE from 'three';

export interface TrayLayout { width: number; depth: number; distance: number; }

/** Fit a rectangular surface inside the perspective view, leaving room for the floating hint. */
export function trayLayout(pixelWidth: number, pixelHeight: number, minimumSpan = 8): TrayLayout {
    const aspect = Math.max(0.1, pixelWidth / Math.max(1, pixelHeight));
    let distance = Math.max(22, 29 / aspect);
    const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 200);
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ray = new THREE.Raycaster();
    const at = (x: number, y: number): THREE.Vector3 => {
        ray.setFromCamera(new THREE.Vector2(x, y), camera);
        return ray.ray.intersectPlane(ground, new THREE.Vector3())!;
    };
    const bottom = -1 + Math.min(.6, Math.max(.18, 144 / Math.max(1, pixelHeight)));
    for (;;) {
        camera.position.set(0, distance * .85, distance * .72);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        const depth = 2 * Math.min(Math.abs(at(0, .84).z), Math.abs(at(0, bottom).z)) - 1;
        const front = new THREE.Vector3(0, 0, depth / 2 + .5).project(camera);
        const width = Math.abs(at(.92, front.y).x) * 2 - 1;
        if (Math.min(width, depth) >= minimumSpan) return { width, depth, distance };
        // Exception to the baseline scale: an unusually long part must still fit between the walls.
        distance *= Math.max((minimumSpan + 1) / (width + 1), (minimumSpan + 1) / (depth + 1)) * 1.001;
    }
}

/** A rotation-independent margin keeps even long bricks inside the walls. */
export function trayPoint(layout: Pick<TrayLayout, 'width' | 'depth'>, brick: { w: number; d: number }, x: number, z: number): { x: number; z: number } {
    const margin = Math.hypot(brick.w, brick.d) / 2 + .25;
    const halfX = Math.max(0, layout.width / 2 - margin);
    const halfZ = Math.max(0, layout.depth / 2 - margin);
    return { x: Math.max(-halfX, Math.min(halfX, x)), z: Math.max(-halfZ, Math.min(halfZ, z)) };
}
