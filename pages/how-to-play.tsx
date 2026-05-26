import Head from "next/head";
import Link from "next/link";
import type { NextPage } from "next";

import styles from "../client/HowToPlay.module.css";
import SeoHead from "../client/SeoHead";
import { FAVICON_SRC } from "../shared/gameAssets";
import {
  absoluteUrl,
  DEFAULT_SHARE_IMAGE_PATH,
  getSeoOrigin,
  SITE_NAME,
} from "../shared/seo";

const PAGE_PATH = "/how-to-play";
const PAGE_TITLE = "How to Play Pounce | Rules for Nerts and Nertz";
const PAGE_DESCRIPTION =
  "Learn how to play Pounce Online, a fast multiplayer solitaire card game also known as Nerts, Nertz, Racing Demon, and Peanuts.";
const KEYWORDS = [
  "Pounce rules",
  "how to play Pounce",
  "Pounce card game",
  "Nerts",
  "Nertz",
  "Nerts rules",
  "Nertz rules",
  "Racing Demon",
  "Peanuts card game",
  "Squeal card game",
  "competitive solitaire",
  "multiplayer solitaire",
  "speed solitaire",
  "play Pounce online",
];

const quickFacts = [
  ["Players", "2 or more players, with one deck per player in tabletop play."],
  ["Goal", "Empty your 13-card Pounce pile before the other players do."],
  ["Round pace", "Everyone plays at the same time. There are no turns."],
  ["Scoring", "Cards played to the center score; Pounce cards left cost points."],
] as const;

const setupSteps = [
  "Give each player a full 52-card deck. In person, the backs should be distinct so scoring is easy. Pounce Online handles the decks for you.",
  "Deal a 13-card Pounce pile. The top card is the active card you are trying to clear.",
  "Deal four work piles, one face-up card each. These are your personal solitaire stacks.",
  "Keep the rest of your deck as stock. Turn stock cards three at a time into your waste pile, where only the top card is available.",
  "Leave the middle of the table open for shared foundation piles that any player can build on.",
];

const playRules = [
  "Start shared foundation piles with Aces, then build upward by suit: Ace, 2, 3, and so on through King.",
  "Build your own work piles downward in alternating colors, just like the visible piles in Klondike solitaire.",
  "Move a visible work-pile card, the top waste card, or the top Pounce card to the center whenever it fits a foundation.",
  "Move cards or ordered runs between your own work piles when they fit. An ordered run must include the last visible card of the stack you are moving from, and empty work-pile spaces can help you free blocked Pounce cards.",
  "Keep flipping through your stock three cards at a time. When the stock runs out, turn the waste pile back over and continue.",
  "When a player empties the Pounce pile, the round ends. In Pounce Online, that happens automatically.",
];

const tips = [
  "Check the Pounce card first after every center move. Clearing that pile is the main path to ending the round.",
  "Do not tunnel on your own board. A shared foundation can change as soon as another player drops a card.",
  "Use work-pile moves to expose cards that help your Pounce pile, not just to make tidy stacks.",
  "Keep the stock moving when you are stuck. Fresh waste cards often create the next opening.",
];

const altNames = [
  "Nerts",
  "Nertz",
  "Racing Demon",
  "Peanuts",
  "Squeal",
  "Scrooge",
  "competitive solitaire",
  "multiplayer solitaire",
];

const ruleSources = [
  {
    name: "Pagat: Nerts / Pounce / Racing Demon",
    href: "https://www.pagat.com/patience/nerts.html",
  },
  {
    name: "Bicycle Cards: Nerts",
    href: "https://bicyclecards.com/how-to-play/nerts",
  },
  {
    name: "GameRules: Nerts (Pounce)",
    href: "https://gamerules.com/rules/nerts-card-game/",
  },
];

const faqItems = [
  {
    question: "Is Pounce the same game as Nerts or Nertz?",
    answer:
      "Yes. Pounce, Nerts, Nertz, and Racing Demon are common names for the same family of fast multiplayer solitaire games.",
  },
  {
    question: "How many cards are in the Pounce pile?",
    answer:
      "The common rule set uses 13 cards in the Pounce pile, with the top card available to play.",
  },
  {
    question: "What is different in Pounce Online?",
    answer:
      "The core rules follow the classic game, while the app handles decks, rooms, scoring, bots, and round endings automatically. After each round, it also provides post-round analysis with tips for missed chances and better Pounce-pile play.",
  },
];

const HowToPlayPage: NextPage = () => {
  const seoOrigin = getSeoOrigin();
  const structuredData = getStructuredData(seoOrigin);

  return (
    <>
      <SeoHead
        title={PAGE_TITLE}
        description={PAGE_DESCRIPTION}
        origin={seoOrigin}
        path={PAGE_PATH}
        keywords={KEYWORDS}
      />
      <Head>
        <script
          key="how-to-play-json-ld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
      </Head>
      <main className={styles.root}>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <nav className={styles.topNav} aria-label="Primary">
              <Link className={styles.brandLink} href="/">
                <img className={styles.brandLogo} src={FAVICON_SRC} alt="" />
                <span>{SITE_NAME}</span>
              </Link>
              <Link className={styles.homeLink} href="/">
                Play now
              </Link>
            </nav>

            <div className={styles.heroLayout}>
              <div>
                <p className={styles.eyebrow}>Rules and strategy</p>
                <h1 className={styles.title}>How to play Pounce</h1>
                <p className={styles.intro}>
                  Pounce is a fast multiplayer solitaire race. Build shared
                  center piles, manage your own work piles, and try to clear
                  your 13-card Pounce pile before anyone else.
                </p>
                <div className={styles.heroActions}>
                  <Link className={styles.primaryAction} href="/">
                    Play Pounce Online
                  </Link>
                  <a className={styles.secondaryAction} href="#rules">
                    Read the rules
                  </a>
                </div>
              </div>
              <div className={styles.cardFan} aria-hidden="true">
                <span className={styles.fanCard} />
                <span className={styles.fanCard} />
                <span className={styles.fanCard} />
              </div>
            </div>
          </div>
        </section>

        <section className={styles.quickBand} aria-label="Quick facts">
          <div className={styles.sectionInner}>
            <div className={styles.quickGrid}>
              {quickFacts.map(([label, value]) => (
                <div className={styles.quickItem} key={label}>
                  <strong>{label}</strong>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.contentBand}>
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeader}>
              <h2>Setup</h2>
              <p>
                The classic tabletop setup uses one standard deck per player.
                The online version keeps the same structure and deals the table
                for you.
              </p>
            </div>
            <div className={styles.twoColumn}>
              <ol className={styles.steps}>
                {setupSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <aside className={styles.noteBox}>
                <h3>In tabletop play</h3>
                <p>
                  Use decks with different backs. At the end of the round,
                  center cards are sorted by owner so every player gets credit
                  for the cards they played.
                </p>
              </aside>
            </div>
          </div>
        </section>

        <section className={styles.altBand} id="rules">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeader}>
              <h2>Round Rules</h2>
              <p>
                Pounce is simultaneous, so the core skill is seeing center-pile
                openings while keeping your own board moving.
              </p>
            </div>
            <ul className={styles.ruleList}>
              {playRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.contentBand}>
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeader}>
              <h2>Scoring</h2>
              <p>
                Calling Pounce usually helps, but it does not automatically
                guarantee the best score for the round.
              </p>
            </div>
            <table className={styles.scoreTable}>
              <tbody>
                <tr>
                  <th scope="row">Center cards</th>
                  <td>
                    Score 1 point for each of your cards that reached the
                    shared center foundations.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Pounce pile penalty</th>
                  <td>
                    Players who did not empty their Pounce pile lose 2 points
                    for each card left there.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Match winner</th>
                  <td>
                    Play multiple rounds and compare total points. Many
                    tabletop groups play to a target score, while Pounce Online
                    keeps a running scoreboard for the room.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.altBand}>
          <div className={styles.sectionInner}>
            <div className={styles.twoColumn}>
              <div>
                <div className={styles.sectionHeader}>
                  <h2>About the Game</h2>
                  <p>
                    Pounce belongs to a family of real-time solitaire card
                    games. Depending on where you learned it, you may know it by
                    another name.
                  </p>
                </div>
                <ul className={styles.nameList} aria-label="Alternative names">
                  {altNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
              <aside className={styles.noteBox}>
                <h3>Similar games</h3>
                <p>
                  Dutch Blitz and Ligretto are closely related commercial games:
                  both keep the same frantic shared-table feeling with custom
                  decks and slightly different layouts.
                </p>
              </aside>
            </div>
          </div>
        </section>

        <section className={styles.contentBand}>
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeader}>
              <h2>Beginner Tips</h2>
              <p>
                Speed matters, but the best players are fast because they know
                where to look first.
              </p>
            </div>
            <ul className={styles.tipsList}>
              {tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.altBand}>
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeader}>
              <h2>Questions</h2>
            </div>
            <div className={styles.faqList}>
              {faqItems.map((item) => (
                <article className={styles.faqItem} key={item.question}>
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </article>
              ))}
            </div>
            <ul className={styles.sourceLinks} aria-label="Rule references">
              {ruleSources.map((source) => (
                <li key={source.href}>
                  <a href={source.href}>{source.name}</a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.finalBand}>
          <div className={styles.sectionInner}>
            <div>
              <h2>Ready to race the table?</h2>
              <p>
                Start a room, invite friends, or practice offline against bots
                while the rules are fresh.
              </p>
            </div>
            <Link className={styles.primaryAction} href="/">
              Play Pounce Online
            </Link>
          </div>
        </section>
      </main>
    </>
  );
};

function getStructuredData(origin: string) {
  const pageUrl = absoluteUrl(origin, PAGE_PATH);
  const homeUrl = absoluteUrl(origin, "/");
  const imageUrl = absoluteUrl(origin, DEFAULT_SHARE_IMAGE_PATH);

  return [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: PAGE_TITLE,
      url: pageUrl,
      description: PAGE_DESCRIPTION,
      image: imageUrl,
      about: {
        "@type": "Game",
        name: "Pounce",
        alternateName: ["Nerts", "Nertz", "Racing Demon", "Peanuts"],
      },
      potentialAction: {
        "@type": "PlayAction",
        target: homeUrl,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "How to play Pounce",
      description: PAGE_DESCRIPTION,
      image: imageUrl,
      supply: ["One 52-card deck per player"],
      step: setupSteps.concat(playRules).map((text, index) => ({
        "@type": "HowToStep",
        position: index + 1,
        text,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  ];
}

export default HowToPlayPage;
