import { Container, Graphics } from 'pixi.js';

export class Brick {
    public container: Container;
    public x: number = 0;
    public y: number = 0;
    private width: number;
    private height: number;
    private maxHealth: number;
    private health: number;
    private graphics!: Graphics;

    constructor(width: number, height: number, maxHealth: number) {
        this.width = width;
        this.height = height;
        this.maxHealth = maxHealth;
        this.health = maxHealth;
        this.container = new Container();
        
        this.updateGraphics();
    }

    private updateGraphics(): void {
        // Clear existing graphics
        if (this.graphics) {
            this.container.removeChild(this.graphics);
        }
        
        // Create new graphics with current health color
        this.graphics = new Graphics();
        
        // Color gradient from red (5 health) to green (1 health)
        const colors = [0x2ecc71, 0xf1c40f, 0xe67e22, 0xe74c3c, 0xc0392b]; // green, yellow, orange, red, dark red
        const colorIndex = Math.max(0, this.health - 1);
        const color = colors[colorIndex];
        
        this.graphics.beginFill(color);
        this.graphics.drawRoundedRect(0, 0, this.width, this.height, 3);
        this.graphics.endFill();
        
        // Add outer border
        this.graphics.lineStyle(1, 0xffffff, 0.3);
        this.graphics.drawRoundedRect(0, 0, this.width, this.height, 3);
        
        // Add inner stroke for depth
        this.graphics.lineStyle(1, 0xffffff, 0.6);
        this.graphics.drawRoundedRect(2, 2, this.width - 4, this.height - 4, 2);
        
        this.container.addChild(this.graphics);
    }

    setPosition(x: number, y: number): void {
        this.x = x;
        this.y = y;
        this.container.x = x;
        this.container.y = y;
    }

    hit(): boolean {
        this.health--;
        this.updateGraphics();
        return this.health <= 0;
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