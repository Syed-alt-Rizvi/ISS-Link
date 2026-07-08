/**
 * Synthesizer for authentic NASA space communications (Quindar tones and radio static)
 */

class SpaceAudioEngine {
  private ctx: AudioContext | null = null;
  private staticNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  private staticGain: GainNode | null = null;

  private initCtx() {
    if (!this.ctx) {
      // Standard safe audio context initialization
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  /**
   * Play NASA Quindar Intro Tone (2525 Hz, 250ms) - signaling transmission open
   */
  async playIntroBeep(): Promise<void> {
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(2525, this.ctx.currentTime); // Standard Quindar frequency

    gain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.03); // Quick fade in
    gain.gain.setValueAtTime(0.12, this.ctx.currentTime + 0.22);
    gain.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.25); // Quick fade out

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);

    return new Promise(resolve => setTimeout(resolve, 250));
  }

  /**
   * Play NASA Quindar Outro Tone (2475 Hz, 250ms) - signaling transmission close
   */
  async playOutroBeep(): Promise<void> {
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(2475, this.ctx.currentTime); // Standard Outro frequency

    gain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.03);
    gain.gain.setValueAtTime(0.12, this.ctx.currentTime + 0.22);
    gain.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);

    return new Promise(resolve => setTimeout(resolve, 250));
  }

  /**
   * Start generating realistic background VHF radio static / white noise
   */
  startStatic(volume: number = 0.02) {
    this.initCtx();
    if (!this.ctx) return;

    // If static is already playing, just adjust volume
    if (this.staticGain) {
      this.staticGain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.2);
      return;
    }

    try {
      const bufferSize = 2 * this.ctx.sampleRate;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);

      // Generate pinkish/bandpassed white noise (softer than raw white noise)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        output[i] = pink * 0.05; // scale pink noise down
      }

      const whiteNoiseSource = this.ctx.createBufferSource();
      whiteNoiseSource.buffer = noiseBuffer;
      whiteNoiseSource.loop = true;

      // Filter to simulate radio bandpass
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1000, this.ctx.currentTime); // Centered on vocal frequency
      filter.Q.setValueAtTime(1.2, this.ctx.currentTime);

      this.staticGain = this.ctx.createGain();
      this.staticGain.gain.setValueAtTime(volume, this.ctx.currentTime);

      whiteNoiseSource.connect(filter);
      filter.connect(this.staticGain);
      this.staticGain.connect(this.ctx.destination);

      whiteNoiseSource.start();
      
      // Store node reference to be able to stop it
      (this as any).staticSource = whiteNoiseSource;
    } catch (e) {
      console.warn("Failed to create procedural static:", e);
    }
  }

  /**
   * Transition static to background levels or shut down
   */
  stopStatic(fadeOutTime: number = 0.4) {
    if (this.staticGain && this.ctx) {
      this.staticGain.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + fadeOutTime);
      setTimeout(() => {
        try {
          if ((this as any).staticSource) {
            (this as any).staticSource.stop();
          }
        } catch(e) {}
        this.staticGain = null;
        (this as any).staticSource = null;
      }, fadeOutTime * 1000 + 50);
    }
  }

  /**
   * Plays returned base64 astronaut voice packets with telemetry sound effects
   */
  async playAstronautAudio(base64Data: string): Promise<void> {
    this.initCtx();
    if (!this.ctx) return;

    // Decode base64 to binary ArrayBuffer
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    let audioBuffer: AudioBuffer | null = null;
    try {
      // Decode audio data to linear PCM buffer. Slice buffer to avoid detaching it on failure.
      audioBuffer = await this.ctx.decodeAudioData(bytes.buffer.slice(0));
    } catch (decodeErr) {
      console.warn("Unable to decode via decodeAudioData, attempting raw 16-bit PCM fallback parsing...", decodeErr);
      try {
        // Fallback: Parse raw 16-bit signed little-endian PCM (Gemini TTS outputs raw PCM at 24000 Hz)
        const sampleRate = 24000;
        const numSamples = Math.floor(bytes.length / 2);
        if (numSamples > 0) {
          audioBuffer = this.ctx.createBuffer(1, numSamples, sampleRate);
          const channelData = audioBuffer.getChannelData(0);
          const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          for (let i = 0; i < numSamples; i++) {
            const intSample = dataView.getInt16(i * 2, true);
            channelData[i] = intSample / 32768.0;
          }
        }
      } catch (pcmErr) {
        console.error("Raw PCM fallback parsing also failed:", pcmErr);
      }
    }

    if (!audioBuffer) {
      console.warn("AudioBuffer could not be created from the data. Falling back to simple delay.");
      // Fallback: just wait matching typical speech length
      await this.playIntroBeep();
      await new Promise(resolve => setTimeout(resolve, 3000));
      await this.playOutroBeep();
      return;
    }

    try {
      // Play Quindar Intro first
      await this.playIntroBeep();

      // Raise radio static volume during speech
      this.startStatic(0.04);
      await new Promise(resolve => setTimeout(resolve, 300)); // Brief pause after beep

      const source = this.ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Create a specific VHF Radio Bandpass filter to make the speech sound like actual radio
      const radioFilter = this.ctx.createBiquadFilter();
      radioFilter.type = "bandpass";
      radioFilter.frequency.setValueAtTime(1200, this.ctx.currentTime);
      radioFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

      // Add a slight overdrive distortion for extra radio texture
      const waveShaper = this.ctx.createWaveShaper();
      waveShaper.curve = this.makeDistortionCurve(15);
      waveShaper.oversample = "4x";

      const speechGain = this.ctx.createGain();
      speechGain.gain.setValueAtTime(1.4, this.ctx.currentTime); // Boost filtered audio

      source.connect(radioFilter);
      radioFilter.connect(waveShaper);
      waveShaper.connect(speechGain);
      speechGain.connect(this.ctx.destination);

      source.start();

      // Wait for audio to finish playing
      await new Promise<void>((resolve) => {
        source.onended = () => {
          resolve();
        };
      });

      // Brief post-speech static duration
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Play Quindar Outro Beep
      await this.playOutroBeep();
      
      // Stop/dim background static
      this.stopStatic(0.8);

    } catch (e) {
      console.error("Error playing astronaut audio buffer:", e);
      // Fallback: just wait matching typical speech length
      await this.playIntroBeep();
      await new Promise(resolve => setTimeout(resolve, 3000));
      await this.playOutroBeep();
    }
  }

  private makeDistortionCurve(amount: number) {
    const k = typeof amount === "number" ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }
}

export const spaceAudio = new SpaceAudioEngine();
