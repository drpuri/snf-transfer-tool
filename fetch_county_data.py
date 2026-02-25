#!/usr/bin/env python3
"""
fetch_county_data.py
====================
Downloads CMS provider data, Census ZCTA-to-County crosswalk, MSSP ACO county
beneficiary counts, and NBER SSA-to-FIPS crosswalk.  Aggregates SNF facility
rehospitalization rates by county, merges ACO presence data, categorizes each
county into a strategic market segment, and writes county_data.json.

Output categories:
  accountability_gap — ACO present + high avg rehospitalization rate (≥ p75)
  greenfield         — No ACO + high avg rehospitalization rate (≥ p75)
  benchmark          — ACO present + low avg rehospitalization rate (< p75)
  (uncategorized)    — No ACO + low rate (rendered as neutral gray)

Dependencies: pandas, requests (same as fetch_snf_data.py)
"""

import argparse
import io
import json
import sys
from pathlib import Path

import pandas as pd
import requests

# ── URLs ─────────────────────────────────────────────────────────────────────

# NH Provider Info — same source as fetch_snf_data.py, re-downloaded for ZIP code
PROVIDER_INFO_URL = (
    "https://data.cms.gov/provider-data/sites/default/files/resources/"
    "816c17cdfc690511f78287c6bb8267c0_1769652359/NH_ProviderInfo_Jan2026.csv"
)

# Census Bureau ZCTA-to-County relationship file (2020 Census)
ZCTA_COUNTY_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/"
    "tab20_zcta520_county20_natl.txt"
)

# MSSP ACO Beneficiary County-Level Assignments (2024 PUF)
# Fields: ACO_ID, State_ID (SSA), County_ID (SSA), Tot_AB (total assigned benes)
ACO_COUNTY_URL = (
    "https://data.cms.gov/sites/default/files/2025-11/"
    "c9b8923e-5bb4-4d28-8387-48d9bde5e74c/"
    "Number_Of_ACO_Assigned_Beneficiaries_by_County_PUF_2024_01_01.csv"
)

# NBER SSA-to-FIPS crosswalk (2025)
SSA_FIPS_URL = (
    "https://data.nber.org/ssa-fips-state-county-crosswalk/2025/"
    "ssa_fips_state_county_2025.csv"
)

# CMS ACO Participants API — provides aco_id → aco_name mapping
ACO_PARTICIPANTS_URL = (
    "https://data.cms.gov/data-api/v1/dataset/"
    "5be87981-41ad-41bc-964e-af5cbf22d5af/data"
)

# MSSP Performance Year Financial & Quality Results PUF (PY 2024)
# Key fields: ACO_ID, Measure_479 (hospital-wide 30-day readmission rate),
#             P_SNF_ADM (SNF admissions per 1000), QualScore (quality score 0-100)
ACO_PERFORMANCE_URL = (
    "https://data.cms.gov/sites/default/files/2025-09/"
    "a355a538-5e08-46bf-a744-549f02782154/"
    "PY%202024%20ACO%20Results%20PUF_Rerun_20250925.csv"
)

FACILITIES_JSON = Path("facilities.json")
OUTPUT_FILE = Path("county_data.json")


# ── Helpers ──────────────────────────────────────────────────────────────────

def download_csv(url, label, sep=",", encoding="utf-8"):
    """Download a CSV from *url* and return a DataFrame."""
    print(f"  Downloading {label} …", flush=True)
    try:
        resp = requests.get(url, timeout=120)
        resp.raise_for_status()
    except requests.RequestException as exc:
        sys.exit(f"\nError fetching {label}: {exc}")
    return pd.read_csv(io.StringIO(resp.text), dtype=str, sep=sep,
                        low_memory=False, encoding=encoding)


def download_paginated_api(url, label, page_size=5000):
    """Download all records from a paginated CMS data API endpoint."""
    print(f"  Downloading {label} (paginated) …", flush=True)
    all_records = []
    offset = 0
    while True:
        try:
            resp = requests.get(url, params={"size": page_size, "offset": offset},
                                timeout=120)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as exc:
            sys.exit(f"\nError fetching {label}: {exc}")
        if not data:
            break
        all_records.extend(data)
        if len(data) < page_size:
            break
        offset += page_size
    print(f"  {len(all_records):,} records downloaded.")
    return all_records


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", default=str(OUTPUT_FILE),
                        help="Output JSON path (default: county_data.json)")
    args = parser.parse_args()

    # ── 1. Load facilities.json for rates ────────────────────────────────────
    print("\n[1/5] Loading facilities.json …")
    if not FACILITIES_JSON.exists():
        sys.exit(f"  {FACILITIES_JSON} not found. Run fetch_snf_data.py first.")
    facilities = json.loads(FACILITIES_JSON.read_text(encoding="utf-8"))
    fac_df = pd.DataFrame(facilities)
    print(f"  {len(fac_df):,} facilities loaded.")

    # ── 2. Download Provider Info for ZIP codes ──────────────────────────────
    print("\n[2/5] Loading Provider Info (ZIP codes) …")
    prov = download_csv(PROVIDER_INFO_URL, "NH_ProviderInfo")
    prov.columns = prov.columns.str.strip()
    prov = prov.rename(columns={
        "CMS Certification Number (CCN)": "ccn",
        "ZIP Code": "zip",
    })
    # Also check for alternate column name
    if "zip" not in prov.columns and "Zip Code" in prov.columns:
        prov = prov.rename(columns={"Zip Code": "zip"})
    if "zip" not in prov.columns:
        # Try to find it
        zip_cols = [c for c in prov.columns if "zip" in c.lower()]
        if zip_cols:
            prov = prov.rename(columns={zip_cols[0]: "zip"})
        else:
            sys.exit(f"  Cannot find ZIP code column. Available: {list(prov.columns)}")

    prov["ccn"] = prov["ccn"].str.strip()
    prov["zip"] = prov["zip"].str.strip().str[:5]  # 5-digit ZIP
    zip_lookup = prov.set_index("ccn")["zip"].to_dict()
    fac_df["zip"] = fac_df["id"].map(zip_lookup)
    print(f"  Matched {fac_df['zip'].notna().sum():,} facilities to ZIP codes.")

    # ── 3. Build ZIP → County FIPS lookup from Census ZCTA file ──────────────
    print("\n[3/5] Loading Census ZCTA-to-County crosswalk …")
    zcta = download_csv(ZCTA_COUNTY_URL, "ZCTA-County crosswalk", sep="|")
    zcta.columns = zcta.columns.str.strip()

    # The file has GEOID_ZCTA5_20 and GEOID_COUNTY_20 (or similar)
    zcta_col = [c for c in zcta.columns if "ZCTA" in c.upper() and "GEOID" in c.upper()]
    county_col = [c for c in zcta.columns if "COUNTY" in c.upper() and "GEOID" in c.upper()]
    # Also look for an area/population overlap ratio column
    ratio_cols = [c for c in zcta.columns if "AREALAND" in c.upper() or "OID" in c.upper()
                  or "POPPT" in c.upper() or "ZPOPPCT" in c.upper()]

    if not zcta_col or not county_col:
        print(f"  Available columns: {list(zcta.columns)}")
        sys.exit("  Cannot identify ZCTA/County GEOID columns.")

    zcta_col = zcta_col[0]
    county_col = county_col[0]

    # Use ZPOPPCT (percentage of ZCTA population in this county) for best match
    pop_pct_cols = [c for c in zcta.columns if "ZPOPPCT" in c.upper()]
    if pop_pct_cols:
        zcta["_weight"] = pd.to_numeric(zcta[pop_pct_cols[0]], errors="coerce").fillna(0)
    else:
        # Fallback: use AREALAND_PART if available
        area_cols = [c for c in zcta.columns if "AREALAND_PART" in c.upper()]
        if area_cols:
            zcta["_weight"] = pd.to_numeric(zcta[area_cols[0]], errors="coerce").fillna(0)
        else:
            zcta["_weight"] = 1  # equal weight, take first

    # For each ZCTA, pick the county with highest population overlap
    zcta = zcta.sort_values("_weight", ascending=False)
    zip_to_fips = (
        zcta.drop_duplicates(subset=[zcta_col], keep="first")
        .set_index(zcta_col)[county_col]
        .to_dict()
    )
    print(f"  {len(zip_to_fips):,} ZCTA → County FIPS mappings loaded.")

    # Assign county FIPS to facilities
    fac_df["fips"] = fac_df["zip"].map(zip_to_fips)
    matched = fac_df["fips"].notna().sum()
    print(f"  {matched:,} facilities matched to county FIPS codes.")

    # ── 4. Aggregate by county ───────────────────────────────────────────────
    print("\n[4/5] Aggregating by county …")
    fac_with_county = fac_df[fac_df["fips"].notna()].copy()

    # Use observed rate as primary (same as the facility view default)
    fac_with_county["rate"] = fac_with_county["rehospitalization_rate_observed"]

    county_agg = (
        fac_with_county.groupby("fips")
        .agg(
            avg_rate=("rate", "mean"),
            facility_count=("id", "count"),
            state=("state", "first"),
        )
        .reset_index()
    )
    county_agg = county_agg[county_agg["avg_rate"].notna()]
    print(f"  {len(county_agg):,} counties with SNF data.")

    # ── 5. Load ACO data and merge ───────────────────────────────────────────
    print("\n[5/7] Loading MSSP ACO county data …")

    # Download NBER SSA-to-FIPS crosswalk
    # Columns: fipscounty, ssa_code, state, countyname_fips, …
    ssa_fips = download_csv(SSA_FIPS_URL, "NBER SSA-FIPS crosswalk")
    ssa_fips.columns = ssa_fips.columns.str.strip()

    # Build SSA code → FIPS mapping (both are 5-digit strings)
    if "ssa_code" in ssa_fips.columns and "fipscounty" in ssa_fips.columns:
        ssa_fips["ssa_cd"] = ssa_fips["ssa_code"].astype(str).str.strip().str.zfill(5)
        ssa_fips["fips"] = ssa_fips["fipscounty"].astype(str).str.strip().str.zfill(5)
        ssa_to_fips = ssa_fips.drop_duplicates(subset=["ssa_cd"]).set_index("ssa_cd")["fips"].to_dict()
        print(f"  {len(ssa_to_fips):,} SSA → FIPS mappings loaded.")
    else:
        print(f"  SSA-FIPS columns: {list(ssa_fips.columns)}")
        print("  WARNING: Could not find SSA/FIPS columns. ACO data will be empty.")
        ssa_to_fips = {}

    # Download ACO beneficiary county data
    # Columns: Year, ACO_ID, State_Name, County_Name, State_ID, County_ID,
    #          AB_Psn_Yrs_*, Tot_AB_Psn_Yrs, Tot_AB
    aco = download_csv(ACO_COUNTY_URL, "MSSP ACO county beneficiaries")
    aco.columns = aco.columns.str.strip()

    # ── 6. Download ACO Participants API for aco_id → aco_name lookup ───────
    print("\n[6/7] Loading ACO Participants (name lookup) …")
    aco_participants = download_paginated_api(ACO_PARTICIPANTS_URL, "ACO Participants")
    aco_name_lookup = {}
    for rec in aco_participants:
        aid = rec.get("aco_id", "").strip()
        aname = rec.get("aco_name", "").strip()
        if aid and aname:
            aco_name_lookup[aid] = aname
    print(f"  {len(aco_name_lookup):,} ACO ID → Name mappings built.")

    # ── 7. Download ACO Performance PUF for readmission rates ──────────────
    print("\n[7/7] Loading MSSP ACO Performance PUF …")
    aco_perf = download_csv(ACO_PERFORMANCE_URL, "ACO Performance PUF")
    aco_perf.columns = aco_perf.columns.str.strip()
    aco_perf_lookup = {}
    if "ACO_ID" in aco_perf.columns:
        for _, prow in aco_perf.iterrows():
            pid = str(prow.get("ACO_ID", "")).strip()
            if not pid:
                continue
            # P_SNF_ADM: SNF admissions per 1,000 beneficiary person-years
            raw_snf_adm = str(prow.get("P_SNF_ADM", "")).strip()
            # SNF_LOS: Average SNF length of stay (days)
            raw_snf_los = str(prow.get("SNF_LOS", "")).strip()
            # Handle suppressed values (*, ., empty, whitespace-only, nan)
            snf_adm = None
            if raw_snf_adm and raw_snf_adm not in ("*", ".", "", "nan"):
                try:
                    snf_adm = round(float(raw_snf_adm), 1)
                except (ValueError, TypeError):
                    pass
            snf_los = None
            if raw_snf_los and raw_snf_los not in ("*", ".", "", "nan"):
                try:
                    snf_los = round(float(raw_snf_los), 1)
                except (ValueError, TypeError):
                    pass
            aco_perf_lookup[pid] = {"snf_adm": snf_adm, "snf_los": snf_los}
        perf_with_data = sum(1 for v in aco_perf_lookup.values() if v["snf_adm"] is not None)
        print(f"  {len(aco_perf_lookup):,} ACOs in PUF; {perf_with_data:,} with SNF utilization data.")
    else:
        print(f"  ACO Performance columns: {list(aco_perf.columns)}")
        print("  WARNING: Could not find ACO_ID column. Performance data will be empty.")

    # ── Process ACO county data ───────────────────────────────────────────
    # Build per-county ACO detail lists: {fips: [{id, name, beneficiaries}, ...]}
    aco_details_by_county = {}  # fips → list of dicts

    if "State_ID" in aco.columns and "County_ID" in aco.columns and "Tot_AB" in aco.columns:
        # Build 5-digit SSA code from State_ID (2-digit) + County_ID (3-digit)
        aco["ssa_cd"] = (
            aco["State_ID"].astype(str).str.strip().str.zfill(2)
            + aco["County_ID"].astype(str).str.strip().str.zfill(3)
        )
        aco["fips"] = aco["ssa_cd"].map(ssa_to_fips)
        aco["Tot_AB"] = pd.to_numeric(aco["Tot_AB"].replace({"*": None, ".": None}),
                                       errors="coerce").fillna(0)

        # Collect per-county ACO list with names and beneficiary counts
        aco_valid = aco[aco["fips"].notna()].copy()
        for _, row in aco_valid.iterrows():
            fips = row["fips"]
            aco_id = str(row.get("ACO_ID", "")).strip()
            benes = int(row["Tot_AB"])
            aco_name = aco_name_lookup.get(aco_id, aco_id)
            if fips not in aco_details_by_county:
                aco_details_by_county[fips] = []
            perf = aco_perf_lookup.get(aco_id, {})
            aco_details_by_county[fips].append({
                "id": aco_id,
                "name": aco_name,
                "beneficiaries": benes,
                "snf_adm": perf.get("snf_adm"),
                "snf_los": perf.get("snf_los"),
            })

        # Aggregate totals for backward compatibility
        aco_by_county = (
            aco_valid.groupby("fips")["Tot_AB"]
            .sum()
            .reset_index()
            .rename(columns={"Tot_AB": "aco_beneficiaries"})
        )
        aco_fips_set = set(aco_by_county["fips"])
        print(f"  {len(aco_fips_set):,} counties with ACO presence.")
    else:
        print(f"  ACO columns: {list(aco.columns)}")
        print("  WARNING: Unexpected ACO data format. ACO presence will be empty.")
        aco_by_county = pd.DataFrame(columns=["fips", "aco_beneficiaries"])
        aco_fips_set = set()

    # Merge ACO data into county aggregation
    county_agg = county_agg.merge(aco_by_county, on="fips", how="left")
    county_agg["aco_present"] = county_agg["fips"].isin(aco_fips_set)
    county_agg["aco_beneficiaries"] = county_agg["aco_beneficiaries"].fillna(0).astype(int)

    # ── Categorize ───────────────────────────────────────────────────────────
    p75 = county_agg["avg_rate"].quantile(0.75)
    print(f"\n  75th percentile threshold: {p75:.2f}%")

    def categorize(row):
        high = row["avg_rate"] >= p75
        aco = row["aco_present"]
        if aco and high:
            return "accountability_gap"
        if not aco and high:
            return "greenfield"
        if aco and not high:
            return "benchmark"
        return "neutral"

    county_agg["category"] = county_agg.apply(categorize, axis=1)

    # Get county names from Census ZCTA file or provider info
    # We'll use provider info city+state as a rough proxy, but better to use
    # the state FIPS prefix for state name. County names need a separate source.
    # For simplicity, we'll use a county name lookup from the ZCTA file if available.
    county_name_col = [c for c in zcta.columns if "NAME" in c.upper() and "COUNTY" in c.upper()]
    if county_name_col:
        county_names = (
            zcta[[county_col, county_name_col[0]]]
            .drop_duplicates(subset=[county_col])
            .set_index(county_col)[county_name_col[0]]
            .to_dict()
        )
    else:
        county_names = {}

    county_agg["name"] = county_agg["fips"].map(county_names).fillna("")

    # ── Write output ─────────────────────────────────────────────────────────
    records = []
    for _, row in county_agg.iterrows():
        fips = row["fips"]
        # Sort ACOs by beneficiaries descending; drop 0-bene entries (suppressed data)
        acos = sorted(
            [a for a in aco_details_by_county.get(fips, []) if a["beneficiaries"] > 0],
            key=lambda a: a["beneficiaries"],
            reverse=True,
        )
        records.append({
            "fips": fips,
            "name": row["name"],
            "state": row["state"],
            "avg_rate": round(float(row["avg_rate"]), 2),
            "facility_count": int(row["facility_count"]),
            "aco_present": bool(row["aco_present"]),
            "aco_beneficiaries": int(row["aco_beneficiaries"]),
            "acos": acos,
            "category": row["category"],
        })

    Path(args.output).write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(f"\n  Done. {len(records):,} counties written to {args.output}.")

    # Summary
    cats = county_agg["category"].value_counts()
    print("\n  Category breakdown:")
    for cat, count in cats.items():
        print(f"    {cat}: {count:,}")
    print()


if __name__ == "__main__":
    main()
