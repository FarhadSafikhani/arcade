import { Container, Graphics } from 'pixi.js';

export class Particle {
    public container: Container;
    private graphics: Graphics;
    private velocityX: number;
    private velocityY: number;
    private life: number;
    private maxLife: number;
    private gravity: number = 0.3;
    private friction: number = 0.98;

    constructor(x: number, y: number, color: number) {
        this.container = new Container();
        this.container.position.set(x, y);
        
        // Create particle graphics
        this.graphics = new Graphics();
        this.graphics.beginFill(color);
        this.graphics.drawCircle(0, 0, Math.random() * 3 + 1);
        this.graphics.endFill();
        this.container.addChild(this.graphics);
        
        // Random velocity
        this.velocityX = (Math.random() - 0.5) * 8;
        this.velocityY = (Math.random() - 0.5) * 8 - 2; // Slight upward bias
        
        // Life span
        this.maxLife = Math.random() * 60 + 30; // 30-90 frames
        this.life = this.maxLife;
    }

    update(): boolean {
        // Apply gravity and friction
        this.velocityY += this.gravity;
        this.velocityX *= this.friction;
        this.velocityY *= this.friction;
        
        // Update position
        this.container.x += this.velocityX;
        this.container.y += this.velocityY;
        
        // Decrease life
        this.life--;
        
        // Fade out based on life
        const alpha = this.life / this.maxLife;
        this.graphics.alpha = alpha;
        
        // Scale down as it fades
        const scale = 0.5 + (alpha * 0.5);
        this.graphics.scale.set(scale);
        
        // Return true if particle is still alive
        return this.life > 0;
    }

    destroy(): void {
        if (this.container.parent) {
            this.container.parent.removeChild(this.container);
        }
    }
}

export class ParticleSystem {
    private particles: Particle[] = [];
    private container: Container;

    constructor(container: Container) {
        this.container = container;
    }

    createExplosion(x: number, y: number, color: number, count: number = 8): void {
        for (let i = 0; i < count; i++) {
            const particle = new Particle(x, y, color);
            this.particles.push(particle);
            this.container.addChild(particle.container);
        }
    }

    update(): void {
        // Update all particles and remove dead ones
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            const isAlive = particle.update();
            
            if (!isAlive) {
                particle.destroy();
                this.particles.splice(i, 1);
            }
        }
    }

    clear(): void {
        this.particles.forEach(particle => particle.destroy());
        this.particles = [];
    }
} 