import assert from "node:assert/strict";

import {
  getOrCreatePlayerSessionId,
  PLAYER_SESSION_STORAGE_KEY,
} from "./PlayerSession";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

{
  const persistentStorage = new MemoryStorage();
  const legacyStorage = new MemoryStorage();
  persistentStorage.setItem(PLAYER_SESSION_STORAGE_KEY, "persistent-id");
  legacyStorage.setItem(PLAYER_SESSION_STORAGE_KEY, "legacy-id");

  assert.equal(
    getOrCreatePlayerSessionId(
      persistentStorage,
      legacyStorage,
      () => "new-id"
    ),
    "persistent-id"
  );
}

{
  const persistentStorage = new MemoryStorage();
  const legacyStorage = new MemoryStorage();
  legacyStorage.setItem(PLAYER_SESSION_STORAGE_KEY, "legacy-id");

  assert.equal(
    getOrCreatePlayerSessionId(
      persistentStorage,
      legacyStorage,
      () => "new-id"
    ),
    "legacy-id"
  );
  assert.equal(
    persistentStorage.getItem(PLAYER_SESSION_STORAGE_KEY),
    "legacy-id"
  );
}

{
  const persistentStorage = new MemoryStorage();
  const legacyStorage = new MemoryStorage();
  let createCount = 0;
  const createId = () => {
    createCount += 1;
    return "new-id";
  };

  assert.equal(
    getOrCreatePlayerSessionId(
      persistentStorage,
      legacyStorage,
      createId
    ),
    "new-id"
  );
  assert.equal(
    getOrCreatePlayerSessionId(
      persistentStorage,
      legacyStorage,
      createId
    ),
    "new-id"
  );
  assert.equal(createCount, 1);
}

{
  const blockedPersistentStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  const legacyStorage = new MemoryStorage();

  assert.equal(
    getOrCreatePlayerSessionId(
      blockedPersistentStorage,
      legacyStorage,
      () => "fallback-id"
    ),
    "fallback-id"
  );
  assert.equal(
    legacyStorage.getItem(PLAYER_SESSION_STORAGE_KEY),
    "fallback-id"
  );
}
