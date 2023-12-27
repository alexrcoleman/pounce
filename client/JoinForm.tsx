import styles from "./JoinForm.module.css";
import { useRef } from "react";
type Props = {
  placeholderName: string;
  onSubmit: (room: string, name: string) => void;
};

function randomCode() {
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }
  return code;
}
export default function JoinForm({ placeholderName, onSubmit }: Props) {
  const roomRef = useRef(randomCode());
  const nameRef = useRef(placeholderName);
  return (
    <div className={styles.root}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
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
            <input
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
            <input
              name="room"
              onChange={(e) => {
                roomRef.current = e.target.value = e.target.value.toUpperCase();
              }}
              defaultValue={roomRef.current}
              autoComplete="off"
            />
          </label>
        </div>
        <button type="submit">Join</button>
      </form>
    </div>
  );
}
