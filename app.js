// app.js - Main Application Logic

document.addEventListener('DOMContentLoaded', () => {

    // --- Constants ---
    const DB_NAME = 'spectacleDB';
    const EXPECTED_DB_VERSION = 7;
    const LS_VERSION_KEY  = 'spectacle_db_version';
    const LS_GENRES_KEY   = 'spectacle_genres';
    const LS_SETTINGS_KEY = 'spectacle_settings';

    const DEFAULT_SETTINGS = {
        balancedGenders: true,
        gazeThreshold: 0.5,
        minVotesPerGender: 1000,
        pageSize: 100,
        extraFilters: [],   // e.g. ['director', 'country']
        extraColumns: []    // e.g. ['imdb_score', 'director', ...]
    };

    // All supported optional columns with display metadata
    const EXTRA_COLUMN_DEFS = [
        { id: 'imdb_score',         label: 'IMDb Score',       key: 'weighted_average_vote', fmt: 'decimal1' },
        { id: 'total_votes',        label: 'Total Votes',      key: 'total_votes',           fmt: 'votes' },
        { id: 'director',           label: 'Director',         key: 'director',              fmt: 'text' },
        { id: 'country',            label: 'Country',          key: 'country',               fmt: 'text' },
        { id: 'duration',           label: 'Duration',         key: 'duration',              fmt: 'duration' },
        { id: 'metascore',          label: 'Metascore',        key: 'metascore',             fmt: 'integer' },
        { id: 'budget',             label: 'Budget',           key: 'budget',                fmt: 'usd' },
        { id: 'usa_gross',          label: 'USA Gross',        key: 'usa_gross_income',      fmt: 'usd' },
        { id: 'worldwide_gross',    label: 'Worldwide Gross',  key: 'worldwide_gross_income',fmt: 'usd' },
    ];

    const EXTRA_FILTER_DEFS = [
        { id: 'director', label: 'Director',  inputId: 'filter-director' },
        { id: 'country',  label: 'Country',   inputId: 'filter-country'  },
    ];

    // --- UI Elements ---
    const ui = {
        overlay:    document.getElementById('loading-overlay'),
        status:     document.getElementById('loading-status'),
        details:    document.getElementById('loading-details'),
        progressBar:document.getElementById('progress-bar'),

        genresContainer: document.getElementById('genres-container'),
        searchInput:     document.getElementById('search-input'),
        yearFromInput:   document.getElementById('year-from'),
        yearToInput:     document.getElementById('year-to'),
        ageRadios:       document.getElementsByName('age-group'),
        extraFiltersArea:document.getElementById('extra-filters-area'),
        applyBtn:        document.getElementById('apply-filters'),
        resetBtn:        document.getElementById('reset-filters'),

        tableBody:    document.getElementById('table-body'),
        resultsCount: document.getElementById('results-count'),
        sortHeaders:  document.querySelectorAll('th.sortable'),

        prevPageBtn: document.getElementById('prev-page'),
        nextPageBtn: document.getElementById('next-page'),
        pageInfo:    document.getElementById('page-info'),

        settingsBtn:   document.getElementById('settings-btn'),
        settingsModal: document.getElementById('settings-modal'),
        closeModal:    document.querySelector('.close-modal'),
        saveSettingsBtn: document.getElementById('save-settings'),

        // Settings inputs
        balancedGendersToggle: document.getElementById('balanced-genders'),
        gazeThresholdInput:    document.getElementById('gaze-threshold'),
        minVotesInput:         document.getElementById('min-votes'),
        pageSizeSelect:        document.getElementById('page-size'),
        extraFilterToggles:    document.querySelectorAll('.extra-filter-toggle'),
        colToggles:            document.querySelectorAll('.col-toggle'),
    };

    // --- State ---
    const state = {
        db: null,
        genres: [],
        currentData: [],
        page: 1,
        sortCol: 'score',
        sortDesc: true,

        filters: {
            search: '',
            yearFrom: 1894,
            yearTo: new Date().getFullYear(),
            ageGroup: 'allages',
            genres: [],
            director: '',
            country: '',
        },

        settings: { ...DEFAULT_SETTINGS },
    };

    // --- Formatting Helpers ---
    function fmtUSD(val) {
        if (val === null || val === undefined) return '—';
        if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
        if (val >= 1_000_000)     return `$${(val / 1_000_000).toFixed(1)}M`;
        if (val >= 1_000)         return `$${(val / 1_000).toFixed(0)}K`;
        return `$${val}`;
    }

    function fmtCell(val, fmt) {
        if (val === null || val === undefined || val === '') return '—';
        switch (fmt) {
            case 'decimal1':  return Number(val).toFixed(1);
            case 'integer':   return Math.round(val);
            case 'votes':     return Number(val).toLocaleString();
            case 'duration':  return `${val} min`;
            case 'usd':       return fmtUSD(val);
            case 'text':      return val;
            default:          return val;
        }
    }

    // --- Settings Persistence ---
    function loadSettings() {
        try {
            const stored = localStorage.getItem(LS_SETTINGS_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Merge with defaults so new keys always get their default value
                state.settings = { ...DEFAULT_SETTINGS, ...parsed };
            }
        } catch (e) {
            state.settings = { ...DEFAULT_SETTINGS };
        }
    }

    function saveSettings() {
        localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(state.settings));
    }

    function applySettingsToUI() {
        ui.balancedGendersToggle.checked = state.settings.balancedGenders;
        ui.gazeThresholdInput.value      = state.settings.gazeThreshold;
        ui.minVotesInput.value           = state.settings.minVotesPerGender;
        ui.pageSizeSelect.value          = state.settings.pageSize;

        ui.extraFilterToggles.forEach(cb => {
            cb.checked = state.settings.extraFilters.includes(cb.value);
        });
        ui.colToggles.forEach(cb => {
            cb.checked = state.settings.extraColumns.includes(cb.value);
        });

        updateExtraFilterVisibility();
    }

    function readSettingsFromUI() {
        state.settings.balancedGenders    = ui.balancedGendersToggle.checked;
        state.settings.gazeThreshold      = parseFloat(ui.gazeThresholdInput.value) || 0.5;
        state.settings.minVotesPerGender  = parseInt(ui.minVotesInput.value) || 0;
        state.settings.pageSize           = parseInt(ui.pageSizeSelect.value) || 100;
        state.settings.extraFilters       = Array.from(ui.extraFilterToggles).filter(cb => cb.checked).map(cb => cb.value);
        state.settings.extraColumns       = Array.from(ui.colToggles).filter(cb => cb.checked).map(cb => cb.value);
    }

    function updateExtraFilterVisibility() {
        EXTRA_FILTER_DEFS.forEach(def => {
            const wrapper = document.getElementById(`extra-filter-${def.id}`);
            if (wrapper) {
                const isEnabled = state.settings.extraFilters.includes(def.id);
                wrapper.classList.toggle('hidden', !isEnabled);
                if (!isEnabled) {
                    const input = document.getElementById(def.inputId);
                    if (input) input.value = '';
                }
            }
        });
    }

    // --- Initialization & Worker Setup ---
    async function init() {
        loadSettings();

        // Set year-to default to current year
        ui.yearToInput.value = new Date().getFullYear();

        if (!window.Worker) {
            ui.status.textContent = 'Error: Web Workers not supported.';
            return;
        }

        const storedVersion = localStorage.getItem(LS_VERSION_KEY);
        const storedGenres  = localStorage.getItem(LS_GENRES_KEY);

        if (storedVersion == EXPECTED_DB_VERSION && storedGenres) {
            ui.details.textContent = 'Verifying cache...';
            try {
                const db = await openIndexedDB();
                if (db) {
                    state.genres = JSON.parse(storedGenres);
                    populateGenres();
                    applySettingsToUI();
                    ui.overlay.classList.add('hidden');
                    await applyFiltersAndFetch();
                    bindEvents();
                    return;
                }
            } catch (e) {
                console.warn('Cache load failed, redownloading...', e);
            }
        }

        // First load — download & process CSVs
        ui.details.textContent = 'Downloading data (this will be cached for future visits)...';
        const worker = new Worker('worker.js?v=7');

        worker.onmessage = async (e) => {
            const msg = e.data;
            if (msg.type === 'progress') {
                ui.details.textContent = msg.status;
                ui.progressBar.style.width = `${msg.percent}%`;
            } else if (msg.type === 'done') {
                ui.details.textContent = `Ready. Indexed ${msg.totalRecords.toLocaleString()} movies.`;
                ui.progressBar.style.width = '100%';

                state.genres = msg.genres;
                localStorage.setItem(LS_VERSION_KEY, EXPECTED_DB_VERSION);
                localStorage.setItem(LS_GENRES_KEY, JSON.stringify(msg.genres));

                populateGenres();
                applySettingsToUI();
                await openIndexedDB();
                await applyFiltersAndFetch();

                setTimeout(() => ui.overlay.classList.add('hidden'), 500);
            } else if (msg.type === 'error') {
                ui.status.textContent = 'Initialization Failed';
                ui.details.textContent = msg.message;
                ui.progressBar.style.backgroundColor = '#e84118';
            }
        };

        worker.postMessage({ action: 'init' });
        bindEvents();
    }

    // --- IndexedDB Access ---
    function openIndexedDB() {
        return new Promise((resolve) => {
            const request = indexedDB.open(DB_NAME);
            request.onsuccess = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('movies')) { resolve(null); return; }
                const tx = db.transaction(['movies'], 'readonly');
                const store = tx.objectStore('movies');
                const countReq = store.count();
                countReq.onsuccess = () => {
                    if (countReq.result > 0) { state.db = db; resolve(db); }
                    else resolve(null);
                };
                countReq.onerror = () => resolve(null);
            };
            request.onerror = () => resolve(null);
        });
    }

    // --- Genre Filter ---
    function populateGenres() {
        ui.genresContainer.innerHTML = '';
        state.genres.forEach(g => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" value="${g}" class="genre-cb"> ${g}`;
            ui.genresContainer.appendChild(label);
        });
    }

    // --- Score Computation (Gender Balance Engine) ---
    function computeScore(fAvg, fVotes, mAvg, mVotes) {
        if (state.settings.balancedGenders) {
            // Equal-weight: treats both genders as equally important
            return (fAvg + mAvg) / 2;
        } else {
            // Vote-weighted: reflects actual voter proportions
            const total = fVotes + mVotes;
            return total > 0 ? (fAvg * fVotes + mAvg * mVotes) / total : (fAvg + mAvg) / 2;
        }
    }

    // --- Filter & Fetch ---
    function readFiltersFromUI() {
        state.filters.search  = ui.searchInput.value.toLowerCase().trim();
        state.filters.yearFrom = parseInt(ui.yearFromInput.value) || 0;
        state.filters.yearTo   = parseInt(ui.yearToInput.value) || 9999;

        let selectedAge = 'allages';
        for (const radio of ui.ageRadios) {
            if (radio.checked) { selectedAge = radio.value; break; }
        }
        state.filters.ageGroup = selectedAge;

        state.filters.genres = Array.from(document.querySelectorAll('.genre-cb:checked')).map(cb => cb.value);

        // Extra filters (only active if enabled in settings)
        const dirInput = document.getElementById('filter-director');
        const cntInput = document.getElementById('filter-country');
        state.filters.director = dirInput ? dirInput.value.toLowerCase().trim() : '';
        state.filters.country  = cntInput ? cntInput.value.toLowerCase().trim() : '';
    }

    async function applyFiltersAndFetch() {
        readFiltersFromUI();
        state.page = 1;

        const colspan = 6 + state.settings.extraColumns.length;
        ui.tableBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;padding:30px;color:var(--text-muted)">Filtering…</td></tr>`;

        return new Promise((resolve) => {
            setTimeout(() => {
                const transaction = state.db.transaction(['movies'], 'readonly');
                const store = transaction.objectStore('movies');
                const request = store.openCursor();

                const results = [];
                const f = state.filters;
                const minV = state.settings.minVotesPerGender;

                const fAvgKey   = `females_${f.ageGroup}_avg_vote`;
                const mAvgKey   = `males_${f.ageGroup}_avg_vote`;
                const fVotesKey = `females_${f.ageGroup}_votes`;
                const mVotesKey = `males_${f.ageGroup}_votes`;

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const m = cursor.value;

                        const fVotes = m[fVotesKey] || 0;
                        const mVotes = m[mVotesKey] || 0;

                        if (fVotes >= minV && mVotes >= minV) {
                            const yearOk  = m.year && m.year >= f.yearFrom && m.year <= f.yearTo;
                            const titleOk = !f.search   || (m.title || '').toLowerCase().includes(f.search);
                            const genreOk = f.genres.length === 0 || f.genres.some(g => m.genres.includes(g));
                            const dirOk   = !f.director || (m.director || '').toLowerCase().includes(f.director);
                            const cntOk   = !f.country  || (m.country  || '').toLowerCase().includes(f.country);

                            if (yearOk && titleOk && genreOk && dirOk && cntOk) {
                                const fAvg = m[fAvgKey];
                                const mAvg = m[mAvgKey];
                                const score = computeScore(fAvg, fVotes, mAvg, mVotes);

                                results.push({
                                    id:    m.imdb_title_id,
                                    title: m.title,
                                    year:  m.year,
                                    genres: m.genres.join(', '),
                                    score,
                                    fAvg,  fVotes,
                                    mAvg,  mVotes,
                                    gaze_delta: fAvg - mAvg,
                                    // Optional column raw values
                                    weighted_average_vote: m.weighted_average_vote,
                                    total_votes:           m.total_votes,
                                    director:              m.director,
                                    country:               m.country,
                                    duration:              m.duration,
                                    metascore:             m.metascore,
                                    budget:                m.budget,
                                    usa_gross_income:      m.usa_gross_income,
                                    worldwide_gross_income:m.worldwide_gross_income,
                                });
                            }
                        }
                        cursor.continue();
                    } else {
                        state.currentData = results;
                        sortData();
                        renderTable();
                        resolve();
                    }
                };
            }, 10);
        });
    }

    // --- Sorting ---
    function sortData() {
        const col  = state.sortCol;
        const dir  = state.sortDesc ? -1 : 1;

        // Map column id → result property
        const keyMap = {
            title:                'title',
            score:                'score',
            female_avg:           'fAvg',
            male_avg:             'mAvg',
            gaze_delta:           'gaze_delta',
            // extra columns
            imdb_score:           'weighted_average_vote',
            total_votes:          'total_votes',
            director:             'director',
            country:              'country',
            duration:             'duration',
            metascore:            'metascore',
            budget:               'budget',
            usa_gross:            'usa_gross_income',
            worldwide_gross:      'worldwide_gross_income',
        };

        const prop = keyMap[col] || col;

        state.currentData.sort((a, b) => {
            let va = a[prop], vb = b[prop];
            if (va === null || va === undefined) va = col === 'title' ? '' : -Infinity;
            if (vb === null || vb === undefined) vb = col === 'title' ? '' : -Infinity;
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            if (va < vb) return -1 * dir;
            if (va > vb) return  1 * dir;
            return 0;
        });

        updateSortIcons();
    }

    function updateSortIcons() {
        document.querySelectorAll('th.sortable').forEach(th => {
            const icon = th.querySelector('.sort-icon');
            if (!icon) return;
            icon.innerHTML = th.dataset.sort === state.sortCol
                ? (state.sortDesc ? '↓' : '↑')
                : '';
        });
    }

    // --- Rendering ---
    function renderTable() {
        const start    = (state.page - 1) * state.settings.pageSize;
        const pageData = state.currentData.slice(start, start + state.settings.pageSize);

        ui.resultsCount.textContent = `${state.currentData.length.toLocaleString()} results`;

        // Sync extra column headers
        const thead = document.querySelector('#movies-table thead tr');
        thead.querySelectorAll('.extra-header').forEach(el => el.remove());

        const activeCols = EXTRA_COLUMN_DEFS.filter(c => state.settings.extraColumns.includes(c.id));
        activeCols.forEach(col => {
            const th = document.createElement('th');
            th.className = 'sortable extra-header';
            th.dataset.sort = col.id;
            th.innerHTML = `${col.label} <span class="sort-icon"></span>`;
            th.addEventListener('click', () => handleSort(col.id));
            thead.appendChild(th);
        });

        // Update score column header label to reflect balance mode
        const scoreTh = thead.querySelector('[data-sort="score"]');
        if (scoreTh) {
            const icon = scoreTh.querySelector('.sort-icon');
            const iconHtml = icon ? icon.outerHTML : '<span class="sort-icon"></span>';
            scoreTh.innerHTML = (state.settings.balancedGenders ? 'Score ⚖' : 'Score') + ' ' + iconHtml;
        }

        ui.tableBody.innerHTML = '';

        if (pageData.length === 0) {
            const colspan = 6 + activeCols.length;
            ui.tableBody.innerHTML = `<tr><td colspan="${colspan}" class="empty-state">No movies found. Try adjusting the filters or lowering minimum votes.</td></tr>`;
            updatePagination();
            return;
        }

        const fragment = document.createDocumentFragment();

        pageData.forEach((m, idx) => {
            const tr = document.createElement('tr');

            const delta = m.gaze_delta;
            if (delta >= state.settings.gazeThreshold)
                tr.classList.add('row-female-gaze');
            else if (delta <= -state.settings.gazeThreshold)
                tr.classList.add('row-male-gaze');

            const rank    = start + idx + 1;
            const yearStr = m.year ? ` (${m.year})` : '';
            const deltaStr = (delta > 0 ? '+' : '') + delta.toFixed(2);

            let html = `
                <td class="rank-cell">#${rank}</td>
                <td class="title-cell">
                    <span class="title-text">${m.title}</span><span class="year-text">${yearStr}</span>
                    <span class="genres-text">${m.genres}</span>
                </td>
                <td class="score">${m.score.toFixed(2)}</td>
                <td><span class="female-val">${m.fAvg.toFixed(1)}</span><br><span class="vote-count">${m.fVotes.toLocaleString()} votes</span></td>
                <td><span class="male-val">${m.mAvg.toFixed(1)}</span><br><span class="vote-count">${m.mVotes.toLocaleString()} votes</span></td>
                <td class="delta-val">${deltaStr}</td>
            `;

            activeCols.forEach(col => {
                html += `<td>${fmtCell(m[col.key], col.fmt)}</td>`;
            });

            tr.innerHTML = html;
            fragment.appendChild(tr);
        });

        ui.tableBody.appendChild(fragment);
        updateSortIcons();
        updatePagination();
    }

    function updatePagination() {
        const totalPages = Math.max(1, Math.ceil(state.currentData.length / state.settings.pageSize));
        ui.pageInfo.textContent = `Page ${state.page} of ${totalPages}`;
        ui.prevPageBtn.disabled = state.page === 1;
        ui.nextPageBtn.disabled = state.page === totalPages;
    }

    function handleSort(col) {
        if (state.sortCol === col) {
            state.sortDesc = !state.sortDesc;
        } else {
            state.sortCol  = col;
            state.sortDesc = col !== 'title';
        }
        sortData();
        renderTable();
    }

    // --- Event Binding ---
    function bindEvents() {
        ui.applyBtn.addEventListener('click', applyFiltersAndFetch);

        ui.resetBtn.addEventListener('click', () => {
            ui.searchInput.value  = '';
            ui.yearFromInput.value = '1894';
            ui.yearToInput.value   = new Date().getFullYear();
            ui.ageRadios[0].checked = true;
            document.querySelectorAll('.genre-cb').forEach(cb => cb.checked = false);
            // Reset extra filter inputs
            EXTRA_FILTER_DEFS.forEach(def => {
                const input = document.getElementById(def.inputId);
                if (input) input.value = '';
            });
            applyFiltersAndFetch();
        });

        // Sort on static headers
        ui.sortHeaders.forEach(th => {
            th.addEventListener('click', () => handleSort(th.dataset.sort));
        });

        ui.prevPageBtn.addEventListener('click', () => {
            if (state.page > 1) { state.page--; renderTable(); }
        });
        ui.nextPageBtn.addEventListener('click', () => {
            const total = Math.ceil(state.currentData.length / state.settings.pageSize);
            if (state.page < total) { state.page++; renderTable(); }
        });

        // Settings modal
        ui.settingsBtn.addEventListener('click', () => {
            applySettingsToUI(); // sync UI to current state before opening
            ui.settingsModal.classList.add('show');
        });
        ui.closeModal.addEventListener('click', () => ui.settingsModal.classList.remove('show'));
        window.addEventListener('click', (e) => {
            if (e.target === ui.settingsModal) ui.settingsModal.classList.remove('show');
        });

        ui.saveSettingsBtn.addEventListener('click', () => {
            readSettingsFromUI();
            saveSettings();
            updateExtraFilterVisibility();
            ui.settingsModal.classList.remove('show');
            // Score computation and visible columns may have changed — re-filter fully
            applyFiltersAndFetch();
        });
    }

    // --- Start ---
    init();
});