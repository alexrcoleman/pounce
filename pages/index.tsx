import io, { Socket } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";

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
  } = useGameSocket(roomId, name);

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
    return <div>Connecting...</div>;
  }
  if (board == null) {
    return <div>Waiting for game data...</div>;
  }
  const playerIndex = board.players.findIndex((p) => p.socketId === socketId);
  const hostIndex = board.players.findIndex(
    (p) => !p.disconnected && p.socketId != null
  );
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
        onLeaveRoom={() => setRoomId(null)}
        onStart={onStart}
        roomId={roomId}
        isHost={hostIndex === playerIndex}
        onRotate={onRotate}
        scale={scale}
        setScale={setScale}
      />
      <div className={styles.boardWrapper} style={{ "--scale": scale } as any}>
        <Board
          hands={hands}
          board={board}
          onUpdateHand={onUpdateHand}
          executeMove={executeMove}
          startGame={onStart}
          isHost={hostIndex === playerIndex}
          playerIndex={playerIndex}
        />
      </div>
    </div>
  );
};

export default Home;
