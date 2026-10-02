import type { EffectDefinition } from '../types';
import { glints, GlintsSpec } from './glints';
import { motes, MotesSpec } from './motes';
import { rays, RaysSpec } from './rays';
import { ripples, RipplesSpec } from './ripples';

export type { GlintsSpec, MotesSpec, RaysSpec, RipplesSpec };

/** Adding an effect: write its module, then add its spec here and its definition below. */
export type EffectSpec = RipplesSpec | GlintsSpec | RaysSpec | MotesSpec;

type EffectRegistry = { readonly [Type in EffectSpec['type']]: EffectDefinition<Extract<EffectSpec, { type: Type }>> };

export const AMBIENT_EFFECTS: EffectRegistry = { ripples, glints, rays, motes };

export const effectDefinition = (spec: EffectSpec): EffectDefinition<EffectSpec> =>
    AMBIENT_EFFECTS[spec.type] as EffectDefinition<EffectSpec>;
