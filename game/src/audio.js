// Synthesized sound for Emberfall Arena: every effect and the ambient music loop are made
// with WebAudio oscillators and noise, so the game ships no audio files and stays offline.
// Nothing sounds until unlock() runs from a user gesture (a browser rule); in screenshot
// mode main never unlocks, so staged scenes stay silent. Every call is guarded: a browser
// without WebAudio simply plays a quiet game.

export function createAudio() {
  let context = null;
  let master = null;
  let musicNodes = null;

  function unlock() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return;
    }
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      context = new AudioCtor();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
      startMusic();
    } catch {
      context = null;
      master = null;
    }
  }

  function tone(freqFrom, freqTo, seconds, type, volume, delay = 0) {
    if (context === null || master === null) return;
    try {
      const start = context.currentTime + delay;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqFrom, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, freqTo), start + seconds);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + seconds + 0.02);
    } catch { /* a failed blip never stops the game */ }
  }

  function noise(seconds, volume, delay = 0) {
    if (context === null || master === null) return;
    try {
      const start = context.currentTime + delay;
      const length = Math.max(1, Math.floor(context.sampleRate * seconds));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(start);
    } catch { /* as above */ }
  }

  function startMusic() {
    if (context === null || master === null || musicNodes !== null) return;
    try {
      // A slow two-oscillator pad in A minor, detuned, breathing through an LFO: the arena's
      // night air. Kept far under the effects so it reads as atmosphere, not a tune to grade.
      const gain = context.createGain();
      gain.gain.value = 0.045;
      const oscA = context.createOscillator();
      oscA.type = 'triangle';
      oscA.frequency.value = 110;
      const oscB = context.createOscillator();
      oscB.type = 'sine';
      oscB.frequency.value = 164.81;
      const lfo = context.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = context.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      oscA.connect(gain);
      oscB.connect(gain);
      gain.connect(master);
      oscA.start();
      oscB.start();
      lfo.start();
      musicNodes = { gain, oscA, oscB, lfo };
    } catch {
      musicNodes = null;
    }
  }

  return {
    unlock,
    shoot() { tone(720, 240, 0.07, 'square', 0.05); },
    enemyHit() { tone(300, 180, 0.05, 'square', 0.06); },
    explosion() { noise(0.22, 0.22); tone(160, 48, 0.22, 'sawtooth', 0.12); },
    bigExplosion() { noise(0.5, 0.3); tone(120, 30, 0.5, 'sawtooth', 0.2); tone(64, 28, 0.6, 'sine', 0.24, 0.05); },
    playerHurt() { tone(220, 60, 0.28, 'sawtooth', 0.2); noise(0.18, 0.16); },
    dash() { noise(0.12, 0.08); tone(240, 620, 0.12, 'sine', 0.06); },
    pickup() { tone(520, 780, 0.09, 'sine', 0.12); tone(780, 1040, 0.12, 'sine', 0.1, 0.07); },
    waveStart() { tone(392, 392, 0.1, 'triangle', 0.12); tone(523, 523, 0.1, 'triangle', 0.12, 0.1); tone(659, 659, 0.16, 'triangle', 0.12, 0.2); },
    bossWarn() { tone(98, 98, 0.3, 'sawtooth', 0.18); tone(98, 92, 0.34, 'sawtooth', 0.18, 0.32); },
    gameOver() { tone(392, 392, 0.18, 'triangle', 0.14); tone(330, 330, 0.18, 'triangle', 0.14, 0.18); tone(262, 196, 0.4, 'triangle', 0.14, 0.36); },
    shieldBreak() { tone(880, 220, 0.16, 'square', 0.12); },
  };
}
