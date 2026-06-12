import type { Preview } from "@storybook/react";

import { ASSET_STYLES } from "../shared/gameAssets";
import "../styles/globals.css";

if (typeof document !== "undefined") {
  const styleId = "pounce-storybook-asset-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = ASSET_STYLES;
    document.head.appendChild(style);
  }
}

const preview: Preview = {
  parameters: {
    controls: {
      expanded: true,
    },
    layout: "centered",
  },
};

export default preview;
