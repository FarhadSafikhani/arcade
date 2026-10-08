interface Drop {
    x: number;
    y: number;
    speed: number;
    length: number;
    alpha: number;
}

interface Ripple {
    x: number;
    y: number;
    age: number;
    life: number;
    radius: number;
}

/** The weather shares the background image's cover transform, so lights and water
 * stay attached to the photographed scene at every viewport size. */
export class RainyAlley {
    private readonly context: CanvasRenderingContext2D | null;
    private readonly motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    private readonly drops: Drop[] = [];
    private readonly ripples: Ripple[] = [];
    private width = 1;
    private height = 1;
    private scale = 1;
    private offsetX = 0;
    private offsetY = 0;
    private frame = 0;
    private lastTime = 0;
    private elapsed = 0;
    private nextRipple = 0;
    private nextFlicker = 4;
    private flickerStarted = -10;
    private signMask: HTMLCanvasElement | null = null;
    private signX = 0;
    private signY = 0;
    private ready = false;
    private destroyed = false;

    constructor(private readonly canvas: HTMLCanvasElement, private readonly image: HTMLImageElement) {
        this.context = canvas.getContext('2d');
    }

    init(): void {
        if (!this.context) return;
        this.image.addEventListener('load', this.onImageLoad);
        window.addEventListener('resize', this.onResize);
        window.addEventListener('pagehide', this.onPageHide);
        window.addEventListener('pageshow', this.onStateChange);
        document.addEventListener('visibilitychange', this.onStateChange);
        this.motion.addEventListener('change', this.onStateChange);
        if (this.image.complete && this.image.naturalWidth) this.onImageLoad();
    }

    destroy(): void {
        this.destroyed = true;
        this.stop();
        this.image.removeEventListener('load', this.onImageLoad);
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('pagehide', this.onPageHide);
        window.removeEventListener('pageshow', this.onStateChange);
        document.removeEventListener('visibilitychange', this.onStateChange);
        this.motion.removeEventListener('change', this.onStateChange);
        this.signMask = null;
    }

    private readonly onImageLoad = (): void => {
        if (this.destroyed) return;
        this.ready = true;
        this.layout();
        this.prepareSign();
        this.onStateChange();
    };

    private readonly onResize = (): void => { this.layout(); };
    private readonly onPageHide = (): void => { this.stop(); };
    private readonly onStateChange = (): void => {
        this.stop();
        if (!this.destroyed && this.ready && !document.hidden && !this.motion.matches) {
            this.frame = requestAnimationFrame(this.draw);
        }
    };

    private stop(): void {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.lastTime = 0;
        this.context?.clearRect(0, 0, this.width, this.height);
    }

    private layout(): void {
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);
        this.context?.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.scale = Math.max(this.width / (this.image.naturalWidth || 1), this.height / (this.image.naturalHeight || 1));
        this.offsetX = (this.width - this.image.naturalWidth * this.scale) / 2;
        this.offsetY = (this.height - this.image.naturalHeight * this.scale) / 2;
        this.drops.length = 0;
        this.ripples.length = 0;
        const count = Math.min(240, Math.max(65, Math.round(this.width * this.height / 7000)));
        for (let i = 0; i < count; i++) {
            this.drops.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                speed: 440 + Math.random() * 480,
                length: 16 + Math.random() * 25,
                alpha: .14 + Math.random() * .2,
            });
        }
    }

    private point(x: number, y: number): [number, number] {
        return [this.offsetX + x * this.image.naturalWidth * this.scale,
            this.offsetY + y * this.image.naturalHeight * this.scale];
    }

    private get portrait(): boolean { return this.image.naturalWidth < this.image.naturalHeight; }
    private get phone(): boolean { return this.image.naturalWidth / this.image.naturalHeight < 2 / 3; }

    private prepareSign(): void {
        // Select just the emitting cyan pixels, not a rectangular patch over the sign.
        const bounds = this.phone ? [.805, .042, .14, .23]
            : this.portrait ? [.776, .015, .12, .273] : [.79, .016, .086, .351];
        const [x, y, w, h] = bounds;
        this.signX = x * this.image.naturalWidth;
        this.signY = y * this.image.naturalHeight;
        const mask = document.createElement('canvas');
        mask.width = Math.round(w * this.image.naturalWidth);
        mask.height = Math.round(h * this.image.naturalHeight);
        const context = mask.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        try {
            context.drawImage(this.image, this.signX, this.signY, mask.width, mask.height, 0, 0, mask.width, mask.height);
            const pixels = context.getImageData(0, 0, mask.width, mask.height);
            for (let i = 0; i < pixels.data.length; i += 4) {
                const [r, g, b] = [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]];
                const cyan = b > r * 1.04 && g > r * 1.04;
                const light = Math.max(0, Math.min(1, (g - 50) / 130));
                pixels.data[i] = 3;
                pixels.data[i + 1] = 17;
                pixels.data[i + 2] = 23;
                pixels.data[i + 3] = cyan ? Math.round(light * 255) : 0;
            }
            context.putImageData(pixels, 0, 0);
            this.signMask = mask;
        } catch {
            // Image loading or canvas privacy restrictions never prevent navigation.
            this.signMask = null;
        }
    }

    private readonly draw = (now: number): void => {
        if (this.destroyed || document.hidden || this.motion.matches || !this.context) return;
        this.frame = requestAnimationFrame(this.draw);
        if (this.lastTime && now - this.lastTime < 1000 / 30) return;
        const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, .06) : 1 / 30;
        this.lastTime = now;
        this.elapsed += dt;
        const ctx = this.context;
        ctx.clearRect(0, 0, this.width, this.height);
        this.drawWater(ctx, dt);
        this.drawNeon(ctx);
        this.drawWarmLights(ctx);
        this.drawMist(ctx);
        this.drawRain(ctx, dt);
    };

    private drawNeon(ctx: CanvasRenderingContext2D): void {
        if (this.elapsed > this.nextFlicker) {
            this.flickerStarted = this.elapsed;
            this.nextFlicker = this.elapsed + 9 + Math.random() * 11;
        }
        const age = this.elapsed - this.flickerStarted;
        // Two short dips, then a gentle recovery; no full-frame flash or strobe.
        const dip = age < .12 ? .62 : age < .3 ? .1 : age < .39 ? .38 : age < .85 ? .12 * (1 - (age - .39) / .46) : 0;
        if (this.signMask && dip > 0) {
            ctx.globalAlpha = dip;
            ctx.drawImage(this.signMask, this.offsetX + this.signX * this.scale, this.offsetY + this.signY * this.scale,
                this.signMask.width * this.scale, this.signMask.height * this.scale);
            ctx.globalAlpha = 1;
        }
        const [x, y] = this.point(this.phone ? .875 : .835, this.portrait ? .16 : .2);
        const radius = this.image.naturalWidth * this.scale * .095;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
        const strength = (.023 + .006 * Math.sin(this.elapsed * .8)) * (1 - dip);
        glow.addColorStop(0, `rgba(70,220,245,${strength})`);
        glow.addColorStop(1, 'rgba(70,220,245,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    private drawWarmLights(ctx: CanvasRenderingContext2D): void {
        // Coordinates are authored against each background, including the tall phone crop.
        const lamp = this.phone ? [.367, .334] : this.portrait ? [.385, .451] : [.296, .195];
        const tubes = this.phone ? [[.04, .276], [.085, .294], [.123, .32]]
            : this.portrait ? [[.05, .241], [.105, .262], [.143, .295]]
            : [[.036, .251], [.081, .278], [.107, .324]];
        const t = this.elapsed;
        const lampPulse = .8 + .11 * Math.sin(t * 2.1) + .055 * Math.sin(t * 7.7);
        // A brief, softened fluorescent dip, independent from the cyan sign's flicker.
        const cycle = t % 13.7;
        const dip = cycle > 5.1 && cycle < 5.55 ? Math.sin((cycle - 5.1) / .45 * Math.PI) * .48 : 0;
        const shopPulse = .88 + .08 * Math.sin(t * 1.35) + .035 * Math.sin(t * 8.3) - dip;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const glow = (x: number, y: number, rx: number, ry: number, alpha: number): void => {
            const [px, py] = this.point(x, y);
            ctx.save();
            ctx.translate(px, py);
            ctx.scale(rx * this.image.naturalWidth * this.scale, ry * this.image.naturalHeight * this.scale);
            const light = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
            light.addColorStop(0, `rgba(255,192,109,${alpha})`);
            light.addColorStop(.22, `rgba(255,154,63,${alpha * .65})`);
            light.addColorStop(1, 'rgba(255,132,44,0)');
            ctx.fillStyle = light;
            ctx.fillRect(-1, -1, 2, 2);
            ctx.restore();
        };
        glow(lamp[0], lamp[1], .033, this.portrait ? .02 : .05, .24 * lampPulse);
        for (const [x, y] of tubes) {
            glow(x, y, .057, this.portrait ? .029 : .042, .19 * shopPulse);
        }
        glow(.085, this.portrait ? .44 : .46, .11, .22, .045 * shopPulse);
        // The warm storefront spill also breathes in its reflection on the asphalt.
        glow(.14, .9, .12, .065, .042 * shopPulse);
        ctx.restore();
    }

    private drawRain(ctx: CanvasRenderingContext2D, dt: number): void {
        ctx.lineCap = 'round';
        for (const drop of this.drops) {
            drop.y += drop.speed * dt;
            drop.x -= drop.speed * .07 * dt;
            if (drop.y > this.height + 30 || drop.x < -30) {
                drop.x = Math.random() * (this.width + 50);
                drop.y = -30;
            }
            const nx = (drop.x - this.offsetX) / (this.image.naturalWidth * this.scale);
            const warm = Math.exp(-Math.pow((nx - .12) / .18, 2));
            const light = .6 + .65 * Math.exp(-Math.pow((nx - .84) / .18, 2)) + .4 * warm;
            ctx.lineWidth = drop.length > 31 ? 1.15 : .75;
            ctx.strokeStyle = warm > .5 ? `rgba(239,200,155,${drop.alpha * light})`
                : `rgba(183,222,236,${drop.alpha * light})`;
            ctx.beginPath();
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(drop.x - drop.length * .07, drop.y + drop.length);
            ctx.stroke();
        }
    }

    private drawWater(ctx: CanvasRenderingContext2D, dt: number): void {
        const horizon = this.portrait ? .64 : .66;
        const corners = [[.32, horizon], [.68, horizon], [.92, 1], [.04, 1]];
        ctx.save();
        ctx.beginPath();
        corners.forEach(([x, y], index) => {
            const p = this.point(x, y);
            if (index === 0) ctx.moveTo(...p); else ctx.lineTo(...p);
        });
        ctx.closePath();
        ctx.clip();
        this.drawReflections(ctx, horizon);
        if (this.elapsed > this.nextRipple && this.ripples.length < 26) {
            const y = horizon + .03 + Math.random() * (1 - horizon - .05);
            const depth = (y - horizon) / (1 - horizon);
            this.ripples.push({
                x: .5 + (Math.random() - .5) * (.3 + depth * .57),
                y, age: 0, life: 1.6 + Math.random() * 1.1, radius: 18 + depth * 32,
            });
            this.nextRipple = this.elapsed + .08 + Math.random() * .12;
        }
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const ripple = this.ripples[i];
            ripple.age += dt;
            if (ripple.age >= ripple.life) { this.ripples.splice(i, 1); continue; }
            const progress = ripple.age / ripple.life;
            const [x, y] = this.point(ripple.x, ripple.y);
            const radius = (2 + progress * ripple.radius) * Math.max(.65, Math.min(this.scale, 1.5));
            const alpha = Math.sin(progress * Math.PI) * .42;
            ctx.strokeStyle = ripple.x < .3 ? `rgba(239,179,116,${alpha})` : `rgba(137,217,232,${alpha})`;
            ctx.lineWidth = .95;
            ctx.beginPath();
            ctx.ellipse(x, y, radius, radius * .19, 0, 0, Math.PI * 2);
            ctx.stroke();
            if (progress > .2) {
                ctx.globalAlpha = .55;
                ctx.beginPath();
                ctx.ellipse(x, y, radius * .65, radius * .12, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
            if (progress < .15) {
                // A tiny impact glint ties the expanding rings to falling droplets.
                ctx.fillStyle = `rgba(211,236,239,${(1 - progress / .15) * .38})`;
                ctx.fillRect(x - .7, y - 1.5, 1.4, 2.5);
            }
        }
        // Broken, gently moving cyan highlights in the sign's wet reflection.
        for (let i = 0; i < 12; i++) {
            const [x, y] = this.point(.78 + Math.sin(i * 2.4 + this.elapsed * .3) * .024, .81 + i * .014);
            const alpha = .07 + .045 * Math.sin(this.elapsed * 1.4 + i);
            ctx.fillStyle = `rgba(115,230,247,${alpha})`;
            ctx.fillRect(x, y, (8 + Math.sin(i * 3) * 5) * this.scale, .8);
        }
        ctx.restore();
    }

    private drawReflections(ctx: CanvasRenderingContext2D, horizon: number): void {
        // Refract the actual photographed reflections in narrow horizontal bands.
        // The surrounding water polygon clips them away from shopfronts and buildings.
        const [, waterTop] = this.point(.5, horizon);
        const sceneHeight = this.image.naturalHeight * this.scale;
        const sceneWidth = this.image.naturalWidth * this.scale;
        const start = Math.max(0, waterTop);
        const bottom = Math.min(this.height, this.offsetY + sceneHeight);
        const band = 4;
        for (let y = start; y < bottom; y += band) {
            const height = Math.min(band, bottom - y);
            const depth = (y - waterTop) / (sceneHeight * (1 - horizon));
            const shift = (Math.sin(y * .071 + this.elapsed * 1.65)
                + .45 * Math.sin(y * .123 - this.elapsed * 1.1)) * (.35 + depth * 1.5);
            ctx.globalAlpha = Math.min(.7, depth * 1.6);
            ctx.drawImage(this.image, 0, (y - this.offsetY) / this.scale,
                this.image.naturalWidth, height / this.scale,
                this.offsetX + shift, y, sceneWidth, height);
        }
        ctx.globalAlpha = 1;
    }

    private drawMist(ctx: CanvasRenderingContext2D): void {
        const [x, y] = this.point(.51 + Math.sin(this.elapsed * .09) * .055, .57);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, .28);
        const radius = this.width * .25;
        const mist = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        mist.addColorStop(0, 'rgba(145,192,201,.024)');
        mist.addColorStop(1, 'rgba(145,192,201,0)');
        ctx.fillStyle = mist;
        ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
        ctx.restore();
    }
}
