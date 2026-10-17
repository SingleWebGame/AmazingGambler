export type GameSound =
  | "ui"
  | "coin"
  | "undo"
  | "predict"
  | "reward"
  | "purchase"
  | "continue"
  | "chest"
  | "success"
  | "miss"
  | "toggle";

const SOUND_ENABLED_KEY = "amazing-gambler-sound-enabled";

const melodies: Record<GameSound, { notes: number[]; wave: OscillatorType; duration: number; volume: number }> = {
  ui: { notes: [660], wave: "sine", duration: 0.075, volume: 0.045 },
  coin: { notes: [880, 1175], wave: "sine", duration: 0.09, volume: 0.065 },
  undo: { notes: [620, 440], wave: "triangle", duration: 0.075, volume: 0.045 },
  predict: { notes: [392, 523, 659], wave: "sine", duration: 0.16, volume: 0.055 },
  reward: { notes: [659, 880, 1175], wave: "sine", duration: 0.11, volume: 0.06 },
  purchase: { notes: [523, 659, 784], wave: "triangle", duration: 0.095, volume: 0.05 },
  continue: { notes: [523, 659], wave: "sine", duration: 0.11, volume: 0.045 },
  chest: { notes: [523, 659, 784, 1047], wave: "sine", duration: 0.16, volume: 0.065 },
  success: { notes: [523, 659, 784, 1047], wave: "triangle", duration: 0.13, volume: 0.065 },
  miss: { notes: [440, 392, 330], wave: "sine", duration: 0.13, volume: 0.045 },
  toggle: { notes: [784, 1047], wave: "sine", duration: 0.09, volume: 0.05 },
};

let audioContext: AudioContext | null = null;
let soundEnabled = true;
let preferenceLoaded = false;

function isSoundEnabled() {
  if (preferenceLoaded || typeof window === "undefined") return soundEnabled;
  preferenceLoaded = true;
  try {
    soundEnabled = window.localStorage.getItem(SOUND_ENABLED_KEY) !== "false";
  } catch (error) {
    console.error("Unable to read the sound preference.", error);
  }
  return soundEnabled;
}

export function loadSoundEnabled() {
  return isSoundEnabled();
}

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  preferenceLoaded = true;
  try {
    window.localStorage.setItem(SOUND_ENABLED_KEY, String(enabled));
  } catch (error) {
    console.error("Unable to save the sound preference.", error);
  }
}

function getAudioContext() {
  if (audioContext) return audioContext;
  const Context = window.AudioContext;
  audioContext = new Context();
  return audioContext;
}

function playMelody(context: AudioContext, sound: GameSound) {
  const { notes, wave, duration, volume } = melodies[sound];
  const start = context.currentTime + 0.005;
  notes.forEach((frequency, index) => {
    const noteStart = start + index * duration * 0.72;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency * (0.96 + Math.random() * 0.08), noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(volume, noteStart + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + duration + 0.01);
  });
}

export function playGameSound(sound: GameSound) {
  if (!isSoundEnabled() || typeof window === "undefined" || !window.AudioContext) return;
  try {
    const context = getAudioContext();
    if (context.state === "running") {
      playMelody(context, sound);
      return;
    }
    void context.resume().then(() => playMelody(context, sound)).catch((error: unknown) => {
      console.error("Unable to play the game sound.", error);
    });
  } catch (error) {
    console.error("Unable to play the game sound.", error);
  }
}
