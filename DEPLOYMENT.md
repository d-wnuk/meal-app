# Meal App Deployment Guide

This project is ready to deploy to a Linux VPS with Docker Compose.

## 1. Prepare Git and GitHub

Run these commands locally from the project root:

```bash
git init
git branch -M main
git add .
git commit -m "Initial deployment-ready setup"
```

Create a GitHub repository named `meal-app`, then connect and push it:

```bash
git remote add origin git@github.com:<your-user>/meal-app.git
git push -u origin main
```

## 2. Audit the VPS

SSH into the server and verify the basics:

```bash
uname -a
cat /etc/os-release
docker --version
docker compose version
ss -tulpn | grep -E ':80|:443'
df -h
```

If Docker is missing, install Docker Engine and the Docker Compose plugin before continuing.

## 3. Clone the App on the VPS

```bash
mkdir -p ~/apps
cd ~/apps
git clone git@github.com:<your-user>/meal-app.git
cd meal-app
cp .env.example .env
```

Edit `.env` on the VPS and set strong production values:

```dotenv
POSTGRES_USER=meal_app
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=meals
DATABASE_URL=postgresql://meal_app:<strong-password>@db:5432/meals
BACKEND_PORT=8000
FRONTEND_PORT=20178
APP_DOMAIN=<your-domain>
```

If you ever change `POSTGRES_USER`, `POSTGRES_PASSWORD`, or `POSTGRES_DB` after the database volume has already been initialized, the new values will not rewrite the existing Postgres role/database automatically. On a brand-new VPS this is not an issue. On an existing install, either keep the old credentials or migrate/reset the Postgres volume intentionally.

## 4. Start the App

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100
```

The app containers stay bound to `127.0.0.1`, so they are reachable only from the VPS itself. Public traffic should go through the reverse proxy on the host.

## 5. Configure nginx on the VPS

Copy `deploy/nginx/meal-app.conf.example` to your nginx sites directory and replace `example.com` with your real domain.

Example for Debian/Ubuntu:

```bash
sudo cp deploy/nginx/meal-app.conf.example /etc/nginx/sites-available/meal-app
sudo nano /etc/nginx/sites-available/meal-app
sudo ln -s /etc/nginx/sites-available/meal-app /etc/nginx/sites-enabled/meal-app
sudo nginx -t
sudo systemctl reload nginx
```

## 6. Cloudflare and DNS

Before enabling HTTPS, confirm the domain resolves to the VPS:

```bash
dig AAAA <your-domain> +short
curl -I http://<your-domain>
```

Use Cloudflare in `DNS only` mode while issuing the first Let's Encrypt certificate. After HTTPS works, you can switch Cloudflare proxying on if you want.

## 7. Enable HTTPS

Install Certbot and issue the certificate after port `80` is reachable:

```bash
sudo certbot --nginx -d <your-domain>
```

Then verify:

```bash
curl -I https://<your-domain>
curl https://<your-domain>/api/health
```

## 8. Deploy Updates

Each time you want to deploy:

```bash
cd ~/apps/meal-app
./scripts/deploy.sh
```

That script pulls the latest code and rebuilds the containers.

## 9. Back Up the Database

Run this on the VPS whenever you want a SQL backup:

```bash
cd ~/apps/meal-app
./scripts/backup-postgres.sh
```

Backups are written to the local `backups/` directory.

## 10. Basic Post-Deploy Checks

```bash
docker compose ps
docker compose logs --tail=100 backend frontend db
curl https://<your-domain>/api/health
```

Also open the app in a browser and confirm the main flow works.
