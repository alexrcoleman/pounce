import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode, CSSProperties } from "react";

import CardFace from "./CardFace";

type Suit = "clubs" | "diamonds" | "hearts" | "spades";
type Readability = "standard" | "easy";

type CardFaceStoryArgs = {
  readability: Readability;
  scale: number;
  suit: Suit;
  value: number;
};

const suits: Suit[] = ["spades", "hearts", "clubs", "diamonds"];
const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

const meta = {
  title: "Cards/CardFace",
  component: CardFace,
  argTypes: {
    readability: {
      control: "inline-radio",
      options: ["standard", "easy"],
    },
    scale: {
      control: { type: "range", min: 1, max: 4, step: 0.25 },
    },
    suit: {
      control: "inline-radio",
      options: suits,
    },
    value: {
      control: { type: "range", min: 1, max: 13, step: 1 },
    },
  },
  args: {
    readability: "easy",
    scale: 2,
    suit: "spades",
    value: 12,
  },
} satisfies Meta<CardFaceStoryArgs>;

export default meta;
type Story = StoryObj<CardFaceStoryArgs>;

export const Playground: Story = {
  render: ({ readability, scale, suit, value }) => (
    <CardFrame readability={readability} scale={scale}>
      <CardFace suit={suit} value={value} />
    </CardFrame>
  ),
};

export const Comparison: Story = {
  render: () => (
    <div style={comparisonLayout}>
      <CardGroup title="Standard">
        {values.map((value) => (
          <CardFrame key={value} readability="standard" scale={1.5}>
            <CardFace
              suit={value % 2 === 0 ? "hearts" : "spades"}
              value={value}
            />
          </CardFrame>
        ))}
      </CardGroup>
      <CardGroup title="Easy-read">
        {values.map((value) => (
          <CardFrame key={value} readability="easy" scale={1.5}>
            <CardFace
              suit={value % 2 === 0 ? "hearts" : "spades"}
              value={value}
            />
          </CardFrame>
        ))}
      </CardGroup>
    </div>
  ),
};

export const EasyReadSuits: Story = {
  render: () => (
    <CardGroup title="Easy-read suits">
      {suits.map((suit) => (
        <CardFrame key={suit} readability="easy" scale={2.5}>
          <CardFace suit={suit} value={1} />
        </CardFrame>
      ))}
      {suits.map((suit) => (
        <CardFrame key={`${suit}-queen`} readability="easy" scale={2.5}>
          <CardFace suit={suit} value={12} />
        </CardFrame>
      ))}
    </CardGroup>
  ),
};

function CardGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section style={groupStyle}>
      <h2 style={headingStyle}>{title}</h2>
      <div style={cardGridStyle}>{children}</div>
    </section>
  );
}

function CardFrame({
  children,
  readability,
  scale,
}: {
  children: ReactNode;
  readability: Readability;
  scale: number;
}) {
  return (
    <div
      data-card-readability={readability}
      style={{
        ...scaledFrameStyle,
        height: 77 * scale,
        width: 55 * scale,
      }}
    >
      <div
        style={{
          ...cardShellStyle,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

const comparisonLayout: CSSProperties = {
  display: "grid",
  gap: 28,
  maxWidth: 1180,
};

const groupStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const headingStyle: CSSProperties = {
  color: "#2e261e",
  fontFamily: "system-ui, sans-serif",
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 0,
  lineHeight: 1.2,
  margin: 0,
};

const cardGridStyle: CSSProperties = {
  alignItems: "start",
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const scaledFrameStyle: CSSProperties = {
  filter: "drop-shadow(2px 3px 4px rgba(0, 0, 0, 0.22))",
};

const cardShellStyle: CSSProperties = {
  borderRadius: 4,
  height: 77,
  overflow: "hidden",
  transformOrigin: "0 0",
  width: 55,
};
