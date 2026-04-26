# The Curated Spectacle — Project Plan

A fast, elegant, client-side SPA for exploring IMDb movie ratings through the lens of gender and age demographics. Runs entirely in the browser — no backend, no server-side logic. First load fetches and indexes ~85k records into IndexedDB; subsequent loads use the cache.

---

## Current State: Shipped ✅

The app is fully functional. All planned features are implemented.

### Architecture
- **`worker.js`** — Web Worker: fetches `movies.csv` + `ratings.csv` via PapaParse, merges by `imdb_title_id`, stores in `spectacleDB` (IndexedDB v9). Sends progress events back to the main thread.
- **`app.js`** — All filtering, sorting, rendering, settings, gender balance engine, i18n.
- **`i18n.js`** — All user-facing strings in English (`en`) and Finnish (`fi`). Accessed via `t(key, vars)` helper.
- **`index.html` / `style.css`** — App shell, settings modal (toggle switch component), responsive sidebar.

### Features
- **Gender Balance Engine** — Score column toggles between equal-weight `(♀+♂)/2` (default) and vote-weighted. Deep UX integration, not just a derived column.
- **Age group multi-select** — Four checkboxes (<18, 18–29, 30–44, 45+). No selection = all ages (computed as vote-weighted mean across all four groups — no `allages` aggregate column used).
- **Extra Filters / Columns** — Director, Country, Language as optional sidebar filters; 10 optional table columns.
- **Settings** — Persisted to `spectacle_settings` in localStorage. Sections: Gender Balance, Display, Significance, Extra Filters, Extra Columns.
- **i18n** — EN/FI language toggle in the header. Language stored in settings.
- **Accessibility** — `type="button"` on all buttons, `type="search"` on title input, `aria-live="polite"` on results count, `scope="col"` on table headers, `:focus-visible` keyboard outline.

---

## Data Model

### Ingested from `movies.csv`

| Field | Notes |
|---|---|
| `imdb_title_id` | Primary key |
| `title` / `original_title` | `original_title` preferred |
| `year` | Int |
| `genre` | Split → `genres[]` array |
| `duration` | Int (minutes) |
| `country` / `language` / `director` | String; CSV `"None"` → `null` |
| `budget` / `usa_gross_income` / `worldwide_gross_income` | USD-prefixed strings → int; others → `null`. Note: CSV typo `worlwide_gross_income` corrected on ingest. |
| `metascore` | Float 0–100 |

**Dropped from movies.csv:** `date_published`, `writer`, `actors`, `description`, `avg_vote`, `votes`, `reviews_from_users`, `reviews_from_critics` (counts, not scores).

### Ingested from `ratings.csv`

| Field | Notes |
|---|---|
| `weighted_average_vote` | IMDb's Bayesian smoothed score — shown as-is, NOT recomputed |
| `total_votes` | Overall popularity proxy |
| `males_{0age,18age,30age,45age}_{avg_vote,votes}` | Core demographic data |
| `females_{0age,18age,30age,45age}_{avg_vote,votes}` | Core demographic data |

**Dropped from ratings.csv:** `allgenders_*` (includes gender-unspecified voters — we compute our own combined scores from male+female only), `allages` variants (computed on-the-fly from the four age groups), `mean_vote`, `median_vote`, histogram columns (`votes_1`–`votes_10`), `top1000_voters_*`, `us_voters_*`, `non_us_voters_*`.

### Age Group Naming
CSV pattern `{gender}_{age}_{metric}` — age codes: `0age` (<18), `18age` (18–29), `30age` (30–44), `45age` (45+). "All ages" is computed as the vote-weighted mean across these four groups, not from any aggregate column.

---

## Gender Balance Engine

IMDb voters are ~80–85% male. The **Balanced Genders** toggle (default ON) controls how Score is computed:

| Mode | Formula | Meaning |
|---|---|---|
| Balanced (default) | `(♀_avg + ♂_avg) / 2` | Equal gender weight regardless of voter counts |
| Unbalanced | `(♀_avg × ♀_votes + ♂_avg × ♂_votes) / (♀_votes + ♂_votes)` | Reflects actual voter proportions |

**Gaze Δ** (`♀_avg − ♂_avg`) is always computed the same way, independent of this toggle.

**IMDb Score** (`weighted_average_vote`) is IMDb's own Bayesian score — shown as a reference, never recomputed by us.

**Multi-age aggregation:** when multiple age groups are selected, ♀_avg and ♂_avg are computed as vote-weighted means across those groups before applying the balance formula.

---

## Storage Schema

### localStorage (all keys prefixed `spectacle_`)

| Key | Value |
|---|---|
| `spectacle_db_version` | `9` — bump to force full re-ingestion |
| `spectacle_genres` | JSON string array of all genres (sorted) |
| `spectacle_settings` | JSON — see below |

```json
{
  "language": "en",
  "balancedGenders": true,
  "gazeThreshold": 0.5,
  "minVotesPerGender": 1000,
  "pageSize": 100,
  "extraFilters": [],
  "extraColumns": []
}
```

### IndexedDB: `spectacleDB` v9
- Store: `movies`, key: `imdb_title_id`, index: `year`

---

## Deployment ✅

The app is static files only — served via nginx inside a container.

### File structure
```
├── index.html
├── app.js
├── worker.js
├── i18n.js
├── style.css
├── imdb_dataset/       ← gitignored; downloaded at container build time
│   ├── movies.csv
│   └── ratings.csv
├── Containerfile
├── nginx.conf
├── .github/workflows/publish-container.yml
├── PLAN.md
└── .gitignore
```

### Containerfile (nginx)
- Base: `nginx:stable-alpine`
- Downloads both CSVs from the upstream GitHub repo at build time via `curl`
- CSVs are baked into the image — self-contained, no runtime dependency on GitHub
- Serves on port 80 (map with `-p <hostport>:80`)

### GitHub Actions workflow
- Trigger: push to any tag
- Builds image with `Containerfile`
- Pushes to GitHub Container Registry (`ghcr.io/<repo>:latest` + tag)

