#!/usr/bin/env python3
"""
fetch_snf_data.py
=================
Downloads three CMS datasets, joins them on CMS Certification Number (CCN),
and writes a clean facilities.json ready for Leaflet consumption.

Sources (CMS Provider Data Catalog — data.cms.gov):
  [1] Nursing Home Provider Information        (4pq5-n9py)
        → CCN, name, address, city, state, latitude, longitude
  [2] Medicare Claims Quality Measures         (ijh5-nb2v)
        → Measure 521: short-stay rehospitalization rate
          • rehospitalization_rate_observed  — raw %  (Observed Score)
          • rehospitalization_rate_adjusted  — risk-adjusted % (Adjusted Score,
            used in Care Compare Five-Star rating)
  [3] FY 2026 SNF Value-Based Purchasing       (284v-j9fz)
        → readmission_rate_vbp — FY 2024 risk-standardized 30-day readmission
          rate (converted from decimal to %, e.g. 0.172 → 17.2)

Join strategy
  Provider Info  LEFT JOIN  Claims   ON CCN  →  lat/lng + Care Compare rates
                LEFT JOIN  VBP      ON CCN  →  + VBP rate
  Rows are kept when lat AND lng are non-null AND at least one rate field is
  non-null.  Facilities missing a particular rate carry null for that field.

Updating stale URLs
  Each source has a dataset page where you can copy a fresh "Download CSV" link:
    [1] https://data.cms.gov/provider-data/dataset/4pq5-n9py
    [2] https://data.cms.gov/provider-data/dataset/ijh5-nb2v
    [3] https://data.cms.gov/provider-data/dataset/284v-j9fz
  Pass new URLs via --provider-url / --claims-url / --vbp-url, or update the
  constants below.
"""

import argparse
import io
import json
import sys
import zipfile
from pathlib import Path

import pandas as pd
import requests

# ── Download URLs (January 2026 release) ─────────────────────────────────────
PROVIDER_INFO_URL = (
    "https://data.cms.gov/provider-data/sites/default/files/resources/"
    "816c17cdfc690511f78287c6bb8267c0_1769652359/NH_ProviderInfo_Jan2026.csv"
)
CLAIMS_QM_URL = (
    "https://data.cms.gov/provider-data/sites/default/files/resources/"
    "0b4cf891a3bd9830e13f313bb6a8fae9_1768593939/NH_QualityMsr_Claims_Jan2026.csv"
)
VBP_URL = (
    "https://data.cms.gov/provider-data/sites/default/files/resources/"
    "24625f7ba546a31aafbd5057da94a0e2_1765563292/FY_2026_SNF_VBP_Facility_Performance.csv"
)

OUTPUT_FILE = Path("facilities.json")

# Measure code for short-stay rehospitalization in the Claims QM file
REHOSPITALIZATION_CODE = "521"

# VBP column that holds the performance-period readmission rate (stored as
# a decimal proportion; we multiply by 100 to express it as a percentage)
VBP_RATE_COL = "Performance Period: FY 2024 Risk-Standardized Readmission Rate"
VBP_FOOTNOTE_COL = "Footnote -- Performance Period: FY 2024 Risk-Standardized Readmission Rate"

# Sentinel used by CMS to mark suppressed / insufficient-data cells
CMS_SUPPRESSED = "---"


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_csv(url: str, label: str) -> pd.DataFrame:
    """Download *url* (CSV or ZIP containing one CSV) and return a DataFrame."""
    print(f"  Downloading {label} …", flush=True)
    try:
        resp = requests.get(url, timeout=120)
        resp.raise_for_status()
    except requests.HTTPError as exc:
        sys.exit(
            f"\nHTTP {exc.response.status_code} fetching {label}:\n  {url}\n\n"
            "Visit the dataset page listed in the script header and update the URL."
        )
    except requests.RequestException as exc:
        sys.exit(f"\nNetwork error fetching {label}: {exc}")

    is_zip = "zip" in resp.headers.get("Content-Type", "") or url.lower().endswith(".zip")
    if is_zip:
        with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
            csvs = [n for n in z.namelist() if n.lower().endswith(".csv")]
            if not csvs:
                sys.exit(f"No CSV found in ZIP for {label}. Contents: {z.namelist()}")
            with z.open(csvs[0]) as f:
                return pd.read_csv(f, dtype=str, low_memory=False)
    else:
        return pd.read_csv(io.StringIO(resp.text), dtype=str, low_memory=False)


def coerce_numeric(series: pd.Series) -> pd.Series:
    """Convert to float; CMS suppressed markers ('---', '*', '') become NaN."""
    return pd.to_numeric(series.replace(CMS_SUPPRESSED, None), errors="coerce")


def nullable_float(val):
    """Return a rounded float or None if the value is NaN."""
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    return round(float(val), 4)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--provider-url", default=PROVIDER_INFO_URL,
                        help="URL for NH Provider Information CSV/ZIP.")
    parser.add_argument("--claims-url",   default=CLAIMS_QM_URL,
                        help="URL for Medicare Claims Quality Measures CSV/ZIP.")
    parser.add_argument("--vbp-url",      default=VBP_URL,
                        help="URL for FY 2026 SNF VBP Facility-Level CSV/ZIP.")
    parser.add_argument("--output",       default=str(OUTPUT_FILE),
                        help="Output JSON file path (default: facilities.json).")
    args = parser.parse_args()

    # ── 1. Provider information (lat/lng anchor) ───────────────────────────────
    print("\n[1/4] Loading provider information …")
    prov = load_csv(args.provider_url, "NH_ProviderInfo")
    prov.columns = prov.columns.str.strip()

    prov = prov.rename(columns={
        "CMS Certification Number (CCN)": "ccn",
        "Provider Name":                  "name",
        "Provider Address":               "address",
        "City/Town":                      "city",
        "State":                          "state",
        "Latitude":                       "lat",
        "Longitude":                      "lng",
    })
    needed = ["ccn", "name", "address", "city", "state", "lat", "lng"]
    missing = [c for c in needed if c not in prov.columns]
    if missing:
        sys.exit(f"Provider Info is missing expected columns: {missing}\nFound: {list(prov.columns)}")

    prov = prov[needed].copy()
    prov["ccn"] = prov["ccn"].str.strip()
    prov["lat"] = coerce_numeric(prov["lat"])
    prov["lng"] = coerce_numeric(prov["lng"])
    prov = prov.dropna(subset=["lat", "lng"])
    print(f"  {len(prov):,} facilities with valid coordinates.")

    # ── 2. Claims quality measures — measure 521 (rehospitalization) ───────────
    print("\n[2/4] Loading Medicare Claims Quality Measures …")
    claims = load_csv(args.claims_url, "NH_QualityMsr_Claims")
    claims.columns = claims.columns.str.strip()

    rehsp = claims[claims["Measure Code"].str.strip() == REHOSPITALIZATION_CODE].copy()
    if rehsp.empty:
        print(f"  WARNING: No rows found for Measure Code {REHOSPITALIZATION_CODE!r}. "
              "Claims rates will be null for all facilities.")
        rehsp = pd.DataFrame(columns=["ccn", "rehospitalization_rate_observed", "rehospitalization_rate_adjusted"])
    else:
        print(f"  Measure 521 ({rehsp['Measure Description'].iloc[0]})")
        print(f"  {len(rehsp):,} facility rows found.")
        rehsp = rehsp.rename(columns={
            "CMS Certification Number (CCN)": "ccn",
            "Observed Score":                 "rehospitalization_rate_observed",
            "Adjusted Score":                 "rehospitalization_rate_adjusted",
        })
        rehsp["ccn"] = rehsp["ccn"].str.strip()
        rehsp["rehospitalization_rate_observed"] = coerce_numeric(rehsp["rehospitalization_rate_observed"])
        rehsp["rehospitalization_rate_adjusted"] = coerce_numeric(rehsp["rehospitalization_rate_adjusted"])
        rehsp = rehsp[["ccn", "rehospitalization_rate_observed", "rehospitalization_rate_adjusted"]]

    # ── 3. VBP facility-level performance ──────────────────────────────────────
    print("\n[3/4] Loading SNF VBP Facility Performance …")
    vbp = load_csv(args.vbp_url, "SNF_VBP_Facility")
    vbp.columns = vbp.columns.str.strip()

    if VBP_RATE_COL not in vbp.columns:
        print(f"  WARNING: Expected column not found: {VBP_RATE_COL!r}")
        print(f"  Available columns: {list(vbp.columns)}")
        print("  VBP rates will be null for all facilities.")
        vbp_slim = pd.DataFrame(columns=["ccn", "readmission_rate_vbp"])
    else:
        vbp = vbp.rename(columns={"CMS Certification Number (CCN)": "ccn"})
        vbp["ccn"] = vbp["ccn"].str.strip()
        # Suppress rows flagged by CMS footnote
        if VBP_FOOTNOTE_COL in vbp.columns:
            vbp.loc[vbp[VBP_FOOTNOTE_COL].str.strip() != "---", VBP_RATE_COL] = None
        vbp["readmission_rate_vbp"] = coerce_numeric(vbp[VBP_RATE_COL]) * 100
        vbp_slim = vbp[["ccn", "readmission_rate_vbp"]].copy()
        valid_vbp = vbp_slim["readmission_rate_vbp"].notna().sum()
        print(f"  {valid_vbp:,} facilities with a valid VBP readmission rate.")

    # ── 4. Join and write ──────────────────────────────────────────────────────
    print("\n[4/4] Joining datasets and writing output …")

    merged = (
        prov
        .merge(rehsp, on="ccn", how="left")
        .merge(vbp_slim, on="ccn", how="left")
    )

    # Keep rows that have at least one rate value
    has_rate = (
        merged["rehospitalization_rate_observed"].notna() |
        merged["rehospitalization_rate_adjusted"].notna() |
        merged["readmission_rate_vbp"].notna()
    )
    before = len(merged)
    merged = merged[has_rate]
    dropped = before - len(merged)
    if dropped:
        print(f"  Dropped {dropped:,} facilities with no rate data in any source.")
    print(f"  {len(merged):,} facilities retained.")

    records = []
    for _, row in merged.iterrows():
        records.append({
            "id":    row["ccn"],
            "name":  row["name"],
            "address": f"{row['address']}, {row['city']}, {row['state']}",
            "lat":   round(float(row["lat"]), 6),
            "lng":   round(float(row["lng"]), 6),
            "state": row["state"],
            # Care Compare claims-based measure 521 (07/2024–06/2025)
            # Observed = raw %; Adjusted = risk-adjusted % used in 5-Star rating
            "rehospitalization_rate_observed": nullable_float(row["rehospitalization_rate_observed"]),
            "rehospitalization_rate_adjusted": nullable_float(row["rehospitalization_rate_adjusted"]),
            # SNF VBP FY 2024 risk-standardized 30-day readmission rate (as %)
            "readmission_rate_vbp": nullable_float(row["readmission_rate_vbp"]),
        })

    Path(args.output).write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(f"  Done. {len(records):,} facilities written to {args.output}.\n")

    # ── Coverage summary ───────────────────────────────────────────────────────
    df_out = pd.DataFrame(records)
    print("Coverage summary:")
    print(f"  rehospitalization_rate_observed : {df_out['rehospitalization_rate_observed'].notna().sum():,} facilities")
    print(f"  rehospitalization_rate_adjusted : {df_out['rehospitalization_rate_adjusted'].notna().sum():,} facilities")
    print(f"  readmission_rate_vbp            : {df_out['readmission_rate_vbp'].notna().sum():,} facilities\n")


if __name__ == "__main__":
    main()
