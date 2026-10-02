import { Container, Graphics } from 'pixi.js';

export class Paddle {
    public container: Container;
    public x: number = 0;
    public y: number = 0;
    private width: number;
    private height: number;
    private graphics!: Graphics;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.container = new Container();
        
        this.updateGraphics();
    }

    private updateGraphics(): void {
        // Clear existing graphics
        if (this.graphics) {
            this.container.removeChild(this.graphics);
        }
        
        // Create paddle graphics
        this.graphics = new Graphics();
        this.graphics.roundRect(0, 0, this.width, this.height, 5).fill(0x4ecdc4);
        
        // Add border
        this.graphics.roundRect(0, 0, this.width, this.height, 5).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
        
        this.container.addChild(this.graphics);
    }

    setPosition(x: number, y: number): void {
        this.x = x;
        this.y = y;
        this.container.x = x;
        this.container.y = y;
    }

    resize(newWidth: number): void {
        this.width = newWidth;
        this.updateGraphics();
    }

    getBounds() {
        return {
            left: this.x,
            right: this.x + this.width,
            top: this.y,
            bottom: this.y + this.height
        };
    }
} 