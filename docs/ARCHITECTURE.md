# BeechLens — Architecture Overview

Current state as of May 2026. This is an active, evolving project — treat this document as a snapshot, not a spec.

---

## 1. Purpose

BeechLens is a conservation and citizen-science platform for mapping American beech trees (*Fagus grandifolia*) and documenting the spread of Beech Leaf Disease (BLD). The core goals are:

- Enable field contributors to geolocate and photograph individual beech specimens.
- Collect structured health and disease observations linked to those specimens.
- Present public-safe aggregated data on an interactive map.
- Experiment with digital representation of individual trees (3D clones, photo-derived measurements) as a long-term ecological storytelling layer.

The project is not yet a finished product. Features are being validated and the data model is still evolving.

---

## 2. Stack

| Concern | Technology |
|---|---|
| Frontend | React 19 + Vite |
| Interactive map | MapLibre GL 5 |
| Auth, database, storage | Supabase (Postgres 15 + PostGIS, Supabase Auth, Supabase Storage) |
| Hosting | Vercel |
| 3D rendering | Three.js + React Three Fiber (experimental) |
| EXIF parsing | `exifr` (client-side) |

---

## 3. Frontend Structure

The frontend is a single-page application. There is no client-side router — all UI state is managed with `useState`/`useEffect` in a single main component.

```
src/
  main.jsx                      # React entry point
  App.jsx                       # Entire application: map, auth, forms, drawers, analytics
  lib/
    supabase.js                 # Supabase client (reads VITE_ env vars)
  components/
    DigitalCloneModal.jsx       # 3D procedural tree viewer + thumbnail upload
    ClonePhotoCalibrator.jsx    # Interactive photo landmark tool (trunk, canopy)
```

### UI areas

**Public map experience** — MapLibre GL renders all specimen GeoJSON on load. Unauthenticated users see jittered (privacy-offset) coordinates. Clicking a marker shows a popup with photo, species notes, and health summary. Exact coordinates are withheld from unauthenticated users.

**Tagging / editing** — Authenticated users can open a wizard to create a new specimen record or edit an existing one. The wizard collects location (from EXIF or device GPS), photos, and a structured health survey (height class, canopy density, BLD presence/severity, dieback extent, surrounding context, etc.).

**Specimens list** — A drawer listing all specimens, filterable, with inline thumbnails.

**Analytics panel** — Aggregated stats: total specimens/photos, geolocated count, BLD-positive count, time-series charts, health/BLD/age breakdowns, and a recent-photos grid. Backed by the `analytics_summary` view.

**Digital clone / 3D experiment** — `DigitalCloneModal` generates a procedural beech tree model in Three.js at selectable quality tiers (low/medium/high), renders it, and saves a thumbnail back to Supabase Storage. `ClonePhotoCalibrator` lets a contributor mark anatomical landmarks on an uploaded photo (trunk base, top, canopy left/right edges) to estimate tree dimensions for the model. These features are experimental and not yet integrated into the core data model.

---

## 4. Supabase Architecture

### Database objects

| Object | Type | Purpose |
|---|---|---|
| `specimens` | Table | One row per tagged tree. Stores location, health fields, BLD flags, age/size estimates, `clone_thumbnail_url/path/updated_at`. |
| `specimen_photos` | Table | Photos linked to a specimen. Each row stores a URL and optional caption. |
| `analytics_summary` | View | Aggregated counts, time-series data, breakdowns. Read by unauthenticated users — must expose only aggregate data. |
| `specimens_with_photo_summary` | View | Joins `specimens` with a summary of associated photos (count, most-recent URL). Used for list views. |
| `public_clone_gallery` | View | Exposes specimens that have a generated clone thumbnail, for any future public gallery surface. |
| `specimens_geojson` | RPC | Returns full-precision GeoJSON for authenticated users. |
| `specimens_geojson_public` | RPC | Returns privacy-jittered GeoJSON for unauthenticated users. |
| `add_specimen_photo` | RPC | Inserts a photo record linked to a specimen. |

### Storage buckets

| Bucket | Content | Access |
|---|---|---|
| `specimen-photos` | Field photos uploaded by contributors | Public URLs via `getPublicUrl` |
| `clone-thumbnails` | Three.js render thumbnails | Public URLs via `getPublicUrl` |

> Both buckets currently use public URLs. Whether photos should instead use signed URLs (expiring, access-controlled) is an open question — see §8.

### Extensions

PostGIS has been moved out of the `public` schema into the Supabase `extensions` schema. Any raw SQL referencing `public.geometry`, `public.ST_*`, etc. will need to be updated to use unqualified names or the `extensions` schema explicitly.

### Security model

- All client requests use the **anon key** — the publishable, browser-safe credential.
- **Row Level Security (RLS)** is the authoritative access gate. Frontend auth state enforces UX gating but is not a substitute.
- Views that were previously `SECURITY DEFINER` (executing as owner, bypassing RLS) have been converted to `SECURITY INVOKER` where appropriate, so they respect the calling user's RLS context.
- `analytics_summary` is intentionally readable by unauthenticated users — its definition should be audited to confirm it cannot leak individual records.

---

## 5. Public / Private Data Model

| Data | Public (anon) | Authenticated |
|---|---|---|
| Specimen existence | Yes, via jittered GeoJSON | Yes, via exact GeoJSON |
| Exact GPS coordinates | No | Yes |
| Photos | Yes (public bucket URLs) | Yes |
| Health survey fields | Yes (via public RPC) | Yes |
| User identity / submitter | No | No (not currently stored) |
| Clone thumbnails | Yes (public bucket URLs) | Yes |

The jitter is applied server-side in `specimens_geojson_public`. The frontend does not perform or replicate jitter logic — it trusts the RPC output.

---

## 6. Security Posture

**Current state:**

- No service role key anywhere in frontend code. The client is initialised with the anon key only (`src/lib/supabase.js`).
- `VITE_SUPABASE_SERVICE_ROLE_KEY` does not exist and must never be added to frontend env vars.
- PostGIS moved to `extensions` schema (reduces attack surface on the `public` schema).
- Security-definer views converted to security-invoker where applicable.
- `.env`, `.env.*` (except `.env.example`) are git-ignored.

**Open review areas:**

- **Storage bucket access** — both buckets use public `getPublicUrl`. If specimen photos should be restricted to authenticated users, these need signed URLs and private bucket policies.
- **EXIF metadata** — `exifr` extracts GPS coordinates client-side from uploaded photos. The raw EXIF blob is not stored, but original photo files may retain embedded GPS data server-side.
- **Rate limiting** — no application-level rate limiting on photo uploads or specimen creation. Supabase's default quotas apply.
- **Moderation** — no mechanism to flag or remove inappropriate content.
- **RLS coverage** — confirm that all tables have RLS enabled and that policies cover insert/update/delete, not just select.

---

## 7. Deployment

| Concern | Provider |
|---|---|
| Frontend hosting | Vercel (auto-deploys from `main`) |
| Database / Auth / Storage | Supabase (managed, single project) |

**Required frontend environment variables** (set in Vercel project settings and locally in `.env.local`):

```
VITE_SUPABASE_URL        # Supabase project URL
VITE_SUPABASE_ANON_KEY   # Supabase publishable anon key
```

There is currently one Supabase project used for all environments. There is no separate staging or development database.

---

## 8. Known Limitations and Open Questions

**Architecture:**

- `App.jsx` is a single large file (~2,800+ lines) handling the map, all drawers, auth flow, photo upload, analytics, and more. Component decomposition has not been done yet.
- No client-side router. Navigation state is held in component `useState`. Deep-linking and browser history are not supported.
- No TypeScript. Type errors surface at runtime only.
- No Supabase migrations tracked in this repository. The database schema lives in the Supabase dashboard. Schema drift between contributors is a real risk.
- No automated test suite.

**Data model questions:**

- Should exact geometry and jittered geometry be stored as separate columns on `specimens`, rather than computed by the RPC at query time? Stored jitter would be stable across requests but less flexible to tune.
- Should public vs private specimen data be a first-class split in the schema (e.g. a `public_specimens` vs `private_specimens` distinction), rather than relying solely on RPC/view logic to filter?
- Should photo uploads strip EXIF metadata server-side (e.g. via a Supabase Edge Function) before storing, rather than relying on clients to not submit sensitive location data?

**Operational questions:**

- Should there be a staging environment before deploying schema changes?
- How would this platform be adapted for use by other conservation groups tracking different species? What is the minimum that would need to be configurable or parameterised?
