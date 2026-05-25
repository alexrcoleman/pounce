import appleTouchIcon from "../public/apple-touch-icon.png";
import cardBack from "../public/card-back.png";
import feltTile from "../public/felt-tile.png";
import favicon from "../public/favicon.png";
import jackBlack from "../public/card-faces/jack-black.webp";
import jackRed from "../public/card-faces/jack-red.webp";
import kingBlack from "../public/card-faces/king-black.webp";
import kingRed from "../public/card-faces/king-red.webp";
import notebook from "../public/notebook.png";
import pwaIcon192 from "../public/pwa-icon-192.png";
import pwaIcon512 from "../public/pwa-icon-512.png";
import queenBlack from "../public/card-faces/queen-black.webp";
import queenRed from "../public/card-faces/queen-red.webp";
import tableWoodTile from "../public/table-wood-tile.png";
import type { StaticImageData } from "next/image";
import { TABLE_TAN_THEME_COLOR } from "./themeColors";

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

function assetSrc(asset: StaticImageData): string {
  return asset.src;
}

export function cssUrl(url: string): string {
  return `url("${url.replace(/"/g, '\\"')}")`;
}

export const APPLE_TOUCH_ICON_SRC = assetSrc(appleTouchIcon);
export const CARD_BACK_SRC = assetSrc(cardBack);
export const FAVICON_SRC = assetSrc(favicon);
export const FELT_TILE_SRC = assetSrc(feltTile);
export const NOTEBOOK_SRC = assetSrc(notebook);
export const PWA_ICON_192_SRC = assetSrc(pwaIcon192);
export const PWA_ICON_512_SRC = assetSrc(pwaIcon512);
export const TABLE_WOOD_TILE_SRC = assetSrc(tableWoodTile);

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
    jack: assetSrc(jackRed),
    queen: assetSrc(queenRed),
    king: assetSrc(kingRed),
  },
  black: {
    jack: assetSrc(jackBlack),
    queen: assetSrc(queenBlack),
    king: assetSrc(kingBlack),
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

export const WEB_APP_MANIFEST = {
  name: "Pounce Online",
  short_name: "Pounce",
  description: "Play Pounce online with friends or offline against AI.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: TABLE_TAN_THEME_COLOR,
  theme_color: TABLE_TAN_THEME_COLOR,
  icons: [
    {
      src: PWA_ICON_192_SRC,
      sizes: "192x192",
      type: "image/png",
      purpose: "any maskable",
    },
    {
      src: PWA_ICON_512_SRC,
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable",
    },
  ],
  shortcuts: [
    {
      name: "Play offline",
      short_name: "Offline",
      url: "/offline",
    },
  ],
};
