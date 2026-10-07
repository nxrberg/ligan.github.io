// Fetches every team tab of the export sheet and writes them to one file the site reads,
// so visitors never see the sheet or spend any API quota.
//
// Two sources, tried in this order:
//   GOOGLE_SERVICE_ACCOUNT='<service account JSON>' GOOGLE_SHEET_ID=<id> node scripts/fetch-data.mjs
//     Reads the Google Sheet directly with the Sheets API (read-only scope, no request quota to speak of).
//   SHEETY_BASE=https://api.sheety.co/<id>/yhExport node scripts/fetch-data.mjs
//     Reads it through Sheety (one request per tab, counts against the Sheety plan).
import { createSign } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { config } from "../js/config.js";

// Team names compared loosely, so "Q's", "q's" and "qs" all match (same rule as js/data.js).
const key = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}#]/gu, "");

async function fromGoogle(serviceAccount, sheetId) {
  const sa = JSON.parse(serviceAccount);
  const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 600,
  };
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64(claims)}`;
  const jwt = `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url")}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!tokenRes.ok) throw new Error(`Google sign-in failed (${tokenRes.status}): ${await tokenRes.text()}`);
  const headers = { Authorization: `Bearer ${(await tokenRes.json()).access_token}` };

  const api = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`;
  const get = async (url) => {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Sheets API returned ${res.status}: ${await res.text()}`);
    return res.json();
  };
  const titles = (await get(`${api}?fields=sheets.properties.title`)).sheets.map((s) => s.properties.title);

  // Tab title -> where the site expects it: a team's `sheet` name, or the Teams tab.
  const targets = new Map();
  for (const title of titles) {
    const team = config.teams.find((t) => key(t.name) === key(title) || key(t.sheet) === key(title));
    if (team) targets.set(title, team.sheet);
    else if (key(title) === key(config.teamsSheet)) targets.set(title, config.teamsSheet);
  }
  const missing = config.teams.filter((t) => ![...targets.values()].includes(t.sheet)).map((t) => t.name);
  if (missing.length) throw new Error(`No tab found for ${missing.join(", ")} (tabs: ${titles.join(", ")})`);

  const quoted = [...targets.keys()].map((t) => `'${t.replace(/'/g, "''")}'`);
  const qs = quoted.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const { valueRanges } = await get(`${api}/values:batchGet?${qs}&valueRenderOption=FORMATTED_VALUE`);

  // Shape each tab like Sheety does: one object per row, keyed by the lower-cased header
  // ("+/-" becomes "+/", as Sheety names it), all values as strings.
  const out = {};
  [...targets.values()].forEach((dest, i) => {
    const [header = [], ...rows] = valueRanges[i].values || [];
    const keys = header.map((h) => (String(h).trim() === "+/-" ? "+/" : String(h).trim().toLowerCase()));
    const objs = rows
      .filter((r) => r.some((v) => String(v).trim() !== ""))
      .map((r) => Object.fromEntries(keys.map((k, j) => [k, r[j] ?? ""])));
    out[dest] = { rows: objs };
  });
  return out;
}

async function fromSheety(base) {
  const headers = process.env.SHEETY_TOKEN ? { Authorization: `Bearer ${process.env.SHEETY_TOKEN}` } : {};
  const out = {};
  for (const t of config.teams) {
    const res = await fetch(`${base}/${encodeURIComponent(t.sheet)}`, { headers });
    if (!res.ok) throw new Error(`Sheety returned ${res.status} for ${t.sheet}${res.status === 402 ? " (out of quota)" : ""}`);
    out[t.sheet] = await res.json();
  }
  // The Teams tab (Id, Team, Logo, Updated) is optional: until the export writes it and it's
  // enabled in Sheety, the site shows abbreviations instead of logos.
  const res = await fetch(`${base}/${encodeURIComponent(config.teamsSheet)}`, { headers });
  if (res.ok) out[config.teamsSheet] = await res.json();
  else console.warn(`No ${config.teamsSheet} tab (Sheety returned ${res.status}); logos left out`);
  return out;
}

const { GOOGLE_SERVICE_ACCOUNT, GOOGLE_SHEET_ID } = process.env;
const sheetyBase = process.env.SHEETY_BASE?.replace(/\/$/, "");
let out;
let source;
try {
  if (GOOGLE_SERVICE_ACCOUNT && GOOGLE_SHEET_ID) {
    source = "Google Sheets API";
    out = await fromGoogle(GOOGLE_SERVICE_ACCOUNT, GOOGLE_SHEET_ID);
  } else if (sheetyBase) {
    source = "Sheety";
    out = await fromSheety(sheetyBase);
  } else {
    console.error("Set GOOGLE_SERVICE_ACCOUNT and GOOGLE_SHEET_ID, or SHEETY_BASE (repository secrets).");
    process.exit(1);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const file = process.argv[2] || "data/league.json";
await writeFile(file, JSON.stringify(out));
console.log(`Wrote ${config.teams.length} teams to ${file} from ${source}${out[config.teamsSheet] ? " (with logos)" : ""}`);
