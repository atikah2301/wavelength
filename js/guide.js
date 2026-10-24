// Static "How to play" content for the Guide tab. Each section is a <details>
// so the page stays short; the first one starts open.
const SECTIONS = [
  {
    title: "The goal",
    open: true,
    body: `<p>Every card has two opposite ideas, one at each end of a dial (for example <em>Cold ⟷ Hot</em>).
      A <strong>target</strong> is hidden somewhere on that dial. One player, the <strong>psychic</strong>, can see it.
      They give a short clue that hints at where it sits, and the guesser turns the needle to where they think it is.
      The closer the needle lands to the target, the more points.</p>
      <p>Clue example: for <em>Cold ⟷ Hot</em> with the target a little past the middle, "a cup of tea left on the desk" beats
      "medium".</p>`,
  },
  {
    title: "Roles",
    body: `<p><strong>Psychic</strong>: the only person who sees the target. They give one clue (a word or short phrase) that fits
      where the target sits between the two ends of the card. No numbers, and nothing like "left a bit" or "near the
      middle". They stay quiet once the clue is given.</p>
      <p><strong>Guesser(s)</strong>: whoever is moving the needle. They never see the target. They talk it over, then drag the
      needle on the dial and lock it in.</p>
      <p><strong>Other team</strong> (Teams mode only): after the guess is locked in, they call whether the target is left or
      right of the needle. See <em>Points</em>.</p>`,
  },
  {
    title: "Teams",
    body: `<p>There are always exactly two sides, and each has its own colour. <strong>The whole screen changes colour to show
      whose turn it is to hold the device</strong>, so you can tell at a glance when to pass it on.</p>
      <p><strong>Teams mode</strong>: two teams of at least two players each. The psychic is a different member of their
      team each turn, and the rest of that team are the guessers. Names for the teams are up to you.</p>
      <p><strong>2 players mode</strong>: see the next section.</p>`,
  },
  {
    title: "Playing with 2 players",
    body: `<p>Pick the two players in New game. Each player is their own side, so their name is the team name.</p>
      <p>The sides take turns. On your turn you are the <strong>psychic</strong> and the other player is the
      <strong>guesser</strong>. The <strong>psychic scores</strong> the points, so a good clue is what wins you the game.</p>
      <p>With only one guesser there is nobody left to make the left/right call, so that step is skipped in this mode.</p>`,
  },
  {
    title: "Points",
    body: `<p>The target has bands around it. Where the needle lands decides the score:</p>
      <ul class="points-list">
        <li><span class="swatch s4"></span><strong>4 points</strong> for the bullseye</li>
        <li><span class="swatch s3"></span><strong>3 points</strong> for the next band out</li>
        <li><span class="swatch s2"></span><strong>2 points</strong> for the outer band</li>
        <li><span class="swatch s0"></span><strong>0 points</strong> for a miss</li>
      </ul>
      <p>The psychic's side scores these points.</p>
      <p><strong>Catch-up point (Teams mode)</strong>: once the guess is locked in, the other team, who haven't seen the
      target, say whether it is <em>left</em> or <em>right</em> of the needle. If they are right they get <strong>+1</strong>.
      If they're wrong, nothing happens. It is only there to keep the other team involved and the scores close. You can skip
      it with "Skip the catch-up point".</p>`,
  },
  {
    title: "A turn, step by step",
    body: `<ol>
        <li><strong>Pick a card.</strong> Draw another, or make one up on the spot.</li>
        <li><strong>Peek.</strong> Pass the device to the psychic, who taps "Show me the target", memorises it, then taps
          "Hide target".</li>
        <li><strong>Clue.</strong> The psychic says their clue out loud.</li>
        <li><strong>Guess.</strong> The guesser(s) drag the needle, then tap "Lock in guess".</li>
        <li><strong>Call (Teams mode only).</strong> The other team calls left or right.</li>
        <li><strong>Reveal.</strong> The target and its bands appear, points are added, and play moves to the other side.</li>
      </ol>
      <p>Tip: the target stays hidden unless the psychic taps to show it, and reloading the page always hides it again.</p>`,
  },
  {
    title: "Rounds and winning",
    body: `<p>You choose the number of <strong>rounds</strong> when you start a game. In each round every side gets one turn
      as the psychic, so 5 rounds means 10 turns in total. The scoreboard shows "Round X of N".</p>
      <p>After the last turn the side with the most points wins. If the scores are level, it's a draw.</p>`,
  },
  {
    title: "Cards",
    body: `<p>Cards live in <strong>packs</strong>. The app comes with the <em>Preset cards</em> pack (60 cards). When you start
      a game you tick which packs to play from, and you can pick more than one.</p>
      <p>During a turn you can tap <strong>Make up a card</strong> and type your own two opposite ends. Tick
      <em>Save to a card pack</em> to keep it, choosing an existing pack or typing a new pack name. Leave it unticked and
      it's used for that turn only. You can also add cards, and delete cards or whole packs, in the
      <strong>Cards</strong> tab.</p>
      <p>New cards are tidied into Title Case. If either end already appears on a card in the same pack (for example
      "Rare" when <em>Rare ⟷ Common</em> exists), you'll get a warning and can still save it.</p>
      <p>The app avoids repeating a card within a game until it has run through them all.</p>`,
  },
  {
    title: "Your data",
    body: `<p>Everything (players, saved cards, game history, and any game in progress) is stored only in this browser on this
      device. To move it elsewhere, use the <strong>Data</strong> tab to export it to one file and import that file on the
      other device. Importing replaces what's on that device.</p>`,
  },
];

export function guideHtml() {
  return `<section class="card guide"><h2>How to play</h2>
    ${SECTIONS.map(
      (s) => `<details${s.open ? " open" : ""}><summary>${s.title}</summary><div class="guide-body">${s.body}</div></details>`,
    ).join("")}
  </section>`;
}
