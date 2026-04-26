// worker.js - Background Web Worker for Data Processing

importScripts('https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js');

const DB_NAME = 'spectacleDB';
const DB_VERSION = 9;
const STORE_NAME = 'movies';

// --- IndexedDB Helper Functions ---
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Drop old store if upgrading from a prior schema
            if (db.objectStoreNames.contains(STORE_NAME)) {
                db.deleteObjectStore(STORE_NAME);
            }
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'imdb_title_id' });
            store.createIndex('year', 'year', { unique: false });
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

function clearStore(db) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
}

function storeBatch(db, batch) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        batch.forEach(item => store.put(item));
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

// --- Helpers ---

// Parse a USD money string like "$ 2250000" → integer, or null for non-USD / empty.
function parseUSD(str) {
    if (!str) return null;
    const s = str.trim();
    if (!s.startsWith('$')) return null;
    const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? null : n;
}

// Normalise CSV "None" and blank strings to null.
function csvStr(val) {
    if (!val || val.trim() === 'None') return null;
    return val.trim();
}

// --- Data Ingestion ---
async function ingestData() {
    try {
        const db = await openDB();

        postMessage({ type: 'progress', status: 'Clearing old cache...', percent: 5 });
        await clearStore(db);

        // 1. Parse movies.csv — extract metadata we care about
        postMessage({ type: 'progress', status: 'Fetching movies metadata...', percent: 10 });

        const moviesMeta = new Map();
        const genresSet = new Set();

        await new Promise((resolve, reject) => {
            Papa.parse('imdb_dataset/movies.csv', {
                download: true,
                header: true,
                skipEmptyLines: true,
                worker: false,
                step: function(results) {
                    const row = results.data;
                    if (!row.imdb_title_id || !row.title) return;

                    const year = parseInt(row.year);
                    const genres = row.genre ? row.genre.split(',').map(g => g.trim()).filter(Boolean) : [];
                    genres.forEach(g => genresSet.add(g));

                    // Prefer original_title as the display title
                    const title = (row.original_title || '').trim() || row.title.trim();

                    moviesMeta.set(row.imdb_title_id, {
                        imdb_title_id: row.imdb_title_id,
                        title,
                        year: isNaN(year) ? null : year,
                        genres,
                        director: csvStr(row.director),
                        country:  csvStr(row.country),
                        language: csvStr(row.language),
                        duration: parseInt(row.duration) || null,
                        budget:              parseUSD(row.budget),
                        usa_gross_income:    parseUSD(row.usa_gross_income),
                        worldwide_gross_income: parseUSD(row.worlwide_gross_income),
                        metascore: parseFloat(row.metascore) || null,
                    });
                },
                complete: resolve,
                error: reject
            });
        });

        postMessage({ type: 'progress', status: `Parsed ${moviesMeta.size} movie records. Fetching ratings...`, percent: 40 });

        // 2. Parse ratings.csv — merge with metadata, store batches into IndexedDB
        let count = 0;
        let batch = [];
        const BATCH_SIZE = 2000;

        await new Promise((resolve, reject) => {
            Papa.parse('imdb_dataset/ratings.csv', {
                download: true,
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                step: async function(results, parser) {
                    const row = results.data;
                    const id = row.imdb_title_id;
                    const meta = moviesMeta.get(id);
                    if (!meta) return;

                    const record = {
                        imdb_title_id: id,
                        title:    meta.title,
                        year:     meta.year,
                        genres:   meta.genres,
                        director:  meta.director,
                        country:   meta.country,
                        language:  meta.language,
                        duration:  meta.duration,
                        budget:    meta.budget,
                        usa_gross_income:       meta.usa_gross_income,
                        worldwide_gross_income: meta.worldwide_gross_income,
                        metascore: meta.metascore,

                        weighted_average_vote: row.weighted_average_vote,
                        total_votes:           row.total_votes,

                        males_0age_avg_vote:       row.males_0age_avg_vote,
                        males_0age_votes:          row.males_0age_votes,
                        females_0age_avg_vote:     row.females_0age_avg_vote,
                        females_0age_votes:        row.females_0age_votes,

                        males_18age_avg_vote:      row.males_18age_avg_vote,
                        males_18age_votes:         row.males_18age_votes,
                        females_18age_avg_vote:    row.females_18age_avg_vote,
                        females_18age_votes:       row.females_18age_votes,

                        males_30age_avg_vote:      row.males_30age_avg_vote,
                        males_30age_votes:         row.males_30age_votes,
                        females_30age_avg_vote:    row.females_30age_avg_vote,
                        females_30age_votes:       row.females_30age_votes,

                        males_45age_avg_vote:      row.males_45age_avg_vote,
                        males_45age_votes:         row.males_45age_votes,
                        females_45age_avg_vote:    row.females_45age_avg_vote,
                        females_45age_votes:       row.females_45age_votes,
                    };

                    batch.push(record);
                    count++;

                    if (batch.length >= BATCH_SIZE) {
                        parser.pause();
                        await storeBatch(db, batch);
                        batch = [];
                        const estPercent = 40 + Math.min(50, (count / 85000) * 50);
                        postMessage({ type: 'progress', status: `Processing ratings (${count.toLocaleString()} merged)...`, percent: estPercent });
                        parser.resume();
                    }
                },
                complete: async function() {
                    if (batch.length > 0) await storeBatch(db, batch);
                    resolve();
                },
                error: reject
            });
        });

        postMessage({ type: 'progress', status: 'Finalizing database...', percent: 95 });

        const sortedGenres = Array.from(genresSet).filter(Boolean).sort();

        postMessage({
            type: 'done',
            genres: sortedGenres,
            totalRecords: count
        });

    } catch (error) {
        postMessage({ type: 'error', message: error.toString() });
    }
}

// --- Message Handler ---
onmessage = function(e) {
    if (e.data.action === 'init') {
        ingestData();
    }
};