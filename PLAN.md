# Project Plan: IMDb Demographics & Dataset Explorer

## Current State of the Codebase
- **Architecture:** Server-side rendered (SSR) Python application (`server.py`).
- **Data Handling:** Loads `movies.csv` (47MB) and `ratings.csv` (17MB) into memory.
- **UI:** Full page reload on every filter change. Hardcoded logic.

## Vision: The Curated Demographics Explorer (Client-Side SPA)
Transform the tool into a fast, elegant **Single Page Application** that runs entirely in the browser using IndexedDB for caching. The UX will be carefully curated to handle the massive dimensionality of the dataset without overwhelming the user.

### 1. Data Mapping & The "Dynamic Demographic" Pattern
The `ratings.csv` contains 49 columns (e.g., `males_18age_avg_vote`, `females_45age_avg_vote`). Instead of treating these as 49 separate table columns, we will map them to a **Demographic Segment Controller** in the UI.

**Sidebar Controls (Global Filters):**
- **Title Search:** Text input.
- **Minimum Votes:** Default 1000. Applies to the *selected* demographic to ensure statistical significance.
- **Year Range:** Min/Max inputs.
- **Genres:** Multi-select checkboxes.
- **Age Group:** Radio buttons (`All Ages`, `<18`, `18-29`, `30-44`, `45+`). *This dynamically dictates which raw columns populate the table.*

**Table Columns (The Curated View):**
1. **Rank:** Numerical index.
2. **Title (Year) & Genres:** Basic metadata.
3. **IMDb Weighted Avg:** The official, algorithmically smoothed IMDb score.
4. **Balanced Avg:** `(Selected Female Avg + Selected Male Avg) / 2`.
5. **Female Avg:** dynamically pulls from `females_Xage_avg_vote` based on the Age Group filter.
6. **Male Avg:** dynamically pulls from `males_Xage_avg_vote` based on the Age Group filter.
7. **Gaze Delta:** `Female Avg - Male Avg`. (Color-coded: Red for female-skewed, Blue for male-skewed).

### 2. What is "Weighted Average Vote"?
IMDb doesn't just calculate a raw mean (sum of votes / number of votes) because a movie with a single 10/10 vote would rank higher than a masterpiece with 500,000 9/10 votes. The "Weighted Average" uses a Bayesian estimator to smooth out extreme outliers, penalize "review bombing," and give more weight to accounts of regular voters. It represents the "official" score.

### 3. Implementation Phases
- **Phase 1: Architecture & Ingestion.** Setup static `index.html`, `app.js`, and `style.css`. Build the UI to fetch the CSVs from GitHub, parse them via PapaParse, and store them in IndexedDB.
- **Phase 2: The Core Engine.** Implement the filtering, reversible sorting, and pagination (rendering 100/200/500 rows at a time out of the 85,000).
- **Phase 3: UX Polish.** Implement the Demographic Segment Controller so changing the "Age" filter instantly recalculates the Balanced Avg and Gaze Delta columns using the correct raw data subset. Ensure mobile responsiveness.

