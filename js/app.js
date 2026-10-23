import { PRESETS } from "./cards.js";
import { createDial } from "./dial.js";
import { randomTarget, scoreFor, directionCorrect } from "./scoring.js";
import { getState, update, newId, exportJson, importJson, resetAll, saveFailed } from "./store.js";

const view = document.getElementById("view");
const tabsEl = document.getElementById("tabs");

const TABS = [
  { id: "play", label: "Play", icon: "🎯" },
  { id: "players", label: "Players", icon: "👥" },
  { id: "cards", label: "Cards", icon: "🃏" },
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
  const body = { play: renderPlay, players: renderPlayers, cards: renderCards, data: renderData }[tab]();
  view.innerHTML = banner + body.html;
  body.after?.();
}

// ---------------------------------------------------------------- Play

function renderPlay() {
  const { game } = getState();
  if (!game) return renderSetup();
  const round = game.round;
  if (!round) return renderScoreboardOnly(game);
  return renderRound(game, round);
}

function scoreboard(game, highlight = true) {
  return `<div class="scoreboard">${game.teams
    .map(
      (t, i) =>
        `<div class="team-score${highlight && i === game.turn ? " active" : ""}"><span class="team-name">${esc(t.name)}</span><span class="score">${t.score}</span></div>`,
    )
    .join("")}</div><p class="dim center">First to ${game.targetScore}</p>`;
}

function renderSetup() {
  const { players } = getState();
  if (players.length < 2) {
    return { html: `<section class="card"><h2>New game</h2><p>You need at least two players. Add them in the Players tab.</p></section>` };
  }
  if (!setupDraft) {
    setupDraft = { teams: [{ name: "Team 1", ids: [] }, { name: "Team 2", ids: [] }], target: 10 };
  }
  const d = setupDraft;
  const teamHtml = d.teams
    .map(
      (t, i) => `<div class="team-setup">
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
  return {
    html: `<section class="card"><h2>New game</h2>
      ${teamHtml}
      <div class="row">
        <button data-action="add-team"${d.teams.length >= 4 ? " disabled" : ""}>+ Team</button>
        <button data-action="remove-team"${d.teams.length <= 2 ? " disabled" : ""}>− Team</button>
      </div>
      <label for="target-score">Play to</label>
      <input id="target-score" type="number" min="1" max="50" value="${d.target}" />
      <button class="primary" data-action="start-game">Start game</button>
    </section>`,
  };
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
  const head = `${scoreboard(game)}<p class="center turn-line"><strong>${esc(team.name)}</strong> · psychic: <strong>${esc(playerName(round.psychicId))}</strong></p>`;
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
        <p class="center dim">Psychic gives a clue. ${esc(team.name)} discuss, then drag the needle.</p>
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
  const over = game.teams.some((t) => t.score >= game.targetScore);
  const top = [...game.teams].sort((a, b) => b.score - a.score);
  const decided = over && top[0].score > top[1].score;
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
      ${decided ? `<p class="center big win">🏆 ${esc(top[0].name)} win!</p>` : ""}
      <button class="primary" data-action="${decided ? "finish" : "new-round"}">${decided ? "Finish game" : "Next turn"}</button></section>`,
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
    s.history.push({
      id: game.id,
      finishedAt: new Date().toISOString(),
      teams: game.teams.map((t) => ({ name: t.name, playerIds: t.playerIds, score: t.score, won: t.score === top })),
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
    case "add-team":
      setupDraft.teams.push({ name: `Team ${setupDraft.teams.length + 1}`, ids: [] });
      break;
    case "remove-team":
      setupDraft.teams.pop();
      break;
    case "start-game": {
      const d = setupDraft;
      if (d.teams.some((t) => !t.ids.length)) {
        notice = "Every team needs at least one player.";
        break;
      }
      const target = Math.min(50, Math.max(1, Number(document.getElementById("target-score").value) || 10));
      update((s) => {
        s.game = {
          id: newId(),
          startedAt: new Date().toISOString(),
          targetScore: target,
          turn: 0,
          usedCardIds: [],
          round: null,
          teams: d.teams.map((t) => ({ name: t.name.trim() || "Team", playerIds: [...t.ids], score: 0, psychicCount: 0 })),
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
      update((s) => (s.game.round.phase = s.game.teams.length > 1 ? "call" : "reveal"));
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
  } else if (t.id === "target-score") {
    setupDraft.target = Number(t.value) || 10;
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
