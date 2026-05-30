import Head from "next/head";

import {
  getPageThemeColorCss,
  PAGE_THEME_COLOR_STYLE_KEY,
  THEME_COLOR_META_KEY,
} from "../shared/themeColors";

export default function PageThemeColor({ color }: { color: string }) {
  return (
    <Head>
      <meta name="theme-color" content={color} key={THEME_COLOR_META_KEY} />
      <style
        dangerouslySetInnerHTML={{ __html: getPageThemeColorCss(color) }}
        key={PAGE_THEME_COLOR_STYLE_KEY}
      />
    </Head>
  );
}
