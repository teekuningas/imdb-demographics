# The Curated Spectacle — Project Plan

A fast, elegant, client-side Single Page Application for exploring IMDb movie ratings through the lens of gender and age demographics. Runs entirely in the browser with IndexedDB caching. Designed to feel like a premium, curated data explorer — not a raw data dump.

---

## Completed Work

- **Architecture & Ingestion** — `worker.js` fetches two CSVs via PapaParse in a Web Worker, merges them by `imdb_title_id`, stores ~85k records in `spectacleDB` (IndexedDB). Genre list cached in `spectacle_genres` (localStorage). All fields ingested explicitly (no raw CSV spread).
- **Core Engine** — Full-table cursor scan with multi-filter pipeline. Reversible column sorting with null-safe comparator. Paginated rendering.
- **Gender Balance Engine** — Score column is `(♀+♂)/2` when Balanced Genders is ON (default), or vote-weighted `(♀×fv+♂×mv)/(fv+mv)` when OFF.
- **Settings system** — All settings persisted to `spectacle_settings` in localStorage. Sections: Gender Balance, Display, Significance, Extra Filters, Extra Columns. Loaded on init with defaults for first-time visitors.
- **Extra Filters / Columns** — Director and Country as optional sidebar filters; 9 optional table columns (IMDb Score, Total Votes, Director, Country, Duration, Metascore, Budget, USA Gross, Worldwide Gross) with USD formatting.
- **Data model polish** — `budget`, `usa_gross_income`, `worldwide_gross_income` parsed to USD integers. `worlwide_gross_income` CSV typo corrected. `reviews_from_critics/users`, `top1000_voters` not ingested. DB renamed to `spectacleDB` (v7). localStorage keys prefixed `spectacle_`.
- **Dev cleanup** — Removed legacy Python scripts and test files.

---

## Data Sources & Column Inventory

### movies.csv (22 columns)

| CSV Column | Ingest? | Notes |
|---|---|---|
| `imdb_title_id` | ✅ Key | Primary key, joins with ratings.csv |
| `title` | ✅ | Fallback if `original_title` is empty |
| `original_title` | ✅ | Preferred display title |
| `year` | ✅ | Parsed to int |
| `date_published` | ❌ | Year is sufficient |
| `genre` | ✅ | Split on `,` → array; also populates genre filter |
| `duration` | ✅ | Int, minutes |
| `country` | ✅ | String (can be multi-country, comma-separated) |
| `language` | ✅ | Primary language(s); literal `"None"` → `null` on ingestion |
| `director` | ✅ | String (can be multi-director, comma-separated) |
| `writer` | ❌ | Too verbose for table display |
| `production_company` | ❌ | Too verbose |
| `actors` | ❌ | Too verbose |
| `description` | ❌ | Too verbose |
| `avg_vote` | ❌ | Redundant with `weighted_average_vote` from ratings.csv |
| `votes` | ❌ | Redundant with `total_votes` from ratings.csv |
| `budget` | ✅ | Parse USD-prefixed values (`"$ 2250"`) to int; null for non-USD or empty (~72% empty, ~8% non-USD) |
| `usa_gross_income` | ✅ | Parse USD to int |
| `worlwide_gross_income` | ✅ | Typo in CSV — stored as `worldwide_gross_income`. Parse USD to int |
| `metascore` | ✅ | Float 0–100; critic consensus score |
| `reviews_from_users` | ❌ | Just a count (not a score); not separable or useful |
| `reviews_from_critics` | ❌ | Just a count (not a score); not useful |

### ratings.csv (49 columns)

| CSV Column Group | Ingest? | Notes |
|---|---|---|
| `weighted_average_vote` | ✅ | IMDb's proprietary Bayesian smoothed score |
| `total_votes` | ✅ | Overall popularity proxy |
| `mean_vote`, `median_vote` | ❌ | Redundant with weighted avg for display |
| `votes_10` through `votes_1` | ❌ | Vote distribution histogram; not needed |
| `allgenders_{0age,18age,30age,45age}_{avg_vote,votes}` | ❌ | Includes voters who didn't specify gender — we compute our own combined score from male+female instead |
| `males_{allages,0age,18age,30age,45age}_{avg_vote,votes}` | ✅ | Core demographic data |
| `females_{allages,0age,18age,30age,45age}_{avg_vote,votes}` | ✅ | Core demographic data |
| `top1000_voters_rating`, `top1000_voters_votes` | ❌ | Dropped — emphasis is on gender-aware data, not elite-voter segmentation |
| `us_voters_rating/votes`, `non_us_voters_rating/votes` | ❌ | Not interesting enough for the use case |

### How the demographic columns work

The CSV uses a naming pattern: `{gender}_{age}_{metric}` where:
- **gender**: `allgenders`, `males`, `females`
- **age**: `allages` (no age filter), `0age` (<18), `18age` (18–29), `30age` (30–44), `45age` (45+)
- **metric**: `avg_vote` (average rating 1–10), `votes` (number of voters)

Note: There is **no** `allgenders_allages` column — the closest equivalents are `total_votes` (count) and `mean_vote`/`weighted_average_vote` (scores). The `allgenders_Xage` columns include voters who didn't specify a gender, so `allgenders_Xage_votes > males_Xage_votes + females_Xage_votes` (gap is typically 1–5% of voters).

Our app deliberately uses only the `males_*` and `females_*` columns because the entire premise is gender-comparative analysis. The `allgenders_*` columns are not needed.

---

## Architecture: Filters, Columns & The Gender Balance Engine

### The Gender Balance Toggle (Core Concept)

IMDb voters are overwhelmingly male (~80–85%). A film's "real" average score is therefore dominated by male opinion. The app offers a **Balanced Genders** toggle (default: ON) that deeply affects the **Score** column:

**Balanced Genders ON (default):**
```
Score = (female_avg + male_avg) / 2
```
Both genders contribute equally regardless of how many voted. This answers: *"What would the score be if men and women voted in equal numbers?"*

**Balanced Genders OFF:**
```
Score = (female_avg × female_votes + male_avg × male_votes) / (female_votes + male_votes)
```
This reflects actual voter proportions — the "real-world" score.

**Example — Shawshank Redemption (allages):**
- Male avg: 9.3 (1,392,803 votes, 83.6% of gendered voters)
- Female avg: 9.2 (274,168 votes, 16.4%)
- Balanced score: **9.25** | Vote-weighted score: **9.28**

For films with large gender gaps AND skewed voter ratios, the difference is dramatic. The Gaze Delta (`female_avg − male_avg`) is always computed the same way regardless of this toggle.

### Filters

**Default visible (sidebar):**

| Filter | UI Element | Behavior |
|---|---|---|
| Title Search | Text input | Substring match on title, case-insensitive |
| Year Range | Two number inputs (from/to) | Inclusive range filter on year |
| Age Group | Radio buttons | Selects which demographic columns drive Female/Male Avg. Options: All Ages (`allages`), <18 (`0age`), 18–29 (`18age`), 30–44 (`30age`), 45+ (`45age`) |
| Genres | Multi-select checkboxes | OR-match: movie must have at least one selected genre |

**Optional filters (toggle in Settings → Extra Filters):**

| Filter | UI Element | Behavior |
|---|---|---|
| Director | Text input | Substring match on director field |
| Country | Text input | Substring match on country field |

### Columns

**Default visible:**

| # | Column | Source / Computation |
|---|---|---|
| 1 | **#** (Rank) | Row index in current sort order |
| 2 | **Title (Year) & Genres** | `original_title` or `title`, `year`, `genres` array joined |
| 3 | **Score** | Computed from balanced/unbalanced toggle + selected age group (see above) |
| 4 | **♀ Avg** | `females_{age}_avg_vote` with `females_{age}_votes` shown as sub-text |
| 5 | **♂ Avg** | `males_{age}_avg_vote` with `males_{age}_votes` shown as sub-text |
| 6 | **Gaze Δ** | `female_avg − male_avg`, color-coded by threshold |

**Optional columns (toggle in Settings → Extra Columns):**

| Column | Source | Format | Affected by Gender Balance toggle? |
|---|---|---|---|
| IMDb Score | `weighted_average_vote` | 1 decimal (e.g., `9.3`) | **No** — IMDb's own Bayesian score; the one "real world" reference |
| Director | `director` | Text | — |
| Country | `country` | Text | — |
| Duration | `duration` | Minutes (e.g., `142 min`) | — |
| Metascore | `metascore` | Integer 0–100 | — |
| Total Votes | `total_votes` | Locale-formatted (e.g., `2,278,845`) | — |
| Budget | `budget` | USD formatted (e.g., `$2.3M`) | — |
| USA Gross | `usa_gross_income` | USD formatted | — |
| Worldwide Gross | `worldwide_gross_income` | USD formatted | — |

### Settings Modal

| Section | Setting | Default | Description |
|---|---|---|---|
| **Gender Balance** | Balanced Genders toggle | ✅ ON | Equal-weight vs vote-weighted score computation |
| **Display** | Gaze Delta Threshold | 0.5 | Highlight rows where \|Gaze Δ\| exceeds this |
| | Page Size | 100 | Rows per page (50 / 100 / 200 / 500) |
| **Significance** | Min Votes per Gender | 1000 | Both male AND female vote counts for the selected age group must meet this threshold for a movie to appear |
| **Extra Filters** | Checkboxes | None checked | Director, Country |
| **Extra Columns** | Checkboxes | None checked | IMDb Score, Director, Country, Duration, Metascore, Total Votes, Top 1000 Rating, Budget, USA Gross, Worldwide Gross |

---

## Storage Schema

### localStorage (all keys prefixed `spectacle_`)

| Key | Type | Purpose |
|---|---|---|
| `spectacle_db_version` | number | Cache-busting; bump to force re-ingestion |
| `spectacle_genres` | JSON array | Cached sorted genre list |
| `spectacle_settings` | JSON object | All user settings (see below) |

**`spectacle_settings` shape:**
```json
{
  "balancedGenders": true,
  "gazeThreshold": 0.5,
  "minVotesPerGender": 1000,
  "pageSize": 100,
  "extraFilters": [],
  "extraColumns": []
}
```

### IndexedDB

| Property | Value |
|---|---|
| Database name | `spectacleDB` |
| Store name | `movies` |
| Key path | `imdb_title_id` |
| Indexes | `year` |

Each record is a merged object containing all ingested fields from both CSVs.

---

## Implementation: What Remains

### Phase 4d: Language, "None" Handling, Age Multi-Select

- **Worker.js**: Add `language` field. Normalise all literal `"None"` strings from CSV to `null` (affects director, country, language).
- **App.js + HTML**: Add `language` to `EXTRA_FILTER_DEFS` and `EXTRA_COLUMN_DEFS`.
- **App.js**: Replace age group radio buttons with multi-select checkboxes (like genres). Default: all checked. When specific ages selected, include movies that meet the min-votes threshold for **any** of the selected age groups, and compute Score/♀Avg/♂Avg as a vote-weighted mean across those groups.
- **App.js**: Bump DB version to 8 to force re-ingestion with `language` field.

### Phase 4e: i18n (English + Finnish)

A single `i18n.js` file holds all user-facing strings:

```js
export const translations = {
  en: { 'filter.title': 'Title', 'settings.balancedGenders': 'Balanced Genders', ... },
  fi: { 'filter.title': 'Elokuvan nimi', 'settings.balancedGenders': 'Tasapainotettu sukupuoli', ... }
};
```

- HTML elements that have static text get a `data-i18n="key"` attribute.
- A `t(key)` helper in `app.js` returns the string for the active locale.
- A language toggle button (e.g. `EN / FI`) in the header switches locale and re-renders all strings.
- Active language stored in `spectacle_settings.language` (default `'en'`).
- Worker.js does not need i18n (no user-facing output).

### Phase 4f: Code Quality Pass

- Strip all redundant comments — code should be self-documenting.
- Consistent naming throughout (camelCase JS, kebab-case CSS, data-kebab HTML attributes).
- No `console.log` in non-error paths.
- CSS: remove any dead rules, ensure variable usage is consistent.
- HTML: semantic structure, proper `lang` attribute updated on locale switch.

### Phase 5: Deployment (Future Session)

- **Containerfile**: `caddy:alpine` serving static files with gzip.
- **Caddyfile**: Minimal config for `:8080`, `file_server`, `encode gzip`.
- **GitHub Actions workflow**: Build image, push to GHCR.
- File structure will be:
  ```
  ├── index.html
  ├── app.js
  ├── worker.js
  ├── i18n.js
  ├── style.css
  ├── imdb_dataset/
  │   ├── movies.csv
  │   └── ratings.csv
  ├── Containerfile
  ├── Caddyfile
  ├── .github/workflows/build.yml
  ├── PLAN.md
  └── .gitignore
  ```
