import styles from "./JoinForm.module.css";
import { useRef } from "react";
type Props = {
  placeholderName: string;
  onSubmit: (room: string, name: string) => void;
};

export default function JoinForm({ placeholderName, onSubmit }: Props) {
  const roomRef = useRef("");
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
        <div>
          <label>
            Room
            <br />
            <input
              name="room"
              onChange={(e) => (roomRef.current = e.target.value)}
              autoComplete="off"
            />
          </label>
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
            />
          </label>
        </div>
        <button type="submit">Join</button>
      </form>
    </div>
  );
}
