import { PRESETS, PRESET_PACK_ID, PRESET_PACK_NAME, titleCase, findClashes } from "./cards.js";
import { createDial } from "./dial.js";
import { randomTarget, scoreFor, directionCorrect } from "./scoring.js";
import { guideHtml } from "./guide.js";
import { getState, update, newId, exportJson, importJson, resetAll, saveFailed } from "./store.js";

const view = document.getElementById("view");
const tabsEl = document.getElementById("tabs");

const TABS = [
  { id: "play", label: "Play", icon: "🎯" },
  { id: "players", label: "Players", icon: "👥" },
  { id: "cards", label: "Cards", icon: "🃏" },
  { id: "guide", label: "Guide", icon: "📖" },
  { id: "data", label: "Data", icon: "💾" },
];

let tab = "play";
// Whether the psychic is currently looking at the target. Deliberately never
// persisted, so reloading the page always hides it again.
let peeking = false;
let setupDraft = null;
let notice = "";
let noticeIsWarning = false;

// Warnings show in red and scroll back to the top so they can't be missed.
function warn(message) {
  notice = message;
  noticeIsWarning = true;
}

const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const allCards = () => [...PRESETS, ...getState().customCards];
const allPacks = () => [{ id: PRESET_PACK_ID, name: PRESET_PACK_NAME }, ...getState().customPacks];
const packName = (id) => allPacks().find((p) => p.id === id)?.name ?? PRESET_PACK_NAME;
const cardsInPack = (id) => allCards().filter((c) => c.packId === id);

// "Add to pack" picker shared by the Cards tab and the mid-game card maker. Typing
// a name in the second box creates a pack (or reuses one with that name).
function packFields(prefix, selectedId) {
  const options = allPacks()
    .map((p) => `<option value="${p.id}"${p.id === selectedId ? " selected" : ""}>${esc(p.name)}</option>`)
    .join("");
  return `<label for="${prefix}-pack">Add to pack</label><select id="${prefix}-pack">${options}</select>
    <label for="${prefix}-newpack">Or start a new pack</label>
    <input id="${prefix}-newpack" maxlength="40" placeholder="New pack name (optional)" />`;
}
const playerName = (id) => getState().players.find((p) => p.id === id)?.name ?? "(removed player)";

function render() {
  tabsEl.innerHTML = TABS.map(
    (t) =>
      `<button class="tab${t.id === tab ? " active" : ""}" data-action="tab" data-tab="${t.id}"><span>${t.icon}</span>${t.label}</button>`,
  ).join("");
  const banner = [
    saveFailed ? `<p class="error-message">Couldn't save to this browser's storage. Export your data before closing.</p>` : "",
    notice ? `<p class="notice${noticeIsWarning ? " warning" : ""}" role="${noticeIsWarning ? "alert" : "status"}">${esc(notice)}</p>` : "",
  ].join("");
  const hadWarning = Boolean(notice) && noticeIsWarning;
  notice = "";
  noticeIsWarning = false;
  const body = {
    play: renderPlay,
    players: renderPlayers,
    cards: renderCards,
    guide: () => ({ html: guideHtml() }),
    data: renderData,
  }[tab]();
  view.innerHTML = banner + body.html;
  if (hadWarning) view.scrollTo({ top: 0 });
  applyTheme();
  body.after?.();
}

// Which side should be holding the device right now, or null when it doesn't
// matter (setup, reveal, other tabs).
function viewerIndex(game, round) {
  if (!game || !round) return null;
  const other = (game.turn + 1) % game.teams.length;
  switch (round.phase) {
    case "card":
    case "peek":
      return game.turn;
    case "guess":
      return game.mode === "duo" ? other : game.turn;
    case "call":
      return other;
    default:
      return null;
  }
}

// Recolours the whole UI for the side that should be looking at the screen.
function applyTheme() {
  const { game } = getState();
  const index = tab === "play" ? viewerIndex(game, game?.round) : null;
  const root = document.documentElement;
  if (index === null) delete root.dataset.team;
  else root.dataset.team = String(index);
  const round = tab === "play" ? game?.round : null;
  if (round?.phase === "peek" && peeking) root.dataset.secret = "1";
  else delete root.dataset.secret;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue("--bg").trim() || "#14152b";
}

// ---------------------------------------------------------------- Play

function renderPlay() {
  const { game } = getState();
  if (!game) return renderSetup();
  const round = game.round;
  if (!round) return renderScoreboardOnly(game);
  return renderRound(game, round);
}

function roundNumber(game) {
  return game.round?.number ?? Math.min(Math.floor(game.turnsTaken / 2) + 1, game.rounds);
}

function scoreboard(game, highlight = true) {
  return `<div class="scoreboard">${game.teams
    .map(
      (t, i) =>
        `<div class="team-score t${i}${highlight && i === game.turn ? " active" : ""}"><span class="team-name">${esc(t.name)}</span><span class="score">${t.score}</span></div>`,
    )
    .join("")}</div><p class="dim center">Round ${roundNumber(game)} of ${game.rounds}</p>`;
}

function renderSetup() {
  const { players } = getState();
  if (players.length < 2) {
    return { html: `<section class="card"><h2>New game</h2><p>You need at least two players. Add them in the Players tab.</p></section>` };
  }
  if (!setupDraft) {
    setupDraft = {
      mode: players.length >= 4 ? "teams" : "duo",
      duo: [null, null],
      teams: [{ name: "Team 1", ids: [] }, { name: "Team 2", ids: [] }],
      rounds: 5,
      packIds: [PRESET_PACK_ID],
    };
  }
  const d = setupDraft;
  syncDraft(d, players);
  const teamHtml = d.teams
    .map(
      (t, i) => `<div class="team-setup t${i}">
        <input data-team-name="${i}" value="${esc(t.name)}" aria-label="Team ${i + 1} name" maxlength="30" />
        <div class="chips">${players
          .map(
            (p) =>
              `<label class="chip"><input type="checkbox" data-team-player="${i}" value="${p.id}"${t.ids.includes(p.id) ? " checked" : ""}${d.teams.some((o, j) => j !== i && o.ids.includes(p.id)) ? " disabled" : ""} />${esc(p.name)}</label>`,
          )
          .join("")}</div>
      </div>`,
    )
    .join("");
  const duoHtml = [0, 1]
    .map(
      (i) => `<label for="duo-${i}" class="player-label t${i}">Player ${i + 1}</label>
        <select id="duo-${i}" data-duo="${i}"><option value=""${d.duo[i] ? "" : " selected"}>Choose a player…</option>${players
          .map(
            (p) =>
              `<option value="${p.id}"${p.id === d.duo[i] ? " selected" : ""}${p.id === d.duo[1 - i] ? " disabled" : ""}>${esc(p.name)}</option>`,
          )
          .join("")}</select>`,
    )
    .join("");
  const cardsSelected = d.packIds.reduce((sum, id) => sum + cardsInPack(id).length, 0);
  const cardsNeeded = d.rounds * 2;
  const tooFew = cardsSelected < cardsNeeded;
  return {
    html: `<section class="card"><h2>New game</h2>
      <div class="segmented" role="group" aria-label="Game mode">
        <button class="seg${d.mode === "duo" ? " active" : ""}" data-action="set-mode" data-mode="duo">2 players</button>
        <button class="seg${d.mode === "teams" ? " active" : ""}" data-action="set-mode" data-mode="teams">Teams</button>
      </div>
      <p class="dim">${
        d.mode === "duo"
          ? "Two players take turns as psychic. Each player's name is their team name, and the psychic scores."
          : "Two teams of at least two. The psychic's team scores, and the other team can win a catch-up point."
      }</p>
      ${d.mode === "duo" ? duoHtml : teamHtml}
      <label>Card packs</label>
      <div class="chips">${allPacks()
        .map(
          (p) =>
            `<label class="chip"><input type="checkbox" data-pack="${p.id}"${d.packIds.includes(p.id) ? " checked" : ""} />${esc(p.name)} <span class="dim">(${cardsInPack(p.id).length})</span></label>`,
        )
        .join("")}</div>
      <p class="${tooFew ? "error-message" : "dim"}" aria-live="polite">${cardsSelected} card${cardsSelected === 1 ? "" : "s"} selected${
        tooFew
          ? `. Not enough for ${d.rounds} round${d.rounds === 1 ? "" : "s"}: that needs ${cardsNeeded} (one per turn). Pick more packs or lower the rounds.`
          : ""
      }</p>
      <label for="rounds">Number of rounds</label>
      <input id="rounds" type="number" min="1" max="20" value="${d.rounds}" />
      <p class="dim">A round is one turn as psychic for each ${d.mode === "duo" ? "player" : "team"}.</p>
      <button class="primary" data-action="start-game"${tooFew ? " disabled" : ""}>Start game</button>
    </section>`,
  };
}

// Setup choices are kept in memory, so drop any player who was removed since.
function syncDraft(d, players) {
  const exists = (id) => players.some((p) => p.id === id);
  d.duo = d.duo.map((id) => (exists(id) ? id : null));
  if (d.duo[0] && d.duo[0] === d.duo[1]) d.duo[1] = null;
  d.teams.forEach((t) => (t.ids = t.ids.filter(exists)));
  d.packIds = d.packIds.filter((id) => allPacks().some((p) => p.id === id));
}

function renderScoreboardOnly(game) {
  return {
    html: `<section class="card">${scoreboard(game)}
      <button class="primary" data-action="new-round">Start next turn</button>
      <button class="danger" data-action="abandon">Abandon game</button></section>`,
  };
}

function cardLabel(card) {
  return `<div class="spectrum"><span>${esc(card.left)}</span><span class="arrow">⟷</span><span>${esc(card.right)}</span></div>`;
}

// How private the current screen is. "open": everyone can look. "prep": the device
// is about to show the target, so only the named person should look. "secret": the
// target is on screen right now.
function screenMode(game, round) {
  const team = game.teams[game.turn];
  const other = game.teams[(game.turn + 1) % game.teams.length];
  const duo = game.mode === "duo";
  const psychic = duo ? team.name : playerName(round.psychicId);
  switch (round.phase) {
    case "card":
      return { kind: "open", icon: "👀", text: `Everyone can look. ${psychic} picks the card.` };
    case "peek":
      return peeking
        ? { kind: "secret", icon: "🔒", text: `SECRET: target showing. Only ${psychic} looks.` }
        : { kind: "prep", icon: "🙈", text: `Only ${psychic} looks next. Everyone else look away.` };
    case "guess":
      return { kind: "open", icon: "👀", text: `Everyone can look. ${duo ? other.name : team.name} guess${duo ? "es" : ""} now.` };
    case "call":
      return { kind: "open", icon: "👀", text: `Everyone can look. ${other.name} call it.` };
    default:
      return { kind: "open", icon: "👀", text: "Everyone can look. Target revealed." };
  }
}

function renderRound(game, round) {
  const mode = screenMode(game, round);
  const result = renderRoundBody(game, round);
  result.html = `<div class="screen-banner ${mode.kind}" role="status"><span class="banner-icon">${mode.icon}</span><span>${esc(mode.text)}</span></div>${result.html}`;
  return result;
}

function renderRoundBody(game, round) {
  const team = game.teams[game.turn];
  const other = game.teams[(game.turn + 1) % game.teams.length];
  const duo = game.mode === "duo";
  const psychicName = duo ? team.name : playerName(round.psychicId);
  const turnLine = duo
    ? `Psychic: <strong>${esc(team.name)}</strong> · Guesser: <strong>${esc(other.name)}</strong>`
    : `<strong>${esc(team.name)}</strong> · psychic: <strong>${esc(psychicName)}</strong>`;
  const head = `${scoreboard(game)}<p class="center turn-line">${turnLine}</p>`;
  const abandon = `<button class="link danger" data-action="abandon">Abandon game</button>`;

  if (round.phase === "card") {
    return {
      html: `<section class="card">${head}
        ${cardLabel(round.card)}
        <div class="row">
          <button data-action="redraw">Draw another</button>
          <button class="primary" data-action="use-card">Use this card</button>
        </div>
        <details class="custom-card"${round.customOpen ? " open" : ""}>
          <summary>Make up a card</summary>
          <label for="cc-left">Left end</label><input id="cc-left" maxlength="40" />
          <label for="cc-right">Right end</label><input id="cc-right" maxlength="40" />
          <label class="check"><input type="checkbox" id="cc-save" /> Save to a card pack for future games</label>
          <div id="cc-pack-fields" hidden>${packFields("cc", game.packIds?.[0] ?? PRESET_PACK_ID)}</div>
          <button data-action="use-custom">Use this card</button>
        </details></section>${abandon}`,
    };
  }

  if (round.phase === "peek") {
    return {
      html: `<section class="card">${head}
        ${cardLabel(round.card)}
        <div id="dial-host"></div>
        <p class="center dim">${peeking ? "Memorise where the target is, then hide it before passing the device back." : `Hand the device to ${esc(playerName(round.psychicId))} only. Everyone else look away.`}</p>
        ${
          peeking
            ? `<button class="primary" data-action="hide-target">Hide target</button>`
            : `<button class="primary" data-action="show-target">Show me the target</button>`
        }
        ${peeking ? "" : `<button data-action="to-guess">Done, the psychic has seen it</button>`}</section>${abandon}`,
      after: () => createDial(document.getElementById("dial-host")).update({ target: round.target, showTarget: peeking }),
    };
  }

  if (round.phase === "guess") {
    return {
      html: `<section class="card">${head}
        ${cardLabel(round.card)}
        <div id="dial-host"></div>
        <p class="center dim">${
          duo
            ? `${esc(team.name)} gives a clue, then ${esc(other.name)} drags the needle to where they think the target is.`
            : `Psychic gives a clue. ${esc(team.name)} discuss, then drag the needle.`
        }</p>
        <button class="primary" data-action="lock-guess">Lock in guess</button></section>${abandon}`,
      after: () => {
        const dial = createDial(document.getElementById("dial-host"), {
          interactive: true,
          onChange: (value) => update((s) => (s.game.round.guess = Math.round(value * 10) / 10)),
        });
        dial.update({ target: round.target, showTarget: false, guess: round.guess });
      },
    };
  }

  if (round.phase === "call") {
    return {
      html: `<section class="card">${head}
        ${cardLabel(round.card)}
        <div id="dial-host"></div>
        <p class="center"><strong>${esc(other.name)}</strong>: is the target left or right of the needle?</p>
        <div class="row">
          <button data-action="call" data-call="left">⬅ Left</button>
          <button data-action="call" data-call="right">Right ➡</button>
        </div>
        <button class="link" data-action="call" data-call="none">Skip the catch-up point</button></section>${abandon}`,
      after: () => createDial(document.getElementById("dial-host")).update({ target: round.target, showTarget: false, guess: round.guess }),
    };
  }

  // reveal
  const over = game.turnsTaken >= game.rounds * 2;
  const [first, second] = game.teams;
  const winner = first.score > second.score ? first : second;
  const verdict = !over
    ? ""
    : first.score === second.score
      ? `<p class="center big win">🤝 It's a draw!</p>`
      : `<p class="center big win">🏆 ${esc(winner.name)} win${game.mode === "duo" ? "s" : ""}!</p>`;
  return {
    html: `<section class="card">${scoreboard(game, false)}
      ${cardLabel(round.card)}
      <div id="dial-host"></div>
      <p class="center big">${esc(team.name)} scored <strong>${round.points}</strong></p>
      ${
        round.call === "none" || round.call == null
          ? ""
          : `<p class="center">${esc(other.name)} called ${round.call}: ${round.bonus ? "correct, +1" : "wrong"}</p>`
      }
      ${verdict}
      <button class="primary" data-action="${over ? "finish" : "new-round"}">${over ? "Finish game" : "Next turn"}</button></section>`,
    after: () => createDial(document.getElementById("dial-host")).update({ target: round.target, showTarget: true, guess: round.guess }),
  };
}

function drawCard(game, avoidId) {
  // Games saved before packs existed have no packIds and play from the presets.
  const packIds = game.packIds ?? [PRESET_PACK_ID];
  let cards = allCards().filter((c) => packIds.includes(c.packId));
  if (!cards.length) cards = allCards();
  let pool = cards.filter((c) => !game.usedCardIds.includes(c.id) && c.id !== avoidId);
  if (!pool.length) pool = cards.filter((c) => c.id !== avoidId);
  if (!pool.length) pool = cards;
  const card = pool[Math.floor(Math.random() * pool.length)];
  return { id: card.id, left: card.left, right: card.right };
}

function startRound() {
  peeking = false;
  update((s) => {
    const game = s.game;
    const team = game.teams[game.turn];
    const ids = team.playerIds.filter((id) => s.players.some((p) => p.id === id));
    const pool = ids.length ? ids : team.playerIds;
    const psychicId = pool[team.psychicCount % pool.length];
    team.psychicCount += 1;
    game.round = {
      phase: "card",
      number: Math.floor(game.turnsTaken / 2) + 1,
      card: drawCard(game),
      target: randomTarget(),
      guess: 50,
      call: null,
      points: 0,
      bonus: false,
      psychicId,
    };
  });
}

function revealRound(call) {
  update((s) => {
    const game = s.game;
    const round = game.round;
    const team = game.teams[game.turn];
    const other = game.teams[(game.turn + 1) % game.teams.length];
    round.call = call;
    round.points = scoreFor(round.guess, round.target);
    round.bonus = directionCorrect(round.guess, round.target, call);
    team.score += round.points;
    if (round.bonus) other.score += 1;
    round.phase = "reveal";
    game.turnsTaken += 1;
  });
}

function nextTurn() {
  update((s) => {
    const game = s.game;
    game.turn = (game.turn + 1) % game.teams.length;
    game.round = null;
  });
  startRound();
}

function finishGame() {
  update((s) => {
    const game = s.game;
    const top = Math.max(...game.teams.map((t) => t.score));
    const draw = game.teams.every((t) => t.score === top);
    s.history.push({
      id: game.id,
      mode: game.mode,
      finishedAt: new Date().toISOString(),
      teams: game.teams.map((t) => ({ name: t.name, playerIds: t.playerIds, score: t.score, won: !draw && t.score === top })),
    });
    s.game = null;
  });
  setupDraft = null;
}

// ---------------------------------------------------------------- Players

function playerStats(id) {
  const games = getState().history.filter((g) => g.teams.some((t) => t.playerIds.includes(id)));
  const wins = games.filter((g) => g.teams.some((t) => t.playerIds.includes(id) && t.won)).length;
  return { played: games.length, wins };
}

function renderPlayers() {
  const { players, game } = getState();
  const inGame = new Set(game ? game.teams.flatMap((t) => t.playerIds) : []);
  return {
    html: `<section class="card"><h2>Players</h2>
      <form id="player-form" class="row"><input id="player-name" placeholder="Name" maxlength="30" required /><button class="primary" type="submit">Add</button></form>
      ${
        players.length
          ? `<ul class="list">${players
              .map((p) => {
                const s = playerStats(p.id);
                return `<li><span>${esc(p.name)} <span class="dim">${s.played} played · ${s.wins} won</span></span><button class="link danger" data-action="delete-player" data-id="${p.id}"${inGame.has(p.id) ? " disabled title=\"In a game\"" : ""}>Remove</button></li>`;
              })
              .join("")}</ul>`
          : `<p class="dim">No players yet.</p>`
      }</section>`,
  };
}

// ---------------------------------------------------------------- Cards

function renderCards() {
  const customIds = new Set(getState().customCards.map((c) => c.id));
  const sections = allPacks()
    .map((p) => {
      const cards = cardsInPack(p.id);
      const items = cards
        .map(
          (c) =>
            `<li><span>${esc(c.left)} ⟷ ${esc(c.right)}</span>${customIds.has(c.id) ? `<button class="link danger" data-action="delete-card" data-id="${c.id}">Delete</button>` : ""}</li>`,
        )
        .join("");
      return `<details><summary>${esc(p.name)} (${cards.length})</summary>
        ${cards.length ? `<ul class="list">${items}</ul>` : `<p class="dim">No cards in this pack yet.</p>`}
        ${p.id === PRESET_PACK_ID ? "" : `<button class="link danger" data-action="delete-pack" data-id="${p.id}">Delete this pack and its cards</button>`}
      </details>`;
    })
    .join("");
  return {
    html: `<section class="card"><h2>New card</h2>
      <form id="card-form">
        <label for="card-left">Left end</label><input id="card-left" maxlength="40" required />
        <label for="card-right">Right end</label><input id="card-right" maxlength="40" required />
        ${packFields("card", PRESET_PACK_ID)}
        <button class="primary" type="submit">Save card</button>
      </form></section>
      <section class="card packs"><h2>Card packs</h2>${sections}</section>`,
  };
}

// ---------------------------------------------------------------- Data

function renderData() {
  return {
    html: `<section class="card"><h2>Your data</h2>
      <p class="dim">Players, saved cards, game history and any game in progress are stored only in this browser.
      Export them to a file to move to another device.</p>
      <button class="primary" data-action="export">Export to file</button>
      <button data-action="import">Import from file</button>
      <input type="file" id="import-file" accept="application/json,.json" hidden />
      <button class="link danger" data-action="reset">Erase everything on this device</button></section>`,
  };
}

function downloadExport() {
  const blob = new Blob([exportJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `wavelength-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- Events

/**
 * Saves a new card (title-cased) into a pack: the one picked, or a new pack if a
 * name was typed. Warns first if either end already appears in that pack. Returns
 * the saved card, or null if the user backed out at the warning.
 */
function saveNewCard(rawLeft, rawRight, chosenPackId, newPackName) {
  const left = titleCase(rawLeft);
  const right = titleCase(rawRight);
  const typed = newPackName.trim();
  let packId = chosenPackId;
  if (typed) {
    const match = allPacks().find((p) => p.name.toLowerCase() === typed.toLowerCase());
    packId = match?.id ?? null;
  }
  const clashes = packId ? findClashes(cardsInPack(packId), left, right) : [];
  if (clashes.length) {
    const lines = clashes.map((c) => `"${c.term}" is already on ${c.card.left} ⟷ ${c.card.right}`).join("\n");
    if (!confirm(`${lines}\n\nin ${packName(packId)}. Save this card anyway?`)) return null;
  }
  const card = { id: `c${newId()}`, left, right, packId };
  update((s) => {
    if (!packId) {
      card.packId = `k${newId()}`;
      s.customPacks.push({ id: card.packId, name: typed });
    }
    s.customCards.push(card);
  });
  return card;
}

document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  const game = getState().game;

  switch (action) {
    case "tab":
      tab = el.dataset.tab;
      break;
    case "set-mode":
      setupDraft.mode = el.dataset.mode;
      break;
    case "start-game": {
      const d = setupDraft;
      let teams;
      if (d.mode === "duo") {
        if (!d.duo[0] || !d.duo[1]) {
          warn("Choose both players first.");
          break;
        }
        teams = d.duo.map((id) => ({ name: playerName(id), playerIds: [id] }));
      } else {
        if (d.teams.some((t) => t.ids.length < 2)) {
          warn("Each team needs at least two players: a psychic and someone to guess.");
          break;
        }
        teams = d.teams.map((t) => ({ name: t.name.trim() || "Team", playerIds: [...t.ids] }));
      }
      const rounds = Math.min(20, Math.max(1, Math.round(Number(document.getElementById("rounds").value)) || 5));
      const available = d.packIds.reduce((sum, id) => sum + cardsInPack(id).length, 0);
      if (available < rounds * 2) {
        warn(`Not enough cards selected: ${rounds} rounds needs ${rounds * 2}, and you have ${available}.`);
        break;
      }
      update((s) => {
        s.game = {
          id: newId(),
          startedAt: new Date().toISOString(),
          mode: d.mode,
          rounds,
          packIds: [...d.packIds],
          turnsTaken: 0,
          turn: 0,
          usedCardIds: [],
          round: null,
          teams: teams.map((t) => ({ ...t, score: 0, psychicCount: 0 })),
        };
      });
      startRound();
      break;
    }
    case "new-round":
      nextTurn();
      break;
    case "abandon":
      if (!confirm("Abandon this game? Scores will be lost.")) return;
      update((s) => (s.game = null));
      setupDraft = null;
      peeking = false;
      break;
    case "redraw":
      update((s) => (s.game.round.card = drawCard(s.game, s.game.round.card.id)));
      break;
    case "use-card":
      update((s) => {
        const r = s.game.round;
        if (r.card.id) s.game.usedCardIds.push(r.card.id);
        r.phase = "peek";
      });
      peeking = false;
      break;
    case "use-custom": {
      const left = document.getElementById("cc-left").value.trim();
      const right = document.getElementById("cc-right").value.trim();
      if (!left || !right) {
        warn("Fill in both ends of the card.");
        update((s) => (s.game.round.customOpen = true));
        break;
      }
      const save = document.getElementById("cc-save").checked;
      const card = save
        ? saveNewCard(left, right, document.getElementById("cc-pack").value, document.getElementById("cc-newpack").value)
        : { id: null, left: titleCase(left), right: titleCase(right) };
      if (!card) return;
      update((s) => {
        const r = s.game.round;
        r.card = { id: card.id, left: card.left, right: card.right };
        r.customOpen = false;
        if (card.id) s.game.usedCardIds.push(card.id);
        r.phase = "peek";
      });
      peeking = false;
      break;
    }
    case "show-target":
      peeking = true;
      break;
    case "hide-target":
      peeking = false;
      break;
    case "to-guess":
      update((s) => (s.game.round.phase = "guess"));
      break;
    case "lock-guess":
      // With two players there is nobody left to make the left/right call.
      if (game.mode === "duo") revealRound("none");
      else update((s) => (s.game.round.phase = "call"));
      break;
    case "call":
      revealRound(el.dataset.call);
      break;
    case "finish":
      finishGame();
      break;
    case "delete-player":
      update((s) => (s.players = s.players.filter((p) => p.id !== el.dataset.id)));
      break;
    case "delete-card":
      update((s) => (s.customCards = s.customCards.filter((c) => c.id !== el.dataset.id)));
      break;
    case "delete-pack": {
      const id = el.dataset.id;
      const count = cardsInPack(id).length;
      if (!confirm(`Delete "${packName(id)}" and its ${count} card${count === 1 ? "" : "s"}?`)) return;
      update((s) => {
        s.customPacks = s.customPacks.filter((p) => p.id !== id);
        s.customCards = s.customCards.filter((c) => c.packId !== id);
      });
      break;
    }
    case "export":
      downloadExport();
      return;
    case "import":
      document.getElementById("import-file").click();
      return;
    case "reset":
      if (!confirm("Erase all players, cards, history and the current game on this device?")) return;
      resetAll();
      setupDraft = null;
      peeking = false;
      notice = "Everything erased.";
      break;
    default:
      return;
  }
  render();
});

document.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.id === "player-form") {
    const name = document.getElementById("player-name").value.trim();
    if (!name) return;
    const { players } = getState();
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      warn(`${name} already exists.`);
    } else {
      update((s) => s.players.push({ id: newId(), name }));
    }
  } else if (event.target.id === "card-form") {
    const card = saveNewCard(
      document.getElementById("card-left").value,
      document.getElementById("card-right").value,
      document.getElementById("card-pack").value,
      document.getElementById("card-newpack").value,
    );
    if (!card) return;
    notice = `Card saved to ${packName(card.packId)}.`;
  }
  render();
});

document.addEventListener("input", (event) => {
  const t = event.target;
  if (t.dataset.teamName !== undefined) setupDraft.teams[Number(t.dataset.teamName)].name = t.value;
});

document.addEventListener("change", (event) => {
  const t = event.target;
  if (t.dataset.teamPlayer !== undefined) {
    const team = setupDraft.teams[Number(t.dataset.teamPlayer)];
    team.ids = t.checked ? [...team.ids, t.value] : team.ids.filter((id) => id !== t.value);
    render();
  } else if (t.id === "cc-save") {
    // Show or hide in place (no re-render) so half-typed card ends aren't lost.
    document.getElementById("cc-pack-fields").hidden = !t.checked;
  } else if (t.dataset.pack !== undefined) {
    const ids = setupDraft.packIds;
    setupDraft.packIds = t.checked ? [...ids, t.dataset.pack] : ids.filter((id) => id !== t.dataset.pack);
    render();
  } else if (t.dataset.duo !== undefined) {
    setupDraft.duo[Number(t.dataset.duo)] = t.value || null;
    render();
  } else if (t.id === "rounds") {
    setupDraft.rounds = Math.min(20, Math.max(1, Math.round(Number(t.value)) || 5));
    render();
  } else if (t.id === "import-file" && t.files[0]) {
    t.files[0]
      .text()
      .then((text) => {
        if (!confirm("Importing replaces everything currently on this device. Continue?")) return;
        importJson(text);
        setupDraft = null;
        peeking = false;
        notice = "Data imported.";
      })
      .catch((err) => {
        warn(err.message);
      })
      .finally(render);
  }
});

render();
