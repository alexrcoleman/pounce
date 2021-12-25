import "../styles/globals.css";

import { ComponentMeta, ComponentStory } from "@storybook/react";
import React, { useCallback, useMemo, useState } from "react";

import Board from "../client/Board";
import { createBoard } from "../shared/GameUtils";
import { executeMove } from "../shared/MoveHandler";

export default {
  title: "Pounce/Board",
  component: Board,
} as ComponentMeta<typeof Board>;

const templateGenerator = (count: number): ComponentStory<typeof Board> =>
  function Template(args) {
    const board = useMemo(() => createBoard(count), []);
    const [r, setR] = useState(0);
    const onMove = useCallback(
      (move) => {
        executeMove(board, args.playerIndex, move);
        setR((r) => r + 1);
      },
      [board, args.playerIndex]
    );
    return <Board {...args} board={board} executeMove={onMove} />;
  };

export const OnePlayer = templateGenerator(1);
OnePlayer.args = {
  playerIndex: 0,
};

export const TwoPlayer = templateGenerator(2);
TwoPlayer.args = {
  playerIndex: 1,
};

export const ThreePlayer = templateGenerator(3);
ThreePlayer.args = {
  playerIndex: 1,
};

export const FourPlayer = templateGenerator(4);
FourPlayer.args = {
  playerIndex: 1,
};
