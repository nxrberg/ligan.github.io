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
