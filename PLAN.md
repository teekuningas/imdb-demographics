# Project Plan: IMDb Demographics Analyzer

## Current State of the Codebase
- **Architecture:** Server-side rendered (SSR) Python application using the built-in `http.server`. 
- **Data Handling:** The server loads a 47MB `movies.csv` and a 17MB `ratings.csv` into memory on startup. Filtering, sorting, and pagination (hardcoded to top 200) are performed in Python for every request.
- **UI:** A monolithic `server.py` file injects HTML and CSS using f-strings. Clicking filters triggers a full page reload via a `GET` request. 
- **Metrics:** Calculates a "Combined Score" `(Female Avg + Male Avg) / 2`. 

## Goal
Transform the application into a polished, publishable **Client-Side Single Page Application (SPA)**. The Python script will only be needed to serve the static HTML/JS/CSS files. All data fetching, parsing, filtering, and sorting will happen dynamically in the user's browser, making the app blazingly fast and independent of a backend dataset.

## Phase 1: Architectural Overhaul (Client-Side Migration)
- [ ] **Static Serving:** Reduce `server.py` to a simple static file server.
- [ ] **Frontend Structure:** Create a clean `index.html`, `style.css`, and `app.js`.
- [ ] **Data Sourcing (IndexedDB):** 
  - Build a "Download Dataset" UI component.
  - Fetch the `.csv` files directly from user-provided URLs (defaulting to the GitHub raw links).
  - Parse the CSVs in the browser (using a minimal library like PapaParse).
  - Cache the parsed data in the browser's IndexedDB so it survives page reloads.

## Phase 2: Feature Implementation
- [ ] **Updated Metrics:** 
  - Add `OVERALL AVG` (the standard IMDb weighted average).
  - Include `FEMALE AVG`, `MALE AVG`, and `BALANCED AVG`.
  - Add the new metric: `FEMALE AVG - MALE AVG` (The Demographic Delta).
- [ ] **Dynamic Sorting:** 
  - Implement client-side sorting across the full dataset.
  - Enable reversible sorting (click a column header once for descending, again for ascending).
- [ ] **Pagination:** 
  - Add a pagination selector (Show 100, 200, 500, All).
  - Apply pagination visually *after* the dataset is sorted.
- [ ] **Refined Filters:** 
  - Update "Min Ratings" default to `1000`.
  - Set "Year From" and "Year To" inputs to dynamically default to the absolute min/max of the loaded dataset.
  - Include "Series vs. Movie" filter if the dataset structure permits.

## Phase 3: UI/UX & Polish
- [ ] **Mobile Responsiveness:** Implement CSS media queries to ensure the sidebar stacks or collapses gracefully, and the data table scrolls horizontally on small screens.
- [ ] **Cleanup:** Remove outdated hardcoded text (e.g., "Ranking based on...") and ensure column headers are perfectly descriptive.
- [ ] **Publishable Quality:** Ensure code is well-commented, modular, and cleanly formatted.
