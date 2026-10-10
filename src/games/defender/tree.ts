import { learnBlock, rankOf, SKILL_DEFS, SKILL_IDS, TREES, type Ranks, type SkillId } from './skills';
import { SKILLS } from './tuning';

/**
 * The two skill trees as a sheet over the game: one column per tree, tiers top to
 * bottom, each path in its own lane, the ultimate centered at the foot. Hovering or
 * focusing a skill explains it below its tree; clicking spends a point.
 */
export class SkillTreeView {
    private readonly nodes = new Map<SkillId, HTMLButtonElement>();
    private readonly details = new Map<string, HTMLElement>();
    private readonly pointsLabel: HTMLElement;
    private ranks: Ranks = {};
    private level = 1;
    private points = 0;
    private key = '';
    private focus: SkillId | null = null;

    constructor(private readonly root: HTMLElement, private readonly onLearn: (skill: SkillId) => void) {
        this.root.replaceChildren();
        const sheet = document.createElement('div');
        sheet.className = 'tree-sheet';
        const head = document.createElement('header');
        head.className = 'tree-head';
        const title = document.createElement('h2');
        title.className = 'card-title';
        title.textContent = 'Skills';
        this.pointsLabel = document.createElement('p');
        this.pointsLabel.className = 'tree-points';
        const hint = document.createElement('p');
        hint.className = 'note';
        hint.textContent = 'T or Esc to close. Two points every level.';
        head.append(title, this.pointsLabel, hint);
        const trees = document.createElement('div');
        trees.className = 'trees';
        for (const tree of TREES) {
            const column = document.createElement('section');
            column.className = `tree tree-${tree.id}`;
            const name = document.createElement('h3');
            name.className = 'tree-name';
            name.textContent = tree.name;
            const motto = document.createElement('p');
            motto.className = 'tree-motto';
            motto.textContent = tree.motto;
            const grid = document.createElement('div');
            grid.className = 'tree-grid';
            for (const id of SKILL_IDS) {
                const def = SKILL_DEFS[id];
                if (def.tree !== tree.id) continue;
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `skill skill-${def.kind}${def.buff ? ' skill-buff' : ''}`;
                button.style.gridRow = String(def.tier + 1);
                button.style.gridColumn = def.column === 0.5 ? '1 / span 2' : String(def.column + 1);
                const label = document.createElement('span');
                label.className = 'skill-name';
                label.textContent = def.name;
                const rank = document.createElement('span');
                rank.className = 'skill-rank';
                const tag = document.createElement('span');
                tag.className = 'skill-tag';
                tag.textContent = def.buff ? 'Buff' : def.kind === 'active' ? 'Active' : 'Passive';
                button.append(label, tag, rank);
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    this.onLearn(id);
                });
                const show = () => { this.focus = id; this.describe(id); };
                button.addEventListener('pointerenter', show);
                button.addEventListener('focus', show);
                grid.append(button);
                this.nodes.set(id, button);
            }
            const detail = document.createElement('div');
            detail.className = 'tree-detail';
            detail.setAttribute('aria-live', 'polite');
            this.details.set(tree.id, detail);
            column.append(name, motto, grid, detail);
            trees.append(column);
        }
        sheet.append(head, trees);
        this.root.append(sheet);
    }

    get open(): boolean {
        return !this.root.hidden;
    }

    show(): void {
        this.root.hidden = false;
    }

    hide(): void {
        this.root.hidden = true;
    }

    /** Repaints only when something the tree shows has changed. */
    update(ranks: Ranks, level: number, points: number): void {
        const key = `${level}|${points}|${SKILL_IDS.map(id => rankOf(ranks, id)).join(',')}`;
        if (key === this.key) return;
        this.key = key;
        this.ranks = ranks;
        this.level = level;
        this.points = points;
        this.pointsLabel.textContent = points === 1 ? '1 point to spend' : `${points} points to spend`;
        this.pointsLabel.classList.toggle('has-points', points > 0);
        for (const [id, button] of this.nodes) {
            const def = SKILL_DEFS[id];
            const rank = rankOf(ranks, id);
            const block = learnBlock(ranks, id, level, points);
            const locked = block !== null && block !== 'No points' && block !== 'Mastered';
            button.classList.toggle('is-learned', rank > 0);
            button.classList.toggle('is-locked', locked);
            button.classList.toggle('is-ready', block === null);
            button.classList.toggle('is-maxed', rank >= def.max);
            button.setAttribute('aria-disabled', String(block !== null));
            const rankLabel = button.querySelector('.skill-rank');
            if (rankLabel) rankLabel.textContent = `${rank}/${def.max}`;
            button.title = block ?? `Spend a point on ${def.name}`;
        }
        for (const tree of TREES) {
            const focused = this.focus && SKILL_DEFS[this.focus].tree === tree.id ? this.focus : null;
            if (focused) this.describe(focused);
            else this.describeTree(tree.id);
        }
    }

    private describe(id: SkillId): void {
        const def = SKILL_DEFS[id];
        const detail = this.details.get(def.tree);
        if (!detail) return;
        const rank = rankOf(this.ranks, id);
        const block = learnBlock(this.ranks, id, this.level, this.points);
        const lines: [string, string][] = [['skill-detail-name', def.name], ['skill-detail-blurb', def.blurb]];
        if (rank > 0) lines.push(['skill-detail-now', `Now: ${def.effect(rank)}`]);
        if (rank < def.max) lines.push(['skill-detail-next', `${rank > 0 ? 'Next' : 'Rank 1'}: ${def.effect(rank + 1)}`]);
        if (block && block !== 'No points') lines.push(['skill-detail-block', block]);
        detail.replaceChildren(...lines.map(([className, text]) => {
            const line = document.createElement('p');
            line.className = className;
            line.textContent = text;
            return line;
        }));
    }

    private describeTree(tree: string): void {
        const detail = this.details.get(tree);
        if (!detail) return;
        const line = document.createElement('p');
        line.className = 'skill-detail-blurb';
        line.textContent = `Tiers open at levels ${SKILLS.tierLevels.join(', ')}. Point at a skill to read it.`;
        detail.replaceChildren(line);
    }
}
