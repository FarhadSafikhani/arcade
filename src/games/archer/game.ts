import { Application, Container, Graphics, Text, FederatedPointerEvent } from 'pixi.js';
import { isTouchDevice } from '../../shared/utils/device-detection';

// Game constants
const GRAVITY = 0.2;
const MAX_POWER = 15;
const MIN_POWER = 2;
const POWER_CHARGE_RATE = 0.1;
const TARGET_SPAWN_RATE = 3000; // milliseconds
const TARGET_LIFETIME = 8000; // milliseconds
const GROUND_HEIGHT = 50;
const BOW_POSITION = { x: 100, y: GROUND_HEIGHT + 20 }; // 20px above ground

// Box/platform class
class Box {
    container: Container;
    graphics: Graphics;

    constructor(x: number, y: number, width: number, height: number) {
        this.container = new Container();
        this.container.position.set(x, window.innerHeight - y - height - 120);
        
        this.graphics = new Graphics();
        this.graphics.beginFill(0x8B4513);
        this.graphics.lineStyle(2, 0x654321);
        this.graphics.drawRect(0, 0, width, height);
        this.graphics.endFill();
        
        // Add some wood grain effect
        this.graphics.lineStyle(1, 0xA0522D);
        for (let i = 0; i < height; i += 8) {
            this.graphics.moveTo(0, i);
            this.graphics.lineTo(width, i);
        }
        
        this.container.addChild(this.graphics);
    }

    destroy(): void {
        this.container.destroy();
    }
}

// Physics projectile class
class Projectile {
    x: number;
    y: number;
    vx: number;
    vy: number;
    active: boolean = true;
    container: Container;
    graphics: Graphics;

    constructor(x: number, y: number, angle: number, power: number) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * power;
        this.vy = -Math.sin(angle) * power;
        
        // Create arrow container
        this.container = new Container();
        this.container.position.set(x, y);
        this.container.rotation = angle;
        
        // Create arrow graphics
        this.graphics = new Graphics();
        
        // Arrow shaft
        this.graphics.lineStyle(4, 0x8B4513);
        this.graphics.moveTo(0, 0);
        this.graphics.lineTo(0, 20);
        
        // Arrow head
        this.graphics.beginFill(0x654321);
        this.graphics.moveTo(-4, 0);
        this.graphics.lineTo(4, 0);
        this.graphics.lineTo(0, -8);
        this.graphics.endFill();
        
        // Arrow fletching
        this.graphics.beginFill(0xFFD700);
        this.graphics.drawRect(-3, 18, 6, 4);
        this.graphics.endFill();
        
        this.container.addChild(this.graphics);
    }

    update(deltaTime: number): boolean {
        if (!this.active) return false;

        // Apply gravity
        this.vy += GRAVITY * deltaTime;

        // Update position
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // Update visual position
        this.container.position.set(this.x, this.y);

        // Check if hit ground
        if (this.y >= window.innerHeight - GROUND_HEIGHT - 120) {
            this.active = false;
            this.container.destroy();
            return false;
        }

        // Check if out of bounds
        if (this.x > window.innerWidth || this.x < 0 || this.y < 0) {
            this.active = false;
            this.container.destroy();
            return false;
        }

        return true;
    }

    destroy(): void {
        this.active = false;
        this.container.destroy();
    }
}

// Target class
class Target {
    x: number;
    y: number;
    radius: number;
    container: Container;
    graphics: Graphics;
    points: number;
    platform?: Box;

    constructor(x: number, y: number, radius: number = 30, platform?: Box) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.platform = platform;
        this.points = Math.max(10, Math.floor(50 - radius));

        // Create target container
        this.container = new Container();
        this.container.position.set(x, y);
        
        // Create target graphics
        this.graphics = new Graphics();
        
        // Outer ring (red)
        this.graphics.beginFill(0xff4444);
        this.graphics.lineStyle(3, 0xFFFFFF);
        this.graphics.drawCircle(0, 0, radius);
        this.graphics.endFill();
        
        // Middle ring (yellow)
        this.graphics.beginFill(0xffff00);
        this.graphics.lineStyle(2, 0xFFFFFF);
        this.graphics.drawCircle(0, 0, radius * 0.6);
        this.graphics.endFill();
        
        // Inner ring (red)
        this.graphics.beginFill(0xff0000);
        this.graphics.lineStyle(2, 0xFFFFFF);
        this.graphics.drawCircle(0, 0, radius * 0.3);
        this.graphics.endFill();
        
        this.container.addChild(this.graphics);
    }

    checkCollision(projectile: Projectile): boolean {
        const dx = projectile.x - this.x;
        const dy = projectile.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance <= this.radius;
    }

    destroy(): void {
        this.container.destroy();
        if (this.platform) {
            this.platform.destroy();
        }
    }
}

// Simple archer class
class SimpleArcher {
    container: Container;
    circle: Graphics;
    line: Graphics;

    constructor() {
        this.container = new Container();
        // Position in center of screen for debugging
        this.container.position.set(window.innerWidth / 2, window.innerHeight / 2);
        
        // Create circle
        this.circle = new Graphics();
        this.circle.beginFill(0x000000);
        this.circle.drawCircle(0, 0, 20);
        this.circle.endFill();
        
        // Create red line pointing right
        this.line = new Graphics();
        this.line.lineStyle(3, 0xFF0000);
        this.line.moveTo(0, 0);
        this.line.lineTo(30, 0);
        
        this.container.addChild(this.circle);
        this.container.addChild(this.line);
    }

    updateAngle(angle: number): void {
        this.container.rotation = angle;
    }

    destroy(): void {
        this.container.destroy();
    }
}

export class ArcherGame {
    private app: Application;
    private gameContainer: Container;
    private bow: SimpleArcher;
    private projectiles: Projectile[] = [];
    private targets: Target[] = [];
    private boxes: Box[] = [];
    private score: number = 0;
    private highScore: number = 0;
    private targetsHit: number = 0;
    private currentRound: number = 1;
    private isGameOver: boolean = false;
    private isPaused: boolean = false;
    private isWaitingToStart: boolean = false;
    private isAiming: boolean = false;
    private currentAngle: number = Math.PI / 4; // 45 degrees
    private currentPower: number = 0;
    private powerCharging: boolean = false;
    private removeInputHandler?: () => void;
    private removeTopBarHandler?: () => void;
    private powerMeter?: HTMLElement;
    private powerFill?: HTMLElement;
    private powerLabel?: HTMLElement;
    private angleIndicator?: HTMLElement;

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.app.stage.addChild(this.gameContainer);
        
        // Load high score
        this.highScore = parseInt(localStorage.getItem('archerHighScore') || '0');
        
        // Initialize bow and add to stage
        this.bow = new SimpleArcher();
        this.app.stage.addChild(this.bow.container);
    }

    async init(): Promise<void> {
        this.createUI();
        this.createGround();
        this.setupInput();
        this.setupTopBarEvents();
        this.updateUI();
        this.spawnTarget();
    }

    private createUI(): void {
        // Create power meter
        this.powerMeter = document.createElement('div');
        this.powerMeter.className = 'power-meter';
        
        this.powerFill = document.createElement('div');
        this.powerFill.className = 'power-fill';
        this.powerMeter.appendChild(this.powerFill);
        
        this.powerLabel = document.createElement('div');
        this.powerLabel.className = 'power-label';
        this.powerLabel.textContent = 'Power: 0%';
        
        // Create angle indicator
        this.angleIndicator = document.createElement('div');
        this.angleIndicator.className = 'angle-indicator';
        this.angleIndicator.textContent = 'Angle: 45°';
        
        document.getElementById('gameContainer')?.appendChild(this.powerMeter);
        document.getElementById('gameContainer')?.appendChild(this.powerLabel);
        document.getElementById('gameContainer')?.appendChild(this.angleIndicator);
    }

    private createGround(): void {
        const ground = new Graphics();
        ground.beginFill(0x8FBC8F);
        ground.lineStyle(2, 0x556B2F);
        ground.drawRect(0, window.innerHeight - GROUND_HEIGHT - 120, window.innerWidth, GROUND_HEIGHT);
        ground.endFill();
        
        // Add some grass texture
        ground.lineStyle(1, 0x556B2F);
        for (let i = 0; i < window.innerWidth; i += 20) {
            ground.moveTo(i, window.innerHeight - GROUND_HEIGHT - 120);
            ground.lineTo(i + 10, window.innerHeight - GROUND_HEIGHT - 130);
        }
        
        this.app.stage.addChild(ground);
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

    private setupInput(): void {
        this.app.stage.interactive = true;
        this.app.stage.hitArea = this.app.screen;

        this.app.stage.on('pointermove', this.onPointerMove, this);
        this.app.stage.on('pointerdown', this.onPointerDown, this);
        this.app.stage.on('pointerup', this.onPointerUp, this);
        this.app.stage.on('pointerupoutside', this.onPointerUp, this);

        this.removeInputHandler = () => {
            this.app.stage.off('pointermove', this.onPointerMove, this);
            this.app.stage.off('pointerdown', this.onPointerDown, this);
            this.app.stage.off('pointerup', this.onPointerUp, this);
            this.app.stage.off('pointerupoutside', this.onPointerUp, this);
        };
    }

    private onPointerMove(event: FederatedPointerEvent): void {
        if (this.isGameOver || this.isPaused || this.isWaitingToStart) return;
        this.updateAim(event.global.x, event.global.y);
    }

    private onPointerDown(event: FederatedPointerEvent): void {
        if (this.isGameOver || this.isPaused || this.isWaitingToStart) return;
        this.startCharging();
    }

    private onPointerUp(event: FederatedPointerEvent): void {
        if (this.isGameOver || this.isPaused || this.isWaitingToStart) return;
        this.shoot();
    }

    private startCharging(): void {
        this.isAiming = true;
        this.powerCharging = true;
        this.currentPower = MIN_POWER;
    }

    private updateAim(clientX: number, clientY: number): void {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        const dx = clientX - centerX;
        const dy = clientY - centerY;
        
        // Calculate angle from center to mouse
        this.currentAngle = Math.atan2(dy, dx);
        
        // Update circle rotation
        this.bow.updateAngle(this.currentAngle);
        
        // Update angle indicator
        if (this.angleIndicator) {
            this.angleIndicator.textContent = `Angle: ${Math.round(this.currentAngle * 180 / Math.PI)}°`;
        }
    }

    private shoot(): void {
        if (!this.isAiming || !this.powerCharging) return;
        
        this.isAiming = false;
        this.powerCharging = false;
        
        // Create projectile from circle center
        const circleX = BOW_POSITION.x;
        const circleY = window.innerHeight - GROUND_HEIGHT - 120 - 50;
        
        const projectile = new Projectile(
            circleX,
            circleY,
            this.currentAngle,
            this.currentPower
        );
        
        this.projectiles.push(projectile);
        this.app.stage.addChild(projectile.container);
        
        // Reset power
        this.currentPower = 0;
        if (this.powerFill) {
            this.powerFill.style.width = '0%';
        }
        if (this.powerLabel) {
            this.powerLabel.textContent = 'Power: 0%';
        }
    }

    update(deltaTime: number): void {
        if (this.isGameOver || this.isPaused || this.isWaitingToStart) return;

        // Update power charging
        if (this.powerCharging && this.currentPower < MAX_POWER) {
            this.currentPower += POWER_CHARGE_RATE * deltaTime;
            this.currentPower = Math.min(MAX_POWER, this.currentPower);
            
            if (this.powerFill) {
                const powerPercent = (this.currentPower / MAX_POWER) * 100;
                this.powerFill.style.width = powerPercent + '%';
            }
            if (this.powerLabel) {
                const powerPercent = Math.round((this.currentPower / MAX_POWER) * 100);
                this.powerLabel.textContent = `Power: ${powerPercent}%`;
            }
        }

        // Update projectiles
        this.projectiles = this.projectiles.filter(projectile => {
            const isActive = projectile.update(deltaTime);
            
            // Check collision with targets
            if (isActive) {
                for (let i = this.targets.length - 1; i >= 0; i--) {
                    const target = this.targets[i];
                    if (target.checkCollision(projectile)) {
                        // Hit target!
                        this.score += target.points;
                        this.targetsHit++;
                        this.currentRound++;
                        target.destroy();
                        this.targets.splice(i, 1);
                        projectile.destroy();
                        this.updateUI();
                        
                        // Check if game is over (10 rounds)
                        if (this.currentRound > 10) {
                            this.gameOver();
                            return false;
                        }
                        
                        // Spawn new target for next round
                        setTimeout(() => {
                            this.spawnTarget();
                        }, 1000); // 1 second delay between rounds
                        
                        return false;
                    }
                }
            }
            
            return isActive;
        });

        // Spawn initial target if none exists
        if (this.targets.length === 0 && !this.isWaitingToStart) {
            this.spawnTarget();
        }
    }

    private spawnTarget(): void {
        // Clear existing targets
        this.targets.forEach(target => target.destroy());
        this.targets = [];

        // Clear existing boxes
        this.boxes.forEach(box => box.destroy());
        this.boxes = [];
        
        const placeOnBox = Math.random() < 0.5;
        let targetX: number;
        let targetY: number;
        let platform: Box | undefined = undefined;

        const minX = window.innerWidth / 2 + 100;
        const maxX = window.innerWidth - 100;

        if (placeOnBox) {
            const boxWidth = Math.random() * 100 + 50;
            const boxHeight = Math.random() * 150 + 50;
            const boxX = Math.random() * (maxX - minX - boxWidth) + minX;
            const boxY = window.innerHeight - GROUND_HEIGHT - 120 - boxHeight;
            
            platform = new Box(boxX, boxY, boxWidth, boxHeight);
            this.app.stage.addChild(platform.container);
            this.boxes.push(platform);

            targetX = boxX + boxWidth / 2;
            targetY = boxY - 30; // 30 is target radius
        } else {
            targetX = Math.random() * (maxX - minX) + minX;
            targetY = window.innerHeight - GROUND_HEIGHT - 120 - 30; // 30 is target radius
        }

        const target = new Target(targetX, targetY, 30, platform);
        this.app.stage.addChild(target.container);
        this.targets.push(target);
    }

    private gameOver(): void {
        this.isGameOver = true;
        
        // Update high score
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('archerHighScore', this.highScore.toString());
        }
        
        this.showGameOver();
    }

    private showGameOver(): void {
        const gameOver = document.getElementById('gameOver');
        const finalScore = document.getElementById('finalScore');
        const finalTargets = document.getElementById('finalTargets');
        const finalRounds = document.getElementById('finalRounds');
        
        if (gameOver && finalScore && finalTargets && finalRounds) {
            finalScore.textContent = this.score.toString();
            finalTargets.textContent = this.targetsHit.toString();
            finalRounds.textContent = (this.currentRound - 1).toString();
            gameOver.style.display = 'block';
        }
    }

    private updateUI(): void {
        const scoreElement = document.getElementById('score');
        const highScoreElement = document.getElementById('highScore');
        const targetsElement = document.getElementById('targets');
        const roundElement = document.getElementById('round');
        
        if (scoreElement) scoreElement.textContent = this.score.toString();
        if (highScoreElement) highScoreElement.textContent = this.highScore.toString();
        if (targetsElement) targetsElement.textContent = this.targetsHit.toString();
        if (roundElement) roundElement.textContent = this.currentRound.toString();
    }

    togglePause(): void {
        this.isPaused = !this.isPaused;
        
        if (this.isPaused) {
            this.showPauseMenu();
        } else {
            this.hidePauseMenu();
        }
    }

    private showPauseMenu(): void {
        const pauseMenu = document.getElementById('pauseMenu');
        if (pauseMenu) {
            pauseMenu.style.display = 'block';
        }
    }

    private hidePauseMenu(): void {
        const pauseMenu = document.getElementById('pauseMenu');
        if (pauseMenu) {
            pauseMenu.style.display = 'none';
        }
    }

    restart(): void {
        // Clear projectiles, targets, and boxes
        this.projectiles.forEach(projectile => projectile.destroy());
        this.targets.forEach(target => target.destroy());
        this.boxes.forEach(box => box.destroy());
        this.projectiles = [];
        this.targets = [];
        this.boxes = [];
        
        // Reset game state
        this.score = 0;
        this.targetsHit = 0;
        this.currentRound = 1;
        this.isGameOver = false;
        this.isPaused = false;
        this.isWaitingToStart = false;
        this.isAiming = false;
        this.currentAngle = Math.PI / 4;
        this.currentPower = 0;
        this.powerCharging = false;
        
        // Reset bow
        this.bow.updateAngle(this.currentAngle);
        
        // Reset UI
        this.updateUI();
        if (this.powerFill) this.powerFill.style.width = '0%';
        if (this.powerLabel) this.powerLabel.textContent = 'Power: 0%';
        if (this.angleIndicator) this.angleIndicator.textContent = 'Angle: 45°';
        
        // Hide menus
        const gameOver = document.getElementById('gameOver');
        const pauseMenu = document.getElementById('pauseMenu');
        
        if (gameOver) gameOver.style.display = 'none';
        if (pauseMenu) pauseMenu.style.display = 'none';
        
        // Spawn initial target immediately
        this.spawnTarget();
    }

    resume(): void {
        this.isPaused = false;
        this.hidePauseMenu();
    }

    destroy(): void {
        // Clean up event listeners
        if (this.removeInputHandler) {
            this.removeInputHandler();
        }
        if (this.removeTopBarHandler) {
            this.removeTopBarHandler();
        }
        
        // Clean up game objects
        this.projectiles.forEach(projectile => projectile.destroy());
        this.targets.forEach(target => target.destroy());
        this.boxes.forEach(box => box.destroy());
        this.bow.destroy();
        
        // Clean up UI elements
        if (this.powerMeter) this.powerMeter.remove();
        if (this.powerLabel) this.powerLabel.remove();
        if (this.angleIndicator) this.angleIndicator.remove();
    }

    returnToMainMenu(): void {
        window.location.href = '/arcade/';
    }

    startGame(): void {
        // This method is no longer needed since game starts immediately
        // Keeping it for compatibility with global functions
    }
}

// Global functions for HTML buttons
declare global {
    interface Window {
        startArcherGame: () => void;
        restartGame: () => void;
        returnToMainMenu: () => void;
        resumeGame: () => void;
        togglePause: () => void;
    }
}

let game: ArcherGame;

async function initGame() {
    const app = new Application({
        width: window.innerWidth,
        height: window.innerHeight - 120,
        backgroundColor: 0x87CEEB,
        resolution: window.devicePixelRatio || 1,
    });

    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.appendChild(app.view as HTMLCanvasElement);
    }

    game = new ArcherGame(app);
    await game.init();

    // Start game loop
    app.ticker.add((delta) => {
        game.update(delta);
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        app.renderer.resize(window.innerWidth, window.innerHeight - 120);
    });
}

// Set up global functions
window.startArcherGame = () => {
    if (game) game.startGame();
};

window.restartGame = () => {
    if (game) game.restart();
};

window.returnToMainMenu = () => {
    if (game) game.returnToMainMenu();
};

window.resumeGame = () => {
    if (game) game.resume();
};

window.togglePause = () => {
    if (game) game.togglePause();
};

// Initialize when page loads
window.addEventListener('load', initGame); 