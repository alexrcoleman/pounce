# Pounce Online

This is a project to simulate the game Nertz / Pounce. It includes some online multiplayer logic to allow for competitive play with friends, as well as some Bots for local or online practice. There is also a "Simulation Mode" to rapidly simulate Bots playing against each other to analyze various strategies.

## Planned todos:

### User Play / Interface

- Allow two-clicks to drag (nice for long-distance moves where dragging trackpad that far gets cumbersome)
- Move settings behind a dialog instead of header bar
- Move Deal Hands / Start to the "field"
- Deal hands before starting to allow prep
- Draw area around each players section maybe (shaded gray box? ensure player1 lies over player2)

### Bots/Simulation

- Update the computer cost function to somehow include how much it takes to think about something (instead of pre-emptively incurring a fixed cost after every move, trigger some cost depending on the move [ex. back-to-back on the same pile is easy, or changing which pile you're going to play a certain card on is easy, but switching move entirely is a lot harder])

- Update reaction logic. Delaying the entire board a fixed amount isnt great. Any moves they play should appear instantly (this solves their weakeness on back-to-back moves), as well as a limited set of "subscribed" piles? (their own hand / solitaire pile, and some they care about)

- Maybe update pile locations after a human sends an Ace out to avoid that Ace?

- Add strategy to pre-emptively "play" a card that doesnt play (ex. after 4H gets played in the center, pre-play 6H; maybe only if you see 5H in someones hand, or saw the 4H coming in someones hand too )

- Add competition-priority boost (note: requires reworking moves from a fixed ordering to weighted ordering). If someone else has a card you want to play to the center, prioritize playing that over other moves (ex. P=5H Solitaire=7C 8H \_ KH; we could move the pounce card out, or play a solitaire move to merge 7C into 8H, but we really should just play KH on the board if it can play since the other moves arent "competitive" )

### Random

- Fix spectating mode (have "opted-in" spectate mode, which doesnt automatically disable when a new round starts, but can be manually left. This would also be used for Simulation Mode)
