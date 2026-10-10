import * as THREE from 'three';
import { ARCHER_COLORS } from './tuning';

const SKIN = 0xe9c29a;
const LEATHER = 0x5a3a24;
const BOW_WOOD = 0x8a5a2e;

const geometry = {
    leg: new THREE.BoxGeometry(0.15, 0.8, 0.18).translate(0, -0.4, 0),
    body: new THREE.CylinderGeometry(0.22, 0.3, 0.7, 12),
    head: new THREE.SphereGeometry(0.17, 14, 10),
    hood: new THREE.ConeGeometry(0.22, 0.34, 12),
    arm: new THREE.BoxGeometry(0.1, 0.55, 0.1).translate(0, -0.27, 0),
    bow: new THREE.TorusGeometry(0.55, 0.025, 6, 20, Math.PI * 0.9).rotateZ(Math.PI * 0.55),
};

const shared = new Map<number, THREE.MeshStandardMaterial>();
function paint(color: number): THREE.MeshStandardMaterial {
    let found = shared.get(color);
    if (!found) {
        found = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
        shared.set(color, found);
    }
    return found;
}

/** Another archer on the wall, seen in third person. Feet at the origin, facing -Z at zero yaw. */
export class ArcherRig {
    readonly root = new THREE.Group();
    private readonly torso = new THREE.Group();
    private readonly head = new THREE.Group();
    private readonly bowArm = new THREE.Group();
    private readonly drawArm = new THREE.Group();
    private readonly legs: THREE.Object3D[] = [];
    private readonly label: THREE.Sprite;
    private stride = 0;

    constructor(name: string, slot: number) {
        const cloak = paint(ARCHER_COLORS[slot % ARCHER_COLORS.length]);
        for (const side of [-1, 1]) {
            const leg = new THREE.Mesh(geometry.leg, paint(LEATHER));
            leg.position.set(side * 0.11, 0.8, 0);
            this.root.add(leg);
            this.legs.push(leg);
        }
        this.torso.position.y = 0.8;
        this.root.add(this.torso);
        const body = new THREE.Mesh(geometry.body, cloak);
        body.position.y = 0.35;
        this.torso.add(body);

        this.head.position.y = 0.86;
        this.torso.add(this.head);
        this.head.add(new THREE.Mesh(geometry.head, paint(SKIN)));
        const hood = new THREE.Mesh(geometry.hood, cloak);
        hood.position.y = 0.12;
        this.head.add(hood);

        this.bowArm.position.set(-0.28, 0.62, 0);
        this.drawArm.position.set(0.28, 0.62, 0);
        this.torso.add(this.bowArm, this.drawArm);
        this.bowArm.add(new THREE.Mesh(geometry.arm, cloak));
        this.drawArm.add(new THREE.Mesh(geometry.arm, cloak));
        const bow = new THREE.Mesh(geometry.bow, paint(BOW_WOOD));
        bow.position.set(0, -0.55, 0);
        bow.rotation.y = Math.PI / 2;
        this.bowArm.add(bow);

        this.label = nameTag(name, cloak.color);
        this.label.position.y = 2.15;
        this.root.add(this.label);
        this.root.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });
    }

    /** Places the archer. `lean` is how far the eye sits ahead of the feet, so the body bends over the wall. */
    pose(x: number, y: number, z: number, yaw: number, pitch: number, draw: number, lean: number, moved: number): void {
        this.root.position.set(x, y, z);
        this.root.rotation.y = yaw;
        this.torso.rotation.x = -Math.min(0.9, lean * 0.55);
        this.head.rotation.x = pitch * 0.6;
        // Bow arm points along the aim; the draw arm pulls back toward the cheek.
        this.bowArm.rotation.set(Math.PI / 2 + pitch, 0, 0);
        this.drawArm.rotation.set(Math.PI / 2 + pitch - 0.2 - draw * 0.5, 0, -0.5 - draw * 0.6);
        this.stride += moved * 5;
        const swing = moved > 0.0005 ? Math.sin(this.stride) * 0.5 : 0;
        this.legs[0].rotation.x = swing;
        this.legs[1].rotation.x = -swing;
    }

    dispose(): void {
        (this.label.material as THREE.SpriteMaterial).map?.dispose();
        this.label.material.dispose();
    }
}

function nameTag(text: string, color: THREE.Color): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context) {
        context.font = '700 30px Cinzel, Georgia, serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.lineWidth = 6;
        context.strokeStyle = '#1c120a';
        context.strokeText(text, 128, 32);
        context.fillStyle = `#${color.getHexString()}`;
        context.fillText(text, 128, 32);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, transparent: true }));
    sprite.scale.set(1.6, 0.4, 1);
    return sprite;
}
