import { config } from "./config.js";
import { loadData } from "./data.js";
import { weeksOf, weeklyBoard } from "./stats.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let data;
let week;
let showRank = false;
const expanded = new Set(); // categories whose `toggledBy` columns are showing

function fmtValue(v, cat) {
  if (v == null) return "–";
  if (cat.format === "pct") return v.toFixed(3).replace(/^0/, "");
  return String(v);
}

function headerCell(c, cats) {
  const opens = cats.filter((o) => o.toggledBy === c.key);
  const cls = ["num", c.scored ? "" : "unscored", opens.length ? "toggle-col" : ""].filter(Boolean).join(" ");
  const tip = opens.length
    ? `Click to ${expanded.has(c.key) ? "hide" : "show"} ${opens.map((o) => o.label).join(" and ")}`
    : c.dropped ? `Not scored: missing for ${c.missing.join(", ")}`
    : c.scored ? "" : "Not counted in Score";
  const arrow = opens.length ? (expanded.has(c.key) ? " ▾" : " ▸") : "";
  return `<th class="${cls}" title="${esc(tip)}"${opens.length ? ` data-toggle="${c.key}"` : ""}>${esc(c.label)}${c.dropped ? "*" : ""}${arrow}</th>`;
}

function bodyCell(r, c, maxPerCat) {
  const p = r.points[c.key];
  const heat = c.scored && p != null ? p / maxPerCat : null;
  const style = heat == null ? "" : ` style="--heat:${Math.round(heat * 100)}%"`;
  const rk = r.ranks[c.key];
  const text = showRank && c.scored ? (rk ? `${rk.tied ? "T" : ""}${rk.rank}` : "–") : fmtValue(r.values[c.key], c);
  const tip = c.scored
    ? `${fmtValue(r.values[c.key], c)} · ${rk ? `rank ${rk.tied ? "T" : ""}${rk.rank}` : "no rank"} · ${p} pts`
    : "";
  return `<td class="num${heat == null ? "" : " heat"}${c.scored ? "" : " unscored"}"${style} title="${esc(tip)}">${text}</td>`;
}

function render() {
  const board = weeklyBoard(data.teams, week);
  const { rows, maxPerCat, maxScore } = board;
  const cats = board.cats.filter((c) => !c.toggledBy || expanded.has(c.toggledBy));

  const head = `<tr>
    <th class="num">#</th><th>Team</th><th class="num score">Score</th>
    ${cats.map((c) => headerCell(c, board.cats)).join("")}
  </tr>`;

  const body = rows.map((r) => `<tr>
    <td class="num">${r.rank}</td>
    <td><strong>${esc(r.name)}</strong></td>
    <td class="num score"><strong>${r.score}</strong></td>
    ${cats.map((c) => bodyCell(r, c, maxPerCat)).join("")}
  </tr>`).join("");

  $("#board").innerHTML = `<div class="table-wrap"><table class="board"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  $("#board").querySelectorAll("[data-toggle]").forEach((th) =>
    th.addEventListener("click", () => {
      const k = th.dataset.toggle;
      expanded.has(k) ? expanded.delete(k) : expanded.add(k);
      render();
    })
  );

  const dropped = board.cats.filter((c) => c.dropped);
  const fetched = rows.map((r) => r.line?.fetched).filter(Boolean).sort().at(-1);
  const notes = [
    `Each category gives ${config.pointsWin} points for every team you beat and ${config.pointsTie} for every tie (max ${maxPerCat} per category, ${maxScore} total).`,
    dropped.length
      ? `* Not counted in Score this week: ${dropped.map((c) => `${esc(c.label)} (missing for ${esc(c.missing.join(", "))})`).join("; ")}.`
      : "",
    fetched ? `Data fetched ${esc(fetched)}.` : "",
  ];
  $("#notes").innerHTML = notes.filter(Boolean).map((n) => `<p>${n}</p>`).join("");
}

async function init() {
  document.title = config.leagueName;
  $("#league").textContent = config.leagueName;

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
  const sel = $("#week-select");
  sel.innerHTML = weeks.slice().reverse().map((w) => `<option>${esc(w)}</option>`).join("");
  sel.addEventListener("change", () => { week = sel.value; render(); });
  $("#show-rank").addEventListener("change", (e) => { showRank = e.target.checked; render(); });

  if (!weeks.length) {
    $("#board").innerHTML = `<p class="empty">No weeks found in the sheet yet.</p>`;
    return;
  }
  week = weeks.at(-1);
  render();
}

init();
