# Live data for the Ligan site

The Pi's export (`write_sheet.py`) uploads the sheet here after every run, one file per season:
`seasons/<season>.json` (e.g. `seasons/2026-27.json`). Each file holds every tab of the export
sheet, cut down to that season, as `{ "<tab title>": { "rows": [ {header: value, ...} ] } }`:

- Team tabs: rows whose `season` column is that season. A team without rows that season is left out.
- Daily: rows whose `date` falls in that season (a season runs July–June).
- Teams (logos): in every file, as of that file's last upload.

An export only re-uploads the season it wrote, so old seasons stay as they are.

The site reads `https://raw.githubusercontent.com/nxrberg/ligan.github.io/data/seasons/<season>.json`
for the season in its `js/config.js` on each page load, so new data shows up without a deploy.
`league.json` is the old all-seasons file and is no longer updated. Don't merge this branch into `main`.
