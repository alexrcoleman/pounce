import { useRouter } from "next/router";
import JoinForm from "../client/JoinForm";
import { observer } from "mobx-react-lite";
import type { NextPage } from "next";
import { useEffect } from "react";
import SeoHead from "../client/SeoHead";
import {
  DEFAULT_SEO_DESCRIPTION,
  DEFAULT_SEO_TITLE,
  getSeoOrigin,
} from "../shared/seo";

type AppProps = {
  name?: string;
  setName?: (name: string) => void;
};

const Home: NextPage<AppProps> = observer(
  ({ name, setName }: AppProps) => {
    const router = useRouter();
    const seoOrigin = getSeoOrigin();

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

export default Home;
