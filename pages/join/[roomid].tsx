import { useEffect } from "react";
import type { GetServerSideProps, NextPage } from "next";
import { useRouter } from "next/router";
import { observer } from "mobx-react-lite";

import JoinForm from "../../client/JoinForm";
import LoadingState from "../../client/LoadingState";
import SeoHead from "../../client/SeoHead";
import {
  getSeoOrigin,
  normalizeRoomCode,
  type SeoRequestProps,
} from "../../shared/seo";

type AppProps = SeoRequestProps & {
  initialRoomId: string;
  name?: string;
  setName?: (name: string) => void;
};

const JoinRoomPage: NextPage<AppProps> = observer(
  ({ initialRoomId, name, seoOrigin, setName }: AppProps) => {
    const router = useRouter();
    const queryRoomId =
      router.isReady && typeof router.query.roomid === "string"
        ? normalizeRoomCode(router.query.roomid)
        : "";
    const roomId = queryRoomId || initialRoomId;
    const title = roomId ? `Join Pounce room ${roomId}` : "Join Pounce";
    const description = roomId
      ? `You've been invited to room ${roomId} in Pounce Online. Enter your name and jump in.`
      : "Join a Pounce Online room and play fast-paced cards with friends.";
    const path = roomId ? `/join/${encodeURIComponent(roomId)}` : "/join";

    useEffect(() => {
      if (!router.isReady) {
        return;
      }

      void router.prefetch("/r/[roomid]", `/r/${roomId || "PRELOAD"}`);
    }, [roomId, router]);

    if (!router.isReady || !roomId) {
      return (
        <>
          <SeoHead
            title={title}
            description={description}
            origin={seoOrigin}
            path={path}
            noIndex
          />
          <LoadingState
            title="Opening invite"
            detail="Getting the room ready."
          />
        </>
      );
    }

    return (
      <>
        <SeoHead
          title={title}
          description={description}
          origin={seoOrigin}
          path={path}
          noIndex
        />
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

export const getServerSideProps: GetServerSideProps<AppProps> = async ({
  params,
  req,
}) => ({
  props: {
    initialRoomId:
      typeof params?.roomid === "string" ? normalizeRoomCode(params.roomid) : "",
    seoOrigin: getSeoOrigin(req),
  },
});

export default JoinRoomPage;
