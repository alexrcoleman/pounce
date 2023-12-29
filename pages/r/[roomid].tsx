import { useCallback, useEffect, useRef, useState } from "react";

import Board from "../../client/Board";
import Head from "next/head";
import Header from "../../client/Header";
import JoinForm from "../../client/JoinForm";
import type { NextPage } from "next";
import joinClasses from "../../client/joinClasses";
import styles from "../../client/Home.module.css";
import useGameSocket from "../../client/useGameSocket";
import { observer } from "mobx-react-lite";
import { ClientContext } from "../../client/ClientContext";
import { useRouter } from "next/router";
const RoomPage = observer(({ name }: { name: string }) => {
  const router = useRouter();
  const roomId = String(router.query.roomid);
  const [animations, setAnimations] = useState(true);
  const [scale, setScale] = useState(1);
  const { actions, isConnected, state, socket } = useGameSocket(roomId, name);
  const onLeaveRoom = useCallback(() => {
    router.push("/");
  }, []);
  useEffect(() => {
    if (!name && router.isReady) {
      router.push("/?roomid=" + roomId);
    }
  }, [name, router]);

  if (!isConnected) {
    return <div className={styles.loadingStateText}>Connecting...</div>;
  }
  const board = state.board;
  if (board == null) {
    return (
      <div className={styles.loadingStateText}>Waiting to join room...</div>
    );
  }

  return (
    <>
      <Head>
        <title>Pounce | {roomId}</title>
      </Head>
      <div
        className={joinClasses(
          styles.container,
          !animations && styles.hideAnimations
        )}
      >
        <ClientContext.Provider value={{ state, socket: socket }}>
          <Header
            setUseAnimations={setAnimations}
            onLeaveRoom={onLeaveRoom}
            roomId={roomId}
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

export default RoomPage;
