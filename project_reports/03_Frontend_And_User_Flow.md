# SecureBank — Frontend & User Flow

> **Stack:** HTML5, CSS3, vanilla JavaScript, Bootstrap 5 (CDN), Bootstrap Icons, Inter font
> **Architecture:** Static multi-page frontend that talks to the Spring Boot REST API at `http://localhost:8080/api`
> **Purpose:** Understand every page, the shared CSS/JS, the JWT flow in the browser, and how transactions are rendered as CREDIT/DEBIT.

---

## 0. Hinglish Quick Revision

- **Frontend static hai:** Koi React/Angular build step nahi. Direct HTML, CSS, JS files hain.
- **5 pages:** Login, Dashboard, Transfer, History (Passbook), Profile.
- **JWT localStorage mein:** `securebank.token` key ke andar. User details `securebank.user` mein JSON ke roop mein.
- **Protected pages:** Agar token missing hai to `app.js` automatically `login.html` par redirect kar deta hai.
- **Har API call:** `Authorization: Bearer <token>` header ke saath jaati hai.
- **CREDIT green, DEBIT red:** Agar transaction ka `receiverAccount` current user ka account hai → CREDIT. Agar `senderAccount` current user ka account hai → DEBIT.
- **Logout:** localStorage clear + `login.html` redirect.
- **Interview line:** “The frontend is a thin client: it collects input, renders state, and attaches the JWT. All trust and business rules live in the backend.”

---

## 1. Frontend Overview

| Item | Value |
|---|---|
| Pages | 5 HTML files |
| Styling | Custom `css/style.css` + Bootstrap 5.3.3 CDN |
| Icons | Bootstrap Icons 1.11.3 CDN |
| Font | Inter via Google Fonts |
| JavaScript | One shared `js/app.js` file |
| API base | `http://localhost:8080/api` |
| Auth storage | `localStorage` |
| HTTP client | Native `fetch()` |
| Responsive | Yes — desktop sidebar, mobile off-canvas menu |
| Build tools | None |

### Why a multi-page static frontend?

- Easy to understand and demonstrate in an interview.
- No Node.js/npm build pipeline required.
- Each page has a clear responsibility.
- Shared CSS/JS keeps the design and API logic consistent.
- The same API could later power a React, mobile, or server-rendered frontend.

> **Hinglish:** Har page alag HTML file hai, lekin styling aur JavaScript shared hai. Isse code duplicate kam hota hai aur navigation simple rehta hai.

---

## 2. File Map

```text
frontend/
├── login.html        → Login + Create New Account tabs (public)
├── dashboard.html    → Welcome card, balance, recent 5 transactions (protected)
├── transfer.html     → Money transfer form + validation (protected)
├── history.html      → Full passbook statement (protected)
├── profile.html      → Account holder details + security status (protected)
├── css/
│   └── style.css     → Full theme, layout, components, responsive rules
└── js/
    └── app.js        → Auth, API calls, rendering, validation, logout
```

### Page summary

| Page | Protected? | Main purpose | API calls |
|---|---|---|---|
| `login.html` | No | Sign in or register | `POST /auth/login`, `POST /auth/register` |
| `dashboard.html` | Yes | Snapshot of account | `GET /bank/profile`, `GET /bank/transactions` |
| `transfer.html` | Yes | Send money | `GET /bank/profile`, `POST /bank/transfer` |
| `history.html` | Yes | Full passbook | `GET /bank/profile`, `GET /bank/transactions` |
| `profile.html` | Yes | Account details | `GET /bank/profile` |

---

## 3. Design System — `css/style.css`

### 3.1 Theme direction

A modern fintech look:

- **Dark navy** sidebar and top header.
- **Crisp white cards** on a soft blue-grey background.
- **Green** for credits, success, and positive actions.
- **Red** for debits and errors.
- **Inter** for clean typography.
- Rounded cards, subtle shadows, and restrained gradients.

### 3.2 Core CSS variables

```css
:root {
    --navy-950: #061528;
    --navy-900: #0a203c;
    --navy-800: #102c50;
    --navy-700: #173b67;
    --ink: #0f172a;
    --muted: #64748b;
    --line: #e5eaf2;
    --surface: #f3f6fb;
    --card: #ffffff;
    --green: #16a34a;
    --green-soft: #dcfce7;
    --red: #dc2626;
    --red-soft: #fee2e2;
    --radius-lg: 20px;
    --sidebar-width: 272px;
}
```

These variables make the theme consistent and easy to rebrand.

### 3.3 Layout components

| Component | Purpose |
|---|---|
| `.app-shell` | Full application wrapper for protected pages |
| `.sidebar` | Fixed dark navy navigation |
| `.main-area` | Content area offset by the sidebar width |
| `.topbar` | Sticky navy header with page title and user chip |
| `.content` | Main page padding and vertical layout |
| `.card` | White rounded surface with shadow |
| `.balance-panel` | Navy gradient panel for available balance |
| `.account-chip` | Account number + copy button |
| `.bank-table` | Passbook table styling |
| `.empty-state` | Friendly empty-state block |
| `.auth-shell` | Two-column login/register layout |
| `.auth-visual` | Navy marketing/security panel on login |
| `.auth-card` | Login/register card |

### 3.4 Sidebar and mobile navigation

Desktop:

- Sidebar is fixed on the left, width `272px`.
- Main content gets `margin-left: 272px`.

Mobile (`max-width: 991.98px`):

- Sidebar is translated off-screen with `transform: translateX(-100%)`.
- The hamburger button toggles `body.sidebar-open`.
- A backdrop appears and closes the menu when clicked.
- `body.sidebar-open` also prevents background scrolling.

```css
@media (max-width: 991.98px) {
    .sidebar {
        transform: translateX(-100%);
        transition: transform 0.24s ease;
    }

    body.sidebar-open .sidebar {
        transform: translateX(0);
    }

    .main-area {
        margin-left: 0;
    }
}
```

### 3.5 Color semantics

| Meaning | Color | CSS |
|---|---|---|
| Credit / success | Green | `.type-badge.credit`, `.amount-credit`, `.status-badge.success` |
| Debit / danger | Red | `.type-badge.debit`, `.amount-debit`, `.alert-danger` |
| Primary action | Navy | `.btn-primary` |
| Positive action | Green gradient | `.btn-accent` |
| Neutral secondary | Light grey | `.btn-ghost` |

### 3.6 Responsive breakpoints

| Breakpoint | Behaviour |
|---|---|
| `≤ 991.98px` | Sidebar becomes off-canvas; auth visual panel hides |
| `≤ 767.98px` | Smaller hero/balance text and table padding |
| `≤ 575.98px` | Smaller content padding, hidden topbar email, stacked profile rows |

The tables are wrapped in Bootstrap's `.table-responsive`, so they scroll horizontally on small screens instead of breaking the layout.

---

## 4. `js/app.js` Architecture

`app.js` is shared by all five pages. It detects the current page using data attributes on `<body>`:

```html
<body data-page="dashboard" data-protected="true">
```

```html
<body data-page="login">
```

At startup:

```js
const page = document.body.dataset.page || "";
const isProtectedPage = document.body.dataset.protected === "true";

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
    if (isProtectedPage && !getToken()) {
        redirectToLogin();
        return;
    }

    bindGlobalActions();
    initPasswordToggles();

    if (page === "login") {
        initAuthPage();
        return;
    }

    if (isProtectedPage) {
        initProtectedPage();
    }
}
```

### 4.1 Session storage keys

| Key | Stored value | Example |
|---|---|---|
| `securebank.token` | Raw JWT string | `eyJhbGciOiJIUzI1NiJ9...` |
| `securebank.user` | JSON user snapshot | `{"fullName":"Aman Sharma","email":"...","accountNumber":"SB12345678","balance":5000,"role":"CUSTOMER"}` |

```js
const TOKEN_KEY = "securebank.token";
const USER_KEY = "securebank.user";

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function getUser() {
    try {
        const user = JSON.parse(localStorage.getItem(USER_KEY));
        return user && typeof user === "object" ? user : {};
    } catch (error) {
        return {};
    }
}
```

The password is **never** stored in localStorage.

### 4.2 Protected-page guard

Every protected page includes `data-protected="true"`. If the token key is missing, the script redirects immediately:

```js
if (isProtectedPage && !getToken()) {
    redirectToLogin();
    return;
}
```

The API is still the real security boundary. Even if someone bypasses the frontend, `/api/bank/**` rejects requests without a valid JWT.

### 4.3 The API wrapper

All API calls go through `apiRequest()`:

```js
async function apiRequest(path, options = {}) {
    const headers = {
        Accept: "application/json",
        ...(options.headers || {})
    };

    if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    const token = getToken();
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            method: options.method || "GET",
            headers,
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined
        });
    } catch (error) {
        throw new Error("Unable to reach the banking server. Please try again.");
    }

    if (response.status === 401 || response.status === 403) {
        clearSession();
        if (page !== "login") {
            redirectToLogin(true);
        }
        throw new Error("Your session has expired. Please sign in again.");
    }

    const rawBody = await response.text();
    let data = {};
    if (rawBody) {
        try {
            data = JSON.parse(rawBody);
        } catch (error) {
            data = {};
        }
    }

    if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
    }

    return data;
}
```

This wrapper handles:

- JSON headers.
- `Authorization: Bearer <token>` automatically.
- Network failures with a friendly message.
- Expired/invalid sessions: clear storage and redirect to `login.html?expired=1`.
- Backend error shape `{"error": "..."}`.

### 4.4 Helper functions

| Function | Purpose |
|---|---|
| `getToken()` / `getUser()` | Read session state from localStorage |
| `saveSession(data)` | Save token + user details after login/register |
| `saveProfile(profile)` | Refresh stored user details from `/bank/profile` |
| `clearSession()` | Remove token and user details |
| `redirectToLogin(expired)` | Navigate to login, optionally showing the expired-session message |
| `apiRequest(path, options)` | Shared fetch wrapper |
| `renderUserChrome(user)` | Fill all `data-user="..."` elements across the page |
| `loadProfile()` | Fetch profile and refresh the page |
| `loadRecentTransactions()` | Dashboard: last 5 transactions |
| `loadTransactionHistory()` | History: full passbook |
| `transactionRow(...)` | Build one table row with CREDIT/DEBIT styling |
| `initTransferPage()` | Bind and validate the transfer form |
| `showAlert()` / `hideAlert()` | Banner messages |
| `setLoading()` | Button spinner + disabled state |
| `formatCurrency()` / `formatTransactionDate()` | Formatting helpers |
| `escapeHtml()` | Safe rendering of dynamic values |
| `copyAccountNumber()` | Clipboard copy with fallback |

### 4.5 DOM binding with `data-user`

Instead of writing page-specific JavaScript for every field, the pages use attributes:

```html
<span data-user="fullName">Account Holder</span>
<span data-user="email">—</span>
<span data-user="accountNumber">—</span>
<span data-user="balance">$0.00</span>
<span data-user="role">Customer</span>
<div data-user-initials>SB</div>
```

`renderUserChrome()` updates every matching element:

```js
document.querySelectorAll('[data-user="fullName"]').forEach((element) => {
    element.textContent = currentUser.fullName || "Account Holder";
});
```

This is why the same profile data can appear in the topbar, welcome card, and profile page without duplicate logic.

---

## 5. Page-by-Page Walkthrough

### 5.1 `login.html`

**Purpose:** Public entry point with two tabs.

**Layout:**

- Left: dark navy security/marketing panel with brand, headline, welcome-balance card, and security features.
- Right: white auth card with Login / Create New Account tabs.
- On mobile, the visual panel is hidden and a compact brand appears above the card.

**Login tab fields:**

- Email address (`#loginEmail`)
- Password (`#loginPassword`)
- Show/hide password button
- Submit button

**Create New Account tab fields:**

- Full name (`#registerFullName`)
- Email (`#registerEmail`)
- Password (`#registerPassword`, minimum 6 characters in the HTML)
- Note about the $5,000.00 welcome balance

**Login flow:**

```text
Submit login form
  → reportValidity()
  → POST /auth/login { email, password }
  → saveSession(response)
      • token → securebank.token
      • user fields → securebank.user
  → redirect to dashboard.html
```

**Register flow:**

```text
Submit register form
  → POST /auth/register { fullName, email, password }
  → backend creates account + JWT
  → saveSession(response)
  → redirect to dashboard.html
```

**Error handling:**

- `#authAlert` displays backend errors, e.g. “Invalid email or password” or “Email already registered.”
- If redirected with `login.html?expired=1`, an info alert says the session expired.
- Switching tabs hides the previous alert.

### 5.2 `dashboard.html`

**Purpose:** A quick snapshot of the account.

**Navigation:**

- Sidebar: Dashboard, Send Money, Passbook History, Profile, Logout.
- Topbar: mobile menu button, page title, user avatar, name, email.

**Welcome card:**

- “Welcome back, `<full name>`”.
- Account number with a copy button.
- Available balance in the navy balance panel.
- “Send money” call-to-action.

**Recent transactions:**

- `GET /bank/profile` loads the latest profile/balance.
- `GET /bank/transactions` loads the ledger.
- JavaScript keeps only the first 5 items:

```js
const recent = transactions.slice(0, 5);
```

- If there are none, a friendly empty state appears.
- “View passbook” links to `history.html`.

**Copy account number:**

```js
if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(accountNumber);
} else {
    fallbackCopy(accountNumber);
}
```

The button label briefly changes to “Copied.”

### 5.3 `transfer.html`

**Purpose:** Send money with instant client-side validation and clear feedback.

**Fields:**

- Receiver account number (`#receiverAccountNumber`)
- Amount (`#amount`)
- Available balance hint (`#availableBalance`)

**Instant validation rules:**

| Field | Rule | Error message |
|---|---|---|
| Receiver | Required | “Receiver account number is required.” |
| Receiver | Must match `^SB\d{8}$` | “Enter a valid account number: SB followed by 8 digits.” |
| Receiver | Cannot equal the logged-in user's account | “You cannot transfer money to your own account.” |
| Amount | Required | “Amount is required.” |
| Amount | Must be > 0 | “Enter an amount greater than zero.” |
| Amount | Maximum 2 decimal places | “Use a valid amount with up to 2 decimal places.” |
| Amount | Cannot exceed stored balance | “Amount exceeds your available balance.” |

Receiver input is automatically uppercased and stripped of spaces:

```js
receiverInput.value = receiverInput.value.toUpperCase().replace(/\s+/g, "");
```

**Submit flow:**

```text
Submit transfer form
  → validate receiver + amount
  → POST /bank/transfer
      { receiverAccountNumber, amount }
  → on success:
      • update securebank.user.balance with response.balance
      • re-render all balance fields
      • show green success alert
      • reset the form
  → on error:
      • show red alert with backend message
```

The backend remains authoritative. Frontend validation is for user experience, not security.

**Success message example:**

> “Transfer successful. Your updated balance is $4,500.00.”

**Side panel:** A “Before you send” checklist reminds the user to verify the account number and explains that transfers are recorded in the passbook.

### 5.4 `history.html`

**Purpose:** Full passbook statement.

**Table columns:**

| Column | Source |
|---|---|
| Date / Time | `transaction.timestamp` |
| Type | CREDIT or DEBIT (derived from the current user's account number) |
| Counterparty account | Sender for credits, receiver for debits |
| Amount | `transaction.amount`, signed and color-coded |
| Status | `transaction.status` (SUCCESS / PENDING / FAILED) |

**Loading flow:**

```text
GET /bank/profile → refresh account number + user details
GET /bank/transactions → full ordered list
  → render rows
  → update count chip
  → show empty state if the list is empty
```

Backend ordering is newest-first (`OrderByTimestampDesc`), so the table does not re-sort.

### 5.5 `profile.html`

**Purpose:** Account holder details and security reassurance.

**Left card:**

- Large avatar with initials.
- Full name.
- Role badge (`Customer`).
- Account number.

**Right card — Account details:**

| Field | Source |
|---|---|
| Full name | `profile.fullName` |
| Email address | `profile.email` |
| Account number | `profile.accountNumber` |
| Account role | `profile.role` |
| Security status | Static: “JWT + BCrypt Active” |

The security status is a UI statement about the implemented architecture, not a live health check.

---

## 6. End-to-End User Flows

### 6.1 New user registration

```text
User opens login.html
  → clicks “Create New Account”
  → enters full name, email, password
  → frontend checks required fields
  → POST /api/auth/register
  → backend validates, hashes password, creates account + JWT
  → response: token, fullName, email, accountNumber, balance
  → app.js saves token + user in localStorage
  → redirects to dashboard.html
  → dashboard loads profile and recent transactions
```

### 6.2 Returning user login

```text
User enters email + password on login.html
  → POST /api/auth/login
  → backend verifies BCrypt hash
  → response includes JWT
  → app.js stores token + user
  → redirects to dashboard.html
```

### 6.3 Loading a protected page

```text
Browser opens dashboard.html
  → app.js reads data-protected="true"
  → no token? → redirect login.html
  → token exists? → render cached user immediately
  → GET /api/bank/profile with Bearer token
  → update cached user + all data-user fields
  → GET /api/bank/transactions
  → render recent transactions
```

### 6.4 Sending money

```text
User opens transfer.html
  → sees available balance
  → enters receiver account + amount
  → instant validation runs on input/blur
  → submit
  → POST /api/bank/transfer with Bearer token
  → backend transaction commits
  → response: message + new balance
  → app.js updates localStorage balance
  → success alert shown
  → passbook will show the new row on next load
```

### 6.5 Logout

```text
User clicks Logout in the sidebar
  → clearSession()
      • remove securebank.token
      • remove securebank.user
  → window.location.replace("login.html")
```

Because the redirect uses `replace`, the protected page is not kept as the previous history entry in the same way as a normal navigation.

---

## 7. CREDIT vs DEBIT Rendering

The passbook is a single `transactions` list. The current user's perspective determines the direction.

```js
const isCredit = transaction.receiverAccount === accountNumber;
const direction = isCredit ? "CREDIT" : "DEBIT";
const counterparty = isCredit
    ? transaction.senderAccount
    : transaction.receiverAccount;
```

### Rules

| Condition | Direction | Color | Counterparty shown |
|---|---|---|---|
| `receiverAccount === user.accountNumber` | CREDIT | Green | Sender account |
| `senderAccount === user.accountNumber` | DEBIT | Red | Receiver account |

Self-transfers are blocked by the backend, so a transaction should not be both credit and debit for the same user. The code checks credit first.

### Rendering snippet

```js
const typeIcon = isCredit ? "bi-arrow-down-left" : "bi-arrow-up-right";

return `
    <tr>
        <td>
            <div class="txn-date">${escapeHtml(timestamp.date)}</div>
            <div class="txn-time">${escapeHtml(timestamp.time)}</div>
        </td>
        <td>
            <span class="type-badge ${isCredit ? "credit" : "debit"}">
                <i class="bi ${typeIcon}"></i>${direction}
            </span>
        </td>
        <td><span class="counterparty">${escapeHtml(counterparty || "—")}</span></td>
        <td class="text-end amount ${isCredit ? "amount-credit" : "amount-debit"}">
            ${isCredit ? "+" : "-"}${escapeHtml(formatCurrency(transaction.amount))}
        </td>
        <td class="text-end">
            <span class="status-badge ${statusClass}">${escapeHtml(titleCase(status))}</span>
        </td>
    </tr>
`;
```

### CSS classes

```css
.type-badge.credit { color: var(--green-dark); background: var(--green-soft); }
.type-badge.debit  { color: #b91c1c; background: var(--red-soft); }

.amount-credit { color: var(--green); }
.amount-debit  { color: var(--red); }
```

### Status badges

| Status | Class | Meaning |
|---|---|---|
| `SUCCESS` | `.status-badge.success` | Green pill |
| `PENDING` | `.status-badge.pending` | Amber pill |
| Anything else | `.status-badge.failed` | Red pill |

The backend currently writes `SUCCESS` for completed transfers, but the UI is ready for future states.

---

## 8. Frontend Security Notes

### 8.1 What is stored

| Stored? | Data |
|---|---|
| Yes | JWT token (`securebank.token`) |
| Yes | Basic user snapshot: name, email, account number, balance, role |
| No | Password |
| No | Database credentials |
| No | JWT signing secret |

### 8.2 Why the Authorization header matters

The backend does not use cookies or server sessions. Every protected request must explicitly include:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

`apiRequest()` adds this automatically from localStorage. If the token is missing, expired, or invalid, the backend rejects the request and the frontend clears the session.

### 8.3 XSS protection in rendering

Dynamic transaction values are escaped before insertion into HTML templates:

```js
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };
        return replacements[character];
    });
}
```

User profile fields are written with `textContent`, which does not interpret HTML. This reduces the risk of script injection through names or error messages.

### 8.4 localStorage trade-off

`localStorage` is easy to use and survives page reloads, but it is readable by any JavaScript running on the page. If an attacker achieves XSS, they can steal the token.

Production improvements:

- Store tokens in `HttpOnly`, `Secure`, `SameSite` cookies instead.
- Add a strict Content Security Policy (CSP).
- Use short-lived access tokens and refresh-token rotation.
- Serve the frontend and API over HTTPS.
- Never render untrusted HTML with `innerHTML` unless sanitized.

> **Hinglish:** localStorage simple hai, lekin XSS ke case mein token chori ho sakta hai. Real banking app mein HttpOnly cookie + CSRF protection better hota hai. Interview mein ye trade-off zaroor mention karo.

### 8.5 Client validation is not security

The transfer page checks the receiver format and amount, but a user can bypass the UI with curl/Postman. The backend independently validates:

- amount > 0
- receiver exists
- not a self-transfer
- sufficient balance

That is why the service layer is the real enforcement point.

### 8.6 CORS and local development

The backend currently allows all origins so the static frontend can call it from `file://` or a local dev server. In production, CORS should be restricted to the exact frontend origin, and HTTPS should be mandatory.

---

## 9. Frontend Interview Pointers

**Q1. Why use a single shared `app.js` instead of one script per page?**
It centralizes session handling, API calls, formatting, and rendering helpers. Page differences are handled by `data-page`/`data-protected` attributes and page-specific initialization. This avoids duplicated fetch/auth logic.

**Q2. How does the frontend know whether to show CREDIT or DEBIT?**
It compares the logged-in user's account number with `transaction.receiverAccount` and `transaction.senderAccount`. Receiver match → CREDIT (green). Sender match → DEBIT (red). The counterparty is the other side of the transaction.

**Q3. Why store the JWT in localStorage?**
For a simple demo it is convenient and persists across reloads. The trade-off is XSS exposure. A production banking app should prefer HttpOnly cookies, CSP, short expiry, and refresh-token rotation.

**Q4. How are expired sessions handled?**
`apiRequest()` detects HTTP 401/403, clears localStorage, and redirects to `login.html?expired=1`, where the login page shows an info message. The backend still enforces token validity on every protected request.

**Q5. Is the frontend validation enough for a transfer?**
No. It improves UX by catching mistakes early, but a client can bypass it. The backend repeats all critical checks inside `BankService.transferMoney()` and wraps them in a database transaction.

**Q6. How does the frontend handle API errors?**
The backend returns `{"error": "..."}` with HTTP 400. `apiRequest()` parses the body and throws an `Error` with that message. Forms catch it and show a red alert; login/register share `#authAlert`, transfer uses `#transferAlert`.

**Q7. Why is the account number a string?**
It contains letters (`SB`) and meaningful leading zeros. Treating it as a number would lose formatting and could change its identity. It is displayed and copied as text.

---

## 10. Hinglish Revision Box

- **Pages:** `login.html` (public), `dashboard.html`, `transfer.html`, `history.html`, `profile.html` (protected).
- **Shared files:** `css/style.css` for theme/responsive layout; `js/app.js` for auth/API/rendering.
- **Token key:** `securebank.token`; **user key:** `securebank.user`.
- **Guard:** `data-protected="true"` + token check → otherwise `login.html`.
- **API wrapper:** Adds `Authorization: Bearer <token>`, parses JSON, handles 401/403, shows friendly errors.
- **Dashboard:** profile + last 5 transactions; account copy button; live balance.
- **Transfer:** receiver format `SB` + 8 digits; amount > 0; max 2 decimals; balance check; self-transfer block; success/error banner.
- **History:** full passbook; newest first; CREDIT green when receiver matches; DEBIT red when sender matches.
- **Profile:** name, email, account number, role, “JWT + BCrypt Active.”
- **Logout:** clear localStorage + redirect.
- **Security line:** “Frontend validation is UX; backend validation and database transactions are security.”
