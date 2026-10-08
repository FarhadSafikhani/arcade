import { gamesConfig, type GameConfig } from './games.config';
import { RainyAlley } from './landing/rainyAlley';
import { VERSION } from './version';

type CardVariant = 'featured' | 'legacy';
const base = import.meta.env.BASE_URL;
const yearElement = document.getElementById('copyright-year');
const versionElement = document.getElementById('version-number');
if (yearElement) yearElement.textContent = String(new Date().getFullYear());
if (versionElement) versionElement.textContent = `v${VERSION}`;
const featuredArt: Record<string, string> = {
    snapforge: 'snapforge-card.webp',
    stickers: 'stickers-card.webp',
};

declare global {
    interface Window {
        startGame: (gameId: string) => void;
        returnToMainMenu: () => void;
    }
}

function createGameCard(game: GameConfig, variant: CardVariant): HTMLElement {
    const card = document.createElement(game.available ? 'a' : 'div');
    card.className = `game-card game-card--${variant}`;
    if (card instanceof HTMLAnchorElement) {
        card.href = `${base}games/${game.id}/`;
        card.setAttribute('aria-label', `Play ${game.name}`);
    } else {
        card.classList.add('is-disabled');
        card.setAttribute('aria-disabled', 'true');
    }

    if (variant === 'featured') {
        const art = document.createElement('div');
        art.className = 'card-art';
        const image = document.createElement('img');
        image.alt = '';
        image.width = 1024;
        image.height = 1024;
        image.decoding = 'async';
        const artwork = featuredArt[game.id];
        if (artwork) {
            image.src = `${base}assets/landing/${artwork}`;
        } else if (game.logo) {
            image.src = `${base}assets/brand/${game.logo}`;
            image.className = 'card-logo';
        } else {
            art.textContent = game.icon ?? '';
        }
        if (artwork || game.logo) art.append(image);
        card.append(art);
    } else {
        const icon = document.createElement('span');
        icon.className = 'game-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = game.icon ?? '✦';
        card.append(icon);
    }

    const caption = document.createElement('div');
    caption.className = 'card-caption';
    const name = document.createElement('span');
    name.className = 'game-name';
    name.textContent = game.name;
    caption.append(name);
    if (variant === 'legacy' || !game.available) {
        const description = document.createElement('span');
        description.className = 'game-description';
        description.textContent = game.available ? game.description : 'Coming soon';
        caption.append(description);
    }
    card.append(caption);
    return card;
}

for (const [section, id, variant] of [
    ['games', 'featuredGrid', 'featured'],
    ['legacy', 'legacyGrid', 'legacy'],
] as const) {
    document.getElementById(id)?.replaceChildren(
        ...gamesConfig.games.filter(game => game.section === section)
            .map(game => createGameCard(game, variant)),
    );
}

window.startGame = gameId => { window.location.href = `${base}games/${gameId}/`; };
window.returnToMainMenu = () => { window.location.href = base; };

const canvas = document.querySelector<HTMLCanvasElement>('#alleyWeather');
const image = document.querySelector<HTMLImageElement>('#alleyImage');
if (canvas && image) {
    const alley = new RainyAlley(canvas, image);
    alley.init();
    if (import.meta.hot) import.meta.hot.dispose(() => alley.destroy());
}
