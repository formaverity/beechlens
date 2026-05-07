# BeechLens Portal

A conservation and citizen-science web platform for surveying American beech (*Fagus grandifolia*) trees and tracking the spread of Beech Leaf Disease (BLD). The project is actively evolving — expect rough edges and work-in-progress features.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite |
| Map | MapLibre GL 5 |
| Backend / DB | Supabase (Postgres + PostGIS) |
| Hosting | Vercel |
| 3D experiments | Three.js + React Three Fiber |

---

## Core Features

- **Public specimen map** — MapLibre GL map showing all tagged beech trees. Unauthenticated visitors see jittered (privacy-offset) coordinates via the `specimens_geojson_public` Supabase RPC. Authenticated users receive exact coordinates via `specimens_geojson`.
- **Authenticated tagging and editing** — Email/password auth (Supabase Auth). Only confirmed accounts can tag new specimens or edit existing records.
- **Photo-based specimen records** — Photos can be uploaded per specimen. EXIF GPS data is extracted client-side via `exifr` to pre-populate location fields, with a manual fallback.
- **Structured health surveys** — Tag wizard collects height class, canopy density, trunk form, bark condition, BLD presence/severity, dieback extent, and surrounding context.
- **Analytics views** — Aggregated dashboard: total specimen/photo counts, specimens over time, health breakdown, BLD breakdown, age breakdown, and a recent-photos grid. Backed by an `analytics_summary` table/view in Supabase.
- **Public-safe jittered locations** — Precise GPS coordinates are only exposed to authenticated users. The public RPC applies a coordinate offset so exact tree locations are not disclosed to anonymous visitors.
- **Digital clone / procedural tree experiments** — `DigitalCloneModal` generates a procedural 3D beech tree model (Three.js) at selectable quality tiers. `ClonePhotoCalibrator` allows interactive landmark marking on uploaded photos (trunk base, top, canopy edges) to estimate tree dimensions for the model. These are experimental features under active development.

---

## Local Setup

**Prerequisites:** Node.js 18+ and a Supabase project with the required schema.

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file (see Environment Variables below)
cp .env.example .env.local   # then fill in your values

# 3. Start the dev server
npm run dev
```

The app will be available at `http://localhost:5173` by default.

**Build for production:**

```bash
npm run build
npm run preview   # optional local preview of the production build
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/publishable key |

Both variables are safe to include in the browser bundle — the anon key is intentionally public-facing. Its permissions are bounded entirely by Supabase RLS policies. **Do not add `SUPABASE_SERVICE_ROLE_KEY` or any private key here.** The service role key bypasses RLS and must never appear in frontend code.

`.env.local` and all other `.env.*` variants are git-ignored.

---

## Supabase / RLS / Security Notes

- All data access goes through the Supabase JS client using the anonymous key. Access control is enforced entirely by **Row Level Security (RLS) policies** on the Postgres side.
- The dual-RPC pattern (`specimens_geojson` vs `specimens_geojson_public`) is the primary privacy control. If RLS is misconfigured or the public RPC is altered to return exact coordinates, user location privacy breaks. Review these RPCs carefully before any schema change.
- The `analytics_summary` table or view is read by unauthenticated users — confirm its RLS policy only exposes aggregate data, not individual records.
- Supabase Auth uses email confirmation. The UI enforces sign-in before tagging, but backend RLS policies are the authoritative gate.
- There is no `supabase/` migrations directory tracked in this repo. The database schema lives in the Supabase dashboard (or a separate migrations repo). Any collaborator will need access to the Supabase project or a schema dump to set up locally.

---

## Known Limitations / Active Development Areas

- **Monolithic `App.jsx`** — The entire application (map, auth, forms, drawers, analytics, 3D modals) lives in one large file. Component decomposition is a known gap.
- **JavaScript only** — The project is not yet typed with TypeScript. Type errors will only surface at runtime.
- **No tracked migrations** — The Postgres schema is not version-controlled alongside the frontend. Schema drift between environments is a real risk.
- **Digital clone features are experimental** — The Three.js procedural tree and photo calibrator are proofs-of-concept. They are not integrated with the core data model yet.
- **No test suite** — There are no unit, integration, or end-to-end tests at this time.
- **Mobile UX** — The app is responsive but has known rough edges on small screens, particularly in the tag wizard and photo upload flows.

---

## Suggested Review Areas for Collaborators

- **RLS policies** — Verify that public-facing queries cannot expose exact coordinates or personal data. The two GeoJSON RPCs are the most sensitive surface.
- **Jitter implementation** — Review the coordinate offset applied in `specimens_geojson_public` for adequacy (offset magnitude, consistency, reversibility).
- **`analytics_summary` exposure** — Confirm the view definition and RLS allow only safe aggregate reads anonymously.
- **`ClonePhotoCalibrator` / `DigitalCloneModal`** — These components use Three.js and React Three Fiber; they are the most experimental part of the codebase and have not been formally reviewed.
- **EXIF handling** — `exifr` extracts GPS coordinates from user-uploaded photos client-side. Verify that raw EXIF data is not inadvertently stored or logged beyond what is needed.
- **Auth flow edge cases** — Password reset redirect URL, email confirmation handling, and session persistence behaviour across page refreshes.
