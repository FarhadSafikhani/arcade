/// <reference types="vite/client" />
import snapUrl from './audio/snap.mp3';
import grabUrl from './audio/grab.mp3';
import breakupUrl from './audio/breakup.mp3';
import pourUrl from './audio/pour.mp3';

export type SnapSample = 'snap' | 'grab' | 'breakup' | 'pour';
export type SnapSamples = Record<SnapSample, AudioBuffer>;

/** Recorded clips. snap, grab, and pour are cut by scripts/prepare-snapforge-audio.mjs; breakup is original. */
const SAMPLE_URLS: Record<SnapSample, string> = { snap: snapUrl, grab: grabUrl, breakup: breakupUrl, pour: pourUrl };

/** Decodes every clip once. Resolves null if any clip fails, because sound is optional. */
export async function loadSnapSamples(context: BaseAudioContext): Promise<SnapSamples | null> {
    try {
        const entries = await Promise.all(Object.entries(SAMPLE_URLS).map(async ([name, url]) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Could not load ${url}`);
            return [name, await context.decodeAudioData(await response.arrayBuffer())] as const;
        }));
        return Object.fromEntries(entries) as SnapSamples;
    } catch {
        return null;
    }
}

/** The original plastic snap, now used for buttons and action feedback. */
export function createClickBuffer(context: BaseAudioContext): AudioBuffer {
    const duration = 0.12;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    let previousNoise = 0;
    for (let index = 0; index < samples.length; index++) {
        const time = index / context.sampleRate;
        const noise = Math.random() * 2 - 1;
        const crispNoise = (noise - previousNoise) * 0.5;
        previousNoise = noise;

        // A tiny attack avoids a digital discontinuity; damped, inharmonic modes give it body.
        const attack = Math.min(1, time / 0.0006);
        const impact = crispNoise * 0.46 * Math.exp(-time / 0.0035);
        const body = Math.sin(2 * Math.PI * 920 * time) * 0.19 * Math.exp(-time / 0.010)
            + Math.sin(2 * Math.PI * 2180 * time) * 0.10 * Math.exp(-time / 0.006)
            + Math.sin(2 * Math.PI * 310 * time) * 0.15 * Math.exp(-time / 0.016);

        // A quieter second contact makes the piece feel like it has clicked into a socket.
        const settleTime = Math.max(0, time - 0.014);
        const settle = Math.min(1, settleTime / 0.0005) * (
            crispNoise * 0.22 * Math.exp(-settleTime / 0.0025)
            + Math.sin(2 * Math.PI * 1460 * settleTime) * 0.10 * Math.exp(-settleTime / 0.007));
        const tail = Math.min(1, (duration - time) / 0.012);
        samples[index] = (attack * (impact + body) + settle) * tail;
    }
    return buffer;
}
