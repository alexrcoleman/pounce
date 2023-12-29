import "../styles/globals.css";

import type { AppProps } from "next/app";
import Head from "next/head";
import { useState } from "react";

function MyApp({ Component, pageProps }: AppProps) {
  const [name, setName] = useState("");
  return (
    <>
      <Head>
        <title>Pounce</title>
      </Head>
      <Component {...pageProps} name={name} setName={setName} />
    </>
  );
}

export default MyApp;
