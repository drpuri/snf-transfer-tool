#!/usr/bin/env python3
"""
enrich_county_fips.py
=====================
Adds county_fips to facilities.json by fetching ZIP codes from the CMS Provider
Data API and mapping them to county FIPS via the Census ZCTA crosswalk.

This is a standalone script for when the full fetch_county_data.py pipeline
cannot run (e.g., CSV download URLs have expired).
"""

import io
import json
import sys
from pathlib import Path

import pandas as pd
import requests

FACILITIES_JSON = Path("facilities.json")

# CMS Provider Data API (always available, unlike CSV download links)
PROVIDER_API_URL = "https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py/0"

# Census Bureau ZCTA-to-County relationship file (2020 Census)
ZCTA_COUNTY_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/"
    "tab20_zcta520_county20_natl.txt"
)


def download_csv(url, label, sep=","):
    print(f"  Downloading {label} …", flush=True)
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    return pd.read_csv(io.StringIO(resp.text), dtype=str, sep=sep, low_memory=False)


def main():
    if not FACILITIES_JSON.exists():
        sys.exit(f"  {FACILITIES_JSON} not found.")

    facilities = json.loads(FACILITIES_JSON.read_text(encoding="utf-8"))
    ccn_set = {f["id"] for f in facilities}
    print(f"  {len(facilities):,} facilities loaded.")

    # 1. Get ZIP codes from CMS API (paginated)
    print("\n[1/2] Fetching ZIP codes from CMS Provider Data API …")
    ccn_to_zip = {}
    offset = 0
    page_size = 500
    while True:
        resp = requests.get(PROVIDER_API_URL,
                            params={"limit": page_size, "offset": offset},
                            timeout=120)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        if not results:
            break
        for rec in results:
            ccn = rec.get("cms_certification_number_ccn", "").strip()
            zip_code = rec.get("zip_code", "").strip()[:5]
            if ccn and zip_code and ccn in ccn_set:
                ccn_to_zip[ccn] = zip_code
        print(f"    Fetched {offset + len(results):,} records …", flush=True)
        if len(results) < page_size:
            break
        offset += page_size
    print(f"  {len(ccn_to_zip):,} facilities matched to ZIP codes.")

    # 2. Build ZIP → County FIPS from Census ZCTA crosswalk
    print("\n[2/2] Loading Census ZCTA-to-County crosswalk …")
    zcta = download_csv(ZCTA_COUNTY_URL, "ZCTA-County crosswalk", sep="|")
    zcta.columns = zcta.columns.str.strip()

    zcta_col = [c for c in zcta.columns if "ZCTA" in c.upper() and "GEOID" in c.upper()][0]
    county_col = [c for c in zcta.columns if "COUNTY" in c.upper() and "GEOID" in c.upper()][0]

    pop_pct_cols = [c for c in zcta.columns if "ZPOPPCT" in c.upper()]
    if pop_pct_cols:
        zcta["_weight"] = pd.to_numeric(zcta[pop_pct_cols[0]], errors="coerce").fillna(0)
    else:
        zcta["_weight"] = 1

    zcta = zcta.sort_values("_weight", ascending=False)
    zip_to_fips = (
        zcta.drop_duplicates(subset=[zcta_col], keep="first")
        .set_index(zcta_col)[county_col]
        .to_dict()
    )
    print(f"  {len(zip_to_fips):,} ZCTA → County FIPS mappings.")

    # 3. Enrich facilities
    print("\n  Enriching facilities.json with county_fips …")
    enriched = 0
    for fac in facilities:
        zip_code = ccn_to_zip.get(fac["id"])
        fips = zip_to_fips.get(zip_code) if zip_code else None
        if fips:
            fac["county_fips"] = fips
            enriched += 1
        else:
            fac["county_fips"] = None

    FACILITIES_JSON.write_text(json.dumps(facilities, indent=2), encoding="utf-8")
    print(f"  {enriched:,} of {len(facilities):,} facilities tagged with county_fips.")
    print("  Done.")


if __name__ == "__main__":
    main()
