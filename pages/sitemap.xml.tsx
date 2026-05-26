import type { GetServerSideProps } from "next";

import { absoluteUrl, getSeoOrigin } from "../shared/seo";

const SITEMAP_PATHS = ["/", "/how-to-play"];

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const origin = getSeoOrigin(req);
  const urls = SITEMAP_PATHS.map(
    (path) => `  <url><loc>${escapeXml(absoluteUrl(origin, path))}</loc></url>`
  ).join("\n");
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.write(body);
  res.end();

  return { props: {} };
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default function SitemapXmlPage() {
  return null;
}
