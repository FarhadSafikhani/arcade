import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Card } from './card';

// Game constants - fixed base dimensions
const BASE_GAME_WIDTH = 800;
const BASE_GAME_HEIGHT = 600;
const GRID_ROWS = 4;
const GRID_COLS = 6;
const CARD_ASPECT_RATIO = 0.8; // Width to height ratio (4:5)
const CARD_SPACING = 10; // Fixed spacing between cards

// Calculate optimal card size to fit all cards in the canvas
const calculateCardSize = () => {
    // Use almost all available space with minimal margin
    const margin = 20; // Very minimal margin
    const availableWidth = BASE_GAME_WIDTH - margin * 2;
    const availableHeight = BASE_GAME_HEIGHT - margin * 2;
    
    // Calculate card size based on width constraint
    const cardWidthFromWidth = (availableWidth - (GRID_COLS - 1) * CARD_SPACING) / GRID_COLS;
    const cardHeightFromWidth = cardWidthFromWidth / CARD_ASPECT_RATIO;
    
    // Calculate card size based on height constraint
    const cardHeightFromHeight = (availableHeight - (GRID_ROWS - 1) * CARD_SPACING) / GRID_ROWS;
    const cardWidthFromHeight = cardHeightFromHeight * CARD_ASPECT_RATIO;
    
    // Use the smaller of the two to ensure everything fits
    const cardWidth = Math.min(cardWidthFromWidth, cardWidthFromHeight);
    const cardHeight = cardWidth / CARD_ASPECT_RATIO;
    
    return {
        cardWidth: Math.floor(cardWidth),
        cardHeight: Math.floor(cardHeight),
        cardPadding: CARD_SPACING
    };
};

// Get card dimensions
const CARD_DIMENSIONS = calculateCardSize();

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

// Emoji pairs for the cards
const ALL_EMOJIS = [
    // Animals
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮',
    // Fruits
    '🍎', '🍌', '🍇', '🍓', '🍊', '🍒', '🍑', '🍍', '🍐', '🍋',
    // Vegetables
    '🥕', '🥬', '🥦', '🌽', '🥔', '🍅', 
    // Emojis
    '😂', '🤠', '🤡', 
    // Sports
    '🏀', '🏈', '⚽', '🎾', '🏓',
    // Music
    '🎵', '🎤', '🎹', '🎺', '🎻',
    // Misc
    '🔥', '⚡', '💡'
];

// Calculate how many pairs we need for the grid
const PAIRS_NEEDED = (GRID_ROWS * GRID_COLS) / 2;

// Randomly select emojis for this game
function getRandomEmojis(): string[] {
    const shuffled = [...ALL_EMOJIS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, PAIRS_NEEDED);
}

const EMOJI_PAIRS = getRandomEmojis();

export class MemoryGame {
    private app: Application;
    private gameContainer: Container;
    private cards: Card[] = [];
    private flippedCards: Card[] = [];
    private matchedPairs: number = 0;
    private moves: number = 0;
    private startTime: number = 0;
    private gameTime: number = 0;
    private isGameOver: boolean = false;
    private isPaused: boolean = false;
    private canFlip: boolean = true;
    private removeInputHandler?: () => void;
    private removeTopBarHandler?: () => void;
    private gameStarted: boolean = false;
    private flipTimeout?: ReturnType<typeof setTimeout>;

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.app.stage.addChild(this.gameContainer);
    }

    async init(): Promise<void> {
        // Create game background
        this.createBackground();
        
        // Create and shuffle cards
        this.createCards();
        this.shuffleCards();
        
        // Position cards in grid
        this.positionCards();
        
        // Set up input handling
        this.setupInput();
        this.setupTopBarEvents();
        
        // Initialize UI
        this.updateUI();
        
        // Don't start timer yet - wait for first card click
    }

    private createBackground(): void {
        const background = new Graphics();
        background.beginFill(0x34495e);
        background.drawRect(0, 0, BASE_GAME_WIDTH, BASE_GAME_HEIGHT);
        background.endFill();
        
        this.gameContainer.addChild(background);
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

    private createCards(): void {
        // Create pairs of cards
        for (let i = 0; i < EMOJI_PAIRS.length; i++) {
            const emoji = EMOJI_PAIRS[i];
            
            // Create two cards with the same emoji
            const card1 = new Card(CARD_DIMENSIONS.cardWidth, CARD_DIMENSIONS.cardHeight, emoji, i * 2);
            const card2 = new Card(CARD_DIMENSIONS.cardWidth, CARD_DIMENSIONS.cardHeight, emoji, i * 2 + 1);
            
            this.cards.push(card1, card2);
            this.gameContainer.addChild(card1.container);
            this.gameContainer.addChild(card2.container);
        }
    }

    private shuffleCards(): void {
        // Fisher-Yates shuffle
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    private positionCards(): void {
        const { gameWidth, gameHeight, scale } = getGameDimensions();
        const startX = (gameWidth - (GRID_COLS * (CARD_DIMENSIONS.cardWidth + CARD_DIMENSIONS.cardPadding) - CARD_DIMENSIONS.cardPadding)) / 2;
        const startY = (gameHeight - (GRID_ROWS * (CARD_DIMENSIONS.cardHeight + CARD_DIMENSIONS.cardPadding) - CARD_DIMENSIONS.cardPadding)) / 2;
        
        for (let i = 0; i < this.cards.length; i++) {
            const row = Math.floor(i / GRID_COLS);
            const col = i % GRID_COLS;
            
            const x = startX + col * (CARD_DIMENSIONS.cardWidth + CARD_DIMENSIONS.cardPadding);
            const y = startY + row * (CARD_DIMENSIONS.cardHeight + CARD_DIMENSIONS.cardPadding);
            
            this.cards[i].setPosition(x, y);
        }
    }

    private setupInput(): void {
        const handleKeydown = (event: KeyboardEvent) => {
            if (this.isGameOver) return;
            
            switch (event.key) {
                case 'Escape':
                    event.preventDefault();
                    this.togglePause();
                    break;
            }
        };

        document.addEventListener('keydown', handleKeydown);
        
        // Store the handler so we can remove it later
        this.removeInputHandler = () => {
            document.removeEventListener('keydown', handleKeydown);
        };
    }

    update(delta: number): void {
        if (this.isPaused) return;
        
        // Update game time only if game has started
        if (this.gameStarted && !this.isGameOver) {
            this.gameTime = Math.floor((Date.now() - this.startTime) / 1000);
            this.updateUI();
        }
    }

    onCardClick(card: Card): void {
        
        if (this.isPaused || this.isGameOver) return;
        if (card.isFlipped || card.isMatched) return;

        // Start the timer on first card click
        if (!this.gameStarted) {
            this.gameStarted = true;
            this.startTime = Date.now();
        }

        // If we already have 2 cards flipped and waiting, flip them back immediately
        if (this.flippedCards.length === 2) {

            // Clear the existing timeout
            if (this.flipTimeout) {
                clearTimeout(this.flipTimeout);
                this.flipTimeout = undefined;
            }
            
            this.flippedCards[0].flip();
            this.flippedCards[1].flip();
            this.flippedCards = [];
            this.canFlip = true;
            return;
        }

        // Flip the card
        card.flip();
        this.flippedCards.push(card);

        // Check if we have two cards flipped
        if (this.flippedCards.length === 2) {
            this.moves++;
            this.canFlip = false;
            
            // Check for match
            if (this.flippedCards[0].emoji === this.flippedCards[1].emoji) {
                // Match found
                this.flippedCards[0].setMatched();
                this.flippedCards[1].setMatched();
                this.matchedPairs++;
                
                // Check if game is complete
                if (this.matchedPairs === EMOJI_PAIRS.length) {
                    this.gameOver();
                }
                
                this.flippedCards = [];
                this.canFlip = true;
            } else {
                // No match, flip back after delay
                this.flipTimeout = setTimeout(() => {
                    this.flippedCards[0].flip();
                    this.flippedCards[1].flip();
                    this.flippedCards = [];
                    this.canFlip = true;
                    this.flipTimeout = undefined;
                }, 1000);
            }
            
            this.updateUI();
        }
    }

    private gameOver(): void {
        this.isGameOver = true;
        this.showGameOver();
    }

    private showGameOver(): void {
        const gameOverElement = document.getElementById('gameOver');
        const finalMovesElement = document.getElementById('finalMoves');
        const finalTimeElement = document.getElementById('finalTime');
        
        if (gameOverElement && finalMovesElement && finalTimeElement) {
            finalMovesElement.textContent = this.moves.toString();
            finalTimeElement.textContent = this.formatTime(this.gameTime);
            gameOverElement.style.display = 'block';
        }
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
        const pauseMenuElement = document.getElementById('pauseMenu');
        if (pauseMenuElement) {
            pauseMenuElement.style.display = 'block';
        }
    }

    private hidePauseMenu(): void {
        const pauseMenuElement = document.getElementById('pauseMenu');
        if (pauseMenuElement) {
            pauseMenuElement.style.display = 'none';
        }
    }

    private updateUI(): void {
        const movesElement = document.getElementById('moves');
        const pairsElement = document.getElementById('pairs');
        const timeElement = document.getElementById('time');
        
        if (movesElement) movesElement.textContent = this.moves.toString();
        if (pairsElement) pairsElement.textContent = this.matchedPairs.toString();
        if (timeElement) timeElement.textContent = this.formatTime(this.gameTime);
    }

    private formatTime(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    restart(): void {
        this.matchedPairs = 0;
        this.moves = 0;
        this.gameTime = 0;
        this.isGameOver = false;
        this.isPaused = false;
        this.canFlip = true;
        this.gameStarted = false;
        this.flippedCards = [];
        
        // Clear any pending timeout
        if (this.flipTimeout) {
            clearTimeout(this.flipTimeout);
            this.flipTimeout = undefined;
        }
        
        // Reset all cards
        this.cards.forEach(card => {
            card.reset();
        });
        
        // Shuffle cards again
        this.shuffleCards();
        this.positionCards();
        
        // Don't start timer yet - wait for first card click
        this.startTime = 0;
        
        this.updateUI();
        
        // Hide modals
        const gameOverElement = document.getElementById('gameOver');
        if (gameOverElement) {
            gameOverElement.style.display = 'none';
        }
        this.hidePauseMenu();
    }

    resume(): void {
        this.isPaused = false;
        this.hidePauseMenu();
    }

    destroy(): void {
        if (this.removeInputHandler) {
            this.removeInputHandler();
        }
        if (this.removeTopBarHandler) {
            this.removeTopBarHandler();
        }
        if (this.flipTimeout) {
            clearTimeout(this.flipTimeout);
        }
        if (this.gameContainer && this.gameContainer.parent) {
            this.gameContainer.parent.removeChild(this.gameContainer);
        }
    }

    returnToMainMenu(): void {
        window.location.href = '/arcade/';
    }
}

// Global game instance
let game: MemoryGame | null = null;
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

// Initialize the game when the page loads
async function initGame() {
    // Get dimensions and scale
    const dimensions = getGameDimensions();
    
    // Create PIXI application with base dimensions
    app = new Application({
        width: BASE_GAME_WIDTH,
        height: BASE_GAME_HEIGHT,
        backgroundColor: 0x2c3e50,
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
    game = new MemoryGame(app);
    await game.init();

    // Set up game loop
    app.ticker.add(gameLoop);
    
    // Add resize handler
    window.addEventListener('resize', updateCanvasScaling);
}

function gameLoop(delta: number) {
    if (game) {
        game.update(delta);
    }
}

// Global functions for game control
declare global {
    interface Window {
        restartGame: () => void;
        returnToMainMenu: () => void;
        resumeGame: () => void;
        togglePause: () => void;
        onCardClick: (card: any) => void;
    }
}

window.restartGame = () => {
    if (game) {
        game.restart();
    }
};

window.returnToMainMenu = () => {
    if (game) {
        game.returnToMainMenu();
    }
};

window.resumeGame = () => {
    if (game) {
        game.resume();
    }
};

window.togglePause = () => {
    if (game) {
        game.togglePause();
    }
};

window.onCardClick = (card: any) => {
    if (game) {
        game.onCardClick(card);
    }
};

// Initialize when page loads
window.addEventListener('load', initGame); 