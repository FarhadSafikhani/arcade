import { Container, Graphics, Text, TextStyle } from 'pixi.js';

export class Card {
    public container: Container;
    public emoji: string;
    public id: number;
    public isFlipped: boolean = false;
    public isMatched: boolean = false;
    
    private background!: Graphics;
    private emojiText!: Text;
    private width: number;
    private height: number;
    private isAnimating: boolean = false;

    constructor(width: number, height: number, emoji: string, id: number) {
        this.width = width;
        this.height = height;
        this.emoji = emoji;
        this.id = id;
        
        this.container = new Container();
        this.container.eventMode = 'static';
        this.container.cursor = 'pointer';
        
        // Set pivot to center for proper hover scaling
        this.container.pivot.set(width / 2, height / 2);
        
        this.createCard();
        this.setupInteraction();
    }

    private createCard(): void {
        // Create card background (face down)
        this.background = new Graphics();
        this.background.beginFill(0x3498db);
        this.background.lineStyle(3, 0x2980b9);
        this.background.drawRoundedRect(0, 0, this.width, this.height, 10);
        this.background.endFill();
        
        // Add inner highlight
        this.background.beginFill(0x5dade2);
        this.background.drawRoundedRect(3, 3, this.width - 6, this.height - 6, 8);
        this.background.endFill();
        
        this.container.addChild(this.background);
        
        // Create emoji text (initially hidden)
        const style = new TextStyle({
            fontFamily: 'Arial',
            fontSize: 36,
            fill: 0x2c3e50,
            align: 'center'
        });
        
        this.emojiText = new Text(this.emoji, style);
        this.emojiText.anchor.set(0.5);
        this.emojiText.position.set(this.width / 2, this.height / 2);
        this.emojiText.alpha = 0; // Start hidden
        this.container.addChild(this.emojiText);
    }

    private setupInteraction(): void {
        this.container.on('pointerdown', () => {
            if (!this.isAnimating && !this.isMatched) {
                window.onCardClick(this);
            }
        });
        
        // Add hover effects
        this.container.on('pointerover', () => {
            if (!this.isFlipped && !this.isMatched && !this.isAnimating) {
                this.container.scale.set(1.05);
            }
        });
        
        this.container.on('pointerout', () => {
            if (!this.isFlipped && !this.isMatched && !this.isAnimating) {
                this.container.scale.set(1.0);
            }
        });
    }

    public setPosition(x: number, y: number): void {
        // Adjust position to account for center pivot
        this.container.position.set(x + this.width / 2, y + this.height / 2);
    }

    public flip(): void {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        this.isFlipped = !this.isFlipped;
        
        if (this.isFlipped) {
            // Flip to show emoji
            this.showEmoji();
        } else {
            // Flip to hide emoji
            this.hideEmoji();
        }
    }

    private showEmoji(): void {
        // Animate the flip
        this.container.scale.x = 0;
        this.emojiText.alpha = 1;
        
        // Change background to white
        this.background.clear();
        this.background.beginFill(0xffffff);
        this.background.lineStyle(3, 0xe0e0e0);
        this.background.drawRoundedRect(0, 0, this.width, this.height, 10);
        this.background.endFill();
        
        // Animate scale back to normal
        const animate = () => {
            this.container.scale.x += 0.2;
            if (this.container.scale.x >= 1) {
                this.container.scale.set(1.0, 1.0); // Ensure both x and y are set to 1.0
                this.isAnimating = false;
            } else {
                requestAnimationFrame(animate);
            }
        };
        animate();
    }

    private hideEmoji(): void {
        // Animate the flip
        this.container.scale.x = 0;
        this.emojiText.alpha = 0;
        
        // Change background back to blue
        this.background.clear();
        this.background.beginFill(0x3498db);
        this.background.lineStyle(3, 0x2980b9);
        this.background.drawRoundedRect(0, 0, this.width, this.height, 10);
        this.background.endFill();
        
        // Add inner highlight
        this.background.beginFill(0x5dade2);
        this.background.drawRoundedRect(3, 3, this.width - 6, this.height - 6, 8);
        this.background.endFill();
        
        // Animate scale back to normal
        const animate = () => {
            this.container.scale.x += 0.2;
            if (this.container.scale.x >= 1) {
                this.container.scale.set(1.0, 1.0); // Ensure both x and y are set to 1.0
                this.isAnimating = false;
            } else {
                requestAnimationFrame(animate);
            }
        };
        animate();
    }

    public setMatched(): void {
        this.isMatched = true;
        this.isFlipped = true;
        
        // Animate fade out
        const fadeOut = () => {
            this.container.alpha -= 0.05;
            if (this.container.alpha > 0) {
                requestAnimationFrame(fadeOut);
            } else {
                this.container.alpha = 0;
            }
        };
        fadeOut();
    }

    public reset(): void {
        this.isFlipped = false;
        this.isMatched = false;
        this.isAnimating = false;
        this.container.alpha = 1;
        this.container.scale.set(1.0);
        this.emojiText.alpha = 0;
        
        // Reset background to face down
        this.background.clear();
        this.background.beginFill(0x3498db);
        this.background.lineStyle(3, 0x2980b9);
        this.background.drawRoundedRect(0, 0, this.width, this.height, 10);
        this.background.endFill();
        
        // Add inner highlight
        this.background.beginFill(0x5dade2);
        this.background.drawRoundedRect(3, 3, this.width - 6, this.height - 6, 8);
        this.background.endFill();
    }
} 