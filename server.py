import os
import csv
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

DATA_DIR = "imdb_dataset"

class MovieDatabase:
    def __init__(self):
        self.movies = []
        self.genres_list = []
        self.min_year_db = 2024
        self.max_year_db = 1800
        self.load_data()

    def load_data(self):
        print("Loading Kaggle IMDb Extensive Dataset...")
        
        movies_meta = {}
        genres_set = set()
        
        # Load movies.csv
        movies_path = os.path.join(DATA_DIR, 'movies.csv')
        if os.path.exists(movies_path):
            with open(movies_path, 'r', encoding='utf-8', errors='ignore') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    mid = row.get('imdb_title_id')
                    title = row.get('title')
                    year_str = row.get('year')
                    genre_str = row.get('genre')
                    
                    if not mid or not title: continue
                    
                    # Some years in this dataset have non-integer values like 'TV Movie 2019', safe parse
                    try:
                        year = int(year_str)
                        self.min_year_db = min(self.min_year_db, year)
                        self.max_year_db = max(self.max_year_db, year)
                    except (ValueError, TypeError):
                        year = None
                    
                    genres = [g.strip() for g in genre_str.split(',')] if genre_str else []
                    for g in genres:
                        genres_set.add(g)
                        
                    movies_meta[mid] = {
                        'title': title,
                        'year': year,
                        'genres': genres
                    }
        else:
            print(f"Error: Could not find {movies_path}")
            return

        # Load ratings.csv
        ratings_path = os.path.join(DATA_DIR, 'ratings.csv')
        if os.path.exists(ratings_path):
            with open(ratings_path, 'r', encoding='utf-8', errors='ignore') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    mid = row.get('imdb_title_id')
                    meta = movies_meta.get(mid)
                    if not meta: continue
                    
                    try:
                        f_avg = float(row.get('females_allages_avg_vote', ''))
                        f_votes = int(float(row.get('females_allages_votes', '')))
                        m_avg = float(row.get('males_allages_avg_vote', ''))
                        m_votes = int(float(row.get('males_allages_votes', '')))
                    except ValueError:
                        # Skip if demographic data is missing
                        continue
                    
                    if f_votes == 0 or m_votes == 0:
                        continue
                        
                    self.movies.append({
                        'id': mid,
                        'title': meta['title'],
                        'year': meta['year'],
                        'genres': meta['genres'],
                        'f_count': f_votes,
                        'f_sum': f_avg * f_votes, # store sum for consistency with old code structure if needed
                        'avg_f': f_avg,
                        'm_count': m_votes,
                        'm_sum': m_avg * m_votes,
                        'avg_m': m_avg
                    })
        else:
            print(f"Error: Could not find {ratings_path}")
            return
        
        self.genres_list = sorted(list(genres_set))
        print(f"Loaded {len(self.movies)} movies with full demographic data (from {self.min_year_db} to {self.max_year_db}).")

    def get_movies(self, filters):
        results = []
        
        try:
            min_ratings = int(filters.get('min_ratings', 50))
        except ValueError:
            min_ratings = 50
            
        try:
            year_from = int(filters.get('year_from', self.min_year_db))
        except ValueError:
            year_from = self.min_year_db
            
        try:
            year_to = int(filters.get('year_to', self.max_year_db))
        except ValueError:
            year_to = self.max_year_db
            
        selected_genres = filters.get('genres', [])
        search_query = filters.get('search', '').lower()

        for m in self.movies:
            if m['f_count'] < min_ratings or m['m_count'] < min_ratings:
                continue
                
            if m['year'] is not None:
                if m['year'] < year_from or m['year'] > year_to:
                    continue
                    
            if selected_genres:
                if not any(g in m['genres'] for g in selected_genres):
                    continue
                
            if search_query and search_query not in m['title'].lower():
                continue
            
            avg_f = m['avg_f']
            avg_m = m['avg_m']
            score = (avg_f + avg_m) / 2
            total_count = m['f_count'] + m['m_count']

            results.append({
                'title': m['title'],
                'year': m['year'],
                'genres': ", ".join(m['genres']),
                'avg_f': avg_f,
                'count_f': m['f_count'],
                'avg_m': avg_m,
                'count_m': m['m_count'],
                'score': score,
                'total_count': total_count
            })
        
        sort_by = filters.get('sort_by', 'Combined Score')
        if sort_by == 'Female Rating':
            results.sort(key=lambda x: x['avg_f'], reverse=True)
        elif sort_by == 'Male Rating':
            results.sort(key=lambda x: x['avg_m'], reverse=True)
        elif sort_by == 'Total Votes':
            results.sort(key=lambda x: x['total_count'], reverse=True)
        elif sort_by == 'Female Votes':
            results.sort(key=lambda x: x['count_f'], reverse=True)
        elif sort_by == 'Male Votes':
            results.sort(key=lambda x: x['count_m'], reverse=True)
        elif sort_by == 'Release Year (Newest)':
            results.sort(key=lambda x: x['year'] or 0, reverse=True)
        elif sort_by == 'Release Year (Oldest)':
            results.sort(key=lambda x: x['year'] or 9999)
        else:
            results.sort(key=lambda x: x['score'], reverse=True)
            
        return results

db = MovieDatabase()

def get_filter_definitions():
    return [
        {
            "id": "search",
            "label": "Search Title",
            "type": "text",
            "default": "",
            "placeholder": "e.g. Matrix"
        },
        {
            "id": "min_ratings",
            "label": "Min Ratings (per gender)",
            "type": "number",
            "default": "100", # Boosted default since this dataset is larger
            "min": "1",
            "max": "50000"
        },
        {
            "id": "year_from",
            "label": "Year From",
            "type": "number",
            "default": db.min_year_db,
            "min": db.min_year_db,
            "max": db.max_year_db
        },
        {
            "id": "year_to",
            "label": "Year To",
            "type": "number",
            "default": db.max_year_db,
            "min": db.min_year_db,
            "max": db.max_year_db
        },
        {
            "id": "genres",
            "label": "Genres (Any of)",
            "type": "checkboxes",
            "options": [g for g in db.genres_list if g], # Ignore empty genres
            "default": []
        }
    ]

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_path.query)
        
        filters_def = get_filter_definitions()
        current_filters = {}
        for f in filters_def:
            if f['type'] == 'checkboxes':
                current_filters[f['id']] = query_params.get(f['id'], f['default'])
            else:
                val_list = query_params.get(f['id'])
                current_filters[f['id']] = val_list[0] if val_list else str(f['default'])
                
        sort_val = query_params.get('sort_by')
        current_filters['sort_by'] = sort_val[0] if sort_val else 'Combined Score'
        
        movies = db.get_movies(current_filters)
        html = self.generate_html(movies, filters_def, current_filters)
        
        self.send_response(200)
        self.send_header('Content-type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.end_headers()
        self.wfile.write(html.encode('utf-8'))

    def generate_html(self, movies, filters_def, current_filters):
        y_from = current_filters['year_from']
        y_to = current_filters['year_to']

        filters_html = ""
        for f in filters_def:
            if f['id'] in ['year_from', 'year_to']:
                continue
                
            val = current_filters[f['id']]
            filters_html += f'<div class="filter-group"><label for="{f["id"]}">{f["label"]}</label>'
            
            if f['type'] == 'checkboxes':
                filters_html += '<div class="checkbox-grid">'
                for opt in f['options']:
                    checked = "checked" if opt in val else ""
                    filters_html += f'<label class="checkbox-label"><input type="checkbox" name="{f["id"]}" value="{opt}" {checked} onchange="this.form.submit()"> {opt}</label>'
                filters_html += '</div>'
            elif f['type'] == 'number':
                filters_html += f'<input type="number" name="{f["id"]}" id="{f["id"]}" value="{val}" min="{f.get("min", "")}" max="{f.get("max", "")}" onchange="this.form.submit()">'
            elif f['type'] == 'text':
                filters_html += f'<input type="text" name="{f["id"]}" id="{f["id"]}" value="{val}" placeholder="{f.get("placeholder", "")}" onchange="this.form.submit()">'
            filters_html += '</div>'

            if f['id'] == 'min_ratings':
                filters_html += f'''
            <div class="year-filters filter-group">
                <div style="flex: 1;">
                    <label for="year_from">Year From</label>
                    <input type="number" name="year_from" id="year_from" value="{y_from}" min="{db.min_year_db}" max="{db.max_year_db}" onchange="this.form.submit()">
                </div>
                <div style="flex: 1;">
                    <label for="year_to">Year To</label>
                    <input type="number" name="year_to" id="year_to" value="{y_to}" min="{db.min_year_db}" max="{db.max_year_db}" onchange="this.form.submit()">
                </div>
            </div>
'''

        hidden_sort_input = f'<input type="hidden" name="sort_by" value="{current_filters["sort_by"]}">'

        def make_sort_link(label, sort_val):
            new_filters = current_filters.copy()
            new_filters['sort_by'] = sort_val
            query_items = []
            for k, v in new_filters.items():
                if isinstance(v, list):
                    for item in v:
                        query_items.append((k, item))
                else:
                    query_items.append((k, v))
            
            qs = urllib.parse.urlencode(query_items)
            is_active = current_filters.get('sort_by') == sort_val
            indicator = " &darr;" if is_active else ""
            active_class = "active" if is_active else ""
            return f'<a href="/?{qs}" class="sort-link {active_class}">{label}{indicator}</a>'

        rows_html = ""
        for i, m in enumerate(movies[:200], 1):
            year_str = f"({m['year']})" if m['year'] else ""
            rows_html += f'''
                <tr>
                    <td>#{i}</td>
                    <td class="title-cell">{m['title']} <span style="color:#7f8c8d; font-weight:normal;">{year_str}</span><br><span class="genres">{m['genres']}</span></td>
                    <td>
                        <span class="score">{m['score']:.2f}</span><br>
                        <span class="votes">({m['total_count']:,} total)</span>
                    </td>
                    <td>
                        <span class="female">{m['avg_f']:.2f}</span><br>
                        <span class="votes">({m['count_f']:,} votes)</span>
                    </td>
                    <td>
                        <span class="male">{m['avg_m']:.2f}</span><br>
                        <span class="votes">({m['count_m']:,} votes)</span>
                    </td>
                </tr>
            '''
        
        if not movies:
            rows_html = '<tr><td colspan="5" style="text-align:center; padding: 40px; color: #7f8c8d;">No movies found matching these criteria. Try adjusting the filters.</td></tr>'

        return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gender-Balanced Movie Rankings</title>
    <style>
        :root {{
            --primary: #2c3e50;
            --accent: #8e44ad;
            --bg: #f8f9fa;
            --card-bg: #ffffff;
            --text-main: #2d3436;
            --text-muted: #636e72;
            --female-color: #d63031;
            --male-color: #0984e3;
            --border-color: #dfe6e9;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: var(--bg);
            color: var(--text-main);
            display: flex;
            height: 100vh;
            overflow: hidden;
        }}
        .sidebar {{
            width: 320px;
            background-color: var(--card-bg);
            border-right: 1px solid var(--border-color);
            padding: 30px 25px;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            box-shadow: 2px 0 10px rgba(0,0,0,0.03);
            z-index: 10;
        }}
        .main-content {{
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }}
        .header {{
            padding: 25px 40px;
            background-color: var(--card-bg);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .header h1 {{ margin: 0; font-size: 1.6rem; color: var(--primary); }}
        .header p {{ margin: 8px 0 0; color: var(--text-muted); font-size: 0.95rem; }}
        
        .table-container {{
            flex: 1;
            overflow: auto;
            padding: 30px 40px;
        }}
        
        .sidebar h2 {{ margin-top: 0; font-size: 1.3rem; margin-bottom: 25px; border-bottom: 3px solid var(--accent); padding-bottom: 10px; display: inline-block; color: var(--primary); }}
        .filter-group {{ margin-bottom: 20px; }}
        .filter-group > label {{ display: block; font-weight: 600; margin-bottom: 8px; font-size: 0.9rem; color: var(--primary); }}
        .filter-group input[type="text"], .filter-group input[type="number"] {{
            width: 100%;
            padding: 10px 12px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            font-size: 0.95rem;
            box-sizing: border-box;
            background-color: #fcfcfc;
            transition: border-color 0.2s, box-shadow 0.2s;
        }}
        .filter-group input:focus {{ outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(142, 68, 173, 0.2); }}
        
        .year-filters {{ display: flex; gap: 10px; }}
        .year-filters .filter-group {{ flex: 1; margin-bottom: 0; }}
        
        .checkbox-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 6px; max-height: 200px; overflow-y: auto; padding-right: 5px; }}
        .checkbox-label {{ display: flex; align-items: center; font-size: 0.85rem; font-weight: normal !important; color: var(--text-main); cursor: pointer; }}
        .checkbox-label input {{ margin-right: 6px; cursor: pointer; accent-color: var(--accent); }}

        table {{ width: 100%; border-collapse: separate; border-spacing: 0; background: var(--card-bg); border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }}
        th, td {{ padding: 16px 20px; text-align: left; border-bottom: 1px solid #edf2f7; vertical-align: middle; }}
        
        th {{ background-color: #f8f9fa; position: sticky; top: 0; z-index: 5; text-transform: uppercase; font-size: 0.82rem; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }}
        .sort-link {{ color: var(--text-muted); text-decoration: none; font-weight: 600; display: block; }}
        .sort-link:hover {{ color: var(--accent); }}
        .sort-link.active {{ color: var(--accent); font-weight: 700; }}
        
        tr:last-child td {{ border-bottom: none; }}
        tr:hover td {{ background-color: #f8fafc; }}
        
        .title-cell {{ font-weight: 600; font-size: 1.05rem; line-height: 1.4; }}
        .genres {{ font-size: 0.85rem; color: var(--text-muted); font-weight: normal; display: block; margin-top: 4px; }}
        .score {{ font-weight: 700; color: var(--accent); font-size: 1.15rem; }}
        .female {{ color: var(--female-color); font-weight: 600; font-size: 1.05rem; }}
        .male {{ color: var(--male-color); font-weight: 600; font-size: 1.05rem; }}
        .votes {{ font-size: 0.8rem; color: var(--text-muted); }}
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>Filters & Sorting</h2>
        <form method="GET" action="/">
            {hidden_sort_input}
            {filters_html}
        </form>
    </div>
    
    <div class="main-content">
        <div class="header">
            <div>
                <h1>Gender-Balanced Movie Rankings</h1>
                <p>Ranking based on: <code>(Female Avg + Male Avg) / 2</code> (Top 200 shown)</p>
            </div>
            <div style="font-size: 0.95rem; color: var(--text-muted); text-align: right;">
                Showing <strong>{len(movies):,}</strong> results<br>
                <span style="font-size: 0.8rem;">Dataset total: {len(db.movies):,} movies</span>
            </div>
        </div>
        
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th width="5%">Rank</th>
                        <th width="35%">Title & Genres</th>
                        <th width="20%">{make_sort_link("Combined Score", "Combined Score")}</th>
                        <th width="20%">{make_sort_link("Female Rating", "Female Rating")}</th>
                        <th width="20%">{make_sort_link("Male Rating", "Male Rating")}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows_html}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>'''

if __name__ == "__main__":
    PORT = 8000
    server_address = ('0.0.0.0', PORT)
    httpd = HTTPServer(server_address, RequestHandler)
    print(f"Serving at http://0.0.0.0:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()
