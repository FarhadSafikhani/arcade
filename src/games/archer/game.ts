import { Application, Container, Graphics, Text, FederatedPointerEvent } from 'pixi.js';
import { isTouchDevice } from '../../shared/utils/device-detection';

// Game constants - fixed base dimensions
const BASE_GAME_WIDTH = 1920;
const BASE_GAME_HEIGHT = 1080;

// Game constants
const GRAVITY = 0.2;
const MAX_POWER = 25;
const MIN_POWER = 2;
const POWER_CHARGE_RATE = 0.75;
const GROUND_HEIGHT = 50;

// Responsive scaling function
const getGameDimensions = () => {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight - 120; // Account for top bar and margins
    
    // Calculate scale to fit within available space while maintaining aspect ratio
    const scaleX = windowWidth / BASE_GAME_WIDTH;
    const scaleY = windowHeight / BASE_GAME_HEIGHT;
    const scale = Math.min(scaleX, scaleY);
    
    return {
        gameWidth: BASE_GAME_WIDTH,
        gameHeight: BASE_GAME_HEIGHT,
        scale
    };
};

// Box/platform class
class Box {
    container: Container;
    graphics: Graphics;

    constructor(x: number, y: number, width: number, height: number) {
        this.container = new Container();
        this.container.position.set(x, BASE_GAME_HEIGHT - y - height);
        
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
        this.vy = Math.sin(angle) * power;
        
        // Create arrow container
        this.container = new Container();
        this.container.position.set(x, y);
        this.container.rotation = angle;
        
        // Create arrow graphics
        this.graphics = new Graphics();
        
        // Arrow shaft (pointing to the right)
        this.graphics.lineStyle(4, 0xFF8C00); // Bright orange shaft
        this.graphics.moveTo(0, 0);
        this.graphics.lineTo(30, 0);
        
        // Arrow head (pointing to the right)
        this.graphics.beginFill(0xFF8C00); // Bright orange arrowhead
        this.graphics.moveTo(30, -4);
        this.graphics.lineTo(30, 4);
        this.graphics.lineTo(38, 0);
        this.graphics.endFill();
        
        // Arrow fletching (at the back)
        this.graphics.beginFill(0xFF8C00); // Bright orange fletching
        this.graphics.drawRect(-3, -2, 6, 4);
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
        
        // Update rotation to point in direction of travel
        const travelAngle = Math.atan2(this.vy, this.vx);
        this.container.rotation = travelAngle;

        // Check if hit ground
        if (this.y >= BASE_GAME_HEIGHT - GROUND_HEIGHT) {
            this.active = false;
            this.container.destroy();
            return false;
        }

        // Check if out of bounds
        if (this.x > BASE_GAME_WIDTH || this.x < 0 || this.y < 0) {
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
    bodyContainer: Container;
    arrowContainer: Container;
    circle: Graphics;
    bowArrow: Projectile | null = null;

    constructor() {
        this.container = new Container();
        // Position in center of base game dimensions
        this.container.position.set(BASE_GAME_WIDTH / 2, BASE_GAME_HEIGHT / 2);
        
        // Create body container (doesn't rotate)
        this.bodyContainer = new Container();
        
        // Create circle (head)
        this.circle = new Graphics();
        this.circle.beginFill(0x000000);
        this.circle.drawCircle(0, 0, 20);
        this.circle.endFill();
        
        // Create body line
        const body = new Graphics();
        body.lineStyle(4, 0x000000);
        body.moveTo(0, 20);
        body.lineTo(0, 55);
        
        // Create legs
        const leftLeg = new Graphics();
        leftLeg.lineStyle(4, 0x000000);
        leftLeg.moveTo(0, 50);
        leftLeg.lineTo(-10, 80);
        
        const rightLeg = new Graphics();
        rightLeg.lineStyle(4, 0x000000);
        rightLeg.moveTo(0, 50);
        rightLeg.lineTo(10, 80);
        
        // Create arrow container for positioning (rotates with aim)
        this.arrowContainer = new Container();
        
        // Create bow arrow using Projectile class
        this.bowArrow = new Projectile(0, 0, 0, 0);
        this.bowArrow.active = false; // Disable physics while on bow
        this.arrowContainer.addChild(this.bowArrow.container);
        
        this.bodyContainer.addChild(this.circle);
        this.bodyContainer.addChild(body);
        this.bodyContainer.addChild(leftLeg);
        this.bodyContainer.addChild(rightLeg);
        this.container.addChild(this.bodyContainer);
        this.container.addChild(this.arrowContainer);
    }

    updateAngle(angle: number): void {
        // Only rotate the arrow container, not the body
        this.arrowContainer.rotation = angle;
    }

    updateArrowPosition(power: number, maxPower: number): void {
        if (!this.bowArrow) return;
        
        // Pull arrow back based on power (0 = fully back, 1 = ready to fire)
        const pullbackDistance = (power / maxPower) * 20; // Pull back up to 20px
        
        // Calculate pullback direction based on current rotation
        const pullbackX = -Math.cos(this.arrowContainer.rotation) * pullbackDistance;
        const pullbackY = -Math.sin(this.arrowContainer.rotation) * pullbackDistance;
        
        this.arrowContainer.x = pullbackX;
        this.arrowContainer.y = pullbackY;
    }

    getBowArrow(): Projectile | null {
        return this.bowArrow;
    }

    clearBowArrow(): void {
        this.bowArrow = null;
    }

    createNewBowArrow(): void {
        this.bowArrow = new Projectile(0, 0, 0, 0);
        this.bowArrow.active = false; // Disable physics while on bow
        this.arrowContainer.addChild(this.bowArrow.container);
        // Reset arrow position
        this.updateArrowPosition(0, MAX_POWER);
    }

    destroy(): void {
        this.container.destroy();
    }
}

export class ArcherGame {
    private app: Application;
    private gameContainer: Container;
    private simpleArcher: SimpleArcher;
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
    private angleIndicator?: HTMLElement;

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.app.stage.addChild(this.gameContainer);
        
        // Load high score
        this.highScore = parseInt(localStorage.getItem('archerHighScore') || '0');
        
        // Initialize bow and add to stage
        this.simpleArcher = new SimpleArcher();
        this.app.stage.addChild(this.simpleArcher.container);
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
        
        // Create angle indicator
        this.angleIndicator = document.createElement('div');
        this.angleIndicator.className = 'angle-indicator';
        this.angleIndicator.textContent = 'Angle: 45°';
        
        document.getElementById('gameContainer')?.appendChild(this.powerMeter);
        document.getElementById('gameContainer')?.appendChild(this.angleIndicator);
    }

    private createGround(): void {
        const ground = new Graphics();
        ground.beginFill(0x8FBC8F);
        ground.lineStyle(2, 0x556B2F);
        ground.drawRect(0, BASE_GAME_HEIGHT - GROUND_HEIGHT, BASE_GAME_WIDTH, GROUND_HEIGHT);
        ground.endFill();
        
        // Add some grass texture
        ground.lineStyle(1, 0x556B2F);
        for (let i = 0; i < BASE_GAME_WIDTH; i += 20) {
            ground.moveTo(i, BASE_GAME_HEIGHT - GROUND_HEIGHT);
            ground.lineTo(i + 10, BASE_GAME_HEIGHT - GROUND_HEIGHT - 10);
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
        const centerX = BASE_GAME_WIDTH / 2;
        const centerY = BASE_GAME_HEIGHT / 2;
        
        const dx = clientX - centerX;
        const dy = clientY - centerY;
        
        // Calculate angle from center to mouse
        this.currentAngle = Math.atan2(dy, dx);
        
        // Update circle rotation
        this.simpleArcher.updateAngle(this.currentAngle);
        
        // Update angle indicator
        if (this.angleIndicator) {
            this.angleIndicator.textContent = `Angle: ${Math.round(this.currentAngle * 180 / Math.PI)}°`;
        }
    }

    private shoot(): void {
        if (!this.isAiming || !this.powerCharging) return;
        
        // Check if we have a bow arrow to shoot
        const bowArrow = this.simpleArcher.getBowArrow();
        if (!bowArrow) {
            return;
        }
        
        this.isAiming = false;
        this.powerCharging = false;

        // Remove from bow container
        this.simpleArcher.arrowContainer.removeChild(bowArrow.container);
        
        // Set up the projectile with current position, angle, and power
        bowArrow.x = this.simpleArcher.container.x;
        bowArrow.y = this.simpleArcher.container.y;
        bowArrow.vx = Math.cos(this.currentAngle) * this.currentPower;
        bowArrow.vy = Math.sin(this.currentAngle) * this.currentPower;
        bowArrow.active = true; // Enable physics
        
        // Update visual position and rotation
        bowArrow.container.position.set(bowArrow.x, bowArrow.y);
        bowArrow.container.rotation = this.currentAngle;
        
        this.projectiles.push(bowArrow);
        this.app.stage.addChild(bowArrow.container);
        
        // Clear the bow arrow (so getBowArrow() returns null)
        this.simpleArcher.clearBowArrow();
        
        // Create new bow arrow (commented out for testing)
        this.simpleArcher.createNewBowArrow();
        
        // Reset power
        this.currentPower = 0;
        if (this.powerFill) {
            this.powerFill.style.width = '0%';
        }
        if (this.angleIndicator) {
            this.angleIndicator.textContent = 'Angle: 45°';
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
            
            // Update arrow position (pull back as power increases)
            this.simpleArcher.updateArrowPosition(this.currentPower, MAX_POWER);
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
                        // Temporarily disabled - score and target tracking
                        /*
                        this.score += target.points;
                        this.targetsHit++;
                        this.currentRound++;
                        */
                        //target.destroy();
                        //this.targets.splice(i, 1);
                        projectile.destroy();
                        // this.updateUI();
                        
                        // Check if game is over (10 rounds)
                        /*
                        if (this.currentRound > 10) {
                            this.gameOver();
                            return false;
                        }
                        */
                        
                        // // Spawn new target for next round
                        // setTimeout(() => {
                        //     this.spawnTarget();
                        // }, 1000); // 1 second delay between rounds
                        
                        return false;
                    }
                }
            }
            
            return isActive;
        });

        // // Spawn initial target if none exists
        // if (this.targets.length === 0 && !this.isWaitingToStart) {
        //     this.spawnTarget();
        // }
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

        const minX = BASE_GAME_WIDTH / 2 + 100;
        const maxX = BASE_GAME_WIDTH - 100;

        if (placeOnBox) {
            const boxWidth = Math.random() * 100 + 50;
            const boxHeight = Math.random() * 150 + 50;
            const boxX = Math.random() * (maxX - minX - boxWidth) + minX;
            const boxY = BASE_GAME_HEIGHT - GROUND_HEIGHT - boxHeight;
            
            platform = new Box(boxX, boxY, boxWidth, boxHeight);
            this.app.stage.addChild(platform.container);
            this.boxes.push(platform);

            targetX = boxX + boxWidth / 2;
            targetY = boxY - 30; // 30 is target radius
        } else {
            targetX = Math.random() * (maxX - minX) + minX;
            targetY = BASE_GAME_HEIGHT - GROUND_HEIGHT - 30; // 30 is target radius
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
        // Temporarily disabled - score, high score, targets, and round tracking
        /*
        const scoreElement = document.getElementById('score');
        const highScoreElement = document.getElementById('highScore');
        const targetsElement = document.getElementById('targets');
        const roundElement = document.getElementById('round');
        
        if (scoreElement) scoreElement.textContent = this.score.toString();
        if (highScoreElement) highScoreElement.textContent = this.highScore.toString();
        if (targetsElement) targetsElement.textContent = this.targetsHit.toString();
        if (roundElement) roundElement.textContent = this.currentRound.toString();
        */
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
        // Temporarily disabled - score and target tracking
        /*
        this.score = 0;
        this.targetsHit = 0;
        this.currentRound = 1;
        */
        this.isGameOver = false;
        this.isPaused = false;
        this.isWaitingToStart = false;
        this.isAiming = false;
        this.currentAngle = Math.PI / 4;
        this.currentPower = 0;
        this.powerCharging = false;
        
        // Reset bow
        this.simpleArcher.updateAngle(this.currentAngle);
        
        // Reset arrow position
        this.simpleArcher.updateArrowPosition(0, MAX_POWER);
        
        // Reset UI
        // this.updateUI();
        if (this.powerFill) this.powerFill.style.width = '0%';
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
        this.simpleArcher.destroy();
        
        // Clean up UI elements
        if (this.powerMeter) this.powerMeter.remove();
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
        restartGame: () => void;
        returnToMainMenu: () => void;
        resumeGame: () => void;
        togglePause: () => void;
    }
}

// Global game instance
let game: ArcherGame | null = null;
let app: Application | null = null;

// Function to update canvas scaling on resize
function updateCanvasScaling() {
    if (!app) return;
    
    const dimensions = getGameDimensions();
    const canvas = app.view as HTMLCanvasElement;
    
    // Update canvas CSS dimensions
    canvas.style.width = `${BASE_GAME_WIDTH * dimensions.scale}px`;
    canvas.style.height = `${BASE_GAME_HEIGHT * dimensions.scale}px`;
}

async function initGame() {
    // Get dimensions and scale
    const dimensions = getGameDimensions();
    
    // Create PIXI application with base dimensions
    app = new Application({
        width: BASE_GAME_WIDTH,
        height: BASE_GAME_HEIGHT,
        backgroundColor: 0x87CEEB,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
    });

    // Add canvas to game container with proper scaling
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        const canvas = app.view as HTMLCanvasElement;
        
        // Apply scaling through CSS transform
        canvas.style.width = `${BASE_GAME_WIDTH * dimensions.scale}px`;
        canvas.style.height = `${BASE_GAME_HEIGHT * dimensions.scale}px`;
        canvas.style.maxWidth = '100%';
        canvas.style.maxHeight = '100%';
        canvas.style.objectFit = 'contain';
        
        gameContainer.appendChild(canvas);
    }

    // Create and initialize game
    game = new ArcherGame(app);
    await game.init();

    // Start game loop
    app.ticker.add((delta) => {
        if (game) {
            game.update(delta);
        }
    });
    
    // Add resize handler
    window.addEventListener('resize', updateCanvasScaling);
}

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