import { Button } from "antd";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import styles from "./RoomShare.module.css";

type RoomShareProps = {
  roomId: string;
  variant?: "start" | "settings";
};

export default function RoomShare({
  roomId,
  variant = "start",
}: RoomShareProps) {
  const roomCode = normalizeRoomCode(roomId);
  const [inviteUrl, setInviteUrl] = useState("");
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const displayUrl = useMemo(() => formatInviteUrl(inviteUrl), [inviteUrl]);

  useEffect(() => {
    const nextInviteUrl = buildRoomInviteUrl(roomCode);
    setInviteUrl(nextInviteUrl);
    setCanShare(typeof navigator !== "undefined" && "share" in navigator);
  }, [roomCode]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const shareRoom = async () => {
    if (!inviteUrl) {
      return;
    }

    if (canShare && navigator.share) {
      try {
        await navigator.share({
          title: `Pounce room ${roomCode}`,
          text: `Join my Pounce room ${roomCode}.`,
          url: inviteUrl,
        });
        return;
      } catch (error) {
        if (isShareAbort(error)) {
          return;
        }
      }
    }

    try {
      await copyText(inviteUrl);
      setCopied(true);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy invite link");
    }
  };

  return (
    <div className={`${styles.root} ${styles[variant]}`}>
      <div className={styles.copy}>
        <span>Invite link</span>
        <a className={styles.link} href={inviteUrl || undefined}>
          {displayUrl || `/join/${roomCode}`}
        </a>
      </div>
      <Button className={styles.action} onClick={shareRoom}>
        {canShare ? "Share" : copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function buildRoomInviteUrl(roomCode: string) {
  const path = `/join/${encodeURIComponent(roomCode)}`;
  if (typeof window === "undefined") {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}

function normalizeRoomCode(roomId: string) {
  return roomId.trim().toUpperCase();
}

function formatInviteUrl(inviteUrl: string) {
  if (!inviteUrl) {
    return "";
  }

  try {
    const url = new URL(inviteUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return inviteUrl;
  }
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.top = "-1000px";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    const didCopy = document.execCommand("copy");
    if (!didCopy) {
      throw new Error("copy command failed");
    }
  } finally {
    document.body.removeChild(textArea);
  }
}

function isShareAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
