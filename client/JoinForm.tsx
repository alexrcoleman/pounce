import { Button, Form, Input } from "antd";
import styles from "./JoinForm.module.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
type Props = {
  placeholderName: string;
  onSubmit: (room: string, name: string) => void;
};

function randomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }
  return code;
}
export default function JoinForm({ placeholderName, onSubmit }: Props) {
  const [currentRoom, setCurrentRoom] = useState("");
  const [currentName, setCurrentName] = useState(placeholderName);
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
            <img src="/favicon.svg" width="30px" />
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
        </div>
      </Form>
    </div>
  );
}
