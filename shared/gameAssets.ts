export type FaceCardColor = "red" | "black";
export type FaceCardRank = "jack" | "queen" | "king";

type PreloadAsset = {
  href: string;
  as: "font" | "image";
  type: string;
  crossOrigin?: string;
};

type GameAssetManifest = {
  faceCards: Record<FaceCardColor, Record<FaceCardRank, string>>;
  preload: PreloadAsset[];
  offline: string[];
};

const FACE_CARD_COLORS: FaceCardColor[] = ["red", "black"];
const FACE_CARD_RANKS: FaceCardRank[] = ["jack", "queen", "king"];
const SINGLE_DAY_FONT_SRC = "/fonts/single-day-korean-400-normal.woff2";

export function cssUrl(url: string): string {
  return `url("${url.replace(/"/g, '\\"')}")`;
}

export const APPLE_TOUCH_ICON_SRC = "/apple-touch-icon.png";
export const CARD_BACK_SRC = "/card-back.png";
export const FAVICON_SRC = "/favicon.png";
export const FELT_TILE_SRC = "/felt-tile.png";
export const NOTEBOOK_SRC = "/notebook.png";
export const PWA_ICON_192_SRC = "/pwa-icon-192.png";
export const PWA_ICON_512_SRC = "/pwa-icon-512.png";
export const TABLE_WOOD_TILE_SRC = "/table-wood-tile.png";

export const ASSET_CSS_VARIABLES = `
:root {
  --pounce-card-back-image: ${cssUrl(CARD_BACK_SRC)};
  --pounce-felt-tile-image: ${cssUrl(FELT_TILE_SRC)};
  --pounce-notebook-image: ${cssUrl(NOTEBOOK_SRC)};
  --pounce-table-wood-tile-image: ${cssUrl(TABLE_WOOD_TILE_SRC)};
}
`;

export const FACE_CARD_ART_SRC: Record<
  FaceCardColor,
  Record<FaceCardRank, string>
> = {
  red: {
    jack: "/card-faces/jack-red.webp",
    queen: "/card-faces/queen-red.webp",
    king: "/card-faces/king-red.webp",
  },
  black: {
    jack: "/card-faces/jack-black.webp",
    queen: "/card-faces/queen-black.webp",
    king: "/card-faces/king-black.webp",
  },
};

export const GAME_ASSET_MANIFEST: GameAssetManifest = {
  faceCards: FACE_CARD_ART_SRC,
  preload: [
    {
      href: CARD_BACK_SRC,
      as: "image",
      type: "image/png",
    },
    {
      href: TABLE_WOOD_TILE_SRC,
      as: "image",
      type: "image/png",
    },
    {
      href: FELT_TILE_SRC,
      as: "image",
      type: "image/png",
    },
    {
      href: NOTEBOOK_SRC,
      as: "image",
      type: "image/png",
    },
    {
      href: SINGLE_DAY_FONT_SRC,
      as: "font",
      type: "font/woff2",
      crossOrigin: "anonymous",
    },
  ],
  offline: [
    "/manifest.webmanifest",
    FAVICON_SRC,
    PWA_ICON_192_SRC,
    PWA_ICON_512_SRC,
    APPLE_TOUCH_ICON_SRC,
  ],
};

export const HEAD_PRELOAD_ASSETS: PreloadAsset[] = [
  ...GAME_ASSET_MANIFEST.preload,
  ...FACE_CARD_COLORS.reduce<PreloadAsset[]>((assets, color) => {
    FACE_CARD_RANKS.forEach((rank) => {
      assets.push({
        href: FACE_CARD_ART_SRC[color][rank],
        as: "image",
        type: "image/webp",
      });
    });
    return assets;
  }, []),
];

export const OFFLINE_STATIC_ASSETS = [
  "/game-assets.json",
  ...GAME_ASSET_MANIFEST.offline,
  ...HEAD_PRELOAD_ASSETS.map((asset) => asset.href),
];
