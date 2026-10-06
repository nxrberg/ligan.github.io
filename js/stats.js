import { config } from "./config.js";

export const weeksOf = (teams) =>
  [...new Map(teams.flatMap((t) => Object.values(t.weeks)).map((w) => [w.week, w.weekNo])).entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([week]) => week);

export const ALL = "All";

// One team's stat line over every week: counting stats are summed, SV% is recomputed from the
// summed SV/SA. A stat missing in any of the team's weeks is missing in the total too.
function allWeeksLine(team) {
  const ws = Object.values(team.weeks);
  if (!ws.length) return null;
  const sum = (k) => ws.reduce((acc, w) => (acc == null || w.stats[k] == null ? null : acc + w.stats[k]), 0);
  const stats = {};
  for (const c of config.categories) if (c.key !== "svp") stats[c.key] = sum(c.key);
  stats.svp = stats.sv != null && stats.sa ? stats.sv / stats.sa : null;
  return { week: ALL, fetched: ws.map((w) => w.fetched).sort().at(-1), stats };
}

// Score = for every scored category, pointsWin per team you beat and pointsTie per team you tie.
// A category is left out of Score when any team is missing it, so nobody gets points for a gap.
// Exception: `noValueLoses` categories (SV% with no shots faced) still count; the team without
// a value beats and ties nobody.
export function weeklyBoard(teams, week) {
  const lines = teams.map((t) => ({ name: t.name, line: week === ALL ? allWeeksLine(t) : t.weeks[week] || null }));
  const cats = config.categories.map((c) => {
    const missing = lines
      .filter((l) => !l.line || (l.line.stats[c.key] == null && !c.noValueLoses))
      .map((l) => l.name);
    const counts = c.scored !== false;
    return { ...c, scored: counts && missing.length === 0, dropped: counts && missing.length > 0, missing };
  });

  const rows = lines.map(({ name, line }) => ({
    name,
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
        if (mine == null) continue;
        if (theirs == null || better(mine, theirs)) p += config.pointsWin;
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
