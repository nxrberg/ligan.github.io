// The Yahoo export sheet has one tab per team. The Pi uploads all tabs to `liveDataUrl` after each
// export; the deploy also bakes a copy into `dataUrl` (scripts/fetch-data.mjs) as a fallback.
export const config = {
  leagueName: "Ligan",

  // The Pi uploads the sheet's contents here after every export (branch "data" of the site repo);
  // the site reads it on each page load, so new data needs no deploy.
  liveDataUrl: "https://raw.githubusercontent.com/nxrberg/ligan.github.io/data/league.json",

  // Copy baked into the last deploy, used when the live file can't be read.
  dataUrl: "data/league.json",

  // Sheety endpoint for the Teams tab (Id, Team, Logo, Updated) that the export writes; gives each team's logo.
  teamsSheet: "teams",

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
  // noValueLoses: true keeps scoring the category when a team has no value; that team gets 0.
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
    { key: "svp", label: "SV%", format: "pct", noValueLoses: true },
    { key: "sho", label: "SHO" },
  ],

  // Points per opponent in each category.
  pointsWin: 2,
  pointsTie: 1,
};
