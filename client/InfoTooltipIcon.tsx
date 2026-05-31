import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Tooltip } from "antd";
import styles from "./InfoTooltipIcon.module.css";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> & {
  "aria-label": string;
  children: ReactNode;
  tooltipClassName?: string;
  tooltipOpen?: boolean;
};

export default function InfoTooltipIcon({
  "aria-label": ariaLabel,
  children,
  className,
  tooltipClassName,
  tooltipOpen,
  ...buttonProps
}: Props) {
  return (
    <Tooltip
      overlayClassName={tooltipClassName}
      open={tooltipOpen}
      title={children}
      trigger={["hover", "focus", "click"]}
    >
      <button
        {...buttonProps}
        aria-label={ariaLabel}
        className={[styles.button, className ?? ""].filter(Boolean).join(" ")}
        type="button"
      >
        <span aria-hidden="true" className={styles.glyph}>
          i
        </span>
      </button>
    </Tooltip>
  );
}
