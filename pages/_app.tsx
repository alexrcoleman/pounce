import { ConfigProvider } from "antd";
import "../styles/globals.css";

import type { AppProps } from "next/app";
import Head from "next/head";
import { useState } from "react";
import theme from "../client/theme";

function MyApp({ Component, pageProps }: AppProps) {
  const [name, setName] = useState("");
  return (
    <>
      <Head>
        <title>Pounce</title>
      </Head>
      <ConfigProvider theme={theme}>
        <Component {...pageProps} name={name} setName={setName} />
      </ConfigProvider>
    </>
  );
}

export default MyApp;
