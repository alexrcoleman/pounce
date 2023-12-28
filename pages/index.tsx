import { useCallback, useRef, useState } from "react";

import Board from "../client/Board";
import Head from "next/head";
import Header from "../client/Header";
import JoinForm from "../client/JoinForm";
import type { NextPage } from "next";
import joinClasses from "../client/joinClasses";
import styles from "../styles/Home.module.css";
import useGameSocket from "../client/useGameSocket";
import { observer } from "mobx-react-lite";
import { ClientContext } from "../client/ClientContext";
const Home: NextPage = observer(() => {
  const [roomId, setRoomId] = useState<null | string>(null);
  const [name, setName] = useState<null | string>(null);
  const [animations, setAnimations] = useState(true);
  const [scale, setScale] = useState(1);
  const { actions, isConnected, state, socket } = useGameSocket(roomId, name);
  const onLeaveRoom = useCallback(() => setRoomId(null), []);

  if (!roomId || !name) {
    return (
      <JoinForm
        placeholderName={name ?? ""}
        onSubmit={(room, name) => {
          setRoomId(room);
          setName(name);
        }}
      />
    );
  }
  if (!isConnected) {
    return <div className={styles.loadingStateText}>Connecting...</div>;
  }
  const board = state.board;
  if (board == null) {
    return (
      <div className={styles.loadingStateText}>Waiting for game data...</div>
    );
  }

  return (
    <div
      className={joinClasses(
        styles.container,
        !animations && styles.hideAnimations
      )}
    >
      <Head>
        <title>Pounce | {roomId}</title>
      </Head>
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
  );
});

export default Home;
