# Ligan V2

Leaderboard and stats site for our Yahoo fantasy hockey league. Plain HTML/CSS/JS, no build step. Data comes from the `yhExport` Google Sheet (one tab per team), which the Pi's export uploads as JSON after every run.

## Weekly leaderboard

Shows every team's category totals for the selected week plus a **Score** column on the far right. In each scored category a team gets 2 points for every other team it beats and 1 point for every tie (max 22 per category with 12 teams). Score is the sum over all scored categories. Cells are shaded by how many points they earned; turn on "Show rank" to see each team's rank in every category instead of the stats (tied teams share a rank). SV and SA don't count toward Score and are hidden; click the SV% header to show or hide them (SV% itself doesn't sort). Click any other column header to sort by it (click again to flip the order). Each category's leader (or leaders, when tied) gets a dotted box, with a ★ on wider screens (no box for SHO while the best is 0). The "Heatmap" switch turns the shading off and on, and the browser remembers the choice. Tapping the title ("H2H cats - alla mot alla") reloads the page, for when the site is saved to the home screen and has no reload button.

Score is coloured by matchup luck. **Actual** is what a team got from its real head-to-head matchup that week (2 per category won, 1 per tie, so 0–20). **Worth** is its Score divided by 11: what its week would have earned against an average team. Score turns red when Actual is at least 4 points below Worth (underpaid) and green when it's at least 4 above (overpaid); tap a team's row on the leaderboard to see both (in a bottom sheet on phones that slides up and is swiped down or tapped away to close, with no ×, like Kalshi's; a centred dialog on wider screens; `js/sheet.js`), with the matchup behind them (opponent and category record), even when it isn't coloured. The dialog's **More details →** opens the team page (a row also opens the team page directly in weeks without a known matchup). The dialog doubles as the team's matchup history: each matchup has a block that's green when the team won it (more categories won than lost), red when it lost and grey when level, its record is categories won–lost with the bigger number in bold, and its chevron opens the categories as columns, the team's row on top and the opponent's below, with each category's winner tinted (on a single week the matchup opens with them showing). On the All tab the gap is averaged per week. The matchups come from the `opponent` column on each team tab (the latest fetch of a week wins, like the stats); for weeks without it, the sheet's **Daily** tab (Team and Opponent columns) fills in. A week is only coloured once one of them says who played whom, and one team's row is enough for both sides of the matchup. The threshold is `luckThreshold` in `js/config.js`.

Team logos come from the sheet's **Teams** tab (Id, Team, Logo, Updated, written by the export). A team without a logo, or whose logo fails to load, shows its short name instead.

The table is built for phones first: on narrow screens it uses smaller type, shows each team's short name (`abbr` in `js/config.js`) and hides the overall # column so all 10 scored categories fit without scrolling. Full names and the # column come back on wider screens.

Pick a week from the tabs above the table. The **All** tab adds up every week (SV% from the summed SV/SA) and scores those totals the same way; a team's total sums the weeks that have a value.

The table is rendered with [TanStack Table](https://tanstack.com/table) (`@tanstack/table-core`, MIT), loaded as a pinned version from the jsDelivr CDN, so there's still no build step.

Categories, points per win/tie, and which categories count are set in `js/config.js`. Every scored category always counts: a team with a value beats a team without one, and two teams without a value tie.

## Data notes

- Each team tab has player rows plus `Skater totals` and `Goalie totals` rows; the site uses the totals rows. If a week was fetched more than once, the latest fetch wins.
- GP can be blank (the matchup-page export has no GP column); the site doesn't need it.
- One bad export (2026-10-05 22:57) wrote every stat one column to the right. The site spots those fetches (the goalie totals' SHO holds a fraction) and shifts the values back, but the last column (SOG, SHO) is lost in them. Re-exporting the week replaces them.
- SV% is recomputed from SV / SA.
- Yahoo shows "-" for a category with no stats yet. The site reads that as 0, except SV%, where it means no value; a team with no SV% loses to every team that has one and ties the others without one.
- The sheet holds every season back to 2012-13 (a `season` column on the team tabs). The site shows one: `season` in `js/config.js` (now 2026-27), and drops rows from any other.

## Where the data lives

The data isn't on `main`. It lives on the **`data` branch** of this repo, one file per season:

```
data branch
├── README.md
├── league.json          old all-seasons file, no longer updated
└── seasons/
    ├── 2012-13.json
    ├── …
    └── 2026-27.json
```

Each file holds every tab of the export sheet, cut down to that season, as `{ "<tab title>": { "rows": [ {header: value, ...} ] } }`. Team tabs are cut down by their `season` column and Daily by its `date` (a season runs July–June). Teams (logos) is in every file.

1. **The Pi writes it.** After every export, `write_sheet.py` (in the [YH-scraper-job](https://github.com/nxrberg/YH-scraper-job) repo, on the Pi) uploads only the season it just wrote, as `seasons/<season>.json`, through the GitHub contents API. Older seasons' files are left alone.
2. **The site reads it live.** On each page load the site fetches `liveDataUrl` from `js/config.js`, which is `https://raw.githubusercontent.com/nxrberg/ligan.github.io/data/seasons/<season>.json`. New data shows up within a few minutes without a deploy.
3. **The deploy keeps a fallback copy.** `.github/workflows/pages.yml` copies the current season's file from the `data` branch into `data/league.json` (`dataUrl`; ignored on `main`), and the site uses it when the live file can't be read. Without either, the site shows `data/sample.json`.

The browser never reads the sheet itself. `scripts/fetch-data.mjs` can still build `data/league.json` straight from the sheet for local use. To look at the live data locally:

```sh
git fetch origin data && git show origin/data:seasons/2026-27.json | head -c 500
```

To start a new season, change `season` in `js/config.js` (the deploy reads that line to pick the fallback file). The Pi creates the new season's file on its first export.

## Run locally

```sh
GOOGLE_SERVICE_ACCOUNT="$(cat key.json)" GOOGLE_SHEET_ID=<id> node scripts/fetch-data.mjs   # optional: real data
python3 -m http.server 8000
```

Then open http://localhost:8000. (Opening `index.html` directly won't work because of ES modules.)

## Deploy

`.github/workflows/pages.yml` publishes to GitHub Pages on every push to `main` and on demand (Actions → Deploy site → Run workflow). New data doesn't need a deploy.

One-time setup in the GitHub repo:
1. Settings → Pages → Source: **GitHub Actions**.
