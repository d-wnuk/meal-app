# Meal App Deployment Cheatsheet

This project is deployed on a VPS with:

- Docker Compose for the app containers
- nginx installed on the VPS host
- Cloudflare in front of the domain
- the app served at `https://dominikwn.uk/meal-app/`

## URLs and Ports

- Public app URL: `https://dominikwn.uk/meal-app/`
- Public API health URL: `https://dominikwn.uk/meal-app/api/health`
- Backend container on VPS host: `127.0.0.1:8000`
- Frontend container on VPS host: `127.0.0.1:20178`

The containers are intentionally bound to `127.0.0.1` so they are only reachable through host nginx.

## 1. First-Time VPS Setup

Clone the repo on the VPS:

```bash
mkdir -p ~/apps
cd ~/apps
git clone git@github.com:d-wnuk/meal-app.git
cd meal-app
cp .env.example .env
```

Edit `.env` on the VPS:

```dotenv
POSTGRES_USER=meal_app
POSTGRES_PASSWORD=change-me
POSTGRES_DB=meals
DATABASE_URL=postgresql://meal_app:change-me@db:5432/meals
BACKEND_PORT=8000
FRONTEND_PORT=20178
APP_DOMAIN=dominikwn.uk
VITE_APP_BASE_PATH=/meal-app/
```

Important:

- `DATABASE_URL` must match `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`.
- If you change Postgres credentials after the DB volume already exists, Postgres will not update the existing role automatically.
- If you do not need existing DB data, reset the DB volume with `docker compose down -v` before starting again.

## 2. Start or Rebuild the App

From the VPS repo directory:

```bash
cd ~/apps/meal-app
docker compose up -d --build --remove-orphans
```

Check status:

```bash
docker compose ps
```

Expected ports:

- backend: `127.0.0.1:8000->8000`
- frontend: `127.0.0.1:20178->80`

## 3. Host nginx Config

Create this file on the VPS:

Path:

```bash
/etc/nginx/sites-available/dominikwn.uk
```

Contents:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name dominikwn.uk www.dominikwn.uk;

    location = /meal-app {
        return 301 /meal-app/;
    }

    location /meal-app/api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /meal-app/ {
        proxy_pass http://127.0.0.1:20178/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        return 404;
    }
}
```

Enable the site:

```bash
sudo ln -sf /etc/nginx/sites-available/dominikwn.uk /etc/nginx/sites-enabled/dominikwn.uk
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Important:

- The nginx config file must contain only nginx directives, not shell commands like `sudo`.
- On Ubuntu/Debian, use `sites-available` and `sites-enabled`.

## 4. Cloudflare Notes

Current working public URL:

- `https://dominikwn.uk/meal-app/`

Important lessons from setup:

- `www.dominikwn.uk` was still pointing to Netlify, which caused public 404s.
- Removing the conflicting old `A` records fixed routing.
- If the app works on `127.0.0.1` on the VPS but not publicly, check Cloudflare DNS first.

Useful DNS checks:

```bash
dig +short dominikwn.uk
dig +short www.dominikwn.uk
```

If `www` is not meant to be used, you can leave it unconfigured or redirect it separately later.

## 5. Quick Health Checks

Run these on the VPS:

```bash
curl http://127.0.0.1:8000/health
curl -I http://127.0.0.1:20178/
curl http://127.0.0.1:20178/api/health
curl -I http://127.0.0.1/meal-app/
curl http://127.0.0.1/meal-app/api/health
```

Expected:

- backend health returns `{"status":"ok"}`
- frontend root on `127.0.0.1:20178` returns `200 OK`
- nginx route `127.0.0.1/meal-app/` returns `200 OK`
- nginx route `127.0.0.1/meal-app/api/health` returns `{"status":"ok"}`

## 6. Normal Deployment Flow

On your laptop:

```bash
git add .
git commit -m "Describe the change"
git push origin main
```

On the VPS:

```bash
cd ~/apps/meal-app
git pull
docker compose up -d --build --remove-orphans
```

Then verify:

```bash
docker compose ps
curl http://127.0.0.1:8000/health
curl http://127.0.0.1/meal-app/api/health
```

## 7. Logs and Debugging

See recent logs:

```bash
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
docker compose logs --tail=100 db
```

If a port is already taken:

```bash
sudo ss -tulpn | grep 20178
docker ps --format 'table {{.Names}}	{{.Ports}}'
```

If Docker says a port is already allocated, rebuilding with orphan cleanup can help:

```bash
docker compose up -d --build --remove-orphans
```

## 8. Reset the Database Volume

Only do this if you do not need the current DB contents.

```bash
cd ~/apps/meal-app
docker compose down -v
docker compose up -d --build --remove-orphans
```

This is useful when Postgres credentials changed and the old volume no longer matches `.env`.

## 9. Backup the Database

Create a backup on the VPS:

```bash
cd ~/apps/meal-app
./scripts/backup-postgres.sh
```

Backups are written to:

```bash
~/apps/meal-app/backups/
```

## 10. Common Problems

### Public URL returns 404, but local Docker checks work

Likely cause:

- host nginx config is wrong or not enabled
- old Cloudflare DNS entries still point somewhere else

Check:

```bash
curl -I http://127.0.0.1/meal-app/
sudo nginx -T
dig +short dominikwn.uk
dig +short www.dominikwn.uk
```

### `curl http://127.0.0.1:8000/health` fails

Likely cause:

- backend container is down or restarting
- Postgres credentials in `.env` do not match the DB volume

Check:

```bash
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 db
cat .env
```

### `unknown directive "sudo"` in nginx

Cause:

- shell commands were pasted into the nginx config file

Fix:

- edit `/etc/nginx/sites-available/dominikwn.uk`
- remove everything except valid nginx directives
- run `sudo nginx -t`

## 11. Current Known-Good State

These are the values that matched the working deployment:

- domain: `dominikwn.uk`
- app path: `/meal-app/`
- backend port: `8000`
- frontend port: `20178`
- frontend base path: `/meal-app/`
- host nginx reverse proxies `/meal-app/` to `127.0.0.1:20178`
- host nginx reverse proxies `/meal-app/api/` to `127.0.0.1:8000`
