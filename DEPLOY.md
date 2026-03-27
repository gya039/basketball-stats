# Deploying Titans Basketball Ops

## What you need

- A Supabase project with your current tables and policies
- The two environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## Option 1: Netlify

1. Push this repo to GitHub.
2. Go to Netlify and choose `Add new site` -> `Import an existing project`.
3. Connect your GitHub repo.
4. Use these settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. In Netlify environment variables, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy the site.

## Option 2: Vercel

1. Push this repo to GitHub.
2. Go to Vercel and import the repo.
3. Framework preset: `Vite`
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

## After deployment

1. Open the deployed site on an iPad.
2. In Safari, use `Share` -> `Add to Home Screen`.
3. Open it from the home screen for the most app-like experience.

## Team usage recommendation

- One scorer should edit a live match at a time.
- Other iPads can still open the app and view/resume shared matches.
- Test with 2 devices before using it on game night.
