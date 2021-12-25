import io, { Socket } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";

import Board from "../client/Board";
import Head from "next/head";
import Header from "../client/Header";
import JoinForm from "../client/JoinForm";
import type { NextPage } from "next";
import styles from "../styles/Home.module.css";
import useGameSocket from "../client/useGameSocket";

const Home: NextPage = () => {
  const [roomId, setRoomId] = useState<null | string>(null);
  const [name, setName] = useState<null | string>(null);
  const {
    executeMove,
    onStart,
    onRestart,
    onAddAI,
    onRemoveAI,
    isConnected,
    board,
    socketId,
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
    return <div>Loading...</div>;
  }
  const playerIndex = board.players.findIndex((p) => p.socketId === socketId);
  const hostIndex = board.players.findIndex((p) => p.socketId != null);
  return (
    <div className={styles.container}>
      <Head>
        <title>Pounce | {roomId}</title>
      </Head>
      <Header
        onAddAI={onAddAI}
        isStarted={board.isActive}
        onRemoveAI={onRemoveAI}
        onRestart={onRestart}
        onLeaveRoom={() => setRoomId(null)}
        onStart={onStart}
        roomId={roomId}
        isHost={hostIndex === playerIndex}
        onRotate={onRotate}
      />
      <div className={styles.boardWrapper}>
        <Board
          board={board}
          executeMove={executeMove}
          playerIndex={playerIndex}
        />
      </div>
    </div>
  );
};

export default Home;
