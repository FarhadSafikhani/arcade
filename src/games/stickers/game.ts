import { Application, Container, Graphics, Sprite, Texture, Assets } from 'pixi.js';

// Game constants
const BASE_GAME_WIDTH = 800;
const BASE_GAME_HEIGHT = 600;

// Responsive scaling function
const getGameDimensions = () => {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight - 120; // Account for top bar and margins
    
    // Calculate scale to fit within available space while maintaining aspect ratio
    const scaleX = windowWidth / BASE_GAME_WIDTH;
    const scaleY = windowHeight / BASE_GAME_HEIGHT;
    const scale = Math.min(scaleX, scaleY);
    
    return {
        gameWidth: BASE_GAME_WIDTH,
        gameHeight: BASE_GAME_HEIGHT,
        scale
    };
};

export class StickersGame {
    private app: Application;
    private gameContainer: Container;
    private stickerSprite!: Sprite;
    private removeTopBarHandler?: () => void;
    private gameDimensions: ReturnType<typeof getGameDimensions>;
    private currentlyDraggedPart: Sprite | null = null;
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
        
        // Hide the original sprite since we're creating draggable pieces
        this.stickerSprite.visible = false;
        
        // Draw a red dot on a random point inside the sticker AFTER adding the sprite
        await this.drawRedDotOnSticker(stickerTexture);
    }

    private async drawRedDotOnSticker(texture: any): Promise<void> {
        // Create a temporary canvas to read pixel data
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
        canvas.width = texture.width;
        canvas.height = texture.height;
        
        // Draw the texture to canvas
        const image = texture.baseTexture.resource.source;
        ctx.drawImage(image, 0, 0);
        
        // Get pixel data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Create grid-based triangulation
        const gridSize = 120; // Size of each grid cell
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
    }

    private createDraggableTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, texture: any): void {
        // Create a canvas to extract the triangle region
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
        // Calculate bounding box of triangle
        const minX = Math.min(x1, x2, x3);
        const minY = Math.min(y1, y2, y3);
        const maxX = Math.max(x1, x2, x3);
        const maxY = Math.max(y1, y2, y3);
        
        const width = maxX - minX;
        const height = maxY - minY;
        canvas.width = width;
        canvas.height = height;
        
        // Draw the texture to canvas
        const image = texture.baseTexture.resource.source;
        ctx.drawImage(image, minX, minY, width, height, 0, 0, width, height);
        
        // Create a mask for the triangle
        ctx.globalCompositeOperation = 'destination-in';
        ctx.beginPath();
        ctx.moveTo(x1 - minX, y1 - minY);
        ctx.lineTo(x2 - minX, y2 - minY);
        ctx.lineTo(x3 - minX, y3 - minY);
        ctx.closePath();
        ctx.fill();
        
        // Create a new texture from the canvas
        const extractedTexture = Texture.from(canvas);
        const sprite = new Sprite(extractedTexture);
        
        // Position the sprite at the original location
        const spriteLeft = this.stickerSprite.position.x - (this.stickerSprite.width / 2);
        const spriteTop = this.stickerSprite.position.y - (this.stickerSprite.height / 2);
        
        sprite.position.set(
            spriteLeft + (minX * this.stickerSprite.scale.x),
            spriteTop + (minY * this.stickerSprite.scale.y)
        );
        sprite.scale.set(this.stickerSprite.scale.x, this.stickerSprite.scale.y);
        
        // Make it draggable
        this.makeDraggable(sprite);
        
        // Add to game container
        this.gameContainer.addChild(sprite);
    }

    private setupGlobalPointerEvents(): void {
        this.app.stage.eventMode = 'static';
        
        this.app.stage.on('pointermove', (event: any) => {
            if (this.currentlyDraggedPart) {
                const pos = event.data.getLocalPosition(this.currentlyDraggedPart.parent);
                this.currentlyDraggedPart.position.x = pos.x - this.dragOffset.x;
                this.currentlyDraggedPart.position.y = pos.y - this.dragOffset.y;
            }
        });
        
        this.app.stage.on('pointerup', () => {
            if (this.currentlyDraggedPart) {
                this.currentlyDraggedPart.alpha = 1;
                this.currentlyDraggedPart = null;
            }
        });
    }

    private makeDraggable(sprite: Sprite): void {
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
        canvas.style.width = `${gameDimensions.gameWidth * gameDimensions.scale}px`;
        canvas.style.height = `${gameDimensions.gameHeight * gameDimensions.scale}px`;
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