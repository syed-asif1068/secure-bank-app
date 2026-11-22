"use strict";

const API_BASE = "https://secure-bank-app-s73t.onrender.com/api";
const TOKEN_KEY = "securebank.token";
const USER_KEY = "securebank.user";

const page = document.body.dataset.page || "";
const isProtectedPage = document.body.dataset.protected === "true";

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric"
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit"
});

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

/* ---------- Session storage ---------- */
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

function storeUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function updateStoredUser(partial) {
    storeUser({ ...getUser(), ...partial });
}

function saveSession(data) {
    if (data.token) {
        localStorage.setItem(TOKEN_KEY, data.token);
    }

    storeUser({
        fullName: data.fullName || "",
        email: data.email || "",
        accountNumber: data.accountNumber || "",
        balance: data.balance ?? 0,
        role: data.role || "CUSTOMER"
    });
}

function saveProfile(profile) {
    storeUser({
        fullName: profile.fullName || "",
        email: profile.email || "",
        accountNumber: profile.accountNumber || "",
        balance: profile.balance ?? 0,
        role: profile.role || "CUSTOMER"
    });
}

function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

function redirectToLogin(expired = false) {
    window.location.replace(expired ? "login.html?expired=1" : "login.html");
}

/* ---------- API ---------- */
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

/* ---------- Global actions ---------- */
function bindGlobalActions() {
    document.querySelectorAll('[data-action="logout"]').forEach((button) => {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            clearSession();
            redirectToLogin();
        });
    });

    document.querySelectorAll('[data-action="toggle-sidebar"]').forEach((button) => {
        button.addEventListener("click", () => {
            document.body.classList.toggle("sidebar-open");
        });
    });

    document.querySelectorAll('[data-action="close-sidebar"]').forEach((element) => {
        element.addEventListener("click", () => {
            document.body.classList.remove("sidebar-open");
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            document.body.classList.remove("sidebar-open");
        }
    });

    const copyButton = document.getElementById("copyAccountBtn");
    if (copyButton) {
        copyButton.addEventListener("click", copyAccountNumber);
    }
}

function initPasswordToggles() {
    document.querySelectorAll("[data-toggle-password]").forEach((button) => {
        button.addEventListener("click", () => {
            const input = document.querySelector(button.dataset.togglePassword);
            if (!input) {
                return;
            }

            const showPassword = input.type === "password";
            input.type = showPassword ? "text" : "password";

            const icon = button.querySelector("i");
            if (icon) {
                icon.className = showPassword ? "bi bi-eye-slash" : "bi bi-eye";
            }

            button.setAttribute("aria-label", showPassword ? "Hide password" : "Show password");
        });
    });
}

async function copyAccountNumber() {
    const accountNumber = getUser().accountNumber
        || document.getElementById("accountNumber")?.textContent?.trim();

    if (!accountNumber || accountNumber === "—") {
        return;
    }

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(accountNumber);
        } else {
            fallbackCopy(accountNumber);
        }
        flashCopyButton();
    } catch (error) {
        fallbackCopy(accountNumber);
        flashCopyButton();
    }
}

function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand("copy");
    } finally {
        textarea.remove();
    }
}

function flashCopyButton() {
    const button = document.getElementById("copyAccountBtn");
    if (!button) {
        return;
    }

    const label = button.querySelector("span");
    if (!label) {
        return;
    }

    const originalLabel = label.textContent;
    label.textContent = "Copied";
    button.classList.add("copied");

    window.setTimeout(() => {
        label.textContent = originalLabel;
        button.classList.remove("copied");
    }, 1600);
}

/* ---------- Auth page ---------- */
function initAuthPage() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("expired") === "1") {
        showAlert("authAlert", "Your session has expired. Please sign in again.", "info");
    }

    document.querySelectorAll('[data-bs-toggle="pill"]').forEach((tab) => {
        tab.addEventListener("shown.bs.tab", () => hideAlert("authAlert"));
    });

    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            hideAlert("authAlert");

            if (!loginForm.reportValidity()) {
                return;
            }

            const submitButton = loginForm.querySelector('button[type="submit"]');
            setLoading(submitButton, true, "Signing in...");

            try {
                const data = await apiRequest("/auth/login", {
                    method: "POST",
                    body: {
                        email: document.getElementById("loginEmail").value.trim(),
                        password: document.getElementById("loginPassword").value
                    }
                });

                saveSession(data);
                window.location.href = "dashboard.html";
            } catch (error) {
                showAlert("authAlert", error.message, "danger");
                setLoading(submitButton, false);
            }
        });
    }

    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
        registerForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            hideAlert("authAlert");

            if (!registerForm.reportValidity()) {
                return;
            }

            const submitButton = registerForm.querySelector('button[type="submit"]');
            setLoading(submitButton, true, "Creating account...");

            try {
                const data = await apiRequest("/auth/register", {
                    method: "POST",
                    body: {
                        fullName: document.getElementById("registerFullName").value.trim(),
                        email: document.getElementById("registerEmail").value.trim(),
                        password: document.getElementById("registerPassword").value
                    }
                });

                saveSession(data);
                window.location.href = "dashboard.html";
            } catch (error) {
                showAlert("authAlert", error.message, "danger");
                setLoading(submitButton, false);
            }
        });
    }
}

/* ---------- Protected pages ---------- */
function initProtectedPage() {
    renderUserChrome(getUser());

    if (page === "transfer") {
        initTransferPage();
    }

    loadProfile();
}

async function loadProfile() {
    try {
        const profile = await apiRequest("/bank/profile");
        saveProfile(profile);
        renderUserChrome(getUser());

        if (page === "dashboard") {
            await loadRecentTransactions();
        } else if (page === "history") {
            await loadTransactionHistory();
        }
    } catch (error) {
        showAlert("pageAlert", error.message, "danger");
    }
}

function renderUserChrome(user) {
    const currentUser = user || {};

    document.querySelectorAll('[data-user="fullName"]').forEach((element) => {
        element.textContent = currentUser.fullName || "Account Holder";
    });

    document.querySelectorAll('[data-user="email"]').forEach((element) => {
        element.textContent = currentUser.email || "—";
    });

    document.querySelectorAll('[data-user="accountNumber"]').forEach((element) => {
        element.textContent = currentUser.accountNumber || "—";
    });

    document.querySelectorAll('[data-user="balance"]').forEach((element) => {
        element.textContent = formatCurrency(currentUser.balance);
    });

    document.querySelectorAll('[data-user="role"]').forEach((element) => {
        element.textContent = titleCase(currentUser.role || "CUSTOMER");
    });

    document.querySelectorAll("[data-user-initials]").forEach((element) => {
        element.textContent = getInitials(currentUser.fullName);
    });
}

/* ---------- Transactions ---------- */
async function loadRecentTransactions() {
    const tbody = document.getElementById("recentTransactionsBody");
    const emptyState = document.getElementById("recentEmpty");
    if (!tbody) {
        return;
    }

    tbody.innerHTML = loadingRow(5, "Loading recent transactions...");

    try {
        const transactions = await apiRequest("/bank/transactions");
        const recent = Array.isArray(transactions) ? transactions.slice(0, 5) : [];

        if (recent.length === 0) {
            tbody.innerHTML = "";
            emptyState?.classList.remove("d-none");
            return;
        }

        emptyState?.classList.add("d-none");
        tbody.innerHTML = recent
            .map((transaction) => transactionRow(transaction, getUser().accountNumber))
            .join("");
    } catch (error) {
        tbody.innerHTML = "";
        showAlert("pageAlert", error.message, "danger");
    }
}

async function loadTransactionHistory() {
    const tbody = document.getElementById("historyBody");
    const emptyState = document.getElementById("historyEmpty");
    const count = document.getElementById("historyCount");
    if (!tbody) {
        return;
    }

    tbody.innerHTML = loadingRow(5, "Loading passbook...");

    try {
        const transactions = await apiRequest("/bank/transactions");
        const list = Array.isArray(transactions) ? transactions : [];

        if (count) {
            count.textContent = `${list.length} ${list.length === 1 ? "transaction" : "transactions"}`;
        }

        if (list.length === 0) {
            tbody.innerHTML = "";
            emptyState?.classList.remove("d-none");
            return;
        }

        emptyState?.classList.add("d-none");
        tbody.innerHTML = list
            .map((transaction) => transactionRow(transaction, getUser().accountNumber))
            .join("");
    } catch (error) {
        tbody.innerHTML = "";
        showAlert("pageAlert", error.message, "danger");
    }
}

function transactionRow(transaction, accountNumber) {
    const isCredit = transaction.receiverAccount === accountNumber;
    const direction = isCredit ? "CREDIT" : "DEBIT";
    const counterparty = isCredit ? transaction.senderAccount : transaction.receiverAccount;
    const timestamp = formatTransactionDate(transaction.timestamp);
    const status = String(transaction.status || "SUCCESS").toUpperCase();
    const statusClass = status === "SUCCESS" ? "success" : status === "PENDING" ? "pending" : "failed";
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
}

function loadingRow(columns, message) {
    return `
        <tr>
            <td colspan="${columns}" class="text-center py-4 text-muted">
                <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                ${escapeHtml(message)}
            </td>
        </tr>
    `;
}

/* ---------- Transfer page ---------- */
function initTransferPage() {
    const form = document.getElementById("transferForm");
    if (!form) {
        return;
    }

    const receiverInput = document.getElementById("receiverAccountNumber");
    const amountInput = document.getElementById("amount");
    const receiverError = document.getElementById("receiverError");
    const amountError = document.getElementById("amountError");
    const submitButton = document.getElementById("transferSubmit");

    receiverInput.addEventListener("input", () => {
        receiverInput.value = receiverInput.value.toUpperCase().replace(/\s+/g, "");
        validateReceiver(receiverInput, receiverError);
    });

    receiverInput.addEventListener("blur", () => validateReceiver(receiverInput, receiverError));
    amountInput.addEventListener("input", () => validateAmount(amountInput, amountError));
    amountInput.addEventListener("blur", () => validateAmount(amountInput, amountError));

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideAlert("transferAlert");

        const receiverValid = validateReceiver(receiverInput, receiverError);
        const amountValid = validateAmount(amountInput, amountError);

        if (!receiverValid || !amountValid) {
            showAlert("transferAlert", "Please fix the highlighted fields before sending.", "danger");
            return;
        }

        setLoading(submitButton, true, "Processing transfer...");

        try {
            const data = await apiRequest("/bank/transfer", {
                method: "POST",
                body: {
                    receiverAccountNumber: receiverInput.value.trim(),
                    amount: Number(amountInput.value)
                }
            });

            updateStoredUser({ balance: data.balance });
            renderUserChrome(getUser());
            showAlert(
                "transferAlert",
                `Transfer successful. Your updated balance is ${formatCurrency(data.balance)}.`,
                "success"
            );

            form.reset();
            clearFieldState(receiverInput, receiverError);
            clearFieldState(amountInput, amountError);
        } catch (error) {
            showAlert("transferAlert", error.message, "danger");
        } finally {
            setLoading(submitButton, false);
        }
    });
}

function validateReceiver(input, errorElement) {
    const value = input.value.trim();
    let message = "";

    if (!value) {
        message = "Receiver account number is required.";
    } else if (!/^SB\d{8}$/.test(value)) {
        message = "Enter a valid account number: SB followed by 8 digits.";
    } else if (value === (getUser().accountNumber || "")) {
        message = "You cannot transfer money to your own account.";
    }

    setFieldState(input, errorElement, message);
    return message === "";
}

function validateAmount(input, errorElement) {
    const rawValue = input.value.trim();
    const amount = Number(rawValue);
    const balance = Number(getUser().balance);
    let message = "";

    if (!rawValue) {
        message = "Amount is required.";
    } else if (!Number.isFinite(amount) || amount <= 0) {
        message = "Enter an amount greater than zero.";
    } else if (!/^\d+(\.\d{1,2})?$/.test(rawValue)) {
        message = "Use a valid amount with up to 2 decimal places.";
    } else if (Number.isFinite(balance) && amount > balance) {
        message = "Amount exceeds your available balance.";
    }

    setFieldState(input, errorElement, message);
    return message === "";
}

function setFieldState(input, errorElement, message) {
    const isInvalid = message !== "";
    input.classList.toggle("is-invalid", isInvalid);
    input.classList.toggle("is-valid", !isInvalid && input.value.trim() !== "");

    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.toggle("d-none", !isInvalid);
    }
}

function clearFieldState(input, errorElement) {
    input.classList.remove("is-invalid", "is-valid");

    if (errorElement) {
        errorElement.textContent = "";
        errorElement.classList.add("d-none");
    }
}

/* ---------- UI helpers ---------- */
function showAlert(elementId, message, variant = "danger") {
    const element = document.getElementById(elementId);
    if (!element) {
        return;
    }

    const icon = variant === "success"
        ? "bi-check-circle-fill"
        : variant === "info"
            ? "bi-info-circle-fill"
            : "bi-exclamation-triangle-fill";

    element.className = `alert alert-${variant} d-flex align-items-start gap-2`;
    element.innerHTML = `<i class="bi ${icon}"></i><div>${escapeHtml(message)}</div>`;
}

function hideAlert(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
        return;
    }

    element.className = "alert d-none";
    element.innerHTML = "";
}

function setLoading(button, isLoading, label) {
    if (!button) {
        return;
    }

    if (isLoading) {
        if (!button.dataset.originalHtml) {
            button.dataset.originalHtml = button.innerHTML;
        }
        button.disabled = true;
        button.innerHTML = `
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            ${escapeHtml(label || "Please wait...")}
        `;
        return;
    }

    button.disabled = false;
    if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
    }
}

function formatCurrency(value) {
    const amount = Number(value);
    return currencyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

function formatTransactionDate(value) {
    let date;

    if (Array.isArray(value)) {
        const [year, month = 1, day = 1, hour = 0, minute = 0, second = 0] = value;
        date = new Date(year, month - 1, day, hour, minute, second);
    } else {
        date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) {
        return { date: "—", time: "" };
    }

    return {
        date: dateFormatter.format(date),
        time: timeFormatter.format(date)
    };
}

function getInitials(name) {
    if (!name) {
        return "SB";
    }

    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join("")
        .toUpperCase();
}

function titleCase(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

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
