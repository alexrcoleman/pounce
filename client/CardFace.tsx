import React from "react";
import {
  FACE_CARD_ART_SRC,
  type FaceCardColor,
  type FaceCardRank,
} from "../shared/gameAssets";
import joinClasses from "./joinClasses";
import styles from "./CardFace.module.css";

const CardFace = React.memo(function CardFace({
  value,
  suit,
}: {
  value: number;
  suit: string;
}) {
  const valueText =
    value === 1
      ? "A"
      : value === 11
      ? "J"
      : value === 12
      ? "Q"
      : value === 13
      ? "K"
      : String(value);
  const icon = getIcon(suit);
  const faceCardArtSrc = getFaceCardArtSrc(value, suit);
  const gridRowCount = 25;
  return (
    <div
      className={joinClasses(
        styles.root,
        suit === "clubs" || suit === "spades"
          ? styles.blackCard
          : styles.redCard
      )}
    >
      {faceCardArtSrc ? (
        <img
          className={styles.faceCardArt}
          src={faceCardArtSrc}
          alt=""
          aria-hidden="true"
          decoding="async"
          draggable={false}
        />
      ) : value === 1 ? (
        <span className={styles.acePip}>{icon}</span>
      ) : (
        <div
          className={styles.frontGrid}
          style={{
            gridTemplateRows: `repeat(${gridRowCount}, minmax(0, 1fr))`,
          }}
        >
          {cardPatterns[value].map((count, colIndex) =>
            Array(count)
              .fill(0)
              .map((_, index) => {
                const max = Math.max(
                  cardPatterns[value][0],
                  cardPatterns[value][1]
                );
                let row = ((gridRowCount - 1) / (max - 1)) * index;
                if (colIndex === 1) {
                  if (cardPatterns[value][0] != 0) {
                    row +=
                      (gridRowCount - 1) / (cardPatterns[value][0] - 1) / 2;
                  }

                  if (
                    (value === 10 && index === 1) ||
                    (value === 9 && index === 0)
                  ) {
                    row += (gridRowCount - 1) / (cardPatterns[value][0] - 1);
                  }
                }
                return (
                  <div
                    className={styles.pip}
                    key={`${colIndex}-${index}`}
                    style={{
                      left: `${pipColumnPositions[colIndex]}%`,
                      top: `${((row + 0.5) / gridRowCount) * 100}%`,
                      transform: `translate(-50%, -50%)${
                        row > gridRowCount / 2 + 1 ? " scale(1, -1)" : ""
                      }`,
                    }}
                  >
                    {icon}
                  </div>
                );
              })
          )}
        </div>
      )}
      <span className={styles.centerSuit} aria-hidden="true">
        {icon}
      </span>
      <div className={`${styles.corner} ${styles.cornerTopLeft}`}>
        <div className={styles.cornerValue}>{valueText}</div>
        {icon}
      </div>
      <div className={`${styles.corner} ${styles.cornerBottomRight}`}>
        <div className={styles.cornerValue}>{valueText}</div>
        {icon}
      </div>
    </div>
  );
});
export default CardFace;

function getIcon(type: string): string {
  if (type === "clubs") {
    return "\u2663";
  } else if (type === "diamonds") {
    return "\u2666";
  } else if (type === "hearts") {
    return "\u2665";
  } else {
    return "\u2660";
  }
}

function getFaceCardArtSrc(value: number, suit: string): string | null {
  const rank: FaceCardRank | null =
    value === 11
      ? "jack"
      : value === 12
      ? "queen"
      : value === 13
      ? "king"
      : null;
  if (!rank) {
    return null;
  }

  const color: FaceCardColor =
    suit === "clubs" || suit === "spades" ? "black" : "red";
  return FACE_CARD_ART_SRC[color][rank];
}

const cardPatterns = [
  [],
  [0, 1, 0],
  [0, 2, 0],
  [0, 3, 0],
  [2, 0, 2],
  [2, 1, 2],
  [3, 0, 3],
  [3, 1, 3],
  [3, 2, 3],
  [4, 1, 4],
  [4, 2, 4],
  [],
  [],
  [],
];

const pipColumnPositions = [24, 50, 76];
