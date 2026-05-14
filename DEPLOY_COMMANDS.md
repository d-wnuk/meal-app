# Deployment Commands

This file is for routine deployments after the VPS and nginx are already set up.

Current target:

- Public URL: `https://dominikwn.uk/meal-app/`
- VPS app directory: `~/apps/meal-app`

## 1. Push code from your laptop

```bash
git add .
git commit -m "Describe the change"
git push origin main
```

What this does:

- `git add .` stages your local changes.
- `git commit -m "..."` creates a local commit with your changes.
- `git push origin main` sends the new commit to GitHub so the VPS can pull it.

## 2. Connect to the VPS

```bash
ssh root@your-server-ip
```

What this does:

- Opens a shell on the VPS where the app is deployed.

## 3. Go to the app directory

```bash
cd ~/apps/meal-app
```

What this does:

- Moves into the cloned project directory on the VPS.

## 4. Pull the newest code

```bash
git pull
```

What this does:

- Downloads the newest commits from GitHub and updates the VPS copy of the repo.

## 5. Rebuild and restart the containers

```bash
docker compose up -d --build --remove-orphans
```

What this does:

- `up` starts the services.
- `-d` runs them in the background.
- `--build` rebuilds images so code changes are included.
- `--remove-orphans` removes old leftover containers that are no longer part of the current Compose config.

This is the main deployment command you will use most often.

## 6. Check whether the containers are running

```bash
docker compose ps
```

What this does:

- Shows the current state of `backend`, `frontend`, and `db`.
- Confirms that expected ports are bound.

Healthy result should look roughly like:

- backend on `127.0.0.1:8000`
- frontend on `127.0.0.1:20178`
- db running internally

## 7. Check backend health

```bash
curl http://127.0.0.1:8000/health
```

What this does:

- Confirms that the backend container is reachable on the VPS host.

Expected result:

```json
{"status":"ok"}
```

## 8. Check frontend container directly

```bash
curl -I http://127.0.0.1:20178/
```

What this does:

- Confirms that the frontend container is serving the built app.

Expected result:

- `HTTP/1.1 200 OK`

## 9. Check the nginx route on the VPS

```bash
curl -I http://127.0.0.1/meal-app/
curl http://127.0.0.1/meal-app/api/health
```

What this does:

- Verifies that host nginx is routing `/meal-app/` to the frontend container.
- Verifies that host nginx is routing `/meal-app/api/` to the backend container.

Expected results:

- `/meal-app/` returns `200 OK`
- `/meal-app/api/health` returns `{"status":"ok"}`

## 10. Check the public site

```bash
curl -I https://dominikwn.uk/meal-app/
curl https://dominikwn.uk/meal-app/api/health
```

What this does:

- Verifies that the public domain, Cloudflare, nginx, and containers all work together.

Expected results:

- app URL returns `200 OK`
- health endpoint returns `{"status":"ok"}`

## 11. See logs if something is broken

```bash
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
docker compose logs --tail=100 db
```

What this does:

- Shows recent logs for each service.
- Helps find startup failures, bad env values, DB auth errors, and frontend build/runtime issues.

## 12. Restart without rebuilding

```bash
docker compose restart
```

What this does:

- Restarts the running containers without rebuilding images.

Use this only when:

- config outside the image changed and rebuild is not needed, or
- you want a quick restart for troubleshooting.

## 13. Stop the app

```bash
docker compose down
```

What this does:

- Stops and removes the running containers and network.
- Keeps the database volume intact.

## 14. Reset the database volume

```bash
docker compose down -v
docker compose up -d --build --remove-orphans
```

What this does:

- Removes the Postgres volume and all database data.
- Recreates the DB from scratch on next start.

Use this only when:

- you do not need the current DB data, and
- Postgres credentials or DB initialization got out of sync.

## 15. Make a database backup

```bash
./scripts/backup-postgres.sh
```

What this does:

- Dumps the Postgres database and stores a compressed backup in `backups/`.

## 16. Check which process is using a blocked port

```bash
sudo ss -tulpn | grep 20178
docker ps --format 'table {{.Names}}	{{.Ports}}'
```

What this does:

- Shows which process or container is already using a port.
- Helps when Docker reports `port is already allocated`.

## 17. Test nginx config after editing it

```bash
sudo nginx -t
sudo systemctl reload nginx
```

What this does:

- `nginx -t` checks whether the nginx config syntax is valid.
- `systemctl reload nginx` applies the new config without stopping the service.

## 18. Quick deployment checklist

Run these in order on a normal release:

```bash
# laptop
git add .
git commit -m "Describe the change"
git push origin main

# VPS
ssh root@your-server-ip
cd ~/apps/meal-app
git pull
docker compose up -d --build --remove-orphans
docker compose ps
curl http://127.0.0.1:8000/health
curl http://127.0.0.1/meal-app/api/health
curl -I https://dominikwn.uk/meal-app/
```

## 19. Most common failure patterns

### Backend health fails on `127.0.0.1:8000`

Likely cause:

- backend container crashed
- database credentials in `.env` do not match the existing Postgres volume

Use:

```bash
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 db
```

### `127.0.0.1:20178` works, but `127.0.0.1/meal-app/` does not

Likely cause:

- nginx config is missing, wrong, or not enabled

Use:

```bash
sudo nginx -t
sudo nginx -T
```

### Public site fails, but `127.0.0.1/meal-app/` works

Likely cause:

- Cloudflare DNS points somewhere else
- old DNS records still exist

Use:

```bash
dig +short dominikwn.uk
dig +short www.dominikwn.uk
```
