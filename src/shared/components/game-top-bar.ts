import topBarStyles from '../styles/game-top-bar.css?inline';

interface GameTopBarProps {
  title: string;
  showPause?: boolean;
  showMenu?: boolean;
}

export class GameTopBar extends HTMLElement {
  private props: GameTopBarProps;
  private shadow: ShadowRoot;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.props = this.getProps();
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  private getProps(): GameTopBarProps {
    return {
      title: this.getAttribute('title') || 'Game',
      showPause: this.hasAttribute('show-pause'),
      showMenu: this.hasAttribute('show-menu')
    };
  }

  private render() {
    this.shadow.innerHTML = `
      <style>${topBarStyles}</style>
      <div class="top-bar">
        <div class="game-title">${this.props.title}</div>
        <div class="button-container">
          ${this.props.showPause ? '<button id="pauseBtn">⏸️</button>' : ''}
          ${this.props.showMenu ? '<button id="menuBtn">⬅️</button>' : ''}
        </div>
      </div>
    `;
  }

  private setupEventListeners() {
    const pauseBtn = this.shadow.getElementById('pauseBtn');
    const menuBtn = this.shadow.getElementById('menuBtn');

    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('pause', { bubbles: true }));
      });
    }

    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('menu', { bubbles: true }));
      });
    }
  }

  // Public method to update title
  setTitle(title: string) {
    this.props.title = title;
    const titleElement = this.shadow.querySelector('.game-title');
    if (titleElement) {
      titleElement.textContent = title;
    }
  }

  // Public method to show/hide pause button
  setPauseVisible(visible: boolean) {
    this.props.showPause = visible;
    const pauseBtn = this.shadow.getElementById('pauseBtn');
    if (pauseBtn) {
      pauseBtn.style.display = visible ? 'block' : 'none';
    }
  }
}

// Register the custom element
customElements.define('game-top-bar', GameTopBar); 