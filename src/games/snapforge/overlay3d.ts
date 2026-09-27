import * as THREE from 'three';

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
