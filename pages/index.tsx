import { useRouter } from "next/router";
import JoinForm from "../client/JoinForm";
import { observer } from "mobx-react-lite";
import { NextPage } from "next";
import { useEffect } from "react";
type AppProps = {
  name?: string;
  setName?: (name: string) => void;
};

const Home: NextPage<AppProps> = observer(({ name, setName }: AppProps) => {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    void router.prefetch("/offline");
    void router.prefetch("/r/[roomid]", "/r/PRELOAD");
  }, [router]);

  return (
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
  );
});

export default Home;
