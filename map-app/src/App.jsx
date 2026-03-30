import { useState, useEffect, useMemo } from 'react'
import MapView from './components/MapView'
import './App.css'

const TOPO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json'

export default function App() {
  const [facilities, setFacilities] = useState([])
  const [loading, setLoading]       = useState(true)
  const [selectedState, setSelectedState] = useState('ALL')
  const [colorMetric, setColorMetric]     = useState('observed')
  const [viewMode, setViewMode]           = useState('facility')
  const [countyData, setCountyData]       = useState([])
  const [topoData, setTopoData]           = useState(null)
  const [selectedACO, setSelectedACO]     = useState('ALL')
  const [showReadme, setShowReadme]       = useState(false)

  // Load facilities and county data together on startup
  useEffect(() => {
    Promise.all([
      fetch('./facilities.json').then(r => r.json()),
      fetch('./county_data.json').then(r => r.json()),
    ]).then(([fac, cd]) => {
      setFacilities(fac)
      setCountyData(cd)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Load TopoJSON lazily when county view is first selected
  useEffect(() => {
    if (viewMode !== 'county') return
    if (topoData) return
    fetch(TOPO_URL).then(r => r.json())
      .then(td => setTopoData(td))
      .catch(err => console.error('Failed to load topo data:', err))
  }, [viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sorted list of states present in the data
  const states = useMemo(() => {
    const set = new Set(facilities.map(f => f.state).filter(Boolean))
    return ['ALL', ...[...set].sort()]
  }, [facilities])

  // Sorted unique ACO names across all counties
  const acoList = useMemo(() => {
    const set = new Set()
    for (const c of countyData) {
      if (c.acos) {
        for (const a of c.acos) {
          if (a.name) set.add(a.name)
        }
      }
    }
    return ['ALL', ...[...set].sort()]
  }, [countyData])

  // Map county FIPS → ACO details (for facility-level ACO filtering + popup display)
  const fipsToAcos = useMemo(() => {
    const map = {}
    for (const c of countyData) {
      if (c.acos && c.acos.length > 0) {
        map[c.fips] = c.acos
      }
    }
    return map
  }, [countyData])

  // Map county FIPS → Set of ACO names (for filtering)
  const fipsToAcoNames = useMemo(() => {
    const map = {}
    for (const [fips, acos] of Object.entries(fipsToAcos)) {
      map[fips] = new Set(acos.map(a => a.name).filter(Boolean))
    }
    return map
  }, [fipsToAcos])

  // County data filtered by selected ACO
  const filteredCountyData = useMemo(() => {
    if (selectedACO === 'ALL') return countyData
    return countyData.filter(c =>
      c.acos && c.acos.some(a => a.name === selectedACO)
    )
  }, [countyData, selectedACO])

  // Facilities visible on map after state + ACO filter
  const filtered = useMemo(() => {
    let result = selectedState === 'ALL'
      ? facilities
      : facilities.filter(f => f.state === selectedState)
    if (selectedACO !== 'ALL') {
      result = result.filter(f => {
        const names = fipsToAcoNames[f.county_fips]
        return names && names.has(selectedACO)
      })
    }
    return result
  }, [facilities, selectedState, selectedACO, fipsToAcoNames])

  // Globally sorted rate array — computed over ALL facilities so percentile
  // colours are nationally consistent even when a state filter is active.
  const colorRange = useMemo(() => {
    const values = facilities.flatMap(f => {
      const v = colorMetric === 'vbp'
        ? (f.readmission_rate_vbp ?? f.rehospitalization_rate_observed)
        : (f.rehospitalization_rate_observed ?? f.readmission_rate_vbp)
      return v != null ? [v] : []
    })
    return values.sort((a, b) => a - b)   // ascending; used for binary-search percentile lookup
  }, [facilities, colorMetric])

  const displayCount = viewMode === 'county'
    ? (selectedState === 'ALL'
        ? filteredCountyData.length
        : filteredCountyData.filter(c => c.state === selectedState).length)
    : filtered.length

  return (
    <div className="app">
      <header className="header">
        <h1 className="app-title">SNF Rehospitalization Rates</h1>
        <button className="readme-link" onClick={() => setShowReadme(true)}>README</button>

        <div className="header-divider" />

        <div className="controls">
          <span className="control-label">View</span>
          <div className="toggle-group" role="group" aria-label="View mode">
            <button
              className={`toggle-btn${viewMode === 'facility' ? ' active' : ''}`}
              onClick={() => setViewMode('facility')}
              aria-pressed={viewMode === 'facility'}
            >
              Facility
            </button>
            <button
              className={`toggle-btn${viewMode === 'county' ? ' active' : ''}`}
              onClick={() => setViewMode('county')}
              aria-pressed={viewMode === 'county'}
            >
              County
            </button>
          </div>

          <div className="header-divider" />

          <label className="control-label" htmlFor="state-select">State</label>
          <select
            id="state-select"
            className="state-select"
            value={selectedState}
            onChange={e => setSelectedState(e.target.value)}
          >
            {states.map(s => (
              <option key={s} value={s}>{s === 'ALL' ? 'All States' : s}</option>
            ))}
          </select>

          {acoList.length > 1 && (
            <>
              <div className="header-divider" />

              <label className="control-label" htmlFor="aco-select">ACO</label>
              <select
                id="aco-select"
                className="state-select aco-select"
                value={selectedACO}
                onChange={e => setSelectedACO(e.target.value)}
              >
                {acoList.map(a => (
                  <option key={a} value={a}>{a === 'ALL' ? 'All ACOs' : a}</option>
                ))}
              </select>
            </>
          )}

          {viewMode === 'facility' && (
            <>
              <div className="header-divider" />

              <span className="control-label">Color by</span>
              <div className="toggle-group" role="group" aria-label="Color metric">
                <button
                  className={`toggle-btn${colorMetric === 'observed' ? ' active' : ''}`}
                  onClick={() => setColorMetric('observed')}
                  aria-pressed={colorMetric === 'observed'}
                >
                  Observed Rate
                </button>
                <button
                  className={`toggle-btn${colorMetric === 'vbp' ? ' active' : ''}`}
                  onClick={() => setColorMetric('vbp')}
                  aria-pressed={colorMetric === 'vbp'}
                >
                  VBP Rate
                </button>
              </div>
            </>
          )}

          <span className="facility-count">
            {displayCount.toLocaleString()} {viewMode === 'county' ? 'counties' : 'facilities'}
          </span>
        </div>
      </header>

      {loading
        ? <div className="loading">Loading facility data…</div>
        : <MapView
            facilities={filtered}
            colorMetric={colorMetric}
            colorRange={colorRange}
            selectedState={selectedState}
            selectedACO={selectedACO}
            viewMode={viewMode}
            countyData={filteredCountyData}
            topoData={topoData}
            fipsToAcos={fipsToAcos}
          />
      }

      {showReadme && (
        <div className="readme-backdrop" onClick={() => setShowReadme(false)}>
          <div className="readme-modal" onClick={e => e.stopPropagation()}>
            <button className="readme-close" onClick={() => setShowReadme(false)}>&times;</button>
            <h2>Sources &amp; Methodology</h2>

            <h3>Data Sources</h3>
            <p>All data comes from the <a href="https://data.cms.gov/provider-data/" target="_blank" rel="noopener noreferrer">CMS Provider Data Catalog</a> (January 2026 release) and supporting crosswalks.</p>

            <h3>Facility View</h3>
            <table>
              <thead><tr><th>Dataset</th><th>Description</th></tr></thead>
              <tbody>
                <tr><td><a href="https://data.cms.gov/provider-data/dataset/4pq5-n9py" target="_blank" rel="noopener noreferrer">Nursing Home Provider Info</a></td><td>Facility name, address, location coordinates</td></tr>
                <tr><td><a href="https://data.cms.gov/provider-data/dataset/ijh5-nb2v" target="_blank" rel="noopener noreferrer">Medicare Claims Quality Measures</a></td><td>Measure 521: observed &amp; risk-adjusted rehospitalization rates (Jul 2024 &ndash; Jun 2025)</td></tr>
                <tr><td><a href="https://data.cms.gov/provider-data/dataset/284v-j9fz" target="_blank" rel="noopener noreferrer">FY 2026 SNF VBP</a></td><td>FY 2024 risk-standardized 30-day readmission rate</td></tr>
              </tbody>
            </table>

            <h3>County View</h3>
            <table>
              <thead><tr><th>Dataset</th><th>Description</th></tr></thead>
              <tbody>
                <tr><td>Census ZCTA-to-County Crosswalk (2020)</td><td>Maps facility ZIP codes to county FIPS codes by population overlap</td></tr>
                <tr><td>MSSP ACO Beneficiary County Assignments (2024)</td><td>ACO ID, county, and assigned beneficiary counts</td></tr>
                <tr><td>NBER SSA-to-FIPS Crosswalk (2025)</td><td>Translates SSA county codes to FIPS codes</td></tr>
                <tr><td>CMS ACO Participants API</td><td>ACO ID to ACO name lookup (474 ACOs)</td></tr>
                <tr><td>MSSP ACO Performance PUF (PY 2024)</td><td>SNF admissions per 1,000 beneficiaries and average length of stay</td></tr>
              </tbody>
            </table>

            <h3>Rate Definitions</h3>
            <ul>
              <li><strong>Observed Rate</strong> &mdash; Raw % of short-stay residents rehospitalized within 30 days (CMS Measure 521)</li>
              <li><strong>Adjusted Rate</strong> &mdash; Risk-adjusted % used in CMS Five-Star rating</li>
              <li><strong>VBP Rate</strong> &mdash; FY 2024 risk-standardized 30-day readmission rate from SNF Value-Based Purchasing program</li>
            </ul>

            <h3>Color Scale (Facility View)</h3>
            <p>Colors are based on national percentile rank. Percentiles are computed over all 12,000+ facilities so colors remain comparable when filtering by state or ACO. Green = low rates (p20), yellow = median, red = high rates (p80). Gray = no data.</p>

            <h3>County Market Segmentation</h3>
            <p>Counties are categorized by ACO presence and rehospitalization rate relative to the national 75th percentile:</p>
            <ul>
              <li><strong style={{color:'#e63946'}}>Accountability Gap</strong> &mdash; ACO present + high rate. Intervention opportunity.</li>
              <li><strong style={{color:'#f4a261'}}>Greenfield Market</strong> &mdash; No ACO + high rate. New market opportunity.</li>
              <li><strong style={{color:'#2a9d8f'}}>Benchmark</strong> &mdash; ACO present + low rate. Model market.</li>
              <li><strong style={{color:'#9ca3af'}}>Neutral</strong> &mdash; No ACO + acceptable rate.</li>
            </ul>

            <h3>Coverage</h3>
            <p>12,068 facilities &middot; ~11,944 with observed/adjusted rates &middot; ~10,228 with VBP rate &middot; 2,386 counties &middot; 474 unique ACOs mapped.</p>
          </div>
        </div>
      )}
    </div>
  )
}
