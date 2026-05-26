export const SITE_NAME = "Pounce Online";
export const DEFAULT_SEO_TITLE =
  "Pounce Online | Play Pounce (aka Nerts) with Friends or Bots";
export const DEFAULT_SEO_DESCRIPTION =
  "Play free, fast-paced Pounce online with friends or offline against bots. Pounce is a multiplayer solitaire card game also known as Nerts or Nertz.";
export const DEFAULT_SHARE_IMAGE_PATH = "/og-image-v6.png";
export const DEFAULT_SHARE_IMAGE_ALT =
  "Pounce Online invite with a pounce pile and solitaire piles on a green felt table.";

export function getSeoOrigin() {
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configuredOrigin) {
    return configuredOrigin;
  }

  return "http://localhost:3000";
}

export function absoluteUrl(origin: string, path: string) {
  const normalizedOrigin = normalizeOrigin(origin) ?? getSeoOrigin();
  return new URL(path, `${normalizedOrigin}/`).toString();
}

export function normalizeRoomCode(roomId: string) {
  return roomId.trim().toUpperCase();
}

function normalizeOrigin(origin?: string) {
  const trimmedOrigin = origin?.trim();
  if (!trimmedOrigin) {
    return null;
  }

  return trimmedOrigin.replace(/\/+$/, "");
}
