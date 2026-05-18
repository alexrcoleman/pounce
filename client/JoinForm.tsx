import { Button, Form, Input } from "antd";
import styles from "./JoinForm.module.css";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import usePwaInstall from "./usePwaInstall";
type Props = {
  placeholderName: string;
  onSubmit: (room: string, name: string) => void;
  onPlayOffline?: (name: string) => void;
};

function randomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }
  return code;
}
export default function JoinForm({
  placeholderName,
  onSubmit,
  onPlayOffline,
}: Props) {
  const [currentRoom, setCurrentRoom] = useState("");
  const [currentName, setCurrentName] = useState(placeholderName);
  const {
    canInstall,
    downloadForOffline,
    installContext,
    isCheckingOfflineReady,
    isOfflineReady,
    isPreparing,
    isSupported,
    message,
  } = usePwaInstall();
  const router = useRouter();
  useEffect(() => {
    if (router.isReady) {
      setCurrentRoom(router.query.roomid?.toString() ?? randomCode());
      setCurrentName(
        placeholderName
          ? placeholderName
          : localStorage.getItem("pounce::name") ?? ""
      );
    }
  }, [router.isReady]);
  return (
    <div className={styles.root}>
      <Form
        onFinish={() => {
          localStorage.setItem("pounce::name", currentName);
          onSubmit(currentRoom, currentName);
        }}
      >
        <div className={styles.form}>
          <div className={styles.header}>
            <img src="/favicon.png" width="30px" />
            Pounce Online
          </div>
          <div>
            <label>
              Name
              <br />
              <Input
                name="name"
                size="large"
                placeholder="Enter your name"
                onChange={(e) => setCurrentName(e.target.value)}
                value={currentName}
                autoComplete="off"
                autoFocus
                maxLength={12}
              />
            </label>
          </div>
          <div>
            <label>
              Room Code
              <br />
              <Input
                size="large"
                name="room"
                placeholder="Enter room code"
                onChange={(e) => {
                  setCurrentRoom(e.target.value.toUpperCase());
                }}
                value={currentRoom}
                autoComplete="off"
              />
            </label>
          </div>
          <Button
            htmlType="submit"
            type="primary"
            size="large"
            disabled={!currentName || !currentRoom}
          >
            Play
          </Button>
          <Button
            htmlType="button"
            size="large"
            onClick={() => {
              const name =
                currentName.trim() ||
                localStorage.getItem("pounce::name") ||
                "Player";
              localStorage.setItem("pounce::name", name);
              onPlayOffline?.(name);
            }}
          >
            Play offline
          </Button>
          <Button
            htmlType="button"
            loading={isPreparing || isCheckingOfflineReady}
            disabled={!isSupported || isCheckingOfflineReady}
            onClick={downloadForOffline}
          >
            {isCheckingOfflineReady
              ? "Checking offline files"
              : isOfflineReady
              ? "Offline ready"
              : installContext.isIOS && !installContext.isStandalone
              ? "Save to Home Screen"
              : canInstall
              ? "Install app"
              : "Download for offline"}
          </Button>
          {message ? (
            <div className={styles.offlineStatus} role="status">
              {message}
            </div>
          ) : null}
        </div>
      </Form>
    </div>
  );
}
