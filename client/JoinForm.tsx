import { useRef } from "react";

type Props = {
  onSubmit: (room: string, name: string) => void;
};

export default function JoinForm({ onSubmit }: Props) {
  const roomRef = useRef("");
  const nameRef = useRef("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(roomRef.current, nameRef.current);
      }}
      style={{
        width: "100vw",
        height: "100vh",
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div>
        <label>
          Room:
          <input
            name="room"
            onChange={(e) => (roomRef.current = e.target.value)}
          />
        </label>
      </div>
      <div>
        <label>
          Name:
          <input
            name="name"
            onChange={(e) => (nameRef.current = e.target.value)}
          />
        </label>
      </div>
      <button type="submit">Join</button>
    </form>
  );
}
