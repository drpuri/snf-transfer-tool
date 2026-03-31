import { useMemo, useState } from 'react'

function rateColor(rate, p75) {
  if (rate == null) return '#9ca3af'
  if (rate >= p75) return '#dc2626'
  if (rate >= p75 * 0.85) return '#f59e0b'
  return '#16a34a'
}

export default function HotspotView({ countyData, selectedACO, selectedState }) {
  const [sortCol, setSortCol] = useState('avg_rate')
  const [sortAsc, setSortAsc] = useState(false)

  const p75 = useMemo(() => {
    const rates = countyData.map(c => c.avg_rate).filter(r => r != null).sort((a, b) => a - b)
    if (!rates.length) return 0
    return rates[Math.floor(rates.length * 0.75)]
  }, [countyData])

  const rows = useMemo(() => {
    if (selectedACO === 'ALL') return []
    let filtered = countyData.filter(c =>
      c.acos && c.acos.some(a => a.name === selectedACO)
    )
    if (selectedState !== 'ALL') {
      filtered = filtered.filter(c => c.state === selectedState)
    }
    // Enrich with ACO-specific metrics
    return filtered.map(c => {
      const aco = c.acos.find(a => a.name === selectedACO)
      return {
        ...c,
        aco_benes: aco?.beneficiaries ?? 0,
        aco_snf_adm: aco?.snf_adm ?? null,
        aco_snf_los: aco?.snf_los ?? null,
      }
    })
  }, [countyData, selectedACO, selectedState])

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
    else { setSortCol(col); setSortAsc(false) }
  }

  function sortIcon(col) {
    if (sortCol !== col) return ' ↕'
    return sortAsc ? ' ↑' : ' ↓'
  }

  if (selectedACO === 'ALL') {
    return (
      <div className="panel-view">
        <div className="panel-prompt">Select an ACO to view readmission hotspots</div>
      </div>
    )
  }

  const columns = [
    { key: 'rank', label: 'Rank', sortable: false },
    { key: 'name', label: 'County' },
    { key: 'state', label: 'State' },
    { key: 'avg_rate', label: 'Avg Rehospitalization Rate' },
    { key: 'facility_count', label: 'Facilities' },
    { key: 'aco_benes', label: 'ACO Beneficiaries' },
    { key: 'aco_snf_adm', label: 'SNF Adm/1k' },
    { key: 'aco_snf_los', label: 'Avg LOS' },
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
                  className={col.sortable === false ? '' : 'sortable'}
                  onClick={col.sortable === false ? undefined : () => toggleSort(col.key)}
                >
                  {col.label}{col.sortable !== false && sortIcon(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.fips}>
                <td className="cell-rank">{i + 1}</td>
                <td>{row.name || row.fips}</td>
                <td>{row.state}</td>
                <td>
                  <span className="rate-badge" style={{ background: rateColor(row.avg_rate, p75) }}>
                    {row.avg_rate?.toFixed(2)}%
                  </span>
                </td>
                <td>{row.facility_count}</td>
                <td>{row.aco_benes.toLocaleString()}</td>
                <td>{row.aco_snf_adm != null ? row.aco_snf_adm.toFixed(1) : '—'}</td>
                <td>{row.aco_snf_los != null ? `${row.aco_snf_los.toFixed(1)}d` : '—'}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={columns.length} className="cell-empty">No counties found for this ACO</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
