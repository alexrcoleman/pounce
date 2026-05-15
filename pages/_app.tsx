import { ConfigProvider } from "antd";
import "../styles/globals.css";

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
        <meta name="theme-color" content="#1677ff" />
      </Head>
      <PwaRegistration />
      <ConfigProvider theme={theme}>
        <Component {...pageProps} name={name} setName={setName} />
      </ConfigProvider>
    </>
  );
}

export default MyApp;
