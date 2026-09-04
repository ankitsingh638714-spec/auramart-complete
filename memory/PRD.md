# AuraMart Luxe — Admin Dashboard PRD

## Original Problem Statement
Build a fully secure, production-ready Admin Dashboard for "AuraMart Luxe" (high-end dropshipping) with: (1) password-protected admin auth + protected API routes, (2) AI Product & Content Generator (paste title/wholesale link → AI writes viral titles, descriptions, SEO tags, pricing margins), (3) AI Hero Banner & Video Generator (media manager, cinematic banner generation, storefront hero updates), (4) Order & Customer management (live orders table, full customer details, one-click status: Pending/Confirmed/Dispatched/Delivered/Cancelled), (5) fulfillment-integration-ready endpoints (Shiprocket/Delhivery/local). Luxury dark theme with gold accents, live DB-connected frontend.

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`), MongoDB via motor, JWT auth (httpOnly cookies, access 15min + refresh 7d, token_version invalidation), bcrypt hashing, email-keyed brute-force lockout (5 attempts/15min), password reset via Emergent email proxy (sha256 token hashes, 1h single-use).
- **AI**: OpenAI gpt-5.4-mini (product content, JSON-structured) + gpt-image-1 (hero banners/posters) via `emergentintegrations` + EMERGENT_LLM_KEY.
- **Frontend**: React + Tailwind, Playfair Display / Plus Jakarta Sans, obsidian #0B0B0E + champagne gold #D4AF37, glassmorphism. Pages: Storefront (/), Login/Forgot/Reset, Admin (/admin: Dashboard, Products & AI, Orders, Hero Media).
- **Media**: AI images saved to `/app/backend/uploads`, served at `/api/uploads/`.

## User Personas
- Store owner (single admin): ankitsingh638714@gmail.com — manages products, orders, media.
- Storefront visitors: browse published products, place orders via checkout modal.

## Core Requirements (static)
Secure admin-only access; AI listing generation; AI banner generation + video hook; order lifecycle management; logistics-ready fulfillment payloads; luxury dark/gold UI; live DB <-> frontend sync.

## Implemented (2026-09-03)
- JWT auth: login/logout/me/refresh/forgot/reset, seeded admin, lockout, reset-email flow, all admin routes 401-protected (verified).
- AI Product Generator (real gpt-5.4-mini): title/description/selling points/SEO tags/3.5-4x pricing; editable form, publish toggle, edit/delete (with confirm).
- Hero Media Studio: real gpt-image-1 banners, cinematic video hook (AI poster + provider plug point), Set-as-Hero pushes live to storefront.
- Orders: live table, detail modal (full address/phone/items), one-click status, Dispatch Shipment → Shiprocket/Delhivery/local payload + AWB, auto-dispatched, DELETE endpoint.
- Storefront: hero from active banner (dual-gradient scrim), product grid, checkout → pending order → appears in admin.
- Dashboard: revenue/orders/products/pending stats, status chips, recent orders.
- Testing: iteration_1 — backend 41/42, frontend 26/26 assertions; all reported issues fixed (lockout keyed on email, datetime TTL docs, delete confirmations, heading copy, hero scrim, media skeleton).

## Implemented (2026-09-03, iteration 2)
- **File & media storage (Emergent Object Storage)**: `/api/admin/upload` (admin-only, image-only JPG/PNG/WEBP/GIF, 10MB cap), public serving at `/api/files/{path}` gated on DB records with soft-delete flag, `storage_key` minted at startup with stale-key retry. Paths prefixed `auramart-luxe/...`.
- Product form now has an **Upload** button (testid `product-image-upload`) wiring straight into storage.
- Media Studio has **Upload Banner** (`/api/admin/media/upload` → banner record) and AI-generated banners/posters now persist to object storage (local-disk fallback if storage is unavailable).
- Verified via curl: upload → public serve byte-identical over external URL; unauthenticated upload 401; non-image upload 400. UI verified via Playwright screenshot.

## Implemented (2026-09-03, iteration 3)
- **Inventory control**: `stock` field on products (null = untracked), stock input in the product form, stock badges on Vault cards (red out-of-stock / amber ≤5), status validation (draft/published/archived), archive status support.
- **Order-time stock enforcement**: checkout rejects draft/archived/unpublished products and insufficient stock (400); successful orders decrement stock atomically ($inc).
- **Live storefront sync**: storefront polls `/api/store/products` + `/api/store/banner` every 15s — vault edits, deletes, publishes and hero changes propagate automatically; sold-out products show disabled "Sold Out" CTA, low stock shows "Only N left".
- **Dashboard low-stock chip** in stats (`low_stock` count).
- Verified via API script over https: order → stock 25→23, invalid status 400, draft order blocked, out-of-stock blocked, cleanup restored state. Frontend compiles clean.

## History (2026-09-03, iteration 4 — REVERTED)
- The hidden admin shortcut change (Ctrl+Shift+A / #secure-admin-portal gate, hidden Owner Login link) was fully reverted at the user's request: `git reset --hard 6fb1656` (Inventory Control commit) + `git push --force origin main`. Current stable state: visible "Owner Login" link in the storefront header, open `/admin/login` route, JWT-protected `/admin/*` backend routes.

## Implemented (2026-09-03, iteration 5)
- **Storefront sync fix**: demo product/order seeding disabled in `seed_catalog` (previously re-seeded 3 demo products + 3 orders whenever collections were empty — the source of "hardcoded demo products keep coming back"). Banner seed kept (hero needs a default).
- **Default publish**: new and AI-generated products now default to `published` status so saving from the admin panel immediately shows them on the live storefront (draft/archived still selectable).
- Netlify config (`netlify.toml`) already present from user-side commits: builds `frontend/` with craco, SPA redirects, `REACT_APP_BACKEND_URL` set at build time.

## Backlog
- P0: none.
- P1: real video provider integration (Veo/Runway/Sora) for 10s clips; real Shiprocket/Delhivery API keys wired into `/fulfill`; order tracking webhook.
- P2: orders/products pagination & filters; multi-admin roles; sales analytics charts; customer email notifications (Resend playbook).

## Next Tasks
1. Connect a video generation provider when the user supplies API access.
2. Wire live logistics credentials into the fulfillment hook.
3. Add pagination to orders table once volume grows.
