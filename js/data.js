import { config } from "./config.js";

// Sheety wraps rows in a single key named after the sheet; unwrap whatever it is.
const rowsOf = (body) => (Array.isArray(body) ? body : Object.values(body).find(Array.isArray) || []);

// "12", "-3", ",944" (Swedish decimal comma), ".893", "" -> number or null.
function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Column order in the Yahoo export. GP may be blank (the matchup-page export has no GP).
const SKATER_COLS = ["gp", "g", "a", "+/", "pim", "ppp", "gwg", "sog"];
const GOALIE_COLS = ["gp", "w", "sv", "sa", "sv%", "sho"];

// One bad export (2026-10-05 22:57) wrote every stat one column to the right, pushing the
// last stat (SOG / SHO) off the sheet. Spot it from the goalie totals: SHO is a count, but in
// a shifted row it holds the SV% fraction. The whole fetch is shifted or none of it is.
function isShifted(goalieTotals) {
  const sho = num(goalieTotals?.sho);
  return sho != null && !Number.isInteger(sho);
}

// Yahoo shows "-" for a category with no stats yet (e.g. goalies who haven't played).
// That's 0 for counting stats, and no value for SV%.
function readTotals(row, cols, shifted) {
  if (!row) return {};
  const values = {};
  cols.forEach((col, i) => {
    const src = shifted ? cols[i + 1] : col;
    const raw = src ? String(row[src] ?? "").trim() : "";
    values[col] = raw === "-" ? (col === "sv%" ? null : 0) : num(raw);
  });
  return values;
}

const weekNo = (w) => Number(String(w).match(/\d+/)?.[0] ?? 0);

// Collapse one team's rows into { week -> stat line } using the latest fetch of each week.
function parseTeam(rows) {
  const byWeek = {};
  for (const r of rows) {
    const wk = (byWeek[r.week] ||= {});
    const f = (wk[r.fetched] ||= []);
    f.push(r);
  }
  const weeks = {};
  for (const [week, fetches] of Object.entries(byWeek)) {
    const latest = Object.keys(fetches).sort().at(-1);
    const rs = fetches[latest];
    const goRow = rs.find((r) => r.type === "Goalie totals");
    const shifted = isShifted(goRow);
    const s = readTotals(rs.find((r) => r.type === "Skater totals"), SKATER_COLS, shifted);
    const g = readTotals(goRow, GOALIE_COLS, shifted);
    weeks[week] = {
      week,
      weekNo: weekNo(week),
      fetched: latest,
      shifted,
      stats: {
        g: s.g, a: s.a, pm: s["+/"], pim: s.pim, ppp: s.ppp, gwg: s.gwg, sog: s.sog,
        w: g.w, sv: g.sv, sa: g.sa, sho: g.sho,
        // Recompute SV% from SV/SA; the sheet's own value is rounded and locale-formatted.
        svp: g.sv != null && g.sa != null ? (g.sa ? g.sv / g.sa : null) : g["sv%"],
      },
    };
  }
  return weeks;
}

// Team names compared loosely, so "Q's", "q's" and "qs" all match.
const key = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}#]/gu, "");

// Teams tab rows -> Map of team key -> logo URL (only absolute https URLs are used).
function logosOf(rows) {
  const m = new Map();
  for (const r of rows) {
    const url = String(r.logo ?? "").trim();
    if (r.team && /^https:\/\//.test(url)) m.set(key(r.team), url);
  }
  return m;
}

// Where the data comes from, newest first:
//   1. config.liveDataUrl: the file the Pi uploads after every export, read on each page load,
//      so new data shows up without a deploy.
//   2. config.dataUrl: the copy baked into the last deploy (scripts/fetch-data.mjs).
//   3. data/sample.json, e.g. when running locally without either.
async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// A data file is usable when it has rows for at least one team.
const hasTeams = (all) => all && config.teams.some((t) => rowsOf(tabOf(all, t.sheet, t.name) || []).length);

// The deploy keys tabs by Sheety name ("zegeltorpWarriors"), the Pi upload by tab title
// ("Zegeltorp Warriors"); accept either.
function tabOf(all, ...names) {
  for (const n of names) if (all[n]) return all[n];
  const wanted = names.map(key);
  const k = Object.keys(all).find((k) => wanted.includes(key(k)));
  return k ? all[k] : null;
}

export async function loadData() {
  // A per-minute query string gets past CDN caching of the uploaded file.
  const live = config.liveDataUrl && (await fetchJson(`${config.liveDataUrl}?m=${Math.floor(Date.now() / 60000)}`));
  let source = "live";
  let all = hasTeams(live) ? live : null;
  if (!all) {
    const deployed = await fetchJson(config.dataUrl);
    if (hasTeams(deployed)) all = deployed;
  }
  if (!all) {
    source = "sample";
    all = await fetchJson("data/sample.json");
  }
  if (!all) throw new Error(`couldn't load ${config.dataUrl}`);
  const logos = logosOf(rowsOf(tabOf(all, config.teamsSheet) || []));
  const teams = config.teams.map((t) => ({
    ...t,
    logo: logos.get(key(t.name)) || logos.get(key(t.sheet)) || null,
    weeks: parseTeam(rowsOf(tabOf(all, t.sheet, t.name) || [])),
  }));
  return { source, teams };
}
