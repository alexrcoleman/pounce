import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import {
  AIDifficultyControl,
  type AIDifficultyMode,
} from "./Header";
import styles from "./Header.module.css";

type AIDifficultyStoryArgs = {
  initialCustomSpeed: number;
  initialMode: AIDifficultyMode;
  width: number;
};

const modes: AIDifficultyMode[] = ["easy", "medium", "hard", "custom"];

const meta = {
  title: "Settings/AIDifficulty",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    initialCustomSpeed: {
      control: { type: "range", min: 1, max: 10, step: 1 },
    },
    initialMode: {
      control: "inline-radio",
      options: modes,
    },
    width: {
      control: { type: "range", min: 280, max: 420, step: 10 },
    },
  },
  args: {
    initialCustomSpeed: 7,
    initialMode: "easy",
    width: 380,
  },
} satisfies Meta<AIDifficultyStoryArgs>;

export default meta;
type Story = StoryObj<AIDifficultyStoryArgs>;

export const Interactive: Story = {
  render: (args) => <AIDifficultyStoryFrame {...args} />,
};

export const Custom: Story = {
  args: {
    initialCustomSpeed: 7,
    initialMode: "custom",
  },
  render: (args) => <AIDifficultyStoryFrame {...args} />,
};

export const AllStates: Story = {
  render: () => (
    <div style={gridStyle}>
      <AIDifficultyStaticFrame mode="easy" title="Easy" />
      <AIDifficultyStaticFrame mode="medium" title="Medium" />
      <AIDifficultyStaticFrame mode="hard" title="Hard" />
      <AIDifficultyStaticFrame customSpeed={7} mode="custom" title="Custom" />
    </div>
  ),
};

export const Narrow: Story = {
  args: {
    initialCustomSpeed: 8,
    initialMode: "custom",
    width: 300,
  },
  render: (args) => <AIDifficultyStoryFrame {...args} />,
};

function AIDifficultyStoryFrame({
  initialCustomSpeed,
  initialMode,
  width,
}: AIDifficultyStoryArgs) {
  const [mode, setMode] = useState<AIDifficultyMode>(initialMode);
  const [customSpeed, setCustomSpeed] = useState(initialCustomSpeed);

  useEffect(() => {
    setMode(initialMode);
    setCustomSpeed(initialCustomSpeed);
  }, [initialCustomSpeed, initialMode]);

  return (
    <AIDifficultyFrame title="AI" width={width}>
      <AIDifficultyControl
        customSpeed={customSpeed}
        mode={mode}
        onSelectMode={(nextMode) => {
          setMode(nextMode);
          const presetSpeed = getPresetSpeed(nextMode);
          if (presetSpeed != null) {
            setCustomSpeed(presetSpeed);
          }
        }}
        onSetCustomSpeed={(speed) => {
          setMode("custom");
          setCustomSpeed(clampCustomSpeed(speed));
        }}
      />
    </AIDifficultyFrame>
  );
}

function AIDifficultyStaticFrame({
  customSpeed = 3,
  mode,
  title,
}: {
  customSpeed?: number;
  mode: AIDifficultyMode;
  title: string;
}) {
  return (
    <AIDifficultyFrame title={title} width={360}>
      <AIDifficultyControl
        customSpeed={customSpeed}
        mode={mode}
        onSelectMode={() => undefined}
        onSetCustomSpeed={() => undefined}
      />
    </AIDifficultyFrame>
  );
}

function AIDifficultyFrame({
  children,
  title,
  width,
}: {
  children: ReactNode;
  title: string;
  width: number;
}) {
  return (
    <section className={styles.settingsSection} style={{ width }}>
      <h3>{title}</h3>
      <div className={styles.settingsSectionBody}>{children}</div>
    </section>
  );
}

function getPresetSpeed(mode: AIDifficultyMode): number | null {
  switch (mode) {
    case "easy":
      return 3;
    case "medium":
      return 4;
    case "hard":
      return 5;
    default:
      return null;
  }
}

function clampCustomSpeed(speed: number): number {
  if (!Number.isFinite(speed)) {
    return 3;
  }
  return Math.max(1, Math.min(10, Math.round(speed)));
}

const gridStyle: CSSProperties = {
  alignItems: "start",
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};
