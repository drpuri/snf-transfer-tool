import { useMemo, useState } from 'react'

function Stars({ rating }) {
  if (rating == null) return <span className="stars-na">—</span>
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={i <= rating ? 'star-filled' : 'star-empty'}>★</span>
      ))}
    </span>
  )
}

function rateColor(rate, sortedRates) {
  if (rate == null || !sortedRates.length) return '#9ca3af'
  let lo = 0, hi = sortedRates.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sortedRates[mid] < rate) lo = mid + 1
    else hi = mid
  }
  const p = (lo / sortedRates.length) * 100
  const hue = Math.max(0, Math.min(120, Math.round(160 - 2 * p)))
  return `hsl(${hue}, 68%, ${hue < 40 ? 44 : 40}%)`
}

export default function ScorecardView({
  facilities, selectedACO, selectedState, countyData, fipsToAcoNames,
}) {
  const [sortCol, setSortCol] = useState('overall_rating')
  const [sortAsc, setSortAsc] = useState(false)

  const rows = useMemo(() => {
    let result = facilities
    if (selectedState !== 'ALL') {
      result = result.filter(f => f.state === selectedState)
    }
    if (selectedACO !== 'ALL') {
      result = result.filter(f => {
        const names = fipsToAcoNames[f.county_fips]
        return names && names.has(selectedACO)
      })
    }
    return result
  }, [facilities, selectedACO, selectedState, fipsToAcoNames])

  const sortedObserved = useMemo(() => {
    return rows
      .map(f => f.rehospitalization_rate_observed)
      .filter(v => v != null)
      .sort((a, b) => a - b)
  }, [rows])

  const sortedVBP = useMemo(() => {
    return rows
      .map(f => f.readmission_rate_vbp)
      .filter(v => v != null)
      .sort((a, b) => a - b)
  }, [rows])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortAsc ? av - bv : bv - av
    })
  }, [rows, sortCol, sortAsc])

  function toggleSort(col) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(col === 'overall_rating' ? false : col === 'rehospitalization_rate_observed' || col === 'readmission_rate_vbp' ? true : false) }
  }

  function sortIcon(col) {
    if (sortCol !== col) return ' ↕'
    return sortAsc ? ' ↑' : ' ↓'
  }

  if (selectedACO === 'ALL') {
    return (
      <div className="panel-view">
        <div className="panel-prompt">Select an ACO to view its SNF scorecard</div>
      </div>
    )
  }

  const columns = [
    { key: 'name', label: 'Facility' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'overall_rating', label: 'Overall' },
    { key: 'staffing_rating', label: 'Staffing' },
    { key: 'health_inspection_rating', label: 'Inspection' },
    { key: 'rn_hours', label: 'RN hrs/day' },
    { key: 'total_deficiencies', label: 'Deficiencies' },
    { key: 'rehospitalization_rate_observed', label: 'Observed Rate' },
    { key: 'readmission_rate_vbp', label: 'VBP Rate' },
  ]

  return (
    <div className="panel-view">
      <div className="panel-table-wrap">
        <table className="panel-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className="sortable"
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}{sortIcon(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(f => (
              <tr key={f.id}>
                <td className="cell-name">{f.name}</td>
                <td>{f.city || '—'}</td>
                <td>{f.state}</td>
                <td><Stars rating={f.overall_rating} /></td>
                <td><Stars rating={f.staffing_rating} /></td>
                <td><Stars rating={f.health_inspection_rating} /></td>
                <td>{f.rn_hours != null ? f.rn_hours.toFixed(2) : '—'}</td>
                <td>{f.total_deficiencies != null ? f.total_deficiencies : '—'}</td>
                <td>
                  {f.rehospitalization_rate_observed != null
                    ? <span className="rate-badge" style={{ background: rateColor(f.rehospitalization_rate_observed, sortedObserved) }}>
                        {f.rehospitalization_rate_observed.toFixed(2)}%
                      </span>
                    : '—'}
                </td>
                <td>
                  {f.readmission_rate_vbp != null
                    ? <span className="rate-badge" style={{ background: rateColor(f.readmission_rate_vbp, sortedVBP) }}>
                        {f.readmission_rate_vbp.toFixed(2)}%
                      </span>
                    : '—'}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={columns.length} className="cell-empty">No facilities found for this ACO</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
