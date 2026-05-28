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
  move_stack_in_hand: .58,
  move_card_in_hand: .5,
  three_card_flip: 0.15,
  three_card_flip_2: 0.15,
  pick_up_deck: 0.15,
};

const audioPools = new Map<SoundEffect, HTMLAudioElement[]>();
const MAX_POOL_SIZE = 10;
const LOCAL_PLAYER_VOLUME_MULTIPLIER = 1.25;
const OTHER_PLAYER_VOLUME_MULTIPLIER = 0.72;
const CENTER_PLAY_VOLUME_MULTIPLIER = 1.25;
const SOLITAIRE_PLAY_VOLUME_MULTIPLIER = 0.5;
export const DEFAULT_SOUND_EFFECT_VOLUME_PERCENT = 100;
let soundEffectVolumeMultiplier = 1;

export function setSoundEffectVolumePercent(volumePercent: number): void {
  soundEffectVolumeMultiplier = clampVolume(volumePercent / 100);
}

export function preloadSoundEffects(): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return;
  }

  runWhenIdle(() => {
    (Object.keys(SOUND_SOURCES) as SoundEffect[]).forEach((soundEffect) => {
      const audio = getAudioElement(soundEffect);
      audio.load();
    });
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
    return Math.random() < .5 ? "three_card_flip" : "three_card_flip_2";
  }

  if (move.type === "flip_deck") {
    return "pick_up_deck";
  }

  if (move.type === 's2s' && move.count > 1) {
    return 'move_stack_in_hand';
  }
  if (move.type === 'c2s' || move.type === 's2s') {
    return 'move_card_in_hand';
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
  return soundEffect.includes("three_card_flip") || soundEffect === "pick_up_deck";
}

function getPlaybackRate(): number {
  const maxVariance = 0.1;
  return 1 + (Math.random() - 0.5) * 2 * maxVariance;
}

function playSoundEffect(
  soundEffect: SoundEffect,
  options: { playbackRate: number; volume: number; }
): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return;
  }

  const audio = getAudioElement(soundEffect);
  setPreservesPitch(audio, false);
  audio.playbackRate = options.playbackRate;
  audio.volume = options.volume;
  audio.currentTime = 0;
  void audio.play().catch(() => {
    // Browsers can reject play() before the user has interacted with the page.
  });
}

function getAudioElement(soundEffect: SoundEffect): HTMLAudioElement {
  const pool = audioPools.get(soundEffect) ?? [];
  audioPools.set(soundEffect, pool);

  const availableAudio = pool.find((audio) => audio.paused || audio.ended);
  if (availableAudio) {
    return availableAudio;
  }

  if (pool.length >= MAX_POOL_SIZE) {
    return getAudioClosestToEnd(pool);
  }

  const audio = new Audio(SOUND_SOURCES[soundEffect]);
  audio.preload = "auto";
  pool.push(audio);
  return audio;
}

function getAudioClosestToEnd(
  pool: readonly HTMLAudioElement[]
): HTMLAudioElement {
  return pool.reduce((closestAudio, audio) =>
    getPlaybackProgress(audio) > getPlaybackProgress(closestAudio)
      ? audio
      : closestAudio
  );
}

function getPlaybackProgress(audio: HTMLAudioElement): number {
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    return audio.currentTime / audio.duration;
  }

  return audio.currentTime;
}

function setPreservesPitch(audio: HTMLAudioElement, preservesPitch: boolean) {
  const pitchAudio = audio as HTMLAudioElement & {
    preservesPitch?: boolean;
    mozPreservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
  };
  pitchAudio.preservesPitch = preservesPitch;
  pitchAudio.mozPreservesPitch = preservesPitch;
  pitchAudio.webkitPreservesPitch = preservesPitch;
}

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

function runWhenIdle(callback: () => void): void {
  if (requestIdleCallback) {
    requestIdleCallback(callback, { timeout: 3000 });
    return;
  }

  window.setTimeout(callback, 1000);
}
