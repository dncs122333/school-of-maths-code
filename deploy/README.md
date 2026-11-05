# Launch steps

The plan and costs are in [docs/DEPLOYMENT_PLAN.md](../docs/DEPLOYMENT_PLAN.md). This page is the order to do things in. `<domain>` is your domain.

## 1. Accounts (about half a day)

1. **Domain:** buy it and move its DNS to Cloudflare.
2. **MongoDB Atlas:** create a free M0 cluster on AWS Mumbai, and a database user with read/write on `vidya_prod` only. Keep the connection string.
3. **Cloudflare R2:** create private buckets `som-files` and `som-backups`, plus an API token with Object Read & Write on those two.
4. **Brevo:** create an account, verify your sender address or domain, and create an API key.
5. **Sentry (optional):** create one backend and one frontend project.
6. **Server:** create a 2 GB Ubuntu 24.04 server in Bangalore or Mumbai, with your SSH key.

## 2. Server

```bash
curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/deploy/server-setup.sh -o setup.sh
```

```bash
REPO_URL=git@github.com:<owner>/<repo>.git API_DOMAIN=api.<domain> bash setup.sh
```

If the repo is private, the script prints a deploy key the first time. Add it to the GitHub repo (read-only) and run the script again.

Then, as the `deploy` user, fill in the secrets in `/opt/som/.env` and run the first deploy:

```bash
/opt/som/app/deploy/deploy.sh --force
```

In the logs, check for `Object storage: S3 bucket 'som-files'` and `Storage initialized`, and that no line starts with a configuration warning.

In Atlas, under Network Access, allow only this server's IP address.

## 3. Cloudflare

1. Create a DNS `A` record, `api`, pointing at the server, proxied. Set SSL/TLS mode to **Full (strict)**.
2. Create a Pages project from the repo: root directory `frontend`, build command `yarn build`, output `build`, production branch `main`.
3. Set build variables: `REACT_APP_BACKEND_URL=https://api.<domain>` and `REACT_APP_CONTACT_EMAIL=<real address>`. `REACT_APP_SENTRY_DSN` is optional.
4. Add the custom domain `app.<domain>` to the Pages project.
5. Check `https://api.<domain>/api/health` shows `"database":"up"` and the app opens at `https://app.<domain>`.

## 4. Automatic checks and deploys

In the GitHub repo settings:

- Secret `MONGO_URL_CI`: the dev cluster's connection string (CI uses and empties a database called `vidya_ci`).
- To turn on backend deploys: variable `DEPLOY_ENABLED=true`, plus secrets `DEPLOY_HOST`, `DEPLOY_SSH_KEY` (a key allowed on the `deploy` user) and `DEPLOY_KNOWN_HOSTS` (from `ssh-keyscan <server-ip>`).
- Protect `main` so pull requests need the `backend` and `frontend` checks to pass.

## 5. Before students arrive

- Uploads: if you're carrying over existing notes, set the `S3_*` variables locally and run `backend/scripts/migrate_to_r2.py --dry-run`, then without `--dry-run`.
- Backups: run `/opt/som/app/deploy/backup.sh` once, then restore it to check it works:
  ```bash
  docker compose --env-file /opt/som/.env.compose -f /opt/som/app/docker-compose.prod.yml exec backend python scripts/restore_db.py --from-bucket <file-name> --target-db vidya_restore_check
  ```
  Then drop `vidya_restore_check` in Atlas. Repeat monthly.
- Rehearsal: run through the walk-through in section 6 of the plan on a cheap Android phone, plus a 150-student load test.
- Admin: log in, change the password, and remove `ADMIN_PASSWORD` from `/opt/som/.env`.
- Legal: have the Privacy Policy and Terms (`frontend/src/pages/Legal.js`) reviewed. They name DigitalOcean, so update them if you pick another provider.

## Everyday use

- **Deploy:** merge to `main`. The frontend goes live by itself. The backend deploys through CI, or run `deploy/deploy.sh`. It refuses while a class test has time left; `--force` overrides that.
- **Roll back the frontend:** Cloudflare Pages → Deployments → Rollback.
- **Roll back the backend:** a failed health check rolls back automatically. To do it by hand, `git revert` the bad commit and deploy.
- **Forgotten admin password:** set `ADMIN_PASSWORD` and `ADMIN_PASSWORD_RESET=1` in `/opt/som/.env`, run `deploy.sh --force`, log in, then remove both.
- **Erase a student's data:** as admin, in Batches, use **Erase data** on the student. Backups age out within 30 days.

## Not tested yet

These couldn't be run during development, because they need Docker or real accounts. Expect to catch small problems in them during the rehearsal:

- Docker image builds, `docker-compose.prod.yml` and the Caddyfile (including getting a certificate behind Cloudflare, and the real student IP passing through).
- `server-setup.sh`, `deploy.sh` and `backup.sh` on a real server. Only their shell syntax has been checked.
- The GitHub Actions workflow.
- Real sends through Brevo, real uploads to R2, and real Sentry reports. The code paths for Brevo and R2 were tested against stand-ins.
