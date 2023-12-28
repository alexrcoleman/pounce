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
const Home: NextPage = observer(() => {
  const [roomId, setRoomId] = useState<null | string>(null);
  const [name, setName] = useState<null | string>(null);
  const [animations, setAnimations] = useState(true);
  const [scale, setScale] = useState(1);
  const { actions, isConnected, state } = useGameSocket(roomId, name);
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
  const playerIndex = state.getActivePlayerIndex();
  const hostIndex = state.getHostPlayerIndex();
  const isHost = hostIndex === playerIndex;

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
      <Header
        onAddAI={actions.onAddAI}
        setUseAnimations={setAnimations}
        isStarted={board.isActive}
        onRemoveAI={actions.onRemoveAI}
        onRestart={actions.onRestart}
        onLeaveRoom={onLeaveRoom}
        onStart={actions.onStart}
        roomId={roomId}
        isHost={isHost}
        onRotate={actions.onRotate}
        setAILevel={actions.setAILevel}
        scale={scale}
        setScale={setScale}
      />
      <div className={styles.boardWrapper} style={{ "--scale": scale } as any}>
        <Board
          state={state}
          onUpdateHand={actions.onUpdateHand}
          onUpdateGrabbedItem={actions.onUpdateGrabbedItem}
          executeMove={actions.executeMove}
          startGame={actions.onStart}
          isHost={isHost}
        />
      </div>
    </div>
  );
});

export default Home;
