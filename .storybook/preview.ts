import type { Preview } from "@storybook/react";

import "../styles/globals.css";

const preview: Preview = {
  parameters: {
    controls: {
      expanded: true,
    },
    layout: "centered",
  },
};

export default preview;
