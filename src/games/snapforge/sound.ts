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

/** A close, dry fracture: fast broadband crack, tiny splinters, and a short woody body. */
export function createConnectionBuffer(context: BaseAudioContext): AudioBuffer {
    const duration = 0.085;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    const lowPassAmount = 1 - Math.exp(-2 * Math.PI * 1400 / context.sampleRate);
    let lowPass = 0;
    let peak = 0;
    for (let index = 0; index < samples.length; index++) {
        const time = index / context.sampleRate;
        const noise = Math.random() * 2 - 1;
        lowPass += lowPassAmount * (noise - lowPass);
        const brightNoise = noise - lowPass;
        const attack = Math.min(1, time / 0.00015);
        const crack = (brightNoise * 0.85 + noise * 0.15) * Math.exp(-time / 0.004);
        // Closely spaced fractures fuse into one sharp snap rather than a double click.
        let splinters = 0;
        for (const [delay, strength] of [[0.0014, 0.40], [0.0031, 0.22]]) {
            const age = Math.max(0, time - delay);
            splinters += brightNoise * strength * Math.min(1, age / 0.0001) * Math.exp(-age / 0.0015);
        }
        const body = Math.sin(2 * Math.PI * (1050 * time - 9000 * time * time))
            * 0.24 * Math.exp(-time / 0.006);
        const texture = lowPass * 0.12 * Math.exp(-time / 0.012);
        const tail = Math.min(1, (duration - time) / 0.010);
        samples[index] = (attack * (crack + body + texture) + splinters) * tail;
        peak = Math.max(peak, Math.abs(samples[index]));
    }
    // Leave headroom while keeping every generated buffer equally punchy.
    if (peak > 0) for (let index = 0; index < samples.length; index++) samples[index] *= 0.85 / peak;
    return buffer;
}

/** A bright plastic release with a short flutter of smaller pieces separating. */
export function createBreakupBuffer(context: BaseAudioContext): AudioBuffer {
    const duration = 0.42;
    const rate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.ceil(rate * duration), rate);
    const samples = buffer.getChannelData(0);
    const clicks = [
        [0, 1, 1120], [0.037, 0.38, 1550], [0.079, 0.3, 1320],
        [0.131, 0.23, 1790], [0.198, 0.16, 1480]
    ];
    for (const [delay, strength, pitch] of clicks)
        addPlasticClack(samples, rate, delay, pitch, strength);
    let filteredNoise = 0;
    const smoothing = 1 - Math.exp(-2 * Math.PI * 3400 / rate);
    for (let index = 0; index < samples.length; index++) {
        const time = index / rate;
        const noise = Math.random() * 2 - 1;
        filteredNoise += smoothing * (noise - filteredNoise);
        const sweep = (noise - filteredNoise) * Math.sin(Math.PI * Math.min(1, time / 0.29))
            * Math.exp(-time / 0.19) * 0.055;
        samples[index] += sweep;
    }
    finishBuffer(samples, 0.76);
    return buffer;
}

/** A broad, irregular shower of small plastic impacts, with no leading silence. */
export function createBrickRainBuffer(context: BaseAudioContext): AudioBuffer {
    const duration = 1.12;
    const rate = context.sampleRate;
    const buffer = context.createBuffer(2, Math.ceil(rate * duration), rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    let seed = 0x5a17c9e3;
    const random = (): number => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
    };
    const clusters: [number, number, number][] = [
        [0, 4, 0.06], [0.09, 8, 0.12], [0.22, 12, 0.16],
        [0.39, 15, 0.18], [0.59, 10, 0.16], [0.78, 7, 0.16]
    ];
    for (const [start, count, spread] of clusters) {
        for (let index = 0; index < count; index++) {
            const delay = start === 0 && index === 0 ? 0 : start + random() * spread;
            const pitch = 620 + random() * 1250;
            const strength = (0.32 + random() * 0.38) * (1 - start * 0.32);
            addRainClack(left, right, rate, delay, pitch, strength, random() * 1.6 - 0.8, random);
        }
    }
    let peak = 0;
    for (let index = 0; index < left.length; index++)
        peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
    if (peak > 0.68) {
        const scale = 0.68 / peak;
        for (let index = 0; index < left.length; index++) {
            left[index] *= scale;
            right[index] *= scale;
        }
    }
    return buffer;
}

function addRainClack(left: Float32Array, right: Float32Array, rate: number, delay: number,
    pitch: number, strength: number, pan: number, random: () => number): void {
    const start = Math.round(delay * rate);
    const length = Math.min(left.length - start, Math.ceil(rate * 0.07));
    const leftGain = Math.sqrt((1 - pan) / 2);
    const rightGain = Math.sqrt((1 + pan) / 2);
    const lowPitch = pitch * (0.34 + random() * 0.1);
    let filteredNoise = 0;
    const smoothing = 1 - Math.exp(-2 * Math.PI * 2600 / rate);
    for (let index = 0; index < length; index++) {
        const time = index / rate;
        const noise = random() * 2 - 1;
        filteredNoise += smoothing * (noise - filteredNoise);
        const attack = Math.min(1, time / 0.0004);
        const crack = (noise - filteredNoise) * 0.3 * Math.exp(-time / 0.0024);
        const texture = filteredNoise * 0.17 * Math.exp(-time / 0.009);
        const body = Math.sin(2 * Math.PI * (pitch * time - 1300 * time * time))
            * 0.13 * Math.exp(-time / 0.014)
            + Math.sin(2 * Math.PI * lowPitch * time) * 0.12 * Math.exp(-time / 0.025);
        const tail = Math.min(1, (length - index) / (rate * 0.008));
        const sample = (crack + texture + body) * attack * tail * strength;
        left[start + index] += sample * leftGain;
        right[start + index] += sample * rightGain;
    }
}

function addPlasticClack(samples: Float32Array, rate: number, delay: number,
    pitch: number, strength: number): void {
    const start = Math.round(delay * rate);
    const length = Math.min(samples.length - start, Math.ceil(rate * 0.09));
    let previousNoise = 0;
    for (let index = 0; index < length; index++) {
        const time = index / rate;
        const noise = Math.random() * 2 - 1;
        const crisp = (noise - previousNoise) * 0.5;
        previousNoise = noise;
        const attack = Math.min(1, time / 0.0005);
        const snap = crisp * 0.48 * Math.exp(-time / 0.0032);
        const body = Math.sin(2 * Math.PI * (pitch * time - 1200 * time * time))
            * 0.22 * Math.exp(-time / 0.018);
        const rim = Math.sin(2 * Math.PI * pitch * 1.81 * time)
            * 0.11 * Math.exp(-time / 0.008);
        const tail = Math.min(1, (length - index) / (rate * 0.01));
        samples[start + index] += (snap + body + rim) * attack * tail * strength;
    }
}

function finishBuffer(samples: Float32Array, maxPeak: number): void {
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    if (peak > maxPeak)
        for (let index = 0; index < samples.length; index++) samples[index] *= maxPeak / peak;
}
