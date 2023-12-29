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
import { Button, Flex } from "antd";
import Link from "next/link";
const RoomPage = observer(
  ({ name, setName }: { name: string; setName: (name: string) => void }) => {
    const router = useRouter();
    const roomId = String(router.query.roomid);
    const [animations, setAnimations] = useState(true);
    const [scale, setScale] = useState(1);
    const { actions, isConnected, state, socket, error } = useGameSocket(
      roomId,
      name
    );
    const onLeaveRoom = useCallback(() => {
      router.push("/");
    }, []);
    useEffect(() => {
      if (!name && router.isReady) {
        const lsName = localStorage.getItem("pounce::name");
        if (lsName) {
          setName(lsName);
        } else {
          router.push("/?roomid=" + roomId);
        }
      }
    }, [name, router]);

    if (error) {
      return (
        <div className={styles.loadingStateText}>
          <Flex vertical align="center" gap="10px">
            <span>{error}</span>
            <Flex align="center" gap="10px">
              <Link legacyBehavior passHref href="/">
                <Button>Back to Home</Button>
              </Link>
              <Button
                onClick={() => {
                  window.location.reload();
                }}
              >
                Reload
              </Button>
            </Flex>
          </Flex>
        </div>
      );
    }
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
  }
);

export default RoomPage;
