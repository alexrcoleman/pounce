import { getDistance } from "./MoveHandler";
import shuffle from "./shuffle";

const colors = ["red", "blue", "green", "orange", "yellow", "pink"];
const SUITS = ["hearts", "spades", "diamonds", "clubs"] as const;
const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
export type Suits = (typeof SUITS)[number];
export type Values = (typeof VALUES)[number];

export type CursorLocation =
  | CardState
  | { type: "solitaire_slot"; player: number; pileIndex: number }
  | { type: "field_slot"; position: [number, number] };

export type CursorState = {
  location?: CursorLocation | null;
  item?: CardState | null;
  items?: CardState[] | null;
};

export type CardState = {
  suit: Suits;
  value: Values;
  player: number;
};

export function isCardCursorLocation(
  location: CursorLocation | null | undefined
): location is CardState {
  return location != null && !("type" in location);
}

export function cursorLocationsEqual(
  a: CursorLocation | null | undefined,
  b: CursorLocation | null | undefined
): boolean {
  if (a == null || b == null) {
    return a == null && b == null;
  }
  if (isCardCursorLocation(a) || isCardCursorLocation(b)) {
    return (
      isCardCursorLocation(a) &&
      isCardCursorLocation(b) &&
      a.player === b.player &&
      a.suit === b.suit &&
      a.value === b.value
    );
  }
  if (a.type === "solitaire_slot" && b.type === "solitaire_slot") {
    return a.player === b.player && a.pileIndex === b.pileIndex;
  }
  if (a.type === "field_slot" && b.type === "field_slot") {
    return a.position[0] === b.position[0] && a.position[1] === b.position[1];
  }
  return false;
}

export function getCursorItemCards(cursor: CursorState): CardState[] {
  if (cursor.items && cursor.items.length > 0) {
    return cursor.items;
  }
  return cursor.item ? [cursor.item] : [];
}
export type PlayerState = {
  isSpectating?: boolean;
  isWaitingForDeal?: boolean;
  isReadyForRound?: boolean;
  disconnected?: boolean;
  disconnectedAt?: number;
  playerSessionId: string | null;
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
  isDealt: boolean;
  isPaused: boolean;
  players: PlayerState[];
  piles: CardState[][];
  pileLocs: [number, number, number][];
  ticksSinceMove: number;
};
type StartGameRoomState = {
  board: BoardState;
  hands: CursorState[];
  queuedHands: CardState[][][];
  settings: {
    fairHandRotation: boolean;
  };
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
      isInvalid = locs.some(
        (loc) => getDistance([loc[0], loc[1]], [x, y]) < minDistance * 2
      );
    } while (isInvalid && ++failCount < 20);
    if (isInvalid) {
      return generateLocations(count, threshold - 0.05);
    }
    locs.push([x, y, Math.random()]);
  }
  return locs;
}

export function fixBoardPiles(
  board: BoardState,
  index: number,
  threshold = 0.7
): void {
  const count = board.pileLocs.length;
  const minDistance = Math.sqrt(threshold / count / Math.PI);
  const corruptLoc = [
    board.pileLocs[index][0],
    board.pileLocs[index][1],
  ] as const;
  const pileLocs = board.pileLocs;
  // Find indices overlapping with corruptLoc and empty piles
  const badIndices = pileLocs
    .map((loc, index) =>
      getDistance([loc[0], loc[1]], corruptLoc) < minDistance &&
      board.piles[index].length === 0
        ? index
        : -1
    )
    .filter((index) => index !== -1);

  if (badIndices.length === 0) {
    return;
  }
  console.log("Detected invisible card collision, fixing piles");

  const lockedInLocs = pileLocs
    .filter((_, index) => !badIndices.includes(index))
    .map((loc) => [loc[0], loc[1]] as const);

  while (badIndices.length > 0) {
    const badIndex = badIndices.pop() as number;
    let x: number, y: number;
    let isInvalid = true;
    let failCount = 0;
    do {
      x = Math.random();
      y = Math.random();
      isInvalid = lockedInLocs.some(
        (loc) => getDistance([loc[0], loc[1]], [x, y]) < minDistance * 2
      );
    } while (isInvalid && ++failCount < 20);
    if (isInvalid) {
      return fixBoardPiles(board, index, threshold - 0.05);
    }
    board.pileLocs[badIndex] = [x, y, Math.random()];
    lockedInLocs.push([x, y]);
  }
}

function createPlayer(
  socketId: string | null,
  playerSessionId: string | null,
  index: number,
  name: string,
  color: string
): PlayerState {
  return {
    name,
    socketId: socketId,
    playerSessionId,
    isReadyForRound: false,
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
    .map((_, index) =>
      createPlayer(null, null, index, randomName(), colors[index])
    );
  const boardState = {
    isActive: false,
    isDealt: false,
    isPaused: false,
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
  name?: string,
  playerSessionId?: string | null
) {
  const roundCount = board.players[0]?.scores?.length ?? 0;
  const usedColors = board.players.map((p) => p.color);
  const available = colors.filter((c) => !usedColors.includes(c));
  const player = createPlayer(
    socketId,
    playerSessionId ?? null,
    board.players.length,
    name ?? randomName(),
    available[0]
  );
  player.scores = Array(roundCount).fill(null);
  board.players.push(player);

  if (board.isActive || board.isDealt) {
    player.isSpectating = true;
    player.isWaitingForDeal = true;
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
  queuedHand: CardState[][] | undefined,
  fairHandRotation: boolean
) {
  if (!fairHandRotation) {
    queuedHands.length = 0;
    return;
  }

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
export function startGame(room: StartGameRoomState) {
  const { board } = room;
  if (!board.isDealt) {
    dealGameHands(room);
  }
  board.players.forEach((p) => (p.currentPoints = -26));
  board.isActive = true;
  board.isPaused = false;
  room.hands = [];
}

export function dealGameHands(room: StartGameRoomState): boolean {
  const { board, queuedHands } = room;
  if (board.isActive || board.isDealt) {
    return false;
  }
  const fairHandRotation = room.settings.fairHandRotation;
  const queuedHand = fairHandRotation ? queuedHands.splice(0, 1) : [];
  if (queuedHand.length > 0) {
    console.log("Dealing queued hand");
  }
  resetBoard(board, queuedHand[0]);
  updateQueuedHands(board, queuedHands, queuedHand[0], fairHandRotation);
  dealHands(board);
  board.isDealt = true;
  room.hands = [];
  return true;
}

function dealHands(board: BoardState) {
  board.players.forEach((player, index) => {
    if (player.isSpectating) {
      return;
    }
    dealPlayerHand(board, index);
  });
}

export function dealPlayerHand(board: BoardState, playerIndex: number): boolean {
  const player = board.players[playerIndex];
  if (!player || player.deck.length < 17) {
    return false;
  }

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      player.pounceDeck.push(player.deck.pop() as CardState);
    }
    player.stacks[i].push(player.deck.pop() as CardState);
  }
  player.pounceDeck.push(player.deck.pop() as CardState);
  return true;
}

export function resetCenterPiles(boardState: BoardState): void {
  boardState.piles = Array(boardState.players.length * 4)
    .fill(0)
    .map(() => []);
  boardState.pileLocs = generateLocations(boardState.players.length * 4);
}

export function resetBoard(boardState: BoardState, decks?: CardState[][]) {
  boardState.ticksSinceMove = 0;
  boardState.pouncer = undefined;
  boardState.isDealt = false;
  boardState.isPaused = false;
  boardState.players.forEach((player, index) => {
    player.deck =
      decks?.[index]?.map((c) => ({ ...c, player: index })) ??
      createShuffledDeck(index);
    player.flippedDeck = [];
    player.pounceDeck = [];
    player.isReadyForRound = false;
    if (boardState.isActive) {
      player.totalPoints += player.currentPoints;
      player.scores.push(player.currentPoints);
      player.currentPoints = 0;
    }
    player.stacks = [[], [], [], []];
  });
  boardState.isActive = false;
  resetCenterPiles(boardState);
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
  board.isDealt = false;
  board.isPaused = false;
  board.pouncer = pouncer;
  board.players.forEach((player) => {
    player.isReadyForRound = false;
    if (!player.isSpectating) {
      player.totalPoints += player.currentPoints;
      player.scores.push(player.currentPoints);
    } else {
      player.scores.push(null);
    }
    player.currentPoints = 0;
  });
}
