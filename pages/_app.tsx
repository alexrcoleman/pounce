import { ConfigProvider } from "antd";
import { Toaster } from "sonner";
import "../styles/globals.css";

import { ASSET_STYLES } from "../shared/gameAssets";
import { StatsigProvider } from "@statsig/react-bindings";
import type { AppProps } from "next/app";
import Head from "next/head";
import PageErrorBoundary from "../client/PageErrorBoundary";
import PwaRegistration from "../client/PwaRegistration";
import StatsigRouteLogger from "../client/StatsigRouteLogger";
import { useCallback, useEffect, useState, type ErrorInfo } from "react";
import { useRouter } from "next/router";
import { getPageThemeColor } from "../shared/themeColors";
import theme from "../client/theme";
import {
  getRouteAnalyticsMetadata,
  STATSIG_CLIENT_KEY,
  STATSIG_OPTIONS,
  STATSIG_USER,
  truncateAnalyticsValue,
  useStatsigLogger,
} from "../client/analytics";

function MyApp(props: AppProps) {
  return (
    <StatsigProvider
      sdkKey={STATSIG_CLIENT_KEY}
      user={STATSIG_USER}
      options={STATSIG_OPTIONS}
    >
      <AppContent {...props} />
    </StatsigProvider>
  );
}

function AppContent({ Component, pageProps }: AppProps) {
  const [name, setName] = useState("");
  const router = useRouter();
  const logStatsigEvent = useStatsigLogger();
  const pageThemeColor = getPageThemeColor(router.pathname);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (router.pathname !== "/") {
      void router.prefetch("/");
    }
  }, [router, router.isReady, router.pathname]);

  const handlePageError = useCallback(
    (error: Error, errorInfo: ErrorInfo) => {
      logStatsigEvent("error_boundary_caught", {
        ...getRouteAnalyticsMetadata(router.pathname, router.asPath),
        error_name: error.name || "Error",
        error_message: truncateAnalyticsValue(error.message),
        error_stack: truncateAnalyticsValue(error.stack),
        component_stack: truncateAnalyticsValue(errorInfo.componentStack),
      });
    },
    [logStatsigEvent, router.asPath, router.pathname]
  );

  return (
    <>
      <StatsigRouteLogger />
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
        <PageErrorBoundary
          onError={handlePageError}
          resetKey={router.asPath}
        >
          <Component {...pageProps} name={name} setName={setName} />
        </PageErrorBoundary>
      </ConfigProvider>
      <Toaster position="top-center" richColors visibleToasts={1} />
    </>
  );
}

export default MyApp;
