import { Button, Input } from "antd";
import jsQR from "jsqr";
import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./LanRoom.module.css";

export default function LanScanner({
  onCode,
  busy,
  autoOpen = false,
}: {
  onCode: (code: string) => void;
  busy: boolean;
  autoOpen?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [cameraError, setCameraError] = useState("");
  const [text, setText] = useState("");
  const [cameraRequested, setCameraRequested] = useState(autoOpen);

  useEffect(() => {
    if (!cameraRequested || busy) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
    const scan = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
        const video = videoRef.current;
        if (cancelled || !video) {
          stop();
          return;
        }
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Camera canvas unavailable");
        let lastScan = 0;
        const tick = (now: number) => {
          if (cancelled) return;
          if (video.videoWidth && video.videoHeight && now - lastScan > 125) {
            lastScan = now;
            const scale = Math.min(1, 900 / Math.max(video.videoWidth, video.videoHeight));
            const width = Math.round(video.videoWidth * scale);
            const height = Math.round(video.videoHeight * scale);
            if (canvas.width !== width || canvas.height !== height) {
              canvas.width = width;
              canvas.height = height;
            }
            context.drawImage(video, 0, 0, width, height);
            const pixels = context.getImageData(0, 0, width, height);
            const code = jsQR(pixels.data, width, height, { inversionAttempts: "dontInvert" });
            if (code) {
              stop();
              setCameraRequested(false);
              onCodeRef.current(code.data);
              return;
            }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch {
        stop();
        if (cancelled) return;
        setCameraRequested(false);
        setCameraError("Camera unavailable. Allow camera access or paste the pairing code.");
      }
    };
    void scan();
    return () => {
      cancelled = true;
      stop();
    };
  }, [busy, cameraRequested]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setCameraRequested(false);
    onCode(text);
  }

  return (
    <div className={styles.scanner}>
      {cameraRequested ? (
        <div className={styles.camera}>
          <video ref={videoRef} playsInline muted aria-label="QR scanner camera" />
          <button className={styles.stopCamera} type="button" onClick={() => setCameraRequested(false)}>
            Close camera
          </button>
        </div>
      ) : (
        <Button size="large" type="primary" loading={busy} onClick={() => {
          setCameraError("");
          setCameraRequested(true);
        }}>
          Open camera
        </Button>
      )}
      {cameraError && <p className={styles.error} role="alert">{cameraError}</p>}
      <details className={styles.textCode}>
        <summary>Paste a pairing code</summary>
        <form onSubmit={submit}>
          <Input.TextArea aria-label="Pairing code" rows={3} maxLength={2400}
            placeholder="POUNCE-LAN-1.…" autoCapitalize="none" autoCorrect="off"
            spellCheck={false} value={text} onChange={(event) => setText(event.target.value)} />
          <Button htmlType="submit" disabled={!text.trim() || busy}>Use code</Button>
        </form>
      </details>
    </div>
  );
}
