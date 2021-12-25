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
        transform: `translate(${x}px, ${y}px) rotate(-120deg)`,
        color: color,
        transition: ".25s transform linear",
        zIndex: 100000,
        width: 20,
        height: 20,
        pointerEvents: "none",
        fontSize: "20px",
        borderRadius: "50px",
        WebkitTextStrokeColor: "#111111BB",
        WebkitTextStrokeWidth: "1px",
        textAlign: "center",
      }}
    >
      ➤
    </div>
  );
}
