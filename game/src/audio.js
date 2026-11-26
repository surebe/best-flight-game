// Procedural sound, no audio files: an engine hum whose pitch follows the
// throttle, a chime through a ring, and a low thud for a gear strike. Built
// from oscillators when the pilot first touches a key, silent until then.

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;

  function ensure() {
    if (context) return true;
    try {
      context = new (window.AudioContext || window.webkitAudioContext)();
      engineOsc = context.createOscillator();
      engineGain = context.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      engineGain.gain.value = 0;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter).connect(engineGain).connect(context.destination);
      engineOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, seconds, type, volume, when = 0) {
    if (!ensure()) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, context.currentTime + when);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + when + seconds);
    osc.connect(gain).connect(context.destination);
    osc.start(context.currentTime + when);
    osc.stop(context.currentTime + when + seconds);
  }

  return {
    /** Call from any key handler: browsers unlock audio on a gesture. */
    unlock() {
      ensure();
      if (context && context.state === 'suspended') context.resume();
    },
    /** Keep the engine note under the flight: throttle and speed set its voice. */
    engine(throttle, speed) {
      if (!context || !engineOsc) return;
      engineOsc.frequency.value = 46 + throttle * 58 + speed * 0.12;
      engineGain.gain.value = 0.015 + throttle * 0.03;
    },
    ring() {
      tone(880, 0.16, 'sine', 0.12);
      tone(1318, 0.22, 'sine', 0.1, 0.07);
    },
    strike() {
      tone(74, 0.3, 'square', 0.16);
    },
    fanfare() {
      tone(523, 0.18, 'triangle', 0.12);
      tone(659, 0.18, 'triangle', 0.12, 0.14);
      tone(784, 0.3, 'triangle', 0.12, 0.28);
    },
  };
}
