# Project Plan: IMDb Demographics & Dataset Explorer

## Current State of the Codebase
- **Architecture:** Server-side rendered (SSR) Python application (`server.py`).
- **Data Handling:** Loads a 47MB `movies.csv` and a 17MB `ratings.csv` into memory on startup. Filtering, sorting, and pagination are hardcoded and performed in Python.
- **UI:** A monolithic Python script injecting HTML/CSS. Full page reload on every filter change.
- **Metrics:** Calculates a hardcoded "Combined Score" `(Female Avg + Male Avg) / 2`.

## Vision & Scope
Transform the application into a blazingly fast, polished **Client-Side Single Page Application (SPA)**. Instead of just a hardcoded demographics tool, it will be a **Flexible Dataset Explorer with Curated Defaults**. 

By parsing the CSVs directly in the browser (using IndexedDB for caching), we can map *all* available data columns (budget, duration, critic reviews, etc.) to the table and filters. To preserve the excellent UX, we will curate the default visible columns to focus on the "Male vs. Female Gaze" premise, but allow power users to toggle any other column or filter on the fly.

## Phase 1: Architectural Overhaul (Client-Side Migration)
- [ ] **Static Backend:** Reduce `server.py` to a simple static file server (`http.server`).
- [ ] **Frontend Structure:** Create a clean `index.html`, `style.css`, and `app.js`.
- [ ] **Data Ingestion (IndexedDB):** 
  - Build a "Data Source" UI component (e.g., a modal or top-bar button).
  - Allow users to fetch the `.csv` files directly from default GitHub URLs or local uploads.
  - Parse the CSVs in a Web Worker (e.g., using PapaParse) to avoid freezing the UI.
  - Cache the parsed, joined dataset in IndexedDB so subsequent page loads are instant.

## Phase 2: The "Flexible Table" Engine
- [ ] **Data Modeling:** 
  - Read all columns from the dataset.
  - Define "Derived Columns" (e.g., `FEMALE AVG - MALE AVG` [Delta], `BALANCED AVG`).
- [ ] **Dynamic Table UI:** 
  - Implement a client-side table capable of handling 85,000 rows (using virtual scrolling or pagination).
  - Add reversible sorting for *every* column.
  - Add a "Columns View" toggle menu, allowing users to check/uncheck which columns are visible.
- [ ] **Curated Defaults:** 
  - Default Visible Columns: Rank, Title (Year), Genres, Balanced Avg, Female Avg, Male Avg, Demographic Delta.
  - Default Hidden Columns: Budget, Duration, Critics Score, US vs Non-US voters, etc.

## Phase 3: Advanced Filtering & Pagination
- [ ] **Dynamic Filter Sidebar:**
  - Standardize filters: Title Search, Min Ratings (default `1000`), Year Range (default dynamic min/max).
  - Add optional filters mapped to other columns (e.g., Minimum Critic Score, Country).
- [ ] **Pagination Logic:** 
  - Add a selector: Show 100, 200, 500, or All.
  - Ensure sorting happens on the *entire* dataset before pagination truncates the view.

## Phase 4: UI/UX & Polish
- [ ] **Mobile Responsiveness:** Implement CSS media queries. The sidebar should become a slide-out drawer or stack on mobile, and the data table must scroll horizontally.
- [ ] **Visual Hierarchy:** Clearly highlight the "Delta" (e.g., blue if Male > Female, red if Female > Male) to emphasize the core premise of the app.
- [ ] **Publishable Quality:** Cleanly separated JS/CSS/HTML, well-commented, and ready for deployment on GitHub Pages or Vercel.
