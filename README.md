# ArcadeSnake

A classic Snake game built with PixiJS and TypeScript, featuring smooth graphics and modern web technologies.

## Description

This project implements the classic Snake game using PixiJS for fast 2D rendering, TypeScript for type safety, and Vite for fast development and building. The game features smooth animations, responsive design, and local high score persistence.

## Features

- ✅ Classic snake gameplay with smooth movement
- ✅ Score tracking and high score persistence
- ✅ Game over detection and restart functionality
- ✅ Responsive design that scales to different screen sizes
- ✅ Beautiful graphics with animated food and snake segments
- ✅ Keyboard controls (Arrow keys or WASD)
- ✅ Pause functionality (Spacebar)
- ✅ Local storage for high scores
- ✅ Progressive difficulty (speed increases with score)

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn package manager

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ArcadeSnake.git
   cd ArcadeSnake
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000`

### Building for Production

To create a production build:

```bash
npm run build
```

The built files will be in the `dist` directory.

### How to Play

- **Movement**: Use Arrow keys or WASD to control the snake
- **Pause**: Press Spacebar to pause/unpause the game
- **Objective**: Eat the red food to grow longer and increase your score
- **Game Over**: Avoid hitting the walls or your own tail
- **Restart**: Click "Play Again" when the game ends

## Technologies Used

- **PixiJS** - Fast 2D rendering library
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool and development server
- **HTML5 Canvas** - Game rendering
- **Local Storage** - High score persistence

## Project Structure

```
src/
├── main.ts          # Application entry point
├── Game.ts          # Main game logic and state management
├── Snake.ts         # Snake class with movement and rendering
└── Food.ts          # Food class with positioning and animation
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Classic Snake game inspiration
- PixiJS team for the excellent rendering library
- Vite team for the fast build tool 