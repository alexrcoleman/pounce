import { Button, Form, Input, Modal } from "antd";
import styles from "./JoinForm.module.css";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import usePwaInstall from "./usePwaInstall";
type Props = {
  placeholderName: string;
  onSubmit: (room: string, name: string) => Promise<unknown> | void;
  onPlayOffline?: (name: string) => Promise<unknown> | void;
};

type PendingAction = "create" | "join" | "offline" | null;

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
  const [currentName, setCurrentName] = useState("");
  const [namePlaceholder, setNamePlaceholder] = useState("Your name");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isInstallHelpOpen, setInstallHelpOpen] = useState(false);
  const {
    addToHomeScreen,
    canInstall,
    downloadForOffline,
    installContext,
    isCheckingOfflineReady,
    isInstalling,
    isOfflineReady,
    isPreparing,
    isSupported,
    message,
  } = usePwaInstall();
  const router = useRouter();

  useEffect(() => {
    if (router.isReady) {
      setCurrentRoom(router.query.roomid?.toString().toUpperCase() ?? "");
      const storedName = localStorage.getItem("pounce::name") ?? "";
      setCurrentName(
        getRememberedName(placeholderName) || getRememberedName(storedName)
      );
      setNamePlaceholder("Your name");
    }
  }, [placeholderName, router.isReady, router.query.roomid]);

  const saveName = () => {
    const name = currentName.trim();
    if (!name) {
      return "";
    }
    localStorage.setItem("pounce::name", name);
    setCurrentName(name);
    return name;
  };

  const startNavigation = (
    action: Exclude<PendingAction, null>,
    navigate: () => Promise<unknown> | void
  ) => {
    if (pendingAction) {
      return;
    }

    setPendingAction(action);
    Promise.resolve(navigate())
      .then((result) => {
        if (result == null || result === false) {
          setPendingAction(null);
        }
      })
      .catch((error) => {
        console.warn("Unable to navigate from main menu", error);
        setPendingAction(null);
      });
  };

  const createRoom = () => {
    if (!currentName.trim()) {
      return;
    }
    const room = randomCode();
    setCurrentRoom(room);
    const name = saveName();
    startNavigation("create", () => onSubmit(room, name));
  };

  const joinRoom = () => {
    const room = currentRoom.trim().toUpperCase();
    if (!currentName.trim() || !room) {
      return;
    }
    setCurrentRoom(room);
    const name = saveName();
    startNavigation("join", () => onSubmit(room, name));
  };

  const playOffline = () => {
    if (!currentName.trim()) {
      return;
    }
    const name = saveName();
    startNavigation("offline", () => onPlayOffline?.(name));
  };

  const isNavigating = pendingAction != null;
  const canCreateRoom = currentName.trim().length > 0;
  const canJoinRoom = canCreateRoom && currentRoom.trim().length > 0;
  const showMobileOfflinePrompt =
    installContext.isMobile || installContext.isStandalone;
  const isInstalledApp = installContext.isStandalone;
  const isOfflineSetupAvailable = isInstalledApp && !isOfflineReady;
  const offlineSetupState = !showMobileOfflinePrompt
    ? null
    : !isInstalledApp
    ? "install"
    : isOfflineSetupAvailable
    ? "download"
    : "ready";
  const addToHomeLabel = installContext.isStandalone
    ? "Added to home screen"
    : "Add to home screen";
  const installSteps = getInstallSteps(installContext, canInstall);
  const installDialogFooter =
    canInstall && !installContext.isIOS && !installContext.isStandalone
      ? [
          <Button key="done" onClick={() => setInstallHelpOpen(false)}>
            Done
          </Button>,
          <Button
            key="install"
            type="primary"
            loading={isInstalling}
            onClick={addToHomeScreen}
          >
            Install app
          </Button>,
        ]
      : [
          <Button
            key="done"
            type="primary"
            onClick={() => setInstallHelpOpen(false)}
          >
            Done
          </Button>,
        ];

  return (
    <div className={styles.root}>
      <div className={styles.stage}>
        <header className={styles.brand} aria-label="Pounce Online">
          <img className={styles.logo} src="/favicon.png" alt="" />
          <div>
            <h1 className={styles.title}>Pounce</h1>
            <div className={styles.subtitle}>Online</div>
          </div>
        </header>

        <Form className={styles.form} onFinish={joinRoom}>
          <div className={styles.menu}>
            <section className={styles.playerSection}>
              <label className={styles.fieldLabel} htmlFor="player-name">
                Name
                <Input
                  id="player-name"
                  className={styles.textInput}
                  name="name"
                  size="large"
                  placeholder={namePlaceholder}
                  onChange={(e) => setCurrentName(e.target.value)}
                  value={currentName}
                  disabled={isNavigating}
                  autoComplete="off"
                  autoFocus
                  maxLength={12}
                />
              </label>
            </section>

            <section className={styles.playSection}>
              <div className={styles.sectionHeader}>Start playing</div>
              <div className={styles.choiceGrid}>
                <Button
                  className={styles.primaryChoice}
                  htmlType="button"
                  type="primary"
                  size="large"
                  loading={pendingAction === "create"}
                  disabled={!canCreateRoom || isNavigating}
                  onClick={createRoom}
                >
                  Create room
                </Button>
                <Button
                  className={styles.offlineChoice}
                  htmlType="button"
                  size="large"
                  loading={pendingAction === "offline"}
                  disabled={!canCreateRoom || isNavigating}
                  onClick={playOffline}
                >
                  Play offline
                </Button>
              </div>
            </section>

            <section className={styles.joinSection}>
              <div className={styles.sectionHeader}>Have a code?</div>
              <div className={styles.joinRow}>
                <label className={styles.fieldLabel} htmlFor="room-code">
                  Room code
                  <Input
                    id="room-code"
                    className={styles.textInput}
                    size="large"
                    name="room"
                    placeholder="ABCD"
                    onChange={(e) => {
                      setCurrentRoom(e.target.value.toUpperCase());
                    }}
                    value={currentRoom}
                    disabled={isNavigating}
                    autoComplete="off"
                  />
                </label>
                <Button
                  className={styles.joinAction}
                  htmlType="submit"
                  size="large"
                  loading={pendingAction === "join"}
                  disabled={!canJoinRoom || isNavigating}
                >
                  Join room
                </Button>
              </div>
            </section>

            {offlineSetupState ? (
              <section className={styles.utilitySection}>
                {offlineSetupState === "install" ? (
                  <p className={styles.offlinePrompt}>
                    Want to play offline?{" "}
                    <button
                      className={styles.inlineAction}
                      type="button"
                      onClick={() => setInstallHelpOpen(true)}
                    >
                      add to home screen
                    </button>
                    .
                  </p>
                ) : offlineSetupState === "download" ? (
                  <p className={styles.offlinePrompt}>
                    Want to play offline?{" "}
                    <button
                      className={styles.inlineAction}
                      type="button"
                      disabled={
                        !isSupported || isPreparing || isCheckingOfflineReady
                      }
                      onClick={downloadForOffline}
                    >
                      {isPreparing || isCheckingOfflineReady
                        ? "preparing offline play"
                        : "download for offline play"}
                    </button>
                    .
                  </p>
                ) : (
                  <div className={styles.offlineReady}>
                    <span aria-hidden="true">{"\u2713"}</span>
                    Offline ready
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </Form>
      </div>
      <Modal
        title="Add to home screen"
        open={isInstallHelpOpen}
        onCancel={() => setInstallHelpOpen(false)}
        footer={installDialogFooter}
      >
        <ol className={styles.installSteps}>
          {installSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {message && isInstallHelpOpen ? (
          <div className={styles.offlineStatus} role="status">
            {message}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function getInstallSteps(
  installContext: {
    isAndroid: boolean;
    isChrome: boolean;
    isIOS: boolean;
    isStandalone: boolean;
    shouldUseSafari: boolean;
  },
  canInstall: boolean
) {
  if (installContext.isStandalone) {
    return [
      "Pounce is already available from your home screen.",
      "Return to this menu and choose download for offline play.",
    ];
  }

  if (installContext.isIOS) {
    return [
      installContext.shouldUseSafari
        ? "Open this page in Safari."
        : "Tap the Share button.",
      installContext.shouldUseSafari
        ? "Tap the Share button."
        : "Choose Add to Home Screen.",
      installContext.shouldUseSafari
        ? "Choose Add to Home Screen."
        : "Tap Add.",
      "Launch Pounce from the new home screen icon.",
      "Return to this menu and choose download for offline play.",
    ];
  }

  if (installContext.isAndroid && installContext.isChrome) {
    return canInstall
      ? [
          "Press Install app in this dialog.",
          "Confirm Chrome's install prompt.",
          "Launch Pounce from the new home screen icon.",
          "Return to this menu and choose download for offline play.",
        ]
      : [
          "Open Chrome's menu.",
          "Choose Install app or Add to Home screen.",
          "Confirm the prompt.",
          "Launch Pounce from the new home screen icon.",
          "Return to this menu and choose download for offline play.",
        ];
  }

  if (canInstall) {
    return [
      "Press Install app in this dialog.",
      "Confirm the browser install prompt.",
      "Launch Pounce from the new app icon.",
      "Return to this menu and choose download for offline play.",
    ];
  }

  return [
    "Open your browser menu.",
    "Choose Install app or Add to home screen if it is available.",
    "Launch Pounce from the new app icon.",
    "Return to this menu and choose download for offline play.",
  ];
}

function getRememberedName(name: string) {
  const trimmedName = name.trim();
  return trimmedName && trimmedName.toLowerCase() !== "player"
    ? trimmedName
    : "";
}
