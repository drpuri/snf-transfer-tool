# SNF Transfer Tool

## What This Is

A multi-part pipeline for visualizing CMS Nursing Home rehospitalization and readmission rates across the United States, with county-level ACO market segmentation:

1. **`fetch_snf_data.py`** — Python script that downloads three CMS datasets, joins them on CMS Certification Number (CCN), and outputs `facilities.json`.
2. **`fetch_county_data.py`** — Python script that aggregates facility rates by county, merges MSSP ACO beneficiary data with ACO name lookups, and categorizes counties into strategic market segments → `county_data.json`.
3. **`map-app/`** — React + Leaflet + Vite static web app with two views: a facility-level choropleth map and a county-level ACO segmentation map with filtering.

**Live URL:** https://snf-transfer-tool-uhu2.vercel.app
**GitHub:** https://github.com/drpuri/snf-transfer-tool

---

## Data Sources

All data comes from the [CMS Provider Data Catalog](https://data.cms.gov/provider-data/) (January 2026 release) and supporting crosswalks.

### Facility View (`fetch_snf_data.py`)

| Dataset | CMS ID | File | Fields used |
|---------|--------|------|-------------|
| Nursing Home Provider Information | `4pq5-n9py` | `NH_ProviderInfo_Jan2026.csv` | CCN, name, address, city, state, latitude, longitude |
| Medicare Claims Quality Measures | `ijh5-nb2v` | `NH_QualityMsr_Claims_Jan2026.csv` | Measure 521: Observed Score, Adjusted Score |
| FY 2026 SNF Value-Based Purchasing | `284v-j9fz` | `FY_2026_SNF_VBP_Facility_Performance.csv` | FY 2024 Risk-Standardized Readmission Rate |

### County View (`fetch_county_data.py`)

| Dataset | Source | Fields used |
|---------|--------|-------------|
| `facilities.json` | Output of `fetch_snf_data.py` | Facility rates, CCN, state |
| NH Provider Info (re-downloaded) | CMS `4pq5-n9py` | ZIP codes for facility-to-county mapping |
| ZCTA-to-County Crosswalk | Census Bureau (2020) | ZCTA → FIPS county mapping (by population overlap) |
| MSSP ACO Beneficiary County Assignments | CMS (2024 PUF) | ACO_ID, State_ID (SSA), County_ID (SSA), Tot_AB |
| NBER SSA-to-FIPS Crosswalk | NBER (2025) | SSA county code → FIPS county code translation |
| ACO Participants API | CMS dataset `5be87981-…` | `aco_id` → `aco_name` lookup (476 ACOs) |
| MSSP ACO Performance PUF (PY 2024) | CMS (Sept 2025 release) | `ACO_ID`, `P_SNF_ADM` (SNF admissions per 1,000 benes), `SNF_LOS` (avg length of stay in days) |

### Rate Fields in `facilities.json`

| Field | Description |
|-------|-------------|
| `rehospitalization_rate_observed` | Raw % of short-stay residents rehospitalized (Measure 521, period 07/2024–06/2025) |
| `rehospitalization_rate_adjusted` | Risk-adjusted % used in CMS Five-Star rating |
| `readmission_rate_vbp` | FY 2024 risk-standardized 30-day readmission rate from SNF VBP program (converted from decimal to %) |

### County Fields in `county_data.json`

| Field | Description |
|-------|-------------|
| `fips` | 5-digit FIPS county code |
| `name` | County name (from Census crosswalk) |
| `state` | 2-letter state abbreviation |
| `avg_rate` | Average observed rehospitalization rate across SNFs in the county |
| `facility_count` | Number of SNF facilities in the county |
| `aco_present` | Whether any MSSP ACO operates in the county |
| `aco_beneficiaries` | Total ACO-assigned Medicare beneficiaries in the county |
| `acos` | Array of `{id, name, beneficiaries, snf_adm, snf_los}` for each ACO with >0 beneficiaries |
| `category` | Market segmentation category (see below) |

Coverage (January 2026 data): 12,068 facilities total; ~11,944 with observed/adjusted rates; ~10,228 with VBP rate; 2,386 counties with SNF data; 474 unique ACOs mapped.

**Note on ACO SNF metrics:** `snf_adm` is SNF admissions per 1,000 beneficiary person-years from `P_SNF_ADM`. `snf_los` is average SNF length of stay in days from `SNF_LOS`. Both come from the MSSP Performance PUF and may be `null` if CMS suppressed the value.

---

## County Market Segmentation

Counties are categorized based on ACO presence and rehospitalization rate relative to the national 75th percentile:

| Category | ACO Present | Rate | Color | Strategic meaning |
|----------|-------------|------|-------|-------------------|
| **Accountability Gap** | Yes | ≥ p75 (high) | Red `#e63946` | ACOs present but outcomes remain poor — intervention opportunity |
| **Greenfield Market** | No | ≥ p75 (high) | Orange `#f4a261` | No ACO coverage + high rates — new market opportunity |
| **Benchmark** | Yes | < p75 (low) | Teal `#2a9d8f` | ACOs present + good outcomes — model market |
| **Neutral** | No | < p75 (low) | Gray `#d1d5db` | No ACO + acceptable rates |

---

## File Structure

```
snf-transfer-tool/
├── fetch_snf_data.py          # Python ETL — downloads CMS data → facilities.json
├── fetch_county_data.py       # Python ETL — aggregates by county + ACO data → county_data.json
├── requirements.txt           # Python deps: pandas>=2.0, requests>=2.31
├── facilities.json            # Generated output (12,068 facilities, ~3.6 MB)
├── county_data.json           # Generated output (2,386 counties, ~2.5 MB)
├── vercel.json                # Vercel build config (buildCommand, outputDirectory)
├── .gitignore
├── CLAUDE.md                  # This file
│
└── map-app/                   # React + Vite frontend
    ├── public/
    │   ├── facilities.json    # Copy of root facilities.json, served statically
    │   └── county_data.json   # Copy of root county_data.json, served statically
    ├── src/
    │   ├── main.jsx           # Entry point — imports Leaflet CSS before app CSS
    │   ├── App.jsx            # Root component: view toggle, state filter, ACO filter, metric toggle
    │   ├── App.css            # Layout, header, toggle group, legend, ACO select styles
    │   ├── index.css          # CSS reset + Leaflet popup overrides
    │   └── components/
    │       ├── MapView.jsx    # Facility map: CircleMarkers, BoundsUpdater, Legend
    │       └── CountyView.jsx # County map: GeoJSON choropleth, popups with ACO list, CountyLegend
    ├── index.html
    ├── vite.config.js
    └── package.json           # Dependencies: react-leaflet, leaflet, topojson-client
```

---

## Architecture

### Python ETL — Facility Level (`fetch_snf_data.py`)

- Downloads each CSV directly (handles ZIP or plain CSV)
- Joins: `Provider Info` LEFT JOIN `Claims QM` LEFT JOIN `VBP` on CCN
- CMS suppressed values (`"---"`) are coerced to `null`
- VBP rate stored as decimal (e.g. `0.172`) is multiplied ×100 for consistent % display
- Rows with no valid lat/lng or no rate data in any source are dropped
- Accepts `--provider-url`, `--claims-url`, `--vbp-url`, `--output` CLI flags for easy URL updates

### Python ETL — County Level (`fetch_county_data.py`)

1. Loads `facilities.json` (output of `fetch_snf_data.py`)
2. Downloads NH Provider Info to get ZIP codes for each facility
3. Downloads Census ZCTA-to-County crosswalk, picks best-match county per ZIP by population overlap
4. Aggregates facility rates by county FIPS (mean observed rehospitalization rate, facility count)
5. Downloads MSSP ACO beneficiary-by-county CSV + NBER SSA-to-FIPS crosswalk to map SSA county codes → FIPS
6. Downloads CMS ACO Participants API (paginated) to build `aco_id → aco_name` lookup
7. Downloads MSSP ACO Performance PUF (PY 2024) to get per-ACO SNF admissions (`P_SNF_ADM`) and avg length of stay (`SNF_LOS`)
8. Produces per-county `acos` array with ACO name, ID, beneficiary count, SNF admissions per 1k, and avg LOS (0-bene entries filtered out)
9. Categorizes each county into market segment based on ACO presence + rate vs 75th percentile
- Accepts `--output` CLI flag

### React App (`map-app/`)

**View modes** — Facility/County toggle in the header:
- **Facility view:** CircleMarker per facility, color-coded by percentile, with metric toggle (Observed / VBP)
- **County view:** GeoJSON choropleth from TopoJSON (`us-atlas@3`), colored by market category, with ACO filter dropdown

**Color scale (facility view)** — percentile-based, nationally consistent:
- `colorRange` in `App.jsx` is a sorted array of rates computed over *all* facilities (not just the state-filtered subset), so colors remain comparable when drilling into a single state
- `rateToColor()` in `MapView.jsx` uses binary search to find percentile, then: `hue = clamp(160 − 2p, 0, 120)`
  - p ≤ 20 → green (hsl 120)
  - p = 50 → yellow (hsl 60)
  - p ≥ 80 → red (hsl 0)

**County view colors** — categorical (see segmentation table above)

**County popups** — show avg rate, facility count, category, and a list of each ACO by name with SNF admissions per 1k, avg LOS, and beneficiary count

**ACO filter** — dropdown in header (county mode only) filters to counties where the selected ACO operates; combines with state filter

**Lazy loading** — county data (`county_data.json`) and TopoJSON are fetched only when county view is first selected

**Performance** — `MapContainer` uses `preferCanvas` (Canvas renderer) to handle 12,000+ simultaneous markers without lag.

**State filter** — `BoundsUpdater` component flies the map to the bounding box of filtered facilities; flies back to CONUS center when "All States" is selected.

**Metric toggle** — (facility view only) switches color scale and legend between `rehospitalization_rate_observed` (with VBP fallback) and `readmission_rate_vbp` (with observed fallback).

---

## Updating the Data

CMS releases updated nursing home data monthly. To refresh:

1. Visit each dataset page and copy the new CSV download URL:
   - https://data.cms.gov/provider-data/dataset/4pq5-n9py
   - https://data.cms.gov/provider-data/dataset/ijh5-nb2v
   - https://data.cms.gov/provider-data/dataset/284v-j9fz
2. Update the URL constants at the top of `fetch_snf_data.py` (or pass via CLI flags)
3. Run both scripts:
   ```bash
   python3 fetch_snf_data.py
   python3 fetch_county_data.py
   ```
4. Copy outputs to the app's public directory:
   ```bash
   cp facilities.json map-app/public/facilities.json
   cp county_data.json map-app/public/county_data.json
   ```
5. Commit and push — Vercel will auto-redeploy:
   ```bash
   git add facilities.json county_data.json map-app/public/facilities.json map-app/public/county_data.json
   git commit -m "Update CMS data — <Month Year>"
   git push
   ```

---

## Local Development

```bash
# Python scripts
python3 -m pip install -r requirements.txt
python3 fetch_snf_data.py        # → facilities.json
python3 fetch_county_data.py     # → county_data.json (requires facilities.json)

# Copy data to frontend
cp facilities.json map-app/public/
cp county_data.json map-app/public/

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

---

## Roadmap

### Q3 2026 — Site-of-Care Arbitrage Map

Overlay facility-level cost and quality data to identify SNFs where site-of-care shifts (e.g., home health vs SNF) could reduce total cost of care. Will add a new view mode showing arbitrage opportunity scores per facility or county.

### Q4 2026 — FFS Coding Gap Tool

Analyze fee-for-service Medicare claims coding patterns at the county level to surface coding intensity gaps. Will compare observed vs expected diagnosis coding rates to identify under-coded populations, useful for ACOs entering new markets.
