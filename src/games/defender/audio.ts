/** Short synthesized cues. The context starts on the first user gesture, as browsers require. */
export class DefenderAudio {
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private noise: AudioBuffer | null = null;
    private lastGateHit = 0;

    unlock(): void {
        if (!this.context) {
            try {
                this.context = new AudioContext();
                this.master = this.context.createGain();
                this.master.gain.value = 0.55;
                this.master.connect(this.context.destination);
                this.noise = this.makeNoise(this.context);
            } catch {
                this.context = null;
                return;
            }
        }
        if (this.context.state === 'suspended') void this.context.resume();
    }

    shot(draw: number): void {
        this.noiseBurst({ duration: 0.16, frequency: 2600 + draw * 1800, endFrequency: 700, q: 1.4, gain: 0.25 + draw * 0.25 });
        this.tone({ type: 'triangle', frequency: 150 + draw * 40, endFrequency: 95, duration: 0.22, gain: 0.22 });
    }

    hit(): void {
        this.tone({ type: 'sine', frequency: 170, endFrequency: 55, duration: 0.14, gain: 0.5 });
        this.noiseBurst({ duration: 0.05, frequency: 1800, endFrequency: 900, q: 0.8, gain: 0.3 });
    }

    stick(): void {
        this.noiseBurst({ duration: 0.05, frequency: 3200, endFrequency: 2200, q: 2.5, gain: 0.18 });
        this.tone({ type: 'square', frequency: 900, endFrequency: 600, duration: 0.04, gain: 0.04 });
    }

    death(): void {
        this.tone({ type: 'square', frequency: 620, endFrequency: 160, duration: 0.28, gain: 0.08 });
    }

    gateHit(): void {
        if (!this.context) return;
        const now = this.context.currentTime;
        if (now - this.lastGateHit < 0.45) return;
        this.lastGateHit = now;
        this.tone({ type: 'sine', frequency: 95, endFrequency: 60, duration: 0.2, gain: 0.45 });
        this.noiseBurst({ duration: 0.12, frequency: 500, endFrequency: 250, q: 0.7, gain: 0.25 });
    }

    blocked(): void {
        this.tone({ type: 'square', frequency: 210, endFrequency: 90, duration: 0.07, gain: 0.07 });
        this.noiseBurst({ duration: 0.05, frequency: 1600, endFrequency: 700, q: 1.1, gain: 0.16 });
    }

    level(): void {
        this.tone({ type: 'triangle', frequency: 523, duration: 0.1, gain: 0.1 });
        this.tone({ type: 'triangle', frequency: 659, duration: 0.16, gain: 0.1, delay: 0.08 });
        this.tone({ type: 'triangle', frequency: 784, duration: 0.22, gain: 0.1, delay: 0.16 });
    }

    spell(): void {
        this.tone({ type: 'sawtooth', frequency: 392, endFrequency: 880, duration: 0.18, gain: 0.05, lowpass: 1600 });
        this.tone({ type: 'triangle', frequency: 660, duration: 0.12, gain: 0.08, delay: 0.02 });
    }

    waveStart(): void {
        this.tone({ type: 'sawtooth', frequency: 196, duration: 0.42, gain: 0.08, lowpass: 900 });
        this.tone({ type: 'sawtooth', frequency: 294, duration: 0.6, gain: 0.08, lowpass: 900, delay: 0.32 });
    }

    gameOver(): void {
        this.tone({ type: 'sawtooth', frequency: 220, endFrequency: 110, duration: 1.1, gain: 0.1, lowpass: 700 });
    }

    destroy(): void {
        void this.context?.close();
        this.context = null;
        this.master = null;
    }

    private makeNoise(context: AudioContext): AudioBuffer {
        const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.5), context.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
        return buffer;
    }

    private envelope(gain: number, start: number, duration: number): GainNode | null {
        if (!this.context || !this.master) return null;
        const node = this.context.createGain();
        node.gain.setValueAtTime(0.0001, start);
        node.gain.exponentialRampToValueAtTime(gain, start + 0.008);
        node.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        node.connect(this.master);
        return node;
    }

    private tone(options: { type: OscillatorType; frequency: number; endFrequency?: number; duration: number;
        gain: number; lowpass?: number; delay?: number; }): void {
        if (!this.context) return;
        const start = this.context.currentTime + (options.delay ?? 0);
        const output = this.envelope(options.gain, start, options.duration);
        if (!output) return;
        const oscillator = this.context.createOscillator();
        oscillator.type = options.type;
        oscillator.frequency.setValueAtTime(options.frequency, start);
        if (options.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, start + options.duration);
        let destination: AudioNode = output;
        if (options.lowpass) {
            const filter = this.context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = options.lowpass;
            filter.connect(output);
            destination = filter;
        }
        oscillator.connect(destination);
        oscillator.start(start);
        oscillator.stop(start + options.duration + 0.02);
    }

    private noiseBurst(options: { duration: number; frequency: number; endFrequency: number; q: number; gain: number; }): void {
        if (!this.context || !this.noise) return;
        const start = this.context.currentTime;
        const output = this.envelope(options.gain, start, options.duration);
        if (!output) return;
        const source = this.context.createBufferSource();
        source.buffer = this.noise;
        const filter = this.context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = options.q;
        filter.frequency.setValueAtTime(options.frequency, start);
        filter.frequency.exponentialRampToValueAtTime(options.endFrequency, start + options.duration);
        source.connect(filter).connect(output);
        source.start(start);
        source.stop(start + options.duration + 0.02);
    }
}
