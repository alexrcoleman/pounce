import { Button, Input } from "antd";
import { QrcodeOutlined, WifiOutlined } from "@ant-design/icons";
import Head from "next/head";
import Link from "next/link";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import Board from "../client/Board";
import { ClientProvider } from "../client/ClientContext";
import { useClientSettingsStore } from "../client/ClientSettingsStore";
import Header from "../client/Header";
import home from "../client/Home.module.css";
import styles from "../client/LanRoom.module.css";
import LanScanner from "../client/LanScanner";
import LoadingState from "../client/LoadingState";
import { createLanRoomId, decodeLanSignal, LanPeer, type LanCode } from "../client/lanPeer";
import joinClasses from "../client/joinClasses";
import { preloadSoundEffects } from "../client/soundEffects";
import useLocalGame from "../client/useLocalGame";
import { FAVICON_SRC } from "../shared/gameAssets";

type Step = "entry" | "host-code" | "host-scan" | "join-scan" | "join-code" | "connecting" | "room";

export default function LanPage({ name: initialName, setName: rememberName }: {
  name: string;
  setName: (name: string) => void;
}) {
  const [name, setName] = useState(initialName || "");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>("entry");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<LanCode | null>(null);
  const [activePeer, setActivePeer] = useState<LanPeer | null>(null);
  const [interrupted, setInterrupted] = useState(false);
  const [error, setError] = useState("");
  const peerRef = useRef<LanPeer | null>(null);
  const timeout = useRef<number | undefined>(undefined);
  const busyRef = useRef(false);
  const operation = useRef(0);

  useEffect(() => {
    setSupported(window.isSecureContext && typeof RTCPeerConnection !== "undefined" &&
      typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined");
    try {
      setName(localStorage.getItem("pounce::name") || initialName || "");
    } catch {
      setName(initialName || "");
    }
    return () => {
      operation.current += 1;
      window.clearTimeout(timeout.current);
      peerRef.current?.close();
      peerRef.current = null;
    };
  }, []);

  function closePeer() {
    operation.current += 1;
    window.clearTimeout(timeout.current);
    peerRef.current?.close();
    peerRef.current = null;
    setActivePeer(null);
    setInterrupted(false);
    setCode(null);
    busyRef.current = false;
    setBusy(false);
  }

  function reset(message = "") {
    closePeer();
    setStep("entry");
    setError(message);
  }

  function startTimeout(duration: number, message: string) {
    window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => reset(message), duration);
  }

  function makePeer(role: "host" | "guest", room: string) {
    peerRef.current?.close();
    const peer: LanPeer = new LanPeer(role, room, (status) => {
      if (peerRef.current !== peer) return;
      if (status === "connected") {
        window.clearTimeout(timeout.current);
        setInterrupted(false);
        setActivePeer(peer);
        setStep("room");
      } else if (status === "disconnected") {
        setInterrupted(true);
        startTimeout(15000, "The LAN connection was lost. Pair again to start a new room.");
      } else if (status === "failed" || status === "closed") {
        const message = status === "closed"
          ? "The other device left the LAN room."
          : "Couldn’t connect. Check that both devices are on Wi-Fi that allows devices to reach each other.";
        reset(message);
      }
    });
    peerRef.current = peer;
    return peer;
  }

  function saveName() {
    const player = name.trim().slice(0, 12);
    setName(player);
    rememberName(player);
    try {
      localStorage.setItem("pounce::name", player);
    } catch {
      // A temporary browser session can still play.
    }
  }

  async function runPairing(task: (isCurrent: () => boolean) => Promise<void>) {
    if (busyRef.current) return;
    const token = ++operation.current;
    const isCurrent = () => token === operation.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await task(isCurrent);
    } catch (cause) {
      if (isCurrent()) {
        setError(cause instanceof Error ? cause.message : "Pairing failed. Try again.");
      }
    } finally {
      if (isCurrent()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function hostRoom() {
    saveName();
    void runPairing(async (isCurrent) => {
      const peer = makePeer("host", createLanRoomId());
      const offer = await peer.offer();
      if (!isCurrent()) return;
      setCode(offer);
      setStep("host-code");
    });
  }

  function readCode(text: string) {
    void runPairing(async (isCurrent) => {
      const signal = await decodeLanSignal(text);
      if (!isCurrent()) return;
      if (step === "join-scan") {
        if (signal.type !== "offer") throw new Error("Scan the host’s first QR code.");
        const peer = makePeer("guest", signal.room);
        const answer = await peer.answer(signal);
        if (!isCurrent()) return;
        setCode(answer);
        setStep((current) => current === "room" ? current : "join-code");
        if (!peer.isOpen) startTimeout(90000, "Pairing expired. Ask the host for a fresh room code.");
      } else if (step === "host-scan") {
        const peer = peerRef.current;
        if (!peer || signal.type !== "answer" || signal.room !== peer.room) {
          throw new Error("Scan the return code for this room.");
        }
        await peer.accept(signal);
        if (!isCurrent() || peerRef.current !== peer || peer.isOpen) return;
        setStep("connecting");
        startTimeout(18000, "No direct connection. Check the shared Wi-Fi and try again.");
      }
    });
  }

  const entry = step === "entry";
  const showCode = step === "host-code" || step === "join-code";
  const showScanner = step === "host-scan" || step === "join-scan";
  const title = {
    entry: "Play nearby",
    "host-code": "Show your room code",
    "host-scan": "Scan the return code",
    "join-scan": "Scan the host’s code",
    "join-code": "Show your return code",
    connecting: "Connecting devices",
    room: "LAN room",
  }[step];
  const detail = {
    entry: "Connect two devices on the same Wi-Fi. You can play without internet.",
    "host-code": "Ask your friend to open Play nearby on their device and scan this code.",
    "host-scan": "Your friend’s device will show a return code. Scan it to finish pairing.",
    "join-scan": "Point your camera at the QR code on your friend’s device.",
    "join-code": "Let the host scan this code. Keep this screen open until you’re connected.",
    connecting: "Leave Pounce open on both devices while they connect.",
    room: "",
  }[step];

  return (
    <>
      <Head>
        <title>Pounce | Play nearby</title>
        <meta name="robots" content="noindex" />
      </Head>
      {activePeer ? (
        <>
          <LanTable peer={activePeer} name={name} onLeave={() => reset()} />
          {interrupted && (
            <div className={styles.connectionOverlay}>
              <LoadingState title="Reconnecting devices" detail="Keep Wi-Fi on and Pounce open on both devices.">
                <Button onClick={() => reset()}>Leave LAN room</Button>
              </LoadingState>
            </div>
          )}
        </>
      ) : (
        <main className={styles.root}>
          <div className={styles.stage}>
            <Link className={styles.brand} href="/">
              <img src={FAVICON_SRC} width="32" height="32" alt="" />
              <span>Pounce</span>
              <span className={styles.back}>← Home</span>
            </Link>
            <section className={styles.card} aria-labelledby="lan-title">
              <div className={styles.intro}>
                <div className={styles.icon}>
                  {entry ? <WifiOutlined rev={undefined} /> : <QrcodeOutlined rev={undefined} />}
                </div>
                <h1 id="lan-title">{title}</h1>
                <p>{detail}</p>
              </div>
              {error && <p className={styles.error} role="alert">{error}</p>}
              {entry && (
                <>
                  <label className={styles.name}>
                    Name
                    <Input size="large" placeholder="Your name" value={name}
                      onChange={(event) => setName(event.target.value)} maxLength={12} autoComplete="nickname" />
                  </label>
                  <div className={styles.actions}>
                    <Button size="large" type="primary" loading={busy}
                      disabled={!name.trim() || !supported} onClick={hostRoom}>Create LAN room</Button>
                    <Button size="large" disabled={!name.trim() || !supported || busy} onClick={() => {
                      saveName();
                      setError("");
                      setStep("join-scan");
                    }}>Join LAN room</Button>
                  </div>
                  {supported === false && (
                    <p className={styles.error} role="alert">Use a recent browser and open Pounce over HTTPS to pair devices.</p>
                  )}
                  <p className={styles.note}>Open Pounce on both devices before going offline. Some public Wi-Fi networks block connections between devices.</p>
                </>
              )}
              {showCode && code && (
                <PairingCode code={code} isHost={step === "host-code"} onContinue={() => {
                  setError("");
                  setStep("host-scan");
                }} />
              )}
              {showScanner && (
                <LanScanner key={step} onCode={readCode} busy={busy} autoOpen={step === "host-scan"} />
              )}
              {step === "connecting" && <span className={styles.wait} role="status">Waiting for the connection…</span>}
              {!entry && (
                <div className={styles.navigation}>
                  {step === "host-scan" && <Button type="link" onClick={() => {
                    setError("");
                    setStep("host-code");
                  }} disabled={busy}>Back to room code</Button>}
                  <Button type="text" onClick={() => reset()}>Cancel pairing</Button>
                </div>
              )}
            </section>
          </div>
        </main>
      )}
    </>
  );
}

function PairingCode({ code, isHost, onContinue }: { code: LanCode; isHost: boolean; onContinue: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <div className={styles.qr}>
        <img src={code.image} alt={isHost ? "Host QR code" : "Return QR code"} width="220" height="220" />
      </div>
      {isHost ? (
        <Button type="primary" size="large" onClick={onContinue}>Scan return code</Button>
      ) : (
        <span className={styles.wait} role="status">Waiting for the host to scan…</span>
      )}
      <details className={styles.textCode}>
        <summary>Show text code</summary>
        <div>
          <Input.TextArea aria-label="Code to copy" value={code.text} rows={3} readOnly
            onFocus={(event) => event.currentTarget.select()} />
          <Button onClick={async () => {
            try {
              await navigator.clipboard.writeText(code.text);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}>{copied ? "Copied" : "Copy code"}</Button>
        </div>
      </details>
    </>
  );
}

const LanTable = observer(function LanTable({
  name, peer, onLeave,
}: {
  name: string;
  peer: LanPeer;
  onLeave: () => void;
}) {
  const settings = useClientSettingsStore();
  const { actions, state, socket } = useLocalGame(name, peer);
  const [isRoundEndAnimationActive, setRoundEndAnimationActive] = useState(false);

  useEffect(() => {
    preloadSoundEffects();
  }, []);

  if (!state.board || state.board.players.length < 2 || state.getActivePlayerIndex() < 0) {
    return <LoadingState title="Opening LAN room" detail="Syncing the table with the other device.">
      <Button onClick={onLeave}>Leave LAN room</Button>
    </LoadingState>;
  }

  return (
    <div className={joinClasses(home.container, !settings.useAnimations && home.hideAnimations)}>
      <ClientProvider settings={settings} state={state} socket={socket}>
        <Header isRoundEndAnimationActive={isRoundEndAnimationActive} onLeaveRoom={onLeave} roomId="LAN" />
        <div className={home.boardWrapper}>
          <Board onUpdateHand={actions.onUpdateHand} executeMove={actions.executeMove}
            onRoundEndAnimationChange={setRoundEndAnimationActive} roomId="LAN" />
        </div>
      </ClientProvider>
    </div>
  );
});
