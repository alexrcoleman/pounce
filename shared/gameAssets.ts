import appleTouchIconImage from "../public/apple-touch-icon.png";
import cardBackImage from "../public/card-back.webp";
import faviconImage from "../public/favicon.png";
import feltTileImage from "../public/felt-tile.webp";
import jackBlackImage from "../public/card-faces/jack-black.webp";
import jackRedImage from "../public/card-faces/jack-red.webp";
import kingBlackImage from "../public/card-faces/king-black.webp";
import kingRedImage from "../public/card-faces/king-red.webp";
import notebookImage from "../public/notebook.webp";
import queenBlackImage from "../public/card-faces/queen-black.webp";
import queenRedImage from "../public/card-faces/queen-red.webp";
import singleDayFontSrc from "../public/fonts/single-day-korean-400-normal.woff2";
import tableWoodTileImage from "../public/table-wood-tile.webp";
import { WAV_AUDIO_ASSETS } from "./sfxAssets";

export type FaceCardColor = "red" | "black";
export type FaceCardRank = "jack" | "queen" | "king";

type PreloadAsset = {
  href: string;
  as: "audio" | "font" | "image";
  type: string;
  crossOrigin?: string;
};

type GameAssetManifest = {
  faceCards: Record<FaceCardColor, Record<FaceCardRank, string>>;
  preload: PreloadAsset[];
  prefetch: PreloadAsset[];
  offline: string[];
};

const FACE_CARD_COLORS: FaceCardColor[] = ["red", "black"];
const FACE_CARD_RANKS: FaceCardRank[] = ["jack", "queen", "king"];
const SINGLE_DAY_FONT_SRC = singleDayFontSrc;

type ImportedImage = {
  src: string;
};

export function cssUrl(url: string): string {
  return `url("${url.replace(/"/g, '\\"')}")`;
}

function imageSrc(image: ImportedImage): string {
  return image.src;
}

export const APPLE_TOUCH_ICON_SRC = imageSrc(appleTouchIconImage);
export const CARD_BACK_SRC = imageSrc(cardBackImage);
export const FAVICON_SRC = imageSrc(faviconImage);
export const FELT_TILE_SRC = imageSrc(feltTileImage);
export const NOTEBOOK_SRC = imageSrc(notebookImage);
export const PWA_ICON_192_SRC = "/pwa-icon-192.png";
export const PWA_ICON_512_SRC = "/pwa-icon-512.png";
export const TABLE_WOOD_TILE_SRC = imageSrc(tableWoodTileImage);

export const ASSET_STYLES = `
@font-face {
  font-family: "Single Day";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: ${cssUrl(SINGLE_DAY_FONT_SRC)} format("woff2");
}

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
    jack: imageSrc(jackRedImage),
    queen: imageSrc(queenRedImage),
    king: imageSrc(kingRedImage),
  },
  black: {
    jack: imageSrc(jackBlackImage),
    queen: imageSrc(queenBlackImage),
    king: imageSrc(kingBlackImage),
  },
};

export const GAME_ASSET_MANIFEST: GameAssetManifest = {
  faceCards: FACE_CARD_ART_SRC,
  preload: [
    {
      href: CARD_BACK_SRC,
      as: "image",
      type: "image/webp",
    },
    {
      href: TABLE_WOOD_TILE_SRC,
      as: "image",
      type: "image/webp",
    },
    {
      href: FELT_TILE_SRC,
      as: "image",
      type: "image/webp",
    },
    {
      href: NOTEBOOK_SRC,
      as: "image",
      type: "image/webp",
    },
    {
      href: SINGLE_DAY_FONT_SRC,
      as: "font",
      type: "font/woff2",
      crossOrigin: "anonymous",
    },
  ],
  prefetch: WAV_AUDIO_ASSETS.map((src) => ({ href: src, as: "audio", type: "audio/wav", })),
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

export const HEAD_PREFETCH_ASSETS: PreloadAsset[] =
  GAME_ASSET_MANIFEST.prefetch;

export const OFFLINE_STATIC_ASSETS = [
  "/game-assets.json",
  ...GAME_ASSET_MANIFEST.offline,
  ...HEAD_PRELOAD_ASSETS.map((asset) => asset.href),
  ...HEAD_PREFETCH_ASSETS.map((asset) => asset.href),
];
