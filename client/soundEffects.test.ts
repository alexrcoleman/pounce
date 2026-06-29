import assert from "node:assert/strict";

type FakeAudioContextState = "running" | "suspended" | "closed" | "interrupted";
type StoredListener = EventListenerOrEventListenerObject;

const originalWindow = (globalThis as { window?: unknown }).window;
const originalDocument = (globalThis as { document?: unknown }).document;
const originalFetch = (globalThis as { fetch?: unknown }).fetch;
const originalWavExtension = require.extensions[".wav"];

require.extensions[".wav"] = (module, filename) => {
  module.exports = filename;
};

async function main(): Promise<void> {
  await testGestureListenersStayRegisteredAfterUnlock();
  await testInterruptedContextDoesNotStartSilentSources();
  restoreGlobals();
}

async function testGestureListenersStayRegisteredAfterUnlock(): Promise<void> {
  const env = installFakeBrowser("suspended");
  const soundEffects = loadSoundEffectsModule();

  soundEffects.setSoundEffectVolumePercent(100);
  assert.equal(env.getWindowListenerCount("touchstart"), 1);

  env.nextResumeState = "running";
  env.dispatchWindowEvent("touchstart");
  await flushAsyncWork();

  assert.equal(env.contexts[0]?.resumeCalls, 1);
  assert.equal(env.getWindowListenerCount("touchstart"), 1);
}

async function testInterruptedContextDoesNotStartSilentSources(): Promise<void> {
  const env = installFakeBrowser("running");
  const soundEffects = loadSoundEffectsModule();

  soundEffects.setSoundEffectVolumePercent(100);
  env.dispatchWindowEvent("touchstart");
  await flushAsyncWork();

  const context = env.contexts[0];
  assert.ok(context);
  context.state = "interrupted";
  env.nextResumeState = "interrupted";

  soundEffects.playRoomActionSound({
    type: "move",
    actionId: "test-action",
    playerIndex: 0,
    move: { type: "c2c", source: { type: "pounce" }, dest: 0 },
    time: Date.now(),
    revision: 1,
  });
  await flushAsyncWork();

  assert.equal(context.resumeCalls, 1);
  assert.equal(env.sourceStartCount, 0);
  assert.equal(env.getWindowListenerCount("touchstart"), 1);
}

function installFakeBrowser(initialAudioState: FakeAudioContextState) {
  const windowListeners = new Map<string, Set<StoredListener>>();
  const documentListeners = new Map<string, Set<StoredListener>>();
  const contexts: FakeAudioContext[] = [];
  const env = {
    contexts,
    nextResumeState: "running" as FakeAudioContextState,
    sourceStartCount: 0,
    dispatchWindowEvent(eventName: string) {
      dispatchEvent(windowListeners, eventName);
    },
    getWindowListenerCount(eventName: string) {
      return windowListeners.get(eventName)?.size ?? 0;
    },
  };

  class TestAudioContext extends FakeAudioContext {
    constructor() {
      super(initialAudioState, env);
      contexts.push(this);
    }
  }

  const fakeWindow = {
    AudioContext: TestAudioContext,
    addEventListener(
      eventName: string,
      listener: StoredListener
    ): void {
      addListener(windowListeners, eventName, listener);
    },
    removeEventListener(
      eventName: string,
      listener: StoredListener
    ): void {
      removeListener(windowListeners, eventName, listener);
    },
    requestIdleCallback(): number {
      return 1;
    },
    setTimeout,
    fetch: fakeFetch,
  };
  const fakeDocument = {
    visibilityState: "visible",
    addEventListener(
      eventName: string,
      listener: StoredListener
    ): void {
      addListener(documentListeners, eventName, listener);
    },
    removeEventListener(
      eventName: string,
      listener: StoredListener
    ): void {
      removeListener(documentListeners, eventName, listener);
    },
  };

  (globalThis as { window?: unknown }).window = fakeWindow;
  (globalThis as { document?: unknown }).document = fakeDocument;
  (globalThis as { fetch?: unknown }).fetch = fakeFetch;

  return env;
}

class FakeAudioContext {
  currentTime = 0;
  resumeCalls = 0;
  private readonly listeners = new Map<string, Set<StoredListener>>();

  constructor(
    public state: FakeAudioContextState,
    private readonly env: {
      nextResumeState: FakeAudioContextState;
      sourceStartCount: number;
    }
  ) {}

  addEventListener(eventName: string, listener: StoredListener): void {
    addListener(this.listeners, eventName, listener);
  }

  removeEventListener(eventName: string, listener: StoredListener): void {
    removeListener(this.listeners, eventName, listener);
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = this.env.nextResumeState;
    dispatchEvent(this.listeners, "statechange");
  }

  decodeAudioData(
    _audioData: ArrayBuffer,
    successCallback?: DecodeSuccessCallback | null
  ): Promise<AudioBuffer> {
    const buffer = {} as AudioBuffer;
    successCallback?.(buffer);
    return Promise.resolve(buffer);
  }

  createBufferSource(): AudioBufferSourceNode {
    const env = this.env;
    return {
      buffer: null,
      playbackRate: { setValueAtTime() {} },
      connect() {},
      disconnect() {},
      start() {
        env.sourceStartCount += 1;
      },
    } as unknown as AudioBufferSourceNode;
  }

  createGain(): GainNode {
    return {
      gain: { setValueAtTime() {} },
      connect() {},
      disconnect() {},
    } as unknown as GainNode;
  }
}

function addListener(
  listeners: Map<string, Set<StoredListener>>,
  eventName: string,
  listener: StoredListener
): void {
  const existing = listeners.get(eventName);
  if (existing) {
    existing.add(listener);
    return;
  }

  listeners.set(eventName, new Set([listener]));
}

function removeListener(
  listeners: Map<string, Set<StoredListener>>,
  eventName: string,
  listener: StoredListener
): void {
  listeners.get(eventName)?.delete(listener);
}

function dispatchEvent(
  listeners: Map<string, Set<StoredListener>>,
  eventName: string
): void {
  listeners.get(eventName)?.forEach((listener) => {
    if (typeof listener === "function") {
      listener({ type: eventName } as Event);
      return;
    }

    listener.handleEvent({ type: eventName } as Event);
  });
}

function fakeFetch(): Promise<{
  ok: true;
  arrayBuffer: () => Promise<ArrayBuffer>;
}> {
  return Promise.resolve({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  });
}

function loadSoundEffectsModule(): typeof import("./soundEffects") {
  const modulePath = require.resolve("./soundEffects");
  delete require.cache[modulePath];
  return require("./soundEffects") as typeof import("./soundEffects");
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function restoreGlobals(): void {
  restoreGlobal("window", originalWindow);
  restoreGlobal("document", originalDocument);
  restoreGlobal("fetch", originalFetch);
  restoreRequireExtension(".wav", originalWavExtension);
}

function restoreGlobal(name: "window" | "document" | "fetch", value: unknown) {
  if (value === undefined) {
    delete (globalThis as Record<string, unknown>)[name];
    return;
  }

  (globalThis as Record<string, unknown>)[name] = value;
}

function restoreRequireExtension(
  extension: string,
  value: NodeJS.RequireExtensions[string] | undefined
): void {
  if (value) {
    require.extensions[extension] = value;
    return;
  }

  delete require.extensions[extension];
}

void main().catch((error) => {
  restoreGlobals();
  console.error(error);
  process.exitCode = 1;
});
