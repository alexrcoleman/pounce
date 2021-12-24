import io, { Socket } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";

import Board from "../client/Board";
import type { BoardState } from "../shared/GameUtils";
import Header from "../client/Header";
import JoinForm from "../client/JoinForm";
import { Move } from "../shared/PlayerUtils";
import type { NextPage } from "next";
import styles from "../styles/Home.module.css";
import useGameSocket from "../client/useGameSocket";
import { useRouter } from "next/router";

const Home: NextPage = () => {
  const router = useRouter();
  const roomId = router.query.room as string;
  const name = router.query.name as string;
  const {
    executeMove,
    onStart,
    onRestart,
    onAddAI,
    onRemoveAI,
    isConnected,
    board,
    playerIndex,
  } = useGameSocket(roomId, name);

  if (!roomId || !name) {
    return (
      <JoinForm
        onSubmit={(room, name) =>
          router.push({ pathname: "/", query: { room, name } })
        }
      />
    );
  }
  if (!isConnected) {
    return <div>Connecting...</div>;
  }
  if (board == null) {
    return <div>Loading...</div>;
  }
  return (
    <div className={styles.container}>
      <Header
        onAddAI={onAddAI}
        isStarted={board.isActive}
        onRemoveAI={onRemoveAI}
        onRestart={onRestart}
        onStart={onStart}
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
