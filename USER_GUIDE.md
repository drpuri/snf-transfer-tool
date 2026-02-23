# SNF Transfer Tool — User Guide

## What This Tool Does

The SNF Transfer Tool is an interactive map that visualizes rehospitalization and readmission rates for every Medicare-certified skilled nursing facility (SNF) in the United States. It combines CMS quality data with Medicare Shared Savings Program (MSSP) ACO coverage to help you identify where post-acute outcomes are strong, where they need improvement, and where ACO accountability is — or isn't — present.

The tool has two views:

- **Facility View** — A dot on the map for each of the 12,000+ SNFs in the country, color-coded by rehospitalization or readmission rate.
- **County View** — A choropleth map that groups facilities by county, overlays ACO presence data, and classifies each county into one of three strategic market categories.

**Live tool:** https://snf-transfer-tool-uhu2.vercel.app

---

## Where the Data Comes From

All data is sourced from publicly available CMS datasets (January 2026 release):

| Data | What it measures |
|------|-----------------|
| **Nursing Home Provider Information** | Facility name, location, and identifiers for every Medicare-certified SNF |
| **Medicare Claims Quality Measures (Measure 521)** | Observed and risk-adjusted rehospitalization rates for short-stay residents (July 2024 – June 2025) |
| **SNF Value-Based Purchasing Program (FY 2026)** | Risk-standardized 30-day all-cause readmission rate used in CMS payment adjustments |
| **MSSP ACO Beneficiary County Assignments (2024)** | Which ACOs operate in each county and how many Medicare beneficiaries they manage |
| **CMS ACO Participants Directory** | Official names of all 474 MSSP ACOs |

The county-level analysis also uses the Census Bureau's ZIP-to-county crosswalk and the NBER's SSA-to-FIPS code translation to accurately assign facilities and ACO data to counties.

---

## Facility View

### What you see

Each dot represents one skilled nursing facility. The color indicates how that facility's rehospitalization rate compares to the national distribution:

| Color | Meaning |
|-------|---------|
| **Green** | Below the 20th percentile — among the lowest rehospitalization rates nationally |
| **Yellow** | Around the 50th percentile — near the national median |
| **Red** | Above the 80th percentile — among the highest rehospitalization rates nationally |

The color scale is based on national percentiles, not absolute values. This means the colors stay consistent whether you're looking at the whole country or filtering to a single state — a green facility in Texas is green by the same national standard as a green facility in Maine.

### Clicking a facility

Click any dot to see a popup with:

- Facility name and address
- Observed rehospitalization rate (the raw percentage of short-stay residents who were rehospitalized)
- Risk-adjusted rehospitalization rate (adjusted for patient acuity, used in CMS Five-Star ratings)
- SNF VBP readmission rate (the 30-day readmission measure that affects Medicare payment)
- The facility's national percentile ranking

### Choosing a metric

In Facility View, you can toggle between two color-coding metrics:

- **Observed Rate** — The raw rehospitalization percentage. Best for understanding actual transfer volume.
- **VBP Rate** — The risk-standardized readmission rate from the SNF Value-Based Purchasing program. Best for understanding how CMS evaluates the facility for payment purposes.

---

## County View

### What you see

Each county is shaded by its market category. The classification combines two dimensions: whether MSSP ACOs are active in the county, and whether the county's average SNF rehospitalization rate is high (at or above the national 75th percentile) or low (below the 75th percentile).

### The three market categories

**Accountability Gap (Red)**
ACOs are present in the county, but average rehospitalization rates remain high. This signals that despite value-based accountability structures being in place, post-acute outcomes have not yet improved. These counties represent opportunities for:
- ACO operators to strengthen their SNF network management and preferred provider strategies
- Health systems to differentiate on post-acute quality
- Investors to identify markets where better SNF partnerships could unlock shared savings

**Greenfield Market (Orange)**
No MSSP ACO operates in the county, and rehospitalization rates are high. These are underserved markets where there is both a quality problem and no value-based infrastructure to address it. These counties represent opportunities for:
- ACOs considering geographic expansion
- Health systems evaluating new service areas
- Investors looking for markets with unaddressed post-acute spending

**Benchmark (Teal)**
ACOs are present and rehospitalization rates are below the 75th percentile. These counties demonstrate what good looks like — value-based accountability is in place and outcomes reflect it. Use these as:
- Reference markets when building the case for ACO entry or SNF network redesign
- Comparators for clinical benchmarking
- Evidence that accountability structures can improve post-acute outcomes

Counties shown in gray have no ACO presence and low rehospitalization rates. These are not highlighted as strategic priorities but are included for completeness.

### Clicking a county

Click any county to see a popup with:

- County name and state
- Average rehospitalization rate across all SNFs in the county
- Number of SNF facilities
- Whether ACOs are present
- A list of every MSSP ACO operating in that county, with the number of assigned Medicare beneficiaries each manages
- The county's market category

### Filtering by ACO

In County View, an ACO dropdown appears in the header. Select a specific ACO to see only the counties where that organization operates. This is useful for:

- Mapping an ACO's current geographic footprint
- Identifying which of an ACO's counties fall into the accountability gap
- Comparing coverage across competing ACOs in a region

The ACO filter combines with the state filter — you can select both a state and an ACO to narrow the view further.

---

## Using the Controls

| Control | Location | What it does |
|---------|----------|--------------|
| **View toggle** (Facility / County) | Header, left side | Switches between the facility dot map and the county choropleth map |
| **State dropdown** | Header | Filters to a single state; the map flies to that state's boundaries. Select "All States" to return to the national view |
| **ACO dropdown** | Header (county view only) | Filters to counties where the selected ACO operates. Select "All ACOs" to show all counties |
| **Color by toggle** (Observed / VBP) | Header (facility view only) | Changes which rate metric drives the facility color scale |
| **Count display** | Header, right side | Shows the number of facilities or counties currently visible after all filters are applied |

---

## Common Workflows

**"Where should our ACO focus SNF network improvement efforts?"**
Switch to County View. Filter to your ACO in the dropdown. Red (accountability gap) counties are where your assigned beneficiaries are experiencing high rehospitalization rates — these are your highest-priority markets for SNF preferred provider programs or care transition interventions.

**"Where are the expansion opportunities for a new ACO?"**
Switch to County View. Look for orange (greenfield) counties — high rates with no ACO presence. Filter by state to focus on your target region.

**"Which SNFs in my state have the worst outcomes?"**
Stay in Facility View. Select your state. Toggle to Observed Rate. Red dots are the facilities with the highest rehospitalization rates. Click each to see exact numbers.

**"How does one ACO's footprint compare to another's?"**
Switch to County View. Select the first ACO from the dropdown and note which counties light up. Then switch to the second ACO. Compare geographic coverage and how many counties fall into each category.

**"What does the VBP payment risk look like for a facility?"**
Switch to Facility View. Toggle to VBP Rate. Red facilities face the greatest risk of payment reductions under the SNF Value-Based Purchasing program. Click to see the exact risk-standardized readmission rate.

---

## Notes and Limitations

- **Data currency:** The tool uses the January 2026 CMS data release. CMS updates nursing home data monthly; the tool is refreshed periodically.
- **ACO data reflects 2024 assignments.** ACO county footprints shift year to year as beneficiary attribution changes.
- **County rates are simple averages** across all SNFs in the county, not weighted by facility volume. A county with one high-rate facility and one low-rate facility will show their average.
- **Not all facilities have all three rate measures.** When a rate is unavailable (due to CMS suppression for small sample sizes), the tool falls back to the next available measure.
- **The 75th percentile threshold** for county categorization is computed nationally across all 2,386 counties with SNF data.
- **ACOs with suppressed beneficiary counts** (shown as "*" in CMS data, indicating small numbers) are excluded from county ACO lists to avoid displaying misleading zeros.
