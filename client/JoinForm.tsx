import { Button, Form, Input } from "antd";
import styles from "./JoinForm.module.css";
import { useRef } from "react";
type Props = {
  placeholderName: string;
  placeholderRoomId?: string;
  onSubmit: (room: string, name: string) => void;
};

function randomCode() {
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }
  return code;
}
export default function JoinForm({
  placeholderName,
  placeholderRoomId,
  onSubmit,
}: Props) {
  const roomRef = useRef(placeholderRoomId ?? randomCode());
  const nameRef = useRef(placeholderName);
  return (
    <div className={styles.root}>
      <Form
        className={styles.form}
        onFinish={() => {
          onSubmit(roomRef.current, nameRef.current);
        }}
      >
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
              onChange={(e) => (nameRef.current = e.target.value)}
              defaultValue={placeholderName}
              autoComplete="off"
              autoFocus
            />
          </label>
        </div>
        <div>
          <label>
            Room Code
            <br />
            <Input
              name="room"
              onChange={(e) => {
                roomRef.current = e.target.value = e.target.value.toUpperCase();
              }}
              defaultValue={roomRef.current}
              autoComplete="off"
            />
          </label>
        </div>
        <Button htmlType="submit">Join</Button>
      </Form>
    </div>
  );
}
