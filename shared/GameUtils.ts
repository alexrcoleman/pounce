import shuffle from "./shuffle";

const colors = ["red", "blue", "green", "orange", "yellow", "pink"];
const SUITS = ["hearts", "spades", "diamonds", "clubs"] as const;
const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
export type Suits = typeof SUITS[number];
export type Values = typeof VALUES[number];
export type CardState = {
  suit: Suits;
  value: Values;
  player: number;
};
export type PlayerState = {
  socketId: string | null;
  name: string;
  index: number;
  color: string;
  stacks: [CardState[], CardState[], CardState[], CardState[]];
  pounceDeck: CardState[];
  deck: CardState[];
  flippedDeck: CardState[];
  totalPoints: number;
  currentPoints: number;
  scores: (number | null)[];
};
export type BoardState = {
  pouncer?: number;
  isActive: boolean;
  players: PlayerState[];
  piles: CardState[][];
  pileLocs: [number, number, number][];
};

function createUnshuffledDeck(player: number): CardState[] {
  return SUITS.flatMap((suit) =>
    VALUES.map((value) => ({ suit, value: value, player }))
  );
}
function createShuffledDeck(player: number): CardState[] {
  const deck = createUnshuffledDeck(player);
  return shuffle(deck);
}

function generateLocations(
  count: number,
  threshold = 0.7
): [number, number, number][] {
  const minDistance = Math.sqrt(threshold / count / Math.PI);
  const locs: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    let x: number, y: number;
    let isInvalid = true;
    let failCount = 0;
    do {
      x = Math.random();
      y = Math.random();
      isInvalid =
        locs.find(
          (loc) =>
            Math.sqrt(Math.pow(loc[0] - x, 2) + Math.pow(loc[1] - y, 2)) <
            minDistance * 2
        ) != null;
    } while (isInvalid && ++failCount < 20);
    if (isInvalid) {
      console.warn("Failed to generate locations, restarting...");
      return generateLocations(count, threshold - 0.05);
    }
    locs.push([x, y, Math.random()]);
  }
  return locs;
}
function createPlayer(
  socketId: string | null,
  index: number,
  name: string,
  color: string
): PlayerState {
  return {
    index,
    name,
    socketId: socketId,
    color,
    stacks: [[], [], [], []],
    pounceDeck: [],
    deck: createShuffledDeck(index),
    flippedDeck: [],
    totalPoints: 0,
    currentPoints: 0,
    scores: [],
  };
}

function randomName() {
  const adjs = ["Happy", "Funny", "Rude", "Speedy"];
  const nouns = ["Ninja", "Pouncer", "Player", "Tomato", "Banana"];
  return (
    adjs[Math.floor(Math.random() * adjs.length)] +
    " " +
    nouns[Math.floor(Math.random() * nouns.length)]
  );
}
export function createBoard(playerCount: number): BoardState {
  const players = Array(playerCount)
    .fill(0)
    .map((_, index) => createPlayer(null, index, randomName(), colors[index]));
  const boardState = {
    isActive: false,
    players,
    piles: Array(playerCount * 4)
      .fill(0)
      .map(() => []),
    pileLocs: generateLocations(playerCount * 4),
  };
  resetBoard(boardState);
  return boardState;
}

export function addPlayer(
  board: BoardState,
  socketId: string | null,
  name?: string
) {
  if (board.isActive) {
    console.warn("Game is active, cannot add player");
    return -1;
  }
  const roundCount = board.players[0]?.scores?.length ?? 0;
  const usedColors = board.players.map((p) => p.color);
  const available = colors.filter((c) => !usedColors.includes(c));
  board.players.push(
    createPlayer(
      socketId,
      board.players.length,
      name ?? randomName(),
      available[0]
    )
  );
  board.players[board.players.length - 1].scores = Array(roundCount).fill(null);
  board.piles.push([], [], [], []);
  board.pileLocs = generateLocations(board.players.length * 4);
  return board.players.length - 1;
}
export function removePlayer(board: BoardState, index: number) {
  board.players.splice(index, 1);
  for (let i = 0; i < 4; i++) {
    board.pileLocs.pop();
    board.piles.pop();
  }
  // Just reset the board
  resetBoard(board);
}

export function isGameOver(board: BoardState) {
  return board.players.find((p) => p.pounceDeck.length === 0) != null;
}

export function startGame(board: BoardState) {
  resetBoard(board);
  dealHands(board);
  board.players.forEach((p) => (p.currentPoints = -26));
  board.isActive = true;
}

function dealHands(board: BoardState) {
  board.players.forEach((player, index) => {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        player.pounceDeck.push(player.deck.pop() as CardState);
      }
      player.stacks[i].push(player.deck.pop() as CardState);
    }
    player.pounceDeck.push(player.deck.pop() as CardState);
  });
}

export function resetBoard(boardState: BoardState) {
  boardState.pouncer = undefined;
  boardState.players.forEach((player, index) => {
    player.deck = createShuffledDeck(index);
    player.flippedDeck = [];
    player.pounceDeck = [];
    if (boardState.isActive) {
      player.totalPoints += player.currentPoints;
      player.scores.push(player.currentPoints);
      player.currentPoints = 0;
    }
    player.stacks = [[], [], [], []];
  });
  boardState.isActive = false;
  boardState.piles = Array(boardState.players.length * 4)
    .fill(0)
    .map(() => []);
  boardState.pileLocs = generateLocations(boardState.players.length * 4);
}

export function rotateDecks(board: BoardState) {
  board.players.forEach((player) => {
    player.deck.push(...player.flippedDeck.reverse());
    player.flippedDeck = [];
    player.deck.unshift(player.deck.pop() as CardState);
  });
}

export function scoreBoard(board: BoardState) {
  const pouncer = board.players.findIndex((p) => p.pounceDeck.length === 0);
  board.isActive = false;
  board.pouncer = pouncer;
  board.players.forEach((player) => {
    player.totalPoints += player.currentPoints;
    player.scores.push(player.currentPoints);
    player.currentPoints = 0;
  });
}
