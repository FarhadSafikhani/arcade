import { SPELL, type EnemyId } from './tuning';

/** Stacking lessons learned between waves. */
export type PassiveId =
    | 'sharpened' | 'swift' | 'nock' | 'fletching' | 'twin' | 'bodkin'
    | 'wounds' | 'barbed' | 'impact' | 'hunter' | 'siege'
    | 'spellweave' | 'wright' | 'mason' | 'scholar' | 'steady';

/** Slotted magic. At most four are carried; picking a fifth replaces the oldest. */
export type SpellId =
    | 'volley' | 'bolt' | 'blast' | 'rain' | 'repel' | 'mend'
    | 'brand' | 'frost' | 'spark' | 'snipe' | 'barrage' | 'oil';

export type CardId = PassiveId | SpellId;

export interface RunBuild {
    ranks: Partial<Record<PassiveId, number>>;
    spells: SpellId[];
    spellRanks: Partial<Record<SpellId, number>>;
}

export interface CombatMods {
    damage: number;
    drawTime: number;
    nock: number;
    arrowSpeed: number;
    twinChance: number;
    pierceChance: number;
    critChance: number;
    critMul: number;
    shieldBreak: number;
    burn: number;
    slow: number;
    knockback: number;
    vs: Record<EnemyId, number>;
    gateTaken: number;
    xpGain: number;
    gateOnKill: number;
    /** Divides spell cooldowns. */
    spellHaste: number;
    /** Extra movement multiplier while the bow is drawn. 1 keeps the usual slowdown. */
    drawMove: number;
    gateBonus: number;
}

export interface ShotProfile {
    damage: number;
    speed: number;
    pierce: number;
    ignoreShield: boolean;
    explode: number;
    burn: number;
    slow: number;
    chain: number;
    knockback: number;
    /** Radius of a chill around the impact. 0 skips it. */
    aura: number;
    vs: Record<EnemyId, number>;
    critChance: number;
    critMul: number;
}

export interface CardView {
    id: CardId;
    name: string;
    detail: string;
    kind: 'passive' | 'spell';
    rank: number;
}

const PASSIVE_MAX = 4;
const SPELL_MAX = 3;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

const PASSIVES: Record<PassiveId, { name: string; detail: string }> = {
    sharpened: { name: 'Sharpened Heads', detail: 'Arrows hit harder.' },
    swift: { name: 'Swift Draw', detail: 'The bow comes to full draw sooner.' },
    nock: { name: 'Quick Nock', detail: 'The next arrow is on the string faster.' },
    fletching: { name: 'Long Fletching', detail: 'Arrows leave the string faster.' },
    twin: { name: 'Twin String', detail: 'A chance to loose a second arrow beside the first.' },
    bodkin: { name: 'Bodkin Points', detail: 'Shots punch shields more often, and hurt more when they do.' },
    wounds: { name: 'Deep Wounds', detail: 'A chance for a shot to land as a vicious critical.' },
    barbed: { name: 'Barbed Heads', detail: 'Hits leave a bleeding wound.' },
    impact: { name: 'Heavy Impact', detail: 'Hits shove foes back down the bridge.' },
    hunter: { name: 'Runner\'s Bane', detail: 'Extra harm to runners.' },
    siege: { name: 'Siege Heads', detail: 'Extra harm to brutes.' },
    spellweave: { name: 'Spellweave', detail: 'Spells recover faster.' },
    wright: { name: 'Gate Wright', detail: 'The gate shrugs off more of each blow.' },
    mason: { name: 'Mason\'s Bond', detail: 'The gate is repaired and its strength grows.' },
    scholar: { name: 'Keen Eye', detail: 'Kills teach more.' },
    steady: { name: 'Steady Hands', detail: 'You keep more of your pace while drawing.' },
};

const SPELL_COPY: Record<SpellId, { name: string; detail: string }> = {
    volley: { name: 'Volley', detail: 'Loose a fan of arrows where you aim.' },
    bolt: { name: 'Piercing Bolt', detail: 'A heavy shot that ignores shields and runs through a file.' },
    blast: { name: 'Blast Arrow', detail: 'The arrow bursts, hurting everyone nearby.' },
    rain: { name: 'Arrow Rain', detail: 'Arrows fall on the stretch of bridge you are watching.' },
    repel: { name: 'Repel', detail: 'Shove the crowd at the gate back down the bridge.' },
    mend: { name: 'Mend Gate', detail: 'Stone and timber knit. The gate regains strength.' },
    brand: { name: 'Fire Brand', detail: 'For a short while, your arrows set foes alight.' },
    frost: { name: 'Frost Shot', detail: 'A chilling arrow that slows the target and those beside them.' },
    spark: { name: 'Chain Spark', detail: 'Lightning leaps from the first foe into the ones around them.' },
    snipe: { name: 'Snipe', detail: 'A very fast heavy shot. Cruel to casters.' },
    barrage: { name: 'Barrage', detail: 'For a short while, every shot looses extra arrows.' },
    oil: { name: 'Oil Slick', detail: 'A slick on the bridge where you aim. Foes crossing it crawl.' },
};

const SPELL_IDS = Object.keys(SPELL_COPY) as SpellId[];
const PASSIVE_IDS = Object.keys(PASSIVES) as PassiveId[];

export function emptyBuild(): RunBuild {
    return { ranks: {}, spells: [], spellRanks: {} };
}

export function emptyMods(): CombatMods {
    return combatMods(emptyBuild());
}

function rankOf(build: RunBuild, id: CardId): number {
    return isSpell(id) ? build.spellRanks[id] ?? 0 : build.ranks[id] ?? 0;
}

export function isSpell(id: CardId): id is SpellId {
    return id in SPELL_COPY;
}

export function combatMods(build: RunBuild): CombatMods {
    const rank = (id: PassiveId) => build.ranks[id] ?? 0;
    return {
        damage: 1 + 0.12 * rank('sharpened'),
        drawTime: 0.88 ** rank('swift'),
        nock: 0.86 ** rank('nock'),
        arrowSpeed: 1 + 0.08 * rank('fletching'),
        twinChance: Math.min(0.55, 0.14 * rank('twin')),
        pierceChance: Math.min(0.7, 0.16 * rank('bodkin')),
        critChance: Math.min(0.45, 0.08 * rank('wounds')),
        critMul: 1.7,
        shieldBreak: Math.min(0.85, 0.22 * rank('bodkin')),
        burn: 2.4 * rank('barbed'),
        slow: 0,
        knockback: 0.85 * rank('impact'),
        vs: {
            goblin: 1,
            runner: 1 + 0.25 * rank('hunter'),
            brute: 1 + 0.25 * rank('siege'),
            shield: 1 + 0.16 * rank('bodkin'),
            caster: 1,
        },
        gateTaken: 0.9 ** rank('wright'),
        xpGain: 1 + 0.14 * rank('scholar'),
        gateOnKill: 0,
        spellHaste: 1 + 0.12 * rank('spellweave'),
        drawMove: Math.min(1.7, 1 + 0.2 * rank('steady')),
        gateBonus: 14 * rank('mason'),
    };
}

export function cardView(id: CardId, build: RunBuild): CardView {
    const next = rankOf(build, id) + 1;
    if (isSpell(id)) {
        const copy = SPELL_COPY[id];
        const owned = build.spells.includes(id);
        return {
            id,
            name: `${copy.name} ${ROMAN[next] ?? next}`,
            detail: owned ? `${copy.detail} The wait between casts grows shorter.` : copy.detail,
            kind: 'spell',
            rank: next,
        };
    }
    const copy = PASSIVES[id];
    return {
        id,
        name: `${copy.name} ${ROMAN[next] ?? next}`,
        detail: copy.detail,
        kind: 'passive',
        rank: next,
    };
}

export function dealCards(rng: () => number, build: RunBuild): CardId[] {
    const bag: CardId[] = [];
    for (const id of PASSIVE_IDS) {
        if ((build.ranks[id] ?? 0) < PASSIVE_MAX) bag.push(id);
    }
    const wantSpells = build.spells.length < SPELL.slots;
    for (const id of SPELL_IDS) {
        if ((build.spellRanks[id] ?? 0) >= SPELL_MAX) continue;
        bag.push(id);
        if (wantSpells && !build.spells.includes(id)) bag.push(id);
    }
    const picks: CardId[] = [];
    while (picks.length < 3 && bag.length > 0) {
        const index = Math.min(bag.length - 1, Math.floor(rng() * bag.length));
        const [id] = bag.splice(index, 1);
        if (!picks.includes(id)) picks.push(id);
    }
    return picks;
}

export function applyCard(build: RunBuild, id: CardId): void {
    if (isSpell(id)) {
        build.spellRanks[id] = (build.spellRanks[id] ?? 0) + 1;
        if (!build.spells.includes(id)) {
            if (build.spells.length >= SPELL.slots) build.spells.shift();
            build.spells.push(id);
        }
        return;
    }
    build.ranks[id] = (build.ranks[id] ?? 0) + 1;
}

export function spellCooldown(id: SpellId, build: RunBuild): number {
    const rank = Math.max(1, build.spellRanks[id] ?? 1);
    const haste = 1 + 0.12 * (build.ranks.spellweave ?? 0);
    return SPELL[id].cooldown / (1 + 0.2 * (rank - 1)) / haste;
}

export function spellName(id: SpellId): string {
    return SPELL_COPY[id].name;
}

/** Damage after enemy bonuses and a critical roll. `roll` is 0 to 1. */
export function rolledDamage(profile: ShotProfile, enemy: EnemyId, roll: number): { damage: number; crit: boolean } {
    const crit = roll < profile.critChance;
    const damage = profile.damage * (profile.vs[enemy] ?? 1) * (crit ? profile.critMul : 1);
    return { damage, crit };
}
