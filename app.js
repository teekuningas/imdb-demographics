// app.js - Main Application Logic

document.addEventListener('DOMContentLoaded', () => {

    const DB_NAME = 'spectacleDB';
    const EXPECTED_DB_VERSION = 9;
    const LS_VERSION_KEY  = 'spectacle_db_version';
    const LS_GENRES_KEY   = 'spectacle_genres';
    const LS_SETTINGS_KEY = 'spectacle_settings';

    const DEFAULT_SETTINGS = {
        language: 'en',
        balancedGenders: true,
        gazeThreshold: 0.5,
        minVotesPerGender: 1000,
        pageSize: 100,
        extraFilters: [],
        extraColumns: [],
    };

    const EXTRA_COLUMN_DEFS = [
        { id: 'imdb_score',      labelKey: 'col.imdbScore',  key: 'weighted_average_vote', fmt: 'decimal1' },
        { id: 'total_votes',     labelKey: 'col.totalVotes', key: 'total_votes',           fmt: 'votes'    },
        { id: 'director',        labelKey: 'col.director',   key: 'director',              fmt: 'text'     },
        { id: 'country',         labelKey: 'col.country',    key: 'country',               fmt: 'text'     },
        { id: 'language',        labelKey: 'col.language',   key: 'language',              fmt: 'text'     },
        { id: 'duration',        labelKey: 'col.duration',   key: 'duration',              fmt: 'duration' },
        { id: 'metascore',       labelKey: 'col.metascore',  key: 'metascore',             fmt: 'integer'  },
        { id: 'budget',          labelKey: 'col.budget',     key: 'budget',                fmt: 'usd'      },
        { id: 'usa_gross',       labelKey: 'col.usaGross',   key: 'usa_gross_income',      fmt: 'usd'      },
        { id: 'worldwide_gross', labelKey: 'col.worldGross', key: 'worldwide_gross_income',fmt: 'usd'      },
    ];

    const EXTRA_FILTER_DEFS = [
        { id: 'director', inputId: 'filter-director' },
        { id: 'country',  inputId: 'filter-country'  },
        { id: 'language', inputId: 'filter-language' },
    ];

    const ui = {
        overlay:     document.getElementById('loading-overlay'),
        status:      document.getElementById('loading-status'),
        details:     document.getElementById('loading-details'),
        progressBar: document.getElementById('progress-bar'),

        genresContainer:  document.getElementById('genres-container'),
        searchInput:      document.getElementById('search-input'),
        yearFromInput:    document.getElementById('year-from'),
        yearToInput:      document.getElementById('year-to'),
        applyBtn:         document.getElementById('apply-filters'),
        resetBtn:         document.getElementById('reset-filters'),

        tableBody:    document.getElementById('table-body'),
        resultsCount: document.getElementById('results-count'),
        scoreColLabel:document.getElementById('score-col-label'),

        prevPageBtn:  document.getElementById('prev-page'),
        nextPageBtn:  document.getElementById('next-page'),
        pageInfo:     document.getElementById('page-info'),

        langToggle:    document.getElementById('lang-toggle'),
        settingsBtn:   document.getElementById('settings-btn'),
        settingsModal: document.getElementById('settings-modal'),
        closeModal:    document.querySelector('.close-modal'),
        saveSettingsBtn: document.getElementById('save-settings'),

        balancedGendersToggle: document.getElementById('balanced-genders'),
        gazeThresholdInput:    document.getElementById('gaze-threshold'),
        minVotesInput:         document.getElementById('min-votes'),
        pageSizeSelect:        document.getElementById('page-size'),
        extraFilterToggles:    document.querySelectorAll('.extra-filter-toggle'),
        colToggles:            document.querySelectorAll('.col-toggle'),
    };

    const state = {
        db: null,
        genres: [],
        currentData: [],
        page: 1,
        sortCol: 'score',
        sortDesc: true,
        filters: {
            search: '', yearFrom: 1894, yearTo: new Date().getFullYear(),
            ageGroups: [],
            genres: [],
            director: '', country: '', language: '',
        },
        settings: { ...DEFAULT_SETTINGS },
    };

    // --- i18n ---
    function t(key, vars = {}) {
        const lang = state.settings.language;
        let str = (translations[lang] && translations[lang][key]) || translations.en[key] || key;
        for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v);
        return str;
    }

    function applyI18n() {
        document.documentElement.lang = state.settings.language;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.dataset.i18n);
        });
        document.querySelectorAll('[data-i18n-ph]').forEach(el => {
            el.placeholder = t(el.dataset.i18nPh);
        });
        ui.langToggle.textContent = state.settings.language === 'en' ? 'FI' : 'EN';
    }

    // --- Formatting ---
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
            case 'decimal1': return Number(val).toFixed(1);
            case 'integer':  return Math.round(val);
            case 'votes':    return Number(val).toLocaleString();
            case 'duration': return `${val} min`;
            case 'usd':      return fmtUSD(val);
            default:         return val;
        }
    }

    // --- Settings Persistence ---
    function loadSettings() {
        try {
            const stored = localStorage.getItem(LS_SETTINGS_KEY);
            if (stored) state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
        } catch (_) {
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
        ui.extraFilterToggles.forEach(cb => { cb.checked = state.settings.extraFilters.includes(cb.value); });
        ui.colToggles.forEach(cb => { cb.checked = state.settings.extraColumns.includes(cb.value); });
        updateExtraFilterVisibility();
    }

    function readSettingsFromUI() {
        state.settings.balancedGenders   = ui.balancedGendersToggle.checked;
        state.settings.gazeThreshold     = parseFloat(ui.gazeThresholdInput.value) || 0.5;
        state.settings.minVotesPerGender = parseInt(ui.minVotesInput.value) || 0;
        state.settings.pageSize          = parseInt(ui.pageSizeSelect.value) || 100;
        state.settings.extraFilters      = Array.from(ui.extraFilterToggles).filter(cb => cb.checked).map(cb => cb.value);
        state.settings.extraColumns      = Array.from(ui.colToggles).filter(cb => cb.checked).map(cb => cb.value);
    }

    function updateExtraFilterVisibility() {
        EXTRA_FILTER_DEFS.forEach(def => {
            const wrapper = document.getElementById(`extra-filter-${def.id}`);
            if (!wrapper) return;
            const active = state.settings.extraFilters.includes(def.id);
            wrapper.classList.toggle('hidden', !active);
            if (!active) {
                const input = document.getElementById(def.inputId);
                if (input) input.value = '';
            }
        });
    }

    // --- Initialisation ---
    async function init() {
        loadSettings();
        ui.yearToInput.value = new Date().getFullYear();
        applyI18n();

        if (!window.Worker) {
            ui.status.textContent = 'Error: Web Workers not supported.';
            return;
        }

        const storedVersion = localStorage.getItem(LS_VERSION_KEY);
        const storedGenres  = localStorage.getItem(LS_GENRES_KEY);

        if (storedVersion == EXPECTED_DB_VERSION && storedGenres) {
            ui.details.textContent = t('loading.verify');
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
            } catch (_) {}
        }

        ui.details.textContent = t('loading.download');
        const worker = new Worker('worker.js?v=9');

        worker.onmessage = async (e) => {
            const msg = e.data;
            if (msg.type === 'progress') {
                ui.details.textContent = msg.status;
                ui.progressBar.style.width = `${msg.percent}%`;
            } else if (msg.type === 'done') {
                ui.details.textContent = t('loading.done', { n: msg.totalRecords.toLocaleString() });
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
                ui.status.textContent = 'Error';
                ui.details.textContent = msg.message;
                ui.progressBar.style.backgroundColor = '#e84118';
            }
        };

        worker.postMessage({ action: 'init' });
        bindEvents();
    }

    // --- IndexedDB ---
    function openIndexedDB() {
        return new Promise((resolve) => {
            const req = indexedDB.open(DB_NAME);
            req.onsuccess = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('movies')) { resolve(null); return; }
                const store = db.transaction(['movies'], 'readonly').objectStore('movies');
                const count = store.count();
                count.onsuccess = () => { if (count.result > 0) { state.db = db; resolve(db); } else resolve(null); };
                count.onerror = () => resolve(null);
            };
            req.onerror = () => resolve(null);
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

    // --- Gender Balance Score ---
    function computeScore(fAvg, fVotes, mAvg, mVotes) {
        if (state.settings.balancedGenders) return (fAvg + mAvg) / 2;
        const total = fVotes + mVotes;
        return total > 0 ? (fAvg * fVotes + mAvg * mVotes) / total : (fAvg + mAvg) / 2;
    }

    // --- Multi-Age Group Aggregation ---
    // Given a movie record and a list of age group suffixes, compute the vote-weighted
    // aggregate female avg, male avg, and their respective vote counts across those groups.
    function aggregateDemographics(movie, ageGroups) {
        let fWeightedSum = 0, fTotalVotes = 0;
        let mWeightedSum = 0, mTotalVotes = 0;

        for (const age of ageGroups) {
            const fAvg   = movie[`females_${age}_avg_vote`];
            const fVotes = movie[`females_${age}_votes`] || 0;
            const mAvg   = movie[`males_${age}_avg_vote`];
            const mVotes = movie[`males_${age}_votes`] || 0;

            if (fAvg && fVotes) { fWeightedSum += fAvg * fVotes; fTotalVotes += fVotes; }
            if (mAvg && mVotes) { mWeightedSum += mAvg * mVotes; mTotalVotes += mVotes; }
        }

        return {
            fAvg:   fTotalVotes > 0 ? fWeightedSum / fTotalVotes : null,
            fVotes: fTotalVotes,
            mAvg:   mTotalVotes > 0 ? mWeightedSum / mTotalVotes : null,
            mVotes: mTotalVotes,
        };
    }

    // --- Filters ---
    function readFiltersFromUI() {
        state.filters.search   = ui.searchInput.value.toLowerCase().trim();
        state.filters.yearFrom = parseInt(ui.yearFromInput.value) || 0;
        state.filters.yearTo   = parseInt(ui.yearToInput.value) || 9999;
        state.filters.genres   = Array.from(document.querySelectorAll('.genre-cb:checked')).map(cb => cb.value);

        const checkedAges = Array.from(document.querySelectorAll('input[name="age-group"]:checked')).map(cb => cb.value);
        state.filters.ageGroups = checkedAges.length > 0 ? checkedAges : ['0age', '18age', '30age', '45age'];

        const dirInput  = document.getElementById('filter-director');
        const cntInput  = document.getElementById('filter-country');
        const langInput = document.getElementById('filter-language');
        state.filters.director = dirInput  ? dirInput.value.toLowerCase().trim()  : '';
        state.filters.country  = cntInput  ? cntInput.value.toLowerCase().trim()  : '';
        state.filters.language = langInput ? langInput.value.toLowerCase().trim() : '';
    }

    async function applyFiltersAndFetch() {
        readFiltersFromUI();
        state.page = 1;

        const colspan = 6 + state.settings.extraColumns.length;
        ui.tableBody.innerHTML = `<tr><td colspan="${colspan}" class="empty-state" style="padding:20px">…</td></tr>`;

        return new Promise((resolve) => {
            setTimeout(() => {
                const store   = state.db.transaction(['movies'], 'readonly').objectStore('movies');
                const request = store.openCursor();
                const results = [];
                const f    = state.filters;
                const minV = state.settings.minVotesPerGender;

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (!cursor) {
                        state.currentData = results;
                        sortData();
                        renderTable();
                        resolve();
                        return;
                    }

                    const m = cursor.value;
                    const { fAvg, fVotes, mAvg, mVotes } = aggregateDemographics(m, f.ageGroups);

                    if (fAvg !== null && mAvg !== null && fVotes >= minV && mVotes >= minV) {
                        const yearOk  = m.year && m.year >= f.yearFrom && m.year <= f.yearTo;
                        const titleOk = !f.search   || (m.title    || '').toLowerCase().includes(f.search);
                        const genreOk = f.genres.length === 0 || f.genres.some(g => m.genres.includes(g));
                        const dirOk   = !f.director || (m.director || '').toLowerCase().includes(f.director);
                        const cntOk   = !f.country  || (m.country  || '').toLowerCase().includes(f.country);
                        const langOk  = !f.language || (m.language || '').toLowerCase().includes(f.language);

                        if (yearOk && titleOk && genreOk && dirOk && cntOk && langOk) {
                            results.push({
                                id: m.imdb_title_id,
                                title: m.title,
                                year:  m.year,
                                genres: m.genres.join(', '),
                                score: computeScore(fAvg, fVotes, mAvg, mVotes),
                                fAvg, fVotes, mAvg, mVotes,
                                gaze_delta: fAvg - mAvg,
                                weighted_average_vote: m.weighted_average_vote,
                                total_votes:           m.total_votes,
                                director:              m.director,
                                country:               m.country,
                                language:              m.language,
                                duration:              m.duration,
                                metascore:             m.metascore,
                                budget:                m.budget,
                                usa_gross_income:      m.usa_gross_income,
                                worldwide_gross_income:m.worldwide_gross_income,
                            });
                        }
                    }
                    cursor.continue();
                };
            }, 10);
        });
    }

    // --- Sorting ---
    const SORT_KEY_MAP = {
        title:           'title',
        score:           'score',
        female_avg:      'fAvg',
        male_avg:        'mAvg',
        gaze_delta:      'gaze_delta',
        imdb_score:      'weighted_average_vote',
        total_votes:     'total_votes',
        director:        'director',
        country:         'country',
        language:        'language',
        duration:        'duration',
        metascore:       'metascore',
        budget:          'budget',
        usa_gross:       'usa_gross_income',
        worldwide_gross: 'worldwide_gross_income',
    };

    function sortData() {
        const prop = SORT_KEY_MAP[state.sortCol] || state.sortCol;
        const dir  = state.sortDesc ? -1 : 1;

        state.currentData.sort((a, b) => {
            let va = a[prop], vb = b[prop];
            if (va === null || va === undefined) va = state.sortCol === 'title' ? '' : -Infinity;
            if (vb === null || vb === undefined) vb = state.sortCol === 'title' ? '' : -Infinity;
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            return va < vb ? -dir : va > vb ? dir : 0;
        });

        updateSortIcons();
    }

    function updateSortIcons() {
        document.querySelectorAll('th.sortable').forEach(th => {
            const icon = th.querySelector('.sort-icon');
            if (icon) icon.textContent = th.dataset.sort === state.sortCol ? (state.sortDesc ? '↓' : '↑') : '';
        });
    }

    // --- Rendering ---
    function renderTable() {
        const start      = (state.page - 1) * state.settings.pageSize;
        const pageData   = state.currentData.slice(start, start + state.settings.pageSize);
        const activeCols = EXTRA_COLUMN_DEFS.filter(c => state.settings.extraColumns.includes(c.id));

        ui.resultsCount.textContent = t('results.count', { n: state.currentData.length.toLocaleString() });

        // Score column label reflects balance mode
        if (ui.scoreColLabel) {
            ui.scoreColLabel.dataset.i18n = state.settings.balancedGenders ? 'col.scoreBalanced' : 'col.score';
            ui.scoreColLabel.textContent  = t(ui.scoreColLabel.dataset.i18n);
        }

        // Sync extra column headers
        const thead = document.querySelector('#movies-table thead tr');
        thead.querySelectorAll('.extra-header').forEach(el => el.remove());
        activeCols.forEach(col => {
            const th = document.createElement('th');
            th.className = 'sortable extra-header';
            th.dataset.sort = col.id;
            th.innerHTML = `${t(col.labelKey)} <span class="sort-icon"></span>`;
            th.addEventListener('click', () => handleSort(col.id));
            thead.appendChild(th);
        });

        ui.tableBody.innerHTML = '';

        if (pageData.length === 0) {
            const colspan = 6 + activeCols.length;
            ui.tableBody.innerHTML = `<tr><td colspan="${colspan}" class="empty-state">${t('table.empty')}</td></tr>`;
            updatePagination();
            return;
        }

        const fragment = document.createDocumentFragment();
        pageData.forEach((m, idx) => {
            const tr = document.createElement('tr');
            const delta = m.gaze_delta;

            if (delta >= state.settings.gazeThreshold) tr.classList.add('row-female-gaze');
            else if (delta <= -state.settings.gazeThreshold) tr.classList.add('row-male-gaze');

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
                <td><span class="female-val">${m.fAvg.toFixed(1)}</span><br><span class="vote-count">${m.fVotes.toLocaleString()}</span></td>
                <td><span class="male-val">${m.mAvg.toFixed(1)}</span><br><span class="vote-count">${m.mVotes.toLocaleString()}</span></td>
                <td class="delta-val">${deltaStr}</td>
            `;

            activeCols.forEach(col => { html += `<td>${fmtCell(m[col.key], col.fmt)}</td>`; });

            tr.innerHTML = html;
            fragment.appendChild(tr);
        });

        ui.tableBody.appendChild(fragment);
        updateSortIcons();
        updatePagination();
    }

    function updatePagination() {
        const totalPages = Math.max(1, Math.ceil(state.currentData.length / state.settings.pageSize));
        ui.pageInfo.textContent = t('page.info', { page: state.page, total: totalPages });
        ui.prevPageBtn.disabled = state.page === 1;
        ui.nextPageBtn.disabled = state.page === totalPages;
    }

    function handleSort(col) {
        state.sortDesc = state.sortCol === col ? !state.sortDesc : col !== 'title';
        state.sortCol  = col;
        sortData();
        renderTable();
    }

    // --- Events ---
    function bindEvents() {
        ui.applyBtn.addEventListener('click', applyFiltersAndFetch);

        ui.resetBtn.addEventListener('click', () => {
            ui.searchInput.value   = '';
            ui.yearFromInput.value = '1894';
            ui.yearToInput.value   = new Date().getFullYear();
            document.querySelectorAll('input[name="age-group"]').forEach(cb => { cb.checked = false; });
            document.querySelectorAll('.genre-cb').forEach(cb => { cb.checked = false; });
            EXTRA_FILTER_DEFS.forEach(def => {
                const input = document.getElementById(def.inputId);
                if (input) input.value = '';
            });
            applyFiltersAndFetch();
        });

        document.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => handleSort(th.dataset.sort));
        });

        ui.prevPageBtn.addEventListener('click', () => { if (state.page > 1) { state.page--; renderTable(); } });
        ui.nextPageBtn.addEventListener('click', () => {
            const total = Math.ceil(state.currentData.length / state.settings.pageSize);
            if (state.page < total) { state.page++; renderTable(); }
        });

        ui.langToggle.addEventListener('click', () => {
            state.settings.language = state.settings.language === 'en' ? 'fi' : 'en';
            saveSettings();
            applyI18n();
            renderTable();
        });

        ui.settingsBtn.addEventListener('click', () => {
            applySettingsToUI();
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
            applyI18n();
            ui.settingsModal.classList.remove('show');
            applyFiltersAndFetch();
        });
    }

    init();
});