import * as THREE from 'three';

const overlayBounds = new THREE.Box3();

export function fitOverlayDepth(camera: THREE.OrthographicCamera, scene: THREE.Object3D): void {
    overlayBounds.setFromObject(scene);
    if (overlayBounds.isEmpty()) return;

    // This camera faces straight down -Z. Moving it along Z leaves the
    // orthographic screen size and pointer alignment unchanged.
    const z = Math.max(50, overlayBounds.max.z + 1);
    const far = Math.max(100, z - overlayBounds.min.z + 1);
    if (camera.position.z === z && camera.near === 0.1 && camera.far === far) return;
    camera.position.z = z;
    camera.near = 0.1;
    camera.far = far;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
}

export function configureOverlayCamera(camera: THREE.OrthographicCamera, width: number, height: number): void {
    camera.left = 0; camera.right = width;
    // Keep a normal 3D projection: reversing top/bottom also reverses face winding.
    camera.top = height; camera.bottom = 0;
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
}

export function screenToOverlay(x: number, y: number, height: number): THREE.Vector3 {
    return new THREE.Vector3(x, height - y, 10);
}

export function overlayToScreen(position: THREE.Vector3, height: number): THREE.Vector2 {
    return new THREE.Vector2(position.x, height - position.y);
}

export function overlayRotation(camera: THREE.Camera, worldRotation = new THREE.Quaternion()): THREE.Quaternion {
    return camera.quaternion.clone().invert().multiply(worldRotation);
}
