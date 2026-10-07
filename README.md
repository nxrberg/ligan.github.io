# Ligan V2

Leaderboard and stats site for our Yahoo fantasy hockey league. Plain HTML/CSS/JS, no build step. Data comes from the `yhExport` Google Sheet, one tab per team, read with the Google Sheets API (or through [Sheety](https://sheety.co) as a fallback).

## Weekly leaderboard

Shows every team's category totals for the selected week plus a **Score** column on the far right. In each scored category a team gets 2 points for every other team it beats and 1 point for every tie (max 22 per category with 12 teams). Score is the sum over all scored categories. Cells are shaded by how many points they earned; tick "Cats rank" to see each team's rank in every category instead of the stats (tied teams share a rank). SV and SA don't count toward Score and are hidden; click the SV% header to show or hide them (SV% itself doesn't sort). Click any other column header to sort by it (click again to flip the order). Each category's leader (or leaders, when tied) is shown in bold, with a ★ on wider screens. The "Heatmap" toggle turns the shading off and on, and the browser remembers the choice.

Team logos come from the sheet's **Teams** tab (Id, Team, Logo, Updated, written by the export). A team without a logo, or whose logo fails to load, shows its short name instead.

The table is built for phones first: on narrow screens it uses smaller type, shows each team's short name (`abbr` in `js/config.js`) and hides the overall # column so all 10 scored categories fit without scrolling. Full names and the # column come back on wider screens.

Pick a week from the tabs above the table. The **All** tab adds up every week (SV% from the summed SV/SA) and scores those totals the same way; a stat missing in any of a team's weeks is missing from its total.

The table is rendered with [TanStack Table](https://tanstack.com/table) (`@tanstack/table-core`, MIT), loaded as a pinned version from the jsDelivr CDN, so there's still no build step.

Categories, points per win/tie, and which categories count are set in `js/config.js`. A category is left out of Score for everyone if any team is missing it that week.

## Data notes

- Each team tab has player rows plus `Skater totals` and `Goalie totals` rows; the site uses the totals rows. If a week was fetched more than once, the latest fetch wins.
- GP can be blank (the matchup-page export has no GP column); the site doesn't need it.
- One bad export (2026-10-05 22:57) wrote every stat one column to the right. The site spots those fetches (the goalie totals' SHO holds a fraction) and shifts the values back, but the last column (SOG, SHO) is lost in them. Re-exporting the week replaces them.
- SV% is recomputed from SV / SA.
- Yahoo shows "-" for a category with no stats yet. The site reads that as 0, except SV%, where it means no value; a team with no SV% gets 0 points in that category while it still counts for everyone else.
- After every export the Pi (`write_sheet.py`) uploads all tabs as `league.json` to the `data` branch of this repo, and the site reads that file (`liveDataUrl` in `js/config.js`) on each page load, so new data shows up within a few minutes without a deploy. If it can't be read, the site uses the copy from the last deploy.
- The browser never reads the sheet. `scripts/fetch-data.mjs` pulls every tab into `data/league.json`, and the deploy job runs it, so the credentials stay in repository secrets. Without `data/league.json` the site shows `data/sample.json`.

## Run locally

```sh
GOOGLE_SERVICE_ACCOUNT="$(cat key.json)" GOOGLE_SHEET_ID=<id> node scripts/fetch-data.mjs   # optional: real data
python3 -m http.server 8000
```

Then open http://localhost:8000. (Opening `index.html` directly won't work because of ES modules.)

## Deploy

`.github/workflows/pages.yml` publishes to GitHub Pages on every push to `main`, once a day at 10:10 Swedish time (10 minutes after the Pi updates the sheet), and on demand (Actions → Deploy site → Run workflow). Only the daily and on-demand runs fetch the sheet; a push reuses the `data/league.json` already on the live site. If a fetch fails the site keeps its previous data and the run shows a "Data not refreshed" warning.

One-time setup in the GitHub repo:
1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → add `GOOGLE_SERVICE_ACCOUNT` (the whole JSON key file of a Google service account that can view the sheet) and `GOOGLE_SHEET_ID` (the long id in the sheet's URL). The script only asks Google for read-only access.
3. Optional fallback: `SHEETY_BASE` = `https://api.sheety.co/<id>/yhExport` (and `SHEETY_TOKEN` if Sheety auth is on), with POST, PUT and DELETE turned off in Sheety. Sheety's plan limits how many requests a month it answers (it returns 402 when they run out).
