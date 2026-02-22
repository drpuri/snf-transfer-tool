# SNF Transfer Tool

## What This Is

A two-part pipeline for visualizing CMS Nursing Home rehospitalization and readmission rates across the United States:

1. **`fetch_snf_data.py`** — Python script that downloads three CMS datasets, joins them on CMS Certification Number (CCN), and outputs `facilities.json`.
2. **`map-app/`** — React + Leaflet + Vite static web app that consumes `facilities.json` and renders an interactive choropleth-style map.

**Live URL:** https://snf-transfer-tool-uhu2.vercel.app
**GitHub:** https://github.com/drpuri/snf-transfer-tool

---

## Data Sources

All data comes from the [CMS Provider Data Catalog](https://data.cms.gov/provider-data/) (January 2026 release).

| Dataset | CMS ID | File | Fields used |
|---------|--------|------|-------------|
| Nursing Home Provider Information | `4pq5-n9py` | `NH_ProviderInfo_Jan2026.csv` | CCN, name, address, city, state, latitude, longitude |
| Medicare Claims Quality Measures | `ijh5-nb2v` | `NH_QualityMsr_Claims_Jan2026.csv` | Measure 521: Observed Score, Adjusted Score |
| FY 2026 SNF Value-Based Purchasing | `284v-j9fz` | `FY_2026_SNF_VBP_Facility_Performance.csv` | FY 2024 Risk-Standardized Readmission Rate |

### Rate Fields in `facilities.json`

| Field | Description |
|-------|-------------|
| `rehospitalization_rate_observed` | Raw % of short-stay residents rehospitalized (Measure 521, period 07/2024–06/2025) |
| `rehospitalization_rate_adjusted` | Risk-adjusted % used in CMS Five-Star rating |
| `readmission_rate_vbp` | FY 2024 risk-standardized 30-day readmission rate from SNF VBP program (converted from decimal to %) |

Coverage (January 2026 data): 12,068 facilities total; ~11,944 with observed/adjusted rates; ~10,228 with VBP rate.

---

## File Structure

```
snf-transfer-tool/
├── fetch_snf_data.py          # Python ETL script — downloads CMS data → facilities.json
├── requirements.txt           # Python deps: pandas>=2.0, requests>=2.31
├── facilities.json            # Generated output (12,068 facilities, ~3.6 MB)
├── vercel.json                # Vercel build config (buildCommand, outputDirectory)
├── .gitignore
├── CLAUDE.md                  # This file
│
└── map-app/                   # React + Vite frontend
    ├── public/
    │   └── facilities.json    # Copy of root facilities.json, served statically
    ├── src/
    │   ├── main.jsx           # Entry point — imports Leaflet CSS before app CSS
    │   ├── App.jsx            # Root component: data fetch, state filter, metric toggle, colorRange
    │   ├── App.css            # Layout, header, toggle group, legend styles
    │   ├── index.css          # CSS reset + Leaflet popup overrides
    │   └── components/
    │       └── MapView.jsx    # Map rendering: CircleMarkers, BoundsUpdater, Legend
    ├── index.html
    ├── vite.config.js
    └── package.json           # Dependencies: react-leaflet, leaflet
```

---

## Architecture

### Python ETL (`fetch_snf_data.py`)

- Downloads each CSV directly (handles ZIP or plain CSV)
- Joins: `Provider Info` LEFT JOIN `Claims QM` LEFT JOIN `VBP` on CCN
- CMS suppressed values (`"---"`) are coerced to `null`
- VBP rate stored as decimal (e.g. `0.172`) is multiplied ×100 for consistent % display
- Rows with no valid lat/lng or no rate data in any source are dropped
- Accepts `--provider-url`, `--claims-url`, `--vbp-url`, `--output` CLI flags for easy URL updates

### React App (`map-app/`)

**Color scale** — percentile-based, nationally consistent:
- `colorRange` in `App.jsx` is a sorted array of rates computed over *all* facilities (not just the state-filtered subset), so colors remain comparable when drilling into a single state
- `rateToColor()` in `MapView.jsx` uses binary search to find percentile, then: `hue = clamp(160 − 2p, 0, 120)`
  - p ≤ 20 → green (hsl 120)
  - p = 50 → yellow (hsl 60)
  - p ≥ 80 → red (hsl 0)

**Performance** — `MapContainer` uses `preferCanvas` (Canvas renderer) to handle 12,000+ simultaneous markers without lag.

**State filter** — `BoundsUpdater` component flies the map to the bounding box of filtered facilities; flies back to CONUS center when "All States" is selected.

**Metric toggle** — switches color scale and legend between `rehospitalization_rate_observed` (with VBP fallback) and `readmission_rate_vbp` (with observed fallback).

---

## Updating the Data

CMS releases updated nursing home data monthly. To refresh:

1. Visit each dataset page and copy the new CSV download URL:
   - https://data.cms.gov/provider-data/dataset/4pq5-n9py
   - https://data.cms.gov/provider-data/dataset/ijh5-nb2v
   - https://data.cms.gov/provider-data/dataset/284v-j9fz
2. Update the URL constants at the top of `fetch_snf_data.py` (or pass via CLI flags)
3. Run the script:
   ```bash
   python3 fetch_snf_data.py
   ```
4. Copy the output to the app's public directory:
   ```bash
   cp facilities.json map-app/public/facilities.json
   ```
5. Commit and push — Vercel will auto-redeploy:
   ```bash
   git add facilities.json map-app/public/facilities.json
   git commit -m "Update CMS data — <Month Year>"
   git push
   ```

---

## Local Development

```bash
# Python script
python3 -m pip install -r requirements.txt
python3 fetch_snf_data.py

# React app
cd map-app
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production build → dist/
```

## Deployment

- **Hosting:** Vercel (auto-deploys on push to `main`)
- **Build config:** `vercel.json` sets `buildCommand`, `outputDirectory`, `installCommand`
- **Root Directory** is set to `map-app` in the Vercel project dashboard settings
- No environment variables required — the app is fully static
