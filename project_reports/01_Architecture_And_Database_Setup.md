# SecureBank — Architecture & Database Setup

> **Project:** SecureBank — a secure multi-page banking web application
> **Stack:** HTML/CSS/JavaScript + Bootstrap 5 → Java 17 + Spring Boot 3.3.5 REST API → Supabase PostgreSQL
> **Purpose of this document:** Understand the complete architecture and database setup in interview-ready language, with quick Hinglish revision notes.

---

## 0. Hinglish Quick Revision

- **3-tier architecture:** Frontend (UI) → Spring Boot REST API (business logic + security) → PostgreSQL (data).
- **PostgreSQL kyun?** Banking mein paisa aur balance involved hai, so humein **ACID transactions**, **strict schema**, aur **exact decimal (NUMERIC)** chahiye. NoSQL mein eventual consistency aur schema drift ka risk hota hai.
- **JDBC Session Pooler:** Supabase ke pooler host par port `5432` use kiya hai, taaki Spring Boot/JPA prepared statements aur session state ke saath reliably connect kar sake.
- **RLS kyun?** Supabase database ko automatically REST API ke through expose karta hai. RLS enabled + no permissive policy = external anon access blocked. Hamara Spring Boot backend direct Postgres connection se kaam karta hai.
- **Golden line for interview:** “Money movement is a correctness problem first, performance problem second.”

---

## 1. What We Built

SecureBank is a full-stack banking demo application with:

| Feature | Description |
|---|---|
| Registration | New user gets a unique `SB` + 8-digit account number and a $5,000.00 starting balance |
| Login | Email + password login; password verified with BCrypt |
| JWT security | Stateless authentication using signed JSON Web Tokens |
| Profile | View name, email, account number, balance, and role |
| Money transfer | Account-to-account transfer with amount, balance, and self-transfer checks |
| Passbook | Full transaction history with CREDIT/DEBIT direction, counterparty, amount, status, and timestamp |
| Dashboard | Live balance and the latest 5 transactions |
| Frontend | Responsive multi-page UI with Bootstrap 5, custom CSS, and vanilla JavaScript |

### Folder structure

```text
javaBankAPP/
├── .gitignore
├── .gitattributes
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/bank/
│       │   ├── SecureBankApplication.java
│       │   ├── controller/
│       │   │   ├── AuthController.java
│       │   │   └── BankController.java
│       │   ├── entity/
│       │   │   ├── User.java
│       │   │   └── Transaction.java
│       │   ├── repository/
│       │   │   ├── UserRepository.java
│       │   │   └── TransactionRepository.java
│       │   ├── security/
│       │   │   ├── JwtUtil.java
│       │   │   ├── JwtFilter.java
│       │   │   └── SecurityConfig.java
│       │   └── service/
│       │       ├── AuthService.java
│       │       └── BankService.java
│       └── resources/application.properties
├── frontend/
│   ├── login.html
│   ├── dashboard.html
│   ├── transfer.html
│   ├── history.html
│   ├── profile.html
│   ├── _redirects
│   ├── css/style.css
│   └── js/app.js
└── project_reports/
    ├── 01_Architecture_And_Database_Setup.md
    ├── 02_Backend_Security_And_APIs.md
    ├── 03_Frontend_And_User_Flow.md
    └── 04_Testing_And_Deployment_Guide.md
```

---

## 2. Three-Tier Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION TIER                         │
│  HTML5 + CSS3 + Vanilla JavaScript + Bootstrap 5            │
│                                                             │
│  login.html  dashboard.html  transfer.html                  │
│  history.html  profile.html                                 │
│                                                             │
│  • Collects form input                                      │
│  • Stores JWT in localStorage                               │
│  • Calls REST APIs using fetch()                            │
│  • Renders balance and passbook                             │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP/JSON
                            │ Authorization: Bearer <JWT>
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     APPLICATION TIER                         │
│  Java 17 + Spring Boot 3.3.5                                │
│                                                             │
│  Controller  →  Service  →  Repository                      │
│       ↑                                      ↓              │
│  Spring Security + JwtFilter             JPA/Hibernate      │
│                                                             │
│  • Validates requests                                       │
│  • Applies banking business rules                           │
│  • Hashes/verifies passwords with BCrypt                    │
│  • Generates/validates JWTs                                 │
│  • Manages database transactions with @Transactional        │
└───────────────────────────┬─────────────────────────────────┘
                            │ JDBC over SSL
                            │ PostgreSQL protocol
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                         DATA TIER                            │
│  Supabase PostgreSQL                                        │
│                                                             │
│  public.users          public.transactions                  │
│  • Primary keys        • Ledger-style rows                  │
│  • Unique constraints  • Sender/receiver snapshots          │
│  • RLS enabled         • Timestamp + status                 │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Presentation tier (frontend)

The browser only knows how to:

1. Show forms and tables.
2. Send HTTP requests to `http://localhost:8080/api`.
3. Store the JWT and basic user details in `localStorage`.
4. Redirect unauthenticated users to `login.html`.

It does **not** connect to PostgreSQL directly and does **not** know the database password. This is important: the database is never exposed to the browser.

### 2.2 Application tier (Spring Boot)

This is the trusted middle layer. It owns:

- **HTTP routing** — `AuthController`, `BankController`.
- **Authentication and authorization** — `JwtUtil`, `JwtFilter`, `SecurityConfig`.
- **Business rules** — `AuthService`, `BankService`.
- **Persistence** — `UserRepository`, `TransactionRepository`, JPA/Hibernate.

Every protected request must carry a valid JWT. The controller receives the logged-in user's email through Spring Security's `Authentication` object; it never trusts an email supplied in the request body.

### 2.3 Data tier (Supabase PostgreSQL)

PostgreSQL stores the durable state:

- `users` — one row per customer.
- `transactions` — one row per money movement.

The backend connects over JDBC through Supabase's **Session Pooler**. Hibernate maps Java objects to these tables and validates the schema at startup.

### 2.4 Why this separation matters (interview points)

| Principle | Benefit |
|---|---|
| Separation of concerns | UI changes don't break business rules; database changes don't break the UI |
| Stateless API | Any backend instance can handle any request; JWT carries identity |
| Security boundary | Database credentials and password hashing live only on the server |
| Testability | Service logic can be unit-tested without a browser |
| Scalability | Frontend can be served from a CDN; backend can scale horizontally |

> **Hinglish:** Frontend ko sirf “dikhaana” aata hai. Asli decision — kaun user hai, kitna paisa hai, transfer allowed hai ya nahi — sab backend leta hai. Database sirf backend se baat karta hai.

---

## 3. Why PostgreSQL Instead of NoSQL for Banking?

Banking is not a “like/comment” app. The most important requirement is **correctness**, not flexible schema or massive horizontal write scaling.

| Banking requirement | PostgreSQL feature | Risk with a typical NoSQL database |
|---|---|---|
| Debit and credit must succeed together | ACID transactions (`BEGIN`, `COMMIT`, `ROLLBACK`) | Many NoSQL stores offer only per-document atomicity; multi-document transactions are limited or eventually consistent |
| Balance must never be half-updated | Atomic `@Transactional` service method | Partial writes can leave money deducted but not credited |
| Exact money values | `NUMERIC` / `DECIMAL` + Java `BigDecimal` | JSON numbers/float doubles can introduce rounding errors |
| No duplicate accounts | `UNIQUE` constraints on `email` and `account_number` | Application-level checks can race without a DB constraint |
| Strict, predictable data | Strong typing, `NOT NULL`, `CHECK`, foreign keys | Schema-less documents allow missing/mismatched fields |
| Reliable reporting/history | SQL joins, filtering, ordering, indexes | Limited query flexibility; data duplication |
| Mature ecosystem | JDBC, JPA/Hibernate, Flyway, backups, monitoring | Tooling varies; transactions often weaker |
| Managed security | Supabase RLS, roles, SSL, backups | Security model depends on provider |

### The ACID argument in one example

A transfer does three things:

1. Deduct money from the sender.
2. Add money to the receiver.
3. Insert a row in `transactions`.

If step 3 fails after step 1, the customer has lost money with no ledger entry. With a relational transaction, all three operations either commit together or roll back together. **NoSQL ki “eventual consistency” banking ke liye acceptable nahi hoti.**

### Why not store balance as `double`?

`double` is binary floating point. Values such as `0.1` cannot be represented exactly. Repeated additions/subtractions can create tiny errors. We use:

- Java `BigDecimal`
- PostgreSQL `NUMERIC(19,2)`

This gives exact two-decimal money arithmetic.

> **Interview line:** “I chose PostgreSQL because a bank needs strong consistency, exact decimal arithmetic, unique constraints, and multi-row atomic transactions. Those are first-class features of PostgreSQL and were more important than schema flexibility.”

---

## 4. Supabase Connection Setup

### 4.1 Connection details used by the app

| Setting | Value |
|---|---|
| Provider | Supabase (managed PostgreSQL) |
| Region/host | `aws-1-ap-southeast-1.pooler.supabase.com` |
| Port | `5432` |
| Database | `postgres` |
| Pooler username | `postgres.zxespjfhfxvhnioudvxt` |
| Password | Supplied through the `DB_URL` environment variable; local fallback lives in `application.properties` |
| Connection type | **Session Pooler** |
| Driver | `org.postgresql.Driver` |
| JPA dialect | `org.hibernate.dialect.PostgreSQLDialect` |

### 4.2 JDBC URL template

```properties
jdbc:postgresql://aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?user=postgres.zxespjfhfxvhnioudvxt&password=<SUPABASE_DB_PASSWORD>&sslmode=require
```

The full URL is supplied through the `DB_URL` environment variable. `application.properties` keeps a local fallback so the app still runs out of the box:

```properties
spring.datasource.url=${DB_URL:jdbc:postgresql://aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?user=postgres.zxespjfhfxvhnioudvxt&password=<LOCAL_DB_PASSWORD>&sslmode=require}
```

In production (Render), set `DB_URL` to the complete JDBC URL including `sslmode=require`. See report 04 for the deployment runbook.

> **Security note:** Never commit database passwords or JWT secrets to Git. `application.properties` is convenient for a local demo, but production should use environment variables, a vault, or Supabase secrets.

### 4.3 Why the Session Pooler (port 5432)?

Supabase offers different connection routes:

| Route | Port | Behaviour | Fit for this project |
|---|---|---|---|
| Direct connection | `5432` on `db.<ref>.supabase.co` | Direct PostgreSQL connection; may require IPv4 add-on | Good for long-lived servers, but can hit connection limits |
| Session Pooler | `5432` on `...pooler.supabase.com` | Keeps a session-level server connection for the client | **Used here**; works well with JPA/prepared statements |
| Transaction Pooler | `6543` | Multiplexes many clients across transactions | Better for serverless/short-lived connections; some session features are limited |

Spring Boot is a long-running server, but the Session Pooler still helps with connection management and Supabase's network compatibility. It preserves session state, which is safer for JPA/Hibernate and prepared statements.

> **Hinglish:** Session Pooler ek dedicated waiter jaisa hai jo aapke table par session bhar assigned rehta hai. Transaction Pooler zyada shared hota hai, par har transaction ke baad context badal sakta hai. JPA ke liye Session Pooler simple aur predictable hai.

### 4.4 The actual configuration

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

### 4.5 What each JPA setting means

| Property | Meaning | Why it matters |
|---|---|---|
| `ddl-auto=validate` | Hibernate checks that tables/columns exist and match; it does not create or alter them | Prevents accidental schema changes in production; forces deliberate migrations |
| `show-sql=true` | Logs generated SQL | Useful while learning/debugging; should be off or sampled in production |
| `hibernate.format_sql=true` | Pretty-prints SQL logs | Readability |
| `hibernate.dialect=PostgreSQLDialect` | Tells Hibernate how to generate PostgreSQL SQL | Correct types, pagination, identity columns |
| `open-in-view=false` | Closes the JPA session after the service/transaction finishes | Prevents lazy-loading surprises and holds DB connections for less time |

> **Important:** Because `ddl-auto=validate` is used, the Supabase tables must already exist with matching column names and compatible types. If the schema is wrong, the application fails at startup instead of silently changing the database.

### 4.6 Java ↔ PostgreSQL type mapping

| Java type | PostgreSQL type | Notes |
|---|---|---|
| `Long` + `IDENTITY` | `bigint` / `bigserial` | Auto-generated primary key |
| `String` | `varchar` / `text` | Email, name, hashed password, account number |
| `BigDecimal` | `numeric` / `decimal` | Exact money values |
| `LocalDateTime` | `timestamp` | No timezone; server-local timestamps |
| `boolean` (not used in entities) | `boolean` | — |

---

## 5. Database Schemas

> The DDL below is the schema contract expected by the JPA entities. Because the project uses `ddl-auto=validate`, Hibernate will compare the live Supabase schema against these mappings. If you provision a fresh database, this DDL gives you the correct starting point.

### 5.1 `users` table

**Purpose:** One row per registered customer.

| Column | PostgreSQL type | Constraints / default | Java field |
|---|---|---|---|
| `id` | `bigserial` | Primary key | `Long id` |
| `full_name` | `varchar(255)` | `NOT NULL` | `String fullName` |
| `email` | `varchar(255)` | `NOT NULL`, `UNIQUE` | `String email` |
| `password` | `varchar(255)` | `NOT NULL` | `String password` (BCrypt hash, ~60 chars) |
| `account_number` | `varchar(10)` | `NOT NULL`, `UNIQUE` | `String accountNumber` (`SB` + 8 digits) |
| `balance` | `numeric(19,2)` | `NOT NULL`, default `5000.00` | `BigDecimal balance` |
| `role` | `varchar(20)` | `NOT NULL`, default `'CUSTOMER'` | `String role` |
| `created_at` | `timestamp` | `NOT NULL`, default `now()` | `LocalDateTime createdAt` |

#### DDL

```sql
create table if not exists public.users (
    id             bigserial primary key,
    full_name      varchar(255) not null,
    email          varchar(255) not null,
    password       varchar(255) not null,
    account_number varchar(10)  not null,
    balance        numeric(19, 2) not null default 5000.00,
    role           varchar(20)  not null default 'CUSTOMER',
    created_at     timestamp    not null default now(),
    constraint uq_users_email unique (email),
    constraint uq_users_account_number unique (account_number)
);
```

**Why `account_number` is `varchar` and not a number:** Leading letters (`SB`) and fixed-width formatting matter. `SB00000001` and `SB1` are different account identifiers. Treating it as text also avoids accidental numeric conversion.

**Why `password` is `varchar(255)`:** A BCrypt hash is about 60 characters, but `255` leaves room for future algorithm upgrades and avoids truncation.

**Why `role` is a string:** The current app only uses `CUSTOMER`, but the column allows future roles such as `ADMIN` without a schema migration. In a larger system, a `user_roles` table or PostgreSQL enum could be used.

### 5.2 `transactions` table

**Purpose:** An append-only passbook/ledger of money movements.

| Column | PostgreSQL type | Constraints / default | Java field |
|---|---|---|---|
| `id` | `bigserial` | Primary key | `Long id` |
| `sender_account` | `varchar(10)` | `NOT NULL` | `String senderAccount` |
| `receiver_account` | `varchar(10)` | `NOT NULL` | `String receiverAccount` |
| `amount` | `numeric(19,2)` | `NOT NULL` | `BigDecimal amount` |
| `transaction_type` | `varchar(50)` | `NOT NULL` | `String transactionType` (`TRANSFER`) |
| `status` | `varchar(20)` | `NOT NULL`, default `'SUCCESS'` | `String status` |
| `timestamp` | `timestamp` | `NOT NULL`, default `now()` | `LocalDateTime timestamp` |

#### DDL

```sql
create table if not exists public.transactions (
    id               bigserial primary key,
    sender_account   varchar(10)   not null,
    receiver_account varchar(10)   not null,
    amount           numeric(19,2) not null,
    transaction_type varchar(50)   not null,
    status           varchar(20)   not null default 'SUCCESS',
    "timestamp"      timestamp     not null default now()
);
```

> `timestamp` is quoted in this DDL because it is also a PostgreSQL type name. The JPA column name is `timestamp`; quoting a lowercase identifier preserves the same name.

**Why sender/receiver account numbers are copied instead of storing only user IDs:**

- A transaction is a historical snapshot. If a user later changes their account number (rare, but possible), old statements should still show the account number used at that time.
- The passbook query filters directly on `sender_account` and `receiver_account`.
- It keeps the ledger simple and readable.
- In a larger design, you could also store `sender_user_id` / `receiver_user_id` foreign keys for referential reporting while keeping the account-number snapshot.

### 5.3 Indexes

The history query is:

```sql
select *
from public.transactions
where sender_account = ? or receiver_account = ?
order by "timestamp" desc;
```

Recommended indexes:

```sql
create index if not exists idx_transactions_sender_ts
    on public.transactions (sender_account, "timestamp" desc);

create index if not exists idx_transactions_receiver_ts
    on public.transactions (receiver_account, "timestamp" desc);
```

PostgreSQL can combine these with a bitmap OR and then sort, or choose a different plan depending on data size. For a small demo, sequential scan is fine; for production, these indexes matter.

### 5.4 Recommended hardening constraints

The application already validates these rules, but database-level checks add defense in depth:

```sql
alter table public.users
    add constraint chk_users_balance_non_negative check (balance >= 0);

alter table public.transactions
    add constraint chk_transactions_amount_positive check (amount > 0);
```

> **Hinglish:** Application validation pehli line of defense hai. Database constraint last line of defense hai. Banking mein dono rakhna best practice hai.

### 5.5 Verifying the live schema

Because Hibernate only validates, you can inspect the actual columns in Supabase SQL Editor:

```sql
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('users', 'transactions')
order by table_name, ordinal_position;
```

If startup fails with a schema validation error, compare this output with the entity mappings above.

---

## 6. Row Level Security (RLS)

### 6.1 What is RLS?

Row Level Security is a PostgreSQL feature that attaches access policies to individual rows. Even if a client has permission to run `select` on a table, RLS can restrict which rows it sees or modifies.

Supabase automatically exposes the `public` schema through its PostgREST API. That API can be called with the project's **anon key**. Without RLS, an anon client could potentially read or write tables that have broad grants.

### 6.2 Why RLS was enabled here

The SecureBank frontend never talks to Supabase directly. However, the database project may still expose its REST endpoint. Enabling RLS protects against accidental external access:

1. **Default deny:** With RLS enabled and **no permissive policies**, normal anon/authenticated API clients cannot read or write rows.
2. **Defense in depth:** Spring Security protects the application APIs; RLS protects the data layer if someone discovers the Supabase REST endpoint.
3. **Least privilege:** The browser only receives a JWT for our Spring Boot API. It never receives the database password, the Supabase service-role key, or direct table access.
4. **Supabase best practice:** Public tables should have RLS enabled unless there is a deliberate reason not to.

Enable it with:

```sql
alter table public.users enable row level security;
alter table public.transactions enable row level security;
```

### 6.3 Why the Spring Boot backend still works

The backend connects through JDBC as the PostgreSQL project role (`postgres.<project-ref>`). That role is the table owner / privileged database role and **bypasses RLS**. This is why the app can read and write normally while external anon access is blocked.

> **Important distinction:** RLS is not a replacement for Spring Security. Spring Security decides whether a request may reach `/api/bank/**`. RLS decides whether a database role may touch rows. Both layers protect different boundaries.

### 6.4 Policy strategy

For this architecture, the safest default is:

- RLS enabled on both tables.
- **No policies for `anon` or `authenticated`.**
- Only the backend's privileged PostgreSQL connection performs reads/writes.

If you later create a dedicated backend database role, grant it only the required privileges and add an explicit policy. Example pattern (not required for the current direct connection):

```sql
-- Example only: create a restricted backend role and allow it full access.
create role bank_backend login password '<strong-password>';

grant usage on schema public to bank_backend;
grant select, insert, update on public.users to bank_backend;
grant select, insert on public.transactions to bank_backend;

create policy backend_full_access_users
    on public.users
    for all
    to bank_backend
    using (true)
    with check (true);

create policy backend_full_access_transactions
    on public.transactions
    for all
    to bank_backend
    using (true)
    with check (true);
```

> **Never expose the `service_role` key in frontend code.** The service-role key bypasses RLS and gives full database access. It belongs only on a trusted server.

### 6.5 RLS + Spring Security together

| Layer | Question it answers | Example |
|---|---|---|
| Spring Security / JWT | “Is this HTTP request authenticated?” | Reject `/api/bank/profile` without a valid Bearer token |
| Business rules | “Is this action allowed for this user?” | User can only view their own profile and transactions |
| PostgreSQL RLS | “May this database role touch these rows?” | Anon REST clients see nothing; backend role can read/write |

> **Hinglish:** Spring Security gatekeeper hai jo HTTP request check karta hai. RLS database ka guard hai jo row-level access check karta hai. Dono alag layers hain, isliye ek fail ho jaye to doosra bachaata hai.

---

## 7. End-to-End Example: A Transfer Touches All Three Tiers

```text
User clicks “Send Money” in transfer.html
        │
        │ POST /api/bank/transfer
        │ Authorization: Bearer <JWT>
        │ { receiverAccountNumber: "SB12345678", amount: 500 }
        ▼
Spring Security
  • JwtFilter validates signature + expiry
  • Loads user by email from token
  • Sets Authentication in SecurityContext
        ▼
BankController
  • Reads logged-in email from Authentication
  • Parses amount as BigDecimal
        ▼
BankService.transferMoney()
  • @Transactional starts a DB transaction
  • Validates amount > 0
  • Finds sender and receiver
  • Blocks self-transfer
  • Checks sufficient balance
  • Deducts sender, credits receiver
  • Inserts a transactions row
  • Commits atomically
        ▼
PostgreSQL (Supabase)
  • users.balance updated for both rows
  • transactions row inserted
        ▼
JSON response: { "message": "Transfer successful", "balance": 4500.00 }
        ▼
Frontend updates localStorage balance and shows a green success alert
```

If any step inside `transferMoney()` throws a `RuntimeException`, Spring rolls back the whole transaction. The sender's balance, receiver's balance, and ledger row all remain unchanged.

---

## 8. Common Pitfalls and Interview Traps

### “Why not `ddl-auto=update`?”

`update` can silently alter production tables, add columns, or make changes you did not review. Banking schemas should be versioned with migrations (Flyway/Liquibase) and reviewed. `validate` fails fast if the schema is wrong.

### “Why not store the balance only in transactions and compute it every time?”

For a real ledger, an append-only transaction table is the source of truth. But computing a balance from all rows on every dashboard load is expensive and makes concurrent checks harder. The current design stores a cached `users.balance` and writes a ledger row in the same transaction. For very large systems, you would use ledger entries plus periodic snapshots, or an event-sourced design with strong consistency.

### “Why is the account number unique?”

Two customers must never receive the same account number. The database `UNIQUE` constraint is the final protection; `AuthService` also checks before inserting.

### “Why `timestamp` without timezone?”

The current code uses `LocalDateTime`, which stores a date-time without timezone. This is acceptable for a demo where all users share one timezone. For a global bank, prefer `Instant`/`OffsetDateTime` and `timestamptz` so timestamps are unambiguous across regions.

### “Why is the JDBC password in the URL?”

The local fallback keeps the password in the URL for convenience, but production supplies the whole URL through the `DB_URL` environment variable, so no production credential is edited in source. For larger systems, better options are:

- Separate `spring.datasource.username` and `spring.datasource.password` properties fed by environment variables.
- A secrets manager.
- Regular credential rotation.

Never put database credentials in frontend JavaScript or HTML.

---

## 9. Hinglish Revision Box

- **Architecture:** Browser → REST API → PostgreSQL. Browser kabhi DB se direct connect nahi karta.
- **Frontend:** Sirf UI, form validation, JWT storage, API calls, rendering.
- **Backend:** Trusted layer; authentication, authorization, business rules, transactions.
- **Database:** Durable source of truth; constraints + RLS.
- **PostgreSQL choice:** ACID + strict schema + `NUMERIC` + unique constraints + SQL reporting.
- **Connection:** Supabase Session Pooler at port `5432`; JDBC driver `org.postgresql.Driver`; Hibernate dialect PostgreSQL.
- **Schema validation:** `ddl-auto=validate`; tables pehle se hone chahiye; mismatch par app start nahi hogi.
- **Money type:** `BigDecimal` + `NUMERIC(19,2)`; `double` bilkul nahi.
- **RLS:** Enabled on `users` and `transactions`; external anon access blocked; backend privileged connection bypasses RLS.
- **Interview one-liner:** “I used a relational database because banking requires atomic multi-row transactions, exact decimal arithmetic, and enforceable constraints.”

---

## 10. Quick Interview Questions (Architecture & DB)

**Q1. Why a 3-tier architecture instead of putting SQL in JavaScript?**
Because the browser is untrusted. Database credentials, password hashing, balance checks, and JWT signing must stay on the server. The 3-tier split also makes the API reusable by mobile apps and keeps the UI replaceable.

**Q2. Why PostgreSQL over MongoDB for balances?**
Money needs ACID transactions, exact decimals, and constraints. MongoDB can be used with careful schema design, but the default mental model is document flexibility and eventual consistency, which is the wrong default for banking.

**Q3. What does `ddl-auto=validate` do?**
It asks Hibernate to compare entity mappings with the live schema and fail startup on a mismatch. It does not create or modify tables.

**Q4. Why use the Session Pooler?**
It preserves session-level behaviour and works well with JPA/prepared statements, while Supabase manages connection pooling. The transaction pooler is better suited to short-lived/serverless clients.

**Q5. What does RLS protect if the frontend never talks to the database?**
It protects the database's automatically exposed REST API and any future client that gets a database key. It is defense in depth, not a replacement for Spring Security.
