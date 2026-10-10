import * as THREE from 'three';
import { ARROW } from './tuning';

const SHAFT = 0xc89a5e;
const HEAD = 0x5b5f66;
const FLETCH_A = 0xd7323a;
const FLETCH_B = 0xf3ece0;
const BOW_WOOD = 0x8a5a2e;
const LEATHER = 0x4e3322;
const STRING = 0xefe6d2;

const arrowParts = {
    shaft: new THREE.CylinderGeometry(0.011, 0.011, ARROW.length, 6).rotateX(Math.PI / 2).translate(0, 0, -ARROW.length / 2),
    head: new THREE.ConeGeometry(0.028, 0.09, 6).rotateX(Math.PI / 2).translate(0, 0, -0.03),
    fletch: new THREE.PlaneGeometry(0.16, 0.06).rotateY(Math.PI / 2).translate(0, 0.03, -ARROW.length + 0.1),
};
const arrowMaterials = {
    shaft: new THREE.MeshStandardMaterial({ color: SHAFT, roughness: 0.8 }),
    head: new THREE.MeshStandardMaterial({ color: HEAD, roughness: 0.4, metalness: 0.5 }),
    fletchA: new THREE.MeshStandardMaterial({ color: FLETCH_A, roughness: 0.9, side: THREE.DoubleSide }),
    fletchB: new THREE.MeshStandardMaterial({ color: FLETCH_B, roughness: 0.9, side: THREE.DoubleSide }),
};

/** Glowing heads and dyed fletching for the skill arrows, by `ArrowKind`: healing, frost, power. */
const ARROW_DYES: Record<number, { head: number; fletch: number }> = {
    1: { head: 0x7fe07a, fletch: 0x9be38a },
    2: { head: 0xaee6ff, fletch: 0xd4f1ff },
    3: { head: 0xffb347, fletch: 0xf2c53d },
};
const dyed = new Map<number, { head: THREE.Material; fletch: THREE.Material }>();

function arrowLook(kind: number): { head: THREE.Material; fletchA: THREE.Material; fletchB: THREE.Material } {
    const dye = ARROW_DYES[kind];
    if (!dye) return arrowMaterials;
    let found = dyed.get(kind);
    if (!found) {
        found = {
            head: new THREE.MeshStandardMaterial({ color: dye.head, emissive: dye.head, emissiveIntensity: 0.9, roughness: 0.4 }),
            fletch: new THREE.MeshStandardMaterial({ color: dye.fletch, emissive: dye.fletch, emissiveIntensity: 0.35, roughness: 0.9, side: THREE.DoubleSide }),
        };
        dyed.set(kind, found);
    }
    return { head: found.head, fletchA: found.fletch, fletchB: arrowMaterials.fletchB };
}

/** An arrow with its tip at the origin, pointing along +Z. `kind` dyes a skill arrow. */
export function createArrowMesh(kind = 0): THREE.Group {
    const look = arrowLook(kind);
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(arrowParts.shaft, arrowMaterials.shaft);
    const head = new THREE.Mesh(arrowParts.head, look.head);
    arrow.add(shaft, head);
    for (let index = 0; index < 3; index++) {
        const fletch = new THREE.Mesh(arrowParts.fletch, index === 0 ? look.fletchA : look.fletchB);
        fletch.rotation.z = (index / 3) * Math.PI * 2;
        arrow.add(fletch);
    }
    arrow.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });
    return arrow;
}

const REST = { position: new THREE.Vector3(0.34, -0.3, -0.9), cant: -0.45 };
const DRAWN = { position: new THREE.Vector3(0.17, -0.17, -1.0), cant: -0.22 };
const FULL_DRAW_PULL = 0.38;
const TIP = 0.62;

/** First-person bow, drawn in its own scene over the world so it never clips into walls. */
export class BowView {
    readonly scene = new THREE.Scene();
    readonly camera: THREE.PerspectiveCamera;
    private readonly bow = new THREE.Group();
    private readonly arrow: THREE.Group;
    private readonly drawHand: THREE.Mesh;
    private readonly stringPositions: THREE.BufferAttribute;
    private aim = 0;

    constructor(fov: number) {
        this.camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 10);
        this.scene.add(new THREE.HemisphereLight(0xfff6e0, 0x6f8a5a, 1.8));
        const key = new THREE.DirectionalLight(0xfff0d2, 2.2);
        key.position.set(-2, 3, 1);
        this.scene.add(key);

        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, TIP, 0.02), new THREE.Vector3(0, 0.42, -0.1), new THREE.Vector3(0, 0.18, -0.19),
            new THREE.Vector3(0, 0, -0.21), new THREE.Vector3(0, -0.18, -0.19), new THREE.Vector3(0, -0.42, -0.1),
            new THREE.Vector3(0, -TIP, 0.02),
        ]);
        const limbs = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.019, 8),
            new THREE.MeshStandardMaterial({ color: BOW_WOOD, roughness: 0.6 }));
        const leather = new THREE.MeshStandardMaterial({ color: LEATHER, roughness: 0.85 });
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.17, 0.11), leather);
        grip.position.set(0, 0, -0.2);
        this.drawHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.12), leather);

        const stringGeometry = new THREE.BufferGeometry();
        this.stringPositions = new THREE.BufferAttribute(new Float32Array(9), 3);
        stringGeometry.setAttribute('position', this.stringPositions);
        const string = new THREE.Line(stringGeometry, new THREE.LineBasicMaterial({ color: STRING }));
        string.frustumCulled = false;

        this.arrow = createArrowMesh();
        this.arrow.rotation.y = Math.PI;
        this.bow.add(limbs, grip, this.drawHand, string, this.arrow);
        this.scene.add(this.bow);
        this.update(0, true, 0, 0);
    }

    setAspect(aspect: number): void {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
    }

    /** `draw` is 0 to 1; `bob` is the walk phase in radians, 0 when standing still. */
    update(draw: number, nocked: boolean, bob: number, dt: number): void {
        const target = nocked && draw > 0 ? 1 : 0;
        this.aim += (target - this.aim) * Math.min(1, dt * 10);
        const t = dt === 0 ? target : this.aim;
        this.bow.position.lerpVectors(REST.position, DRAWN.position, t);
        this.bow.position.x += Math.sin(bob) * 0.012;
        this.bow.position.y += Math.abs(Math.cos(bob)) * 0.014;
        this.bow.rotation.set(0, 0, REST.cant + (DRAWN.cant - REST.cant) * t);

        const pull = nocked ? draw * FULL_DRAW_PULL : 0;
        const positions = this.stringPositions.array as Float32Array;
        positions.set([0, TIP, 0.02, 0, 0, pull, 0, -TIP, 0.02]);
        this.stringPositions.needsUpdate = true;
        this.arrow.visible = nocked;
        this.arrow.position.z = pull - ARROW.length;
        this.drawHand.visible = nocked;
        this.drawHand.position.set(0, -0.02, pull + 0.05);
    }

    dispose(): void {
        this.scene.traverse(child => {
            if (child instanceof THREE.Mesh || child instanceof THREE.Line) child.geometry.dispose();
        });
    }
}
