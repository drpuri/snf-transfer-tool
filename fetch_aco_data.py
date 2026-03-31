#!/usr/bin/env python3
"""
fetch_aco_data.py
=================
Downloads the MSSP Performance PUF and extracts per-ACO spending, utilization,
and quality metrics. Outputs aco_data.json.
"""

import argparse
import io
import json
import sys
from pathlib import Path

import pandas as pd
import requests

# MSSP Performance Year Financial & Quality Results PUF (PY 2024)
ACO_PERFORMANCE_URL = (
    "https://data.cms.gov/sites/default/files/2025-09/"
    "a355a538-5e08-46bf-a744-549f02782154/"
    "PY%202024%20ACO%20Results%20PUF_Rerun_20250925.csv"
)

OUTPUT_FILE = Path("aco_data.json")

# Fields to extract: (output key, PUF column, type)
FIELDS = [
    ("id",                      "ACO_ID",              "str"),
    ("name",                    "ACO_Name",            "str"),
    ("beneficiaries",           "N_AB",                "int"),
    ("total_spending_per_cap",  "Per_Capita_Exp_TOTAL_PY", "float"),
    ("snf_spending_per_cap",    "CapAnn_SNF",          "float"),
    ("hha_spending_per_cap",    "CapAnn_HHA",          "float"),
    ("inpatient_spending_per_cap", "CapAnn_INP_All",   "float"),
    ("snf_adm",                 "P_SNF_ADM",           "float"),
    ("snf_los",                 "SNF_LOS",             "float"),
    ("snf_pay_per_stay",        "SNF_PayperStay",      "float"),
    ("ed_visits",               "P_EDV_Vis",           "float"),
    ("all_cause_adm",           "ADM",                 "float"),
    ("readmission_rate",        "Measure_479",         "float"),
    ("quality_score",           "QualScore",           "float"),
    ("savings_rate",            "Sav_rate",            "float"),
]

SUPPRESSED = {"", "*", ".", "nan", "N/A", "None"}


def parse_value(raw, vtype):
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
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", default=str(OUTPUT_FILE),
                        help="Output JSON path (default: aco_data.json)")
    args = parser.parse_args()

    print("\n  Downloading MSSP ACO Performance PUF …")
    try:
        resp = requests.get(ACO_PERFORMANCE_URL, timeout=120)
        resp.raise_for_status()
    except requests.RequestException as exc:
        sys.exit(f"\nError fetching ACO Performance PUF: {exc}")

    df = pd.read_csv(io.StringIO(resp.text), dtype=str, low_memory=False)
    df.columns = df.columns.str.strip()
    print(f"  {len(df):,} rows in PUF.")

    # Check required columns exist
    missing = [col for _, col, _ in FIELDS if col not in df.columns]
    if missing:
        print(f"  WARNING: Missing columns: {missing}")
        print(f"  Available: {list(df.columns)}")

    records = []
    for _, row in df.iterrows():
        aco_id = str(row.get("ACO_ID", "")).strip()
        if not aco_id:
            continue
        rec = {}
        for out_key, puf_col, vtype in FIELDS:
            rec[out_key] = parse_value(row.get(puf_col), vtype)
        if rec["id"]:
            records.append(rec)

    Path(args.output).write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(f"  {len(records):,} ACOs written to {args.output}.")

    # Summary stats
    with_snf = sum(1 for r in records if r["snf_spending_per_cap"] is not None)
    with_qual = sum(1 for r in records if r["quality_score"] is not None)
    print(f"  {with_snf:,} with SNF spending data, {with_qual:,} with quality scores.")
    print("  Done.")


if __name__ == "__main__":
    main()
