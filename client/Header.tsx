import styles from "./Header.module.css";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, Card, Flex, InputNumber, Modal, Slider, Switch } from "antd";
import { useClientContext } from "./ClientContext";

type Props = {
  roomId?: string | null;
  onLeaveRoom: () => void;
  setUseAnimations: (use: boolean) => void;
  scale: number;
  setScale: (scale: number) => void;
};

export default observer(function Header(props: Props) {
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  return (
    <>
      <SettingsDialog
        isSettingsOpen={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
        {...props}
      />
      <button
        className={styles.floatingButton}
        onClick={() => setSettingsOpen(true)}
      >
        Settings
      </button>
    </>
  );
});

const SettingsDialog = observer(function SettingsDialog({
  ...props
}: {
  isSettingsOpen: boolean;
  onClose: () => void;
} & Props) {
  const { state, socket } = useClientContext();
  const isStarted = state.board?.isActive ?? false;
  const isHost = state.getIsHost();
  const aiCount =
    state.board?.players.filter((p) => p.socketId == null).length ?? 0;
  const disconnectedCount =
    state.board?.players.filter((p) => p.disconnected).length ?? 0;
  const buildDate = useLocalBuildDate(process.env.NEXT_PUBLIC_BUILD_DATE);
  return (
    <Modal
      title="Settings"
      open={props.isSettingsOpen}
      onOk={props.onClose}
      onCancel={props.onClose}
      okText="Done"
      cancelButtonProps={{ style: { display: "none" } }}
      styles={{
        body: {
          overflowY: "auto",
          maxHeight: "calc(100dvh - 300px)",
          paddingRight: "30px",
        },
      }}
    >
      <Flex vertical gap={10}>
        <Card title="Room">
          <Flex vertical gap={10}>
            {isHost && (
              <Flex gap="10px">
                <Button onClick={() => socket?.emit("restart_game")}>
                  Reset Room
                </Button>
                <Button
                  disabled={!isStarted}
                  onClick={() => {
                    socket?.emit("rotate_decks");
                    props.onClose();
                  }}
                >
                  Rotate decks
                </Button>
                <Button
                  disabled={isStarted || disconnectedCount === 0}
                  onClick={() => {
                    socket?.emit("remove_disconnected_players");
                    props.onClose();
                  }}
                >
                  Remove disconnected
                </Button>
              </Flex>
            )}
            <div>
              Room Code: <b>{props.roomId}</b>
            </div>
            <Button danger onClick={props.onLeaveRoom}>
              Leave Room
            </Button>
          </Flex>
        </Card>
        {isHost && (
          <Card title="AI Settings">
            <div>
              Count:{" "}
              <InputNumber
                disabled={isStarted}
                value={aiCount}
                max={5}
                min={0}
                onChange={(value) => {
                  // TODO: Ideally just tell the server the count we want
                  if (value != null) {
                    const count = Math.abs(value - aiCount);
                    if (value > aiCount) {
                      for (let i = 0; i < count; i++) {
                        socket?.emit("add_ai");
                      }
                    } else {
                      for (let i = 0; i < count; i++) {
                        socket?.emit("remove_ai");
                      }
                    }
                  }
                }}
              />
            </div>
            <div>
              <Flex align="center">
                AI Level:{" "}
                <Slider
                  defaultValue={3}
                  min={1}
                  max={10}
                  step={1}
                  onChange={(v) => socket?.emit("set_ai_level", { speed: v })}
                  style={{ flexGrow: 1 }}
                />
              </Flex>
            </div>
            <div>
              Simulation Mode:{" "}
              <Switch
                onChange={(v) =>
                  socket?.emit("set_ai_level", { speed: v ? 1000 : 3 })
                }
              />
            </div>
          </Card>
        )}
        <Card title="Appearance">
          <div>
            Animations:{" "}
            <Switch
              onChange={(v) => props.setUseAnimations(v)}
              defaultChecked={true}
            />
          </div>
          <Flex align="center">
            Zoom:{" "}
            <Slider
              min={0.5}
              max={2}
              step={0.025}
              value={props.scale}
              onChange={(v) => props.setScale(v)}
              style={{ flexGrow: 1 }}
            />
          </Flex>
        </Card>
        <div className={styles.buildInfo}>
          Build: {buildDate}
        </div>
      </Flex>
    </Modal>
  );
});

function useLocalBuildDate(buildDate: string | undefined) {
  const [formattedDate, setFormattedDate] = useState("unknown");

  useEffect(() => {
    if (!buildDate) {
      setFormattedDate("unknown");
      return;
    }

    const date = new Date(buildDate);
    if (Number.isNaN(date.getTime())) {
      setFormattedDate(buildDate);
      return;
    }

    setFormattedDate(
      new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(date)
    );
  }, [buildDate]);

  return formattedDate;
}
