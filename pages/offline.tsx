import { useCallback, useEffect, useState } from "react";

import Board from "../client/Board";
import { ClientContext } from "../client/ClientContext";
import Head from "next/head";
import Header from "../client/Header";
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

  const onLeaveRoom = useCallback(() => {
    router.push("/");
  }, [router]);

  if (!isConnected) {
    return <div className={styles.loadingStateText}>Starting...</div>;
  }
  const board = state.board;
  if (board == null) {
    return <div className={styles.loadingStateText}>Preparing game...</div>;
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
            setUseAnimations={setAnimations}
            onLeaveRoom={onLeaveRoom}
            roomId="Offline"
            scale={scale}
            setScale={setScale}
          />
          <div
            className={styles.boardWrapper}
            style={{ "--scale": scale } as any}
          >
            <Board
              onUpdateHand={actions.onUpdateHand}
              executeMove={actions.executeMove}
            />
          </div>
        </ClientContext.Provider>
      </div>
    </>
  );
});

export default OfflinePage;
