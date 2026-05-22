import { useCallback, useEffect, useState } from "react";

import { Button } from "antd";
import Board from "../client/Board";
import { ClientContext } from "../client/ClientContext";
import Head from "next/head";
import Header from "../client/Header";
import type { SettingsOpenRequest } from "../client/Header";
import LoadingState from "../client/LoadingState";
import type { NextPage } from "next";
import joinClasses from "../client/joinClasses";
import styles from "../client/Home.module.css";
import useLocalGame from "../client/useLocalGame";
import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";

const OfflinePage: NextPage<{
  name: string;
  setName: (name: string) => void;
}> = observer(({ name, setName }) => {
  const router = useRouter();
  const [animations, setAnimations] = useState(true);
  const [settingsRequest, setSettingsRequest] =
    useState<SettingsOpenRequest | null>(null);
  const [scale, setScale] = useState(1);
  const playerName = name || "Player";
  const { actions, isConnected, state, socket } = useLocalGame(playerName);

  useEffect(() => {
    if (!name) {
      const storedName = localStorage.getItem("pounce::name");
      if (storedName) {
        setName(storedName);
      }
    }
  }, [name, setName]);

  useEffect(() => {
    const pauseIfActive = () => {
      const board = state.board;
      if (board?.isActive && !board.isPaused) {
        socket?.emit("set_paused", { paused: true });
      }
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseIfActive();
      }
    };

    window.addEventListener("blur", pauseIfActive);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", pauseIfActive);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [socket, state]);

  const onLeaveRoom = useCallback(() => {
    router.push("/");
  }, [router]);
  const onOpenRoomSettings = useCallback(() => {
    setSettingsRequest((current) => ({
      id: (current?.id ?? 0) + 1,
      page: "room",
    }));
  }, []);

  if (!isConnected) {
    return (
      <OfflineLoadingState
        message="Starting offline game"
        onLeaveRoom={onLeaveRoom}
      />
    );
  }
  const board = state.board;
  if (board == null) {
    return (
      <OfflineLoadingState
        message="Preparing your table"
        onLeaveRoom={onLeaveRoom}
      />
    );
  }

  return (
    <>
      <Head>
        <title>Pounce | Offline</title>
      </Head>
      <div
        className={joinClasses(
          styles.container,
          !animations && styles.hideAnimations
        )}
      >
        <ClientContext.Provider value={{ state, socket }}>
          <Header
            useAnimations={animations}
            setUseAnimations={setAnimations}
            onLeaveRoom={onLeaveRoom}
            settingsRequest={settingsRequest}
            roomId="Offline"
            scale={scale}
            setScale={setScale}
          />
          <div className={styles.boardWrapper}>
            <Board
              onUpdateHand={actions.onUpdateHand}
              executeMove={actions.executeMove}
              onOpenRoomSettings={onOpenRoomSettings}
              roomId="Offline"
              zoom={scale}
            />
          </div>
        </ClientContext.Provider>
      </div>
    </>
  );
});

function OfflineLoadingState({
  message,
  onLeaveRoom,
}: {
  message: string;
  onLeaveRoom: () => void;
}) {
  return (
    <>
      <Head>
        <title>Pounce | Offline</title>
      </Head>
      <LoadingState title={message} detail="This usually takes a moment.">
        <Button size="large" onClick={onLeaveRoom}>
          Back home
        </Button>
      </LoadingState>
    </>
  );
}

export default OfflinePage;
