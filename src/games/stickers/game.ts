import { Application, Container, Graphics, Sprite, Texture, Assets, Rectangle, RenderTexture } from 'pixi.js';


// Responsive scaling function
const getGameDimensions = () => {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const topBarHeight = 60; // Height of the top bar
    
    return {
        gameWidth: windowWidth,
        gameHeight: windowHeight - topBarHeight, // Subtract top bar height
        scale: 1
    };
};

export class StickersGame {
    private app: Application;
    private gameContainer: Container;
    private stickerSprite!: Sprite;
    private removeTopBarHandler?: () => void;
    private gameDimensions: ReturnType<typeof getGameDimensions>;
    private currentlyDraggedPart: Sprite | Graphics | null = null;
    private dragOffset = { x: 0, y: 0 };

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.app.stage.addChild(this.gameContainer);
        
        // Get initial dimensions
        this.gameDimensions = getGameDimensions();
        
        // Set up global pointer events
        this.setupGlobalPointerEvents();
    }

    async init(): Promise<void> {
        // Create game background
        this.createBackground();
        
        // Create apple sprite
        await this.createSticker();
        
        // Set up top bar events
        this.setupTopBarEvents();
    }

    private createBackground(): void {
        const background = new Graphics();
        background.beginFill(0xffffff); // White background
        background.drawRect(0, 0, this.gameDimensions.gameWidth, this.gameDimensions.gameHeight);
        background.endFill();
        
        this.gameContainer.addChild(background);
    }

    private async createSticker(): Promise<void> {
        // Get the cached texture from PixiJS
        const stickerTexture = await Assets.load('/arcade/assets/stickers/lion.png');
        
        // Create sprite from the texture
        this.stickerSprite = new Sprite(stickerTexture);

        // Ensure sprite doesn't exceed canvas size while preserving aspect ratio
        const maxWidth = this.gameDimensions.gameWidth * 0.9; // 90% of canvas width
        const maxHeight = this.gameDimensions.gameHeight * 0.9; // 90% of canvas height
        
        if (this.stickerSprite.width > maxWidth || this.stickerSprite.height > maxHeight) {
            // Calculate scale factors for both dimensions
            const scaleX = maxWidth / this.stickerSprite.width;
            const scaleY = maxHeight / this.stickerSprite.height;
            
            // Use the smaller scale to preserve aspect ratio (no distortion)
            const scale = Math.min(scaleX, scaleY);
            this.stickerSprite.scale.set(scale);
        }
        
        // Center the sprite
        this.stickerSprite.anchor.set(0.5, 0.5);
        this.stickerSprite.position.set(
            this.gameDimensions.gameWidth / 2,
            this.gameDimensions.gameHeight / 2
        );
        
        this.gameContainer.addChild(this.stickerSprite);
        
        // Draw a red dot on a random point inside the sticker AFTER adding the sprite
        await this.drawRedDotOnSticker(stickerTexture);
    }

    private async drawRedDotOnSticker(texture: any): Promise<void> {
        // Use PixiJS RenderTexture to extract pixel data
        const renderTexture = RenderTexture.create({
            width: this.stickerSprite.texture.width,
            height: this.stickerSprite.texture.height
        });
        
        // Create a temporary sprite with the original texture at original size
        const tempSprite = new Sprite(this.stickerSprite.texture);
        tempSprite.scale.set(1, 1); // No scaling
        
        // Render the texture to get pixel data
        this.app.renderer.render(tempSprite, { renderTexture });
        
        // Get the canvas from the render texture
        const canvas = this.app.renderer.extract.canvas(renderTexture);
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Create grid-based triangulation
        const gridSize = 200; // Size of each grid cell
        const cols = Math.ceil(canvas.width / gridSize);
        const rows = Math.ceil(canvas.height / gridSize);
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x1 = col * gridSize;
                const y1 = row * gridSize;
                const x2 = x1 + gridSize;
                const y2 = y1 + gridSize;
                
                // Check if grid cell contains any lion pixels
                let hasLionPixels = false;
                for (let y = y1; y < y2 && y < canvas.height; y++) {
                    for (let x = x1; x < x2 && x < canvas.width; x++) {
                        const index = (y * canvas.width + x) * 4;
                        const alpha = data[index + 3];
                        if (alpha > 128) {
                            hasLionPixels = true;
                            break;
                        }
                    }
                    if (hasLionPixels) break;
                }
                
                if (hasLionPixels) {
                    // Randomly choose diagonal direction for triangle split
                    const flipDiagonal = Math.random() > 0.5;
                    
                    if (flipDiagonal) {
                        // Diagonal from top-left to bottom-right
                        const triangle1 = new Graphics();
                        triangle1.lineStyle(2, 0xFF0000);
                        triangle1.moveTo(x1, y1);
                        triangle1.lineTo(x2, y1);
                        triangle1.lineTo(x1, y2);
                        triangle1.lineTo(x1, y1);
                        
                        const triangle2 = new Graphics();
                        triangle2.lineStyle(2, 0xFF0000);
                        triangle2.moveTo(x2, y1);
                        triangle2.lineTo(x2, y2);
                        triangle2.lineTo(x1, y2);
                        triangle2.lineTo(x2, y1);
                        
                        // Calculate the correct position relative to the sprite
                        const spriteLeft = this.stickerSprite.position.x - (this.stickerSprite.width / 2);
                        const spriteTop = this.stickerSprite.position.y - (this.stickerSprite.height / 2);
                        
                        // Position the triangles at the correct location relative to the sprite
                        triangle1.position.set(
                            spriteLeft + (0 * this.stickerSprite.scale.x),
                            spriteTop + (0 * this.stickerSprite.scale.y)
                        );
                        triangle1.scale.set(this.stickerSprite.scale.x, this.stickerSprite.scale.y);
                        
                        triangle2.position.set(
                            spriteLeft + (0 * this.stickerSprite.scale.x),
                            spriteTop + (0 * this.stickerSprite.scale.y)
                        );
                        triangle2.scale.set(this.stickerSprite.scale.x, this.stickerSprite.scale.y);
                        
                        // Randomly draw a square instead of triangles
                        if (Math.random() > 0.7) {
                            const square = new Graphics();
                            square.lineStyle(2, 0xFF0000);
                            square.moveTo(x1, y1);
                            square.lineTo(x2, y1);
                            square.lineTo(x2, y2);
                            square.lineTo(x1, y2);
                            square.lineTo(x1, y1);
                            
                            square.position.set(
                                spriteLeft + (0 * this.stickerSprite.scale.x),
                                spriteTop + (0 * this.stickerSprite.scale.y)
                            );
                            square.scale.set(this.stickerSprite.scale.x, this.stickerSprite.scale.y);
                            
                            this.gameContainer.addChild(square);
                            
                            // Create draggable sprite for square
                            this.createDraggableSquare(x1, y1, x2, y2, texture);
                        } else {
                            // Add triangles to game container
                            this.gameContainer.addChild(triangle1);
                            this.gameContainer.addChild(triangle2);
                            
                            // Create draggable sprites for triangles
                            this.createDraggableTriangle(x1, y1, x2, y1, x1, y2, texture);
                            this.createDraggableTriangle(x2, y1, x2, y2, x1, y2, texture);
                        }
                    } else {
                        // Diagonal from top-right to bottom-left
                        const triangle1 = new Graphics();
                        triangle1.lineStyle(2, 0xFF0000);
                        triangle1.moveTo(x1, y1);
                        triangle1.lineTo(x2, y1);
                        triangle1.lineTo(x2, y2);
                        triangle1.lineTo(x1, y1);
                        
                        const triangle2 = new Graphics();
                        triangle2.lineStyle(2, 0xFF0000);
                        triangle2.moveTo(x1, y1);
                        triangle2.lineTo(x2, y2);
                        triangle2.lineTo(x1, y2);
                        triangle2.lineTo(x1, y1);
                        
                        // Calculate the correct position relative to the sprite
                        const spriteLeft = this.stickerSprite.position.x - (this.stickerSprite.width / 2);
                        const spriteTop = this.stickerSprite.position.y - (this.stickerSprite.height / 2);
                        
                        // Position the triangles at the correct location relative to the sprite
                        triangle1.position.set(
                            spriteLeft + (0 * this.stickerSprite.scale.x),
                            spriteTop + (0 * this.stickerSprite.scale.y)
                        );
                        triangle1.scale.set(this.stickerSprite.scale.x, this.stickerSprite.scale.y);
                        
                        triangle2.position.set(
                            spriteLeft + (0 * this.stickerSprite.scale.x),
                            spriteTop + (0 * this.stickerSprite.scale.y)
                        );
                        triangle2.scale.set(this.stickerSprite.scale.x, this.stickerSprite.scale.y);
                        
                        // Randomly draw a square instead of triangles
                        if (Math.random() > 0.7) {
                            const square = new Graphics();
                            square.lineStyle(2, 0xFF0000);
                            square.moveTo(x1, y1);
                            square.lineTo(x2, y1);
                            square.lineTo(x2, y2);
                            square.lineTo(x1, y2);
                            square.lineTo(x1, y1);
                            
                            square.position.set(
                                spriteLeft + (0 * this.stickerSprite.scale.x),
                                spriteTop + (0 * this.stickerSprite.scale.y)
                            );
                            square.scale.set(this.stickerSprite.scale.x, this.stickerSprite.scale.y);
                            
                            this.gameContainer.addChild(square);
                            
                            // Create draggable sprite for square
                            this.createDraggableSquare(x1, y1, x2, y2, texture);
                        } else {
                            // Add triangles to game container
                            this.gameContainer.addChild(triangle1);
                            this.gameContainer.addChild(triangle2);
                            
                            // Create draggable sprites for triangles
                            this.createDraggableTriangle(x1, y1, x2, y1, x2, y2, texture);
                            this.createDraggableTriangle(x1, y1, x2, y2, x1, y2, texture);
                        }
                    }
                }
            }
        }
    }

    private findRandomInsidePoint(data: Uint8ClampedArray, width: number, height: number): {x: number, y: number} {
        // Debug: log some pixel values
        console.log('Image dimensions:', width, height);
        
        // Try random points until we find one that's actually visible
        for (let attempts = 0; attempts < 1000; attempts++) {
            const x = Math.floor(Math.random() * width);
            const y = Math.floor(Math.random() * height);
            
            const index = (y * width + x) * 4;
            const alpha = data[index + 3];
            
            // Check if pixel is actually visible (alpha > 128 for solid pixels)
            if (alpha > 128) {
                console.log('Found random pixel at', x, y, 'with alpha', alpha);
                return {x, y};
            }
        }
        
        // Fallback: find first non-transparent pixel
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                const alpha = data[index + 3];
                
                if (alpha > 128) {
                    console.log('Fallback pixel at', x, y, 'with alpha', alpha);
                    return {x, y};
                }
            }
        }
        
        console.log('No pixels found!');
        return {x: 0, y: 0};
    }

    private setupTopBarEvents(): void {
        const handleTopBarEvent = (event: Event) => {
            if (event.type === 'pause') {
                this.togglePause();
            } else if (event.type === 'menu') {
                this.returnToMainMenu();
            }
        };

        document.addEventListener('pause', handleTopBarEvent);
        document.addEventListener('menu', handleTopBarEvent);
        
        this.removeTopBarHandler = () => {
            document.removeEventListener('pause', handleTopBarEvent);
            document.removeEventListener('menu', handleTopBarEvent);
        };
    }

    update(delta: number): void {
        // Game update logic can be added here
    }

    togglePause(): void {
        // Pause logic can be added here
    }

    destroy(): void {
        if (this.removeTopBarHandler) {
            this.removeTopBarHandler();
        }
        
        // Clean up PIXI resources
        this.app.stage.removeChild(this.gameContainer);
        this.gameContainer.destroy({ children: true });
    }

    returnToMainMenu(): void {
        window.location.href = '/arcade/';
    }

    private createDraggableSquare(x1: number, y1: number, x2: number, y2: number, texture: any): void {
        // Create a canvas to extract the square region
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
        const width = x2 - x1;
        const height = y2 - y1;
        canvas.width = width;
        canvas.height = height;
        
        // Draw the texture to canvas
        const image = texture.baseTexture.resource.source;
        ctx.drawImage(image, x1, y1, width, height, 0, 0, width, height);
        
        // Create a new texture from the canvas
        const extractedTexture = Texture.from(canvas);
        const sprite = new Sprite(extractedTexture);
        
        // Position the sprite at the original location
        const spriteLeft = this.stickerSprite.position.x - (this.stickerSprite.width / 2);
        const spriteTop = this.stickerSprite.position.y - (this.stickerSprite.height / 2);
        
        sprite.position.set(
            spriteLeft + (x1 * this.stickerSprite.scale.x),
            spriteTop + (y1 * this.stickerSprite.scale.y)
        );
        sprite.scale.set(this.stickerSprite.scale.x, this.stickerSprite.scale.y);
        
        // Make it draggable
        this.makeDraggable(sprite);
        
        // Add to game container
        this.gameContainer.addChild(sprite);
        
        // Draw lines on the original sprite with bright color where this piece was
        this.drawLines(x1, y1, x2, y2, 'square');
    }

    private createDraggableTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, texture: any): void {
        // Create a Graphics object for the triangle with proper hit detection
        const triangle = new Graphics();
        
        // Calculate bounding box of triangle
        const minX = Math.min(x1, x2, x3);
        const minY = Math.min(y1, y2, y3);
        const maxX = Math.max(x1, x2, x3);
        const maxY = Math.max(y1, y2, y3);
        
        // Clamp coordinates to texture bounds
        const textureWidth = texture.width;
        const textureHeight = texture.height;
        const clampedMinX = Math.max(0, Math.min(minX, textureWidth - 1));
        const clampedMinY = Math.max(0, Math.min(minY, textureHeight - 1));
        const clampedMaxX = Math.max(clampedMinX + 1, Math.min(maxX, textureWidth));
        const clampedMaxY = Math.max(clampedMinY + 1, Math.min(maxY, textureHeight));
        const clampedWidth = clampedMaxX - clampedMinX;
        const clampedHeight = clampedMaxY - clampedMinY;
        
        // Create a texture from a region of the original texture using PixiJS Rectangle
        const sourceRect = new Rectangle(clampedMinX, clampedMinY, clampedWidth, clampedHeight);
        const extractedTexture = new Texture(texture.baseTexture, sourceRect);
        
        // Draw the texture on the Graphics object
        triangle.beginTextureFill({ texture: extractedTexture });
        triangle.moveTo(x1 - clampedMinX, y1 - clampedMinY);
        triangle.lineTo(x2 - clampedMinX, y2 - clampedMinY);
        triangle.lineTo(x3 - clampedMinX, y3 - clampedMinY);
        triangle.lineTo(x1 - clampedMinX, y1 - clampedMinY);
        triangle.endFill();
        
        // Position the triangle at the original location
        const spriteLeft = this.stickerSprite.position.x - (this.stickerSprite.width / 2);
        const spriteTop = this.stickerSprite.position.y - (this.stickerSprite.height / 2);
        
        triangle.position.set(
            spriteLeft + (clampedMinX * this.stickerSprite.scale.x),
            spriteTop + (clampedMinY * this.stickerSprite.scale.y)
        );
        triangle.scale.set(this.stickerSprite.scale.x, this.stickerSprite.scale.y);
        
        // Make it draggable
        this.makeDraggable(triangle);
        
        // Add to game container
        this.gameContainer.addChild(triangle);
        
        // Draw lines on the original sprite with bright color where this piece was
        this.drawLines(clampedMinX, clampedMinY, clampedMaxX, clampedMaxY, 'triangle', x1, y1, x2, y2, x3, y3);
    }

    private drawLines(x1: number, y1: number, x2: number, y2: number, type: string, tx1?: number, ty1?: number, tx2?: number, ty2?: number, tx3?: number, ty3?: number): void {
        // Generate a dynamic random bright color
        const r = Math.floor(Math.random() * 256 - 100) + 100;
        const g = Math.floor(Math.random() * 256 - 100) + 100;
        const b = Math.floor(Math.random() * 256 - 100) + 100;
        const randomColor = (r << 16) | (g << 8) | b;
        
        // Use PixiJS RenderTexture to extract pixel data
        const renderTexture = RenderTexture.create({
            width: this.stickerSprite.texture.width,
            height: this.stickerSprite.texture.height
        });
        
        // Create a temporary sprite with the original texture at original size
        const tempSprite = new Sprite(this.stickerSprite.texture);
        tempSprite.scale.set(1, 1); // No scaling
        
        // Render the texture to get pixel data
        this.app.renderer.render(tempSprite, { renderTexture });
        
        // Get the canvas from the render texture
        const canvas = this.app.renderer.extract.canvas(renderTexture);
        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Create a Graphics object to draw on the lion
        const paintOver = new Graphics();
        paintOver.beginFill(randomColor);
        
        // Adjust coordinates to account for sprite's center anchor and scale
        const halfWidth = this.stickerSprite.texture.width / 2;
        const halfHeight = this.stickerSprite.texture.height / 2;
        
        if (type === 'square') {
            // For squares, paint only non-transparent pixels
            for (let y = y1; y < y2; y++) {
                for (let x = x1; x < x2; x++) {
                    if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
                        const index = (y * canvas.width + x) * 4;
                        const alpha = data[index + 3];
                        if (alpha > 128) { // Only paint if pixel is not transparent
                            paintOver.drawRect(x - halfWidth, y - halfHeight, 1, 1);
                        }
                    }
                }
            }
        } else if (type === 'triangle') {
            // For triangles, paint only non-transparent pixels within the triangle
            for (let y = Math.min(ty1!, ty2!, ty3!); y <= Math.max(ty1!, ty2!, ty3!); y++) {
                for (let x = Math.min(tx1!, tx2!, tx3!); x <= Math.max(tx1!, tx2!, tx3!); x++) {
                    if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
                        // Check if point is inside triangle
                        if (this.isPointInTriangle(x, y, tx1!, ty1!, tx2!, ty2!, tx3!, ty3!)) {
                            const index = (y * canvas.width + x) * 4;
                            const alpha = data[index + 3];
                            if (alpha > 128) { // Only paint if pixel is not transparent
                                paintOver.drawRect(x - halfWidth, y - halfHeight, 1, 1);
                            }
                        }
                    }
                }
            }
        }
        
        paintOver.endFill();
        
        // Add the paint as a child of the lion sprite so it becomes part of the lion image
        this.stickerSprite.addChild(paintOver);
        
        // Clean up the render texture
        renderTexture.destroy(true);
    }

    private isPointInTriangle(px: number, py: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): boolean {
        const A = 1/2 * (-y2 * x3 + y1 * (-x2 + x3) + x1 * (y2 - y3) + x2 * y3);
        const sign = A < 0 ? -1 : 1;
        const s = (y1 * x3 - x1 * y3 + (y3 - y1) * px + (x1 - x3) * py) * sign;
        const t = (x1 * y2 - y1 * x2 + (y1 - y2) * px + (x2 - x1) * py) * sign;
        
        return s > 0 && t > 0 && (s + t) < 2 * A * sign;
    }

    private setupGlobalPointerEvents(): void {
        this.app.stage.eventMode = 'static';
        
        this.app.stage.on('pointermove', (event: any) => {
            if (this.currentlyDraggedPart) {
                const pos = event.data.getLocalPosition(this.currentlyDraggedPart.parent);
                this.currentlyDraggedPart.position.x = pos.x - this.dragOffset.x;
                this.currentlyDraggedPart.position.y = pos.y - this.dragOffset.y;
                //dont allow parts to leave the screen
                if (this.currentlyDraggedPart.position.x < 0) {
                    this.currentlyDraggedPart.position.x = 0;
                }
                if (this.currentlyDraggedPart.position.x > this.gameDimensions.gameWidth - this.currentlyDraggedPart.width) {
                    this.currentlyDraggedPart.position.x = this.gameDimensions.gameWidth - this.currentlyDraggedPart.width;
                }
                if (this.currentlyDraggedPart.position.y < 0) {
                    this.currentlyDraggedPart.position.y = 0;
                }
                if (this.currentlyDraggedPart.position.y > this.gameDimensions.gameHeight - this.currentlyDraggedPart.height) {
                    this.currentlyDraggedPart.position.y = this.gameDimensions.gameHeight - this.currentlyDraggedPart.height;
                }
            }
        });
        
        this.app.stage.on('pointerup', () => {
            if (this.currentlyDraggedPart) {
                this.currentlyDraggedPart.alpha = 1;
                this.currentlyDraggedPart = null;
            }
        });

        // this.app.stage.on('pointerleave', () => {
        //     if (this.currentlyDraggedPart) {
        //         this.currentlyDraggedPart.alpha = 1;
        //         this.currentlyDraggedPart = null;
        //     }
        // });


    }

    private makeDraggable(sprite: Sprite | Graphics): void {
        sprite.eventMode = 'static';
        sprite.cursor = 'pointer';
        
        sprite.on('pointerdown', (event: any) => {
            if (this.currentlyDraggedPart) return;
            
            this.currentlyDraggedPart = sprite;
            const pos = event.data.getLocalPosition(sprite.parent);
            this.dragOffset.x = pos.x - sprite.position.x;
            this.dragOffset.y = pos.y - sprite.position.y;
            //sprite.alpha = 0.8;
            
            // Move sprite to top
            sprite.parent.addChild(sprite);
        });
    }
}

// Canvas scaling function
function updateCanvasScaling() {
    const canvas = document.querySelector('canvas');
    if (canvas) {
        const gameDimensions = getGameDimensions();
        canvas.style.width = `${gameDimensions.gameWidth}px`;
        canvas.style.height = `${gameDimensions.gameHeight}px`;
    }
}

// Initialize the game
async function initGame() {
    const gameDimensions = getGameDimensions();
    
    // Create PIXI application
    const app = new Application({
        width: gameDimensions.gameWidth,
        height: gameDimensions.gameHeight,
        backgroundColor: 0xffffff,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
    });

    // Add canvas to DOM
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.appendChild(app.view as HTMLCanvasElement);
    }

    // Update canvas scaling
    updateCanvasScaling();

    // Create and initialize game
    const game = new StickersGame(app);
    await game.init();

    // Set up game loop
    app.ticker.add((delta) => {
        game.update(delta);
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        updateCanvasScaling();
    });

    // Set up global functions
    window.restartGame = () => {
        // Restart logic can be added here
    };
    
    window.returnToMainMenu = () => {
        game.returnToMainMenu();
    };
    
    window.resumeGame = () => {
        // Resume logic can be added here
    };
    
    window.togglePause = () => {
        game.togglePause();
    };
}

// Game loop
function gameLoop(delta: number) {
    // Main game loop logic
}

// Initialize when page loads
window.addEventListener('load', initGame);

// Global type declarations
declare global {
    interface Window {
        restartGame: () => void;
        returnToMainMenu: () => void;
        resumeGame: () => void;
        togglePause: () => void;
    }
} 