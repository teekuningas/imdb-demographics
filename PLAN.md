# Project Plan: IMDb Demographics & Dataset Explorer

## Vision: The Curated Spectacle (Client-Side SPA)
Transform the tool into a fast, elegant, and surprisingly powerful **Single Page Application**. It will run entirely in the browser using IndexedDB for caching. The UX will be carefully curated to handle the massive dimensionality of both `movies.csv` and `ratings.csv` without overwhelming the user. It should feel like a premium, specialized data explorer rather than a raw data dump.

### 1. Data Mapping & The "Dynamic Demographic" Pattern
The dataset contains dozens of columns (e.g., `males_18age_avg_vote`, `females_45age_avg_vote`, `budget`, `usa_gross_income`, `reviews_from_critics`). Instead of treating these as separate, chaotic table columns, we map them to an elegant UI.

**Sidebar Controls (Global Filters):**
- **Title Search:** Text input.
- **Minimum Votes:** Default 1000. Applies to the *selected* demographic to ensure statistical significance.
- **Year Range:** Min/Max inputs.
- **Genres:** Multi-select checkboxes.
- **Age Group:** Radio buttons (`All Ages`, `<18`, `18-29`, `30-44`, `45+`). *This dynamically dictates which raw demographic columns populate the table.*

**Table Columns (The Curated View):**
1. **Rank:** Numerical index.
2. **Title (Year) & Genres:** Basic metadata.
3. **IMDb Weighted Avg:** The official, algorithmically smoothed IMDb score.
4. **Balanced Avg:** `(Selected Female Avg + Selected Male Avg) / 2`.
5. **Female Avg:** Dynamically pulls from `females_Xage_avg_vote` based on the Age Group filter.
6. **Male Avg:** Dynamically pulls from `males_Xage_avg_vote` based on the Age Group filter.
7. **Gaze Delta:** `Female Avg - Male Avg`. 

### 2. Gaze Delta & Visual Highlighting
To emphasize the "Male vs. Female Gaze" premise, the **Gaze Delta** column will be color-coded. 
- **Red/Pink tint:** If `Female Avg - Male Avg >= 0.5` (Female Gaze).
- **Blue tint:** If `Male Avg - Female Avg >= 0.5` (Male Gaze).
- Neutral/Subtle: If the difference is `< 0.5`.

### 3. "Settings" and Advanced Data Visibility
To respect the philosophy of "as much data as possible without ruining the UX", we will introduce a **Settings / Column Visibility Menu**. 
- Users can tweak thresholds (e.g., changing the Gaze Delta highlight threshold from `0.5` to something else).
- Users can toggle the visibility of "Extra" columns derived from `movies.csv` and `ratings.csv` that are hidden by default (e.g., `Duration`, `Budget`, `USA Gross Income`, `Metascore`, `Reviews from Critics`, `US vs. Non-US Voters`).
- This allows power users to cross-reference demographic gaze with commercial success or critical acclaim without cluttering the default view.

### 4. Implementation Phases
- **Phase 1: Architecture & Ingestion.** Setup static `index.html`, `app.js`, and `style.css`. Build the UI to fetch the CSVs from GitHub, parse them via PapaParse in a Web Worker, and store them in IndexedDB.
- **Phase 2: The Core Engine.** Implement the filtering, reversible sorting on all columns, and pagination (rendering 100/200/500 rows at a time out of the 85,000).
- **Phase 3: The Curated UX & Settings.** Implement the Dynamic Demographic segment controller (Age Group), the color-coded Gaze Delta, and the Settings menu for column visibility and threshold tuning. Ensure mobile responsiveness.
