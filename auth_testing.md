# Auth Testing Playbook — AuraMart Luxe

## Credentials
- Admin: ankitsingh638714@gmail.com / AuraLuxe@2026! (see /app/memory/test_credentials.md)

## Step 1: MongoDB Verification
```
mongosh
use test_database
db.users.find({role: "admin"}).pretty()
```
Verify bcrypt hash starts with `$2b$`, unique index on users.email, indexes on login_attempts.identifier/email, password_reset_tokens.token_hash (unique), password_reset_requests.created_at (TTL).

## Step 2: API Testing
```
curl -c cookies.txt -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" -d '{"email":"ankitsingh638714@gmail.com","password":"AuraLuxe@2026!"}'
curl -b cookies.txt http://localhost:8001/api/auth/me
curl -b cookies.txt http://localhost:8001/api/admin/orders
# Unauthenticated admin route must 401:
curl -i http://localhost:8001/api/admin/orders
```

## Step 3: Password Reset
Set FRONTEND_URL="http://localhost:3000" in /app/backend/.env, restart backend, then:
1. POST /api/auth/forgot-password with admin email — generic 200 response.
2. Read full reset link from backend log (loopback fallback prints it).
3. POST /api/auth/reset-password with token + new password. Verify new password logs in, old fails, token reuse fails.
4. Restore FRONTEND_URL to the https origin and restart.

## Step 4: Throttle & Lockout
- 5 failed logins on an email → 15 min lockout (429).
- 6 forgot-password requests for one address → only first 5 create tokens, all responses identical 200.
- After reset, lockout for that email is cleared.

## Step 5: UI Flow
- /admin/login → sign in → /admin dashboard
- /forgot-password and /reset-password?token=... public routes
- /admin/* redirects to /admin/login when logged out
