import type { GetServerSideProps } from "next";

import { absoluteUrl, getSeoOrigin } from "../shared/seo";

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const origin = getSeoOrigin(req);
  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${absoluteUrl(origin, "/sitemap.xml")}`,
    "",
  ].join("\n");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.write(body);
  res.end();

  return { props: {} };
};

export default function RobotsTxtPage() {
  return null;
}
