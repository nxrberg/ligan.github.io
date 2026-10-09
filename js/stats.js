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

// Score = for every scored category, pointsWin per team you beat and pointsTie per team you tie.
// Every scored category always counts: a team with a value beats a team without one, and two
// teams without a value tie (Jakob, 2026-10-07).
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
      const mine = r.values[c.key];
      let p = 0;
      for (const o of rows) {
        if (o === r) continue;
        const theirs = o.values[c.key];
        if (mine == null) p += theirs == null ? config.pointsTie : 0;
        else if (theirs == null || better(mine, theirs)) p += config.pointsWin;
        else if (mine === theirs) p += config.pointsTie;
      }
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

// Players ranked like teams on the leaderboard, on per-GP values: in every skater category a
// player gets pointsWin for each other eligible player he beats and pointsTie for each tie.
export function playerBoard(players, minGp) {
  const rows = players.filter((p) => p.gp >= minGp).map((p) => ({ ...p, catPoints: {}, score: 0 }));
  for (const c of SKATER_CATS) {
    for (const r of rows) {
      let pts = 0;
      for (const o of rows) {
        if (o === r) continue;
        if (r.perGp[c.key] > o.perGp[c.key]) pts += config.pointsWin;
        else if (r.perGp[c.key] === o.perGp[c.key]) pts += config.pointsTie;
      }
      r.catPoints[c.key] = pts;
      r.score += pts;
    }
  }
  rows.sort((a, b) => b.score - a.score || b.perGp.p - a.perGp.p || a.player.localeCompare(b.player));
  let rank = 0;
  rows.forEach((r, i) => (r.rank = i && r.score === rows[i - 1].score ? rank : (rank = i + 1)));
  return { rows, maxPerCat: Math.max(0, rows.length - 1) * config.pointsWin };
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
