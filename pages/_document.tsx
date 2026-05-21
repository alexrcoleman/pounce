import { createCache, StyleProvider, extractStyle } from "@ant-design/cssinjs";
import Document, {
  Html,
  Head,
  Main,
  NextScript,
  DocumentContext,
} from "next/document";
import { HEAD_PRELOAD_ASSETS } from "../shared/gameAssets";

export default function MyDocument() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" type="image/png" sizes="64x64" href="/favicon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        {HEAD_PRELOAD_ASSETS.map((asset) => (
          <link
            key={asset.href}
            rel="preload"
            href={asset.href}
            as={asset.as}
            type={asset.type}
            crossOrigin={asset.crossOrigin}
          />
        ))}

      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

MyDocument.getInitialProps = async (ctx: DocumentContext) => {
  const cache = createCache();
  const originalRenderPage = ctx.renderPage;
  ctx.renderPage = () =>
    originalRenderPage({
      enhanceApp: (App) => (props) =>
        (
          <StyleProvider cache={cache}>
            <App {...props} />
          </StyleProvider>
        ),
    });

  const initialProps = await Document.getInitialProps(ctx);
  const style = extractStyle(cache, true);
  return {
    ...initialProps,
    styles: (
      <>
        {initialProps.styles}
        <style dangerouslySetInnerHTML={{ __html: style }} />
      </>
    ),
  };
};
