import { Application, Container, Graphics, FederatedPointerEvent, Point } from 'pixi.js';

// Game constants - fixed base dimensions
const BASE_GAME_WIDTH = 1920;
const BASE_GAME_HEIGHT = 1080;

// Game constants
const GRAVITY = 0.6;
const MAX_POWER = 45;
const MIN_POWER = 2;
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

// Stuck arrow class for arrows left behind
class StuckArrow {
    container: Container;
    graphics: Graphics;
    x: number;
    y: number;
    angle: number;

    constructor(x: number, y: number, angle: number) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        
        // Create arrow container
        this.container = new Container();
        this.container.position.set(x, y);
        this.container.rotation = angle;
        
        // Create arrow graphics
        this.graphics = new Graphics();
        
        // Arrow shaft (pointing to the right)
        this.graphics.lineStyle(4, 0xFF8C00); // Bright orange shaft
        this.graphics.moveTo(0, 0);
        this.graphics.lineTo(50, 0);
        
        // Arrow head (pointing to the right)
        this.graphics.beginFill(0xFF8C00); // Bright orange arrowhead
        this.graphics.moveTo(50, -4);
        this.graphics.lineTo(50, 4);
        this.graphics.lineTo(58, 0);
        this.graphics.endFill();
        
        // Arrow fletching (at the back)
        this.graphics.beginFill(0xFF8C00); // Bright orange fletching
        this.graphics.drawRect(-3, -2, 6, 4);
        this.graphics.endFill();
        
        this.container.addChild(this.graphics);
    }

    destroy(): void {
        this.container.destroy();
    }
}

// Box/platform class
class Box {
    container: Container;
    graphics: Graphics;
    width: number;
    height: number;

    constructor(x: number, y: number, width: number, height: number) {
        this.container = new Container();
        this.container.position.set(x, y);
        this.width = width;
        this.height = height;
        
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

    checkCollision(projectile: Projectile): boolean {
        // Get box bounds
        const boxLeft = this.container.x;
        const boxRight = this.container.x + this.width;
        const boxTop = this.container.y;
        const boxBottom = this.container.y + this.height;
        
        // Check if arrow position is within box bounds
        return projectile.x >= boxLeft && projectile.x <= boxRight && 
               projectile.y >= boxTop && projectile.y <= boxBottom;
    }
}

// Tree obstacle class
class Tree {
    container: Container;
    graphics: Graphics;
    x: number;
    y: number;
    width: number;
    height: number;

    constructor(x: number, y: number, width: number, height: number) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        
        this.container = new Container();
        this.container.position.set(x, y);
        
        this.graphics = new Graphics();
        
        // Draw tree trunk (brown rectangle)
        this.graphics.beginFill(0x8B4513); // Brown trunk
        this.graphics.lineStyle(2, 0x654321);
        this.graphics.drawRect(width * 0.4, height * 0.7, width * 0.2, height * 0.3);
        this.graphics.endFill();
        
        // Draw tree foliage (simple green rectangle)
        this.graphics.beginFill(0x228B22); // Forest green
        this.graphics.lineStyle(2, 0x006400);
        this.graphics.drawRect(0, 0, width, height * 0.7);
        this.graphics.endFill();
        
        this.container.addChild(this.graphics);
    }

    destroy(): void {
        this.container.destroy();
    }

    checkCollision(projectile: Projectile): boolean {
        // Get tree bounds (simplified as a rectangle for collision)
        const treeLeft = this.x;
        const treeRight = this.x + this.width;
        const treeTop = this.y;
        const treeBottom = this.y + this.height;
        
        // Check if arrow position is within tree bounds
        return projectile.x >= treeLeft && projectile.x <= treeRight && 
               projectile.y >= treeTop && projectile.y <= treeBottom;
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
    length: number = 50;
    game: ArcherGame; // Reference to the game

    constructor(x: number, y: number, angle: number, power: number, game: ArcherGame) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * power;
        this.vy = Math.sin(angle) * power;
        this.game = game;
        
        // Create arrow container
        this.container = new Container();
        this.container.position.set(x, y);
        this.container.rotation = angle;
        
        // Create arrow graphics
        this.graphics = new Graphics();
        
        // Arrow shaft (pointing to the right)
        this.graphics.lineStyle(4, 0xFF8C00); // Bright orange shaft
        this.graphics.moveTo(0, 0);
        this.graphics.lineTo(this.length, 0);
        
        // Arrow head (pointing to the right)
        this.graphics.beginFill(0xFF8C00); // Bright orange arrowhead
        this.graphics.moveTo(this.length, -4);
        this.graphics.lineTo(this.length, 4);
        this.graphics.lineTo(this.length + 8, 0);
        this.graphics.endFill();
        
        // Arrow fletching (at the back)
        this.graphics.beginFill(0xFF8C00); // Bright orange fletching
        this.graphics.drawRect(-3, -2, 6, 4);
        this.graphics.endFill();
        
        this.container.addChild(this.graphics);
    }

    update(): boolean {
        if (!this.active) return false;

        // Gravity
        this.vy += GRAVITY;

        // Drag
        this.vx *= 0.999;

        // Update position with fixed time step
        this.x += this.vx;
        this.y += this.vy;

        // Update visual position
        this.container.position.set(this.x, this.y);
        
        // Update rotation to point in direction of travel
        const travelAngle = Math.atan2(this.vy, this.vx);
        this.container.rotation = travelAngle;

        // Check collision with targets
        for (let i = this.game.targets.length - 1; i >= 0; i--) {
            const target = this.game.targets[i];
            if (target.checkCollision(this)) {
                // Hit target! Calculate actual collision point and create arrow graphic
                const collisionPoint = this.game.calculateCollisionPoint(this, target);
                this.game.spawnStuckArrow(collisionPoint.x, collisionPoint.y, this.container.rotation);
                
                this.destroy();
                return false;
            }
        }

        // Check collision with boxes
        for (let i = this.game.boxes.length - 1; i >= 0; i--) {
            const box = this.game.boxes[i];
            if (box.checkCollision(this)) {
                // Hit box! Create stuck arrow at collision point
                this.game.spawnStuckArrow(this.x, this.y, this.container.rotation);
                
                this.destroy();
                return false;
            }
        }

        // Check collision with trees
        for (let i = this.game.trees.length - 1; i >= 0; i--) {
            const tree = this.game.trees[i];
            if (tree.checkCollision(this)) {
                // Hit tree! Create stuck arrow at collision point
                this.game.spawnStuckArrow(this.x, this.y, this.container.rotation);
                
                this.destroy();
                return false;
            }
        }

        // Check if hit ground
        if (this.y >= BASE_GAME_HEIGHT - GROUND_HEIGHT) {
            // Hit ground! Create stuck arrow using current rotation
            this.game.spawnStuckArrow(this.x, BASE_GAME_HEIGHT - GROUND_HEIGHT, this.container.rotation);
            this.destroy();
            return false;
        }

        // Check if out of bounds
        if (this.x > BASE_GAME_WIDTH || this.x < 0) {
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
    platform?: Box;

    constructor(x: number, y: number, radius: number = 30, platform?: Box) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.platform = platform;

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
    bowHand: Graphics;
    game: ArcherGame;

    bowRadius: number = 35;

    constructor(game: ArcherGame) {
        this.game = game;
        this.container = new Container();
        // Position on ground, to the left of screen
        this.container.position.set(200, BASE_GAME_HEIGHT - GROUND_HEIGHT - 90); // 90 is roughly the height of the archer
        
        // Create body container (doesn't rotate)
        this.bodyContainer = new Container();

        // Create quiver (gray box at back)
        const quiver = new Graphics();
        quiver.beginFill(0x808080); // Gray color
        quiver.drawRect(-30, 20, 18, 32); // 16x25 rectangle, moved left and up
        quiver.endFill();
        quiver.rotation = -.1;

        //draw some arrows in the quiver
        const quiverArrows = new Graphics();
        quiverArrows.beginFill(0xFF8C00);
        quiverArrows.drawRect(-30, 5, 4, 12); // Position relative to quiver
        quiverArrows.endFill();
        quiverArrows.rotation = -.1;
        quiver.addChild(quiverArrows);

        // Add 2 more arrows
        const quiverArrow2 = new Graphics();
        quiverArrow2.beginFill(0xFF8C00);
        quiverArrow2.drawRect(-25, 5, 4, 12); // Second arrow
        quiverArrow2.endFill();
        quiverArrow2.rotation = -.1;
        quiver.addChild(quiverArrow2);

        const quiverArrow3 = new Graphics();
        quiverArrow3.beginFill(0xFF8C00);
        quiverArrow3.drawRect(-20, 5, 4, 12); // Third arrow
        quiverArrow3.endFill();
        quiverArrow3.rotation = -.1;
        quiver.addChild(quiverArrow3);
        
        // Create circle (head)
        this.circle = new Graphics();
        this.circle.beginFill(0x000000);
        this.circle.drawCircle(0, 0, 20);
        this.circle.endFill();
        
        // Create body line
        const body = new Graphics();
        body.lineStyle(8, 0x000000);
        body.moveTo(0, 20);
        body.lineTo(0, 55);
        
        // Create hand holding the bow
        this.bowHand = new Graphics();
        this.bowHand.lineStyle(6, 0x000000);
        this.bowHand.moveTo(0, 35); // Start from middle of body
        this.bowHand.lineTo(35, 0); // Go to front center of bow (radius 35)
        
        // Create legs
        const leftLeg = new Graphics();
        leftLeg.lineStyle(8, 0x000000);
        leftLeg.moveTo(0, 50);
        leftLeg.lineTo(-10, 90);
        
        const rightLeg = new Graphics();
        rightLeg.lineStyle(8, 0x000000);
        rightLeg.moveTo(0, 50);
        rightLeg.lineTo(10, 90);
        

        
        // Create arrow container for positioning (rotates with aim)
        this.arrowContainer = new Container();
        this.arrowContainer.y = 15; // Move down closer to shoulders
        
        // Create bow (simple brown arch)
        const bow = new Graphics();
        bow.lineStyle(6, 0x8B4513); // Brown color
        bow.arc(0, 0, this.bowRadius, -Math.PI/2, Math.PI/2, false); // Semi-circle arch from left to right
        
        // Create bow arrow using Projectile class
        this.createNewBowArrow();
        
        this.bodyContainer.addChild(quiver);
        this.bodyContainer.addChild(this.circle);
        this.bodyContainer.addChild(body);
        this.bodyContainer.addChild(this.bowHand);
        this.bodyContainer.addChild(leftLeg);
        this.bodyContainer.addChild(rightLeg);
        this.container.addChild(this.bodyContainer);
        this.arrowContainer.addChild(bow);
        this.container.addChild(this.arrowContainer);
    }

    updateAngle(angle: number): void {
        // Only rotate the arrow container, not the body
        this.arrowContainer.rotation = angle;
        
        // Update hand position to point to bow center
        this.updateHandPosition(angle);
    }

    updateHandPosition(angle: number): void {
        // Clear the hand graphics
        this.bowHand.clear();
        
        // Redraw the hand line from body to bow center
        this.bowHand.lineStyle(6, 0x000000);
        this.bowHand.moveTo(0, 35); // Start from middle of body
        
        // Calculate bow center position based on angle
        // Account for arrowContainer's y offset of 15px
        const bowCenterX = Math.cos(angle) * this.bowRadius;
        const bowCenterY = Math.sin(angle) * this.bowRadius + 15; // Add the 15px offset
        
        this.bowHand.lineTo(bowCenterX, bowCenterY); // Go to bow center
    }

    updateArrowPosition(power: number, maxPower: number): void {
        if (!this.bowArrow) return;
        
        // Pull arrow back based on power (0 = fully back, 1 = ready to fire)
        const pullbackDistance = (power / maxPower) * 20; // Pull back up to 20px
        
        // Move the arrow graphics within the container, not the container itself
        // This keeps the rotation center at the bow position
        this.bowArrow.container.x = -pullbackDistance;
        this.bowArrow.container.y = 0;
    }

    getBowArrow(): Projectile | null {
        return this.bowArrow;
    }

    clearBowArrow(): void {
        this.bowArrow = null;
    }

    createNewBowArrow(): void {
        this.bowArrow = new Projectile(0, 0, 0, 0, this.game);
        this.bowArrow.active = false; // Disable physics while on bow
        this.bowArrow.container.x = 10; // Move arrow forward a bit
        this.arrowContainer.addChild(this.bowArrow.container);
        // Reset arrow position
        this.updateArrowPosition(0, MAX_POWER);
    }

    destroy(): void {
        this.container.destroy();
    }
}

export class ArcherGame {
    public app: Application;
    private gameContainer: Container;
    private simpleArcher: SimpleArcher;
    public projectiles: Projectile[] = [];
    public targets: Target[] = [];
    public boxes: Box[] = [];
    public trees: Tree[] = [];
    private stuckArrows: StuckArrow[] = [];
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
    private isDragging: boolean = false;
    private dragStartX: number = 0;
    private dragStartY: number = 0;
    private removeInputHandler?: () => void;
    private removeTopBarHandler?: () => void;
    private powerMeter?: HTMLElement;
    private powerFill?: HTMLElement;
    private angleIndicator?: HTMLElement;
    private trajectoryLine?: Graphics;
    private arrowsRemaining: number = 10;
    private deltaAccumulator: number = 0;
    private readonly UPDATE_RATE: number = 1 / 60; // 60 FPS

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.app.stage.addChild(this.gameContainer);
        
        // Load high score
        this.highScore = parseInt(localStorage.getItem('archerHighScore') || '0');
        
        // Initialize bow and add to stage
        this.simpleArcher = new SimpleArcher(this);
        this.app.stage.addChild(this.simpleArcher.container);
        
        // Initialize UI
        this.updateUI();
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
        
        // Handle drag-to-charge mechanics
        if (this.isDragging) {
            const archerX = this.simpleArcher.container.x;
            const archerY = this.simpleArcher.container.y;
            
            // Calculate distance from archer to drag start
            const startDistanceFromArcher = Math.sqrt(
                Math.pow(this.dragStartX - archerX, 2) + 
                Math.pow(this.dragStartY - archerY, 2)
            );
            
            // Calculate distance from archer to current mouse position
            const currentDistanceFromArcher = Math.sqrt(
                Math.pow(event.global.x - archerX, 2) + 
                Math.pow(event.global.y - archerY, 2)
            );
            
            // Calculate distance from drag start
            const dragDistance = Math.sqrt(
                Math.pow(event.global.x - this.dragStartX, 2) + 
                Math.pow(event.global.y - this.dragStartY, 2)
            );
            
            // Only charge if we've moved enough distance
            if (dragDistance > 5) {
                // Calculate the difference in distance from archer
                const distanceChange = startDistanceFromArcher - currentDistanceFromArcher;
                
                // Base power on the distance change, not accumulating
                if (distanceChange > 0) {
                    // Moving toward archer - increase charge
                    this.powerCharging = true;
                    this.currentPower = Math.min(MAX_POWER, MIN_POWER + distanceChange * 0.05);
                } else {
                    // Moving away from archer - decrease charge
                    this.powerCharging = false;
                    this.currentPower = Math.max(MIN_POWER, MIN_POWER + distanceChange * 0.05);
                }
                
                // Update power bar
                if (this.powerFill) {
                    const powerPercent = (this.currentPower / MAX_POWER) * 100;
                    this.powerFill.style.width = powerPercent + '%';
                }
                
                // Update arrow position
                this.simpleArcher.updateArrowPosition(this.currentPower, MAX_POWER);
                
                // Update trajectory line
                this.updateTrajectoryLine();
            }
        }
    }

    private onPointerDown(event: FederatedPointerEvent): void {
        if (this.isGameOver || this.isPaused || this.isWaitingToStart) return;
        
        this.isDragging = true;
        this.dragStartX = event.global.x;
        this.dragStartY = event.global.y;
        this.isAiming = true;
        this.powerCharging = false;
        this.currentPower = MIN_POWER;
        
        // Initialize power bar
        if (this.powerFill) {
            const powerPercent = (this.currentPower / MAX_POWER) * 100;
            this.powerFill.style.width = powerPercent + '%';
        }
        
        // Initialize arrow position
        this.simpleArcher.updateArrowPosition(this.currentPower, MAX_POWER);
    }

    private onPointerUp(event: FederatedPointerEvent): void {
        if (this.isGameOver || this.isPaused || this.isWaitingToStart) return;
        
        if (this.isDragging && this.powerCharging) {
            this.shoot();
        }
        
        // Reset aim state
        this.resetAimState();
    }

    private updateAim(clientX: number, clientY: number): void {
        // Get archer's actual position in screen coordinates
        const archerX = this.simpleArcher.container.x;
        const archerY = this.simpleArcher.container.y;
        
        const dx = clientX - archerX;
        const dy = clientY - archerY;
        
        // Calculate angle from archer to mouse
        this.currentAngle = Math.atan2(dy, dx);
        
        // Update circle rotation
        this.simpleArcher.updateAngle(this.currentAngle);
        
        // Update angle indicator
        if (this.angleIndicator) {
            this.angleIndicator.textContent = `Angle: ${Math.round(this.currentAngle * 180 / Math.PI)}°`;
        }
    }

    private updateTrajectoryLine(): void {
        // Remove existing trajectory line
        if (this.trajectoryLine) {
            this.trajectoryLine.destroy();
            this.trajectoryLine = undefined;
        }

        // Only show trajectory when power charging
        if (!this.powerCharging || this.currentPower < MIN_POWER) {
            return;
        }

        // Create new trajectory line
        this.trajectoryLine = new Graphics();
        
        // Calculate the actual arrow position in world coordinates
        const arrowContainer = this.simpleArcher.arrowContainer;
        const bowArrow = this.simpleArcher.getBowArrow();
        
        if (!bowArrow) return;
        
        // Get the arrow's local position within the arrow container
        const arrowLocalX = bowArrow.container.x;
        const arrowLocalY = bowArrow.container.y;
        
        // Transform the arrow's local position to world coordinates
        const arrowWorldPos = arrowContainer.toGlobal(new Point(arrowLocalX, arrowLocalY));
        
        // Calculate initial velocity
        const vx = Math.cos(this.currentAngle) * this.currentPower;
        const vy = Math.sin(this.currentAngle) * this.currentPower;
        
        // Draw trajectory points starting from actual arrow position
        let x = arrowWorldPos.x;
        let y = arrowWorldPos.y;
        let currentVx = vx;
        let currentVy = vy;
        
        // Store trajectory points for fading effect
        const trajectoryPoints: { x: number; y: number, skip: boolean }[] = [];
        
        // Start from arrow position
        trajectoryPoints.push({ x, y, skip: false });
        
        // Draw trajectory in fixed pixel distance segments
        const segmentDistance = 30; // pixels between each segment
        let segmentDistanceTraveled = 0;
        const travelSkip = 80; // amount of min distance to skip
        const maxTraveled = 1600;
        let traveled = 0;

        while (traveled < maxTraveled) {
            // Apply gravity
            currentVy += GRAVITY;
            
            // Apply drag
            currentVx *= 0.999;
            
            // Update position
            x += currentVx;
            y += currentVy;
            traveled += Math.sqrt(currentVx * currentVx + currentVy * currentVy);
            segmentDistanceTraveled += Math.sqrt(currentVx * currentVx + currentVy * currentVy);
            
            // Add point every segmentDistance pixels
            if (segmentDistanceTraveled >= segmentDistance) {
                trajectoryPoints.push({ x, y, skip: traveled < travelSkip });
                segmentDistanceTraveled = 0;
            }
            
            // Stop if hit ground
            if (y >= BASE_GAME_HEIGHT - GROUND_HEIGHT) {
                trajectoryPoints.push({ x, y: BASE_GAME_HEIGHT - GROUND_HEIGHT, skip: traveled < travelSkip });
                break;
            }
            
            // Stop if out of bounds
            if (x > BASE_GAME_WIDTH || x < 0) {
                break;
            }

            
        }
        
        // Draw the trajectory line with fading effect, skipping first few segments
        if (trajectoryPoints.length > 1) {
            const totalPoints = trajectoryPoints.length;
            
            for (let i = 0; i < totalPoints - 1; i++) {
                const progress = (i) / (totalPoints - 1); // 0 to 1
                const alpha = 0.4 * (1 - progress * 0.9); // Start at 0.4, fade to 0.08
                
                this.trajectoryLine.lineStyle(4, 'red', alpha);
                if (!trajectoryPoints[i].skip) {
                    this.trajectoryLine.moveTo(trajectoryPoints[i].x, trajectoryPoints[i].y);
                    this.trajectoryLine.lineTo(trajectoryPoints[i + 1].x, trajectoryPoints[i + 1].y);
                }
            }
        }
        
        this.app.stage.addChild(this.trajectoryLine);
    }

    private shoot(): void {
        if (!this.isAiming || !this.powerCharging) return;
        
        // Check if we have arrows remaining
        if (this.arrowsRemaining <= 0) {
            // Don't allow shooting when out of ammo, but don't end game yet
            return;
        }
        
        // Check if we have a bow arrow to shoot
        const bowArrow = this.simpleArcher.getBowArrow();
        if (!bowArrow) {
            return;
        }

        this.isAiming = false;
        this.powerCharging = false;

        // Decrease arrow count
        this.arrowsRemaining--;

        // Remove from bow container
        this.simpleArcher.arrowContainer.removeChild(bowArrow.container);
        
        // Calculate the actual arrow position in world coordinates
        const arrowContainer = this.simpleArcher.arrowContainer;
        
        // Get the arrow's local position within the arrow container
        const arrowLocalX = bowArrow.container.x;
        const arrowLocalY = bowArrow.container.y;
        
        // Transform the arrow's local position to world coordinates
        const arrowWorldPos = arrowContainer.toGlobal(new Point(arrowLocalX, arrowLocalY));
        
        // Set up the projectile with the actual arrow position, angle, and power
        bowArrow.x = arrowWorldPos.x;
        bowArrow.y = arrowWorldPos.y;
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
        
        // Reset aim state
        this.resetAimState();
        
        // Update UI
        this.updateUI();
    }

    update(deltaTime: number): void {
        if (this.isGameOver || this.isPaused || this.isWaitingToStart) return;

        // Accumulate delta time
        this.deltaAccumulator += deltaTime;

        // Update if enough time has passed
        if (this.deltaAccumulator >= this.UPDATE_RATE) {
            this.deltaAccumulator -= this.UPDATE_RATE;

            // Update projectiles
            this.projectiles = this.projectiles.filter(projectile => {
                return projectile.update();
            });
            
            // Check if game should end: 0 ammo and no active projectiles
            if (this.arrowsRemaining <= 0 && this.projectiles.length === 0) {
                this.gameOver();
            }
        }
    }

    public spawnStuckArrow(x: number, y: number, rotation: number): void {
        const stuckArrow = new StuckArrow(x, y, rotation);
        this.stuckArrows.push(stuckArrow);
        this.app.stage.addChild(stuckArrow.container);
    }

    private spawnTarget(): void {
        // Clear existing targets
        this.targets.forEach(target => target.destroy());
        this.targets = [];

        // Clear existing boxes
        this.boxes.forEach(box => box.destroy());
        this.boxes = [];
        
        // Clear existing trees
        this.trees.forEach(tree => tree.destroy());
        this.trees = [];
        
        const targetRadius = 50;
        let targetX: number;
        let targetY: number;
        let platform: Box | undefined = undefined;

        const minX = BASE_GAME_WIDTH / 2 + 100;
        const maxX = BASE_GAME_WIDTH - 100;

        const boxWidth = Math.random() * 100 + 50;
        const boxHeight = Math.random() * 350 + 50;
        const boxX = Math.random() * (maxX - minX - boxWidth) + minX;
        const boxY = BASE_GAME_HEIGHT - GROUND_HEIGHT - boxHeight; // Top of box at ground level
        
        platform = new Box(boxX, boxY, boxWidth, boxHeight);
        this.app.stage.addChild(platform.container);
        this.boxes.push(platform);

        targetX = boxX + boxWidth / 2;
        targetY = boxY - targetRadius; // Target above the box

        // Spawn trees with random heights to make it harder to hit targets
        const numTrees = Math.floor(Math.random() * 4) + 2; // 2-5 trees
        const treeAreaStart = BASE_GAME_WIDTH / 4; // Start trees after first third of screen
        const treeAreaEnd = targetX - 30; // End before target with some gap
        
        for (let i = 0; i < numTrees; i++) {
            const treeWidth = Math.random() * 100 + 40; // 40-100 pixels wide
            const treeHeight = Math.random() * 350 + 80; // 200-500 pixels tall
            const treeX = Math.random() * (treeAreaEnd - treeAreaStart - treeWidth) + treeAreaStart;
            const treeY = BASE_GAME_HEIGHT - GROUND_HEIGHT - treeHeight; // Bottom of tree at ground level
            
            const tree = new Tree(treeX, treeY, treeWidth, treeHeight);
            this.app.stage.addChild(tree.container);
            this.trees.push(tree);
        }

        const target = new Target(targetX, targetY, targetRadius, platform);
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
        const arrowsElement = document.getElementById('arrows');
        
        if (arrowsElement) arrowsElement.textContent = this.arrowsRemaining.toString();
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
        this.trees.forEach(tree => tree.destroy());
        this.stuckArrows.forEach(stuckArrow => stuckArrow.destroy());
        this.projectiles = [];
        this.targets = [];
        this.boxes = [];
        this.trees = [];
        this.stuckArrows = [];
        

        this.isGameOver = false;
        this.isPaused = false;
        this.isWaitingToStart = false;
        this.arrowsRemaining = 10;
        
        // Reset aim state
        this.resetAimState();
        
        // Reset bow
        this.simpleArcher.updateAngle(this.currentAngle);
        
        // Reset UI
        this.updateUI();
        
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
        // Remove input handlers
        if (this.removeInputHandler) {
            this.removeInputHandler();
        }
        if (this.removeTopBarHandler) {
            this.removeTopBarHandler();
        }

        // Clear all game objects
        this.projectiles.forEach(projectile => projectile.destroy());
        this.targets.forEach(target => target.destroy());
        this.boxes.forEach(box => box.destroy());
        this.trees.forEach(tree => tree.destroy());
        this.stuckArrows.forEach(stuckArrow => stuckArrow.destroy());
        
        // Clear trajectory line
        if (this.trajectoryLine) {
            this.trajectoryLine.destroy();
        }

        // Destroy archer
        this.simpleArcher.destroy();

        // Remove from stage
        this.app.stage.removeChild(this.gameContainer);
    }

    returnToMainMenu(): void {
        window.location.href = '/arcade/';
    }

    startGame(): void {
        // This method is no longer needed since game starts immediately
        // Keeping it for compatibility with global functions
    }

    public calculateCollisionPoint(projectile: Projectile, target: Target): { x: number; y: number } {
        // Get the previous position (before this frame's movement)
        const prevX = projectile.x - projectile.vx;
        const prevY = projectile.y - projectile.vy;
        
        // Calculate the actual collision point by interpolating between previous and current position
        const targetCenterX = target.x;
        const targetCenterY = target.y;
        const targetRadius = target.radius;
        
        // Vector from previous position to current position
        const dx = projectile.x - prevX;
        const dy = projectile.y - prevY;
        
        // Vector from target center to previous position
        const px = prevX - targetCenterX;
        const py = prevY - targetCenterY;
        
        // Quadratic equation coefficients for line-circle intersection
        const a = dx * dx + dy * dy;
        const b = 2 * (px * dx + py * dy);
        const c = px * px + py * py - targetRadius * targetRadius;
        
        // Solve quadratic equation
        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) {
            // No intersection, fall back to current position
            return { x: projectile.x, y: projectile.y };
        }
        
        // Get the intersection point (we want the first intersection, so smaller t)
        const t = (-b - Math.sqrt(discriminant)) / (2 * a);
        
        // Clamp t to [0, 1] range
        const clampedT = Math.max(0, Math.min(1, t));
        
        // Calculate collision point
        const collisionX = prevX + dx * clampedT;
        const collisionY = prevY + dy * clampedT;
        
        return { x: collisionX, y: collisionY };
    }

    private resetAimState(): void {
        this.isAiming = false;
        this.powerCharging = false;
        this.isDragging = false;
        this.currentPower = 0;
        
        // Reset arrow position
        this.simpleArcher.updateArrowPosition(0, MAX_POWER);
        
        // Reset UI
        if (this.powerFill) {
            this.powerFill.style.width = '0%';
        }
        if (this.angleIndicator) {
            this.angleIndicator.textContent = 'Angle: 45°';
        }
        
        // Clear trajectory line
        if (this.trajectoryLine) {
            this.trajectoryLine.destroy();
            this.trajectoryLine = undefined;
        }
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