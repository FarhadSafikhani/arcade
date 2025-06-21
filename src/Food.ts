import { Container, Graphics } from 'pixi.js';

export class Food {
    public container: Container;
    public x: number = 0;
    public y: number = 0;
    private graphics: Graphics;
    private gridSize: number;
    private animationTime: number = 0;

    constructor(gridSize: number) {
        this.gridSize = gridSize;
        this.container = new Container();
        this.graphics = new Graphics();
        this.container.addChild(this.graphics);
    }

    setPosition(x: number, y: number): void {
        this.x = x;
        this.y = y;
        this.draw();
    }

    private draw(): void {
        this.graphics.clear();
        
        const centerX = this.x * this.gridSize + this.gridSize / 2;
        const centerY = this.y * this.gridSize + this.gridSize / 2;
        const radius = this.gridSize / 2 - 2;
        
        // Draw main food circle
        this.graphics.beginFill(0xe74c3c);
        this.graphics.drawCircle(centerX, centerY, radius);
        this.graphics.endFill();
        
        // Add border
        this.graphics.lineStyle(2, 0xc0392b, 0.8);
        this.graphics.drawCircle(centerX, centerY, radius);
        
        // Add shine effect
        this.graphics.beginFill(0xffffff);
        this.graphics.drawCircle(centerX - radius / 3, centerY - radius / 3, radius / 4);
        this.graphics.endFill();
        
        // Add bite marks (make it look like an apple)
        this.graphics.beginFill(0x2c3e50);
        this.graphics.drawEllipse(centerX + radius / 2, centerY - radius / 2, radius / 6, radius / 3);
        this.graphics.endFill();
    }

    update(delta: number): void {
        // Add subtle animation
        this.animationTime += delta;
        const scale = 1 + Math.sin(this.animationTime * 0.1) * 0.05;
        this.container.scale.set(scale);
    }
} 