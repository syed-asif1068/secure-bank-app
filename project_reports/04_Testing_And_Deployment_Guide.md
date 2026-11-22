# SecureBank — Testing & Deployment Guide

> **Project:** SecureBank — a secure multi-page banking web application
> **Stack:** HTML/CSS/JavaScript + Bootstrap 5 → Java 17 + Spring Boot 3.3.5 (Docker) → Supabase PostgreSQL
> **Hosting:** Backend on Render.com (Docker Web Service) + Frontend on Cloudflare Pages
> **Purpose:** Record the successful end-to-end test and provide an exact, repeatable deployment runbook with production secrets kept outside Git.

---

## 0. Hinglish Quick Revision

- **Secrets Git mein nahi:** Database URL aur JWT secret ab environment variables se aate hain. `application.properties` mein sirf local fallback hai.
- **Render:** GitHub repo connect karo → Docker service banao → `DB_URL` aur `JWT_SECRET` env vars set karo → deploy.
- **Cloudflare Pages:** Static `frontend/` folder ko host karta hai. `frontend/js/app.js` ka `API_BASE` Render URL par point karna zaroori hai.
- **PORT:** Render apna `PORT` env var deta hai. Isliye `server.port=${PORT:8080}` use kiya hai; local par 8080, Render par Render ka diya hua port.
- **E2E test:** Do accounts, har ek ko $5,000 welcome balance. $4,000 transfer ke baad sender $1,000 aur receiver $9,000. Supabase mein BCrypt hash aur ledger row verify hui.
- **Interview line:** “Configuration is environment-specific, secrets are injected at runtime, and money movement is verified at both the API and database layers.”

---

## 1. Deployment Changes at a Glance

| File | Change | Why it matters |
|---|---|---|
| `backend/src/main/resources/application.properties` | `DB_URL`, `JWT_SECRET`, and `PORT` placeholders with local fallbacks | No production secret needs to be edited in source; Render injects real values |
| `backend/Dockerfile` | Multi-stage build with `eclipse-temurin:17-jdk-alpine` and Maven Wrapper | Render can build and run the Spring Boot JAR without a pre-installed JDK |
| `backend/.dockerignore` | Excludes `target/`, IDE files, and logs from the Docker build context | Smaller, faster, cleaner Render builds |
| `.gitignore` | Ignores `backend/target/`, `.idea/`, `.vscode/`, OS temp files, logs, and `.env` files | Keeps generated files and secrets out of GitHub |
| `.gitattributes` | Forces LF endings for `mvnw`, shell scripts, properties, and Dockerfile | Prevents `bad interpreter` / CRLF failures inside Alpine Linux |
| `frontend/_redirects` | Redirects `/` to `/login.html` with HTTP 200 | Cloudflare Pages has no `index.html`; this makes the root URL work |
| `project_reports/04_Testing_And_Deployment_Guide.md` | This document | Test evidence plus the deployment runbook |

### 1.1 Environment variables

| Variable | Required in production? | Local fallback | Purpose |
|---|---|---|---|
| `DB_URL` | Yes | Supabase Session Pooler JDBC URL | Full PostgreSQL JDBC URL including user, password, and `sslmode=require` |
| `JWT_SECRET` | Yes | Development-only Base64 secret | HS256 signing key; must be at least 256 bits (32 random bytes) |
| `PORT` | Set automatically by Render | `8080` | HTTP port the Spring Boot embedded server binds to |

### 1.2 Final `application.properties`

```properties
server.port=${PORT:8080}

spring.datasource.url=${DB_URL:jdbc:postgresql://aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?user=postgres.zxespjfhfxvhnioudvxt&password=<LOCAL_DB_PASSWORD>&sslmode=require}
spring.datasource.driver-class-name=org.postgresql.Driver

spring.jpa.hibernate.ddl-auto=validate
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect
spring.jpa.properties.hibernate.format_sql=true
spring.jpa.open-in-view=false

jwt.secret=${JWT_SECRET:<LOCAL_BASE64_SECRET>}
jwt.expiration=86400000
```

> The real local fallback values are present in the file for developer convenience. They are **not** used on Render because environment variables take precedence.

### 1.3 How Spring resolves `${VAR:default}`

Spring Boot checks the environment first, then falls back to the text after the colon:

```text
${DB_URL:jdbc:postgresql://...}
   │        │
   │        └── used only when DB_URL is not set (local development)
   └── environment variable name
```

This gives one artifact that works in every environment:

| Environment | `DB_URL` source | `JWT_SECRET` source | `PORT` source |
|---|---|---|---|
| Local IDE / Maven | Fallback in `application.properties` | Fallback in `application.properties` | Fallback `8080` |
| Render Docker service | Render environment variable | Render environment variable | Render-provided `PORT` |
| Future CI/test environment | CI secret store | CI secret store | Default `8080` or test port |

---

## 2. End-to-End Test Report

### 2.1 Objective

Verify that a real user journey works across all three tiers:

1. Register two separate customers.
2. Confirm the $5,000.00 welcome balance is applied to both.
3. Transfer $4,000.00 from the sender to the receiver.
4. Confirm the sender has $1,000.00 and the receiver has $9,000.00.
5. Confirm the ledger row was written.
6. Confirm passwords are stored as BCrypt hashes in Supabase, never as plaintext.

### 2.2 Test environment

| Component | Configuration |
|---|---|
| Backend | Spring Boot 3.3.5, Java 17, running on `http://localhost:8080` |
| Frontend | Static HTML/CSS/JS served locally, calling `http://localhost:8080/api` |
| Database | Supabase PostgreSQL via Session Pooler, `sslmode=require` |
| Authentication | JWT Bearer token + BCrypt password verification |
| Database schema | `public.users`, `public.transactions`, `ddl-auto=validate` |
| Result | **PASS** |

### 2.3 Test data

| Account | Role in test | Starting balance | Transfer | Final balance |
|---|---|---|---:|---:|---:|
| Account A | Sender | $5,000.00 | −$4,000.00 | **$1,000.00** |
| Account B | Receiver | $5,000.00 | +$4,000.00 | **$9,000.00** |
| **Total** | — | **$10,000.00** | **$0.00 net** | **$10,000.00** |

> Account numbers are intentionally not repeated in this report. Both were unique `SB` + 8-digit identifiers generated by the backend.

### 2.4 Test steps and observed results

| # | Action | Expected result | Observed result | Status |
|---|---|---|---|---|
| 1 | Register Account A through `POST /api/auth/register` | Account created; balance `5000.00`; JWT returned | Account created; dashboard showed `$5,000.00` | PASS |
| 2 | Log out and register Account B | Second unique account; balance `5000.00` | Account created; dashboard showed `$5,000.00` | PASS |
| 3 | Log in as Account A | JWT issued; protected dashboard loads | Login succeeded; profile and balance loaded | PASS |
| 4 | Transfer `4000.00` from Account A to Account B's account number | `200 OK`; message `Transfer successful`; sender balance `1000.00` | Transfer succeeded; sender balance showed `$1,000.00` | PASS |
| 5 | Log in as Account B and view dashboard/profile | Receiver balance `9000.00` | Receiver balance showed `$9,000.00` | PASS |
| 6 | Open passbook/history for both accounts | One `DEBIT` row for A and one `CREDIT` row for B, amount `4000.00` | Both views rendered the transfer correctly | PASS |
| 7 | Inspect `public.users` in Supabase | Two rows; balances `1000.00` and `9000.00`; passwords are BCrypt hashes | Confirmed | PASS |
| 8 | Inspect `public.transactions` in Supabase | One `TRANSFER` row, amount `4000.00`, status `SUCCESS` | Confirmed | PASS |
| 9 | Confirm no plaintext password is stored | `password` column contains a 60-character BCrypt hash | Confirmed; hash begins with a valid `$2a$10$` prefix | PASS |

### 2.5 Result matrix

| Verification | Expected | Actual | Status |
|---|---|---|---|
| Welcome balance applied to Account A | `5000.00` | `5000.00` | PASS |
| Welcome balance applied to Account B | `5000.00` | `5000.00` | PASS |
| Transfer amount debited from sender | `4000.00` | `4000.00` | PASS |
| Sender final balance | `1000.00` | `1000.00` | PASS |
| Receiver final balance | `9000.00` | `9000.00` | PASS |
| Money conservation | `1000.00 + 9000.00 = 10000.00` | `10000.00` | PASS |
| Ledger row created | One `TRANSFER` / `SUCCESS` row | One row verified | PASS |
| Password storage | BCrypt hash, not plaintext | BCrypt hash verified | PASS |
| Authentication after registration | JWT accepted on protected endpoints | Accepted | PASS |

### 2.6 Database verification

Run these queries in the Supabase SQL Editor to reproduce the evidence.

**Balances and password storage**

```sql
select id,
       full_name,
       email,
       account_number,
       balance,
       left(password, 7) as bcrypt_prefix,
       length(password) as hash_length,
       created_at
from public.users
order by id;
```

Expected characteristics:

- Two rows exist.
- `balance` values are `1000.00` and `9000.00`.
- `bcrypt_prefix` is a BCrypt identifier such as `$2a$10$` (the strength may vary if the encoder is reconfigured).
- `hash_length` is `60`.
- No row contains a readable password.

**Transfer ledger**

```sql
select id,
       sender_account,
       receiver_account,
       amount,
       transaction_type,
       status,
       "timestamp"
from public.transactions
order by "timestamp" desc;
```

Expected characteristics:

- One row for the `$4,000.00` transfer.
- `transaction_type = 'TRANSFER'`.
- `status = 'SUCCESS'`.
- `amount = 4000.00`.
- `sender_account` and `receiver_account` match the two test accounts.

**Cross-check the balance against the ledger**

```sql
select u.account_number,
       u.balance,
       coalesce(sum(case when t.receiver_account = u.account_number then t.amount else 0 end), 0) as credits,
       coalesce(sum(case when t.sender_account = u.account_number then t.amount else 0 end), 0) as debits
from public.users u
left join public.transactions t
       on u.account_number in (t.sender_account, t.receiver_account)
group by u.account_number, u.balance
order by u.account_number;
```

For this test:

- Sender: `credits = 0.00`, `debits = 4000.00`, `balance = 1000.00`.
- Receiver: `credits = 4000.00`, `debits = 0.00`, `balance = 9000.00`.

### 2.7 Why BCrypt verification matters

BCrypt is a deliberately slow, salted password-hashing function. The stored value is not encrypted; it is a one-way hash. On login:

```text
raw password ──BCrypt.matches()──► compare with stored hash ──► true / false
```

The database never needs the original password. Even if the `users` table were exposed, an attacker cannot reverse a BCrypt hash cheaply, and identical passwords produce different hashes because each hash uses a unique salt.

### 2.8 Reproducible API smoke test

Use these commands against either the local backend or the deployed Render backend. Replace the placeholders.

```bash
BASE_URL="https://<your-render-service>.onrender.com"

# 1. Register Account A
curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Sender Test","email":"sender@example.com","password":"StrongPass123!"}'

# 2. Register Account B
curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Receiver Test","email":"receiver@example.com","password":"StrongPass123!"}'

# 3. Log in as Account A and capture the token
TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"sender@example.com","password":"StrongPass123!"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

# 4. Transfer $4,000 to Account B
curl -s -X POST "$BASE_URL/api/bank/transfer" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"receiverAccountNumber":"<RECEIVER_ACCOUNT_NUMBER>","amount":4000.00}'

# 5. Confirm the sender profile balance
curl -s "$BASE_URL/api/bank/profile" \
  -H "Authorization: Bearer $TOKEN"
```

> `sed` extraction is only for a quick shell demo. The frontend already handles token storage and API calls correctly.

### 2.9 Recommended negative tests before each release

These are regression checks that complement the successful happy-path test.

| Scenario | Expected response |
|---|---|
| Transfer amount `0` or negative | `400 Bad Request` with a validation error |
| Transfer more than the available balance | `400 Bad Request` / insufficient balance message |
| Transfer to the same account number | `400 Bad Request` / self-transfer blocked |
| Transfer to a non-existent account | `400 Bad Request` / receiver not found |
| Protected endpoint without `Authorization` header | `401` or `403` |
| Protected endpoint with an expired/invalid JWT | `401` or `403` |
| Duplicate email registration | `400 Bad Request` / email already registered |
| Wrong password login | `400 Bad Request` / invalid credentials |
| Amount with more than two decimal places | Rejected or rounded according to service validation |

---

## 3. Security Checklist Before GitHub Upload

### 3.1 What must never be committed

| Item | Why |
|---|---|
| Database password / full production `DB_URL` | Direct access to customer and transaction data |
| Production `JWT_SECRET` | Anyone with it can forge valid tokens for any user |
| `.env` files | Commonly hold live credentials |
| `backend/target/` | Build output; may contain `application.properties` with local secrets |
| IDE folders (`.idea/`, `.vscode/`) | Machine-specific files and sometimes cached credentials |
| Logs and dumps | May contain tokens, SQL, emails, or stack traces |

The root `.gitignore` now covers these categories. Verify before the first push:

```bash
git status
git status --ignored
git check-ignore -v backend/target/ .idea/ .vscode/ Thumbs.db .env
```

Expected: `backend/target/`, `.idea/`, `.vscode/`, `Thumbs.db`, and `.env` all match an ignore rule.

### 3.2 First-time Git upload

```bash
cd E:\java-Bank-APP\javaBankAPP

git init
git add .
git status
git commit -m "SecureBank: add env-based config, Dockerfile, and deployment docs"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

Before committing, confirm that `application.properties`, `Dockerfile`, `.gitignore`, `.gitattributes`, and `frontend/_redirects` are staged, and that `backend/target/` is not.

### 3.3 Rotate anything that has ever been exposed

The local fallback in `application.properties` still contains real credentials. That is convenient for development, but it means the repository should be treated as **private** unless you rotate or replace those fallbacks.

Rotation procedure:

1. In Supabase, reset the database password.
2. In Render, update `DB_URL` with the new password.
3. Generate a new JWT secret:
   ```bash
   openssl rand -base64 32
   ```
   PowerShell alternative:
   ```powershell
   $bytes = New-Object byte[] 32
   [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
   [Convert]::ToBase64String($bytes)
   ```
4. Update `JWT_SECRET` in Render.
5. Redeploy the backend. Existing tokens become invalid, so users must log in again.
6. For a public repository, replace the local fallbacks with dummy values or remove them, and keep real values only in your local `.env`/IDE run configuration.

> `.gitignore` prevents future commits, but it does not remove secrets from Git history. If a secret was ever committed, rotate it; deleting the file in a later commit is not enough.

### 3.4 Production hardening checklist

- [ ] `DB_URL` and `JWT_SECRET` are set in Render, not in Git.
- [ ] Supabase connection uses `sslmode=require`.
- [ ] RLS remains enabled on `public.users` and `public.transactions`.
- [ ] Backend CORS is restricted to the Cloudflare Pages origin (optional but recommended).
- [ ] `spring.jpa.show-sql` is acceptable for the demo; consider disabling it in production.
- [ ] Supabase database password is rotated after any accidental exposure.
- [ ] No `service_role` key exists anywhere in the frontend or repository.
- [ ] HTTPS is used on both Render and Cloudflare Pages.
- [ ] Free-tier cold starts and Supabase pause behaviour are understood.

---

## 4. Cloud Architecture

```text
┌──────────────────────────────┐
│          Browser             │
│  Cloudflare Pages (HTTPS)    │
│  HTML + CSS + app.js         │
└──────────────┬───────────────┘
               │ fetch() + Authorization: Bearer <JWT>
               │ HTTPS / JSON
               ▼
┌──────────────────────────────┐
│       Render Web Service     │
│  Docker: eclipse-temurin 17  │
│  Spring Boot 3.3.5 on $PORT  │
│  DB_URL + JWT_SECRET env     │
└──────────────┬───────────────┘
               │ JDBC over SSL (sslmode=require)
               ▼
┌──────────────────────────────┐
│     Supabase PostgreSQL      │
│  Session Pooler :5432        │
│  public.users                │
│  public.transactions         │
│  RLS enabled                 │
└──────────────────────────────┘
```

Key point: the browser never receives the database password or the JWT signing secret. It only receives a short-lived signed token from the backend.

---

## 5. Deploy the Backend on Render.com

### 5.1 Prerequisites

- A GitHub repository containing this project.
- A Supabase project with the `users` and `transactions` tables already created.
- A Render account (GitHub sign-in is easiest).
- The Supabase database password available.

### 5.2 Push the repository to GitHub

Follow Section 3.2. Render deploys from the GitHub repository, so the code must be pushed before creating the service.

### 5.3 Create the Render Web Service

1. Open the Render Dashboard.
2. Click **New +** → **Web Service**.
3. Connect your GitHub account and select the SecureBank repository.
4. Configure the service:

| Setting | Value |
|---|---|
| Name | `securebank-api` (or any unique name) |
| Language / Runtime | **Docker** |
| Branch | `main` |
| Root Directory | `backend` |
| Dockerfile Path | `./Dockerfile` |
| Region | **Singapore** (closest to Supabase `ap-southeast-1`) |
| Instance Type | **Free** |
| Auto-Deploy | **Yes** |
| Health Check Path | Leave blank (the app has no actuator endpoint) |

5. Click **Create Web Service**.

> The Dockerfile is multi-stage: the first stage compiles the application with `eclipse-temurin:17-jdk-alpine` and `./mvnw`; the second stage runs the JAR with `eclipse-temurin:17-jre-alpine` as a non-root user.

### 5.4 Add environment variables

In the Render service, open **Environment** and add:

| Key | Value |
|---|---|
| `DB_URL` | `jdbc:postgresql://aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?user=postgres.zxespjfhfxvhnioudvxt&password=<SUPABASE_DB_PASSWORD>&sslmode=require` |
| `JWT_SECRET` | A fresh Base64-encoded 32-byte secret |

Do **not** create a `PORT` variable manually. Render supplies it automatically, and `server.port=${PORT:8080}` reads it.

Generate the JWT secret:

```bash
openssl rand -base64 32
```

PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

> Use a different JWT secret from the local fallback. Changing the secret intentionally invalidates all previously issued tokens.

### 5.5 Deploy and watch the logs

Render starts the Docker build automatically after the service is created or whenever `main` is updated.

Expected build sequence:

```text
Cloning repository...
Building Docker image...
Step ... : FROM eclipse-temurin:17-jdk-alpine AS build
...
[INFO] BUILD SUCCESS
Step ... : FROM eclipse-temurin:17-jre-alpine
...
```

Expected runtime logs:

```text
HikariPool-1 - Starting...
HikariPool-1 - Start completed.
Hibernate: ... (schema validation queries)
Tomcat started on port 10000 (http) with context path ''
Started SecureBankApplication in ... seconds
```

The exact port is whatever Render sets in `PORT`. If the logs show `Tomcat started on port 8080` on Render, the `PORT` variable is missing or was overridden.

### 5.6 Verify the backend

Replace `<your-render-service>` with the URL Render shows (for example, `https://securebank-api.onrender.com`).

```bash
curl -i https://<your-render-service>.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Cloud Test","email":"cloud-test@example.com","password":"StrongPass123!"}'
```

Expected:

- HTTP `200 OK`.
- JSON containing the user's account number and a JWT.
- A new row in Supabase `public.users` with balance `5000.00`.
- The `password` column contains a BCrypt hash.

Then log in and call a protected endpoint:

```bash
curl -i https://<your-render-service>.onrender.com/api/bank/profile \
  -H "Authorization: Bearer <JWT_FROM_LOGIN>"
```

Expected: HTTP `200 OK` with the profile and balance. A request without the header should return `401`/`403`.

### 5.7 Free-tier behaviour

- The free instance spins down after a period of inactivity.
- The first request after spin-down can take roughly 30–60 seconds (cold start).
- Free instances have limited CPU and 512 MB RAM. The Dockerfile caps the JVM heap at 75% of container memory.
- For a demo, cold starts are acceptable. For an always-on service, upgrade the instance type or use a keep-alive strategy.

### 5.8 Optional `render.yaml` blueprint

If you prefer infrastructure-as-code, add this at the repository root and use **New +** → **Blueprint**:

```yaml
services:
  - type: web
    name: securebank-api
    runtime: docker
    rootDir: backend
    dockerfilePath: ./Dockerfile
    plan: free
    region: singapore
    envVars:
      - key: DB_URL
        sync: false
      - key: JWT_SECRET
        sync: false
```

`sync: false` makes Render prompt for the values during blueprint creation instead of storing them in the YAML file.

### 5.9 Common Render problems

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails with `./mvnw: not found` or `Permission denied` | Wrapper missing, wrong line endings, or not executable | Keep `mvnw` and `.mvn/` in Git; the Dockerfile runs `chmod +x mvnw`; `.gitattributes` enforces LF |
| Build succeeds but deploy returns `502` | App is not listening on Render's `PORT` | Keep `server.port=${PORT:8080}` and do not hardcode 8080 |
| `Schema-validation: missing table/column` | Supabase schema does not match JPA entities | Run the DDL from report 01 and restart |
| `The connection attempt failed` / SSL error | Wrong host, port, or missing SSL mode | Use the Session Pooler URL with `sslmode=require` |
| `password authentication failed` | Stale password in `DB_URL` | Reset the Supabase password and update `DB_URL` |
| All users logged out after redeploy | `JWT_SECRET` changed | Expected; users log in again |
| CORS error in the browser | Frontend origin not allowed or wrong API URL | Check `API_BASE` and CORS configuration |
| Out-of-memory restart | Free instance RAM limit | Reduce heap with `JAVA_TOOL_OPTIONS=-Xmx320m` or upgrade |

---

## 6. Deploy the Frontend on Cloudflare Pages

### 6.1 Point the frontend at the Render API

The frontend currently defaults to `http://localhost:8080/api` in `frontend/js/app.js`. Update line 3 so local development still works but production uses Render:

```javascript
const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:8080/api"
    : "https://<your-render-service>.onrender.com/api";
```

Replace `<your-render-service>` with the actual Render hostname. Commit and push this change before creating the Pages project.

> Alternative: replace the line with the Render URL directly if you do not need local development from the same checkout.

### 6.2 Create the Cloudflare Pages project

1. Open the Cloudflare Dashboard → **Workers & Pages**.
2. Click **Create** → **Pages** → **Connect to Git**.
3. Authorize Cloudflare and select the SecureBank repository.
4. Configure the build:

| Setting | Value |
|---|---|
| Project name | `securebank` (or any unique name) |
| Production branch | `main` |
| Framework preset | **None** |
| Build command | Leave blank (no build step) |
| Build output directory | `frontend` |
| Root directory | `/` (repository root) |

5. Click **Save and Deploy**.

Cloudflare uploads the static files from `frontend/` and serves them from its global CDN over HTTPS.

### 6.3 Root URL redirect

Cloudflare Pages serves `index.html` for `/` by default, but this project uses `login.html`. The included `frontend/_redirects` file solves that:

```text
/ /login.html 200
```

This is a rewrite with HTTP `200`, not a browser redirect, so the root URL loads the login page while keeping a clean URL. Internal links (`login.html`, `dashboard.html`, and so on) continue to work normally.

### 6.4 Deploy and verify

1. Wait for the Cloudflare Pages deployment to finish.
2. Open `https://<your-project>.pages.dev`.
3. Confirm the login page loads at the root URL.
4. Register a new account and confirm the `$5,000.00` welcome balance.
5. Log out, register a second account, and transfer a small amount.
6. Refresh the dashboard and passbook to confirm data is coming from Supabase.
7. Open the browser DevTools → **Network** tab:
   - API requests go to `https://<your-render-service>.onrender.com/api/...`.
   - Protected requests include `Authorization: Bearer ...`.
   - No request goes to `localhost`.
   - No database credentials or JWT secret appear in any response.
8. If the first API request is slow, wait for the Render free instance to cold-start and retry.

### 6.5 Custom domain (optional)

In Cloudflare Pages → your project → **Custom domains**, add a domain you control. Cloudflare provisions the TLS certificate automatically. If you restrict backend CORS, add the custom domain to the allowed origins.

### 6.6 CORS hardening (recommended)

The current `SecurityConfig` allows every origin pattern:

```java
configuration.setAllowedOriginPatterns(List.of("*"));
```

That is convenient for development, but a production deployment should allow only known frontends:

```java
configuration.setAllowedOriginPatterns(List.of(
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "https://<your-project>.pages.dev",
        "https://your-custom-domain.com"
));
```

Notes:

- Keep the localhost origins only if you still develop against the deployed backend.
- `allowedOriginPatterns` (not `allowedOrigins`) is required when `allowCredentials(true)` is set.
- Add every custom domain you use; otherwise the browser blocks the response.

### 6.7 Common Cloudflare Pages problems

| Symptom | Likely cause | Fix |
|---|---|---|
| Root URL returns `404` | No `index.html` and no `_redirects` | Keep `frontend/_redirects` in the output directory |
| Login works but API calls fail | `API_BASE` still points to `localhost` | Update `frontend/js/app.js` and redeploy |
| `CORS policy` error | Backend origin allow-list excludes the Pages domain | Add the Pages/custom domain to CORS |
| Mixed-content error | Frontend is HTTPS but API is HTTP | Use the HTTPS Render URL |
| Blank page after deploy | Wrong output directory | Set build output directory to `frontend` |
| Old version still served | Browser/CDN cache | Hard refresh; Cloudflare deploys are immutable per build |
| API cold-start timeout on first load | Render free instance was asleep | Retry; consider an upgrade or keep-alive |

---

## 7. Post-Deployment Verification Checklist

Run this after every backend or frontend deployment.

### Backend

- [ ] Render deploy status is **Live**.
- [ ] Logs show Hikari pool start and Hibernate schema validation success.
- [ ] `POST /api/auth/register` returns `200` and a JWT.
- [ ] `POST /api/auth/login` returns `200` for a valid user.
- [ ] `GET /api/bank/profile` works with a valid Bearer token.
- [ ] `GET /api/bank/profile` returns `401`/`403` without a token.
- [ ] `POST /api/bank/transfer` updates both balances.
- [ ] `GET /api/bank/transactions` returns the ledger row.
- [ ] Supabase shows the new user and transaction rows.
- [ ] Password column contains a BCrypt hash, not plaintext.

### Frontend

- [ ] `https://<project>.pages.dev/` loads `login.html`.
- [ ] Registration and login work against the Render API.
- [ ] Dashboard shows the correct balance.
- [ ] Transfer form updates the sender balance.
- [ ] Passbook shows `DEBIT` for the sender and `CREDIT` for the receiver.
- [ ] Logout clears local storage and returns to login.
- [ ] Protected pages redirect to login when no token exists.
- [ ] Mobile layout works (sidebar/off-canvas menu).
- [ ] DevTools shows requests only to the Render HTTPS API.

### Security

- [ ] No secrets are present in the GitHub repository.
- [ ] `backend/target/` is not tracked.
- [ ] Render environment variables are the source of production secrets.
- [ ] Supabase RLS is still enabled.
- [ ] CORS is restricted to known frontend origins.
- [ ] JWT secret is unique to production.
- [ ] Supabase password has been rotated if it was ever committed or shared.

---

## 8. Operations and Troubleshooting

| Symptom | Where to look | Resolution |
|---|---|---|
| Backend returns `502` on Render | Render logs | Confirm the app started and is listening on `$PORT` |
| Backend exits during startup | Render logs | Check schema validation, DB URL, password, and SSL mode |
| Frontend says “Unable to connect” | DevTools → Network | Verify `API_BASE`, Render service status, and CORS |
| Transfer fails with insufficient balance | API response | Expected when amount exceeds the sender balance |
| Receiver not found | API response | Verify the `SB` + 8-digit account number |
| User sees stale balance | Browser/localStorage | Refresh profile; the backend is the source of truth |
| All tokens suddenly invalid | Render env vars | `JWT_SECRET` changed; log in again |
| First request takes ~1 minute | Render free tier | Cold start; retry or upgrade |
| Supabase unreachable after a break | Supabase dashboard | Free projects may pause after inactivity; restore the project |
| Slow database queries | Supabase SQL editor | Add the indexes from report 01 |
| Disk/space warnings in build | Docker context | Keep `backend/.dockerignore` and `backend/target/` ignored |

### 8.1 Deployment order

Always deploy in this order:

1. Supabase schema and RLS are ready.
2. Backend environment variables are set.
3. Backend deploys and passes the API smoke test.
4. Frontend `API_BASE` points to the live backend.
5. Frontend deploys and passes the browser smoke test.

Deploying the frontend before the backend URL exists produces a working page that cannot log in.

### 8.2 Rollback

- **Render:** open the service → **Deploys** → select a previous successful deploy → **Redeploy**.
- **Cloudflare Pages:** open the project → **Deployments** → select a previous deployment → **Rollback**.
- **Database:** schema changes are manual. Keep DDL changes in versioned SQL files and take a Supabase backup before altering tables.

---

## 9. Hinglish Revision Box

- **Secrets:** `DB_URL` aur `JWT_SECRET` Render ke environment variables mein. Source code mein sirf local fallback.
- **Placeholder syntax:** `${VAR:default}` — environment variable mila to wahi, nahi mila to local default.
- **Docker:** Stage 1 Maven build, Stage 2 JRE run. Image chhoti, container non-root.
- **Render:** Root directory `backend`, runtime Docker, free plan, Singapore region, env vars set, `PORT` auto.
- **Cloudflare Pages:** Output directory `frontend`, koi build command nahi, `_redirects` root ko login page par le jaata hai.
- **API_BASE:** Production mein Render URL; localhost sirf local development ke liye.
- **E2E proof:** $5,000 + $5,000 → $4,000 transfer → $1,000 sender, $9,000 receiver; ledger row aur BCrypt hash Supabase mein verified.
- **Security line:** “Environment variables keep production secrets out of Git, and BCrypt keeps passwords unrecoverable even if the database is read.”

---

## 10. Interview Questions (Testing & Deployment)

**Q1. How did you test the money transfer end to end?**
I created two accounts, confirmed both received the $5,000 welcome balance, transferred $4,000 through the authenticated API, and verified the sender had $1,000 and the receiver had $9,000. I also checked the `transactions` ledger row and confirmed both passwords were stored as BCrypt hashes in Supabase.

**Q2. Why use environment variables instead of putting secrets in `application.properties`?**
Configuration should be separate from code. Environment variables let the same JAR run locally and in production, keep secrets out of Git, and allow rotation without rebuilding. The local fallback is only a developer convenience.

**Q3. Why a multi-stage Dockerfile?**
The build stage needs a JDK and Maven; the runtime stage only needs a JRE and the packaged JAR. This produces a smaller image, reduces the attack surface, and avoids shipping build tools to production.

**Q4. Why does Render need `server.port=${PORT:8080}`?**
Render assigns the port at runtime through `PORT`. A hardcoded 8080 may not match the port Render routes traffic to, causing a `502`. The placeholder uses Render's value in production and 8080 locally.

**Q5. Why Cloudflare Pages for the frontend?**
The frontend is static HTML/CSS/JS, so a CDN is the right hosting model. Cloudflare Pages provides free HTTPS, global distribution, Git-based deployments, and atomic rollbacks without a server to maintain.

**Q6. Why is CORS needed if both services are yours?**
CORS is a browser security mechanism. The Pages origin and the Render origin are different origins, so the browser requires the backend to explicitly allow the frontend origin. For production, the allow-list should be restricted instead of using `*`.

**Q7. How would you rotate the database password?**
Reset it in Supabase, update `DB_URL` in Render, redeploy, and verify the backend reconnects. If the old password was exposed, rotate immediately and review access logs.

**Q8. What happens to logged-in users when `JWT_SECRET` changes?**
All previously signed tokens fail signature validation, so users receive `401`/`403` and must log in again. That is expected and is one reason to treat the JWT secret as a critical production secret.

**Q9. How do you know the transfer was atomic?**
The service method is `@Transactional`. If any step fails, Spring rolls back the sender debit, receiver credit, and ledger insert together. The end-to-end test confirmed the ledger row and both balances were consistent.

**Q10. What are the limitations of the free hosting setup?**
Render free instances spin down on inactivity and cold-start slowly, and Supabase free projects can pause. For a production bank, you would use paid always-on instances, monitoring, backups, rate limiting, and a managed secrets service.
