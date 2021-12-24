import "../styles/globals.css";

import { ComponentMeta, ComponentStory } from "@storybook/react";

import Card from "../client/Card";
import { DndProvider } from "react-dnd";
import FieldStackDragTarget from "../client/FieldStackDragTarget";
import { HTML5Backend } from "react-dnd-html5-backend";
import React from "react";
import StackDragTarget from "../client/StackDragTarget";
import { createBoard } from "../shared/GameUtils";

export default {
  title: "Pounce/Card",
  component: Card,
  argTypes: {
    color: { control: "color" },
  },
} as ComponentMeta<typeof Card>;

const Template: ComponentStory<typeof Card> = (args) => {
  const board = createBoard(1);
  return (
    <DndProvider backend={HTML5Backend}>
      <Card {...args} source={{ type: "pounce" }} boardState={board} />
    </DndProvider>
  );
};

export const FaceUp = Template.bind({});
FaceUp.args = {
  faceUp: true,
  card: { suit: "hearts", value: 9, player: 0 },
};

export const FaceDown = Template.bind({});
FaceDown.args = {
  faceUp: false,
  card: { suit: "hearts", value: 9, player: 0 },
};

export const Draggable: ComponentStory<typeof Card> = (args) => {
  const board = createBoard(1);
  const otherCard = { suit: "hearts", value: 3, player: 0 } as const;
  return (
    <DndProvider backend={HTML5Backend}>
      <div style={{ position: "fixed" }}>
        <Card
          {...args}
          faceUp={true}
          card={args.card ?? otherCard}
          source={{ type: "pounce" }}
          boardState={board}
        />
        <div style={{ position: "absolute", top: 0, left: 100 }}>
          <FieldStackDragTarget
            card={{ suit: "hearts", value: 2, player: 0 }}
            stackHeight={1}
            onDrop={() => console.log("Drop")}
          />
        </div>
        <div style={{ position: "absolute", top: 0, left: 200 }}>
          <StackDragTarget
            card={{ suit: "clubs", value: 4, player: 0 }}
            stackHeight={1}
            onDrop={() => console.log("Drop")}
          />
        </div>
      </div>
    </DndProvider>
  );
};
