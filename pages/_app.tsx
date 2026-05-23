import { ConfigProvider } from "antd";
import { Toaster } from "sonner";
import "../styles/globals.css";

import { ASSET_CSS_VARIABLES } from "../shared/gameAssets";
import type { AppProps } from "next/app";
import Head from "next/head";
import PwaRegistration from "../client/PwaRegistration";
import { useState } from "react";
import theme from "../client/theme";

function MyApp({ Component, pageProps }: AppProps) {
  const [name, setName] = useState("");
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
        <meta name="theme-color" content="#cd9b60" key="theme-color" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: ASSET_CSS_VARIABLES }} />
      <PwaRegistration />
      <ConfigProvider theme={theme}>
        <Component {...pageProps} name={name} setName={setName} />
      </ConfigProvider>
      <Toaster position="top-center" richColors visibleToasts={1} />
    </>
  );
}

export default MyApp;
