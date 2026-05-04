# Pi setup — beginner guide

This guide walks you through **(1)** preparing a Raspberry Pi and **(2)** connecting it to **Stashd** so the app can scrape some shops through your home internet when the cloud server is blocked.

If you already know Linux and tunnels, you can use the shorter technical reference: [`README.md`](./README.md) in this same folder.

---

## What you are setting up

1. A tiny **proxy program** runs on your Pi. It fetches web pages using your **home IP** (looks like a normal house, not a datacenter).
2. **Cloudflare Tunnel** gives that program a **public HTTPS address** so Stashd’s server can call it safely — no opening ports on your router.
3. You copy one **secret password** onto the Pi and into Stashd’s settings. Only requests with that password can use your Pi.

Nothing here replaces your Firebase login or your `.env` keys for the app itself — this is **only** the optional “residential proxy” piece.

---

## Before you start — checklist

| You need | Notes |
|----------|--------|
| Raspberry Pi | **Pi 3 Model B+** with **Raspberry Pi OS (64-bit)** is a good match for this guide (same steps as Pi 4/5). Pi 3 or newer is comfortable in general; Pi Zero 2 can work with patience. |
| microSD card | 16 GB+ recommended. |
| Power supply | Official or known-good USB-C (Pi 4/5) or micro-USB (older). |
| Ethernet **or** Wi‑Fi | Ethernet is simpler for first setup. |
| Another computer | To flash the SD card and to SSH into the Pi. |
| Free Cloudflare account | For the tunnel. You’ll add a domain you control **or** use Cloudflare’s quick tunnel style flows — the detailed README uses a hostname on a domain in Cloudflare. |
| Your Stashd repo | To copy the `pi-proxy` folder, or to know your Git URL if you clone on the Pi. |

**Pi 3 B+ (64-bit) in practice:** Node, `pi-proxy`, and `cloudflared` all run on **aarch64**. First boot, `apt full-upgrade`, and `npm install` are slower than on a Pi 4 or 5—wait them out; use Ethernet if you can for fewer Wi‑Fi timeouts.

---

## Part 1 — Raspberry Pi: first boot

### Step 1 — Install Raspberry Pi OS

1. On your PC or Mac, install **[Raspberry Pi Imager](https://www.raspberrypi.com/software/)**.
2. Open Imager → **Choose OS** → pick **Raspberry Pi OS (64-bit)** or **(32-bit)** (64-bit is fine on Pi 3+).
3. **Choose storage** → your microSD card.
4. Click the **gear icon** (OS customisation) before **Write**:
   - Set a **hostname** (e.g. `mypi` — you’ll use `mypi.local` on your network).
   - Enable **SSH** and choose password authentication (or keys if you know how).
   - Set **username / password** (examples below use username `pi` — if you pick another name, replace `pi` in paths like `/home/pi/...`).
   - Configure **Wi‑Fi** if you are not using Ethernet.
5. **Write**, wait until finished, eject the card, put it in the Pi, power on.

### Step 2 — Find the Pi on your network

- Wait a minute after power-on.
- From your other computer, open a terminal and try:

  ```bash
  ssh pi@mypi.local
  ```

  (Use your hostname and username.)

- If that fails, check your router’s “connected devices” list for the Pi’s IP and run `ssh pi@192.168.x.x`.

### Step 3 — Update the Pi (recommended)

After you can SSH in:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo reboot
```

SSH in again after the reboot.

---

## Part 2 — Put the proxy code on the Pi

You only need the **`pi-proxy`** folder from this project.

### Option A — Clone the full Stashd repo (good if you use Git)

```bash
cd ~
git clone <YOUR_STASHD_REPO_URL> stashd
cd stashd/pi-proxy
```

Replace `<YOUR_STASHD_REPO_URL>` with your real Git URL.

### Option B — Copy the folder from your PC (no Git on Pi)

On **your PC** (in the folder that contains `pi-proxy`):

```bash
scp -r pi-proxy/ pi@mypi.local:~/pi-proxy/
```

Then on the Pi:

```bash
cd ~/pi-proxy
```

From here on, this guide assumes your proxy lives at **`~/pi-proxy`**. If yours is different, adjust paths.

---

## Part 3 — Install Node.js

The proxy needs **Node.js 18+**. On the Pi:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
```

You should see **v20.x.x** (or newer). If `curl` fails, check the Pi’s internet connection first.

Install dependencies for the proxy:

```bash
cd ~/pi-proxy
npm install
```

---

## Part 4 — Create a secret key (password for the proxy)

Think of this as a **long random password** shared between the Pi and Stashd.

On the Pi:

```bash
openssl rand -hex 32
```

Copy the output somewhere safe (password manager or notes). Example: `a1b2c3d4...` (64 hex characters).

For a quick manual test, export it for this terminal session:

```bash
export PROXY_KEY="paste-the-long-string-here"
```

**Important:** You will use **the same string** later as `RESIDENTIAL_PROXY_KEY` on the machine that runs Stashd’s `server/proxy.js`.

---

## Part 5 — Run the proxy once (sanity check)

Still in `~/pi-proxy` with `PROXY_KEY` set:

```bash
node server.js
```

You should see the server start (default port **8080**). Leave it running.

**Second terminal** on the Pi (or SSH session):

```bash
curl -H "Authorization: Bearer paste-the-same-PROXY_KEY-here" \
  "http://localhost:8080/fetch?url=https://example.com" | head -20
```

If you see HTML, the proxy works. Press **Ctrl+C** in the first terminal to stop the server when you’re done testing.

---

## Part 6 — Cloudflare Tunnel (public HTTPS URL)

This is the fiddliest part. Goal: a URL like `https://pi-proxy.yourdomain.com` that reaches `http://localhost:8080` on your Pi.

1. **Cloudflare account** — sign up at [cloudflare.com](https://www.cloudflare.com/).
2. **Domain** — add a domain you own to Cloudflare and point its nameservers to Cloudflare (Cloudflare’s onboarding explains this).
3. On the Pi, install **cloudflared** — follow [Cloudflare’s current Linux install docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) if the commands below fail (OS codenames change over time).

   Example (often works on Raspberry Pi OS based on Debian **Bookworm** or **Bullseye**):

   ```bash
   curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
   echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
   sudo apt update && sudo apt install -y cloudflared
   ```

   If `bookworm` fails, try `bullseye` in that `deb` line, or use Cloudflare’s download page.

4. Log in and create a tunnel (run on the Pi):

   ```bash
   cloudflared tunnel login
   cloudflared tunnel create pi-proxy
   ```

   Note the **Tunnel ID** it prints.

5. Create **`~/.cloudflared/config.yml`** (replace placeholders):

   ```yaml
   tunnel: YOUR_TUNNEL_ID
   credentials-file: /home/pi/.cloudflared/YOUR_TUNNEL_ID.json

   ingress:
     - service: http://localhost:8080
   ```

6. Create a DNS route (pick a subdomain you like):

   ```bash
   cloudflared tunnel route dns pi-proxy pi-proxy.yourdomain.com
   ```

7. **Test in the foreground** — start your Node proxy again (`export PROXY_KEY=...` then `node server.js`), then in another terminal:

   ```bash
   cloudflared tunnel run pi-proxy
   ```

8. In a browser on any device, open:

   `https://pi-proxy.yourdomain.com/health`

   You want a small JSON response like `{"ok":true}`.

Copy that base URL **without a trailing slash** — this becomes **`RESIDENTIAL_PROXY_URL`** for Stashd (e.g. `https://pi-proxy.yourdomain.com`).

For **systemd** so Node + tunnel survive reboots, follow **Step 9** in [`README.md`](./README.md) (same machine paths; keep `PROXY_KEY` consistent).

---

## Part 7 — Connect Stashd to the Pi

Stashd’s scrape logic runs in **`server/proxy.js`**. Wherever you run that process (local dev, VPS, etc.), set these **environment variables**:

| Variable | What to put |
|----------|-------------|
| `RESIDENTIAL_PROXY_URL` | Your tunnel URL, e.g. `https://pi-proxy.yourdomain.com` (no `/` at the end) |
| `RESIDENTIAL_PROXY_KEY` | **Exactly** the same string as `PROXY_KEY` on the Pi |

### Local development (two terminals)

From the **Stashd project root** on your PC:

1. Terminal A — app:

   ```bash
   npm run dev
   ```

2. Terminal B — scrape proxy, **with** the two variables (PowerShell example):

   ```powershell
   $env:RESIDENTIAL_PROXY_URL="https://pi-proxy.yourdomain.com"
   $env:RESIDENTIAL_PROXY_KEY="your-same-secret-as-pi"
   node server/proxy.js
   ```

   On macOS/Linux with bash:

   ```bash
   export RESIDENTIAL_PROXY_URL="https://pi-proxy.yourdomain.com"
   export RESIDENTIAL_PROXY_KEY="your-same-secret-as-pi"
   node server/proxy.js
   ```

You can also add those lines to a root **`.env`** if your setup loads env for `node server/proxy.js` — see `.env.example` in the repo for the variable names.

**Restart** the proxy process after changing env vars.

### What you should see in the app

When the Pi tunnel is up and the keys match, the dashboard can show a **green** “Pi ready” style status. If something is wrong, you may see “not set up” or “offline” — use that as a hint while troubleshooting.

---

## Part 8 — One command after reboot (systemd)

Use **systemd** so you do not need two SSH terminals every time. After this, **one command** starts both services, and they can **start automatically on boot**.

**Before you begin:** stop any manual **`node server.js`** and **`cloudflared tunnel run`** (Ctrl+C in those terminals). If you ever ran **`sudo cloudflared service install`**, disable the default service so it does not fight this setup:

```bash
sudo systemctl disable --now cloudflared 2>/dev/null || true
```

Replace **`YOUR_LINUX_USER`** with your Pi login (e.g. `peezapp`). Replace **`/home/YOUR_LINUX_USER/Stashd/pi-proxy`** if your clone lives elsewhere. Replace **`PASTE_YOUR_PROXY_KEY`** with the same value as **`RESIDENTIAL_PROXY_KEY`** on Stashd. Replace **`pi-proxy`** in `ExecStart` if your tunnel has a different name.

**1 — Node proxy service**

```bash
sudo tee /etc/systemd/system/stashd-pi-proxy.service > /dev/null <<'EOF'
[Unit]
Description=Stashd Pi residential proxy (Node)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=YOUR_LINUX_USER
Group=YOUR_LINUX_USER
WorkingDirectory=/home/YOUR_LINUX_USER/Stashd/pi-proxy
Environment=PROXY_KEY=PASTE_YOUR_PROXY_KEY
ExecStart=/usr/bin/node /home/YOUR_LINUX_USER/Stashd/pi-proxy/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

**2 — Cloudflare tunnel service** (runs as your user so it keeps using **`~/.cloudflared/config.yml`**)

```bash
sudo tee /etc/systemd/system/stashd-cloudflared.service > /dev/null <<'EOF'
[Unit]
Description=Cloudflare Tunnel (Stashd Pi)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=YOUR_LINUX_USER
Group=YOUR_LINUX_USER
ExecStart=/usr/bin/cloudflared tunnel run pi-proxy
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

If you pasted those templates **literally**, open each unit and replace the placeholders before starting:

```bash
sudo nano /etc/systemd/system/stashd-pi-proxy.service
sudo nano /etc/systemd/system/stashd-cloudflared.service
```

Set **`YOUR_LINUX_USER`**, **`PASTE_YOUR_PROXY_KEY`**, and (if needed) the tunnel name **`pi-proxy`** in the `ExecStart` line of the Cloudflare unit.

**3 — Reload, enable on boot, start now**

```bash
sudo systemctl daemon-reload
sudo systemctl enable stashd-pi-proxy stashd-cloudflared
sudo systemctl start stashd-pi-proxy stashd-cloudflared
sudo systemctl status stashd-pi-proxy stashd-cloudflared
```

**One command** whenever you want to start both after a manual stop:

```bash
sudo systemctl start stashd-pi-proxy stashd-cloudflared
```

**One command** to stop both:

```bash
sudo systemctl stop stashd-pi-proxy stashd-cloudflared
```

After a **reboot**, both should come up on their own if you ran **`enable`**. Check logs with:

```bash
journalctl -u stashd-pi-proxy -u stashd-cloudflared -n 50 --no-pager
```

---

## Part 9 — Quick troubleshooting

| Problem | Things to try |
|--------|----------------|
| `ssh pi@...` fails | Confirm hostname/IP; same Wi‑Fi as Pi; SSH enabled in Imager. |
| `node: command not found` | Re-run Node install steps; open a new SSH session. |
| Proxy exits: `PROXY_KEY ... required` | Export `PROXY_KEY` or set it in systemd — see README. |
| `curl` to Pi returns 401/403 | `Authorization: Bearer` must match `PROXY_KEY` exactly (no extra spaces). |
| `/health` works in browser but Stashd says offline | Wrong URL, typo in key, or scrape proxy not restarted with new env. |
| Tunnel errors | Confirm `config.yml` tunnel ID and credentials path; Pi clock correct (`timedatectl`). |

---

## Summary

1. Pi runs **Node** + **`pi-proxy`** with **`PROXY_KEY`**.  
2. **cloudflared** exposes it as **`RESIDENTIAL_PROXY_URL`**.  
3. Stashd’s **`server/proxy.js`** gets **`RESIDENTIAL_PROXY_URL`** + **`RESIDENTIAL_PROXY_KEY`**.  

For alternate examples (default `pi` user and `~/pi-proxy`), see [`README.md`](./README.md) step 9. Prefer **Part 8** in this file for the **`stashd-*`** service names and a single **`systemctl start …`** workflow.
