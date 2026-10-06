// The Yahoo export sheet has one tab per team. scripts/fetch-data.mjs pulls every tab from
// Sheety (URL in the SHEETY_BASE secret) into `dataUrl`, which is all the browser loads.
export const config = {
  leagueName: "Ligan",

  dataUrl: "data/league.json",

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
