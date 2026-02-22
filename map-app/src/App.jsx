import { useState, useEffect, useMemo } from 'react'
import MapView from './components/MapView'
import './App.css'

export default function App() {
  const [facilities, setFacilities] = useState([])
  const [loading, setLoading]       = useState(true)
  const [selectedState, setSelectedState] = useState('ALL')
  const [colorMetric, setColorMetric]     = useState('observed')

  useEffect(() => {
    fetch('./facilities.json')
      .then(r => r.json())
      .then(data => { setFacilities(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Sorted list of states present in the data
  const states = useMemo(() => {
    const set = new Set(facilities.map(f => f.state).filter(Boolean))
    return ['ALL', ...[...set].sort()]
  }, [facilities])

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

  return (
    <div className="app">
      <header className="header">
        <h1 className="app-title">SNF Rehospitalization Rates</h1>

        <div className="header-divider" />

        <div className="controls">
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

          <span className="facility-count">
            {filtered.length.toLocaleString()} facilities
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
          />
      }
    </div>
  )
}
