import { gamesConfig, GameConfig } from './games.config';
import { VERSION } from './version';

type CardVariant = 'featured' | 'legacy';

// Global functions for game control
declare global {
    interface Window {
        startGame: (gameId: string) => void;
        returnToMainMenu: () => void;
    }
}

async function init() {
    try {
        updateVersionDisplay();
        updateCopyrightYear();
        renderGameCards(
            gamesConfig.games.filter(game => game.section === 'games'),
            'featuredGrid',
            'featured'
        );
        const legacyGames = gamesConfig.games.filter(game => game.section === 'legacy');
        renderGameCards(legacyGames, 'legacyGrid', 'legacy');
        updateLegacySummary(legacyGames.length);

        window.startGame = startGame;
        window.returnToMainMenu = returnToMainMenu;
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
}

function updateVersionDisplay() {
    const versionElement = document.getElementById('version-number');
    if (versionElement) {
        versionElement.textContent = "v" + VERSION;
    }
}

function updateCopyrightYear() {
    const yearElement = document.getElementById('copyright-year');
    if (yearElement) {
        yearElement.textContent = String(new Date().getFullYear());
    }
}

function updateLegacySummary(count: number) {
    const summary = document.getElementById('legacySummary');
    if (summary) {
        summary.textContent = `Misc / Legacy (${count})`;
    }
}

function gameHref(gameId: string): string {
    return `${import.meta.env.BASE_URL}games/${gameId}/`;
}

function renderGameCards(games: GameConfig[], containerId: string, variant: CardVariant) {
    const container = document.getElementById(containerId);

    if (!container) {
        console.error(`Game list element not found: ${containerId}`);
        return;
    }

    container.replaceChildren(...games.map(game => createGameCard(game, variant)));
}

function createGameCard(game: GameConfig, variant: CardVariant): HTMLElement {
    const card = document.createElement(game.available ? 'a' : 'div');
    card.className = `game-card game-card--${variant}`;
    if (game.accent) {
        card.style.setProperty('--card-accent', game.accent);
    }

    if (card instanceof HTMLAnchorElement) {
        card.href = gameHref(game.id);
    } else {
        card.classList.add('is-disabled');
        card.setAttribute('aria-disabled', 'true');
    }

    if (variant === 'featured') {
        card.append(createPolaroidPhoto(card, game));
    }

    card.append(createCaption(game));
    return card;
}

function createPolaroidPhoto(card: HTMLElement, game: GameConfig): HTMLElement {
    const photo = document.createElement('div');
    photo.className = 'polaroid-photo';

    if (game.logo) {
        const logo = document.createElement('img');
        logo.className = 'photo-logo';
        logo.alt = '';
        logo.src = `${import.meta.env.BASE_URL}assets/brand/${game.logo}`;
        photo.append(logo);
        return photo;
    }

    const fallback = document.createElement('span');
    fallback.className = 'photo-fallback';
    fallback.setAttribute('aria-hidden', 'true');
    fallback.textContent = game.icon ?? '';
    photo.append(fallback);

    if (!game.preview) {
        card.classList.add('is-fallback');
        return photo;
    }

    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.addEventListener('error', () => {
        card.classList.add('is-fallback');
        image.remove();
    });
    image.src = `${import.meta.env.BASE_URL}previews/${game.preview}`;
    photo.append(image);
    return photo;
}

function createCaption(game: GameConfig): HTMLElement {
    const caption = document.createElement('div');
    caption.className = 'card-caption';

    const icon = document.createElement('span');
    icon.className = 'game-icon';
    icon.setAttribute('aria-hidden', 'true');
    if (game.logo) {
        const logo = document.createElement('img');
        logo.alt = '';
        logo.src = `${import.meta.env.BASE_URL}assets/brand/${game.logo}`;
        icon.append(logo);
    } else {
        icon.textContent = game.icon ?? '';
    }

    const name = document.createElement('span');
    name.className = 'game-name';
    name.textContent = game.name;

    const description = document.createElement('span');
    description.className = 'game-description';
    description.textContent = game.available ? game.description : 'Coming soon';

    caption.append(icon, name, description);
    return caption;
}

function startGame(gameId: string) {
    window.location.href = gameHref(gameId);
}

function returnToMainMenu() {
    window.location.href = import.meta.env.BASE_URL;
}

window.addEventListener('load', init);
