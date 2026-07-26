import BorderOutlined from "@ant-design/icons/BorderOutlined";
import CheckSquareOutlined from "@ant-design/icons/CheckSquareOutlined";
import { createElement, type CSSProperties } from "react";
import { toast } from "sonner";

import type { StuckUpdate } from "../shared/SocketTypes";
import styles from "./StuckStatusToast.module.css";

const STUCK_STATUS_TOAST_ID = "room-stuck-status";
const STUCK_ACKNOWLEDGED_DISMISS_MS = 1000;
const STUCK_TOAST_ACTION_BUTTON_STYLE: CSSProperties = {
  background: "rgba(15, 23, 42, 0.08)",
  border: "1px solid rgba(15, 23, 42, 0.14)",
  color: "inherit",
};

let acknowledgedDismissTimeout: ReturnType<typeof setTimeout> | null = null;

type StuckStatusToastArgs = {
  canMarkStuck: boolean;
  onMarkStuck: () => void;
  update: StuckUpdate;
};

export function showStuckStatusToast({
  canMarkStuck,
  onMarkStuck,
  update,
}: StuckStatusToastArgs) {
  clearAcknowledgedDismissTimeout();

  const message = getStuckStatusToastMessage(update);
  const description = getStuckStatusToastDescription(update);

  if (update.isStuck && canMarkStuck) {
    toast(message, {
      action: {
        label: createStuckToastLabel(
          BorderOutlined,
          "I'm stuck",
          styles.actionLabel
        ),
        onClick: (event) => {
          event.preventDefault();
          onMarkStuck();
          showStuckAcknowledgedToast(message, description);
        },
      },
      actionButtonStyle: STUCK_TOAST_ACTION_BUTTON_STYLE,
      description,
      id: STUCK_STATUS_TOAST_ID,
    });
    return;
  }

  toast(message, {
    description,
    id: STUCK_STATUS_TOAST_ID,
  });
}

export function dismissStuckStatusToast() {
  clearAcknowledgedDismissTimeout();
  toast.dismiss(STUCK_STATUS_TOAST_ID);
}

function showStuckAcknowledgedToast(message: string, description: string) {
  toast(message, {
    action: createStuckToastLabel(
      CheckSquareOutlined,
      "Marked",
      styles.acknowledgedLabel
    ),
    description,
    duration: STUCK_ACKNOWLEDGED_DISMISS_MS,
    id: STUCK_STATUS_TOAST_ID,
  });

  acknowledgedDismissTimeout = setTimeout(() => {
    toast.dismiss(STUCK_STATUS_TOAST_ID);
    acknowledgedDismissTimeout = null;
  }, STUCK_ACKNOWLEDGED_DISMISS_MS);
}

function clearAcknowledgedDismissTimeout() {
  if (acknowledgedDismissTimeout == null) {
    return;
  }

  clearTimeout(acknowledgedDismissTimeout);
  acknowledgedDismissTimeout = null;
}

function createStuckToastLabel(
  Icon: typeof BorderOutlined,
  label: string,
  className: string
) {
  return createElement(
    "span",
    { className },
    createElement(Icon, {
      "aria-hidden": "true",
      className: styles.icon,
      rev: undefined,
    }),
    label
  );
}

function getStuckStatusToastMessage(update: StuckUpdate) {
  return update.isStuck
    ? `${update.playerName} marked stuck`
    : `${update.playerName} cleared stuck`;
}

function getStuckStatusToastDescription(update: StuckUpdate) {
  return `${update.stuckCount}/${update.stuckTotal} players marked stuck`;
}
