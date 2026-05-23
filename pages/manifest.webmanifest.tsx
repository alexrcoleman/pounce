import type { GetServerSideProps } from "next";

import { WEB_APP_MANIFEST } from "../shared/gameAssets";

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.write(JSON.stringify(WEB_APP_MANIFEST));
  res.end();

  return { props: {} };
};

export default function WebManifestPage() {
  return null;
}
