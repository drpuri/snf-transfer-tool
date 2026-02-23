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

  useEffect(() => {
    fetch('./facilities.json')
      .then(r => r.json())
      .then(data => { setFacilities(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Load county data and TopoJSON lazily when county view is first selected
  useEffect(() => {
    if (viewMode !== 'county') return
    if (countyData.length > 0 && topoData) return

    Promise.all([
      countyData.length === 0
        ? fetch('./county_data.json').then(r => r.json())
        : Promise.resolve(null),
      !topoData
        ? fetch(TOPO_URL).then(r => r.json())
        : Promise.resolve(null),
    ]).then(([cd, td]) => {
      if (cd) setCountyData(cd)
      if (td) setTopoData(td)
    }).catch(err => console.error('Failed to load county/topo data:', err))
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

  // County data filtered by selected ACO
  const filteredCountyData = useMemo(() => {
    if (selectedACO === 'ALL') return countyData
    return countyData.filter(c =>
      c.acos && c.acos.some(a => a.name === selectedACO)
    )
  }, [countyData, selectedACO])

  // Facilities visible on map after state filter
  const filtered = useMemo(
    () => selectedState === 'ALL'
      ? facilities
      : facilities.filter(f => f.state === selectedState),
    [facilities, selectedState]
  )

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

          {viewMode === 'county' && (
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
            viewMode={viewMode}
            countyData={filteredCountyData}
            topoData={topoData}
          />
      }
    </div>
  )
}
