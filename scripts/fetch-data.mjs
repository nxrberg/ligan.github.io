// Fetches every team tab from Sheety and writes them to one file the site reads,
// so visitors never see the Sheety URL or spend its request quota.
//   SHEETY_BASE=https://api.sheety.co/<id>/yhExport node scripts/fetch-data.mjs
import { writeFile } from "node:fs/promises";
import { config } from "../js/config.js";

const base = process.env.SHEETY_BASE?.replace(/\/$/, "");
if (!base) {
  console.error("SHEETY_BASE is not set (add it as a repository secret).");
  process.exit(1);
}
const headers = process.env.SHEETY_TOKEN ? { Authorization: `Bearer ${process.env.SHEETY_TOKEN}` } : {};

const out = {};
for (const t of config.teams) {
  const res = await fetch(`${base}/${encodeURIComponent(t.sheet)}`, { headers });
  if (!res.ok) {
    console.error(`Sheety returned ${res.status} for ${t.sheet}`);
    process.exit(1);
  }
  out[t.sheet] = await res.json();
}

// The Teams tab (Id, Team, Logo, Updated) is optional: until the export writes it and it's
// enabled in Sheety, the site shows abbreviations instead of logos.
const teamsRes = await fetch(`${base}/${encodeURIComponent(config.teamsSheet)}`, { headers });
if (teamsRes.ok) out[config.teamsSheet] = await teamsRes.json();
else console.warn(`No ${config.teamsSheet} tab (Sheety returned ${teamsRes.status}); logos left out`);

const file = process.argv[2] || "data/league.json";
await writeFile(file, JSON.stringify(out));
console.log(`Wrote ${config.teams.length} teams to ${file}`);
