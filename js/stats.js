import { config } from "./config.js";

export const weeksOf = (teams) =>
  [...new Map(teams.flatMap((t) => Object.values(t.weeks)).map((w) => [w.week, w.weekNo])).entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([week]) => week);

export const ALL = "All";

// One team's stat line over every week: counting stats are summed over the weeks that have a
// value (missing only if no week has one), SV% is recomputed from the summed SV/SA.
function allWeeksLine(team) {
  const ws = Object.values(team.weeks);
  if (!ws.length) return null;
  const sum = (k) => ws.reduce((acc, w) => (w.stats[k] == null ? acc : (acc ?? 0) + w.stats[k]), null);
  const stats = {};
  for (const c of config.categories) if (c.key !== "svp") stats[c.key] = sum(c.key);
  stats.svp = stats.sv != null && stats.sa ? stats.sv / stats.sa : null;
  return { week: ALL, fetched: ws.map((w) => w.fetched).sort().at(-1), stats };
}

// Points one team's value earns against another's in a category: pointsWin for a win, pointsTie
// for a tie. A team with a value beats a team without one, and two teams without a value tie
// (Jakob, 2026-10-07).
function catPoints(c, mine, theirs) {
  const better = c.lowerIsBetter ? mine < theirs : mine > theirs;
  if (mine == null) return theirs == null ? config.pointsTie : 0;
  if (theirs == null || better) return config.pointsWin;
  return mine === theirs ? config.pointsTie : 0;
}

// Score = for every scored category, catPoints against every other team. Every scored category
// always counts, so a team without a value still ties the others without one.
export function weeklyBoard(teams, week) {
  const lines = teams.map((t) => ({ name: t.name, logo: t.logo, line: week === ALL ? allWeeksLine(t) : t.weeks[week] || null }));
  const cats = config.categories.map((c) => ({ ...c, scored: c.scored !== false }));

  const rows = lines.map(({ name, logo, line }) => ({
    name,
    logo,
    line,
    values: Object.fromEntries(cats.map((c) => [c.key, line?.stats[c.key] ?? null])),
    points: {},
    ranks: {},
    score: 0,
  }));

  for (const c of cats) {
    if (!c.scored) continue;
    const better = c.lowerIsBetter ? (x, y) => x < y : (x, y) => x > y;
    for (const r of rows) {
      const p = rows.reduce((sum, o) => (o === r ? sum : sum + catPoints(c, r.values[c.key], o.values[c.key])), 0);
      r.points[c.key] = p;
      r.score += p;
    }
    // Rank in the category: 1 + teams strictly better. Teams without a value get no rank.
    for (const r of rows) {
      const mine = r.values[c.key];
      if (mine == null) continue;
      const others = rows.filter((o) => o !== r && o.values[c.key] != null);
      r.ranks[c.key] = {
        rank: 1 + others.filter((o) => better(o.values[c.key], mine)).length,
        tied: others.some((o) => o.values[c.key] === mine),
      };
    }
  }

  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let rank = 0;
  rows.forEach((r, i) => (r.rank = i && r.score === rows[i - 1].score ? rank : (rank = i + 1)));

  const maxPerCat = (teams.length - 1) * config.pointsWin;
  return { rows, cats, maxPerCat, maxScore: maxPerCat * cats.filter((c) => c.scored).length };
}

// Was a team over- or underpaid by its matchup? (Jakob, 2026-10-14) Actual is what it earned
// against its real opponent (catPoints in every scored category, so 6 wins and 2 ties of 10 is
// 14). Worth is its Score divided by the number of other teams: what its week would earn against
// an average opponent. `opponents` is { team name -> opponent name } for the board's `week`.
// Returns Map of team name -> { actual, worth, weeks: 1, games: [one game] } for the teams whose
// matchup is known; a game also has the opponent, the category record (won, lost, tied), Score and
// `cats`: each scored category with both teams' values and the points it gave this team.
export function matchupLuck(board, opponents = {}, week = "") {
  const byName = new Map(board.rows.map((r) => [r.name, r]));
  const scored = board.cats.filter((c) => c.scored);
  const out = new Map();
  for (const r of board.rows) {
    const o = byName.get(opponents[r.name]);
    if (!o || !r.line || !o.line) continue;
    const game = { week, opponent: o.name, score: r.score, actual: 0, worth: r.score / (board.rows.length - 1), won: 0, lost: 0, tied: 0, cats: [] };
    for (const c of scored) {
      const p = catPoints(c, r.values[c.key], o.values[c.key]);
      game.cats.push({ cat: c, mine: r.values[c.key], theirs: o.values[c.key], points: p });
      game.actual += p;
      game[p === config.pointsWin ? "won" : p === config.pointsTie ? "tied" : "lost"] += 1;
    }
    out.set(r.name, { actual: game.actual, worth: game.worth, weeks: 1, games: [game] });
  }
  return out;
}

// matchupLuck over all weeks: Actual and Worth summed over the weeks whose matchups are known.
export function seasonLuck(teams, matchups) {
  const out = new Map();
  const weeks = Object.keys(matchups).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  for (const week of weeks) {
    for (const [name, l] of matchupLuck(weeklyBoard(teams, week), matchups[week], week)) {
      const cur = out.get(name) || { actual: 0, worth: 0, weeks: 0, games: [] };
      out.set(name, { actual: cur.actual + l.actual, worth: cur.worth + l.worth, weeks: cur.weeks + 1, games: [...cur.games, ...l.games] });
    }
  }
  return out;
}

// Skater categories shown on the team page, as averages per game played.
export const SKATER_CATS = [
  { key: "g", label: "G" },
  { key: "a", label: "A" },
  { key: "pm", label: "+/-" },
  { key: "pim", label: "PIM" },
  { key: "ppp", label: "PPP" },
  { key: "gwg", label: "GWG" },
  { key: "sog", label: "SOG" },
];

// Sums skater rows into one line per player and divides each category by games played. Rows
// without GP are skipped. `entries` are { team, skaters } in week order; a player's NHL team,
// position and fantasy team come from the latest row.
function sumSkaters(entries) {
  const players = new Map();
  for (const { team, skaters } of entries) {
    for (const p of skaters) {
      if (!p.gp) continue;
      const cur = players.get(p.player) || { player: p.player, nhl: p.nhl, pos: p.pos, gp: 0, weeks: 0, totals: {} };
      Object.assign(cur, { nhl: p.nhl || cur.nhl, pos: p.pos || cur.pos, team: team ?? cur.team }); // latest week wins
      cur.gp += p.gp;
      cur.weeks += 1;
      for (const c of SKATER_CATS) cur.totals[c.key] = (cur.totals[c.key] || 0) + (p.stats[c.key] || 0);
      players.set(p.player, cur);
    }
  }
  return [...players.values()].map((p) => ({
    ...p,
    points: p.totals.g + p.totals.a,
    perGp: Object.fromEntries([["p", (p.totals.g + p.totals.a) / p.gp], ...SKATER_CATS.map((c) => [c.key, p.totals[c.key] / p.gp])]),
  }));
}

// Weeks exported without GP (every skater's gp blank) can't give an average.
const hasGp = (w) => (w.skaters || []).some((p) => p.gp != null);

// A team's skaters over the season: every week a player was on the roster is summed, and each
// category is divided by games played. Weeks exported without GP can't give an average, so
// they're left out and listed in `weeksWithoutGp`.
export function seasonSkaters(team) {
  const weeks = Object.values(team.weeks).filter((w) => w.skaters?.length).sort((a, b) => a.weekNo - b.weekNo);
  return {
    players: sumSkaters(weeks.filter(hasGp).map((w) => ({ skaters: w.skaters }))),
    weeksWithoutGp: weeks.filter((w) => !hasGp(w)).map((w) => w.week),
  };
}

// Every skater in the league for one week (or summed over all weeks for ALL), each with the
// fantasy team he played for (the latest one, if he moved).
export function leagueSkaters(teams, week) {
  const weeks = teams.flatMap((t) => Object.values(t.weeks).filter((w) => w.skaters?.length && (week === ALL || w.week === week)).map((w) => ({ team: t, w })));
  weeks.sort((a, b) => a.w.weekNo - b.w.weekNo);
  return {
    players: sumSkaters(weeks.filter(({ w }) => hasGp(w)).map(({ team, w }) => ({ team, skaters: w.skaters }))),
    weeksWithoutGp: [...new Set(weeks.filter(({ w }) => !hasGp(w)).map(({ w }) => w.week))],
  };
}

// Players ranked by how far above the league average they are (Jakob, 2026-10-09): in every
// skater category a player's per-GP value becomes a z-score among the eligible players (how many
// standard deviations above or below the average), and Score is the sum over the categories.
// Unlike counting players beaten, a big lead counts for more than a narrow one.
export function playerBoard(players, minGp) {
  const rows = players.filter((p) => p.gp >= minGp).map((p) => ({ ...p, z: {}, heat: {}, score: 0 }));
  for (const c of SKATER_CATS) {
    const xs = rows.map((r) => r.perGp[c.key]);
    const mean = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length || 1));
    const zs = rows.map((r) => (sd ? (r.perGp[c.key] - mean) / sd : 0));
    const lo = Math.min(...zs), hi = Math.max(...zs);
    rows.forEach((r, i) => {
      r.z[c.key] = zs[i];
      r.heat[c.key] = hi > lo ? (zs[i] - lo) / (hi - lo) : 0; // 0..1 within the category, for the heatmap
      r.score += zs[i];
    });
  }
  rows.sort((a, b) => b.score - a.score || b.perGp.p - a.perGp.p || a.player.localeCompare(b.player));
  rows.forEach((r, i) => (r.rank = i + 1));
  return { rows };
}

// The team's "3 stars": skaters with at least `minGp` games, best points (G+A) per game first,
// then the other categories per game as tie-breakers.
export function threeStars(players, minGp = 3) {
  const order = ["p", ...SKATER_CATS.map((c) => c.key)];
  return players
    .filter((p) => p.gp >= minGp)
    .sort((x, y) => {
      for (const k of order) if (y.perGp[k] !== x.perGp[k]) return y.perGp[k] - x.perGp[k];
      return x.player.localeCompare(y.player);
    })
    .slice(0, 3);
}
