import * as THREE from 'three';

/**
 * Illustrated surfaces for the castle. Textures are painted once at load and
 * sampled in world space so scaled blocks and round towers share one stone scale.
 */

export type Surface = 'stone' | 'paver' | 'grass' | 'dirt' | 'wood' | 'foliage' | 'cloth' | 'iron' | 'flat';

const SIZE = 512;
const materials = new Map<string, THREE.MeshStandardMaterial>();

function hash(n: number): number {
    let x = Math.imul(n ^ 0x6d2b79f5, 0x9e3779b1);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
}

function clampByte(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function paint(hex: number, amount: number, seed: number): string {
    const shift = (hash(seed) - 0.5) * amount;
    const r = clampByte(((hex >> 16) & 255) + shift);
    const g = clampByte(((hex >> 8) & 255) + shift);
    const b = clampByte((hex & 255) + shift);
    return `rgb(${r}, ${g}, ${b})`;
}

function grain(context: CanvasRenderingContext2D, amount: number): void {
    const image = context.getImageData(0, 0, SIZE, SIZE);
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
        const shift = (hash(index) - 0.5) * amount;
        data[index] = clampByte(data[index] + shift);
        data[index + 1] = clampByte(data[index + 1] + shift);
        data[index + 2] = clampByte(data[index + 2] + shift);
    }
    context.putImageData(image, 0, 0);
}

function canvasTexture(draw: (context: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not paint a Defender texture.');
    draw(context);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
}

function stoneMap(hex: number, courses: number): THREE.CanvasTexture {
    return canvasTexture(context => {
        context.fillStyle = paint(hex, -70, 2);
        context.fillRect(0, 0, SIZE, SIZE);
        const height = SIZE / courses;
        const width = height * 2.15;
        const gap = Math.max(4, height * 0.12);
        const rows = courses + 2;
        const cols = Math.ceil(SIZE / width) + 2;
        for (let row = 0; row < rows; row++) {
            const offset = row % 2 === 0 ? 0 : width * 0.5;
            for (let col = -1; col < cols; col++) {
                const x = col * width + offset;
                const y = row * height;
                const seed = row * 97 + col * 13;
                context.fillStyle = paint(hex, 58, seed + 5);
                context.fillRect(x + gap, y + gap, width - gap * 2, height - gap * 2);
                context.fillStyle = 'rgba(255, 248, 230, 0.28)';
                context.fillRect(x + gap, y + gap, width - gap * 2, Math.max(3, gap * 0.9));
                context.fillStyle = 'rgba(90, 62, 36, 0.28)';
                context.fillRect(x + gap, y + height - gap - Math.max(4, gap), width - gap * 2, Math.max(4, gap));
            }
        }
        grain(context, 14);
    });
}

function grassMap(hex: number): THREE.CanvasTexture {
    return canvasTexture(context => {
        context.fillStyle = paint(hex, 0, 1);
        context.fillRect(0, 0, SIZE, SIZE);
        for (let index = 0; index < 90; index++) {
            const x = hash(index * 3) * SIZE;
            const y = hash(index * 3 + 1) * SIZE;
            const radius = 18 + hash(index * 3 + 2) * 50;
            context.fillStyle = paint(hex, 40, index + 20);
            context.beginPath();
            context.ellipse(x, y, radius, radius * 0.72, hash(index) * 3, 0, Math.PI * 2);
            context.fill();
        }
        for (let blade = 0; blade < 700; blade++) {
            const x = hash(blade + 400) * SIZE;
            const y = hash(blade + 900) * SIZE;
            context.strokeStyle = paint(hex, 50, blade + 30);
            context.lineWidth = 1.4;
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(x + (hash(blade + 1200) - 0.5) * 6, y - 7 - hash(blade + 1500) * 8);
            context.stroke();
        }
        grain(context, 12);
    });
}

function dirtMap(hex: number): THREE.CanvasTexture {
    return canvasTexture(context => {
        context.fillStyle = paint(hex, 0, 1);
        context.fillRect(0, 0, SIZE, SIZE);
        for (let index = 0; index < 80; index++) {
            context.fillStyle = paint(hex, 34, index + 4);
            context.beginPath();
            context.ellipse(hash(index) * SIZE, hash(index + 80) * SIZE, 16 + hash(index + 8) * 40, 10 + hash(index + 9) * 18, 0, 0, Math.PI * 2);
            context.fill();
        }
        for (let pebble = 0; pebble < 50; pebble++) {
            context.fillStyle = paint(0xb7aa96, 30, pebble);
            context.beginPath();
            context.arc(hash(pebble + 300) * SIZE, hash(pebble + 380) * SIZE, 2 + hash(pebble + 420) * 4, 0, Math.PI * 2);
            context.fill();
        }
        grain(context, 14);
    });
}

function woodMap(hex: number): THREE.CanvasTexture {
    return canvasTexture(context => {
        context.fillStyle = paint(hex, -10, 1);
        context.fillRect(0, 0, SIZE, SIZE);
        const planks = 6;
        const width = SIZE / planks;
        for (let plank = 0; plank < planks; plank++) {
            context.fillStyle = paint(hex, 28, plank + 3);
            context.fillRect(plank * width + 2, 0, width - 4, SIZE);
            for (let knot = 0; knot < 3; knot++) {
                const y = hash(plank * 10 + knot) * SIZE;
                context.fillStyle = paint(hex, -20, plank * 10 + knot + 6);
                context.fillRect(plank * width + 8, y, width - 18, 2 + hash(plank + knot) * 3);
            }
        }
        grain(context, 8);
    });
}

function foliageMap(hex: number): THREE.CanvasTexture {
    return canvasTexture(context => {
        context.fillStyle = paint(hex, -8, 1);
        context.fillRect(0, 0, SIZE, SIZE);
        for (let index = 0; index < 140; index++) {
            context.fillStyle = paint(hex, 46, index + 2);
            context.beginPath();
            context.arc(hash(index) * SIZE, hash(index + 140) * SIZE, 10 + hash(index + 7) * 28, 0, Math.PI * 2);
            context.fill();
        }
        grain(context, 8);
    });
}

function clothMap(hex: number): THREE.CanvasTexture {
    return canvasTexture(context => {
        context.fillStyle = paint(hex, 0, 1);
        context.fillRect(0, 0, SIZE, SIZE);
        context.globalAlpha = 0.18;
        for (let row = 0; row < SIZE; row += 6) {
            context.fillStyle = row % 12 === 0 ? '#fff4e4' : '#2a120f';
            context.fillRect(0, row, SIZE, 2);
        }
        context.globalAlpha = 1;
        grain(context, 8);
    });
}

const maps = new Map<string, THREE.CanvasTexture>();
function mapFor(surface: Surface, color: number): THREE.CanvasTexture | null {
    if (surface === 'iron' || surface === 'flat') return null;
    const key = `${surface}:${color.toString(16)}`;
    let found = maps.get(key);
    if (!found) {
        if (surface === 'stone') found = stoneMap(color, 7);
        else if (surface === 'paver') found = stoneMap(color, 11);
        else if (surface === 'grass') found = grassMap(color);
        else if (surface === 'dirt') found = dirtMap(color);
        else if (surface === 'wood') found = woodMap(color);
        else if (surface === 'foliage') found = foliageMap(color);
        else found = clothMap(color);
        maps.set(key, found);
    }
    return found;
}

const TRIPLANAR = /* glsl */`
#ifdef USE_MAP
	vec3 triBlend = abs(normalize(vWNorm));
	triBlend = pow(triBlend, vec3(4.0));
	triBlend /= (triBlend.x + triBlend.y + triBlend.z);
	vec3 triCoord = vWPos * uTriScale;
	vec4 sampledDiffuseColor = texture2D(map, triCoord.yz) * triBlend.x
		+ texture2D(map, triCoord.xz) * triBlend.y
		+ texture2D(map, triCoord.xy) * triBlend.z;
	diffuseColor *= sampledDiffuseColor;
#endif
`;

/** World-space surface. `color` is baked into the paint, so the material tint stays white. */
export function textured(color: number, surface: Surface): THREE.MeshStandardMaterial {
    const key = `${surface}:${color.toString(16)}`;
    const cached = materials.get(key);
    if (cached) return cached;
    const map = mapFor(surface, color);
    const roughness = surface === 'iron' ? 0.42 : surface === 'cloth' ? 0.78 : 0.9;
    const metalness = surface === 'iron' ? 0.45 : 0;
    const material = new THREE.MeshStandardMaterial({
        color: map ? 0xffffff : color,
        map: map ?? undefined,
        roughness,
        metalness,
    });
    if (map) {
        const scale = surface === 'stone' ? 0.22 : surface === 'paver' ? 0.38 : surface === 'wood' ? 0.46 : surface === 'cloth' ? 0.7 : 0.52;
        material.customProgramCacheKey = () => `defender-tri-${scale}`;
        material.onBeforeCompile = shader => {
            shader.uniforms.uTriScale = { value: scale };
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
                .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);')
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\nuniform float uTriScale;')
                .replace('#include <map_fragment>', TRIPLANAR);
        };
    }
    materials.set(key, material);
    return material;
}

/** Red banner with a cream rosette, mapped once across a flag face. */
export function emblemMaterial(): THREE.MeshStandardMaterial {
    const cached = materials.get('emblem');
    if (cached) return cached;
    const map = canvasTexture(context => {
        context.fillStyle = '#b8282e';
        context.fillRect(0, 0, SIZE, SIZE);
        context.strokeStyle = '#f3e6cf';
        context.lineWidth = 18;
        context.strokeRect(36, 36, SIZE - 72, SIZE - 72);
        context.fillStyle = '#f6ecd8';
        context.beginPath();
        const cx = SIZE / 2;
        const cy = SIZE / 2 + 10;
        for (let petal = 0; petal < 6; petal++) {
            const angle = (petal / 6) * Math.PI * 2 - Math.PI / 2;
            context.moveTo(cx, cy);
            context.arc(cx + Math.cos(angle) * 78, cy + Math.sin(angle) * 78, 46, 0, Math.PI * 2);
        }
        context.fill();
        context.fillStyle = '#b8282e';
        context.beginPath();
        context.arc(cx, cy, 28, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#f6ecd8';
        context.beginPath();
        context.arc(cx, cy, 12, 0, Math.PI * 2);
        context.fill();
    });
    map.wrapS = THREE.ClampToEdgeWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    const material = new THREE.MeshStandardMaterial({ map, roughness: 0.72, metalness: 0 });
    materials.set('emblem', material);
    return material;
}

/** Door planks. Color starts white so damage can darken the paint. */
export function gateWoodMaterial(): THREE.MeshStandardMaterial {
    const map = woodMap(0x8a5a32);
    map.repeat.set(1.2, 2.4);
    return new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 0.84, metalness: 0 });
}

export interface WaterSurface {
    mesh: THREE.Mesh;
    update(seconds: number): void;
}

/** Bright turquoise moat with scrolling ripples and sun glints. */
export function createWater(y: number): WaterSurface {
    const uniforms = {
        uTime: { value: 0 },
        uSun: { value: new THREE.Vector3(-30, 55, 24).normalize() },
    };
    const material = new THREE.ShaderMaterial({
        uniforms,
        transparent: false,
        vertexShader: /* glsl */`
            varying vec3 vWorld;
            varying vec3 vView;
            uniform float uTime;
            void main() {
                vec4 world = modelMatrix * vec4(position, 1.0);
                float swell = sin(world.x * 0.35 + uTime * 1.15) * 0.035 + sin(world.z * 0.27 - uTime * 0.9) * 0.028;
                world.y += swell;
                vec4 view = viewMatrix * world;
                vWorld = world.xyz;
                vView = view.xyz;
                gl_Position = projectionMatrix * view;
            }
        `,
        fragmentShader: /* glsl */`
            varying vec3 vWorld;
            varying vec3 vView;
            uniform float uTime;
            uniform vec3 uSun;
            void main() {
                float ripple = sin(vWorld.x * 0.85 + uTime * 1.5) * sin(vWorld.z * 0.62 - uTime * 1.15);
                vec3 normal = normalize(vec3(
                    cos(vWorld.x * 0.85 + uTime * 1.5) * 0.16,
                    1.0,
                    cos(vWorld.z * 0.62 - uTime * 1.15) * 0.14 + ripple * 0.05
                ));
                vec3 viewDir = normalize(-vView);
                float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.0);
                float shore = smoothstep(55.0, 6.0, length(vWorld.xz - vec2(0.0, -8.0)));
                vec3 deep = vec3(0.05, 0.52, 0.66);
                vec3 shallow = vec3(0.42, 0.90, 0.93);
                vec3 color = mix(deep, shallow, 0.28 + shore * 0.62 + ripple * 0.08);
                color = mix(color, vec3(0.90, 0.97, 1.0), fresnel * 0.5);
                float spec = pow(max(dot(reflect(-uSun, normal), viewDir), 0.0), 90.0);
                float glint = pow(max(sin(vWorld.x * 1.8 + uTime * 2.2) * sin(vWorld.z * 1.35 - uTime * 1.8), 0.0), 10.0);
                color += vec3(1.0, 0.96, 0.82) * (spec * 0.85 + glint * 0.28);
                float fog = smoothstep(80.0, 250.0, length(vView));
                color = mix(color, vec3(0.788, 0.902, 0.957), fog);
                gl_FragColor = vec4(color, 1.0);
            }
        `,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 48, 48), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = false;
    return { mesh, update: seconds => { uniforms.uTime.value = seconds; } };
}
