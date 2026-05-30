import { useCallback, useEffect, useState } from "react";

import Board from "../../client/Board";
import Head from "next/head";
import Header from "../../client/Header";
import type { SettingsOpenRequest } from "../../client/Header";
import JoinForm from "../../client/JoinForm";
import LoadingState from "../../client/LoadingState";
import type { NextPage } from "next";
import joinClasses from "../../client/joinClasses";
import styles from "../../client/Home.module.css";
import {
  DEFAULT_SOUND_EFFECT_VOLUME_PERCENT,
  preloadSoundEffects,
  setSoundEffectVolumePercent,
} from "../../client/soundEffects";
import useGameSocket from "../../client/useGameSocket";
import useStoredBoolean from "../../client/useStoredBoolean";
import useStoredNumber from "../../client/useStoredNumber";
import { observer } from "mobx-react-lite";
import { ClientContext } from "../../client/ClientContext";
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
    const [animations, setAnimations] = useState(true);
    const [settingsRequest, setSettingsRequest] =
      useState<SettingsOpenRequest | null>(null);
    const [leftHandedMode, setLeftHandedMode] = useState(false);
    const [easyReadCards, setEasyReadCards] = useStoredBoolean(
      "pounce::easy-read-cards",
      true
    );
    const [showFramerate, setShowFramerate] = useStoredBoolean(
      "pounce::show-framerate",
      false
    );
    const [showNetworkStats, setShowNetworkStats] = useStoredBoolean(
      "pounce::show-network-stats",
      false
    );
    const [soundEffectVolume, setSoundEffectVolume] = useStoredNumber(
      "pounce::sound-effect-volume",
      DEFAULT_SOUND_EFFECT_VOLUME_PERCENT,
      0,
      100
    );
    const [scale, setScale] = useState(1);
    const { actions, isConnected, state, socket, error } = useGameSocket(
      roomId,
      name
    );
    const onLeaveRoom = useCallback(() => {
      router.push("/");
    }, []);
    const onOpenRoomSettings = useCallback(() => {
      setSettingsRequest((current) => ({
        id: (current?.id ?? 0) + 1,
        page: "room",
      }));
    }, []);
    const onSettingsRequestHandled = useCallback(() => {
      setSettingsRequest(null);
    }, []);

    useEffect(() => {
      setSoundEffectVolumePercent(soundEffectVolume);
    }, [soundEffectVolume]);

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
            !animations && styles.hideAnimations
          )}
        >
          <ClientContext.Provider
            value={{ state, socket: isConnected ? socket : null }}
          >
            <Header
              useAnimations={animations}
              setUseAnimations={setAnimations}
              leftHandedMode={leftHandedMode}
              setLeftHandedMode={setLeftHandedMode}
              easyReadCards={easyReadCards}
              setEasyReadCards={setEasyReadCards}
              showFramerate={showFramerate}
              setShowFramerate={setShowFramerate}
              showNetworkStats={showNetworkStats}
              setShowNetworkStats={setShowNetworkStats}
              onLeaveRoom={onLeaveRoom}
              settingsRequest={settingsRequest}
              onSettingsRequestHandled={onSettingsRequestHandled}
              roomId={roomId}
              scale={scale}
              setScale={setScale}
              soundEffectVolume={soundEffectVolume}
              setSoundEffectVolume={setSoundEffectVolume}
            />
            <div className={styles.boardWrapper}>
              <Board
                onUpdateHand={actions.onUpdateHand}
                executeMove={actions.executeMove}
                isLeftHandedLayout={leftHandedMode}
                easyReadCards={easyReadCards}
                onOpenRoomSettings={onOpenRoomSettings}
                roomId={roomId}
                zoom={scale}
              />
            </div>
          </ClientContext.Provider>
        </div>
      </>
    );
  }
);

export default RoomPage;
