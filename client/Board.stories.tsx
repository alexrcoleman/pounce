import type { Meta, StoryObj } from "@storybook/react";
import { useMemo } from "react";

import Board from "./Board";
import { ClientContext } from "./ClientContext";
import SocketState from "./SocketState";
import type { CardState, Suits, Values } from "../shared/GameUtils";
import { scoreBoard } from "../shared/GameUtils";
import { createRoomState } from "../shared/RoomState";
import { dealRoomHands, startRoomGame } from "../shared/RoomLogic";
import type { RoundAnalysis } from "../shared/RoundAnalysis";

type BoardStoryArgs = {
  easyReadCards: boolean;
  height: number;
  playerCount: number;
  width: number;
  zoom: number;
};

const meta = {
  title: "Board/Layout",
  component: Board,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    easyReadCards: {
      control: "boolean",
    },
    height: {
      control: { type: "range", min: 560, max: 920, step: 20 },
    },
    playerCount: {
      control: { type: "range", min: 2, max: 6, step: 1 },
    },
    width: {
      control: { type: "range", min: 320, max: 1440, step: 20 },
    },
    zoom: {
      control: { type: "range", min: 0.7, max: 1.4, step: 0.05 },
    },
  },
  args: {
    easyReadCards: true,
    height: 760,
    playerCount: 4,
    width: 1200,
    zoom: 1,
  },
} satisfies Meta<BoardStoryArgs>;

export default meta;
type Story = StoryObj<BoardStoryArgs>;

export const MainPlayerSpacing: Story = {
  render: (args) => <BoardStoryFrame {...args} />,
};

export const FullSolitairePile: Story = {
  args: {
    height: 720,
    width: 390,
  },
  render: (args) => <BoardStoryFrame {...args} fullSolitairePile />,
};

export const PostRoundAnalysis: Story = {
  args: {
    height: 760,
    width: 1120,
  },
  render: (args) => <BoardStoryFrame {...args} postRound />,
};

function BoardStoryFrame({
  easyReadCards,
  fullSolitairePile = false,
  height,
  postRound = false,
  playerCount,
  width,
  zoom,
}: BoardStoryArgs & { fullSolitairePile?: boolean; postRound?: boolean }) {
  const state = useMemo(
    () => createBoardStoryState(playerCount, { fullSolitairePile, postRound }),
    [fullSolitairePile, playerCount, postRound]
  );

  return (
    <ClientContext.Provider value={{ socket: null, state }}>
      <div
        style={{
          background: "#cd9b60",
          height,
          maxHeight: "100vh",
          maxWidth: "100vw",
          overflow: "hidden",
          width,
        }}
      >
        <Board
          easyReadCards={easyReadCards}
          executeMove={() => undefined}
          isLeftHandedLayout={false}
          onOpenRoomSettings={() => undefined}
          onUpdateHand={() => undefined}
          roomId="storybook"
          zoom={zoom}
        />
      </div>
    </ClientContext.Provider>
  );
}

function createBoardStoryState(
  playerCount: number,
  {
    fullSolitairePile = false,
    postRound = false,
  }: { fullSolitairePile?: boolean; postRound?: boolean } = {}
) {
  const state = new SocketState();
  const room = createRoomState(playerCount);
  const activeSocketId = "storybook-player-0";
  room.board.players.forEach((player, index) => {
    player.name = index === 0 ? "You" : `Player ${index + 1}`;
    player.socketId = index === 0 ? activeSocketId : null;
  });

  dealRoomHands(room);
  startRoomGame(room);
  tuneActivePlayerHand(room.board.players[0]);
  if (fullSolitairePile) {
    tuneActivePlayerFullPile(room.board.players[0]);
  }
  const pileLocs: [number, number, number][] = [
    [0.12, 0.12, 0.02],
    [0.36, 0.1, 0.32],
    [0.64, 0.12, 0.68],
    [0.86, 0.18, 0.18],
    [0.2, 0.42, 0.44],
    [0.48, 0.38, 0.73],
    [0.74, 0.42, 0.11],
    [0.34, 0.72, 0.56],
    [0.62, 0.7, 0.84],
    [0.86, 0.68, 0.27],
    [0.1, 0.78, 0.39],
    [0.58, 0.88, 0.62],
    [0.76, 0.82, 0.04],
    [0.92, 0.48, 0.91],
    [0.08, 0.54, 0.21],
    [0.42, 0.9, 0.49],
    [0.52, 0.18, 0.77],
    [0.68, 0.58, 0.35],
    [0.24, 0.24, 0.65],
    [0.9, 0.86, 0.12],
    [0.16, 0.9, 0.81],
    [0.44, 0.62, 0.23],
    [0.72, 0.28, 0.58],
    [0.3, 0.5, 0.16],
  ];
  room.board.pileLocs = pileLocs.slice(0, room.board.piles.length);
  if (postRound) {
    finishStoryRound(room.board);
  }

  state.onConnect(activeSocketId);
  state.onUpdate({
    board: room.board,
    revision: 1,
    roundAnalysis: postRound ? createStoryRoundAnalysis(room.board) : null,
    settings: room.settings,
    time: Date.now(),
  });
  return state;
}

function finishStoryRound(board: ReturnType<typeof createRoomState>["board"]) {
  board.players.forEach((player, index) => {
    player.currentPoints = index === 0 ? 18 : index === 1 ? 7 : -3 - index;
  });
  board.players[0].pounceDeck = [];
  scoreBoard(board);
}

function createStoryRoundAnalysis(
  board: ReturnType<typeof createRoomState>["board"]
): RoundAnalysis {
  const roundEndedAt = Date.now();
  const durationMs = 74_000;
  const scores = board.players.map(
    (player) => player.scores[player.scores.length - 1] ?? 0
  );
  const predictedScores = scores.map(
    (score, playerIndex) => score + (playerIndex === 0 ? -2.6 : 1.2)
  );
  const scoreTotal = scores.reduce((sum, score) => sum + score, 0);
  const predictedScoreTotal = predictedScores.reduce(
    (sum, score) => sum + score,
    0
  );
  const predictedRanks = predictedScores.map((score, playerIndex) => {
    return (
      predictedScores.filter(
        (otherScore, otherPlayerIndex) =>
          otherScore > score ||
          (otherScore === score && otherPlayerIndex < playerIndex)
      ).length + 1
    );
  });

  return {
    version: 4,
    roundStartedAt: roundEndedAt - durationMs,
    roundEndedAt,
    durationMs,
    pouncerIndex: board.pouncer ?? null,
    playerReports: board.players.map((player, playerIndex) => {
      const centerPlayOpportunities = 12 + playerIndex;
      const centerPlaysMade = Math.max(4, 9 - playerIndex);
      const solitairePlayOpportunities = 10 + playerIndex;
      const solitairePlaysMade = Math.max(3, 7 - playerIndex);
      const contestedCenterOpportunities = 4 + playerIndex;
      const contestedCenterWins = Math.max(1, 3 - playerIndex);
      const score = scores[playerIndex];
      const predictedScore = predictedScores[playerIndex];

      return {
        playerIndex,
        playerName: player.name,
        playerColor: player.color,
        score,
        pointDifferential: getStoryPointDifferential(
          score,
          scoreTotal,
          board.players.length
        ),
        pounceCardsLeft: player.pounceDeck.length,
        pounceDeck: player.pounceDeck.map((card) => ({
          card,
          played: false,
        })),
        dealSimulation: {
          playerIndex,
          predictedScore,
          predictedScoreConfidenceInterval95: 2.4 + playerIndex * 0.3,
          predictedPointDifferential: getStoryPointDifferential(
            predictedScore,
            predictedScoreTotal,
            board.players.length
          ),
          predictedPointDifferentialConfidenceInterval95:
            5.8 + playerIndex * 0.7,
          predictedRank: predictedRanks[playerIndex],
          simulationCount: 16,
          pounceOutRate: playerIndex === 0 ? 0.5 : 0.2,
          averagePounceCardsLeft: player.pounceDeck.length + playerIndex * 0.5,
        },
        summary: {
          missedCenterPlays: playerIndex === 0 ? 1 : 3 + playerIndex,
          missedPounceHelpers: playerIndex === 0 ? 0 : 1,
          cycledPastPlayableCards: playerIndex,
          beatenToCenter: playerIndex === 0 ? 0 : 1,
          solitaireMoves: solitairePlaysMade,
          cardsPlayedToCenter: centerPlaysMade,
          deckCycles: 5 + playerIndex,
          deckCyclesPerSecond: (5 + playerIndex) / (durationMs / 1000),
          centerPlaysMade,
          centerPlayOpportunities,
          centerPlayRate: centerPlaysMade / centerPlayOpportunities,
          solitairePlaysMade,
          solitairePlayOpportunities,
          solitairePlayRate:
            solitairePlaysMade / solitairePlayOpportunities,
          contestedCenterWins,
          contestedCenterOpportunities,
          contestedCenterWinRate:
            contestedCenterWins / contestedCenterOpportunities,
          delayedPlays: playerIndex === 0 ? 1 : 2,
          totalMissedMs: playerIndex === 0 ? 1200 : 3600,
          longestMissMs: playerIndex === 0 ? 1200 : 2400,
        },
        highlights: [],
      };
    }),
  };
}

function getStoryPointDifferential(
  score: number,
  totalScore: number,
  playerCount: number
): number {
  if (playerCount <= 1) {
    return 0;
  }
  return score * playerCount - totalScore;
}

function tuneActivePlayerFullPile(player: {
  deck: CardState[];
  flippedDeck: CardState[];
  pounceDeck: CardState[];
  stacks: [CardState[], CardState[], CardState[], CardState[]];
}) {
  const cards = createOrderedDeck(0);
  const take = (value: Values, suit: Suits) => {
    const index = cards.findIndex(
      (card) => card.value === value && card.suit === suit
    );
    return cards.splice(index, 1)[0];
  };

  player.stacks[0] = [
    take(13, "spades"),
    take(12, "hearts"),
    take(11, "clubs"),
    take(10, "diamonds"),
    take(9, "spades"),
    take(8, "hearts"),
    take(7, "clubs"),
    take(6, "diamonds"),
    take(5, "spades"),
    take(4, "hearts"),
    take(3, "clubs"),
    take(2, "diamonds"),
    take(1, "spades"),
  ];
  player.stacks[1] = [
    take(13, "hearts"),
    take(12, "clubs"),
    take(11, "diamonds"),
    take(10, "spades"),
  ];
  player.stacks[2] = [
    take(13, "clubs"),
    take(12, "diamonds"),
    take(11, "spades"),
    take(10, "hearts"),
  ];
  player.stacks[3] = [
    take(13, "diamonds"),
    take(12, "spades"),
    take(11, "hearts"),
    take(10, "clubs"),
  ];
  player.pounceDeck = cards.splice(0, 13);
  player.flippedDeck = cards.splice(0, 3);
  player.deck = cards;
}

function tuneActivePlayerHand(player: {
  deck: CardState[];
  flippedDeck: CardState[];
  pounceDeck: CardState[];
  stacks: [CardState[], CardState[], CardState[], CardState[]];
}) {
  const cards = createOrderedDeck(0);
  const take = (value: Values, suit: Suits) => {
    const index = cards.findIndex(
      (card) => card.value === value && card.suit === suit
    );
    return cards.splice(index, 1)[0];
  };

  player.stacks = [
    [
      take(13, "spades"),
      take(12, "hearts"),
      take(11, "clubs"),
      take(10, "diamonds"),
      take(9, "spades"),
      take(8, "hearts"),
    ],
    [
      take(12, "spades"),
      take(11, "hearts"),
      take(10, "clubs"),
      take(9, "diamonds"),
      take(8, "spades"),
    ],
    [
      take(11, "spades"),
      take(10, "hearts"),
      take(9, "clubs"),
      take(8, "diamonds"),
      take(7, "spades"),
    ],
    [
      take(10, "spades"),
      take(9, "hearts"),
      take(8, "clubs"),
      take(7, "diamonds"),
    ],
  ];
  player.pounceDeck = cards.splice(0, 13);
  player.flippedDeck = cards.splice(0, 3);
  player.deck = cards;
}

function createOrderedDeck(player: number): CardState[] {
  const suits: Suits[] = ["spades", "hearts", "clubs", "diamonds"];
  const values: Values[] = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  return suits.flatMap((suit) =>
    values.map((value) => ({ player, suit, value }))
  );
}
