import * as THREE from 'three';

const SKIN = 0x6fa83a;
const TUNIC = 0x6b4a2b;
const LEGS = 0x4a3a2a;
const DARK = 0x231a12;
const CLUB = 0x8a6a45;
const HIT_FLASH = new THREE.Color(0xff3020);

const geometry = {
    leg: new THREE.BoxGeometry(0.14, 0.42, 0.16).translate(0, -0.21, 0),
    arm: new THREE.BoxGeometry(0.1, 0.38, 0.1).translate(0, -0.19, 0),
    body: new THREE.CylinderGeometry(0.2, 0.26, 0.46, 10),
    belt: new THREE.CylinderGeometry(0.255, 0.255, 0.06, 10),
    head: new THREE.SphereGeometry(0.21, 14, 10),
    ear: new THREE.ConeGeometry(0.06, 0.22, 6),
    eye: new THREE.SphereGeometry(0.03, 6, 4),
    nose: new THREE.ConeGeometry(0.035, 0.1, 6),
    club: new THREE.CylinderGeometry(0.05, 0.03, 0.5, 6).translate(0, -0.3, 0),
    barBack: new THREE.PlaneGeometry(0.64, 0.08),
    barFill: new THREE.PlaneGeometry(0.6, 0.05).translate(0.3, 0, 0),
};

const shared = {
    tunic: new THREE.MeshStandardMaterial({ color: TUNIC, roughness: 0.9 }),
    legs: new THREE.MeshStandardMaterial({ color: LEGS, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.6 }),
    club: new THREE.MeshStandardMaterial({ color: CLUB, roughness: 0.9 }),
    barBack: new THREE.MeshBasicMaterial({ color: 0x1b1410, depthWrite: false }),
};

/** Mesh rig for one goblin. Feet are at the origin and it faces +Z, toward the gate. */
export class GoblinRig {
    readonly root = new THREE.Group();
    private readonly hips = new THREE.Group();
    private readonly legs: THREE.Object3D[] = [];
    private readonly arms: THREE.Object3D[] = [];
    private readonly skin: THREE.MeshStandardMaterial;
    private readonly bar = new THREE.Group();
    private readonly barFill: THREE.Mesh;
    private readonly barMaterial = new THREE.MeshBasicMaterial({ color: 0x8be04e, depthWrite: false });
    private flash = 0;

    constructor() {
        this.skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8, emissive: 0x000000 });
        this.root.add(this.hips);
        for (const side of [-1, 1]) {
            const leg = new THREE.Mesh(geometry.leg, shared.legs);
            leg.position.set(side * 0.1, 0.42, 0);
            this.hips.add(leg);
            this.legs.push(leg);
        }
        const body = new THREE.Mesh(geometry.body, shared.tunic);
        body.position.y = 0.65;
        const belt = new THREE.Mesh(geometry.belt, shared.dark);
        belt.position.y = 0.48;
        const head = new THREE.Mesh(geometry.head, this.skin);
        head.position.y = 1.04;
        for (const side of [-1, 1]) {
            const ear = new THREE.Mesh(geometry.ear, this.skin);
            ear.position.set(side * 0.22, 1.08, -0.02);
            ear.rotation.z = -side * 1.25;
            const eye = new THREE.Mesh(geometry.eye, shared.dark);
            eye.position.set(side * 0.075, 1.08, 0.18);
            this.hips.add(ear, eye);

            const arm = new THREE.Group();
            arm.position.set(side * 0.29, 0.85, 0);
            const limb = new THREE.Mesh(geometry.arm, this.skin);
            arm.add(limb);
            if (side === 1) {
                const club = new THREE.Mesh(geometry.club, shared.club);
                club.position.y = -0.32;
                club.rotation.x = -Math.PI / 2;
                arm.add(club);
            }
            this.hips.add(arm);
            this.arms.push(arm);
        }
        const nose = new THREE.Mesh(geometry.nose, this.skin);
        nose.position.set(0, 1.02, 0.22);
        nose.rotation.x = Math.PI / 2;
        this.hips.add(body, belt, head, nose);
        this.hips.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });

        const back = new THREE.Mesh(geometry.barBack, shared.barBack);
        this.barFill = new THREE.Mesh(geometry.barFill, this.barMaterial);
        this.barFill.position.set(-0.3, 0, 0.001);
        back.renderOrder = 1;
        this.barFill.renderOrder = 2;
        this.bar.add(back, this.barFill);
        this.bar.position.y = 1.55;
        this.bar.visible = false;
        this.root.add(this.bar);
    }

    walk(time: number, speed: number): void {
        const swing = Math.sin(time * speed * 5.2) * 0.65;
        this.legs[0].rotation.x = swing;
        this.legs[1].rotation.x = -swing;
        this.arms[0].rotation.x = -swing * 0.8;
        this.arms[1].rotation.x = swing * 0.8 - 0.3;
        this.hips.position.y = Math.abs(Math.cos(time * speed * 5.2)) * 0.05;
        this.hips.rotation.x = 0.12;
    }

    strike(time: number): void {
        const beat = (time * 1.7) % 1;
        const raise = beat < 0.65 ? beat / 0.65 : 1 - (beat - 0.65) / 0.35;
        this.legs[0].rotation.x = 0.2;
        this.legs[1].rotation.x = -0.2;
        this.arms[0].rotation.x = -0.4;
        this.arms[1].rotation.x = -2.6 * raise - 0.5;
        this.hips.rotation.x = 0.25 - raise * 0.2;
        this.hips.position.y = 0;
    }

    /** Topples backward, then sinks out of sight. `progress` runs 0 to 1. */
    die(progress: number): void {
        const fall = Math.min(1, progress / 0.45);
        this.hips.rotation.x = -fall * fall * 1.5;
        this.hips.position.y = progress > 0.55 ? -(progress - 0.55) * 1.2 : 0;
        this.bar.visible = false;
    }

    setHealth(fraction: number): void {
        this.bar.visible = fraction < 1 && fraction > 0;
        this.barFill.scale.x = Math.max(0.001, fraction);
        this.barMaterial.color.setHex(fraction > 0.5 ? 0x8be04e : fraction > 0.25 ? 0xf2c53d : 0xe0483a);
    }

    hit(): void {
        this.flash = 1;
    }

    update(dt: number, camera: THREE.Camera): void {
        if (this.flash > 0) {
            this.flash = Math.max(0, this.flash - dt * 6);
            this.skin.emissive.copy(HIT_FLASH).multiplyScalar(this.flash * 0.9);
        }
        if (this.bar.visible) {
            this.bar.quaternion.copy(this.root.quaternion).invert().multiply(camera.quaternion);
        }
    }

    dispose(): void {
        this.skin.dispose();
        this.barMaterial.dispose();
    }
}
