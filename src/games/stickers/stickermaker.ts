import { Application, Container, Graphics, Sprite, Texture, Assets, Rectangle, RenderTexture } from 'pixi.js';

export class StickerMaker {
    private app: Application;
    private gameContainer: Container;
    private currentStickerSprite: Sprite | null = null;
    
    constructor(app: Application, gameContainer: Container) {
        this.app = app;
        this.gameContainer = gameContainer;
    }

    async createSticker(assetPath: string): Promise<Sprite> {
        // STEP 1: first load a lion sticker sprite image and paint it on the canvas

        // Get the cached texture from PixiJS
        const stickerTexture = await Assets.load(assetPath);
        
        // Create sprite from the texture
        this.currentStickerSprite = new Sprite(stickerTexture);

        // Ensure sprite doesn't exceed canvas size while preserving aspect ratio
        const maxWidth = window.innerWidth * 0.9; // 90% of canvas width
        const maxHeight = (window.innerHeight - 60) * 0.9; // 90% of canvas height
        
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
            window.innerWidth / 2,
            (window.innerHeight - 60) / 2
        );
        
        this.gameContainer.addChild(this.currentStickerSprite);
        
        // STEP 2: then make a copy of the lion sticker and break it into triangles and squares, and make them draggable 'parts'
        // STEP 3: as you make the 'parts' under the part paint over the original sprite random colors, so dragging the part away would show the colored sections called 'holes'
        this.cutIntoTrianglesAndSquares(stickerTexture);

        return this.currentStickerSprite;
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
        const gridSize = 5; 

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
                for (let y = y1; y < y2; y++) {
                    for (let x = x1; x < x2; x++) {
                        const index = (y * canvas.width + x) * 4;
                        const alpha = data[index + 3];
                        if (alpha > 128) {
                            hasContent = true;
                            break;
                        }
                    }
                    if (hasContent) break;
                }
                 
                if (hasContent) {
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
        
        // Make it draggable
        this.makeDraggable(sprite);
        
        // Add to game container
        this.gameContainer.addChild(sprite);
        
        // Paint hole directly from the sprite we just created
        this.paintHoleFromSprite(sprite, x1, y1, x2 - x1, y2 - y1);
    }

    private createDraggableTriangleFromTexture(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, texture: Texture): void {

        if (!this.currentStickerSprite) {
            throw new Error('Sticker sprite not found');
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
        
        // Make it draggable
        this.makeDraggable(triangle);
        
        // Add to game container
        this.gameContainer.addChild(triangle);
        
        // Paint hole directly from the triangle we just created
        this.paintHoleFromSprite(triangle, minX, minY, maxX - minX, maxY - minY);
    }

    private paintHoleFromSprite(sprite: Sprite | Graphics, x: number, y: number, width: number, height: number): void {

        if (!this.currentStickerSprite) {
            throw new Error('Sticker sprite not found');
        }

        // Create a temporary sprite/graphics at original scale and position to get clean pixel data
        let tempDisplayObject: Sprite | Graphics;
        
        if (sprite instanceof Sprite) {
            tempDisplayObject = new Sprite(sprite.texture);
        } else {
            // For Graphics objects, we need to clone it
            tempDisplayObject = sprite.clone();
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
        
        const grayValue = Math.floor(Math.random() * 100) + 100;
        const grayColor = (grayValue << 16) | (grayValue << 8) | grayValue;
        
        // Create Graphics object to paint the hole pixel by pixel
        const hole = new Graphics();
        
        // Adjust coordinates to account for sprite's center anchor
        const halfWidth = this.currentStickerSprite.texture.width / 2;
        const halfHeight = this.currentStickerSprite.texture.height / 2;
        
        // Paint each pixel using the clean pixel data
        for (let py = 0; py < height; py++) {
            for (let px = 0; px < width; px++) {
                const index = (py * width + px) * 4;
                const alpha = data[index + 3];
                
                if (alpha > 0) { // Only paint visible pixels
                    const pixelColor = alpha > 128 ? brightColor : grayColor;
                    
                    hole.beginFill(pixelColor);
                    hole.drawRect(
                        (x + px) - halfWidth,
                        (y + py) - halfHeight,
                        1, 1
                    );
                    hole.endFill();
                }
            }
        }
        
        // Add as child to the original sprite
        this.currentStickerSprite.addChild(hole);
        
        // Clean up
        renderTexture.destroy(true);
    }

    private makeDraggable(sprite: Sprite | Graphics): void {
        sprite.eventMode = 'static';
        sprite.cursor = 'pointer';
        
        sprite.on('pointerdown', (event: any) => {
            // This will need to be handled by the main game class
            // We'll emit a custom event or use a callback
            const customEvent = new CustomEvent('startDrag', { 
                detail: { sprite, event } 
            });
            document.dispatchEvent(customEvent);
        });
    }

}
