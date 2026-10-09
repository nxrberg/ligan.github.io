import { config } from "./config.js";
import { loadData } from "./data.js";
import { ALL, SKATER_CATS, leagueSkaters, playerBoard, seasonSkaters, threeStars, weeksOf, weeklyBoard } from "./stats.js";
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

// Team logo from the Teams tab; if it fails to load, the cell falls back to the abbreviation.
function logoHtml(r) {
  if (!r.logo) return "";
  return `<img class="logo" src="${esc(r.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.has-logo')?.classList.remove('has-logo');this.remove()">`;
}

// Team page address: #/team/zegeltorp-warriors ("#10" becomes "10", "Q's" becomes "qs").
const slugOf = (name) => name.toLowerCase().replace(/'/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

function fmtValue(v, cat) {
  if (v == null) return "–";
  if (cat.format === "pct") return v >= 1 ? "1.00" : v.toFixed(3).replace(/^0/, "");
  return String(v);
}

function headerHtml(h) {
  const { cat, cls = "", label } = h.column.columnDef.meta;
  const sorted = h.column.getIsSorted();
  const opens = cat ? allCats.filter((o) => o.toggledBy === cat.key) : [];
  const tip = cat && !cat.scored ? "Not counted in Score" : `Sort by ${label}`;
  const canSort = h.column.getCanSort();
  const classes = [cls, canSort ? "sortable" : "toggles", sorted ? "sorted" : "", cat && !cat.scored ? "unscored" : ""].filter(Boolean).join(" ");
  const toggle = opens.length
    ? `<button class="col-toggle" data-toggle="${cat.key}" title="${expanded.has(cat.key) ? "Hide" : "Show"} ${opens.map((o) => o.label).join(" and ")}">${expanded.has(cat.key) ? "▾" : "▸"}</button>`
    : "";
  const arrow = sorted ? `<span class="sort-dir">${sorted === "desc" ? "▼" : "▲"}</span>` : "";
  // A header that opens other columns (SV%) only toggles them; it doesn't sort.
  const attrs = canSort ? `data-col="${h.column.id}"` : `data-toggle="${cat.key}"`;
  const title = canSort ? tip : `${expanded.has(cat.key) ? "Hide" : "Show"} ${opens.map((o) => o.label).join(" and ")}`;
  return `<th class="${classes}" ${attrs} title="${esc(title)}">${esc(label)}${arrow}${toggle}</th>`;
}

function cellHtml(cell, maxPerCat) {
  const r = cell.row.original;
  const { cat: c, cls = "" } = cell.column.columnDef.meta;
  if (cell.column.id === "rank") return `<td class="${cls}">${r.rank}</td>`;
  if (cell.column.id === "team")
    return `<td class="${cls}${r.logo ? " has-logo" : ""}" title="${esc(r.name)}"><a class="team-link" href="#/team/${slugOf(r.name)}">${logoHtml(r)}<strong><span class="full">${esc(r.name)}</span><span class="abbr">${esc(abbrOf(r.name))}</span></strong></a></td>`;
  if (cell.column.id === "score") return `<td class="${cls}"><strong>${r.score}</strong></td>`;

  const p = r.points[c.key];
  const heat = showHeat && c.scored && p != null ? p / maxPerCat : null;
  const style = heat == null ? "" : ` style="--heat:${Math.round(heat * 100)}%"`;
  const rk = r.ranks[c.key];
  const lead = c.scored && rk?.rank === 1;
  const v = r.values[c.key];
  // A perfect SV% shows as a regular-weight ∞ instead of 1.00.
  const text = showRank && c.scored ? (rk ? rk.rank : "–")
    : c.format === "pct" && v >= 1 ? `<span class="inf">∞</span>` : fmtValue(v, c);
  const tip = c.scored
    ? `${fmtValue(r.values[c.key], c)} · ${rk ? `rank ${rk.rank}` : "no rank"} · ${p} pts`
    : "";
  const classes = ["num cat", c.format === "pct" ? "pct" : "", heat == null ? "" : "heat", c.scored ? "" : "unscored", lead ? "lead" : ""].filter(Boolean).join(" ");
  return `<td class="${classes}"${style} title="${esc(tip)}">${text}</td>`;
}

// Column definitions for TanStack Table. Sorting compares raw values; teams without a value go last.
function columnsFor(cats) {
  const col = (id, label, accessorFn, { meta, ...opts } = {}) => ({ id, accessorFn, sortUndefined: "last", ...opts, meta: { label, ...meta } });
  return [
    col("rank", "#", (r) => r.rank, { sortDescFirst: false, meta: { cls: "num col-rank" } }),
    col("team", "Team", (r) => r.name, { sortDescFirst: false, sortingFn: "text", meta: { cls: "team" } }),
    ...cats.map((c) =>
      col(c.key, c.label, (r) => r.values[c.key] ?? undefined, {
        sortDescFirst: !c.lowerIsBetter, sortingFn: "basic", enableSorting: !cats.some((o) => o.toggledBy === c.key), meta: { cat: c, cls: "num cat" },
      })
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

  $("#board").innerHTML = `<div class="table-wrap"><table class="board${week === ALL ? " totals" : ""}${expanded.size ? " wide" : ""}${rows.some((r) => r.logo) ? " logos" : ""}"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
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

  const fetched = rows.map((r) => r.line?.fetched).filter(Boolean).sort().at(-1);
  const info = [
    `Each category gives ${config.pointsWin} points for every team you beat and ${config.pointsTie} for every tie (max ${maxPerCat} per category, ${maxScore} total).`,
    "A team with a value in a category beats a team without one, and two teams without a value tie.",
  ].filter(Boolean);
  $("#notes").innerHTML = `${fetched ? `<p>Data fetched ${esc(fetched)}.</p>` : ""}
    <details${infoOpen ? " open" : ""}><summary>More information</summary>${info.map((n) => `<p>${n}</p>`).join("")}</details>`;
  $("#notes details").addEventListener("toggle", (e) => { infoOpen = e.target.open; });
}

// ---- Team page (#/team/<slug>) ----

const MIN_GP = 3;
const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
const perGame = (v) => v.toFixed(2);
const listOf = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] || "");

function starCard(p, i) {
  const cells = [{ key: "p", label: "P" }, ...SKATER_CATS]
    .map((c) => `<div class="${c.key === "p" ? "key" : ""}"><dt>${esc(c.label)}</dt><dd>${perGame(p.perGp[c.key])}</dd></div>`)
    .join("");
  return `<article class="star-card">
      <p class="star-rank"><span class="star-icons" aria-hidden="true">${"★".repeat(3 - i)}</span>${ordinal(i + 1)} star</p>
      <h3>${esc(p.player)}</h3>
      <p class="star-meta">${[p.nhl, p.pos, `${p.gp} GP`].filter(Boolean).map(esc).join(" · ")}</p>
      <dl class="star-stats">${cells}</dl>
    </article>`;
}

// One bar per scoring category over all weeks, with the league average and the league best
// as marks on the same track. Every category has its own scale: the track runs from 0 (or the
// league's lowest value when that is negative) to the best team, so the best mark sits at the end.
// SV% starts at the league's lowest instead, since every team is close to .900.
// Categories won head to head: a value beats no value, missing on both sides is a tie.
function headToHead(board, row, other) {
  const better = (c, x, y) => (x == null ? false : y == null ? true : c.lowerIsBetter ? x < y : x > y);
  const cats = board.cats.filter((c) => c.scored);
  const won = cats.filter((c) => better(c, row.values[c.key], other.values[c.key])).length;
  const lost = cats.filter((c) => better(c, other.values[c.key], row.values[c.key])).length;
  return { won, lost, tied: cats.length - won - lost };
}

// Small pie of the head-to-head split: this team, the other team, ties.
function winsPie({ won, lost, tied }, row, other) {
  const n = won + lost + tied || 1;
  const a = (won / n) * 360, b = a + (lost / n) * 360;
  const tip = `${abbrOf(row.name)} wins ${won}, ${abbrOf(other.name)} wins ${lost}${tied ? `, ${tied} tied` : ""}`;
  return `<span class="wins" title="${esc(tip)}"><i class="pie" style="--a:${a.toFixed(1)}deg;--b:${b.toFixed(1)}deg" role="img" aria-label="${esc(tip)}"></i>${won}–${lost}${tied ? `–${tied}` : ""}</span>`;
}

// Spider chart of the same categories: each spoke runs from the category's low to the league best
// (the gold outer ring), on the same scales as the bars. The dashed shape is the league average.
function radarChart(board, row, other) {
  const cats = board.cats.filter((c) => c.scored);
  const stats = cats.map((c) => {
    const vals = board.rows.map((r) => r.values[c.key]).filter((v) => v != null);
    const best = c.lowerIsBetter ? Math.min(...vals) : Math.max(...vals);
    const worst = c.lowerIsBetter ? Math.max(...vals) : Math.min(...vals);
    const lo = c.format === "pct" ? worst : Math.min(0, worst);
    return { c, best, lo, avg: vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null };
  });
  const share = (v, s) => (v == null || s.best === s.lo ? (v == null ? 0 : 1) : Math.max(0, Math.min(1, (v - s.lo) / (s.best - s.lo))));
  const R = 100, cx = 150, cy = 140;
  const pt = (i, f) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / stats.length;
    return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f];
  };
  const poly = (fs) => fs.map((f, i) => pt(i, f).map((n) => n.toFixed(1)).join(",")).join(" ");
  const rings = [0.25, 0.5, 0.75].map((f) => `<polygon class="ring" points="${poly(stats.map(() => f))}"/>`).join("");
  const spokes = stats.map((_, i) => { const [x, y] = pt(i, 1); return `<line class="spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join("");
  const labels = stats.map((s, i) => {
    const [x, y] = pt(i, 1.17);
    const anchor = Math.abs(x - cx) < 4 ? "middle" : x > cx ? "start" : "end";
    return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}">${esc(s.c.label)}</text>`;
  }).join("");
  const shape = (r, cls) => `<polygon class="${cls}" points="${poly(stats.map((s) => share(r.values[s.c.key], s)))}"/>`;

  // Who's stronger: categories won head to head, or against the league average when not comparing.
  const better = (c, x, y) => (x == null ? false : y == null ? true : c.lowerIsBetter ? x < y : x > y);
  let verdict;
  if (other) {
    const { won, lost, tied } = headToHead(board, row, other);
    const [a, b] = [abbrOf(row.name), abbrOf(other.name)];
    const lead = won === lost ? "Even" : won > lost ? `${a} stronger` : `${b} stronger`;
    verdict = `<strong>${esc(lead)}</strong>: ${esc(a)} wins ${won}, ${esc(b)} wins ${lost}${tied ? `, ${tied} tied` : ""}`;
  } else {
    const above = stats.filter((s) => better(s.c, row.values[s.c.key], s.avg)).length;
    verdict = `Above the league average in <strong>${above} of ${stats.length}</strong> categories`;
  }
  return `<div class="radar">
      <p class="radar-verdict">${verdict}</p>
      <svg viewBox="0 0 300 280" role="img" aria-label="Spider chart of ${esc(row.name)}${other ? ` and ${esc(other.name)}` : ""} across the categories">
        ${rings}${spokes}
        <polygon class="ring best" points="${poly(stats.map(() => 1))}"/>
        <polygon class="avg" points="${poly(stats.map((s) => share(s.avg, s)))}"/>
        ${other ? shape(other, "team vs") : ""}${shape(row, "team mine")}
        ${labels}
      </svg>
    </div>`;
}

function categoryChart(board, row, other) {
  const pos = (v, lo, hi) => (hi > lo ? Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)) : 100);
  const fmt = (v, c) => (c.format === "pct" ? fmtValue(v, c) : Number.isInteger(v) ? String(v) : v.toFixed(1));
  const bar = (r, c, lo, best, cls) => {
    const v = r.values[c.key];
    return v == null ? `<span class="cat-bar ${cls}"></span>` : `<span class="cat-bar ${cls}" style="height:${pos(v, lo, best).toFixed(1)}%"></span>`;
  };
  const describe = (r, c, n) => {
    const v = r.values[c.key];
    const rk = r.ranks[c.key];
    return `${abbrOf(r.name)} ${v == null ? "no value" : fmt(v, c)}${rk ? ` (${ordinal(rk.rank)} of ${n})` : ""}`;
  };
  const lines = board.cats.filter((c) => c.scored).map((c) => {
    const vals = board.rows.map((r) => r.values[c.key]).filter((v) => v != null);
    if (!vals.length) return "";
    const best = c.lowerIsBetter ? Math.min(...vals) : Math.max(...vals);
    const worst = c.lowerIsBetter ? Math.max(...vals) : Math.min(...vals);
    const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
    const lo = c.format === "pct" ? worst : Math.min(0, worst);
    const mine = row.values[c.key];
    const rk = row.ranks[c.key];
    const tip = `${c.label}: ${[row, other].filter(Boolean).map((r) => describe(r, c, vals.length)).join(" · ")} · average ${fmt(avg, c)} · best ${fmt(best, c)}`;
    // Comparing: the second line shows the other team's value instead of this team's rank.
    const second = other
      ? `<span class="cat-rank vs">${other.values[c.key] == null ? "–" : fmt(other.values[c.key], c)}</span>`
      : `<span class="cat-rank">${rk ? ordinal(rk.rank) : ""}</span>`;
    return `<div class="cat-col" title="${esc(tip)}">
        <span class="cat-value">${mine == null ? "–" : fmt(mine, c)}</span>
        ${second}
        <span class="cat-track${other ? " two" : ""}">
          ${bar(row, c, lo, best, "mine")}${other ? bar(other, c, lo, best, "vs") : ""}
          <span class="cat-mark avg" style="bottom:${pos(avg, lo, best).toFixed(1)}%"></span>
          <span class="cat-mark best" style="bottom:100%"></span>
        </span>
        <span class="cat-label">${esc(c.label)}</span>
      </div>`;
  }).join("");
  const options = board.rows
    .filter((r) => r.name !== row.name)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => `<option value="${esc(r.name)}"${other?.name === r.name ? " selected" : ""}>${esc(r.name)}</option>`)
    .join("");
  return `<section class="cat-chart">
      <div class="cat-head">
        <h2>Categories</h2>
        <label class="compare${other ? " on" : ""}">
          <span>${other ? `vs ${esc(abbrOf(other.name))}` : "Compare"}</span>
          <select id="compare" aria-label="Compare with another team">
            <option value="">${other ? "Stop comparing" : "Compare with…"}</option>${options}
          </select>
        </label>
      </div>
      <p class="cat-legend"><span><i class="key-bar"></i>${esc(abbrOf(row.name))}</span>${other ? `<span><i class="key-bar vs"></i>${esc(abbrOf(other.name))}</span>${winsPie(headToHead(board, row, other), row, other)}<span class="break"></span>` : ""}<span><i class="key-mark avg"></i>League average</span><span><i class="key-mark best"></i>League best</span></p>
      <div class="cat-cols">${lines}</div>
      ${radarChart(board, row, other)}
      <div class="notes"><p>All weeks. Each bar runs from 0 to the league's best team in that category${board.cats.some((c) => c.format === "pct") ? "; SV% from the league's lowest" : ""}.</p></div>
    </section>`;
}

// The team picked under "Compare" on the team page; cleared when you open another team.
let compareWith = null;

function renderTeam(team) {
  const allBoard = weeklyBoard(data.teams, ALL);
  const season = allBoard.rows.find((r) => r.name === team.name);
  const { players, weeksWithoutGp } = seasonSkaters(team);
  const stars = threeStars(players, MIN_GP);
  const counted = weeksOf([team]).filter((w) => !weeksWithoutGp.includes(w));
  const logo = team.logo
    ? `<img src="${esc(team.logo)}" alt="" data-abbr="${esc(abbrOf(team.name))}" referrerpolicy="no-referrer" onerror="this.parentNode.textContent=this.dataset.abbr">`
    : esc(abbrOf(team.name));
  const notes = [
    `Points (G+A) per game played; skaters with at least ${MIN_GP} GP. Every column is the season total divided by GP.`,
    counted.length ? `Counted: ${esc(listOf(counted))}.` : "",
    weeksWithoutGp.length ? `Not counted yet: ${esc(listOf(weeksWithoutGp))}, exported without GP.` : "",
  ].filter(Boolean);

  $("#team-view").innerHTML = `
    <a class="back" href="#/">‹ Leaderboard</a>
    <header class="hero">
      <div class="hero-logo">${logo}</div>
      <h1>${esc(team.name)}</h1>
      ${season ? `<p class="hero-meta">${ordinal(season.rank)} of ${data.teams.length} · ${season.score} pts all weeks</p>` : ""}
    </header>
    <section class="stars">
      <h2>3 Stars</h2>
      ${stars.length
        ? `<div class="star-cards">${stars.map(starCard).join("")}</div>`
        : `<p class="empty">No skater has ${MIN_GP} games played yet.</p>`}
      <div class="notes">${notes.map((n) => `<p>${n}</p>`).join("")}</div>
    </section>
    ${season ? categoryChart(allBoard, season, allBoard.rows.find((r) => r.name === compareWith && r.name !== team.name)) : ""}`;
  $("#compare")?.addEventListener("change", (e) => { compareWith = e.target.value || null; renderTeam(team); });
}

// ---- Veckans guldgossar (#/guldgossar): the league's 10 best skaters ----

const TOP_PLAYERS = 10;
const minGpFor = (w) => (w === ALL ? 3 : 2);
const signed = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
// Per-game values without trailing zeros: 0.42 -> 0.42, 1.50 -> 1.5, 0.00 -> 0.
const perGameShort = (v) => v.toFixed(2).replace(/\.?0+$/, "").replace(/^-0$/, "0") || "0";

function renderPlayers() {
  const minGp = minGpFor(week);
  const { players, weeksWithoutGp } = leagueSkaters(data.teams, week);
  const { rows } = playerBoard(players, minGp);
  const top = rows.filter((r) => r.rank <= TOP_PLAYERS);
  // "Veckans" (this week's) only fits a single week; All covers the whole season.
  const title = week === ALL ? "Guldgossar" : "Veckans guldgossar";
  $("#players-title").textContent = title;
  document.title = `${title} · ${config.leagueName}`;

  // Each player is two rows in its own <tbody>: rank, owner's logo, name and NHL team on top,
  // the categories underneath. Score only orders the list; it's in the name row's tooltip.
  const head = `<tr>${SKATER_CATS.map((c) => `<th class="num cat">${esc(c.label)}</th>`).join("")}</tr>`;
  const body = top.map((r) => {
    const cells = SKATER_CATS.map((c) => {
      const leads = rows.every((o) => o.perGp[c.key] <= r.perGp[c.key]);
      const heat = showHeat ? ` style="--heat:${Math.round(r.heat[c.key] * 100)}%"` : "";
      const tip = `${r.totals[c.key]} in ${r.gp} GP (${r.perGp[c.key].toFixed(2)}) · ${signed(r.z[c.key])} vs average`;
      return `<td class="num cat${heat ? " heat" : ""}${leads ? " lead" : ""}"${heat} title="${esc(tip)}">${perGameShort(r.perGp[c.key])}</td>`;
    }).join("");
    const team = r.team;
    const owner = team
      ? `<span class="owner${team.logo ? " has-logo" : ""}" title="${esc(team.name)}">${team.logo ? logoHtml(team) : ""}<span class="owner-abbr">${esc(abbrOf(team.name))}</span></span>`
      : "";
    return `<tbody class="player-block">
      <tr class="name-row"><td colspan="${SKATER_CATS.length}" title="Score ${signed(r.score)}"><span class="player-rank">${r.rank}</span>${owner}<strong>${esc(r.player)}</strong><span class="player-meta">${esc([r.nhl, `${r.gp} GP`].filter(Boolean).join(" · "))}</span></td></tr>
      <tr class="stat-row">${cells}</tr>
    </tbody>`;
  }).join("");

  $("#players").innerHTML = top.length
    ? `<div class="table-wrap"><table class="board players"><thead>${head}</thead>${body}</table></div>`
    : `<p class="empty">No skater has ${minGp} games played ${week === ALL ? "yet" : `in ${esc(week)}`}.</p>`;

  const info = [
    `Every column is the player's ${week === ALL ? "total over all weeks" : "total for the week"} divided by his games played (GP).`,
    "Players are ranked by how far above average they are: in each category a player's value is compared with the average of everyone taking part, measured in standard deviations (+1.0 is well above average, 0 is average), and the seven categories are added up. A big lead counts for more than a narrow one.",
    `Skaters on every team's roster with at least ${minGp} GP ${week === ALL ? "over all weeks" : "that week"} take part: ${rows.length} players.`,
    weeksWithoutGp.length ? `Not counted: ${esc(listOf(weeksWithoutGp))}, exported without GP.` : "",
  ].filter(Boolean);
  $("#player-notes").innerHTML = `<details${infoOpen ? " open" : ""}><summary>More information</summary>${info.map((n) => `<p>${n}</p>`).join("")}</details>`;
  $("#player-notes details").addEventListener("toggle", (e) => { infoOpen = e.target.open; });
}

let boardScroll = 0;

// Shows the team page for #/team/<slug>, the player page for #/guldgossar, the leaderboard for anything else.
function route() {
  const slug = location.hash.match(/^#\/team\/([^/?]+)/)?.[1];
  const team = slug && data.teams.find((t) => slugOf(t.name) === decodeURIComponent(slug));
  const onPlayers = /^#\/guldgossar\b/.test(location.hash);
  const onBoard = $("#team-view").hidden && $("#players-view").hidden;
  if ((team || onPlayers) && onBoard) boardScroll = window.scrollY;
  if (team) {
    compareWith = null;
    renderTeam(team);
    document.title = `${team.name} · ${config.leagueName}`;
  } else if (onPlayers) {
    renderPlayers();
  } else {
    document.title = config.leagueName;
  }
  $("#board-view").hidden = !!team || onPlayers;
  $("#team-view").hidden = !team;
  $("#players-view").hidden = !onPlayers;
  window.scrollTo(0, team || onPlayers ? 0 : boardScroll);
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
  // The leaderboard and the player page each have a row of week tabs; both pick the same week.
  const tabRows = [$("#week-tabs"), $("#player-tabs")];
  const selectWeek = (w) => {
    week = w;
    for (const tabs of tabRows) tabs.querySelectorAll("[data-week]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.week === w)));
    render();
    if (!$("#players-view").hidden) renderPlayers();
  };
  for (const tabs of tabRows) {
    tabs.innerHTML = [...weeks, ALL].map((w) => `<button role="tab" data-week="${esc(w)}">${esc(w)}</button>`).join("");
    tabs.addEventListener("click", (e) => {
      const b = e.target.closest("[data-week]");
      if (b) selectWeek(b.dataset.week);
    });
  }
  $("#show-rank").addEventListener("change", (e) => { showRank = e.target.checked; render(); });
  $("#show-heat").checked = showHeat;
  $("#show-heat").addEventListener("change", (e) => { showHeat = e.target.checked; writePref("heatmap", showHeat); render(); });

  window.addEventListener("hashchange", route);
  if (!weeks.length) {
    $("#board").innerHTML = `<p class="empty">No weeks found in the sheet yet.</p>`;
    return route();
  }
  selectWeek(weeks.at(-1));
  for (const tabs of tabRows) tabs.scrollLeft = tabs.scrollWidth; // latest week in view when there are many
  route();
}

init();
