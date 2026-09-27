import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SnapBrick, SnapLevel } from './level';

export const BRICK_HEIGHT = 0.72;
const STUD_HEIGHT = 0.16;
const bodyCache = new Map<string, THREE.BufferGeometry>();
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const studGeometry = new THREE.CylinderGeometry(0.29, 0.29, STUD_HEIGHT, 12);

export function brickPosition(brick: SnapBrick, level: SnapLevel): THREE.Vector3 {
    const width = Math.max(...level.bricks.map(item => item.x + item.w));
    const depth = Math.max(...level.bricks.map(item => item.y + item.d));
    return new THREE.Vector3(brick.x + brick.w / 2 - width / 2,
        (brick.z + 0.5) * BRICK_HEIGHT, brick.y + brick.d / 2 - depth / 2);
}

export function brickMaterial(color: string): THREE.MeshStandardMaterial {
    let material = materialCache.get(color);
    if (!material) {
        material = new THREE.MeshStandardMaterial({ color, roughness: 0.31, metalness: 0.02 });
        materialCache.set(color, material);
    }
    return material;
}

export function brickMesh(brick: SnapBrick, color: string, ghost = false): THREE.Group {
    const group = new THREE.Group();
    group.name = brick.id;
    const key = `${brick.w}:${brick.d}`;
    let geometry = bodyCache.get(key);
    if (!geometry) {
        geometry = new RoundedBoxGeometry(brick.w - 0.045, BRICK_HEIGHT - 0.035,
            brick.d - 0.045, 2, 0.065);
        bodyCache.set(key, geometry);
    }
    const material = ghost ? new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.78,
        depthWrite: false, roughness: 0.42 }) : brickMaterial(color);
    const body = new THREE.Mesh(geometry, material);
    body.castShadow = !ghost;
    body.receiveShadow = !ghost;
    group.add(body);
    for (let x = 0; x < brick.w; x++) for (let z = 0; z < brick.d; z++) {
        const stud = new THREE.Mesh(studGeometry, material);
        stud.position.set(x + 0.5 - brick.w / 2, BRICK_HEIGHT / 2 + STUD_HEIGHT / 2 - 0.02,
            z + 0.5 - brick.d / 2);
        stud.castShadow = !ghost;
        group.add(stud);
    }
    return group;
}

export function disposeBrick(mesh: THREE.Group): void {
    const disposable = new Set<THREE.Material>();
    mesh.traverse(child => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.Material &&
            child.material.transparent) disposable.add(child.material);
    });
    for (const material of disposable) material.dispose();
    mesh.removeFromParent();
}
