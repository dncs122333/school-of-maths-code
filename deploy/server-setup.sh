#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server. Run as root:
#
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/deploy/server-setup.sh -o setup.sh
#   REPO_URL=git@github.com:<owner>/<repo>.git API_DOMAIN=api.example.com bash setup.sh
#
# Afterwards follow the "next steps" it prints. Safe to run again.
set -euo pipefail

: "${REPO_URL:?Set REPO_URL to the git clone address}"
: "${API_DOMAIN:?Set API_DOMAIN, for example api.example.com}"

DEPLOY_USER=deploy
STATE_DIR=/opt/som
APP_DIR="$STATE_DIR/app"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git ufw unattended-upgrades fail2ban

# Security updates install themselves
dpkg-reconfigure -f noninteractive unattended-upgrades

# Docker
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# Swap, so a memory spike during an image build or PDF watermarking slows things down instead of killing them
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf
  sysctl --system >/dev/null
fi

# Non-root user for logins and deploys, using the keys already installed for root
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
if [ -f /root/.ssh/authorized_keys ]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi

# Passwords off for SSH. Only once a key is confirmed in place, or this would lock everyone out.
if [ -s "/home/$DEPLOY_USER/.ssh/authorized_keys" ]; then
  cat > /etc/ssh/sshd_config.d/99-som.conf <<'EOF'
PasswordAuthentication no
PermitRootLogin no
EOF
  systemctl reload ssh
else
  echo "No SSH key found for $DEPLOY_USER: password login left on. Add a key and run this again." >&2
fi

# Firewall: web and SSH only. Note Docker's published ports (80, 443) bypass ufw, so they're open regardless;
# the backend itself publishes no port, so it's reachable only through Caddy.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# App folders. Secrets stay outside the git checkout.
install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$STATE_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u "$DEPLOY_USER" git clone "$REPO_URL" "$APP_DIR" || {
    echo "Clone failed. Add this server's deploy key to the GitHub repo, then run this script again:" >&2
    [ -f "/home/$DEPLOY_USER/.ssh/id_ed25519" ] || sudo -u "$DEPLOY_USER" ssh-keygen -q -t ed25519 -N "" -f "/home/$DEPLOY_USER/.ssh/id_ed25519"
    sudo -u "$DEPLOY_USER" ssh-keyscan -H github.com >> "/home/$DEPLOY_USER/.ssh/known_hosts" 2>/dev/null
    cat "/home/$DEPLOY_USER/.ssh/id_ed25519.pub" >&2
    exit 1
  }
fi
if [ ! -f "$STATE_DIR/.env.compose" ]; then
  echo "API_DOMAIN=$API_DOMAIN" > "$STATE_DIR/.env.compose"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$STATE_DIR/.env.compose"
fi
if [ ! -f "$STATE_DIR/.env" ]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR/deploy/env.production.example" "$STATE_DIR/.env"
fi

# Nightly backup at 02:00 India time, logged to a file
timedatectl set-timezone Asia/Kolkata
cat > /etc/cron.d/som-backup <<EOF
0 2 * * * $DEPLOY_USER $APP_DIR/deploy/backup.sh >> $STATE_DIR/backup.log 2>&1
EOF
cat > /etc/logrotate.d/som-backup <<EOF
$STATE_DIR/backup.log {
  monthly
  rotate 6
  compress
  missingok
  notifempty
}
EOF

cat <<EOF

Server is ready. Next steps:
  1. Fill in the secrets:  sudo -u $DEPLOY_USER nano $STATE_DIR/.env
  2. First deploy:         sudo -u $DEPLOY_USER $APP_DIR/deploy/deploy.sh --force
  3. In Atlas, allow only this server's IP address.
  4. In Cloudflare, point $API_DOMAIN at this server (proxied) and set SSL mode to Full (strict).
EOF
