#!/usr/bin/env python3
"""
enrich_facilities_quality.py
============================
Adds quality fields (star ratings, staffing, deficiencies, etc.) to
facilities.json by fetching from the CMS Provider Data API.

Same paginated API approach as enrich_county_fips.py. Matches by CCN.
"""

import json
import sys
from pathlib import Path

import requests

FACILITIES_JSON = Path("facilities.json")

# CMS Provider Data API (always available)
PROVIDER_API_URL = "https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py/0"

# Fields to extract: (facilities.json key, API column name, type)
FIELDS = [
    ("overall_rating",      "overall_rating",                                      "int"),
    ("health_inspection_rating", "health_inspection_rating",                        "int"),
    ("staffing_rating",     "staffing_rating",                                     "int"),
    ("qm_rating",           "qm_rating",                                           "int"),
    ("rn_hours",            "reported_rn_staffing_hours_per_resident_per_day",      "float"),
    ("total_nurse_hours",   "reported_total_nurse_staffing_hours_per_resident_per_day", "float"),
    ("beds",                "number_of_certified_beds",                             "int"),
    ("avg_residents",       "average_number_of_residents_per_day",                  "float"),
    ("total_deficiencies",  "rating_cycle_1_total_number_of_health_deficiencies",   "int"),
    ("penalties",           "total_number_of_penalties",                            "int"),
    ("ownership_type",      "ownership_type",                                      "str"),
]

SUPPRESSED = {"", "---", "*", ".", "nan", "N/A", "None"}


def parse_value(raw, vtype):
    """Parse a raw API value to the target type, returning None for suppressed."""
    if raw is None:
        return None
    s = str(raw).strip()
    if s in SUPPRESSED:
        return None
    try:
        if vtype == "int":
            return int(float(s))
        elif vtype == "float":
            return round(float(s), 2)
        else:
            return s if s else None
    except (ValueError, TypeError):
        return None


def main():
    if not FACILITIES_JSON.exists():
        sys.exit(f"  {FACILITIES_JSON} not found. Run fetch_snf_data.py first.")

    facilities = json.loads(FACILITIES_JSON.read_text(encoding="utf-8"))
    ccn_set = {f["id"] for f in facilities}
    print(f"  {len(facilities):,} facilities loaded.")

    # Fetch quality data from CMS API (paginated)
    print("\n  Fetching quality data from CMS Provider Data API …")
    ccn_to_quality = {}
    offset = 0
    page_size = 500
    while True:
        resp = requests.get(
            PROVIDER_API_URL,
            params={"limit": page_size, "offset": offset},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        if not results:
            break
        for rec in results:
            ccn = rec.get("cms_certification_number_ccn", "").strip()
            if ccn and ccn in ccn_set:
                quality = {}
                for fac_key, api_col, vtype in FIELDS:
                    quality[fac_key] = parse_value(rec.get(api_col), vtype)
                ccn_to_quality[ccn] = quality
        print(f"    Fetched {offset + len(results):,} records …", flush=True)
        if len(results) < page_size:
            break
        offset += page_size

    print(f"  {len(ccn_to_quality):,} facilities matched to quality data.")

    # Enrich facilities
    enriched = 0
    for fac in facilities:
        quality = ccn_to_quality.get(fac["id"])
        if quality:
            fac.update(quality)
            enriched += 1
        else:
            for fac_key, _, _ in FIELDS:
                fac.setdefault(fac_key, None)

    FACILITIES_JSON.write_text(json.dumps(facilities, indent=2), encoding="utf-8")
    print(f"  {enriched:,} of {len(facilities):,} facilities enriched with quality data.")
    print("  Done.")


if __name__ == "__main__":
    main()
