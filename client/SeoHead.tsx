import Head from "next/head";

import {
  absoluteUrl,
  DEFAULT_SHARE_IMAGE_ALT,
  DEFAULT_SHARE_IMAGE_PATH,
  SITE_NAME,
} from "../shared/seo";

type SeoHeadProps = {
  title: string;
  description: string;
  origin: string;
  path: string;
  keywords?: string[];
  imagePath?: string;
  imageAlt?: string;
  noIndex?: boolean;
};

export default function SeoHead({
  title,
  description,
  origin,
  path,
  keywords,
  imagePath = DEFAULT_SHARE_IMAGE_PATH,
  imageAlt = DEFAULT_SHARE_IMAGE_ALT,
  noIndex = false,
}: SeoHeadProps) {
  const pageUrl = absoluteUrl(origin, path);
  const imageUrl = absoluteUrl(origin, imagePath);

  return (
    <Head>
      <title key="title">{title}</title>
      <meta name="description" content={description} key="description" />
      {keywords && keywords.length > 0 ? (
        <meta name="keywords" content={keywords.join(", ")} key="keywords" />
      ) : null}
      <link rel="canonical" href={pageUrl} key="canonical" />
      {noIndex ? (
        <meta name="robots" content="noindex" key="robots" />
      ) : null}
      <meta property="og:site_name" content={SITE_NAME} key="og:site_name" />
      <meta property="og:type" content="website" key="og:type" />
      <meta property="og:title" content={title} key="og:title" />
      <meta
        property="og:description"
        content={description}
        key="og:description"
      />
      <meta property="og:url" content={pageUrl} key="og:url" />
      <meta property="og:image" content={imageUrl} key="og:image" />
      <meta property="og:image:type" content="image/png" key="og:image:type" />
      <meta property="og:image:width" content="1200" key="og:image:width" />
      <meta property="og:image:height" content="630" key="og:image:height" />
      <meta property="og:image:alt" content={imageAlt} key="og:image:alt" />
      <meta
        name="twitter:card"
        content="summary_large_image"
        key="twitter:card"
      />
      <meta name="twitter:title" content={title} key="twitter:title" />
      <meta
        name="twitter:description"
        content={description}
        key="twitter:description"
      />
      <meta name="twitter:image" content={imageUrl} key="twitter:image" />
      <meta
        name="twitter:image:alt"
        content={imageAlt}
        key="twitter:image:alt"
      />
    </Head>
  );
}
