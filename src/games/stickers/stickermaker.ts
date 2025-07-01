import { Application, Container, Graphics, Sprite, Texture, Assets, Rectangle, RenderTexture, FederatedPointerEvent, ColorMatrixFilter } from 'pixi.js';
import { Pnt } from '../../shared/utils/shared-types';
import { STICKER_GAME_CONFIG } from './game';

export class Chunk {
    sprite: Sprite | Graphics;
    id: string;
    originX: number; // the x when it was made, before moving
    originY: number; // the y when it was made, before moving
    dragOffset: Pnt = { x: 0, y: 0 };

    public hole: Hole | null = null;
    public inPlay: boolean = false;

    private stickerMaker: StickerMaker;

    constructor(sprite: Sprite | Graphics, id: string, stickerMaker: StickerMaker) {
        this.sprite = sprite;
        this.id = id;
        this.originX = sprite.position.x;
        this.originY = sprite.position.y;
        this.stickerMaker = stickerMaker;
        this.makeDraggable();
        this.inPlay = true;
    }

    private makeDraggable(): void {
        this.sprite.eventMode = 'static';
        this.sprite.cursor = 'pointer';

        this.sprite.on('pointerdown', (event: FederatedPointerEvent) => {

            if (!this.inPlay) {
                console.log('chunk already in play, ignoring pointerdown');
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

    public checkSnapToHole(): void {

        //check if the chunk is close to the hole (its origin)
        const distance = Math.sqrt(Math.pow(this.sprite.position.x - this.originX, 2) + Math.pow(this.sprite.position.y - this.originY, 2));
        const relativeSnapThreshold = STICKER_GAME_CONFIG.snapThreshold / STICKER_GAME_CONFIG.gideSize;

        if (distance < relativeSnapThreshold) {
            //snap to the hole
            this.sprite.position.x = this.originX;
            this.sprite.position.y = this.originY;
            this.correctlyPlaced();
        }

    }

    public onDrop(): void {

        // //dont allow parts to leave the screen
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

        this.checkSnapToHole();
    }

    public correctlyPlaced(): void {
        this.sprite.alpha = 1;
        this.inPlay = false;
        this.sprite.eventMode = 'none';
        this.sprite.cursor = 'default';

        //make chunk first child of its parent
        this.sprite.parent.setChildIndex(this.sprite, 0);
        
        // Create a smooth brightness pulse animation using PIXI ticker
        const brightnessFilter = new ColorMatrixFilter();
        this.sprite.filters = [brightnessFilter];
        
        let elapsed = 0;
        const duration = 50; // 4 seconds in milliseconds
        
        const animationTicker = (deltaTime: number) => {
            elapsed += deltaTime; // Convert to milliseconds (60fps = 16.67ms per frame)
            
            const progress = Math.min(elapsed / duration, 1);
            
            let brightness: number;
            if (progress < 0.25) {
                // Ease in to max brightness (0 to 0.25)
                const t = progress / 0.25;
                const eased = t * t; // Quadratic ease in
                brightness = 2 + eased * 3;
            } else if (progress < 0.875) {
                // Ease out from max brightness (0.625 to 0.875)
                const t = (progress - 0.625) / 0.25;
                const eased = 1 - (1 - t) * (1 - t); // Quadratic ease out
                brightness = 3 - eased * 2;
            } else {
                // Back to normal (0.875 to 1)
                brightness = 1;
            }
            
            brightnessFilter.brightness(brightness, false);
            
            // Clean up when animation is complete
            if (progress >= 1) {
                this.sprite.filters = [];
                this.stickerMaker.app.ticker.remove(animationTicker);
            }
        };
        
        // Add to the app's ticker for smooth 60fps animation
        this.stickerMaker.app.ticker.add(animationTicker);
    }
}

export class Hole {
    id: string;

    chunk: Chunk;
    graphics: Graphics;

    constructor(graphics: Graphics, id: string, chunk: Chunk) {
        this.id = id;

        this.chunk = chunk;
        this.graphics = graphics;
    }
}

export class StickerMaker {
    public app: Application;
    public gameContainer: Container;
    public currentStickerSprite: Sprite | null = null;
    public gameWidth: number;
    public gameHeight: number;

    private holeContainer: Container;
    private chunkContainer: Container;

    public chunks: Record<string, Chunk> = {};
    public holes: Record<string, Hole> = {};
    public activeChunk: Chunk | null = null;

    constructor(app: Application, gameContainer: Container, gameWidth: number, gameHeight: number) {
        this.app = app;
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

    private handleStartDrag(chunk: Chunk, event: FederatedPointerEvent): void {
        if (this.activeChunk) return;
        this.activeChunk = chunk;
    }

    async createSticker(assetPath: string): Promise<void> {

        const start = performance.now();

        // STEP 1: first load a lion sticker sprite image and paint it on the canvas

        // Get the cached texture from PixiJS
        const stickerTexture = await Assets.load(assetPath);
        
        // Create sprite from the texture
        this.currentStickerSprite = new Sprite(stickerTexture);

        // Ensure sprite doesn't exceed canvas size while preserving aspect ratio
        const maxWidth = this.gameWidth * 0.9; // 90% of canvas width
        const maxHeight = this.gameHeight * 0.9; // 90% of canvas height
        
        if (this.currentStickerSprite.width > maxWidth || this.currentStickerSprite.height > maxHeight) {
            // Calculate scale factors for both dimensions
            const scaleX = maxWidth / this.currentStickerSprite.width;
            const scaleY = maxHeight / this.currentStickerSprite.height;
            
            // Use the smaller scale to preserve aspect ratio (no distortion)
            const scale = Math.min(scaleX, scaleY);
            this.currentStickerSprite.scale.set(scale);
        }
        
        // Center the sprite
        this.currentStickerSprite.anchor.set(0.5, 0.5);
        this.currentStickerSprite.position.set(
            this.gameWidth / 2,
            this.gameHeight / 2
        );
        
        // Add sticker sprite first (bottom layer)
        this.gameContainer.addChild(this.currentStickerSprite);
        this.gameContainer.addChild(this.holeContainer);
        this.gameContainer.addChild(this.chunkContainer);

        
        // STEP 2: then make a copy of the lion sticker and break it into triangles and squares, and make them draggable 'parts'
        // STEP 3: as you make the 'parts' under the part paint over the original sprite random colors, so dragging the part away would show the colored sections called 'holes'
        this.cutIntoTrianglesAndSquares(stickerTexture);

        const end = performance.now();
        console.log(`Time taken: ${end - start}ms`);

        this.shuffleChunks();

    }

    private cutIntoTrianglesAndSquares(stickerTexture: Texture) {
        // Extract pixel data to check for non-transparent areas
        const renderTexture = RenderTexture.create({
            width: stickerTexture.width,
            height: stickerTexture.height
        });
        
        const tempSprite = new Sprite(stickerTexture);
        this.app.renderer.render(tempSprite, { renderTexture });
        
        const canvas = this.app.renderer.extract.canvas(renderTexture);
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Create a grid of squares and triangles with perfect coverage
        const gridSize = STICKER_GAME_CONFIG.gideSize; 

        // Calculate grid cell dimensions that provide perfect coverage
        const gridWidth = stickerTexture.width / gridSize;
        const gridHeight = stickerTexture.height / gridSize;

        for (let row = 0; row < gridSize; row++) {
            for (let col = 0; col < gridSize; col++) {
                const x1 = Math.round(col * gridWidth);
                const y1 = Math.round(row * gridHeight);
                const x2 = Math.round((col + 1) * gridWidth);
                const y2 = Math.round((row + 1) * gridHeight);

                // Check if grid cell contains any non-transparent pixels
                let hasContent = false;
                let visiblePixels = 0;
                const totalPixels = (x2 - x1) * (y2 - y1);
                
                for (let y = y1; y < y2; y++) {
                    for (let x = x1; x < x2; x++) {
                        const index = (y * canvas.width + x) * 4;
                        const alpha = data[index + 3];
                        if (alpha > 128) {
                            hasContent = true;
                            visiblePixels++;
                        }
                    }
                }
                
                // Only create chunks if at least 10% of the cell has visible pixels
                const visiblePercentage = visiblePixels / totalPixels;
                if (hasContent && visiblePercentage >= STICKER_GAME_CONFIG.visiblePercentage) {
                    // Create draggable pieces for areas with content
                    const useSquare = Math.random() > 0.5;
                    
                    if (useSquare) {
                        // Create a draggable square
                        this.createDraggableSquareFromTexture(x1, y1, x2, y2, stickerTexture);
                    } else {
                        // Create two draggable triangles
                        const diagonal = Math.random() > 0.5;
                        if (diagonal) {
                            // Diagonal from top-left to bottom-right
                            this.createDraggableTriangleFromTexture(x1, y1, x2, y1, x1, y2, stickerTexture);
                            this.createDraggableTriangleFromTexture(x2, y1, x2, y2, x1, y2, stickerTexture);
                        } else {
                            // Diagonal from top-right to bottom-left
                            this.createDraggableTriangleFromTexture(x1, y1, x2, y1, x2, y2, stickerTexture);
                            this.createDraggableTriangleFromTexture(x1, y1, x2, y2, x1, y2, stickerTexture);
                        }
                    }
                }
            }
        }
        
        // Clean up
        renderTexture.destroy(true);
    }

    private createDraggableSquareFromTexture(x1: number, y1: number, x2: number, y2: number, texture: Texture): void {

        if (!this.currentStickerSprite) {
            throw new Error('Sticker sprite not found');
        }

        // Create a texture region for this square
        const sourceRect = new Rectangle(x1, y1, x2 - x1, y2 - y1);
        const extractedTexture = new Texture(texture.baseTexture, sourceRect);
        
        // Create sprite from the extracted texture
        const sprite = new Sprite(extractedTexture);
        
        // Position the sprite at the correct location on screen
        const spriteLeft = this.currentStickerSprite.position.x - (this.currentStickerSprite.width / 2);
        const spriteTop = this.currentStickerSprite.position.y - (this.currentStickerSprite.height / 2);
        
        sprite.position.set(
            spriteLeft + (x1 * this.currentStickerSprite.scale.x),
            spriteTop + (y1 * this.currentStickerSprite.scale.y)
        );
        sprite.scale.set(this.currentStickerSprite.scale.x, this.currentStickerSprite.scale.y);

        const chunk = new Chunk(sprite, `chunk_${Object.keys(this.chunks).length + 1}`, this);


        // Add to chunks
        this.chunks[chunk.id] = chunk;

        // Add to game container
        this.chunkContainer.addChild(sprite);
        
        // Paint hole directly from the sprite we just created
        this.paintHoleFromSprite(chunk, x2 - x1, y2 - y1);
    }

    private createDraggableTriangleFromTexture(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, texture: Texture): void {

        if (!this.currentStickerSprite) {
            throw new Error('Sticker sprite not found.');
        }

        // Calculate bounding box of triangle
        const minX = Math.min(x1, x2, x3);
        const minY = Math.min(y1, y2, y3);
        const maxX = Math.max(x1, x2, x3);
        const maxY = Math.max(y1, y2, y3);
        
        // Create texture region
        const sourceRect = new Rectangle(minX, minY, maxX - minX, maxY - minY);
        const extractedTexture = new Texture(texture.baseTexture, sourceRect);
        
        // Create a Graphics object with triangle shape
        const triangle = new Graphics();
        triangle.beginTextureFill({ texture: extractedTexture });
        triangle.moveTo(x1 - minX, y1 - minY);
        triangle.lineTo(x2 - minX, y2 - minY);
        triangle.lineTo(x3 - minX, y3 - minY);
        triangle.lineTo(x1 - minX, y1 - minY);
        triangle.endFill();
        
        // Position the triangle at the correct location on screen
        const spriteLeft = this.currentStickerSprite.position.x - (this.currentStickerSprite.width / 2);
        const spriteTop = this.currentStickerSprite.position.y - (this.currentStickerSprite.height / 2);
        
        triangle.position.set(
            spriteLeft + (minX * this.currentStickerSprite.scale.x),
            spriteTop + (minY * this.currentStickerSprite.scale.y)
        );
        triangle.scale.set(this.currentStickerSprite.scale.x, this.currentStickerSprite.scale.y);

        const chunk = new Chunk(triangle, `chunk_${Object.keys(this.chunks).length + 1}`, this);
        
        // Add to chunks
        this.chunks[chunk.id] = chunk;
        // Add to game container
        this.chunkContainer.addChild(triangle);
        
        // Paint hole directly from the triangle we just created
        this.paintHoleFromSprite(chunk, maxX - minX, maxY - minY);
    }

    private paintHoleFromSprite(chunk: Chunk, width: number, height: number): void {

        if (!this.currentStickerSprite) {
            throw new Error('Sticker sprite not found');
        }

        // Create a temporary sprite/graphics at original scale and position to get clean pixel data
        let tempDisplayObject: Sprite | Graphics;
        
        if (chunk.sprite instanceof Sprite) {
            tempDisplayObject = new Sprite(chunk.sprite.texture);
        } else {
            // For Graphics objects, we need to clone it
            tempDisplayObject = chunk.sprite.clone();
        }
        
        // Reset position and scale to get raw pixel data
        tempDisplayObject.position.set(0, 0);
        tempDisplayObject.scale.set(1, 1);
        
        // Render at original size
        const renderTexture = RenderTexture.create({
            width: width,
            height: height
        });
        
        this.app.renderer.render(tempDisplayObject, { renderTexture });
        const canvas = this.app.renderer.extract.canvas(renderTexture);
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // Generate colors
        const brightR = Math.floor(Math.random() * 156) + 100;
        const brightG = Math.floor(Math.random() * 156) + 100;
        const brightB = Math.floor(Math.random() * 156) + 100;
        const brightColor = (brightR << 16) | (brightG << 8) | brightB;
        
        // const grayValue = Math.floor(Math.random() * 100) + 100;
        // const grayColor = (grayValue << 16) | (grayValue << 8) | grayValue;
        
        // Create Graphics object to paint the hole pixel by pixel
        const holeGraphics = new Graphics();
        
        // Paint each pixel using the clean pixel data
        for (let py = 0; py < height; py++) {
            for (let px = 0; px < width; px++) {
                const index = (py * width + px) * 4;
                const alpha = data[index + 3];
                
                if (alpha > 128) { // Only paint visible pixels
                    //const pixelColor = alpha > 128 ? brightColor : grayColor;
                    
                    holeGraphics.beginFill(brightColor);
                    holeGraphics.drawRect(
                        chunk.sprite.position.x + (px * chunk.sprite.scale.x),
                        chunk.sprite.position.y + (py * chunk.sprite.scale.y),
                        1, 1
                    );
                    holeGraphics.endFill();
                }
            }
        }
        
        // Add as child to the hole container (above sticker sprite, below chunks)
        this.holeContainer.addChild(holeGraphics);
        const hole = new Hole(holeGraphics, chunk.id, chunk);
        this.holes[chunk.id] = hole;
        chunk.hole = hole;
        
        // Clean up
        renderTexture.destroy(true);
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
            if (chunk.sprite.position.x < 0) {
                chunk.sprite.position.x = 0;
            }
            if (chunk.sprite.position.x > this.gameWidth - chunk.sprite.width) {
                chunk.sprite.position.x = this.gameWidth - chunk.sprite.width;
            }
            if (chunk.sprite.position.y < 0) {
                chunk.sprite.position.y = 0;
            }
            if (chunk.sprite.position.y > this.gameHeight - chunk.sprite.height) {
                chunk.sprite.position.y = this.gameHeight - chunk.sprite.height;
            }
        }
    }


    public onMove(event: FederatedPointerEvent){
        if (this.activeChunk) {
            const pos = event.getLocalPosition(this.activeChunk.sprite.parent);
            this.activeChunk.sprite.position.x = pos.x - this.activeChunk.dragOffset.x;
            this.activeChunk.sprite.position.y = pos.y - this.activeChunk.dragOffset.y;
        }
    }

    public onUp(): void {
        if (this.activeChunk) {
            this.activeChunk.onDrop();
            this.activeChunk = null;
        }
    }


}
