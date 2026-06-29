import { useCallback, useEffect, useState } from "react";

import Board from "../../client/Board";
import Head from "next/head";
import Header from "../../client/Header";
import LoadingState from "../../client/LoadingState";
import type { NextPage } from "next";
import joinClasses from "../../client/joinClasses";
import styles from "../../client/Home.module.css";
import { preloadSoundEffects } from "../../client/soundEffects";
import { useClientSettingsStore } from "../../client/ClientSettingsStore";
import useGameSocket from "../../client/useGameSocket";
import { observer } from "mobx-react-lite";
import { ClientProvider } from "../../client/ClientContext";
import { useRouter } from "next/router";
import { Button, Flex } from "antd";
import Link from "next/link";
const RoomPage = observer(
  ({ name, setName }: { name: string; setName: (name: string) => void }) => {
    const router = useRouter();
    const roomId =
      router.isReady && typeof router.query.roomid === "string"
        ? router.query.roomid
        : null;
    const settings = useClientSettingsStore();
    const { actions, isConnected, state, socket, error } = useGameSocket(
      roomId,
      name
    );
    const [isRoundEndAnimationActive, setRoundEndAnimationActive] =
      useState(false);
    const onLeaveRoom = useCallback(() => {
      router.push("/");
    }, []);

    useEffect(() => {
      preloadSoundEffects();
    }, []);

    useEffect(() => {
      if (!name && router.isReady) {
        const lsName = localStorage.getItem("pounce::name");
        if (lsName) {
          setName(lsName);
        } else {
          router.push("/?roomid=" + (roomId ?? ""));
        }
      }
    }, [name, router]);

    const board = state.board;
    const hasBoard = board != null;

    if (error && !hasBoard) {
      return (
        <LoadingState title={error} isError showSpinner={false}>
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
        </LoadingState>
      );
    }
    if (!isConnected && !hasBoard) {
      return (
        <LoadingState
          title="Connecting"
          detail="Finding your room and syncing the table."
        />
      );
    }
    if (board == null) {
      return (
        <LoadingState
          title="Waiting to join room"
          detail="Getting the board ready for play."
        />
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
            !settings.useAnimations && styles.hideAnimations
          )}
        >
          <ClientProvider
            settings={settings}
            state={state}
            socket={isConnected ? socket : null}
          >
            <Header
              isRoundEndAnimationActive={isRoundEndAnimationActive}
              onLeaveRoom={onLeaveRoom}
              roomId={roomId}
            />
            <div className={styles.boardWrapper}>
              <Board
                onUpdateHand={actions.onUpdateHand}
                executeMove={actions.executeMove}
                onRoundEndAnimationChange={setRoundEndAnimationActive}
                roomId={roomId}
              />
            </div>
          </ClientProvider>
        </div>
      </>
    );
  }
);

export default RoomPage;
