# Live data for the Ligan site

The Pi's export (`write_sheet.py`) uploads `league.json` here after every run: every tab of the
export sheet as `{ "<tab title>": { "rows": [ {header: value, ...} ] } }`. The site reads it from
`https://raw.githubusercontent.com/nxrberg/ligan.github.io/data/league.json` on each page load,
so new data shows up without a deploy. Don't merge this branch into `main`.
