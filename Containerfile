FROM nginx:stable-alpine

# Download datasets at build time so the image is fully self-contained.
# The CSVs are gitignored and never committed; they are fetched fresh on every build.
RUN apk add --no-cache curl && \
    mkdir -p /usr/share/nginx/html/imdb_dataset && \
    curl -fsSL "https://github.com/teekuningas/IMDB-Movies-Extensive-Dataset-Analysis/raw/refs/heads/master/data1/IMDb%20movies.csv" \
         -o /usr/share/nginx/html/imdb_dataset/movies.csv && \
    curl -fsSL "https://github.com/teekuningas/IMDB-Movies-Extensive-Dataset-Analysis/raw/refs/heads/master/data1/IMDb%20ratings.csv" \
         -o /usr/share/nginx/html/imdb_dataset/ratings.csv

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js worker.js i18n.js style.css /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
