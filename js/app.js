import { PRESETS } from "./cards.js";
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

const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const allCards = () => [...PRESETS, ...getState().customCards];
const playerName = (id) => getState().players.find((p) => p.id === id)?.name ?? "(removed player)";

function render() {
  tabsEl.innerHTML = TABS.map(
    (t) =>
      `<button class="tab${t.id === tab ? " active" : ""}" data-action="tab" data-tab="${t.id}"><span>${t.icon}</span>${t.label}</button>`,
  ).join("");
  const banner = [
    saveFailed ? `<p class="error-message">Couldn't save to this browser's storage. Export your data before closing.</p>` : "",
    notice ? `<p class="notice">${esc(notice)}</p>` : "",
  ].join("");
  notice = "";
  const body = {
    play: renderPlay,
    players: renderPlayers,
    cards: renderCards,
    guide: () => ({ html: guideHtml() }),
    data: renderData,
  }[tab]();
  view.innerHTML = banner + body.html;
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
      duo: [players[0].id, players[1].id],
      teams: [{ name: "Team 1", ids: [] }, { name: "Team 2", ids: [] }],
      rounds: 5,
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
        <select id="duo-${i}" data-duo="${i}">${players
          .map(
            (p) =>
              `<option value="${p.id}"${p.id === d.duo[i] ? " selected" : ""}${p.id === d.duo[1 - i] ? " disabled" : ""}>${esc(p.name)}</option>`,
          )
          .join("")}</select>`,
    )
    .join("");
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
      <label for="rounds">Number of rounds</label>
      <input id="rounds" type="number" min="1" max="20" value="${d.rounds}" />
      <p class="dim">A round is one turn as psychic for each ${d.mode === "duo" ? "player" : "team"}.</p>
      <button class="primary" data-action="start-game">Start game</button>
    </section>`,
  };
}

// Setup choices are kept in memory, so drop any player who was removed since.
function syncDraft(d, players) {
  const exists = (id) => players.some((p) => p.id === id);
  const first = exists(d.duo[0]) ? d.duo[0] : players.find((p) => p.id !== d.duo[1])?.id;
  const second = exists(d.duo[1]) && d.duo[1] !== first ? d.duo[1] : players.find((p) => p.id !== first)?.id;
  d.duo = [first, second];
  d.teams.forEach((t) => (t.ids = t.ids.filter(exists)));
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

function renderRound(game, round) {
  const team = game.teams[game.turn];
  const other = game.teams[(game.turn + 1) % game.teams.length];
  const duo = game.mode === "duo";
  const psychicName = duo ? team.name : playerName(round.psychicId);
  const turnLine = duo
    ? `Psychic: <strong>${esc(team.name)}</strong> · Guesser: <strong>${esc(other.name)}</strong>`
    : `<strong>${esc(team.name)}</strong> · psychic: <strong>${esc(psychicName)}</strong>`;
  const holder = { card: psychicName, peek: psychicName, guess: duo ? other.name : team.name, call: other.name }[round.phase];
  const head = `${scoreboard(game)}<p class="center turn-line">${turnLine}</p>${
    holder ? `<p class="center"><span class="handoff">📱 Device with <strong>${esc(holder)}</strong></span></p>` : ""
  }`;
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
          <label class="check"><input type="checkbox" id="cc-save" /> Save to my cards for future games</label>
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
  const cards = allCards();
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
  const { customCards } = getState();
  return {
    html: `<section class="card"><h2>New card</h2>
      <form id="card-form">
        <label for="card-left">Left end</label><input id="card-left" maxlength="40" required />
        <label for="card-right">Right end</label><input id="card-right" maxlength="40" required />
        <button class="primary" type="submit">Save card</button>
      </form></section>
      <section class="card"><h2>My cards (${customCards.length})</h2>
      ${
        customCards.length
          ? `<ul class="list">${customCards
              .map((c) => `<li><span>${esc(c.left)} ⟷ ${esc(c.right)}</span><button class="link danger" data-action="delete-card" data-id="${c.id}">Delete</button></li>`)
              .join("")}</ul>`
          : `<p class="dim">Cards you save will show up here.</p>`
      }</section>
      <section class="card"><h2>Preset cards (${PRESETS.length})</h2>
      <ul class="list">${PRESETS.map((c) => `<li><span>${esc(c.left)} ⟷ ${esc(c.right)}</span></li>`).join("")}</ul></section>`,
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

function addCustomCard(left, right) {
  const card = { id: `c${newId()}`, left: left.trim(), right: right.trim() };
  update((s) => s.customCards.push(card));
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
          notice = "Pick two different players.";
          break;
        }
        teams = d.duo.map((id) => ({ name: playerName(id), playerIds: [id] }));
      } else {
        if (d.teams.some((t) => t.ids.length < 2)) {
          notice = "Each team needs at least two players: a psychic and someone to guess.";
          break;
        }
        teams = d.teams.map((t) => ({ name: t.name.trim() || "Team", playerIds: [...t.ids] }));
      }
      const rounds = Math.min(20, Math.max(1, Math.round(Number(document.getElementById("rounds").value)) || 5));
      update((s) => {
        s.game = {
          id: newId(),
          startedAt: new Date().toISOString(),
          mode: d.mode,
          rounds,
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
        notice = "Fill in both ends of the card.";
        update((s) => (s.game.round.customOpen = true));
        break;
      }
      const save = document.getElementById("cc-save").checked;
      const card = save ? addCustomCard(left, right) : { id: null, left, right };
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
      notice = `${name} already exists.`;
    } else {
      update((s) => s.players.push({ id: newId(), name }));
    }
  } else if (event.target.id === "card-form") {
    addCustomCard(document.getElementById("card-left").value, document.getElementById("card-right").value);
    notice = "Card saved.";
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
  } else if (t.dataset.duo !== undefined) {
    setupDraft.duo[Number(t.dataset.duo)] = t.value;
    render();
  } else if (t.id === "rounds") {
    setupDraft.rounds = Number(t.value) || 5;
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
        notice = err.message;
      })
      .finally(render);
  }
});

render();
