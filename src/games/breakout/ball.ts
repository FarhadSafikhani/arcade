import { Container, Graphics } from 'pixi.js';
import { Paddle } from './paddle';
import { Brick } from './brick';

export enum BallType {
    NORMAL = 'normal',
    BLUE = 'blue'
}

export class Ball {
    public container: Container;
    public x: number = 0;
    public y: number = 0;
    public radius: number;
    public velocityX: number = 0;
    public velocityY: number = 0;
    public type: BallType;
    private graphics!: Graphics;

    constructor(radius: number, type: BallType = BallType.NORMAL) {
        this.radius = radius;
        this.type = type;
        this.container = new Container();
        
        // Create ball graphics
        this.graphics = new Graphics();
        
        // Set color based on ball type
        const color = this.type === BallType.BLUE ? 0x3498db : 0xffffff;
        this.graphics.beginFill(color);
        this.graphics.drawCircle(0, 0, radius);
        this.graphics.endFill();
        
        // Add border
        const borderColor = this.type === BallType.BLUE ? 0x2980b9 : 0x2c3e50;
        this.graphics.lineStyle(2, borderColor, 0.8);
        this.graphics.drawCircle(0, 0, radius);
        
        this.container.addChild(this.graphics);
    }

    setPosition(x: number, y: number): void {
        this.x = x;
        this.y = y;
        this.container.x = x;
        this.container.y = y;
    }

    setVelocity(x: number, y: number): void {
        this.velocityX = x;
        this.velocityY = y;
    }

    setVelocityAndAngle(speed: number, angle: number): void {
        this.velocityX = speed * Math.sin(angle);
        this.velocityY = -speed * Math.cos(angle);
    }

    setAngle(angle: number): void {
        const speed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
        this.velocityX = speed * Math.sin(angle);
        this.velocityY = -speed * Math.cos(angle);
    }

    reverseX(): void {
        this.velocityX = -this.velocityX;
    }

    reverseY(): void {
        this.velocityY = -this.velocityY;
    }

    update(): void {
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.container.x = this.x;
        this.container.y = this.y;
    }

    getBounds() {
        return {
            left: this.x - this.radius,
            right: this.x + this.radius,
            top: this.y - this.radius,
            bottom: this.y + this.radius
        };
    }

    checkCollisionWithPaddle(paddle: Paddle): boolean {
        const ballBounds = this.getBounds();
        const paddleBounds = paddle.getBounds();
        
        return ballBounds.left < paddleBounds.right &&
               ballBounds.right > paddleBounds.left &&
               ballBounds.top < paddleBounds.bottom &&
               ballBounds.bottom > paddleBounds.top;
    }

    checkCollisionWithBrick(brick: Brick): boolean {
        const ballBounds = this.getBounds();
        const brickBounds = brick.getBounds();
        
        return ballBounds.left < brickBounds.right &&
               ballBounds.right > brickBounds.left &&
               ballBounds.top < brickBounds.bottom &&
               ballBounds.bottom > brickBounds.top;
    }
} 