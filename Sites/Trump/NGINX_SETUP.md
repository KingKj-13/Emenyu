# Nginx Setup

The production reverse proxy template is in:

```text
deploy/nginx/emenuy-trump.conf
```

It includes:

- Reverse proxy to the Node app on `127.0.0.1:3012`
- Socket.IO websocket upgrade support for `/Trump/socket.io`
- Gzip compression
- Static cache headers for frontend/media assets
- Security headers
- Basic rate limiting for general traffic and login attempts
- HTTP to HTTPS redirect
- LetsEncrypt certificate paths

## Install

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

## Configure

```bash
sudo cp deploy/nginx/emenuy-trump.conf /etc/nginx/sites-available/emenuy-trump.conf
sudo nano /etc/nginx/sites-available/emenuy-trump.conf
sudo ln -s /etc/nginx/sites-available/emenuy-trump.conf /etc/nginx/sites-enabled/emenuy-trump.conf
sudo nginx -t
sudo systemctl reload nginx
```

Replace every `your-domain.example` with the live restaurant domain.

## HTTPS

```bash
sudo certbot --nginx -d your-domain.example -d www.your-domain.example
sudo certbot renew --dry-run
```

After HTTPS is active, keep these env values in `.env`:

```bash
TRUMP_PUBLIC_ORIGIN=https://your-domain.example
TRUMP_ALLOWED_ORIGINS=https://your-domain.example
TRUMP_TRUST_PROXY=true
TRUMP_SECURE_COOKIES=true
TRUMP_HSTS_ENABLED=true
```

## Compatibility Checks

```bash
curl -I https://your-domain.example/Trump/table1
curl -fsS https://your-domain.example/healthz
curl -fsS https://your-domain.example/readyz
```

For websocket verification, open the customer, admin, and waiter pages in the browser and confirm the network tab shows a successful Socket.IO connection on `/Trump/socket.io`.

