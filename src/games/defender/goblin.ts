import * as THREE from 'three';
import type { EnemyId, EnemyKind } from './tuning';

const HIT_FLASH = new THREE.Color(0xff3020);
const BLOCK_FLASH = new THREE.Color(0xd7e4ef);
const CHILL_TINT = new THREE.Color(0x8fd0ff);
const FROZEN_TINT = new THREE.Color(0xd4f1ff);
const BLEED_GLOW = new THREE.Color(0x9a1010);
const MARK_GLOW = new THREE.Color(0xe0457b);

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
    hammer: new THREE.BoxGeometry(0.28, 0.16, 0.16),
    staff: new THREE.CylinderGeometry(0.035, 0.045, 0.95, 6).translate(0, -0.15, 0),
    orb: new THREE.SphereGeometry(0.09, 10, 8),
    shield: new THREE.BoxGeometry(0.52, 0.78, 0.08),
    shieldRim: new THREE.BoxGeometry(0.6, 0.86, 0.04),
    helm: new THREE.BoxGeometry(0.28, 0.16, 0.3),
    horn: new THREE.ConeGeometry(0.05, 0.22, 5),
    barBack: new THREE.PlaneGeometry(0.64, 0.08),
    barFill: new THREE.PlaneGeometry(0.6, 0.05).translate(0.3, 0, 0),
    ring: new THREE.RingGeometry(0.34, 0.48, 20),
};

const shared = new Map<string, THREE.Material>();
function paint(color: number, roughness = 0.88): THREE.MeshStandardMaterial {
    const key = `${color}:${roughness}`;
    let found = shared.get(key);
    if (!found) {
        found = new THREE.MeshStandardMaterial({ color, roughness });
        shared.set(key, found);
    }
    return found as THREE.MeshStandardMaterial;
}

const orbGlow = new THREE.MeshBasicMaterial({ color: 0xffb15a });
const dark = paint(0x231a12, 0.6);
const iron = paint(0x5c6168, 0.45);
const wood = paint(0x8a6a45, 0.9);
const barBack = new THREE.MeshBasicMaterial({ color: 0x1b1410, depthWrite: false });

const LOOK: Record<EnemyId, { skin: number; cloth: number; legs: number }> = {
    goblin: { skin: 0x6fa83a, cloth: 0x6b4a2b, legs: 0x4a3a2a },
    runner: { skin: 0xb6d84a, cloth: 0xc47a2a, legs: 0x5a6a28 },
    brute: { skin: 0x4f7a32, cloth: 0x5a4632, legs: 0x3a3228 },
    shield: { skin: 0x7fb24a, cloth: 0x4e5a3a, legs: 0x3e3428 },
    caster: { skin: 0x8fbf6a, cloth: 0x1c6e78, legs: 0x145056 },
};

/** One foe. Feet at the origin, chest toward +Z, the gate. */
export class EnemyRig {
    readonly root = new THREE.Group();
    readonly style: EnemyId;
    private readonly hips = new THREE.Group();
    private readonly legs: THREE.Object3D[] = [];
    private readonly arms: THREE.Object3D[] = [];
    private readonly skin: THREE.MeshStandardMaterial;
    private readonly shieldFace: THREE.MeshStandardMaterial | null = null;
    private readonly bar = new THREE.Group();
    private readonly barFill: THREE.Mesh;
    private readonly barMaterial = new THREE.MeshBasicMaterial({ color: 0x8be04e, depthWrite: false });
    private readonly ring: THREE.Mesh | null = null;
    private readonly ringMaterial: THREE.MeshBasicMaterial | null = null;
    private flash = 0;
    private blockFlash = 0;
    private readonly skinColor = new THREE.Color();
    private chilled = false;
    private frozen = false;
    private bleeding = false;
    private marked = false;
    private pulse = 0;

    constructor(kind: EnemyKind) {
        this.style = kind.id;
        const look = LOOK[kind.id];
        this.skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.8, emissive: 0x000000 });
        this.skinColor.setHex(look.skin);
        const cloth = paint(look.cloth);
        const legs = paint(look.legs);
        this.root.add(this.hips);
        for (const side of [-1, 1]) {
            const leg = new THREE.Mesh(geometry.leg, legs);
            leg.position.set(side * 0.1, 0.42, 0);
            this.hips.add(leg);
            this.legs.push(leg);
        }
        const body = new THREE.Mesh(geometry.body, cloth);
        body.position.y = 0.65;
        if (kind.id === 'brute') body.scale.set(1.35, 1.15, 1.2);
        if (kind.id === 'runner') body.scale.set(0.82, 1.05, 0.82);
        if (kind.id === 'caster') body.scale.set(1.15, 1.25, 1.05);
        const belt = new THREE.Mesh(geometry.belt, dark);
        belt.position.y = 0.48;
        const head = new THREE.Mesh(geometry.head, this.skin);
        head.position.y = 1.04;
        for (const side of [-1, 1]) {
            const ear = new THREE.Mesh(geometry.ear, this.skin);
            ear.position.set(side * 0.22, 1.08, -0.02);
            ear.rotation.z = -side * 1.25;
            if (kind.id === 'runner') ear.scale.set(1, 1.45, 1);
            const eye = new THREE.Mesh(geometry.eye, dark);
            eye.position.set(side * 0.075, 1.08, 0.18);
            this.hips.add(ear, eye);
            const arm = new THREE.Group();
            arm.position.set(side * 0.29, 0.85, 0);
            arm.add(new THREE.Mesh(geometry.arm, this.skin));
            this.hips.add(arm);
            this.arms.push(arm);
        }
        this.armWeapon(kind.id);
        const nose = new THREE.Mesh(geometry.nose, this.skin);
        nose.position.set(0, 1.02, 0.22);
        nose.rotation.x = Math.PI / 2;
        this.hips.add(body, belt, head, nose);
        if (kind.id === 'brute') {
            for (const side of [-1, 1]) {
                const horn = new THREE.Mesh(geometry.horn, this.skin);
                horn.position.set(side * 0.1, 1.28, 0.02);
                horn.rotation.z = -side * 0.4;
                this.hips.add(horn);
            }
        }
        if (kind.id === 'shield') {
            const helm = new THREE.Mesh(geometry.helm, iron);
            helm.position.set(0, 1.2, 0.02);
            this.hips.add(helm);
            this.shieldFace = new THREE.MeshStandardMaterial({ color: 0x8d5a32, roughness: 0.75, emissive: 0x000000 });
            const rim = new THREE.Mesh(geometry.shieldRim, iron);
            const face = new THREE.Mesh(geometry.shield, this.shieldFace);
            face.position.z = 0.04;
            const board = new THREE.Group();
            board.add(rim, face);
            board.position.set(-0.02, 0.78, 0.34);
            this.hips.add(board);
        }
        if (kind.id === 'caster') {
            this.ringMaterial = new THREE.MeshBasicMaterial({
                color: 0xffb15a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false,
            });
            this.ring = new THREE.Mesh(geometry.ring, this.ringMaterial);
            this.ring.rotation.x = -Math.PI / 2;
            this.ring.position.y = 0.06;
            this.ring.visible = false;
            this.root.add(this.ring);
        }
        this.hips.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });

        const back = new THREE.Mesh(geometry.barBack, barBack);
        this.barFill = new THREE.Mesh(geometry.barFill, this.barMaterial);
        this.barFill.position.set(-0.3, 0, 0.001);
        back.renderOrder = 1;
        this.barFill.renderOrder = 2;
        this.bar.add(back, this.barFill);
        this.bar.position.y = 1.55;
        this.bar.visible = false;
        this.root.add(this.bar);
        if (kind.scale !== 1) {
            this.root.scale.setScalar(kind.scale);
            this.bar.scale.setScalar(1 / kind.scale);
        }
    }

    private armWeapon(style: EnemyId): void {
        const arm = this.arms[1];
        if (style === 'runner') {
            const dagger = new THREE.Mesh(geometry.club, wood);
            dagger.scale.set(0.7, 0.55, 0.7);
            dagger.position.y = -0.28;
            dagger.rotation.x = -Math.PI / 2;
            arm.add(dagger);
            return;
        }
        if (style === 'brute') {
            const haft = new THREE.Mesh(geometry.club, wood);
            haft.scale.set(1.3, 1.35, 1.3);
            haft.position.y = -0.42;
            haft.rotation.x = -Math.PI / 2;
            const head = new THREE.Mesh(geometry.hammer, iron);
            head.position.set(0, -0.15, 0.42);
            arm.add(haft, head);
            return;
        }
        if (style === 'caster') {
            const staff = new THREE.Mesh(geometry.staff, wood);
            staff.position.y = -0.35;
            staff.rotation.x = -1.15;
            const orb = new THREE.Mesh(geometry.orb, orbGlow);
            orb.position.set(0, 0.28, 0.42);
            arm.add(staff, orb);
            return;
        }
        if (style === 'shield') {
            const spear = new THREE.Mesh(geometry.staff, wood);
            spear.scale.set(0.8, 0.85, 0.8);
            spear.position.y = -0.4;
            spear.rotation.x = -1.2;
            const tip = new THREE.Mesh(geometry.nose, iron);
            tip.position.set(0, 0.22, 0.48);
            tip.rotation.x = Math.PI / 2;
            arm.add(spear, tip);
            return;
        }
        const club = new THREE.Mesh(geometry.club, wood);
        club.position.y = -0.32;
        club.rotation.x = -Math.PI / 2;
        arm.add(club);
    }

    walk(time: number, speed: number): void {
        const rate = this.style === 'runner' ? 6.4 : this.style === 'brute' ? 3.4 : 5.2;
        const swing = Math.sin(time * Math.max(0.4, speed) * rate) * (this.style === 'brute' ? 0.4 : 0.65);
        this.legs[0].rotation.x = swing;
        this.legs[1].rotation.x = -swing;
        this.arms[0].rotation.x = -swing * 0.8;
        this.arms[1].rotation.x = swing * 0.8 - 0.3;
        this.hips.position.y = Math.abs(Math.cos(time * Math.max(0.4, speed) * rate)) * 0.05;
        this.hips.rotation.x = this.style === 'runner' ? 0.28 : 0.12;
    }

    strike(time: number): void {
        const beat = (time * (this.style === 'brute' ? 1.05 : 1.7)) % 1;
        const raise = beat < 0.65 ? beat / 0.65 : 1 - (beat - 0.65) / 0.35;
        this.legs[0].rotation.x = 0.2;
        this.legs[1].rotation.x = -0.2;
        this.arms[0].rotation.x = -0.4;
        this.arms[1].rotation.x = -2.6 * raise - 0.5;
        this.hips.rotation.x = 0.25 - raise * 0.2;
        this.hips.position.y = 0;
    }

    /** Casters plant their feet and lift the staff. `charge` runs 0 to 1. */
    channel(charge: number): void {
        if (!this.ring || !this.ringMaterial) return;
        this.ring.visible = charge > 0.02;
        this.ring.scale.setScalar(0.5 + charge * 1.1);
        this.ringMaterial.opacity = 0.15 + charge * 0.7;
        if (charge <= 0) return;
        this.legs[0].rotation.x = 0.15;
        this.legs[1].rotation.x = -0.1;
        this.arms[0].rotation.x = -0.5;
        this.arms[1].rotation.x = -1.35 - charge * 0.7;
        this.hips.rotation.x = 0.05;
        this.hips.position.y = 0;
    }

    die(progress: number): void {
        const fall = Math.min(1, progress / 0.45);
        this.hips.rotation.x = -fall * fall * 1.5;
        this.hips.position.y = progress > 0.55 ? -(progress - 0.55) * 1.2 : 0;
        this.bar.visible = false;
        if (this.ring) this.ring.visible = false;
    }

    setHealth(fraction: number): void {
        this.bar.visible = fraction < 1 && fraction > 0;
        this.barFill.scale.x = Math.max(0.001, fraction);
        this.barMaterial.color.setHex(fraction > 0.5 ? 0x8be04e : fraction > 0.25 ? 0xf2c53d : 0xe0483a);
    }

    hit(): void {
        this.flash = 1;
    }

    blocked(): void {
        this.blockFlash = 1;
    }

    /** What ails the foe: frost turns the skin icy, a bleed pulses dark red, a Hunter's Mark glows rose. */
    setStatus(bleeding: boolean, chilled: boolean, frozen: boolean, marked = false): void {
        if (chilled !== this.chilled || frozen !== this.frozen) {
            this.chilled = chilled;
            this.frozen = frozen;
            this.skin.color.copy(this.skinColor);
            if (frozen) this.skin.color.lerp(FROZEN_TINT, 0.75);
            else if (chilled) this.skin.color.lerp(CHILL_TINT, 0.4);
        }
        this.bleeding = bleeding;
        this.marked = marked;
    }

    update(dt: number, camera: THREE.Camera): void {
        this.pulse += dt;
        if (this.flash > 0) {
            this.flash = Math.max(0, this.flash - dt * 6);
            this.skin.emissive.copy(HIT_FLASH).multiplyScalar(this.flash * 0.9);
        } else if (this.marked) {
            this.skin.emissive.copy(MARK_GLOW).multiplyScalar(0.35 + Math.sin(this.pulse * 5) * 0.12);
        } else if (this.bleeding) {
            this.skin.emissive.copy(BLEED_GLOW).multiplyScalar(0.25 + Math.sin(this.pulse * 7) * 0.15);
        } else if (this.frozen) {
            this.skin.emissive.copy(FROZEN_TINT).multiplyScalar(0.18);
        } else this.skin.emissive.setScalar(0);
        if (this.shieldFace && this.blockFlash > 0) {
            this.blockFlash = Math.max(0, this.blockFlash - dt * 4);
            this.shieldFace.emissive.copy(BLOCK_FLASH).multiplyScalar(this.blockFlash);
        }
        if (this.bar.visible) this.bar.quaternion.copy(this.root.quaternion).invert().multiply(camera.quaternion);
    }

    dispose(): void {
        this.skin.dispose();
        this.barMaterial.dispose();
        this.shieldFace?.dispose();
        this.ringMaterial?.dispose();
    }
}

export function createRig(kind: EnemyKind): EnemyRig {
    return new EnemyRig(kind);
}
