import type { Move } from "../shared/MoveHandler";
import type { RoomAction } from "../shared/SocketTypes";
import {
  MOVE_STACK_IN_HAND_SRC,
  PICK_UP_DECK_SFX_SRC,
  PLACE_CARD_2_SFX_SRC,
  PLACE_CARD_3_SFX_SRC,
  PLACE_CARD_SFX_SRC,
  THREE_CARD_FLIP_SFX_SRC,
  MOVE_CARD_IN_HAND_SRC,
  THREE_CARD_FLIP_2_SRC,
} from "../shared/sfxAssets";

type SoundEffect =
  | "place_card"
  | "place_card_2"
  | "place_card_3"
  | "three_card_flip"
  | "three_card_flip_2"
  | "move_stack_in_hand"
  | "move_card_in_hand"
  | "pick_up_deck";
type PlayRoomActionSoundOptions = {
  activePlayerIndex?: number | null;
};

const SOUND_SOURCES: Record<SoundEffect, string> = {
  place_card: PLACE_CARD_SFX_SRC,
  place_card_2: PLACE_CARD_2_SFX_SRC,
  place_card_3: PLACE_CARD_3_SFX_SRC,
  three_card_flip: THREE_CARD_FLIP_SFX_SRC,
  three_card_flip_2: THREE_CARD_FLIP_2_SRC,
  move_stack_in_hand: MOVE_STACK_IN_HAND_SRC,
  move_card_in_hand: MOVE_CARD_IN_HAND_SRC,
  pick_up_deck: PICK_UP_DECK_SFX_SRC,
};

const BASE_SOUND_VOLUMES: Record<SoundEffect, number> = {
  place_card: 0.58,
  place_card_2: 0.58,
  place_card_3: 0.58,
  move_stack_in_hand: 0.58,
  move_card_in_hand: 0.5,
  three_card_flip: 0.15,
  three_card_flip_2: 0.15,
  pick_up_deck: 0.15,
};

const audioDataPromises = new Map<SoundEffect, Promise<ArrayBuffer>>();
const audioBufferPromises = new Map<SoundEffect, Promise<AudioBuffer>>();
const LOCAL_PLAYER_VOLUME_MULTIPLIER = 1.25;
const OTHER_PLAYER_VOLUME_MULTIPLIER = 0.72;
const CENTER_PLAY_VOLUME_MULTIPLIER = 1.25;
const SOLITAIRE_PLAY_VOLUME_MULTIPLIER = 0.5;
export const DEFAULT_SOUND_EFFECT_VOLUME_PERCENT = 0;
let audioContext: AudioContext | null = null;
let soundEffectVolumeMultiplier = DEFAULT_SOUND_EFFECT_VOLUME_PERCENT / 100;
let didRegisterAudioUnlockListeners = false;

export function setSoundEffectVolumePercent(volumePercent: number): void {
  soundEffectVolumeMultiplier = clampVolume(volumePercent / 100);

  if (soundEffectVolumeMultiplier > 0) {
    registerAudioUnlockListeners();
    runWhenIdle(preloadDecodedSoundEffects);
  }
}

export function preloadSoundEffects(): void {
  if (typeof window === "undefined" || typeof window.fetch !== "function") {
    return;
  }

  runWhenIdle(() => {
    (Object.keys(SOUND_SOURCES) as SoundEffect[]).forEach((soundEffect) => {
      void fetchSoundEffectData(soundEffect).catch(ignoreAudioLoadError);
    });

    if (soundEffectVolumeMultiplier > 0) {
      preloadDecodedSoundEffects();
    }
  });
}

export function playRoomActionSound(
  action: RoomAction,
  options: PlayRoomActionSoundOptions = {}
): void {
  if (action.type !== "move") {
    return;
  }

  const soundEffect = getMoveSoundEffect(action.move);
  if (!soundEffect) {
    return;
  }

  setTimeout(() => {
    const volume = getActionVolume(soundEffect, action, options);
    if (volume <= 0) {
      return;
    }

    playSoundEffect(soundEffect, {
      playbackRate: getPlaybackRate(),
      volume,
    });
  }, getActionDelay(soundEffect));
}
function getActionDelay(soundEffect: SoundEffect) {
  return soundEffect === "three_card_flip" ? 200 : 0;
}

function getMoveSoundEffect(move: Move): SoundEffect | null {
  if (move.type === "cycle") {
    return Math.random() < 0.5 ? "three_card_flip" : "three_card_flip_2";
  }

  if (move.type === "flip_deck") {
    return "pick_up_deck";
  }

  if (move.type === "s2s" && move.count > 1) {
    return "move_stack_in_hand";
  }
  if (move.type === "c2s" || move.type === "s2s") {
    return "move_card_in_hand";
  }
  if (move.type === "c2c") {
    return pickRandomSoundEffect([
      "place_card",
      "place_card_2",
      "place_card_3",
    ]);
  }

  return null;
}

function getActionVolume(
  soundEffect: SoundEffect,
  action: RoomAction,
  options: PlayRoomActionSoundOptions
): number {
  let volume = BASE_SOUND_VOLUMES[soundEffect];
  const isLocalPlayer =
    options.activePlayerIndex != null &&
    options.activePlayerIndex >= 0 &&
    action.playerIndex === options.activePlayerIndex;
  if (isLocalPlayer) {
    volume *= LOCAL_PLAYER_VOLUME_MULTIPLIER;
  } else {
    volume *= OTHER_PLAYER_VOLUME_MULTIPLIER;
  }
  if (action.move.type === "c2c") {
    volume *= CENTER_PLAY_VOLUME_MULTIPLIER;
  }
  if (action.move.type === "c2s" || action.move.type === "s2s") {
    volume *= SOLITAIRE_PLAY_VOLUME_MULTIPLIER;
  }

  if (isDeckAdvanceSound(soundEffect) && !isLocalPlayer) {
    volume *= 0.5;
  }

  return clampVolume(volume * soundEffectVolumeMultiplier);
}

function pickRandomSoundEffect<T extends SoundEffect>(
  soundEffects: readonly T[]
): T {
  return soundEffects[Math.floor(Math.random() * soundEffects.length)];
}

function isDeckAdvanceSound(soundEffect: SoundEffect): boolean {
  return (
    soundEffect.includes("three_card_flip") || soundEffect === "pick_up_deck"
  );
}

function getPlaybackRate(): number {
  const maxVariance = 0.1;
  return 1 + (Math.random() - 0.5) * 2 * maxVariance;
}

function playSoundEffect(
  soundEffect: SoundEffect,
  options: { playbackRate: number; volume: number }
): void {
  if (typeof window === "undefined") {
    return;
  }

  void playWebAudioSoundEffect(soundEffect, options).catch(ignoreAudioLoadError);
}

async function playWebAudioSoundEffect(
  soundEffect: SoundEffect,
  options: { playbackRate: number; volume: number }
): Promise<void> {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const resumePromise =
    context.state === "suspended"
      ? context.resume().catch(ignoreAudioLoadError)
      : Promise.resolve();
  const buffer = await loadAudioBuffer(soundEffect);
  await resumePromise;

  if (context.state === "suspended") {
    registerAudioUnlockListeners();
    return;
  }

  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.playbackRate.setValueAtTime(
    options.playbackRate,
    context.currentTime
  );
  gain.gain.setValueAtTime(options.volume, context.currentTime);
  source.connect(gain);
  gain.connect(context.destination);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
  source.start();
}

function preloadDecodedSoundEffects(): void {
  (Object.keys(SOUND_SOURCES) as SoundEffect[]).forEach((soundEffect) => {
    void loadAudioBuffer(soundEffect).catch(ignoreAudioLoadError);
  });
}

function fetchSoundEffectData(soundEffect: SoundEffect): Promise<ArrayBuffer> {
  const existingPromise = audioDataPromises.get(soundEffect);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = fetch(SOUND_SOURCES[soundEffect])
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load sound effect: ${soundEffect}`);
      }

      return response.arrayBuffer();
    })
    .catch((error) => {
      audioDataPromises.delete(soundEffect);
      throw error;
    });
  audioDataPromises.set(soundEffect, promise);
  return promise;
}

function loadAudioBuffer(soundEffect: SoundEffect): Promise<AudioBuffer> {
  const existingPromise = audioBufferPromises.get(soundEffect);
  if (existingPromise) {
    return existingPromise;
  }

  const context = getAudioContext();
  if (!context) {
    return Promise.reject(new Error("Web Audio is unavailable."));
  }

  const promise = fetchSoundEffectData(soundEffect)
    .then((audioData) => decodeAudioData(context, audioData.slice(0)))
    .catch((error) => {
      audioBufferPromises.delete(soundEffect);
      throw error;
    });
  audioBufferPromises.set(soundEffect, promise);
  return promise;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (audioContext && audioContext.state !== "closed") {
    return audioContext;
  }

  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
  if (!AudioContextConstructor) {
    return null;
  }

  audioContext = new AudioContextConstructor();
  return audioContext;
}

function decodeAudioData(
  context: AudioContext,
  audioData: ArrayBuffer
): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const decodePromise = context.decodeAudioData(
      audioData,
      resolve,
      reject
    );
    if (decodePromise) {
      decodePromise.then(resolve, reject);
    }
  });
}

function registerAudioUnlockListeners(): void {
  if (typeof window === "undefined" || didRegisterAudioUnlockListeners) {
    return;
  }

  didRegisterAudioUnlockListeners = true;
  const options = { passive: true };
  AUDIO_UNLOCK_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, unlockAudioPlayback, options);
  });
}

const AUDIO_UNLOCK_EVENTS = [
  "pointerdown",
  "touchstart",
  "mousedown",
  "keydown",
] as const;

function unlockAudioPlayback(): void {
  if (soundEffectVolumeMultiplier <= 0) {
    return;
  }

  const context = getAudioContext();
  if (!context) {
    removeAudioUnlockListeners();
    return;
  }

  const resumePromise =
    context.state === "suspended"
      ? context.resume().catch(ignoreAudioLoadError)
      : Promise.resolve();
  void resumePromise.then(() => {
    preloadDecodedSoundEffects();
    if (context.state === "running") {
      removeAudioUnlockListeners();
    }
  });
}

function removeAudioUnlockListeners(): void {
  if (typeof window === "undefined" || !didRegisterAudioUnlockListeners) {
    return;
  }

  didRegisterAudioUnlockListeners = false;
  AUDIO_UNLOCK_EVENTS.forEach((eventName) => {
    window.removeEventListener(eventName, unlockAudioPlayback);
  });
}

function ignoreAudioLoadError(): void {
  // Audio is best-effort; unsupported autoplay or decode failures should not
  // affect gameplay.
}

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

function runWhenIdle(callback: () => void): void {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(callback, { timeout: 3000 });
    return;
  }

  window.setTimeout(callback, 1000);
}
