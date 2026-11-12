// The Yahoo export sheet has one tab per team. After each export the Pi uploads the season it wrote
// to the "data" branch as seasons/<season>.json; the site reads `liveDataUrl`, and the deploy bakes a
// copy of it into `dataUrl` as a fallback.

// The season the site shows. Rows carry a `season` column (e.g. "2012-13"); only rows from this one are
// read. The deploy workflow reads this line to pick the season file, so keep it in this form.
const season = "2026-27";

export const config = {
  leagueName: "Ligan",

  season,

  // The Pi uploads the season's sheet data here after every export (branch "data" of the site repo);
  // the site reads it on each page load, so new data needs no deploy.
  liveDataUrl: `https://raw.githubusercontent.com/nxrberg/ligan.github.io/data/seasons/${season}.json`,

  // Copy baked into the last deploy (the same season file), used when the live file can't be read.
  dataUrl: "data/league.json",

  // Sheety endpoint for the Teams tab (Id, Team, Logo, Updated) that the export writes; gives each team's logo.
  teamsSheet: "teams",

  // The Daily tab (player rows per date with Team and Opponent). Each week's head-to-head matchup comes
  // from the team tabs' `opponent` column; this tab fills in weeks the team tabs don't have it for.
  dailySheet: "daily",

  // `sheet` is the Sheety endpoint name for the team's tab (it gets URL-encoded, so "#10" and "q's" are fine).
  // `abbr` is the short name shown on narrow screens.
  teams: [
    { name: "Zegeltorp Warriors", sheet: "zegeltorpWarriors", abbr: "ZEG" },
    { name: "The Chalupa Batmans", sheet: "theChalupaBatmans", abbr: "CHA" },
    { name: "#10", sheet: "#10", abbr: "#10" },
    { name: "Elnour", sheet: "elnour", abbr: "ELN" },
    { name: "Fiskens HC", sheet: "fiskensHc", abbr: "FHC" },
    { name: "Frippe IK", sheet: "frippeIk", abbr: "FIK" },
    { name: "Kingkordies", sheet: "kingkordies", abbr: "KKD" },
    { name: "Kyrkbyn Bullies", sheet: "kyrkbynBullies", abbr: "KYR" },
    { name: "Pucks N Roses", sheet: "pucksNRoses", abbr: "PNR" },
    { name: "Q's", sheet: "q's", abbr: "Q'S" },
    { name: "Riverland", sheet: "riverland", abbr: "RIV" },
    { name: "Team Svensson", sheet: "teamSvensson", abbr: "SVE" },
  ],

  // Scoring categories, in display order. `key` is the stat's name after parsing (see data.js).
  // scored: false shows the column without counting it toward Score.
  // lowerIsBetter: true flips the comparison (e.g. GAA).
  // toggledBy: hidden until you click the header of that category (SV and SA open from SV%).
  categories: [
    { key: "g", label: "G" },
    { key: "a", label: "A" },
    { key: "pm", label: "+/-" },
    { key: "pim", label: "PIM" },
    { key: "ppp", label: "PPP" },
    { key: "gwg", label: "GWG" },
    { key: "sog", label: "SOG" },
    { key: "w", label: "W" },
    { key: "sv", label: "SV", scored: false, toggledBy: "svp" },
    { key: "sa", label: "SA", scored: false, toggledBy: "svp" },
    { key: "svp", label: "SV%", format: "pct" },
    { key: "sho", label: "SHO" },
  ],

  // Points per opponent in each category.
  pointsWin: 2,
  pointsTie: 1,

  // Score turns red (underpaid) or green (overpaid) when a team's matchup result is at least this
  // many points from what its play was worth against an average team (averaged per week on All).
  luckThreshold: 4,
};
