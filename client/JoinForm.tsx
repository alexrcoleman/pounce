import { Button, Form, Input, Modal } from "antd";
import styles from "./JoinForm.module.css";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import usePwaInstall from "./usePwaInstall";
import { FAVICON_SRC } from "../shared/gameAssets";
import { canUseClientInitialValue } from "./clientHydration";
import { markPendingRoomEntry } from "./analytics";
import useIsomorphicLayoutEffect from "./useIsomorphicLayoutEffect";

const ROOM_CODE_LENGTH = 4;
const ROOM_CODE_PREFETCH_MIN_LENGTH = 1;

type Props = {
  placeholderName: string;
  inviteRoom?: string | null;
  onSubmit: (room: string, name: string) => Promise<unknown> | void;
  onPlayOffline?: (name: string) => Promise<unknown> | void;
};

type PendingAction = "create" | "join" | "offline" | null;

function randomCode() {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }
  return code;
}
export default function JoinForm({
  inviteRoom,
  placeholderName,
  onSubmit,
  onPlayOffline,
}: Props) {
  const inviteRoomCode = normalizeRoomCode(inviteRoom ?? "");
  const router = useRouter();
  const [currentRoom, setCurrentRoom] = useState(() =>
    canUseClientInitialValue()
      ? getInitialRoom(inviteRoomCode, router.query.roomid)
      : ""
  );
  const [currentName, setCurrentName] = useState(() =>
    getRememberedName(placeholderName) ||
    (canUseClientInitialValue() ? getStoredName() : "")
  );
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
    isUpdatingOfflineCache,
    message,
  } = usePwaInstall();

  useIsomorphicLayoutEffect(() => {
    if (router.isReady) {
      const queryRoom = router.query.roomid?.toString() ?? "";
      setCurrentRoom(inviteRoomCode || normalizeRoomCode(queryRoom));
      const storedName = getStoredName();
      setCurrentName(
        getRememberedName(placeholderName) || getRememberedName(storedName)
      );
      setNamePlaceholder("Your name");
    }
  }, [inviteRoomCode, placeholderName, router.isReady, router.query.roomid]);

  useEffect(() => {
    const room = normalizeRoomCode(currentRoom);
    if (
      !router.isReady ||
      inviteRoomCode ||
      room.length < ROOM_CODE_PREFETCH_MIN_LENGTH
    ) {
      return;
    }

    void router.prefetch(
      "/join/[roomid]",
      `/join/${encodeURIComponent(room)}`
    );
  }, [currentRoom, inviteRoomCode, router]);

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
    markPendingRoomEntry("create", room);
    const name = saveName();
    startNavigation("create", () => onSubmit(room, name));
  };

  const joinRoom = () => {
    const room = normalizeRoomCode(currentRoom);
    if (
      !room ||
      (!isInviteMode && room.length !== ROOM_CODE_LENGTH) ||
      (isInviteMode && !currentName.trim())
    ) {
      return;
    }

    setCurrentRoom(room);
    if (!currentName.trim()) {
      markPendingRoomEntry("join", room);
      startNavigation("join", () =>
        router.push(`/join/${encodeURIComponent(room)}`)
      );
      return;
    }

    const name = saveName();
    markPendingRoomEntry(isInviteMode ? "invite" : "join", room);
    startNavigation("join", () => onSubmit(room, name));
  };

  const playOffline = () => {
    if (!currentName.trim()) {
      return;
    }
    const name = saveName();
    markPendingRoomEntry("offline", "offline");
    startNavigation("offline", () => onPlayOffline?.(name));
  };

  const isNavigating = pendingAction != null;
  const isInviteMode = inviteRoomCode.length > 0;
  const normalizedCurrentRoom = normalizeRoomCode(currentRoom);
  const isTypedRoomCodeComplete =
    normalizedCurrentRoom.length === ROOM_CODE_LENGTH;
  const canCreateRoom = currentName.trim().length > 0;
  const canJoinRoom =
    (isInviteMode
      ? normalizedCurrentRoom.length > 0
      : isTypedRoomCodeComplete) && (!isInviteMode || canCreateRoom);
  const showMobileOfflinePrompt =
    installContext.isMobile || installContext.isStandalone;
  const isInstalledApp = installContext.isStandalone;
  const isOfflineSetupAvailable = isInstalledApp && !isOfflineReady;
  const offlineSetupState = !showMobileOfflinePrompt
    ? null
    : !isInstalledApp
    ? "install"
    : isUpdatingOfflineCache
    ? "updating"
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
  const brandContent = (
    <>
      <img className={styles.logo} src={FAVICON_SRC} alt="" />
      <div>
        <h1 className={styles.title}>Pounce</h1>
        <div className={styles.subtitle}>Online</div>
      </div>
    </>
  );

  return (
    <div className={styles.root}>
      <div className={styles.stage}>
        {isInviteMode ? (
          <Link
            aria-label="Pounce Online home"
            className={`${styles.brand} ${styles.brandLink}`}
            href="/"
          >
            {brandContent}
          </Link>
        ) : (
          <header className={styles.brand} aria-label="Pounce Online">
            {brandContent}
          </header>
        )}

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

            {isInviteMode ? (
              <section className={styles.inviteSection}>
                <div className={styles.inviteHeader}>
                  <div className={styles.sectionHeader}>Room invite</div>
                  <div className={styles.inviteCode}>
                    <span>Room</span>
                    <strong>{inviteRoomCode}</strong>
                  </div>
                </div>
                <Button
                  className={styles.inviteAction}
                  htmlType="submit"
                  type="primary"
                  size="large"
                  loading={pendingAction === "join"}
                  disabled={!canJoinRoom || isNavigating}
                >
                  Join room
                </Button>
              </section>
            ) : (
              <>
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
                  <div className={styles.sectionHeader}>
                    Or join an existing room
                  </div>
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
                          setCurrentRoom(normalizeRoomCode(e.target.value));
                        }}
                        onPressEnter={(e) => {
                          e.preventDefault();
                          joinRoom();
                        }}
                        value={currentRoom}
                        disabled={isNavigating}
                        autoComplete="off"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        enterKeyHint={isTypedRoomCodeComplete ? "go" : "done"}
                        maxLength={ROOM_CODE_LENGTH}
                        spellCheck={false}
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
              </>
            )}

            {!isInviteMode && offlineSetupState ? (
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
                ) : offlineSetupState === "updating" ? (
                  <p className={styles.offlinePrompt} role="status">
                    <span
                      className={styles.inlineSpinner}
                      aria-hidden="true"
                    />
                    Updating offline cache...
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
                      {isPreparing
                        ? "preparing offline play"
                        : isCheckingOfflineReady
                        ? "checking offline files"
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
        {!isInviteMode ? (
          <div className={styles.footerLinks}>
            <Link className={styles.rulesLink} href="/how-to-play">
              How to play Pounce
            </Link>
            <Link className={styles.rushLink} href="/rush">
              Pounce Puzzles
            </Link>
          </div>
        ) : null}
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

function getStoredName() {
  try {
    return getRememberedName(localStorage.getItem("pounce::name") ?? "");
  } catch {
    return "";
  }
}

function getInitialRoom(
  inviteRoomCode: string,
  queryRoomId: string | string[] | undefined
) {
  if (inviteRoomCode) {
    return inviteRoomCode;
  }

  return normalizeRoomCode(
    Array.isArray(queryRoomId) ? queryRoomId[0] ?? "" : queryRoomId ?? ""
  );
}

function normalizeRoomCode(room: string) {
  return room.trim().toUpperCase();
}
