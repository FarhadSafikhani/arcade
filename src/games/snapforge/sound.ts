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

/** A fixed-size cascade: enough clacks to suggest a pile without one voice per brick. */
export function createBrickRainBuffer(context: BaseAudioContext): AudioBuffer {
    const duration = 1.2;
    const rate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.ceil(rate * duration), rate);
    const samples = buffer.getChannelData(0);
    const impacts = [0.18, 0.29, 0.39, 0.48, 0.55, 0.63, 0.71, 0.78, 0.86, 0.94, 1.01];
    for (let index = 0; index < impacts.length; index++) {
        const pitch = 630 + ((index * 7) % 9) * 115;
        const strength = (0.42 + (index % 4) * 0.085) * (1 - index / impacts.length * 0.4);
        addPlasticClack(samples, rate, impacts[index], pitch, strength);
    }
    finishBuffer(samples, 0.68);
    return buffer;
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
