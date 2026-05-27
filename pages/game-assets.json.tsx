import type { GetServerSideProps } from "next";

import { GAME_ASSET_MANIFEST } from "../shared/gameAssets";

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.end(JSON.stringify(GAME_ASSET_MANIFEST));

  return {
    props: {},
  };
};

export default function GameAssetsManifest() {
  return null;
}
