import { SKILLS } from './tuning';

/**
 * Two skill trees in the Diablo II mould. Each tree has two paths of three skills
 * that unlock by character level and by a point in the skill above them, and one
 * ultimate at the bottom. Points come from the team's shared level, two at a time.
 *
 * Marksman deals the damage: the left path bleeds and spreads, the right path draws
 * fast and hits hard, and Rapid Fire speeds every shot.
 * Warden holds the line: the left path slows and softens, the right path stuns,
 * shoves, and mends the gate, and Winter's Grip turns every arrow to frost.
 */

export type TreeId = 'marksman' | 'warden';
export type SkillId =
    | 'barbed' | 'lingering' | 'ricochet' | 'quick' | 'heavy' | 'power' | 'rapid'
    | 'chill' | 'tar' | 'frostbite' | 'concuss' | 'mending' | 'shockwave' | 'winter';

export interface SkillDef {
    id: SkillId;
    tree: TreeId;
    name: string;
    /** Actives go on the spell bar; passives work on their own. */
    kind: 'passive' | 'active';
    /** True for actives that grant a timed buff shown on the HUD. */
    buff: boolean;
    max: number;
    /** 0 to 3. The tier sets the character level the skill opens at. */
    tier: number;
    /** 0 is the left path, 1 the right, 0.5 the centered ultimate. */
    column: number;
    /** A point in any of these opens the skill. Empty for the top of a path. */
    requires: SkillId[];
    /** One line on what the skill is. */
    blurb: string;
    /** What a given rank does, for the tree's tooltip. */
    effect(rank: number): string;
}

export const TREES: { id: TreeId; name: string; motto: string }[] = [
    { id: 'marksman', name: 'Marksman', motto: 'Bleed them, or break them.' },
    { id: 'warden', name: 'Warden', motto: 'Slow them, stop them, mend the gate.' },
];

const pct = (value: number) => `${Math.round(value * 100)}%`;
const secs = (value: number) => `${Number(value.toFixed(1))}s`;
const by = (base: number, per: number, rank: number) => base + per * (rank - 1);

export const SKILL_DEFS: Record<SkillId, SkillDef> = {
    barbed: {
        id: 'barbed', tree: 'marksman', name: 'Barbed Arrows', kind: 'passive', buff: false, max: 5, tier: 0, column: 0, requires: [],
        blurb: 'Every hit opens a bleeding wound.',
        effect: rank => `Bleeds for ${by(SKILLS.barbed.bleedDps, SKILLS.barbed.bleedDpsPer, rank)} a second over ${secs(SKILLS.barbed.bleedTime)}.`,
    },
    lingering: {
        id: 'lingering', tree: 'marksman', name: 'Lingering Wounds', kind: 'passive', buff: false, max: 5, tier: 1, column: 0, requires: ['barbed'],
        blurb: 'Bleeds run longer, and bleeding foes take more from every arrow.',
        effect: rank => `Bleeds last ${secs(SKILLS.lingering.timePer * rank)} longer. Hits on a bleeding foe deal ${pct(SKILLS.lingering.woundPer * rank)} more.`,
    },
    ricochet: {
        id: 'ricochet', tree: 'marksman', name: 'Ricochet', kind: 'passive', buff: false, max: 5, tier: 2, column: 0, requires: ['lingering'],
        blurb: 'Arrows leap from foe to foe, carrying the bleed with them.',
        effect: rank => `${pct(SKILLS.ricochet.chancePer * rank)} chance a hit leaps to a foe within ${SKILLS.ricochet.range}m for ${pct(SKILLS.ricochet.damage)} damage.`,
    },
    quick: {
        id: 'quick', tree: 'marksman', name: 'Quick Hands', kind: 'passive', buff: false, max: 5, tier: 0, column: 1, requires: [],
        blurb: 'Draw and nock faster.',
        effect: rank => `Attack speed +${pct(SKILLS.quick.speedPer * rank)}.`,
    },
    heavy: {
        id: 'heavy', tree: 'marksman', name: 'Heavy Draw', kind: 'passive', buff: false, max: 5, tier: 1, column: 1, requires: ['quick'],
        blurb: 'A full draw lands like a hammer.',
        effect: rank => `Full draws deal ${pct(SKILLS.heavy.damagePer * rank)} more and shove foes back ${(SKILLS.heavy.shovePer * rank).toFixed(1)}m.`,
    },
    power: {
        id: 'power', tree: 'marksman', name: 'Power Shot', kind: 'active', buff: false, max: 5, tier: 2, column: 1, requires: ['heavy'],
        blurb: 'A heavy shaft that tears through the whole file and ignores shields.',
        effect: rank => `${by(SKILLS.power.damage, SKILLS.power.damagePer, rank)} damage to every foe in line. Cooldown ${secs(skillCooldown('power', rank))}.`,
    },
    rapid: {
        id: 'rapid', tree: 'marksman', name: 'Rapid Fire', kind: 'active', buff: true, max: 3, tier: 3, column: 0.5, requires: ['ricochet', 'power'],
        blurb: 'For a while, every arrow comes faster.',
        effect: rank => `Attack speed +${pct(SKILLS.rapid.attackSpeed[rank - 1])} for ${secs(SKILLS.rapid.duration)}. Cooldown ${secs(SKILLS.rapid.cooldown)}.`,
    },
    chill: {
        id: 'chill', tree: 'warden', name: 'Chilling Arrows', kind: 'passive', buff: false, max: 5, tier: 0, column: 0, requires: [],
        blurb: 'Every hit chills and slows.',
        effect: rank => `Hits slow foes by ${pct(SKILLS.chill.slowPer * rank)} for ${secs(SKILLS.chill.time)}.`,
    },
    tar: {
        id: 'tar', tree: 'warden', name: 'Tar Pit', kind: 'active', buff: false, max: 5, tier: 1, column: 0, requires: ['chill'],
        blurb: 'Pour tar on the bridge where you aim. Foes crossing it crawl.',
        effect: rank => `Foes move at ${pct(by(SKILLS.tar.slow, SKILLS.tar.slowPer, rank))} speed for ${secs(by(SKILLS.tar.duration, SKILLS.tar.durationPer, rank))}. Cooldown ${secs(skillCooldown('tar', rank))}.`,
    },
    frostbite: {
        id: 'frostbite', tree: 'warden', name: 'Frostbite', kind: 'passive', buff: false, max: 5, tier: 2, column: 0, requires: ['tar'],
        blurb: 'Chilled foes take more from every archer on the wall.',
        effect: rank => `Chilled foes take ${pct(SKILLS.frostbite.damagePer * rank)} more damage from everyone.`,
    },
    concuss: {
        id: 'concuss', tree: 'warden', name: 'Concussive Shot', kind: 'active', buff: false, max: 5, tier: 0, column: 1, requires: [],
        blurb: 'A blunt arrow that stuns the foe it hits and those beside it.',
        effect: rank => `Stuns for ${secs(by(SKILLS.concuss.stun, SKILLS.concuss.stunPer, rank))} within ${SKILLS.concuss.radius}m. Cooldown ${secs(skillCooldown('concuss', rank))}.`,
    },
    mending: {
        id: 'mending', tree: 'warden', name: 'Mending Arrows', kind: 'active', buff: true, max: 5, tier: 1, column: 1, requires: ['concuss'],
        blurb: 'For a while your arrows heal. They pass through foes; land one at the gate to mend it.',
        effect: rank => `Each arrow that lands at the gate restores ${pct(by(SKILLS.mending.heal, SKILLS.mending.healPer, rank))} of its strength, for ${secs(by(SKILLS.mending.duration, SKILLS.mending.durationPer, rank))}. Cooldown ${secs(SKILLS.mending.cooldown)}.`,
    },
    shockwave: {
        id: 'shockwave', tree: 'warden', name: 'Shockwave', kind: 'active', buff: false, max: 5, tier: 2, column: 1, requires: ['mending'],
        blurb: 'Blast the crowd at the gate back down the bridge, stunned.',
        effect: rank => `Shoves foes ${by(SKILLS.shockwave.distance, SKILLS.shockwave.distancePer, rank).toFixed(1)}m and stuns for ${secs(by(SKILLS.shockwave.stun, SKILLS.shockwave.stunPer, rank))}. Cooldown ${secs(skillCooldown('shockwave', rank))}.`,
    },
    winter: {
        id: 'winter', tree: 'warden', name: "Winter's Grip", kind: 'passive', buff: false, max: 3, tier: 3, column: 0.5, requires: ['frostbite', 'shockwave'],
        blurb: 'Every arrow is a frost arrow. Foes struck again and again freeze solid.',
        effect: rank => `Arrows chill. ${SKILLS.winter.hits} hits within ${secs(SKILLS.winter.window)} freeze a foe for ${secs(SKILLS.winter.freeze[rank - 1])}.`,
    },
};

export const SKILL_IDS = Object.keys(SKILL_DEFS) as SkillId[];

export function isSkill(id: string): id is SkillId {
    return id in SKILL_DEFS;
}

export type Ranks = Partial<Record<SkillId, number>>;

export function rankOf(ranks: Ranks, id: SkillId): number {
    return ranks[id] ?? 0;
}

export function spentPoints(ranks: Ranks): number {
    return SKILL_IDS.reduce((total, id) => total + rankOf(ranks, id), 0);
}

/** Why a point cannot go into this skill right now, or null when it can. */
export function learnBlock(ranks: Ranks, id: SkillId, level: number, points: number): string | null {
    const def = SKILL_DEFS[id];
    if (rankOf(ranks, id) >= def.max) return 'Mastered';
    const needed = SKILLS.tierLevels[def.tier];
    if (level < needed) return `Opens at level ${needed}`;
    if (def.requires.length > 0 && !def.requires.some(other => rankOf(ranks, other) > 0)) {
        return `Needs ${def.requires.map(other => SKILL_DEFS[other].name).join(' or ')}`;
    }
    if (points <= 0) return 'No points';
    return null;
}

export function skillCooldown(id: SkillId, rank: number): number {
    const r = Math.max(1, rank);
    switch (id) {
        case 'power': return by(SKILLS.power.cooldown, SKILLS.power.cooldownPer, r);
        case 'rapid': return SKILLS.rapid.cooldown;
        case 'tar': return by(SKILLS.tar.cooldown, SKILLS.tar.cooldownPer, r);
        case 'concuss': return by(SKILLS.concuss.cooldown, SKILLS.concuss.cooldownPer, r);
        case 'mending': return SKILLS.mending.cooldown;
        case 'shockwave': return by(SKILLS.shockwave.cooldown, SKILLS.shockwave.cooldownPer, r);
        default: return 0;
    }
}

/** What an archer's passives add to every arrow and draw. */
export interface Kit {
    /** Attack speed bonus from Quick Hands, before Rapid Fire. */
    attackSpeed: number;
    bleedDps: number;
    bleedTime: number;
    wound: number;
    ricochet: number;
    heavyDamage: number;
    heavyShove: number;
    chillSlow: number;
    chillTime: number;
    frostbite: number;
    /** Winter's Grip rank, 0 without it. */
    winter: number;
}

export function kitOf(ranks: Ranks): Kit {
    const r = (id: SkillId) => rankOf(ranks, id);
    const winter = r('winter');
    const chill = r('chill') * SKILLS.chill.slowPer;
    return {
        attackSpeed: SKILLS.quick.speedPer * r('quick'),
        bleedDps: r('barbed') > 0 ? by(SKILLS.barbed.bleedDps, SKILLS.barbed.bleedDpsPer, r('barbed')) : 0,
        bleedTime: SKILLS.barbed.bleedTime + SKILLS.lingering.timePer * r('lingering'),
        wound: SKILLS.lingering.woundPer * r('lingering'),
        ricochet: SKILLS.ricochet.chancePer * r('ricochet'),
        heavyDamage: SKILLS.heavy.damagePer * r('heavy'),
        heavyShove: SKILLS.heavy.shovePer * r('heavy'),
        chillSlow: winter > 0 ? Math.max(chill, 1 - SKILLS.winter.slow) : chill,
        chillTime: winter > 0 ? SKILLS.winter.chillTime : SKILLS.chill.time,
        frostbite: SKILLS.frostbite.damagePer * r('frostbite'),
        winter,
    };
}

/** How an arrow looks in flight. */
export enum ArrowKind { Plain = 0, Healing = 1, Frost = 2, Power = 3 }

/** Everything an arrow carries to whatever it hits. */
export interface ShotProfile {
    damage: number;
    speed: number;
    /** Foes the arrow may pass through after the first. */
    pierce: number;
    ignoreShield: boolean;
    bleedDps: number;
    bleedTime: number;
    wound: number;
    ricochet: number;
    chillSlow: number;
    chillTime: number;
    frostbite: number;
    winter: number;
    stun: number;
    stunRadius: number;
    knockback: number;
    /** A healing arrow mends this share of the gate where it lands, and passes through foes. */
    heal: number;
    kind: ArrowKind;
}

/** An arrow with an archer's passives on it. `draw` is 0 to 1; spells pass 1. */
export function shotFromKit(kit: Kit, damage: number, speed: number, draw: number): ShotProfile {
    const full = draw >= SKILLS.heavy.fullDraw;
    return {
        damage: damage * (full ? 1 + kit.heavyDamage : 1),
        speed,
        pierce: 0,
        ignoreShield: false,
        bleedDps: kit.bleedDps,
        bleedTime: kit.bleedTime,
        wound: kit.wound,
        ricochet: kit.ricochet,
        chillSlow: kit.chillSlow,
        chillTime: kit.chillTime,
        frostbite: kit.frostbite,
        winter: kit.winter,
        stun: 0,
        stunRadius: 0,
        knockback: full ? kit.heavyShove : 0,
        heal: 0,
        kind: kit.winter > 0 ? ArrowKind.Frost : ArrowKind.Plain,
    };
}
