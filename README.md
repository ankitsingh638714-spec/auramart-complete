# AuraMart Luxe

AuraMart Luxe is a React storefront with a FastAPI/MongoDB backend and a protected admin panel for products, orders, and media.

## Deploy the frontend to Netlify

1. Create a new empty GitHub repository. Do not add a README, license, or `.gitignore`.
2. In Netlify, import that repository and use the committed `netlify.toml`. The build settings are already configured for `frontend/`.
3. Add `REACT_APP_BACKEND_URL` in Netlify site settings with the public URL of the deployed backend, without a trailing slash.
4. Deploy the site. The Netlify rewrite in `netlify.toml` keeps `/admin`, `/forgot-password`, and `/reset-password` working on refresh.

## Deploy the backend

Run the FastAPI app on a host that provides MongoDB and persistent/object storage. Configure the values from `backend/.env.example`, especially:

- `MONGO_URL`, `DB_NAME`, and a unique `JWT_SECRET`
- `FRONTEND_URL` as the exact Netlify site URL
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`

Start it with `uvicorn server:app --host 0.0.0.0 --port $PORT` from `backend/`. The frontend consumes the `/api` routes exposed by this service.

## Push this workspace to a new GitHub repository

From the repository root, after authenticating with GitHub:

```bash
git add .
git commit -m "Prepare AuraMart Luxe for deployment"
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/<YOUR_ACCOUNT>/<NEW_REPOSITORY>.git
git push -u origin main
```

Never commit `.env` files. Use the example files as templates and enter production values in Netlify and the backend host's secret settings.
