import { useEffect } from "react";
import Head from "next/head";
import type { NextPage } from "next";
import { useRouter } from "next/router";
import { observer } from "mobx-react-lite";

import JoinForm from "../../client/JoinForm";
import LoadingState from "../../client/LoadingState";

type AppProps = {
  name?: string;
  setName?: (name: string) => void;
};

const JoinRoomPage: NextPage<AppProps> = observer(
  ({ name, setName }: AppProps) => {
    const router = useRouter();
    const roomId =
      router.isReady && typeof router.query.roomid === "string"
        ? router.query.roomid.toUpperCase()
        : "";

    useEffect(() => {
      if (!router.isReady) {
        return;
      }

      void router.prefetch("/r/[roomid]", `/r/${roomId || "PRELOAD"}`);
    }, [roomId, router]);

    if (!router.isReady || !roomId) {
      return (
        <>
          <Head>
            <title>Join Pounce</title>
            <meta name="theme-color" content="#16593c" key="theme-color" />
          </Head>
          <LoadingState
            title="Opening invite"
            detail="Getting the room ready."
          />
        </>
      );
    }

    return (
      <>
        <Head>
          <title>{roomId ? `Join Pounce | ${roomId}` : "Join Pounce"}</title>
          <meta name="theme-color" content="#16593c" key="theme-color" />
        </Head>
        <JoinForm
          inviteRoom={roomId}
          placeholderName={name ?? ""}
          onSubmit={(room, name) => {
            setName?.(name);
            return router.push(`/r/${room}`);
          }}
        />
      </>
    );
  }
);

export default JoinRoomPage;
