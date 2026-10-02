import { Container, Graphics } from 'pixi.js';

type Direction = 'up' | 'down' | 'left' | 'right';

const SEGMENT_BORDER = { width: 2, color: 0x229954, alpha: 0.8 };

interface Position {
    x: number;
    y: number;
}

export class Snake {
    public container: Container;
    private segments: Position[] = [];
    private direction: Direction = 'right';
    private nextDirection: Direction = 'right';
    private gridSize: number;
    private gridWidth: number;
    private gridHeight: number;
    private graphics: Graphics;

    constructor(gridSize: number, gridWidth: number, gridHeight: number) {
        this.gridSize = gridSize;
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;
        
        this.container = new Container();
        this.graphics = new Graphics();
        this.container.addChild(this.graphics);
        
        this.reset();
    }

    reset(): void {
        // Initialize snake at center of grid
        const startX = Math.floor(this.gridWidth / 2);
        const startY = Math.floor(this.gridHeight / 2);
        
        this.segments = [
            { x: startX, y: startY },
            { x: startX - 1, y: startY },
            { x: startX - 2, y: startY }
        ];
        
        this.direction = 'right';
        this.nextDirection = 'right';
        this.draw();
    }

    setDirection(newDirection: Direction): void {
        // Prevent 180-degree turns
        if (
            (this.direction === 'up' && newDirection === 'down') ||
            (this.direction === 'down' && newDirection === 'up') ||
            (this.direction === 'left' && newDirection === 'right') ||
            (this.direction === 'right' && newDirection === 'left')
        ) {
            return;
        }
        
        this.nextDirection = newDirection;
    }

    move(): Position {
        // Update direction
        this.direction = this.nextDirection;
        
        // Get current head position
        const head = this.segments[0];
        const newHead: Position = { x: head.x, y: head.y };
        
        // Calculate new head position based on direction
        switch (this.direction) {
            case 'up':
                newHead.y -= 1;
                break;
            case 'down':
                newHead.y += 1;
                break;
            case 'left':
                newHead.x -= 1;
                break;
            case 'right':
                newHead.x += 1;
                break;
        }
        
        // Add new head
        this.segments.unshift(newHead);
        
        // Remove tail (unless growing)
        this.segments.pop();
        
        this.draw();
        return newHead;
    }

    grow(): void {
        // Add a new segment at the tail position
        const tail = this.segments[this.segments.length - 1];
        this.segments.push({ x: tail.x, y: tail.y });
    }

    checkCollision(x: number, y: number): boolean {
        // Check if position collides with any snake segment
        return this.segments.some(segment => segment.x === x && segment.y === y);
    }

    checkCollisionWithBody(x: number, y: number): boolean {
        // Check if position collides with any snake segment except the head
        return this.segments.slice(1).some(segment => segment.x === x && segment.y === y);
    }

    private draw(): void {
        this.graphics.clear();
        
        // Draw each segment
        this.segments.forEach((segment, index) => {
            const x = segment.x * this.gridSize;
            const y = segment.y * this.gridSize;
            
            // Head is a different color, with a bordered rounded rectangle for each segment
            this.graphics
                .roundRect(x + 1, y + 1, this.gridSize - 2, this.gridSize - 2, 3)
                .fill(index === 0 ? 0x2ecc71 : 0x27ae60)
                .stroke(SEGMENT_BORDER);
            
            // Add eyes to head
            if (index === 0) {
                this.drawEyes(x, y);
            }
        });
    }

    private drawEyes(x: number, y: number): void {
        const eyeSize = 3;
        const eyeOffset = 5;
        
        // Eye positions based on direction
        let leftEyeX: number, leftEyeY: number, rightEyeX: number, rightEyeY: number;
        
        switch (this.direction) {
            case 'up':
                leftEyeX = x + eyeOffset;
                leftEyeY = y + eyeOffset;
                rightEyeX = x + this.gridSize - eyeOffset - eyeSize;
                rightEyeY = y + eyeOffset;
                break;
            case 'down':
                leftEyeX = x + eyeOffset;
                leftEyeY = y + this.gridSize - eyeOffset - eyeSize;
                rightEyeX = x + this.gridSize - eyeOffset - eyeSize;
                rightEyeY = y + this.gridSize - eyeOffset - eyeSize;
                break;
            case 'left':
                leftEyeX = x + eyeOffset;
                leftEyeY = y + eyeOffset;
                rightEyeX = x + eyeOffset;
                rightEyeY = y + this.gridSize - eyeOffset - eyeSize;
                break;
            case 'right':
                leftEyeX = x + this.gridSize - eyeOffset - eyeSize;
                leftEyeY = y + eyeOffset;
                rightEyeX = x + this.gridSize - eyeOffset - eyeSize;
                rightEyeY = y + this.gridSize - eyeOffset - eyeSize;
                break;
        }
        
        // Draw eyes
        this.graphics
            .circle(leftEyeX, leftEyeY, eyeSize)
            .circle(rightEyeX, rightEyeY, eyeSize)
            .fill(0x000000)
            .stroke(SEGMENT_BORDER);
    }

    getHead(): Position {
        return this.segments[0];
    }

    getLength(): number {
        return this.segments.length;
    }
} 