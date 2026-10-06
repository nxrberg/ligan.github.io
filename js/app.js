import { config } from "./config.js";
import { loadData } from "./data.js";
import { ALL, weeksOf, weeklyBoard } from "./stats.js";
// TanStack Table (headless, MIT) from a pinned CDN build, so the site still needs no build step.
import { createTable, getCoreRowModel, getSortedRowModel } from "https://cdn.jsdelivr.net/npm/@tanstack/table-core@8.21.3/+esm";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let data;
let week;
let showRank = false;
let sorting = [{ id: "score", desc: true }]; // click a column header to sort by it
let showHeat = readPref("heatmap", true);
let infoOpen = false; // "More information" under the table stays open across re-renders
const expanded = new Set(); // categories whose `toggledBy` columns are showing

// Per-viewer display preferences; storage can be unavailable, so fall back quietly.
function readPref(key, fallback) {
  try {
    const v = localStorage.getItem(`ligan:${key}`);
    return v == null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function writePref(key, on) {
  try { localStorage.setItem(`ligan:${key}`, on ? "1" : "0"); } catch {}
}

const abbrs = new Map(config.teams.map((t) => [t.name, t.abbr]));
function abbrOf(name) {
  return abbrs.get(name) || name.replace(/[^\p{L}\p{N}#']/gu, "").slice(0, 3).toUpperCase();
}

function fmtValue(v, cat) {
  if (v == null) return "–";
  if (cat.format === "pct") return v >= 1 ? "1.00" : v.toFixed(3).replace(/^0/, "");
  return String(v);
}

function headerHtml(h) {
  const { cat, cls = "", label } = h.column.columnDef.meta;
  const sorted = h.column.getIsSorted();
  const opens = cat ? allCats.filter((o) => o.toggledBy === cat.key) : [];
  const tip = cat?.dropped ? `Not scored: missing for ${cat.missing.join(", ")}`
    : cat && !cat.scored ? "Not counted in Score" : `Sort by ${label}`;
  const classes = [cls, "sortable", sorted ? "sorted" : "", cat && !cat.scored ? "unscored" : ""].filter(Boolean).join(" ");
  const toggle = opens.length
    ? `<button class="col-toggle" data-toggle="${cat.key}" title="${expanded.has(cat.key) ? "Hide" : "Show"} ${opens.map((o) => o.label).join(" and ")}">${expanded.has(cat.key) ? "▾" : "▸"}</button>`
    : "";
  const arrow = sorted ? `<span class="sort-dir">${sorted === "desc" ? "▼" : "▲"}</span>` : "";
  return `<th class="${classes}" data-col="${h.column.id}" title="${esc(tip)}">${esc(label)}${cat?.dropped ? "*" : ""}${arrow}${toggle}</th>`;
}

function cellHtml(cell, maxPerCat) {
  const r = cell.row.original;
  const { cat: c, cls = "" } = cell.column.columnDef.meta;
  if (cell.column.id === "rank") return `<td class="${cls}">${r.rank}</td>`;
  if (cell.column.id === "team")
    return `<td class="${cls}" title="${esc(r.name)}"><strong><span class="full">${esc(r.name)}</span><span class="abbr">${esc(abbrOf(r.name))}</span></strong></td>`;
  if (cell.column.id === "score") return `<td class="${cls}"><strong>${r.score}</strong></td>`;

  const p = r.points[c.key];
  const heat = showHeat && c.scored && p != null ? p / maxPerCat : null;
  const style = heat == null ? "" : ` style="--heat:${Math.round(heat * 100)}%"`;
  const rk = r.ranks[c.key];
  const lead = c.scored && rk?.rank === 1;
  const text = showRank && c.scored ? (rk ? rk.rank : "–") : fmtValue(r.values[c.key], c);
  const tip = c.scored
    ? `${fmtValue(r.values[c.key], c)} · ${rk ? `rank ${rk.rank}` : "no rank"} · ${p} pts`
    : "";
  const classes = ["num cat", heat == null ? "" : "heat", c.scored ? "" : "unscored", lead ? "lead" : ""].filter(Boolean).join(" ");
  return `<td class="${classes}"${style} title="${esc(tip)}">${text}</td>`;
}

// Column definitions for TanStack Table. Sorting compares raw values; teams without a value go last.
function columnsFor(cats) {
  const col = (id, label, accessorFn, { meta, ...opts } = {}) => ({ id, accessorFn, sortUndefined: "last", ...opts, meta: { label, ...meta } });
  return [
    col("rank", "#", (r) => r.rank, { sortDescFirst: false, meta: { cls: "num col-rank" } }),
    col("team", "Team", (r) => r.name, { sortDescFirst: false, sortingFn: "text", meta: { cls: "team" } }),
    ...cats.map((c) =>
      col(c.key, c.label, (r) => r.values[c.key] ?? undefined, { sortDescFirst: !c.lowerIsBetter, sortingFn: "basic", meta: { cat: c, cls: "num cat" } })
    ),
    col("score", "Score", (r) => r.score, { sortDescFirst: true, meta: { cls: "num score" } }),
  ];
}

function makeTable(rows, cats) {
  const table = createTable({
    data: rows,
    columns: columnsFor(cats),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: false,
    state: {},
    onStateChange: () => {},
    renderFallbackValue: null,
  });
  const visibility = Object.fromEntries(cats.filter((c) => c.toggledBy).map((c) => [c.key, expanded.has(c.toggledBy)]));
  table.setOptions((o) => ({
    ...o,
    state: { ...table.initialState, sorting, columnVisibility: visibility },
    onSortingChange: (u) => { sorting = typeof u === "function" ? u(sorting) : u; render(); },
  }));
  return table;
}

let allCats = [];

function render() {
  const board = weeklyBoard(data.teams, week);
  const { rows, maxPerCat, maxScore } = board;
  allCats = board.cats;
  const table = makeTable(rows, board.cats);

  const head = table.getHeaderGroups().map((g) => `<tr>${g.headers.map(headerHtml).join("")}</tr>`).join("");
  const body = table.getRowModel().rows
    .map((row) => `<tr>${row.getVisibleCells().map((cell) => cellHtml(cell, maxPerCat)).join("")}</tr>`)
    .join("");

  $("#board").innerHTML = `<div class="table-wrap"><table class="board${week === ALL ? " totals" : ""}"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  $("#board").querySelector("thead").addEventListener("click", (e) => {
    const t = e.target.closest("[data-toggle]");
    if (t) {
      const k = t.dataset.toggle;
      expanded.has(k) ? expanded.delete(k) : expanded.add(k);
      return render();
    }
    const th = e.target.closest("[data-col]");
    if (th) table.getColumn(th.dataset.col).toggleSorting();
  });

  const dropped = board.cats.filter((c) => c.dropped);
  const fetched = rows.map((r) => r.line?.fetched).filter(Boolean).sort().at(-1);
  const info = [
    `Each category gives ${config.pointsWin} points for every team you beat and ${config.pointsTie} for every tie (max ${maxPerCat} per category, ${maxScore} total).`,
    dropped.length
      ? `* Not counted in Score ${week === ALL ? "for all weeks" : "this week"}: ${dropped.map((c) => `${esc(c.label)} (missing for ${esc(c.missing.join(", "))})`).join("; ")}.`
      : "",
  ].filter(Boolean);
  $("#notes").innerHTML = `${fetched ? `<p>Data fetched ${esc(fetched)}.</p>` : ""}
    <details${infoOpen ? " open" : ""}><summary>More information</summary>${info.map((n) => `<p>${n}</p>`).join("")}</details>`;
  $("#notes details").addEventListener("toggle", (e) => { infoOpen = e.target.open; });
}

async function init() {
  document.title = config.leagueName;

  try {
    data = await loadData();
  } catch (e) {
    $("#status").textContent = `Couldn't load data: ${e.message}`;
    $("#status").hidden = false;
    return;
  }
  if (data.source === "sample") {
    $("#status").innerHTML = `Showing sample data. Run <code>scripts/fetch-data.mjs</code> to load the real sheet.`;
    $("#status").hidden = false;
  }

  const weeks = weeksOf(data.teams);
  const tabs = $("#week-tabs");
  tabs.innerHTML = [...weeks, ALL].map((w) => `<button role="tab" data-week="${esc(w)}">${esc(w)}</button>`).join("");
  const selectWeek = (w) => {
    week = w;
    tabs.querySelectorAll("[data-week]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.week === w)));
    render();
  };
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-week]");
    if (b) selectWeek(b.dataset.week);
  });
  $("#show-rank").addEventListener("change", (e) => { showRank = e.target.checked; render(); });
  $("#show-heat").checked = showHeat;
  $("#show-heat").addEventListener("change", (e) => { showHeat = e.target.checked; writePref("heatmap", showHeat); render(); });

  if (!weeks.length) {
    $("#board").innerHTML = `<p class="empty">No weeks found in the sheet yet.</p>`;
    return;
  }
  selectWeek(weeks.at(-1));
  tabs.scrollLeft = tabs.scrollWidth; // latest week in view when there are many
}

init();
