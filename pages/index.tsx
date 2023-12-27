import { useCallback, useState } from "react";

import Board from "../client/Board";
import Head from "next/head";
import Header from "../client/Header";
import JoinForm from "../client/JoinForm";
import type { NextPage } from "next";
import joinClasses from "../client/joinClasses";
import styles from "../styles/Home.module.css";
import useGameSocket from "../client/useGameSocket";

const Home: NextPage = () => {
  const [roomId, setRoomId] = useState<null | string>(null);
  const [name, setName] = useState<null | string>(null);
  const [animations, setAnimations] = useState(true);
  const [scale, setScale] = useState(1);
  const {
    executeMove,
    onStart,
    onRestart,
    onUpdateHand,
    onAddAI,
    onRemoveAI,
    isConnected,
    board,
    socketId,
    hands,
    onRotate,
    onUpdateGrabbedItem,
    setAILevel,
  } = useGameSocket(roomId, name);
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
  if (board == null) {
    return (
      <div className={styles.loadingStateText}>Waiting for game data...</div>
    );
  }
  const playerIndex = board.players.findIndex((p) => p.socketId === socketId);
  const hostIndex = board.players.findIndex(
    (p) => !p.disconnected && p.socketId != null
  );
  const isHost = hostIndex === playerIndex;
  console.log({
    players: board.players.map((p) => p.socketId),
    socketId,
    playerIndex,
    hostIndex,
    isHost,
  });
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
        onAddAI={onAddAI}
        setUseAnimations={setAnimations}
        isStarted={board.isActive}
        onRemoveAI={onRemoveAI}
        onRestart={onRestart}
        onLeaveRoom={onLeaveRoom}
        onStart={onStart}
        roomId={roomId}
        isHost={isHost}
        onRotate={onRotate}
        setAILevel={setAILevel}
        scale={scale}
        setScale={setScale}
      />
      <div className={styles.boardWrapper} style={{ "--scale": scale } as any}>
        <Board
          hands={hands}
          board={board}
          onUpdateHand={onUpdateHand}
          onUpdateGrabbedItem={onUpdateGrabbedItem}
          executeMove={executeMove}
          startGame={onStart}
          isHost={isHost}
          playerIndex={playerIndex}
        />
      </div>
    </div>
  );
};

export default Home;
