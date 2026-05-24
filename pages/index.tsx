import { useRouter } from "next/router";
import JoinForm from "../client/JoinForm";
import { observer } from "mobx-react-lite";
import type { GetServerSideProps, NextPage } from "next";
import Head from "next/head";
import { useEffect } from "react";
import SeoHead from "../client/SeoHead";
import {
  DEFAULT_SEO_DESCRIPTION,
  DEFAULT_SEO_TITLE,
  getSeoOrigin,
  type SeoRequestProps,
} from "../shared/seo";

type AppProps = SeoRequestProps & {
  name?: string;
  setName?: (name: string) => void;
};

const Home: NextPage<AppProps> = observer(
  ({ name, setName, seoOrigin }: AppProps) => {
    const router = useRouter();

    useEffect(() => {
      if (!router.isReady) {
        return;
      }

      void router.prefetch("/offline");
      void router.prefetch("/r/[roomid]", "/r/PRELOAD");
    }, [router]);

    return (
      <>
        <SeoHead
          title={DEFAULT_SEO_TITLE}
          description={DEFAULT_SEO_DESCRIPTION}
          origin={seoOrigin}
          path="/"
        />
        <Head>
          <meta name="theme-color" content="#16593c" key="theme-color" />
        </Head>
        <JoinForm
          placeholderName={name ?? ""}
          onSubmit={(room, name) => {
            setName?.(name);
            return router.push(`/r/${room}`);
          }}
          onPlayOffline={(name) => {
            setName?.(name);
            return router.push("/offline");
          }}
        />
      </>
    );
  }
);

export const getServerSideProps: GetServerSideProps<SeoRequestProps> = async ({
  req,
}) => ({
  props: {
    seoOrigin: getSeoOrigin(req),
  },
});

export default Home;
