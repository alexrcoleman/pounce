type Props = {
  x: number;
  y: number;
  color: string;
};
export default function CursorHand({ x, y, color }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        transform: `translate(${x}px, ${y}px)`,
        color: color,
        transition: ".25s transform linear",
        zIndex: 100000,
        width: 20,
        height: 20,
        pointerEvents: "none",
        borderRadius: "50px",
        backgroundColor: "rgba(0,0,0,0.8)",
        textAlign: "center",
      }}
    >
      ▲
    </div>
  );
}
