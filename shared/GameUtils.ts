import shuffle from "./shuffle";

const colors = ["red", "blue", "green", "orange", "yellow", "pink"];
const SUITS = ["hearts", "spades", "diamonds", "clubs"] as const;
const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
export type Suits = (typeof SUITS)[number];
export type Values = (typeof VALUES)[number];
export type CardState = {
  suit: Suits;
  value: Values;
  player: number;
};
export type PlayerState = {
  isSpectating?: boolean;
  disconnected?: boolean;
  socketId: string | null;
  name: string;
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
  ticksSinceMove: number;
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
  const adjs = ["Happy", "Rude", "Speedy", "Slow", "Magic", "Good"];
  const nouns = ["Ninja", "Pouncer", "Player", "Tomato", "Banana", "Doggy"];
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
    ticksSinceMove: 0,
  };
  resetBoard(boardState);
  return boardState;
}

export function addPlayer(
  board: BoardState,
  socketId: string | null,
  name?: string
) {
  const roundCount = board.players[0]?.scores?.length ?? 0;
  const usedColors = board.players.map((p) => p.color);
  const available = colors.filter((c) => !usedColors.includes(c));
  const player = createPlayer(
    socketId,
    board.players.length,
    name ?? randomName(),
    available[0]
  );
  player.scores = Array(roundCount).fill(null);
  board.players.push(player);

  if (board.isActive) {
    player.isSpectating = true;
  } else {
    board.piles.push([], [], [], []);
    board.pileLocs = generateLocations(board.players.length * 4);
  }
  return board.players.length - 1;
}
export function removePlayer(board: BoardState, ...indices: number[]) {
  const sorted = indices.slice().sort().reverse();
  sorted.forEach((i) => board.players.splice(i, 1));
  for (let i = 0; i < 4; i++) {
    board.pileLocs.pop();
    board.piles.pop();
  }
  // Just reset the board
  resetBoard(board);
}

export function isGameOver(board: BoardState) {
  return (
    board.players.find((p) => !p.isSpectating && p.pounceDeck.length === 0) !=
    null
  );
}

function updateQueuedHands(
  board: BoardState,
  queuedHands: CardState[][][],
  queuedHand: CardState[][] | undefined
) {
  if (queuedHands.length === 0 && queuedHand == null) {
    // Queue up all combinations of this hand for fairness
    console.log("Queueing up hands for next game");
    const players = board.players;
    for (let o = 1; o < players.length; o++) {
      queuedHands.push(
        players.map((_, i) =>
          players[(i + o) % players.length].deck.map((c) => ({ ...c }))
        )
      );
    }
  }
}
export function startGame(room: {
  board: BoardState;
  queuedHands: CardState[][][];
}) {
  const { board, queuedHands } = room;
  const queuedHand = queuedHands.splice(0, 1);
  if (queuedHand.length > 0) {
    console.log("Playing queued hand");
  }
  resetBoard(board, queuedHand[0]);
  updateQueuedHands(board, queuedHands, queuedHand[0]);
  dealHands(board);
  board.players.forEach((p) => (p.currentPoints = -26));
  board.isActive = true;
}

function dealHands(board: BoardState) {
  board.players.forEach((player, index) => {
    if (player.isSpectating) {
      return;
    }
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        player.pounceDeck.push(player.deck.pop() as CardState);
      }
      player.stacks[i].push(player.deck.pop() as CardState);
    }
    player.pounceDeck.push(player.deck.pop() as CardState);
  });
}

export function resetBoard(boardState: BoardState, decks?: CardState[][]) {
  boardState.ticksSinceMove = 0;
  boardState.pouncer = undefined;
  boardState.players.forEach((player, index) => {
    player.deck =
      decks?.[index]?.map((c) => ({ ...c, player: index })) ??
      createShuffledDeck(index);
    player.flippedDeck = [];
    player.pounceDeck = [];
    if (boardState.isActive) {
      player.totalPoints += player.currentPoints;
      player.scores.push(player.currentPoints);
      player.currentPoints = 0;
    }
    player.stacks = [[], [], [], []];
    // player.isSpectating = false; @nocommit
  });
  boardState.isActive = false;
  boardState.piles = Array(boardState.players.length * 4)
    .fill(0)
    .map(() => []);
  boardState.pileLocs = generateLocations(boardState.players.length * 4);
}

export function rotateDecks(board: BoardState) {
  board.ticksSinceMove = 0;
  board.players.forEach((player) => {
    player.deck.push(...player.flippedDeck.reverse());
    player.flippedDeck = [];
    player.deck.unshift(player.deck.pop() as CardState);
  });
}

export function scoreBoard(board: BoardState) {
  const pouncer = board.players.findIndex(
    (p) => !p.isSpectating && p.pounceDeck.length === 0
  );
  board.isActive = false;
  board.pouncer = pouncer;
  board.players.forEach((player) => {
    if (!player.isSpectating) {
      player.totalPoints += player.currentPoints;
      player.scores.push(player.currentPoints);
    } else {
      player.scores.push(null);
    }
    player.currentPoints = 0;
  });
}
