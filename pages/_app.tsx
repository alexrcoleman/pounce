import { ConfigProvider } from "antd";
import { Toaster } from "sonner";
import "../styles/globals.css";

import { ASSET_STYLES } from "../shared/gameAssets";
import type { AppProps } from "next/app";
import Head from "next/head";
import PageErrorBoundary from "../client/PageErrorBoundary";
import PwaRegistration from "../client/PwaRegistration";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getPageThemeColor } from "../shared/themeColors";
import theme from "../client/theme";

function MyApp({ Component, pageProps }: AppProps) {
  const [name, setName] = useState("");
  const router = useRouter();
  const pageThemeColor = getPageThemeColor(router.pathname);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (router.pathname !== "/") {
      void router.prefetch("/");
    }
  }, [router, router.isReady, router.pathname]);

  return (
    <>
      <Head>
        <title>Pounce</title>
        <meta name="application-name" content="Pounce" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Pounce" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="theme-color" content={pageThemeColor} key="theme-color" />
        <style
          dangerouslySetInnerHTML={{
            __html: `:root { --pounce-page-background: ${pageThemeColor}; }`,
          }}
          key="page-theme-color"
        />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: ASSET_STYLES }} />
      <PwaRegistration />
      <ConfigProvider theme={theme}>
        <PageErrorBoundary resetKey={router.asPath}>
          <Component {...pageProps} name={name} setName={setName} />
        </PageErrorBoundary>
      </ConfigProvider>
      <Toaster position="top-center" richColors visibleToasts={1} />
    </>
  );
}

export default MyApp;
