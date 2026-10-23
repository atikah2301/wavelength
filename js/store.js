// All data lives in this browser's localStorage under one key. Export/import
// moves the whole thing between devices as a single JSON file.
const KEY = "wavelength:v1";
const FORMAT = "wavelength-data";

const blank = () => ({ version: 1, players: [], customCards: [], game: null, history: [] });

const isStr = (v) => typeof v === "string" && v.length > 0;
const validPlayer = (p) => p && isStr(p.id) && isStr(p.name);
const validCard = (c) => c && isStr(c.id) && isStr(c.left) && isStr(c.right);
const validGame = (g) =>
  g &&
  typeof g === "object" &&
  (g.mode === "duo" || g.mode === "teams") &&
  typeof g.rounds === "number" &&
  typeof g.turnsTaken === "number" &&
  Array.isArray(g.teams) &&
  g.teams.length === 2;
const validHistory = (e) => e && isStr(e.id) && Array.isArray(e.teams);

function normalise(raw) {
  const data = blank();
  if (!raw || typeof raw !== "object") return data;
  if (Array.isArray(raw.players)) data.players = raw.players.filter(validPlayer);
  if (Array.isArray(raw.customCards)) data.customCards = raw.customCards.filter(validCard);
  if (Array.isArray(raw.history)) data.history = raw.history.filter(validHistory);
  if (validGame(raw.game)) data.game = raw.game;
  return data;
}

function load() {
  try {
    const text = localStorage.getItem(KEY);
    return text ? normalise(JSON.parse(text)) : blank();
  } catch {
    return blank();
  }
}

let state = load();
export let saveFailed = false;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveFailed = false;
  } catch {
    saveFailed = true;
  }
}

export const getState = () => state;

/** Mutates the state inside `fn`, then persists it. */
export function update(fn) {
  fn(state);
  save();
}

export function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function exportJson() {
  return JSON.stringify({ format: FORMAT, exportedAt: new Date().toISOString(), ...state }, null, 2);
}

/** Replaces everything with the contents of an exported file. Throws on a bad file. */
export function importJson(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!raw || raw.format !== FORMAT) throw new Error("That doesn't look like a Wavelength export.");
  state = normalise(raw);
  save();
}

export function resetAll() {
  state = blank();
  save();
}
