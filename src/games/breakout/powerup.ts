import { Container, Graphics, Text, TextStyle } from 'pixi.js';

export enum PowerUpType {
    PADDLE_INCREASE = 'paddle_increase',
    PADDLE_DECREASE = 'paddle_decrease',
    EXTRA_LIFE = 'extra_life',
    BLUE_BALL = 'blue_ball'
}

export class PowerUp {
    public container: Container;
    public x: number = 0;
    public y: number = 0;
    public type: PowerUpType;
    private width: number = 30;
    private height: number = 30;
    private velocityY: number = 2;
    private graphics!: Graphics;
    private text!: Text;

    constructor(type: PowerUpType, x: number, y: number) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.container = new Container();
        
        this.createGraphics();
        this.setPosition(x, y);
    }

    private createGraphics(): void {
        // Create background
        this.graphics = new Graphics();
        
        // Color based on power-up type
        let color: number;
        let symbol: string;
        
        switch (this.type) {
            case PowerUpType.PADDLE_INCREASE:
                color = 0x2ecc71; // Green
                symbol = '+';
                break;
            case PowerUpType.PADDLE_DECREASE:
                color = 0xe74c3c; // Red
                symbol = '-';
                break;
            case PowerUpType.EXTRA_LIFE:
                color = 0xf39c12; // Orange
                symbol = '♥';
                break;
            case PowerUpType.BLUE_BALL:
                color = 0x3498db; // Blue
                symbol = '●';
                break;
        }
        
        this.graphics.beginFill(color);
        this.graphics.drawRoundedRect(0, 0, this.width, this.height, 5);
        this.graphics.endFill();
        
        // Add border
        this.graphics.lineStyle(2, 0xffffff, 0.8);
        this.graphics.drawRoundedRect(0, 0, this.width, this.height, 5);
        
        // Create text
        const textStyle = new TextStyle({
            fontFamily: 'Arial',
            fontSize: 16,
            fontWeight: 'bold',
            fill: 0xffffff,
            stroke: 0x000000,
            strokeThickness: 2
        });
        
        this.text = new Text(symbol, textStyle);
        this.text.anchor.set(0.5);
        this.text.x = this.width / 2;
        this.text.y = this.height / 2;
        
        this.container.addChild(this.graphics);
        this.container.addChild(this.text);
    }

    setPosition(x: number, y: number): void {
        this.x = x;
        this.y = y;
        this.container.x = x;
        this.container.y = y;
    }

    update(): void {
        this.y += this.velocityY;
        this.container.y = this.y;
    }

    getBounds() {
        return {
            left: this.x,
            right: this.x + this.width,
            top: this.y,
            bottom: this.y + this.height
        };
    }

    isOutOfBounds(gameHeight: number): boolean {
        return this.y > gameHeight;
    }
} 