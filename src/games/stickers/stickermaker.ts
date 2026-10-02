import { Application, Container, Graphics, Sprite, Texture, Assets, Rectangle, RenderTexture, FederatedPointerEvent, ColorMatrixFilter, BlurFilter, Text, Filter, BLEND_MODES } from 'pixi.js';
import { Pnt } from '../../shared/utils/shared-types';
import { STICKER_GAME_CONFIG, StickerGameLevel, StickersGame } from './game';
import { VERSION } from '../../version';
import { prepareStickerPixels, stickerPreparationCache, StickerPiece, yieldToBrowser } from './preparation';

function cloneSlot(source: Sprite | Graphics): Sprite | Graphics {
    const clone = source instanceof Sprite ? new Sprite(source.texture) : source.clone();
    clone.position.copyFrom(source.position);
    clone.scale.copyFrom(source.scale);
    return clone;
}

interface StickerSource {
    pixels: ImageData;
    revision: string;
}

// Share source reads between difficulties, bounded separately from saved plans.
const sourceImages = new Map<Texture, Promise<StickerSource>>();

function readStickerSource(app: Application, texture: Texture): Promise<StickerSource> {
    const existing = sourceImages.get(texture);
    if (existing) return existing;
    const pending = (async () => {
        const temporary = new Sprite(texture);
        const renderTexture = RenderTexture.create({ width: texture.width, height: texture.height, resolution: 1 });
        let canvas: HTMLCanvasElement;
        try {
            app.renderer.render(temporary, { renderTexture });
            canvas = app.renderer.extract.canvas(renderTexture) as HTMLCanvasElement;
        } finally {
            temporary.destroy();
            renderTexture.destroy(true);
        }
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Unable to read sticker image');
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        // Hash the actual decoded image so replacing a PNG at the same URL also
        // invalidates its saved plan. Web Crypto runs asynchronously.
        let revision: string;
        if (globalThis.crypto?.subtle) {
            const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(pixels.data).buffer);
            revision = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
        } else {
            // Without a secure context, keep session caching but avoid stale disk hits.
            revision = `${Date.now()}-${Math.random()}`;
        }
        return { pixels, revision };
    })();
    sourceImages.set(texture, pending);
    if (sourceImages.size > 2) sourceImages.delete(sourceImages.keys().next().value!);
    void pending.catch(() => { if (sourceImages.get(texture) === pending) sourceImages.delete(texture); });
    return pending;
}

export class Chunk {
    sprite: Sprite | Graphics;
    id: string;
    originX: number; // the x when it was made, before moving
    originY: number; // the y when it was made, before moving
    dragOffset: Pnt = { x: 0, y: 0 };

    public hole: Hole | null = null;
    public inPlay: boolean = false;

    private stickerMaker: StickerMaker;
    private brightnessFilter: ColorMatrixFilter;

    constructor(sprite: Sprite | Graphics, id: string, stickerMaker: StickerMaker) {
        this.sprite = sprite;
        this.id = id;
        this.originX = sprite.position.x;
        this.originY = sprite.position.y;
        this.stickerMaker = stickerMaker;
        this.makeDraggable();
        this.inPlay = true;
        this.brightnessFilter = new ColorMatrixFilter();
        this.sprite.filters = [this.brightnessFilter];
    }

    private makeDraggable(): void {
        this.sprite.eventMode = 'static';
        this.sprite.cursor = 'pointer';

        this.sprite.on('pointerdown', (event: FederatedPointerEvent) => {

            if (!this.inPlay) {
                return;
            }

            const pos = event.getLocalPosition(this.sprite.parent);
            this.dragOffset.x = pos.x - this.sprite.position.x;
            this.dragOffset.y = pos.y - this.sprite.position.y;

            // bring chunk sprite ontop of everything else
            this.sprite.parent.addChild(this.sprite);

            // Dispatch custom event for the parent to handle
            const customEvent = new CustomEvent('startChunkDrag', {
                detail: { chunk: this, event: event }
            });
            document.dispatchEvent(customEvent);
        });
    }

    public isInSnapRange(): boolean {
        // Preview the same screen clamping that happens on release.
        const x = Math.min(Math.max(this.sprite.x, 0), this.stickerMaker.gameWidth - this.sprite.width);
        const y = Math.min(Math.max(this.sprite.y, 0), this.stickerMaker.gameHeight - this.sprite.height);
        const distance = Math.hypot(x - this.originX, y - this.originY);
        const relativeSnapThreshold = STICKER_GAME_CONFIG.snapThreshold / this.stickerMaker.currentGridSize;
        return this.inPlay && distance < relativeSnapThreshold;
    }

    public setDropReady(ready: boolean): void {
        this.brightnessFilter.brightness(ready ? 1.2 : 1, false);
    }

    public checkSnapToHole(): void {
        if (this.isInSnapRange()) {
            //snap to the hole
            this.sprite.position.x = this.originX;
            this.sprite.position.y = this.originY;
            this.correctlyPlaced();
        }

    }

    public onDrop(): void {
        this.clamp();
        this.checkSnapToHole();
    }

    public correctlyPlaced(): void {
        const performance1 = performance.now();
        this.sprite.alpha = 1;
        this.inPlay = false;
        
        this.sprite.cursor = 'default';

        //make chunk first child of its parent
        this.sprite.parent.setChildIndex(this.sprite, 0);
        
        // Create a smooth brightness pulse animation using PIXI ticker

        
        let elapsed = 0;
        const duration = 60; 
        
        const animationTicker = (deltaTime: number) => {
            elapsed += deltaTime; // Convert to milliseconds (60fps = 16.67ms per frame)
            
            const progress = Math.min(elapsed / duration, 1);
            
            let brightness: number;
            if (progress < 0.25) {
                // Ease in to max brightness (0 to 0.25)
                const t = progress / 0.25;
                const eased = t * t; // Quadratic ease in
                brightness = 2 + eased * 4;
            } else if (progress < .9) {
                // Ease out from max brightness (0.625 to 0.875)
                const t = (progress - 0.25) / 1;
                const eased = 1 - (1 - t) * (1 - t); // Quadratic ease out
                brightness = 4 - eased * 3;
            } else {
                brightness = 1;
            }
            
            this.brightnessFilter.brightness(brightness, false);
            
            // Clean up when animation is complete
            if (progress >= 1) {
                this.sprite.filters = [];
                this.stickerMaker.app.ticker.remove(animationTicker);
            }
        };
        
        // // Add to the app's ticker for smooth 60fps animation
        this.stickerMaker.app.ticker.add(animationTicker);

        // Spawn simple particle effect
        this.stickerMaker.createSnapParticles(this.sprite.position.x + this.sprite.width/2, this.sprite.position.y + this.sprite.height/2);

        const performance2 = performance.now();
        console.log(`Chunk Drop Time: ${performance2 - performance1}ms`);

        setTimeout(() => {
            this.sprite.eventMode = 'none';
        }, 1000);
    }

    public clamp(): void {
        if (this.sprite.position.x < 0) {
            this.sprite.position.x = 0;
        }
        if (this.sprite.position.x > this.stickerMaker.gameWidth - this.sprite.width) {
            this.sprite.position.x = this.stickerMaker.gameWidth - this.sprite.width;
        }
        if (this.sprite.position.y < 0) {
            this.sprite.position.y = 0;
        }
        if (this.sprite.position.y > this.stickerMaker.gameHeight - this.sprite.height) {
            this.sprite.position.y = this.stickerMaker.gameHeight - this.sprite.height;
        }
    }
}

export class Hole {
    id: string;

    chunk: Chunk;
    graphics: Sprite | Graphics;
    private highlight: Container | null = null;
    private highlightColor: ColorMatrixFilter | null = null;
    private highlightBlur: BlurFilter | null = null;

    constructor(graphics: Sprite | Graphics, id: string, chunk: Chunk) {
        this.id = id;

        this.chunk = chunk;
        this.graphics = graphics;
    }

    public showDropPreview(alpha: number): void {
        if (!this.highlight) {
            // Reuse the slot's silhouette, including transparent edges and triangle cuts.
            this.highlight = new Container();
            this.highlight.eventMode = 'none';
            this.highlightColor = new ColorMatrixFilter();
            this.highlightColor.matrix = [
                0, 0, 0, 0, 0.25,
                0, 0, 0, 0, 1,
                0, 0, 0, 0, 0.72,
                0, 0, 0, 1, 0,
            ];
            this.highlightBlur = new BlurFilter(6, 4);
            const glow = cloneSlot(this.graphics);
            glow.filters = [this.highlightColor, this.highlightBlur];
            const fill = cloneSlot(this.graphics);
            fill.filters = [this.highlightColor];
            fill.alpha = 0.35;
            this.highlight.addChild(glow, fill);
            this.graphics.parent.addChild(this.highlight);
        }
        this.highlight.visible = true;
        this.highlight.alpha = alpha;
    }

    public hideDropPreview(): void {
        if (this.highlight) this.highlight.visible = false;
    }

    public destroy(): void {
        this.highlight?.destroy({ children: true });
        this.highlightColor?.destroy();
        this.highlightBlur?.destroy();
        this.graphics.destroy();
    }
}

export class StickerMaker {
    public app: Application;
    public game: StickersGame;
    public gameContainer: Container;
    public currentStickerSprite: Sprite | null = null;
    public gameWidth: number;
    public gameHeight: number;

    private holeContainer: Container;
    private chunkContainer: Container;

    public chunks: Record<string, Chunk> = {};
    public holes: Record<string, Hole> = {};
    public activeChunk: Chunk | null = null;
    public currentLevel!: StickerGameLevel;
    public currentGridSize: number = STICKER_GAME_CONFIG.gideSizeMedium;
    private previewReady = false;
    private previewElapsed = 0;
    private previewAlpha = 0;
    private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    private generation = 0;
    private maskTexture: Texture | null = null;
    private readonly pieceTextures = new Set<Texture>();
    private cancelIntro: (() => void) | null = null;
    private cancelCelebration: (() => void) | null = null;

    private readonly animateDropPreview = (delta: number): void => {
        this.updateDropPreview();
        if (!this.previewReady) return;
        this.previewElapsed += delta;
        this.previewAlpha += (1 - this.previewAlpha) * (1 - Math.exp(-delta / 4));
        const pulse = this.reducedMotion.matches ? 1 : 0.85 + Math.sin(this.previewElapsed / 12) * 0.15;
        this.activeChunk?.hole?.showDropPreview(this.previewAlpha * pulse);
    };

    private updateDropPreview(): void {
        const chunk = this.activeChunk;
        if (!chunk) return;
        const ready = chunk.isInSnapRange();
        if (ready === this.previewReady) return;
        this.previewReady = ready;
        chunk.setDropReady(ready);
        if (ready) {
            this.previewElapsed = 0;
            this.previewAlpha = this.reducedMotion.matches ? 1 : 0.35;
            chunk.hole?.showDropPreview(this.previewAlpha);
        } else {
            chunk.hole?.hideDropPreview();
        }
    }

    private clearDropPreview(): void {
        this.app.ticker.remove(this.animateDropPreview);
        this.activeChunk?.hole?.hideDropPreview();
        this.activeChunk?.setDropReady(false);
        this.previewReady = false;
        this.previewElapsed = 0;
        this.previewAlpha = 0;
    }

    constructor(app: Application, game: StickersGame, gameContainer: Container, gameWidth: number, gameHeight: number) {
        this.app = app;
        this.game = game;
        this.gameContainer = gameContainer;
        this.gameWidth = gameWidth;
        this.gameHeight = gameHeight;
        
        // Create hole container for proper layering
        this.holeContainer = new Container();
        this.chunkContainer = new Container();
        
        this.setupStickerMakerEvents();
    }

    private setupStickerMakerEvents(): void {
        document.addEventListener('startChunkDrag', (event: Event) => {
            const customEvent = event as CustomEvent;
            const { chunk, event: pointerEvent } = customEvent.detail;
            this.handleStartDrag(chunk, pointerEvent);
        });
    }

    private handleStartDrag(chunk: Chunk, _event: FederatedPointerEvent): void {
        if (this.activeChunk) return;
        this.activeChunk = chunk;
        this.updateDropPreview();
        this.app.ticker.add(this.animateDropPreview);
    }

    async createSticker(level: StickerGameLevel, gridSize: number = STICKER_GAME_CONFIG.gideSizeMedium): Promise<boolean> {
        const generation = ++this.generation;
        this.currentLevel = level;
        this.currentGridSize = gridSize;
        const stickerTexture: Texture = await Assets.load(level.path);
        if (generation !== this.generation) return false;

        const { pixels, revision } = await readStickerSource(this.app, stickerTexture);
        if (generation !== this.generation) return false;
        // Release + algorithm + image content + difficulty invalidate saved data.
        const key = `${VERSION}-v1:${level.path}:${revision}:${gridSize}:${STICKER_GAME_CONFIG.visiblePercentage}`;
        const plan = await stickerPreparationCache.get(key, async () => {
            return prepareStickerPixels(pixels.data, pixels.width, pixels.height, gridSize, STICKER_GAME_CONFIG.visiblePercentage);
        });
        if (generation !== this.generation) return false;

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = plan.width;
        maskCanvas.height = plan.height;
        const maskContext = maskCanvas.getContext('2d');
        if (!maskContext) throw new Error('Unable to create sticker slots');
        const image = maskContext.createImageData(plan.width, plan.height);
        for (let i = 0; i < plan.silhouette.length; i++) {
            image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 255;
            image.data[i * 4 + 3] = plan.silhouette[i];
        }
        maskContext.putImageData(image, 0, 0);
        this.maskTexture = Texture.from(maskCanvas);
        // The board starts as a plain silhouette; reveal the artwork only after
        // the puzzle is completed, so the reference image never flashes on entry.
        this.currentStickerSprite = new Sprite(this.maskTexture);
        this.currentStickerSprite.tint = 0xe5e3eb;
        const scale = Math.min(1, this.gameWidth * 0.9 / stickerTexture.width, this.gameHeight * 0.9 / stickerTexture.height);
        this.currentStickerSprite.scale.set(scale);
        this.currentStickerSprite.anchor.set(0.5);
        this.currentStickerSprite.position.set(this.gameWidth / 2, this.gameHeight / 2);
        this.currentStickerSprite.alpha = 0;
        this.holeContainer.alpha = 0;
        this.chunkContainer.eventMode = 'none';
        this.gameContainer.addChild(this.currentStickerSprite, this.holeContainer, this.chunkContainer);

        let deadline = performance.now() + 8;
        for (const choices of plan.cells) {
            const selected = Math.random() > 0.5 ? 0 : Math.random() > 0.5 ? 1 : 2;
            for (const piece of choices[selected]) this.createPiece(piece, stickerTexture);
            if (performance.now() >= deadline) {
                await yieldToBrowser();
                if (generation !== this.generation) return false;
                deadline = performance.now() + 8;
            }
        }
        this.shuffleChunks();
        return true;
    }

    private pieceDisplay(piece: StickerPiece, texture: Texture): Sprite | Graphics {
        const region = new Texture(texture.baseTexture, new Rectangle(piece.x, piece.y, piece.width, piece.height));
        this.pieceTextures.add(region);
        if (!piece.points) return new Sprite(region);
        const triangle = new Graphics();
        triangle.beginTextureFill({ texture: region });
        triangle.drawPolygon(piece.points);
        triangle.endFill();
        return triangle;
    }

    private createPiece(piece: StickerPiece, texture: Texture): void {
        const original = this.currentStickerSprite!;
        const x = original.x - original.width / 2 + piece.x * original.scale.x;
        const y = original.y - original.height / 2 + piece.y * original.scale.y;
        const sprite = this.pieceDisplay(piece, texture);
        sprite.position.set(x, y);
        sprite.scale.copyFrom(original.scale);
        sprite.alpha = 0;
        const chunk = new Chunk(sprite, `chunk_${Object.keys(this.chunks).length + 1}`, this);
        this.chunks[chunk.id] = chunk;
        this.chunkContainer.addChild(sprite);

        // One textured shape per slot instead of thousands of individual rectangles.
        const slot = this.pieceDisplay(piece, this.maskTexture!);
        slot.position.set(x, y);
        slot.scale.copyFrom(original.scale);
        slot.tint = ((Math.floor(Math.random() * 156) + 50) << 16)
            | ((Math.floor(Math.random() * 156) + 50) << 8)
            | (Math.floor(Math.random() * 156) + 50);
        slot.eventMode = 'none';
        this.holeContainer.addChild(slot);
        const hole = new Hole(slot, chunk.id, chunk);
        this.holes[chunk.id] = hole;
        chunk.hole = hole;
    }

    public revealSticker(): Promise<void> {
        const reduced = this.reducedMotion.matches;
        const arrivals = Object.values(this.chunks).map((chunk, i, all) => {
            const targetX = chunk.sprite.x;
            const fromX = targetX < this.gameWidth / 2 ? -chunk.sprite.width - 24 : this.gameWidth + 24;
            chunk.sprite.x = reduced ? targetX : fromX;
            return { sprite: chunk.sprite, targetX, fromX, delay: reduced ? 0 : 260 + i / Math.max(1, all.length - 1) * 180 };
        });
        return new Promise(resolve => {
            let elapsed = 0;
            const finish = () => {
                this.app.ticker.remove(animate);
                this.cancelIntro = null;
                resolve();
            };
            const animate = () => {
                elapsed += this.app.ticker.elapsedMS;
                const slotProgress = Math.min(elapsed / (reduced ? 120 : 300), 1);
                this.holeContainer.alpha = slotProgress;
                if (this.currentStickerSprite) this.currentStickerSprite.alpha = slotProgress;
                let complete = true;
                for (const { sprite, targetX, fromX, delay } of arrivals) {
                    const t = Math.max(0, Math.min((elapsed - delay) / (reduced ? 120 : 450), 1));
                    const eased = 1 - Math.pow(1 - t, 3);
                    sprite.alpha = eased;
                    sprite.x = reduced ? targetX : fromX + (targetX - fromX) * eased;
                    if (t < 1) complete = false;
                }
                if (complete) {
                    this.chunkContainer.eventMode = 'auto';
                    finish();
                }
            };
            this.cancelIntro = finish;
            this.app.ticker.add(animate);
        });
    }

    public shuffleChunks(): void {

        if (!this.currentStickerSprite) {
            return;
        }

        const margin = this.gameWidth * 0.1; // 10% of screen width
        
        for (const chunk of Object.values(this.chunks)) {
            // Randomly choose left or right side
            const useLeftSide = Math.random() > 0.5;
            
            if (useLeftSide) {
                // Left 20% of screen
                chunk.sprite.position.x = Math.random() * margin;
            } else {
                // Right 20% of screen
                chunk.sprite.position.x = this.gameWidth - margin + (Math.random() * margin);
            }
            
            // Random Y position across full height
            chunk.sprite.position.y = Math.random() * this.gameHeight;

            //clamp to inside the screen
            chunk.clamp();
        }
    }

    public clampChunksToScreen(): void {
        // Clamp all chunks to stay within screen bounds
        for (const chunk of Object.values(this.chunks)) {
            chunk.clamp();
        }
    }

    public onMove(event: FederatedPointerEvent){
        if (this.activeChunk) {
            const pos = event.getLocalPosition(this.activeChunk.sprite.parent);
            this.activeChunk.sprite.position.x = pos.x - this.activeChunk.dragOffset.x;
            this.activeChunk.sprite.position.y = pos.y - this.activeChunk.dragOffset.y;
            this.updateDropPreview();
        }
    }

    public onUp(): void {
        if (this.activeChunk) {
            this.clearDropPreview();
            this.activeChunk.onDrop();
            this.activeChunk = null;
            if (this.checkIfAllChunksArePlaced()) {
                if (this.currentStickerSprite) {
                    this.currentStickerSprite.texture = Assets.get(this.currentLevel.path);
                    this.currentStickerSprite.tint = 0xffffff;
                }
                this.game.setLevelCompleted(this.currentLevel.id);
                if (!this.game.finishStorySticker()) this.celebrate();
                
            }
        }

    }

    public snapNextPart(): boolean {
        if (!import.meta.env.DEV) return false;
        const chunk = Object.values(this.chunks).find(part => part.inPlay);
        if (!chunk) return false;
        this.clearDropPreview();
        this.activeChunk = chunk;
        chunk.sprite.position.set(chunk.originX, chunk.originY);
        this.onUp();
        return true;
    }



    public createSnapParticles(x: number, y: number): void {
        const particleCount = 30;
        
        for (let i = 0; i < particleCount; i++) {
            // Create simple white circle particle
            const particle = new Graphics();
            const size = Math.random() * 4 + 2; // 3-9 pixels
            
            particle.beginFill(0xFFFFFF); // White
            particle.drawCircle(0, 0, size);
            particle.endFill();
            
            // Position at snap point
            particle.position.set(x, y);
            
            // Random velocity
            const angle = (Math.PI * 2 * i / particleCount) + (Math.random() - 0.5) * 0.8;
            const speed = Math.random() * 3 + 4;
            const velocityX = Math.cos(angle) * speed;
            const velocityY = Math.sin(angle) * speed;
            
            // Add to game container
            this.gameContainer.addChild(particle);
            
            // Animate particle
            let life = 30; // 1 second at 60fps
            const gravity = 0.3;
            let currentVelX = velocityX;
            let currentVelY = velocityY;
            
            const particleTicker = (deltaTime: number) => {
                life -= deltaTime;
                
                // Apply physics
                currentVelY += gravity * deltaTime;
                particle.position.x += currentVelX * deltaTime;
                particle.position.y += currentVelY * deltaTime;
                
                // Fade out
                particle.alpha = life / 30;
                
                // Scale down slightly
                const scale = (life / 30)  + 0.1;
                particle.scale.set(scale);
                
                // Remove when done
                if (life <= 0) {
                    this.app.ticker.remove(particleTicker);
                    this.gameContainer.removeChild(particle);
                    particle.destroy();
                }
            };
            
            this.app.ticker.add(particleTicker);
        }
    }

    public checkIfAllChunksArePlaced(): boolean {
        return Object.values(this.chunks).every(chunk => chunk.inPlay === false);
    }

    public cleanup(): void {
        this.generation++;
        this.cancelCelebration?.();
        this.cancelIntro?.();
        this.clearDropPreview();
        // Stop all active chunk animations
        for (const chunk of Object.values(this.chunks)) {
            if (chunk.sprite.parent) {
                chunk.sprite.parent.removeChild(chunk.sprite);
            }
            chunk.sprite.destroy({ children: true });
        }

        // Clean up holes
        for (const hole of Object.values(this.holes)) {
            if (hole.graphics.parent) {
                hole.graphics.parent.removeChild(hole.graphics);
            }
            hole.destroy();
        }

        // Clean up current sticker sprite
        if (this.currentStickerSprite) {
            if (this.currentStickerSprite.parent) {
                this.currentStickerSprite.parent.removeChild(this.currentStickerSprite);
            }
            this.currentStickerSprite.destroy();
            this.currentStickerSprite = null;
        }

        // Clear containers
        this.holeContainer.removeChildren();
        this.chunkContainer.removeChildren();
        for (const texture of this.pieceTextures) texture.destroy();
        this.pieceTextures.clear();
        this.maskTexture?.destroy(true);
        this.maskTexture = null;

        // Reset state
        this.chunks = {};
        this.holes = {};
        this.activeChunk = null;

        // Remove containers from parent if they exist
        if (this.holeContainer.parent) {
            this.holeContainer.parent.removeChild(this.holeContainer);
        }
        if (this.chunkContainer.parent) {
            this.chunkContainer.parent.removeChild(this.chunkContainer);
        }
    }


    public celebrate(): void {
        this.cancelCelebration?.();
        const original = this.currentStickerSprite;
        if (!original) return;
        const reduced = this.reducedMotion.matches;
        const overlay = new Container();
        overlay.eventMode = 'none';
        this.gameContainer.addChild(overlay);
        const dim = new Graphics();
        overlay.addChild(dim);
        const rays = new Graphics();
        const colors = [0xffd886, 0xa28cff, 0x75eaff, 0xffa8dc];
        for (let i = 0; i < 16; i++) {
            const a = i * Math.PI / 8;
            const radius = 1000;
            rays.beginFill(colors[i % colors.length], i % 2 ? 0.08 : 0.16);
            rays.drawPolygon([0, 0, Math.cos(a) * radius, Math.sin(a) * radius,
                Math.cos(a + 0.085) * radius, Math.sin(a + 0.085) * radius]);
            rays.endFill();
        }
        rays.blendMode = BLEND_MODES.ADD;
        overlay.addChild(rays);
        const halo = new Graphics();
        for (let i = 10; i >= 1; i--) {
            halo.beginFill(i % 2 ? 0x9d70ff : 0xffd786, 0.018);
            halo.drawCircle(0, 0, 80 + i * 16);
            halo.endFill();
        }
        overlay.addChild(halo);
        const hero = new Sprite(original.texture);
        hero.anchor.set(0.5);
        overlay.addChild(hero);
        // The foil light is applied only to opaque artwork, preserving its cutout.
        const foil = new Filter(undefined, `
            varying vec2 vTextureCoord;
            uniform sampler2D uSampler;
            uniform vec4 inputClamp;
            uniform float sweep;
            uniform float strength;
            void main() {
                vec4 art = texture2D(uSampler, vTextureCoord);
                vec2 uv = (vTextureCoord - inputClamp.xy) / (inputClamp.zw - inputClamp.xy);
                float band = exp(-pow((uv.x + uv.y * 0.45 - sweep) * 5.0, 2.0));
                vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (uv.x * 0.65 + uv.y * 0.4 + vec3(0.0, 0.33, 0.67)));
                art.rgb = mix(art.rgb, rainbow * art.a, band * strength * 0.45);
                art.rgb += vec3(band * strength * 0.3) * art.a;
                gl_FragColor = art;
            }
        `, { sweep: -0.4, strength: reduced ? 0 : 1 });
        hero.filters = [foil];
        const sparkles = new Container();
        overlay.addChild(sparkles);
        const glints = Array.from({ length: 24 }, (_, i) => {
            const star = new Graphics();
            star.beginFill(i % 3 === 0 ? 0xffd886 : 0xffffff);
            star.drawPolygon([0, -9, 2, -2, 9, 0, 2, 2, 0, 9, -2, 2, -9, 0, -2, -2]);
            star.endFill();
            star.blendMode = BLEND_MODES.ADD;
            sparkles.addChild(star);
            return { star, angle: i * Math.PI * 2 / 24, phase: i * 1.7 };
        });
        const label = new Text('LEGENDARY STICKER', {
            fontFamily: 'Trebuchet MS, sans-serif', fontSize: 16, fontWeight: 'bold',
            fill: '#ffe4a2', letterSpacing: 4,
        });
        label.anchor.set(0.5);
        overlay.addChild(label);
        const stamp = new Container();
        const stampPlate = new Graphics();
        stampPlate.lineStyle(3, 0xffdf91).beginFill(0x332450, 0.94);
        stampPlate.drawRoundedRect(-150, -30, 300, 60, 14).endFill();
        const stampText = new Text('COLLECTED!', {
            fontFamily: 'Trebuchet MS, sans-serif', fontSize: 34, fontWeight: '900',
            fill: '#fff2c8', letterSpacing: 3,
        });
        stampText.anchor.set(0.5);
        stamp.addChild(stampPlate, stampText);
        overlay.addChild(stamp);
        const subtitle = new Text('Added to your collection', {
            fontFamily: 'Trebuchet MS, sans-serif', fontSize: 15, fill: '#ddd1f4',
        });
        subtitle.anchor.set(0.5);
        overlay.addChild(subtitle);
        original.visible = false;
        this.chunkContainer.visible = false;
        this.holeContainer.visible = false;

        // One clock owns the entire reveal; leaving the level cancels it and its audio.
        let elapsed = 0;
        let impactPlayed = false;
        let audio: AudioContext | null = null;
        try { audio = new AudioContext(); void audio.resume().catch(() => {}); } catch { /* Silent fallback. */ }
        const tone = (frequency: number, delay: number, duration: number, volume: number) => {
            if (!audio || audio.state === 'closed') return;
            const oscillator = audio.createOscillator();
            const gain = audio.createGain();
            const start = audio.currentTime + delay;
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, start);
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(volume, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
            oscillator.connect(gain);
            gain.connect(audio.destination);
            oscillator.start(start);
            oscillator.stop(start + duration);
            oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        };
        [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => tone(note, i * 0.14, 0.6, 0.045));
        const progress = (start: number, duration: number) => Math.max(0, Math.min(1, (elapsed - start) / duration));
        const animate = () => {
            elapsed += this.app.ticker.elapsedMS;
            const w = this.gameWidth, h = this.gameHeight;
            const lift = reduced ? 1 : 1 - Math.pow(1 - progress(120, 900), 3);
            const reveal = reduced ? 1 : progress(0, 450);
            const artWidth = Math.min(w * 0.76, h * 0.62, 520);
            const artHeight = Math.max(48, Math.min(h * 0.53, h - 240, 520));
            const cx = w / 2, cy = Math.min(h * 0.43, h - 180 - artHeight / 2);
            const targetScale = Math.min(artWidth / hero.texture.width, artHeight / hero.texture.height);
            dim.clear().beginFill(0x130e2b, 0.88 * reveal).drawRect(0, 0, w, h).endFill();
            hero.position.set(original.x + (cx - original.x) * lift, original.y + (cy - original.y) * lift);
            const heroScale = original.scale.x + (targetScale - original.scale.x) * lift;
            hero.scale.set(heroScale * (reduced ? 1 : 1 + Math.sin(progress(120, 900) * Math.PI) * 0.09), heroScale);
            hero.rotation = reduced ? 0 : Math.sin(progress(120, 1100) * Math.PI * 2) * 0.07;
            hero.skew.y = reduced ? 0 : Math.sin(progress(300, 1900) * Math.PI * 2) * 0.06;
            foil.uniforms.sweep = -0.4 + progress(600, 1500) * 2.1;
            foil.uniforms.strength = reduced ? 0 : 1 - progress(2900, 500);
            rays.position.set(cx, cy);
            rays.rotation = reduced ? 0 : elapsed * 0.00007;
            rays.alpha = reveal * (0.75 + (reduced ? 0 : Math.sin(elapsed * 0.002) * 0.2));
            halo.position.set(cx, cy);
            halo.scale.set(Math.min(artWidth, artHeight) / 350);
            halo.alpha = reveal;
            for (const { star, angle, phase } of glints) {
                star.position.set(cx + Math.cos(angle) * (hero.width / 2 + 24), cy + Math.sin(angle) * (hero.height / 2 + 22));
                const twinkle = reduced ? 0.65 : Math.max(0, Math.sin(elapsed * 0.004 + phase));
                star.alpha = reveal * twinkle;
                star.scale.set(0.35 + twinkle * 0.65);
            }
            label.position.set(cx, Math.max(30, cy - hero.height / 2 - 35));
            label.scale.set(Math.min(1, (w - 32) / label.width * label.scale.x));
            label.alpha = reveal;
            const hit = reduced ? 1 : progress(1900, 280);
            const settle = 1 + Math.sin(hit * Math.PI) * 0.35;
            stamp.position.set(cx, cy + artHeight / 2 + 45);
            stamp.scale.set(Math.min(1, (w - 32) / 300) * settle);
            stamp.rotation = reduced ? 0 : -0.04 * hit;
            stamp.alpha = hit;
            subtitle.position.set(cx, stamp.y + 50);
            subtitle.alpha = reduced ? 1 : progress(2250, 350);
            if (hit > 0 && !impactPlayed) {
                impactPlayed = true;
                tone(130.81, 0, 0.3, 0.1);
                [523.25, 659.25, 783.99, 1046.5].forEach(note => tone(note, 0.03, 0.85, 0.035));
            }
            if (elapsed >= (reduced ? 300 : 3400)) {
                this.app.ticker.remove(animate);
                hero.filters = null;
                this.game.showReturnButton();
                if (audio) { void audio.close().catch(() => {}); audio = null; }
            }
        };
        // Keep the settled presentation responsive after its animation clock stops.
        const onResize = () => animate();
        window.addEventListener('resize', onResize);
        this.cancelCelebration = () => {
            this.app.ticker.remove(animate);
            window.removeEventListener('resize', onResize);
            if (audio) { void audio.close().catch(() => {}); audio = null; }
            hero.filters = null;
            foil.destroy();
            overlay.destroy({ children: true });
            original.visible = true;
            this.chunkContainer.visible = true;
            this.holeContainer.visible = true;
            this.cancelCelebration = null;
        };
        this.app.ticker.add(animate);
    }

}
