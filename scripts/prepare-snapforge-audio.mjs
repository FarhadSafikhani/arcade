import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ffmpeg from 'ffmpeg-static';

const RATE = 44100;
const WORK = resolve('tmp/snapforge-audio');
const OUTPUT = resolve('src/games/snapforge/audio');
const PEAK = 0.89;
const ENVELOPE_STEP = 0.005;

/** Freesound previews need no login; a logged-in download saved as `<id>.wav` in WORK takes precedence. */
const SOURCES = {
    bricks: 'https://cdn.freesound.org/previews/257/257246_4286987-hq.mp3',
    floor: 'https://cdn.freesound.org/previews/707/707543_14747739-hq.mp3'
};

/**
 * Each clip is the event inside [from, to] seconds of its source. It starts just before the first
 * envelope frame above `onset` × the window peak and ends at the last frame above `floor` × peak.
 * `boost` (dB) lifts clips whose level is set by a few sharp clicks, with a limiter holding the peak.
 */
const CLIPS = [
    { name: 'snap', source: 'bricks', from: 0, to: 0.6, onset: 0.1, floor: 0.02, maxLength: 0.3, fadeOut: 0.04 },
    { name: 'grab', source: 'bricks', from: 0.6, to: 1.6, onset: 0.1, floor: 0.02, maxLength: 0.3, fadeOut: 0.04 },
    { name: 'pour', source: 'floor', from: 1.3, to: 4.4, onset: 0.3, floor: 0.03, maxLength: 1.6, fadeOut: 0.45, boost: 7 }
];

async function sourceFile(id) {
    const original = resolve(WORK, `${id}.wav`);
    if (existsSync(original)) return original;
    const preview = resolve(WORK, `${id}.mp3`);
    if (!existsSync(preview)) {
        const response = await fetch(SOURCES[id]);
        if (!response.ok) throw new Error(`Download failed (${response.status}): ${SOURCES[id]}`);
        writeFileSync(preview, Buffer.from(await response.arrayBuffer()));
    }
    return preview;
}

function decodeMono(file) {
    const raw = execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', file,
        '-ac', '1', '-ar', String(RATE), '-f', 'f32le', 'pipe:1'], { maxBuffer: 1 << 28 });
    return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

function envelope(samples, from, to) {
    const step = Math.round(ENVELOPE_STEP * RATE);
    const frames = [];
    for (let start = Math.round(from * RATE); start < Math.min(samples.length, to * RATE); start += step) {
        let sum = 0;
        const end = Math.min(samples.length, start + step);
        for (let index = start; index < end; index++) sum += samples[index] * samples[index];
        frames.push({ start, rms: Math.sqrt(sum / (end - start)) });
    }
    return frames;
}

function cut(samples, clip) {
    const frames = envelope(samples, clip.from, clip.to);
    const loudest = Math.max(...frames.map(frame => frame.rms));
    const first = frames.findIndex(frame => frame.rms >= loudest * clip.onset);
    let last = frames.length - 1;
    while (last > first && frames[last].rms < loudest * clip.floor) last--;
    const start = Math.max(0, frames[first].start - Math.round(0.01 * RATE));
    const end = Math.min(frames[last].start + Math.round(ENVELOPE_STEP * RATE),
        start + Math.round(clip.maxLength * RATE));
    const clipSamples = samples.slice(start, end);

    // A 2 ms fade-in removes any click from the cut; the fade-out lets the tail settle naturally.
    const fadeIn = Math.round(0.002 * RATE);
    const fadeOut = Math.min(clipSamples.length, Math.round(clip.fadeOut * RATE));
    let peak = 0;
    for (let index = 0; index < clipSamples.length; index++) {
        const fromEnd = clipSamples.length - 1 - index;
        if (index < fadeIn) clipSamples[index] *= index / fadeIn;
        if (fromEnd < fadeOut) clipSamples[index] *= Math.pow(fromEnd / fadeOut, 2);
        peak = Math.max(peak, Math.abs(clipSamples[index]));
    }
    for (let index = 0; index < clipSamples.length; index++) clipSamples[index] *= PEAK / peak;
    return { samples: clipSamples, start: start / RATE, end: end / RATE };
}

function encode(samples, output, boost) {
    const filters = boost
        ? ['-af', `volume=${boost}dB,alimiter=limit=${PEAK}:attack=1:release=40:level=false:latency=true`] : [];
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', 'pipe:0', ...filters,
        '-c:a', 'libmp3lame', '-b:a', '112k', output],
        { input: Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength) });
}

function drawWaveform(input, output) {
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-filter_complex',
        'showwavespic=s=1200x240:colors=orange,drawgrid=w=iw/10:h=ih:color=white@0.3',
        '-frames:v', '1', output]);
}

try {
    mkdirSync(WORK, { recursive: true });
    mkdirSync(OUTPUT, { recursive: true });
    const decoded = new Map();
    for (const clip of CLIPS) {
        if (!decoded.has(clip.source)) decoded.set(clip.source, decodeMono(await sourceFile(clip.source)));
        const result = cut(decoded.get(clip.source), clip);
        const output = resolve(OUTPUT, `${clip.name}.mp3`);
        encode(result.samples, output, clip.boost);
        drawWaveform(output, resolve(WORK, `${clip.name}-wave.png`));
        console.log(`${clip.name}: ${clip.source} ${result.start.toFixed(3)}s to ${result.end.toFixed(3)}s -> ${output}`);
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
