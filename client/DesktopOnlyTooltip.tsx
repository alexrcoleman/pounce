import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";

import { Tooltip } from "antd";
import isTouchDevice from "./isTouchDevice";

type Props = {
  children: ReactElement;
  title: ReactNode;
};

export default function DesktopOnlyTooltip({ children, title }: Props) {
  const [isEnabled, setEnabled] = useState(false);

  useEffect(() => {
    const updateEnabled = () => {
      const hasMouseLikePointer = window.matchMedia(
        "(hover: hover) and (pointer: fine)"
      ).matches;
      setEnabled(hasMouseLikePointer && !isTouchDevice());
    };

    updateEnabled();
    window.addEventListener("resize", updateEnabled);
    return () => window.removeEventListener("resize", updateEnabled);
  }, []);

  return (
    <Tooltip title={isEnabled ? title : null} trigger={["hover", "focus"]}>
      {children}
    </Tooltip>
  );
}
