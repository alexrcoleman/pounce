import { useEffect, useState } from "react";
import { makeAutoObservable } from "mobx";

import {
  DEFAULT_SOUND_EFFECT_VOLUME_PERCENT,
  setSoundEffectVolumePercent,
} from "./soundEffects";
import {
  normalizeDragInputModePreference,
  type DragInputModePreference,
} from "./dragInputMode";

export type SettingsPage = "main" | "room" | "appearance";

export type ClientSettingsStoreOptions = {
  dragInputMode?: DragInputModePreference;
  easyReadCards?: boolean;
  leftHandedMode?: boolean;
  scale?: number;
  showFramerate?: boolean;
  showNetworkStats?: boolean;
  soundEffectVolume?: number;
  useAnimations?: boolean;
};

const DRAG_INPUT_MODE_STORAGE_KEY = "pounce::drag-input-mode";
const EASY_READ_CARDS_STORAGE_KEY = "pounce::easy-read-cards";
const SHOW_FRAMERATE_STORAGE_KEY = "pounce::show-framerate";
const SHOW_NETWORK_STATS_STORAGE_KEY = "pounce::show-network-stats";
const SOUND_EFFECT_VOLUME_STORAGE_KEY = "pounce::sound-effect-volume";

export default class ClientSettingsStore {
  dragInputMode: DragInputModePreference = "auto";
  easyReadCards = true;
  isSettingsOpen = false;
  leftHandedMode = false;
  scale = 1;
  settingsPage: SettingsPage = "main";
  showFramerate = false;
  showNetworkStats = false;
  soundEffectVolume = DEFAULT_SOUND_EFFECT_VOLUME_PERCENT;
  useAnimations = true;

  private previousSoundEffectVolume = DEFAULT_SOUND_EFFECT_VOLUME_PERCENT || 100;

  constructor(options: ClientSettingsStoreOptions = {}) {
    this.dragInputMode = options.dragInputMode ?? this.dragInputMode;
    this.easyReadCards = options.easyReadCards ?? this.easyReadCards;
    this.leftHandedMode = options.leftHandedMode ?? this.leftHandedMode;
    this.scale = normalizeStoredNumber(
      options.scale ?? this.scale,
      this.scale,
      0.5,
      2
    );
    this.showFramerate = options.showFramerate ?? this.showFramerate;
    this.showNetworkStats = options.showNetworkStats ?? this.showNetworkStats;
    this.soundEffectVolume = normalizeStoredNumber(
      options.soundEffectVolume ?? this.soundEffectVolume,
      this.soundEffectVolume,
      0,
      100
    );
    this.useAnimations = options.useAnimations ?? this.useAnimations;
    this.previousSoundEffectVolume =
      this.soundEffectVolume > 0 ? this.soundEffectVolume : 100;

    makeAutoObservable(this, {}, { autoBind: true });
  }

  hydrateFromLocalStorage() {
    this.dragInputMode = readStoredDragInputMode(
      DRAG_INPUT_MODE_STORAGE_KEY,
      this.dragInputMode
    );
    this.easyReadCards = readStoredBoolean(
      EASY_READ_CARDS_STORAGE_KEY,
      this.easyReadCards
    );
    this.showFramerate = readStoredBoolean(
      SHOW_FRAMERATE_STORAGE_KEY,
      this.showFramerate
    );
    this.showNetworkStats = readStoredBoolean(
      SHOW_NETWORK_STATS_STORAGE_KEY,
      this.showNetworkStats
    );
    this.soundEffectVolume = readStoredNumber(
      SOUND_EFFECT_VOLUME_STORAGE_KEY,
      this.soundEffectVolume,
      0,
      100
    );
    if (this.soundEffectVolume > 0) {
      this.previousSoundEffectVolume = this.soundEffectVolume;
    }
    setSoundEffectVolumePercent(this.soundEffectVolume);
  }

  openSettings(page: SettingsPage = "main") {
    this.settingsPage = page;
    this.isSettingsOpen = true;
  }

  closeSettings() {
    this.isSettingsOpen = false;
    this.settingsPage = "main";
  }

  setSettingsPage(page: SettingsPage) {
    this.settingsPage = page;
  }

  setUseAnimations(useAnimations: boolean) {
    this.useAnimations = useAnimations;
  }

  setDragInputMode(dragInputMode: DragInputModePreference) {
    this.dragInputMode = dragInputMode;
    writeStoredValue(DRAG_INPUT_MODE_STORAGE_KEY, dragInputMode);
  }

  setLeftHandedMode(leftHandedMode: boolean) {
    this.leftHandedMode = leftHandedMode;
  }

  setEasyReadCards(easyReadCards: boolean) {
    this.easyReadCards = easyReadCards;
    writeStoredValue(EASY_READ_CARDS_STORAGE_KEY, String(easyReadCards));
  }

  setShowFramerate(showFramerate: boolean) {
    this.showFramerate = showFramerate;
    writeStoredValue(SHOW_FRAMERATE_STORAGE_KEY, String(showFramerate));
  }

  setShowNetworkStats(showNetworkStats: boolean) {
    this.showNetworkStats = showNetworkStats;
    writeStoredValue(SHOW_NETWORK_STATS_STORAGE_KEY, String(showNetworkStats));
  }

  setScale(scale: number) {
    this.scale = normalizeStoredNumber(scale, this.scale, 0.5, 2);
  }

  setSoundEffectVolume(soundEffectVolume: number) {
    const normalizedVolume = normalizeStoredNumber(
      soundEffectVolume,
      this.soundEffectVolume,
      0,
      100
    );
    this.soundEffectVolume = normalizedVolume;
    if (normalizedVolume > 0) {
      this.previousSoundEffectVolume = normalizedVolume;
    }
    writeStoredValue(SOUND_EFFECT_VOLUME_STORAGE_KEY, String(normalizedVolume));
    setSoundEffectVolumePercent(normalizedVolume);
  }

  toggleSoundEffectMute() {
    if (this.soundEffectVolume > 0) {
      this.setSoundEffectVolume(0);
      return;
    }

    this.setSoundEffectVolume(this.previousSoundEffectVolume || 100);
  }
}

export function useClientSettingsStore(
  options?: ClientSettingsStoreOptions
): ClientSettingsStore {
  const [settings] = useState(() => new ClientSettingsStore(options));

  useEffect(() => {
    settings.hydrateFromLocalStorage();
  }, [settings]);

  return settings;
}

function readStoredBoolean(storageKey: string, fallback: boolean): boolean {
  if (typeof window === "undefined") {
    return fallback;
  }

  const storedValue = window.localStorage.getItem(storageKey);
  return storedValue == null ? fallback : storedValue === "true";
}

function readStoredDragInputMode(
  storageKey: string,
  fallback: DragInputModePreference
): DragInputModePreference {
  if (typeof window === "undefined") {
    return fallback;
  }

  return normalizeDragInputModePreference(
    window.localStorage.getItem(storageKey),
    fallback
  );
}

function readStoredNumber(
  storageKey: string,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof window === "undefined") {
    return fallback;
  }

  const storedValue = window.localStorage.getItem(storageKey);
  return storedValue == null
    ? fallback
    : normalizeStoredNumber(Number(storedValue), fallback, min, max);
}

function writeStoredValue(storageKey: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, value);
}

function normalizeStoredNumber(
  value: number,
  fallback: number,
  min: number,
  max: number
): number {
  const numericValue = Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, numericValue));
}
