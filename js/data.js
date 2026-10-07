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

// data/league.json is written by scripts/fetch-data.mjs (the deploy job runs it).
// Without it, e.g. when running locally, the site falls back to data/sample.json.
export async function loadData() {
  let source = "live";
  let res = await fetch(config.dataUrl, { cache: "no-cache" });
  if (!res.ok) {
    source = "sample";
    res = await fetch("data/sample.json");
  }
  if (!res.ok) throw new Error(`couldn't load ${config.dataUrl} (${res.status})`);
  const all = await res.json();
  const logos = logosOf(rowsOf(all[config.teamsSheet] || []));
  const teams = config.teams.map((t) => ({
    ...t,
    logo: logos.get(key(t.name)) || logos.get(key(t.sheet)) || null,
    weeks: parseTeam(rowsOf(all[t.sheet] || [])),
  }));
  return { source, teams };
}
