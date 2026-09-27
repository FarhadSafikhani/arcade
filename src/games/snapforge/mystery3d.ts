import * as THREE from 'three';
import { brickPosition, BRICK_HEIGHT, WHEEL_RADIUS, WHEEL_CENTER_Y } from './brick3d';
import { SnapLevel } from './level';

const COLORS: Record<string, string> = {
    duck: '#ac701a', apple: '#bd4963', pineapple: '#537d43',
    'sports-car': '#c95340', castle: '#7952ad'
};

/** Seamless volumes, with a stencil rim around only the combined silhouette. */
export function mysteryModel(level: SnapLevel): THREE.Group {
    const group = new THREE.Group();
    const center = Math.max(...level.bricks.map(brick => brick.z + (brick.h ?? 1))) * BRICK_HEIGHT / 2;
    const fill = new THREE.MeshBasicMaterial({ color: COLORS[level.id] ?? '#50799c',
        stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc,
        stencilZPass: THREE.ReplaceStencilOp });
    const rim = new THREE.MeshBasicMaterial({ color: '#fff1d5', depthTest: false,
        depthWrite: false, stencilWrite: true, stencilRef: 1,
        stencilFunc: THREE.NotEqualStencilFunc });
    const glow = rim.clone();
    glow.transparent = true;
    glow.opacity = 0.16;
    for (const brick of level.bricks) {
        const geometry = brick.kind === 'wheel' ? new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.97, 24)
            : new THREE.BoxGeometry(brick.w, BRICK_HEIGHT * (brick.h ?? 1), brick.d);
        if (brick.kind === 'wheel') {
            if (brick.w > brick.d) geometry.rotateX(Math.PI / 2);
            else geometry.rotateZ(Math.PI / 2);
        }
        const position = brickPosition(brick, level);
        if (brick.kind === 'wheel') position.y += WHEEL_CENTER_Y;
        for (const [material, scale, order] of [[fill, 1, 1], [rim, 1.04, 2], [glow, 1.08, 3]] as const) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(position);
            mesh.position.y -= center;
            mesh.position.multiplyScalar(scale);
            mesh.position.y += center;
            mesh.scale.setScalar(scale);
            mesh.renderOrder = order;
            group.add(mesh);
        }
    }
    const width = Math.max(...level.bricks.map(brick => brick.x + brick.w));
    const depth = Math.max(...level.bricks.map(brick => brick.y + brick.d));
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.4, depth * 1.4),
        new THREE.ShaderMaterial({
            transparent: true, depthWrite: false,
            vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: 'varying vec2 vUv; void main() { float r = length((vUv - 0.5) * 2.0); float a = pow(max(0.0, 1.0 - r), 3.0) * 0.2; gl_FragColor = vec4(0.25, 0.16, 0.30, a); }'
        }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.5;
    group.add(shadow);
    return group;
}

export function disposeMystery(group: THREE.Group): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    group.traverse(child => {
        if (child instanceof THREE.Mesh) {
            geometries.add(child.geometry);
            materials.add(child.material as THREE.Material);
        }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    group.removeFromParent();
}
