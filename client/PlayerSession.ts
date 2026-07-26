export const PLAYER_SESSION_STORAGE_KEY = "pounce::playerSessionId";

type PlayerSessionStorage = Pick<Storage, "getItem" | "setItem">;

export function getOrCreatePlayerSessionId(
  persistentStorage: PlayerSessionStorage,
  legacySessionStorage: PlayerSessionStorage,
  createId = createPlayerSessionId
): string {
  const persistentId = readStoredId(persistentStorage);
  if (persistentId) {
    return persistentId;
  }

  const legacyId = readStoredId(legacySessionStorage);
  const playerSessionId = legacyId ?? createId();
  const didPersist = writeStoredId(persistentStorage, playerSessionId);
  if (!didPersist && !legacyId) {
    writeStoredId(legacySessionStorage, playerSessionId);
  }
  return playerSessionId;
}

export function getOrCreateBrowserPlayerSessionId(): string {
  return getOrCreatePlayerSessionId(
    window.localStorage,
    window.sessionStorage
  );
}

function readStoredId(storage: PlayerSessionStorage): string | null {
  try {
    return storage.getItem(PLAYER_SESSION_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function writeStoredId(
  storage: PlayerSessionStorage,
  playerSessionId: string
): boolean {
  try {
    storage.setItem(PLAYER_SESSION_STORAGE_KEY, playerSessionId);
    return true;
  } catch {
    return false;
  }
}

function createPlayerSessionId(): string {
  return (
    window.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}
