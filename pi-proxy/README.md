# Pi Proxy — Residential Scraping Fallback

A lightweight Node.js proxy server that runs on a Raspberry Pi (or any home computer with a residential internet connection). It fetches web pages using realistic browser headers, bypassing Akamai and Cloudflare bot protection that blocks datacenter IPs.

## How it works

1. Your Replit app tries `fetch` → Playwright stealth
2. If both fail (e.g. Target.com.au blocks the datacenter IP), the request is forwarded to this Pi proxy
3. The Pi makes the request from its residential IP, which Akamai has no reason to block
4. Cloudflare Tunnel exposes the Pi securely to the internet without port forwarding

---

## Prerequisites

- Raspberry Pi (any model with 512 MB+ RAM) running Raspberry Pi OS (Bullseye or later), or any Linux/macOS machine on a home connection
- A Cloudflare account (free tier is fine)
- An internet connection on the Pi

---

## Step-by-step setup

### 1. Install Node.js 18+

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # should print v20.x.x or later
```

### 2. Copy the proxy folder to the Pi

**Option A — clone the whole repo:**
```bash
git clone https://github.com/your-org/your-repo.git
cd your-repo/pi-proxy
```

**Option B — copy only the `pi-proxy` folder:**
```bash
scp -r pi-proxy/ pi@raspberrypi.local:~/pi-proxy/
ssh pi@raspberrypi.local
cd ~/pi-proxy
```

### 3. Install dependencies

```bash
npm install
```

### 4. Set the secret API key

Choose a long random string (e.g. `openssl rand -hex 32`) and save it:

```bash
echo 'export PROXY_KEY="your-secret-key-here"' >> ~/.bashrc
source ~/.bashrc
```

Keep this value — you will add it to Replit as `RESIDENTIAL_PROXY_KEY`.

### 5. Test the server manually

```bash
node server.js
# In another terminal:
curl -H "Authorization: Bearer your-secret-key-here" \
  "http://localhost:8080/fetch?url=https://example.com" | head -20
```

You should see the HTML of example.com.

### 6. Install cloudflared (Cloudflare Tunnel)

```bash
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bullseye main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared
```

### 7. Create a Cloudflare Tunnel

```bash
cloudflared tunnel login          # opens browser to authorise
cloudflared tunnel create pi-proxy
```

Note the **Tunnel ID** printed (e.g. `abc123def-...`).

Create the config file:
```bash
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<EOF
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /home/pi/.cloudflared/<YOUR_TUNNEL_ID>.json

ingress:
  - service: http://localhost:8080
EOF
```

Create a public hostname (pick a memorable subdomain):
```bash
cloudflared tunnel route dns pi-proxy pi-proxy.<your-cloudflare-domain>.com
```

Test the tunnel in the foreground (Ctrl-C to stop):
```bash
cloudflared tunnel run pi-proxy
```

Visit `https://pi-proxy.<your-cloudflare-domain>.com/health` — you should get `{"ok":true}`.

Copy the public URL (e.g. `https://pi-proxy.example.com`) — this is your `RESIDENTIAL_PROXY_URL`.

### 8. Add secrets to Replit

In your Replit project, add two secrets:

| Secret name | Value |
|---|---|
| `RESIDENTIAL_PROXY_URL` | `https://pi-proxy.example.com` (no trailing slash) |
| `RESIDENTIAL_PROXY_KEY` | The same value you used for `PROXY_KEY` on the Pi |

### 9. Set up systemd for auto-start on boot

Create a service file for the proxy server:

```bash
sudo tee /etc/systemd/system/pi-proxy.service > /dev/null <<EOF
[Unit]
Description=Pi Residential Proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/pi-proxy
Environment=PROXY_KEY=your-secret-key-here
ExecStart=/usr/bin/node /home/pi/pi-proxy/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

Create a service file for cloudflared:

```bash
sudo cloudflared service install
# This auto-generates /etc/systemd/system/cloudflared.service
```

Enable and start both:

```bash
sudo systemctl daemon-reload
sudo systemctl enable pi-proxy cloudflared
sudo systemctl start pi-proxy cloudflared
sudo systemctl status pi-proxy cloudflared
```

---

## Verifying it works end-to-end

Once the secrets are set in Replit, try adding a Target.com.au product URL via the Stashd UI. The dashboard nav bar will show a "Pi proxy ready" pill (green) when the Pi is reachable.

---

## Security notes

- The `PROXY_KEY` / `RESIDENTIAL_PROXY_KEY` is the only thing standing between the internet and your Pi proxy. Use a long random string (32+ hex characters).
- The Cloudflare Tunnel encrypts traffic end-to-end; nothing is exposed on port 80/443 of the Pi directly.
- The proxy only makes `GET` requests and returns raw HTML — it cannot modify or store data.
- If the Pi is turned off or unreachable, the app silently falls back to manual product entry, exactly as before.
