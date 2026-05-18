import rawGameAssetManifest from "../public/game-assets.json";

export type FaceCardColor = "red" | "black";
export type FaceCardRank = "jack" | "queen" | "king";

type PreloadAsset = {
  href: string;
  as: "image";
  type: string;
};

type GameAssetManifest = {
  faceCards: Record<FaceCardColor, Record<FaceCardRank, string>>;
  preload: PreloadAsset[];
  offline: string[];
};

const FACE_CARD_COLORS: FaceCardColor[] = ["red", "black"];
const FACE_CARD_RANKS: FaceCardRank[] = ["jack", "queen", "king"];

export const GAME_ASSET_MANIFEST =
  rawGameAssetManifest as GameAssetManifest;

export const FACE_CARD_ART_SRC = GAME_ASSET_MANIFEST.faceCards;

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
