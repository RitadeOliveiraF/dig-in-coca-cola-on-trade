# DIG-IN · Coca-Cola On-Trade Intelligence (CCEP)

## What it is
Pitch/demo dashboard for Coca-Cola Europacific Partners (CCEP) Portugal: DIG-IN on-trade (HORECA) intelligence, with a pilot request wizard. A visitor picks a country, city and radius, sees real F&B venues on a map, picks data points and sends a pilot request.

- Live: https://dig-in-coca-cola-on-trade.vercel.app
- Client in DIG-IN Hub finance: "Coca-Cola Europacific Partners Portugal, Unipessoal Lda"

## Related repos
- `RitadeOliveiraF/v0-dig-in-hub-build`: DIG-IN Hub, where pilot requests are stored (`pilot_requests` table)
- Restaurant Discovery DB (Supabase project `anwhnijnuxqjrgnnudbe`): venue source, tables `discovered_businesses_<cc>`

## Stack
- Static `index.html` (single file, map + wizard) on Vercel
- Vercel serverless functions in `api/`:
  - `api/venues.js`: F&B venues within a radius (50–5000 m), from the Restaurant Discovery DB
  - `api/submit-pilot.js`: saves a pilot request to DIG-IN Hub (project `lnruaaxpwgcdogxywivy`) and pings Slack
- Both query Supabase through the Management API (`/v1/projects/<id>/database/query`)

## Env vars (Vercel; names only)
- `SUPABASE_MGMT_PAT`
- `SLACK_PILOT_WEBHOOK_URL`

## Status (2026-10-27)
- Built 2026-08-28 (12 commits). Last change: removed the CCEP badge from the brand table.
- Cloned locally at `~/code/dig-in-coca-cola-on-trade`.

## Decisões e próximos passos
- Decisões:
  - Venue counts and map pins are real (Restaurant Discovery DB); secrets stay server-side.
  - Copy uses "1M+ venues"; illustrative-figures footer note removed.
- Próximos passos:
  - (none recorded yet)
