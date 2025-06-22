import { Container, Graphics, Text, TextStyle } from 'pixi.js';

export interface GameOption {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: number;
    available: boolean;
}

export class Menu {
    private container: Container;
    private background!: Graphics;
    private title!: Text;
    private gameOptions: GameOption[] = [];
    private gameButtons: Container[] = [];
    private selectedIndex: number = 0;
    private onGameSelect: (gameId: string) => void;

    constructor(onGameSelect: (gameId: string) => void) {
        this.onGameSelect = onGameSelect;
        this.container = new Container();
        
        this.setupGameOptions();
        this.createBackground();
        this.createTitle();
        this.createGameButtons();
        this.setupInput();
    }

    private setupGameOptions(): void {
        this.gameOptions = [
            {
                id: 'snake',
                name: '🐍 Snake',
                description: 'Classic snake game with modern graphics',
                icon: '🐍',
                color: 0x2ecc71,
                available: true
            },
            {
                id: 'tetris',
                name: '🧩 Tetris',
                description: 'Coming soon...',
                icon: '🧩',
                color: 0x3498db,
                available: false
            },
            {
                id: 'pong',
                name: '🏓 Pong',
                description: 'Coming soon...',
                icon: '🏓',
                color: 0xe74c3c,
                available: false
            },
            {
                id: 'breakout',
                name: '🎾 Breakout',
                description: 'Coming soon...',
                icon: '🎾',
                color: 0xf39c12,
                available: false
            }
        ];
    }

    private createBackground(): void {
        this.background = new Graphics();
        this.background.beginFill(0x2c3e50);
        this.background.drawRect(0, 0, 1000, 800);
        this.background.endFill();
        
        // Add gradient effect
        const gradient = new Graphics();
        gradient.beginFill(0x34495e, 0.5);
        gradient.drawRect(0, 0, 1000, 800);
        gradient.endFill();
        
        this.container.addChild(this.background);
        this.container.addChild(gradient);
    }

    private createTitle(): void {
        const titleStyle = new TextStyle({
            fontFamily: 'Arial',
            fontSize: 48,
            fontWeight: 'bold',
            fill: 0xecf0f1,
            stroke: 0x2c3e50,
            strokeThickness: 4,
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowBlur: 10,
            dropShadowDistance: 2
        });

        this.title = new Text('🎮 Arcade Collection', titleStyle);
        this.title.anchor.set(0.5, 0);
        this.title.x = 500;
        this.title.y = 50;
        
        this.container.addChild(this.title);
    }

    private createGameButtons(): void {
        const buttonWidth = 400;
        const buttonHeight = 120;
        const buttonSpacing = 20;
        const startY = 200;

        this.gameOptions.forEach((option, index) => {
            const buttonContainer = new Container();
            buttonContainer.x = 500 - buttonWidth / 2;
            buttonContainer.y = startY + index * (buttonHeight + buttonSpacing);

            // Button background
            const buttonBg = new Graphics();
            const bgColor = option.available ? option.color : 0x7f8c8d;
            buttonBg.beginFill(bgColor, 0.8);
            buttonBg.drawRoundedRect(0, 0, buttonWidth, buttonHeight, 15);
            buttonBg.endFill();
            
            // Button border
            buttonBg.lineStyle(3, option.available ? 0xffffff : 0x95a5a6, 0.8);
            buttonBg.drawRoundedRect(0, 0, buttonWidth, buttonHeight, 15);

            // Game icon
            const iconStyle = new TextStyle({
                fontFamily: 'Arial',
                fontSize: 36,
                fill: 0xffffff
            });
            const icon = new Text(option.icon, iconStyle);
            icon.x = 30;
            icon.y = buttonHeight / 2 - 18;

            // Game name
            const nameStyle = new TextStyle({
                fontFamily: 'Arial',
                fontSize: 24,
                fontWeight: 'bold',
                fill: option.available ? 0xffffff : 0xbdc3c7
            });
            const name = new Text(option.name, nameStyle);
            name.x = 80;
            name.y = 20;

            // Game description
            const descStyle = new TextStyle({
                fontFamily: 'Arial',
                fontSize: 16,
                fill: option.available ? 0xecf0f1 : 0x95a5a6
            });
            const description = new Text(option.description, descStyle);
            description.x = 80;
            description.y = 50;

            // Selection indicator
            const selectionIndicator = new Graphics();
            selectionIndicator.beginFill(0xffffff);
            selectionIndicator.drawRoundedRect(-10, -10, buttonWidth + 20, buttonHeight + 20, 20);
            selectionIndicator.endFill();
            selectionIndicator.alpha = 0;

            buttonContainer.addChild(selectionIndicator);
            buttonContainer.addChild(buttonBg);
            buttonContainer.addChild(icon);
            buttonContainer.addChild(name);
            buttonContainer.addChild(description);

            // Make button interactive
            buttonContainer.eventMode = 'static';
            buttonContainer.cursor = option.available ? 'pointer' : 'default';
            
            if (option.available) {
                buttonContainer.on('pointerdown', () => {
                    this.onGameSelect(option.id);
                });
                
                buttonContainer.on('pointerover', () => {
                    buttonBg.tint = 0xffffff;
                    buttonBg.alpha = 0.9;
                });
                
                buttonContainer.on('pointerout', () => {
                    buttonBg.tint = 0xffffff;
                    buttonBg.alpha = 0.8;
                });
            }

            this.gameButtons.push(buttonContainer);
            this.container.addChild(buttonContainer);
        });

        this.updateSelection();
    }

    private setupInput(): void {
        const handleKeydown = (event: KeyboardEvent) => {
            switch (event.key) {
                case 'ArrowUp':
                    event.preventDefault();
                    this.selectPrevious();
                    break;
                case 'ArrowDown':
                    event.preventDefault();
                    this.selectNext();
                    break;
                case 'Enter':
                case ' ':
                    event.preventDefault();
                    this.selectCurrent();
                    break;
            }
        };

        document.addEventListener('keydown', handleKeydown);
        
        // Store the handler so we can remove it later
        this.removeInputHandler = () => {
            document.removeEventListener('keydown', handleKeydown);
        };
    }

    private removeInputHandler?: () => void;

    private selectNext(): void {
        this.selectedIndex = (this.selectedIndex + 1) % this.gameOptions.length;
        this.updateSelection();
    }

    private selectPrevious(): void {
        this.selectedIndex = this.selectedIndex === 0 ? this.gameOptions.length - 1 : this.selectedIndex - 1;
        this.updateSelection();
    }

    private selectCurrent(): void {
        const selectedOption = this.gameOptions[this.selectedIndex];
        if (selectedOption.available) {
            this.onGameSelect(selectedOption.id);
        }
    }

    private updateSelection(): void {
        this.gameButtons.forEach((button, index) => {
            const selectionIndicator = button.children[0] as Graphics;
            if (index === this.selectedIndex && this.gameOptions[index].available) {
                selectionIndicator.alpha = 0.3;
            } else {
                selectionIndicator.alpha = 0;
            }
        });
    }

    public getContainer(): Container {
        return this.container;
    }

    public destroy(): void {
        if (this.removeInputHandler) {
            this.removeInputHandler();
        }
        if (this.container && this.container.parent) {
            this.container.parent.removeChild(this.container);
        }
    }
} 