# SecureBank — Backend Security & APIs

> **Stack:** Java 17, Spring Boot 3.3.5, Spring Security, Spring Data JPA, Hibernate, PostgreSQL, JJWT 0.11.5
> **Style:** No Lombok — every getter, setter, and constructor is written explicitly.
> **Purpose:** A complete, interview-ready walkthrough of the backend layers, JWT/BCrypt security, transaction handling, and REST APIs.

---

## 0. Hinglish Quick Revision

- **Layers:** Controller → Service → Repository → Database. Controller HTTP handle karta hai, Service business rules, Repository DB queries.
- **BCrypt:** Password kabhi plain text store nahi hota. BCrypt salted one-way hash banata hai; login par `matches()` se verify hota hai.
- **JWT:** Login ke baad server signed token deta hai. Har protected request mein `Authorization: Bearer <token>` jaata hai. Server signature + expiry check karta hai.
- **Stateless:** Server session nahi rakhta. Token hi identity hai. Logout par frontend token delete karta hai.
- **@Transactional:** Transfer ke andar debit + credit + ledger insert ek atomic unit hain. Koi RuntimeException aayi to sab rollback.
- **Interview line:** “Spring Security authenticates the request; the service layer enforces the banking rules; PostgreSQL guarantees durability and atomicity.”

---

## 1. Backend at a Glance

| Item | Value |
|---|---|
| Language | Java 17 |
| Framework | Spring Boot 3.3.5 |
| Build tool | Maven |
| Web | Spring MVC / REST |
| Security | Spring Security + JJWT 0.11.5 |
| Persistence | Spring Data JPA + Hibernate |
| Database | Supabase PostgreSQL |
| Password hashing | BCrypt (`BCryptPasswordEncoder`) |
| Authentication style | Stateless JWT (no server session) |
| API port | `8080` |
| Frontend origin | Any (CORS currently allows all origins for development) |

### The 14 core backend files

The backend is made of **14 core source/configuration files**: **12 Java files** plus **2 configuration files** (`pom.xml` and `application.properties`). The table in Section 3 covers all of them.

> **Note:** If a project brief says “14 Java files,” the two configuration files are sometimes counted loosely. In this workspace there are 12 `.java` files; the complete backend file set is 14 when configuration is included.

---

## 2. Layered Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                     HTTP REQUEST                            │
│         POST /api/bank/transfer + Bearer JWT                │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   SECURITY FILTER CHAIN                     │
│  JwtFilter → validates token → loads user → sets context    │
│  SecurityConfig → route rules, CORS, CSRF, session policy   │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      CONTROLLER LAYER                       │
│  AuthController              BankController                 │
│  • Read request body         • Read Authentication          │
│  • Call service              • Parse amount                 │
│  • Map errors to HTTP 400    • Return JSON                  │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       SERVICE LAYER                         │
│  AuthService                  BankService                   │
│  • Register/login             • Profile                     │
│  • BCrypt + JWT               • Transfer (@Transactional)   │
│  • Account generation         • Transaction history         │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     REPOSITORY LAYER                        │
│  UserRepository               TransactionRepository         │
│  Spring Data JPA derived queries + JpaRepository methods    │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 JPA / HIBERNATE + JDBC                      │
│  Entity mappings, SQL generation, connection pooling        │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE POSTGRESQL                      │
│  users + transactions                                       │
└─────────────────────────────────────────────────────────────┘
```

### Why this layering?

| Layer | Responsibility | Must not do |
|---|---|---|
| Controller | HTTP contract, status codes, request/response mapping | Business rules or direct SQL |
| Service | Banking rules, transaction boundaries, orchestration | Know about HTTP status codes |
| Repository | Data access | Business decisions |
| Entity | Table mapping and persisted state | HTTP or business logic |
| Security | Identity, token validation, route protection | Banking business logic |

> **Hinglish:** Controller ko sirf itna pata hona chahiye ki request kaisi aayi aur response kaisa jaana hai. “Balance kaafi hai ya nahi” ye Service ka kaam hai. “Database se user kaise laana hai” ye Repository ka kaam hai.

---

## 3. File-by-File Guide

### 3.1 Configuration and bootstrap

| # | File | Layer | Responsibility |
|---|---|---|---|
| 1 | `pom.xml` | Build | Declares Spring Boot 3.3.5 parent, Java 17, web/security/JPA/validation starters, PostgreSQL driver, JJWT API/impl/jackson `0.11.5`, test dependencies, and the Spring Boot Maven plugin. |
| 2 | `src/main/resources/application.properties` | Config | Server port, Supabase JDBC URL, PostgreSQL driver, Hibernate `validate` mode, SQL logging, dialect, `open-in-view=false`, JWT secret and 24-hour expiration. |
| 3 | `com/bank/SecureBankApplication.java` | Bootstrap | `@SpringBootApplication` main class. Starts embedded Tomcat and component scanning from `com.bank`. |

### 3.2 Entity layer

| # | File | Layer | Responsibility |
|---|---|---|---|
| 4 | `entity/User.java` | Entity | Maps `users`. Fields: `id`, `fullName`, `email`, `password`, `accountNumber`, `balance`, `role`, `createdAt`. Includes no-arg/all-arg constructors, getters/setters, and `@PrePersist` defaults. |
| 5 | `entity/Transaction.java` | Entity | Maps `transactions`. Fields: `id`, `senderAccount`, `receiverAccount`, `amount`, `transactionType`, `status`, `timestamp`. Includes constructors, getters/setters, and `@PrePersist` defaults. |

**`User` mapping details:**

| Java field | Column | Notes |
|---|---|---|
| `id` | `id` | `@Id`, `@GeneratedValue(strategy = IDENTITY)` |
| `fullName` | `full_name` | Not null |
| `email` | `email` | Not null, unique |
| `password` | `password` | Stores BCrypt hash, never plain text |
| `accountNumber` | `account_number` | Not null, unique, `SB` + 8 digits |
| `balance` | `balance` | `BigDecimal` |
| `role` | `role` | Defaults to `CUSTOMER` |
| `createdAt` | `created_at` | `LocalDateTime`, set on persist |

**`Transaction` mapping details:**

| Java field | Column | Notes |
|---|---|---|
| `id` | `id` | Identity primary key |
| `senderAccount` | `sender_account` | Source account snapshot |
| `receiverAccount` | `receiver_account` | Destination account snapshot |
| `amount` | `amount` | `BigDecimal` |
| `transactionType` | `transaction_type` | `TRANSFER` |
| `status` | `status` | Defaults to `SUCCESS` |
| `timestamp` | `timestamp` | Set on persist |

`@PrePersist` is a JPA lifecycle callback. It runs just before the first `INSERT`:

```java
@PrePersist
protected void onCreate() {
    if (this.createdAt == null) {
        this.createdAt = LocalDateTime.now();
    }
    if (this.role == null || this.role.isBlank()) {
        this.role = "CUSTOMER";
    }
    if (this.balance == null) {
        this.balance = BigDecimal.ZERO;
    }
}
```

### 3.3 Repository layer

| # | File | Layer | Responsibility |
|---|---|---|---|
| 6 | `repository/UserRepository.java` | Repository | `JpaRepository<User, Long>` plus `findByEmail`, `findByAccountNumber`, and `existsByEmail`. Spring Data generates the SQL from method names. |
| 7 | `repository/TransactionRepository.java` | Repository | `JpaRepository<Transaction, Long>` plus `findBySenderAccountOrReceiverAccountOrderByTimestampDesc(...)` for the passbook. |

**How derived queries work:**

```java
Optional<User> findByEmail(String email);
// select * from users where email = ?

Optional<User> findByAccountNumber(String accountNumber);
// select * from users where account_number = ?

boolean existsByEmail(String email);
// select count(*) > 0 ... or an existence query

List<Transaction> findBySenderAccountOrReceiverAccountOrderByTimestampDesc(
        String senderAccount, String receiverAccount);
// where sender_account = ? or receiver_account = ?
// order by timestamp desc
```

No SQL strings are written manually. Spring Data creates a proxy implementation at startup. This keeps the repository small and type-safe.

### 3.4 Security layer

| # | File | Layer | Responsibility |
|---|---|---|---|
| 8 | `security/JwtUtil.java` | Security | Builds the HMAC signing key from the Base64 secret, generates JWTs, extracts the email subject, and validates signature/expiry. |
| 9 | `security/JwtFilter.java` | Security | `OncePerRequestFilter` that reads `Authorization: Bearer ...`, validates the token, loads the user, and places an authenticated principal in the `SecurityContext`. |
| 10 | `security/SecurityConfig.java` | Security | Defines the `SecurityFilterChain`, CORS, stateless session policy, public/protected routes, filter order, BCrypt bean, and disables duplicate servlet auto-registration of the JWT filter. |

### 3.5 Service layer

| # | File | Layer | Responsibility |
|---|---|---|---|
| 11 | `service/AuthService.java` | Service | Registration and login. Normalizes email, checks duplicates, hashes passwords, generates unique account numbers, assigns the initial balance, creates JWTs, and returns user details. |
| 12 | `service/BankService.java` | Service | Profile lookup, transactional money transfer, and transaction history. Enforces positive amount, self-transfer block, and sufficient balance. |

### 3.6 Controller layer

| # | File | Layer | Responsibility |
|---|---|---|---|
| 13 | `controller/AuthController.java` | Controller | Exposes `POST /api/auth/register` and `POST /api/auth/login`. Reads JSON maps, calls `AuthService`, returns `200 OK`, and maps `RuntimeException` to `400 Bad Request` with `{"error": "..."}`. |
| 14 | `controller/BankController.java` | Controller | Exposes `GET /api/bank/profile`, `POST /api/bank/transfer`, and `GET /api/bank/transactions`. Reads the logged-in email from `Authentication`, parses the amount to `BigDecimal`, and maps errors to JSON. |

---

## 4. Request Flows

### 4.1 Registration flow

```text
POST /api/auth/register
{ "fullName": "Aman Sharma", "email": "aman@example.com", "password": "secret123" }
        │
        ▼
SecurityConfig: /api/auth/** is permitAll
        │
        ▼
AuthController.register()
  • Converts body values to strings
  • Calls AuthService.register(...)
        │
        ▼
AuthService.register()
  1. Validate fullName, email, password are not blank
  2. Normalize email: trim + lowercase
  3. userRepository.existsByEmail(...)
       → true? throw "Email already registered"
  4. passwordEncoder.encode(password)
       → BCrypt hash with random salt
  5. generateUniqueAccountNumber()
       → SecureRandom 8 digits, prefix "SB", check DB for collision
  6. Set initial balance = new BigDecimal("5000.00")
  7. Set role = "CUSTOMER", createdAt = now
  8. userRepository.save(user)
  9. jwtUtil.generateToken(user.getEmail())
 10. Return Map: token, fullName, email, accountNumber, balance
        │
        ▼
HTTP 200 OK
```

Important details:

- Email is normalized before duplicate checks and before saving. This avoids `Aman@x.com` and `aman@x.com` becoming two accounts.
- The raw password is **never** stored. Only the BCrypt hash is saved.
- Account number generation uses `SecureRandom`, not `Math.random()`, because account identifiers should not be predictable.
- The initial balance is a business decision in code (`5000.00`), not a user-supplied value.
- If the email already exists or validation fails, the service throws `RuntimeException`; the controller returns HTTP 400.

### 4.2 Login flow

```text
POST /api/auth/login
{ "email": "aman@example.com", "password": "secret123" }
        │
        ▼
AuthController.login()
        │
        ▼
AuthService.login()
  1. Reject blank email/password with "Invalid email or password"
  2. Normalize email
  3. userRepository.findByEmail(...)
       → not found? throw "Invalid email or password"
  4. passwordEncoder.matches(rawPassword, storedHash)
       → false? throw "Invalid email or password"
  5. Generate a fresh JWT
  6. Return token + user details
```

The same generic error is used for “unknown email” and “wrong password.” This avoids leaking whether an email is registered (user enumeration).

### 4.3 Authenticated API request

```text
GET /api/bank/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
        │
        ▼
JwtFilter.doFilterInternal()
  1. Read Authorization header
  2. Check "Bearer " prefix
  3. Check SecurityContext is empty
  4. jwtUtil.validateToken(token)
       → checks signature and expiry
  5. jwtUtil.extractEmail(token)
  6. userRepository.findByEmail(email)
  7. Build UsernamePasswordAuthenticationToken:
       principal = user email
       credentials = null
       authorities = [ROLE_CUSTOMER]
  8. Set Authentication in SecurityContextHolder
        │
        ▼
SecurityConfig authorization rule:
  /api/bank/** requires authentication → allowed
        │
        ▼
BankController.getProfile(Authentication authentication)
  • authentication.getName() returns the email
  • BankService loads the user by that email
        │
        ▼
HTTP 200 OK with profile JSON
```

Key security point: the controller gets the user identity from `Authentication`, not from a request parameter. A malicious client cannot ask for another user's profile by changing an email in the URL.

### 4.4 Money transfer flow

```text
POST /api/bank/transfer
Authorization: Bearer <JWT>
{ "receiverAccountNumber": "SB87654321", "amount": 500.00 }
        │
        ▼
JwtFilter authenticates the request
        │
        ▼
BankController.transfer()
  • authentication.getName() → sender email
  • parseAmount(500.00) → BigDecimal
  • bankService.transferMoney(senderEmail, receiverAccount, amount)
        │
        ▼
BankService.transferMoney()  [@Transactional]
  1. amount != null && amount > 0
  2. receiverAccountNumber not blank
  3. normalize scale to 2 decimals (HALF_UP)
  4. find sender by email
  5. find receiver by account number
  6. sender account != receiver account
  7. sender.balance >= amount
  8. sender.balance -= amount
  9. receiver.balance += amount
 10. save sender
 11. save receiver
 12. insert Transaction(status=SUCCESS, type=TRANSFER)
 13. return sender's new balance
        │
        ▼
HTTP 200 OK
{ "message": "Transfer successful", "balance": 4500.00 }
```

If any step throws `RuntimeException`, the whole transaction rolls back. No partial debit/credit is left behind.

---

## 5. Security Deep Dive

### 5.1 BCrypt password hashing

During registration:

```java
user.setPassword(passwordEncoder.encode(password));
```

During login:

```java
if (!passwordEncoder.matches(password, user.getPassword())) {
    throw new RuntimeException("Invalid email or password");
}
```

Why BCrypt?

| Property | BCrypt | MD5 / SHA-256 |
|---|---|---|
| Salt | Built into each hash | Must be added manually; easy to get wrong |
| Cost factor | Deliberately slow; tunable | Very fast, so brute force is cheap |
| Designed for passwords | Yes | No, general-purpose hash |
| Output | Includes algorithm, cost, salt, hash | Raw digest only |
| Rainbow tables | Ineffective because of per-password salt | Effective without a unique salt |

BCrypt is adaptive: as hardware gets faster, the cost factor can be increased. `new BCryptPasswordEncoder()` uses a default strength of 10. A BCrypt hash is about 60 characters, which is why the `password` column is `varchar(255)`.

> **Hinglish:** BCrypt sirf hash nahi karta, har password ke liye alag salt generate karta hai. Isliye do users ke same password hone par bhi hashes alag dikhte hain. `matches()` stored hash ke andar se salt nikaal kar comparison karta hai.

### 5.2 JWT structure

A JWT has three Base64URL parts:

```text
header.payload.signature
```

Example header:

```json
{ "alg": "HS256", "typ": "JWT" }
```

Example payload:

```json
{
  "sub": "aman@example.com",
  "iat": 1730000000,
  "exp": 1730086400
}
```

In this project:

| Claim | Meaning |
|---|---|
| `sub` | User's email (the identity used to load the user) |
| `iat` | Issued-at timestamp |
| `exp` | Expiry timestamp |
| Signature | HMAC-SHA256 over header + payload using the server's secret |

`JwtUtil` creates the signing key:

```java
this.signingKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(secret));
```

The secret is Base64-encoded 256-bit key material. `Keys.hmacShaKeyFor` returns a key suitable for HS256. The secret must stay on the server; if an attacker knows it, they can forge tokens.

Token generation:

```java
return Jwts.builder()
        .setSubject(email)
        .setIssuedAt(now)
        .setExpiration(expiryDate)
        .signWith(signingKey, SignatureAlgorithm.HS256)
        .compact();
```

Validation:

```java
public boolean validateToken(String token) {
    try {
        Claims claims = getClaims(token);
        return claims.getSubject() != null
                && claims.getExpiration() != null
                && claims.getExpiration().after(new Date());
    } catch (JwtException | IllegalArgumentException ex) {
        return false;
    }
}
```

`getClaims()` parses and verifies the signature. Expired, malformed, or tampered tokens throw and return `false`.

Expiration is configured as:

```properties
jwt.expiration=86400000
```

`86,400,000 ms = 24 hours`.

### 5.3 JwtFilter

`JwtFilter` extends `OncePerRequestFilter`, so it runs once per request.

```java
String header = request.getHeader("Authorization");

if (header != null
        && header.startsWith("Bearer ")
        && SecurityContextHolder.getContext().getAuthentication() == null) {

    String token = header.substring(7).trim();

    if (jwtUtil.validateToken(token)) {
        String email = jwtUtil.extractEmail(token);
        User user = userRepository.findByEmail(email).orElse(null);

        if (user != null) {
            String role = (user.getRole() == null || user.getRole().isBlank())
                    ? "CUSTOMER"
                    : user.getRole();

            var authentication = new UsernamePasswordAuthenticationToken(
                    user.getEmail(),
                    null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + role)));

            authentication.setDetails(
                    new WebAuthenticationDetailsSource().buildDetails(request));

            SecurityContextHolder.getContext().setAuthentication(authentication);
        }
    }
}

filterChain.doFilter(request, response);
```

Why load the user from the database on every request?

- It confirms the account still exists.
- It picks up the current role.
- It avoids trusting stale role data inside the token.

The principal is the email string. Controllers receive it via `Authentication.getName()`.

**Why `FilterRegistrationBean` disables auto-registration:**

`JwtFilter` is annotated with `@Component`, so Spring Boot would normally register it as a servlet filter automatically. It is also added to the Spring Security chain with `addFilterBefore`. Without disabling auto-registration, the filter would execute twice. `SecurityConfig` prevents this:

```java
@Bean
public FilterRegistrationBean<JwtFilter> jwtFilterRegistration(JwtFilter filter) {
    FilterRegistrationBean<JwtFilter> registration = new FilterRegistrationBean<>(filter);
    registration.setEnabled(false);
    return registration;
}
```

### 5.4 SecurityConfig

```java
http
    .csrf(AbstractHttpConfigurer::disable)
    .cors(Customizer.withDefaults())
    .sessionManagement(session -> session
            .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
    .authorizeHttpRequests(auth -> auth
            .requestMatchers("/api/auth/**").permitAll()
            .requestMatchers("/api/bank/**").authenticated()
            .anyRequest().permitAll())
    .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
    .httpBasic(AbstractHttpConfigurer::disable)
    .formLogin(AbstractHttpConfigurer::disable);
```

| Setting | Reason |
|---|---|
| CSRF disabled | The API is stateless and uses an `Authorization` header, not cookies. CSRF attacks rely on browsers automatically attaching credentials; a Bearer header is not automatically attached. |
| CORS enabled | The static frontend is served from a different origin (`file://` or another local port) than the API on `8080`. |
| `STATELESS` | No `HttpSession` and no `JSESSIONID`; every request must carry a JWT. |
| `/api/auth/**` permitAll | Registration and login must work before a token exists. |
| `/api/bank/**` authenticated | Profile, transfer, and history require a valid JWT. |
| `anyRequest().permitAll()` | Everything else is not part of the API surface; this keeps error pages and static resources accessible. |
| JWT filter before username/password filter | JWT authentication runs before Spring's form-login filter. |
| HTTP Basic and form login disabled | This is a JSON token API, not a browser form-login app. |
| BCrypt bean | `AuthService` injects `PasswordEncoder`; the concrete implementation is `BCryptPasswordEncoder`. |

**CORS details:**

```java
configuration.setAllowedOriginPatterns(List.of("*"));
configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
configuration.setAllowedHeaders(List.of("*"));
configuration.setAllowCredentials(true);
configuration.setMaxAge(3600L);
```

For production, replace `*` with the exact frontend domain, for example `https://app.securebank.com`. Allowing every origin is convenient for local development but too broad for a real bank.

### 5.5 Public vs protected endpoints

| Method | Endpoint | Authentication | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Create account and receive a JWT |
| POST | `/api/auth/login` | Public | Verify credentials and receive a JWT |
| GET | `/api/bank/profile` | Bearer JWT | Logged-in user's profile and balance |
| POST | `/api/bank/transfer` | Bearer JWT | Transfer money |
| GET | `/api/bank/transactions` | Bearer JWT | Logged-in user's passbook |

### 5.6 Logout and token expiry

There is no server-side session to invalidate. Logout is a client-side operation:

```js
localStorage.removeItem("securebank.token");
localStorage.removeItem("securebank.user");
window.location.replace("login.html");
```

The token remains technically valid until `exp`, but the client discards it. For a production bank, consider:

- Short-lived access tokens + refresh tokens.
- A server-side token revocation list or token version per user.
- HttpOnly, Secure, SameSite cookies instead of `localStorage`.
- Device/session management.

> **Hinglish:** JWT stateless hai, isliye logout par server ko batane ki zaroorat nahi hoti — client token delete kar deta hai. Lekin token chori ho jaye to expiry tak valid reh sakta hai. Isliye production mein short expiry aur refresh-token strategy use hoti hai.

---

## 6. `@Transactional` in `BankService.transferMoney()`

### 6.1 The code

```java
@Transactional
public BigDecimal transferMoney(String senderEmail,
                                String receiverAccountNumber,
                                BigDecimal amount) {
    if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
        throw new RuntimeException("Amount must be greater than zero");
    }
    if (receiverAccountNumber == null || receiverAccountNumber.isBlank()) {
        throw new RuntimeException("Receiver account number is required");
    }

    BigDecimal transferAmount = amount.setScale(2, RoundingMode.HALF_UP);
    if (transferAmount.compareTo(BigDecimal.ZERO) <= 0) {
        throw new RuntimeException("Amount must be greater than zero");
    }

    User sender = findUserByEmail(senderEmail);
    User receiver = userRepository.findByAccountNumber(receiverAccountNumber.trim())
            .orElseThrow(() -> new RuntimeException("Receiver account not found"));

    if (sender.getAccountNumber().equals(receiver.getAccountNumber())) {
        throw new RuntimeException("Cannot transfer money to your own account");
    }

    if (sender.getBalance().compareTo(transferAmount) < 0) {
        throw new RuntimeException("Insufficient balance");
    }

    sender.setBalance(sender.getBalance().subtract(transferAmount));
    receiver.setBalance(receiver.getBalance().add(transferAmount));

    userRepository.save(sender);
    userRepository.save(receiver);

    Transaction transaction = new Transaction();
    transaction.setSenderAccount(sender.getAccountNumber());
    transaction.setReceiverAccount(receiver.getAccountNumber());
    transaction.setAmount(transferAmount);
    transaction.setTransactionType("TRANSFER");
    transaction.setStatus("SUCCESS");
    transaction.setTimestamp(LocalDateTime.now());
    transactionRepository.save(transaction);

    return sender.getBalance();
}
```

### 6.2 What `@Transactional` actually does

Spring wraps the `BankService` bean in a proxy. When a controller calls `transferMoney()`, the proxy:

1. Gets a database connection from the pool.
2. Starts a transaction (`autoCommit=false`).
3. Invokes the method.
4. Commits if the method returns normally.
5. Rolls back if an unchecked exception (`RuntimeException` or `Error`) escapes.

All repository operations inside the method participate in the same transaction and persistence context.

> **Important:** Spring's default rollback rule is for **unchecked** exceptions. A checked exception would not roll back unless you specify `@Transactional(rollbackFor = Exception.class)`. In this code, every business failure throws `RuntimeException`, so rollback works.

### 6.3 The atomicity guarantee

Three database writes must succeed together:

1. `update users set balance = ... where id = sender`
2. `update users set balance = ... where id = receiver`
3. `insert into transactions ...`

If the ledger insert fails, the two balance updates are rolled back. The customer cannot end up with money deducted but no transaction record. If the second balance update fails, the first is rolled back as well.

**Without a transaction:**

- Sender loses money, receiver gets nothing.
- Sender and receiver both change, but no ledger row exists.
- A crash mid-way leaves inconsistent balances.

**With a transaction:**

- All three writes commit or none do.

### 6.4 Validation and business rules

| Check | Code | Purpose |
|---|---|---|
| Amount present and positive | `amount != null && amount.compareTo(BigDecimal.ZERO) > 0` | Reject null, zero, and negative values |
| Receiver account present | `receiverAccountNumber == null || isBlank()` | Avoid querying with an empty account |
| Two-decimal normalization | `setScale(2, RoundingMode.HALF_UP)` | Keep money consistent with `NUMERIC(19,2)` |
| Receiver exists | `findByAccountNumber(...).orElseThrow(...)` | Prevent transfers to unknown accounts |
| Self-transfer block | `sender.getAccountNumber().equals(receiver.getAccountNumber())` | A user cannot pay themselves |
| Sufficient balance | `sender.getBalance().compareTo(transferAmount) < 0` | Prevent overdrafts |
| Ledger row | `transactionRepository.save(...)` | Audit trail for every successful transfer |

### 6.5 Why `BigDecimal`, not `double`

```java
BigDecimal transferAmount = amount.setScale(2, RoundingMode.HALF_UP);
```

`BigDecimal` gives exact decimal arithmetic. `double` can produce values like `0.30000000000000004`, which is unacceptable for money. `setScale(2, HALF_UP)` matches the two-decimal database column.

> **Interview nuance:** The current code rounds to two decimals. A stricter API might reject amounts with more than two decimal places instead of silently rounding. Both are defensible; the important part is that the rule is explicit and consistent.

### 6.6 Concurrency caveat (important interview point)

The current implementation reads the sender's balance, checks it, and then writes the new balance. Under high concurrency, two simultaneous transfers could both read the same starting balance and both pass the check. This is a **lost update / race condition**.

Possible fixes:

1. **Optimistic locking:** add a `@Version` column to `User`; conflicting updates fail and can be retried.
2. **Pessimistic locking:** lock the sender row with `@Lock(PESSIMISTIC_WRITE)` in a repository method.
3. **Atomic SQL update:** `update users set balance = balance - :amount where id = :id and balance >= :amount`, then check the affected row count.
4. **Serializable isolation:** stronger isolation, but more contention and retries.
5. **Idempotency keys:** prevent the same transfer request from being applied twice on retries.

For a demo, the current checks are correct in normal single-request usage. For production, locking or atomic updates are essential.

### 6.7 `@Transactional` proxy caveat

`@Transactional` works through a Spring proxy. If `transferMoney()` were called from another method **inside the same class** (self-invocation), the proxy would be bypassed and the annotation might not apply. Here the call comes from `BankController`, a different bean, so the transaction is active.

---

## 7. REST API Contract

### 7.1 Register

```http
POST /api/auth/register
Content-Type: application/json
```

```json
{
  "fullName": "Aman Sharma",
  "email": "aman@example.com",
  "password": "secret123"
}
```

Success `200 OK`:

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "fullName": "Aman Sharma",
  "email": "aman@example.com",
  "accountNumber": "SB48291037",
  "balance": 5000.00
}
```

Failure `400 Bad Request`:

```json
{ "error": "Email already registered" }
```

### 7.2 Login

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "email": "aman@example.com",
  "password": "secret123"
}
```

Success `200 OK`: same shape as registration (token + user details).

Failure `400 Bad Request`:

```json
{ "error": "Invalid email or password" }
```

### 7.3 Profile

```http
GET /api/bank/profile
Authorization: Bearer <JWT>
```

Success `200 OK`:

```json
{
  "id": 1,
  "fullName": "Aman Sharma",
  "email": "aman@example.com",
  "accountNumber": "SB48291037",
  "balance": 4500.00,
  "role": "CUSTOMER"
}
```

### 7.4 Transfer

```http
POST /api/bank/transfer
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "receiverAccountNumber": "SB87654321",
  "amount": 500.00
}
```

Success `200 OK`:

```json
{
  "message": "Transfer successful",
  "balance": 4500.00
}
```

Common failures (`400 Bad Request`):

```json
{ "error": "Amount must be greater than zero" }
{ "error": "Receiver account not found" }
{ "error": "Cannot transfer money to your own account" }
{ "error": "Insufficient balance" }
```

### 7.5 Transaction history

```http
GET /api/bank/transactions
Authorization: Bearer <JWT>
```

Success `200 OK`:

```json
[
  {
    "id": 12,
    "senderAccount": "SB48291037",
    "receiverAccount": "SB87654321",
    "amount": 500.00,
    "transactionType": "TRANSFER",
    "status": "SUCCESS",
    "timestamp": "2026-11-22T14:30:00"
  }
]
```

The repository orders by `timestamp` descending, so the newest transaction appears first.

### 7.6 Error handling summary

| Situation | HTTP status | Body |
|---|---|---|
| Validation or business error in controller/service | `400 Bad Request` | `{"error": "..."}` |
| Missing/invalid JWT on `/api/bank/**` | `401` or `403` from Spring Security | Depends on Spring Security entry point |
| `Authentication` is null inside `BankController` | `401 Unauthorized` | `{"error": "Unauthorized"}` |
| Unexpected server/database failure | `500` (not explicitly handled) | Default Spring error response |

The controllers catch `RuntimeException` and return 400 with a readable message. For production, a `@RestControllerAdvice` with typed exceptions (e.g., `InsufficientBalanceException`) would give cleaner status codes and avoid exposing internal messages.

---

## 8. Top 5 Interview Questions & Answers

### Q1. Explain how JWT authentication works in this project, from login to a protected API call.

**Answer:**

1. The user submits email and password to `POST /api/auth/login`.
2. `AuthService` loads the user by email and verifies the password with `passwordEncoder.matches(rawPassword, storedHash)`.
3. If valid, `JwtUtil.generateToken(email)` builds a JWT with `sub=email`, `iat`, and `exp` (24 hours), signs it with HMAC-SHA256 using the server's Base64-decoded secret, and returns it.
4. The frontend stores the token in `localStorage` and sends it on protected requests as `Authorization: Bearer <token>`.
5. `JwtFilter` intercepts the request, checks the Bearer prefix, calls `validateToken()` to verify the signature and expiry, extracts the email, loads the user from `UserRepository`, and creates a `UsernamePasswordAuthenticationToken` with `ROLE_<role>`.
6. It stores that authentication in `SecurityContextHolder`.
7. `SecurityConfig` allows `/api/bank/**` only when the request is authenticated.
8. `BankController` reads the email from `Authentication.getName()` and passes it to the service.
9. Because the API is stateless, no session is created; the token is the identity on every request.

**Follow-up:** “What happens if the token is tampered with?” The signature check fails, `validateToken()` returns false, the request remains unauthenticated, and Spring Security rejects access to `/api/bank/**`.

### Q2. Why use BCrypt instead of MD5 or SHA-256 for passwords?

**Answer:**

MD5 and SHA-256 are fast general-purpose hashes. Fast hashing is bad for passwords because an attacker with a stolen database can try billions of guesses per second. They also require careful manual salting; if two users have the same password and no unique salt, their hashes are identical.

BCrypt is designed for password storage:

- It generates a unique random salt per hash.
- It is deliberately slow and has a tunable cost factor.
- The salt is embedded in the stored hash, so `matches()` can verify without storing a separate salt column.
- It resists rainbow-table attacks because identical passwords produce different hashes.

In this project, `passwordEncoder.encode()` stores the hash and `passwordEncoder.matches()` verifies the raw password. The plain password never touches the database.

### Q3. Why is `@Transactional` on `transferMoney()`, and what happens if the ledger insert fails?

**Answer:**

A transfer updates two user balances and inserts a transaction row. These three writes must be atomic. `@Transactional` makes Spring start a database transaction before the method and commit after it returns normally.

If `transactionRepository.save(transaction)` fails with a `RuntimeException`, the exception propagates out of `transferMoney()`. Spring's default rollback rule rolls back the entire transaction, including both balance updates. The database returns to its previous state: no money is deducted, no money is credited, and no ledger row exists.

If the method returns successfully, all three writes commit together. This prevents partial transfers and keeps the ledger consistent with balances.

**Follow-up:** “What about checked exceptions?” By default, Spring rolls back only for unchecked exceptions. We use `RuntimeException`, so rollback works. For checked exceptions, use `@Transactional(rollbackFor = Exception.class)`.

### Q4. How does the backend prevent invalid transfers such as negative amounts, self-transfers, or overspending?

**Answer:**

`BankService.transferMoney()` enforces server-side rules, independent of the frontend:

1. `amount == null || amount.compareTo(BigDecimal.ZERO) <= 0` → reject zero/negative/null.
2. `receiverAccountNumber` blank → reject.
3. Normalize the amount to two decimals with `setScale(2, RoundingMode.HALF_UP)`.
4. Load the receiver; if missing → reject.
5. Compare sender and receiver account numbers; if equal → reject self-transfer.
6. Compare sender balance with the transfer amount; if lower → reject with “Insufficient balance”.
7. Only then update balances and insert the ledger row.

The frontend also validates, but the backend never trusts client-side checks. A user can call the API directly with curl, so server-side enforcement is mandatory.

**Follow-up:** “Is this safe under concurrent requests?” Not fully. Two simultaneous requests could both read the same balance. Production would add pessimistic locking, optimistic `@Version` locking, or an atomic conditional SQL update.

### Q5. Why is the API stateless, and how does logout work without a server session?

**Answer:**

`SecurityConfig` sets `SessionCreationPolicy.STATELESS`, so Spring Security does not create or use an `HttpSession`. Every request must prove identity with a JWT. This makes the API easy to scale horizontally: any instance can validate the token without shared session storage.

Logout is handled on the client: the frontend removes the token and user details from `localStorage` and redirects to `login.html`. The server does not need a logout endpoint because it was never holding session state.

The trade-off is that a copied token remains valid until it expires. For a real bank, you would add short-lived access tokens, refresh tokens, token versioning/revocation, or HttpOnly cookies with CSRF protection.

---

## 9. Production Improvement Checklist

| Area | Current state | Production improvement |
|---|---|---|
| DTOs | Controllers accept `Map<String, Object>` | Use request/response DTOs with `@Valid` and Bean Validation |
| Error handling | Try/catch in each controller | `@RestControllerAdvice` with typed exceptions and consistent error codes |
| Token storage | `localStorage` | HttpOnly, Secure, SameSite cookies; or short-lived access + refresh tokens |
| Token revocation | None | Token version per user, denylist, or refresh-token rotation |
| CORS | Allow all origins | Restrict to the deployed frontend domain |
| Secrets | Values in `application.properties` | Environment variables / secrets manager; rotate regularly |
| CSRF | Disabled | Keep disabled for pure Bearer tokens; enable if using cookies |
| Concurrency | Read-check-write balance | Pessimistic/optimistic locking or atomic conditional update |
| Idempotency | None | Idempotency key on transfer requests |
| Rate limiting | None | Limit login attempts and transfer endpoints |
| Auditing | Basic ledger row | Add IP/user-agent/request-id, immutable audit log |
| Schema migrations | `ddl-auto=validate` | Flyway or Liquibase migrations in version control |
| Testing | No tests yet | Unit tests for services, `@WebMvcTest` for controllers, Testcontainers for PostgreSQL |
| Observability | `show-sql` | Structured logs, metrics, tracing, alerts |
| Transport | HTTP localhost | HTTPS everywhere |

---

## 10. Hinglish Revision Box

- **Controller:** Request/response ka translator. Business logic nahi.
- **Service:** Asli rules — email duplicate, password hash, balance check, self-transfer block, ledger entry.
- **Repository:** Spring Data JPA interface; method names se query generate hoti hai.
- **Entity:** Table ka Java representation; `@PrePersist` defaults set karta hai.
- **BCrypt:** Salted, slow, one-way. `encode()` registration mein, `matches()` login mein.
- **JWT:** `sub=email`, `iat`, `exp`, HS256 signature. Server secret se sign hota hai.
- **JwtFilter:** Bearer token → validate → user load → `SecurityContext` set.
- **SecurityConfig:** `/api/auth/**` public, `/api/bank/**` protected, session stateless, CSRF off, CORS on.
- **@Transactional:** Debit + credit + ledger insert = one atomic unit. RuntimeException → rollback.
- **BigDecimal:** Money ke liye. `double` kabhi nahi.
- **Race condition:** Do simultaneous transfers same balance read kar sakte hain; production mein locking chahiye.
- **Top interview line:** “The frontend validates for UX, the backend validates for security, and the database transaction guarantees atomicity.”
