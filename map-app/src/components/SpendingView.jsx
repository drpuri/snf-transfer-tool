import { useMemo, useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ZAxis, Cell,
} from 'recharts'

function qualityColor(score) {
  if (score == null) return '#9ca3af'
  // 0–100 → green (high) to red (low)
  const hue = Math.round((score / 100) * 120)
  return `hsl(${hue}, 65%, 42%)`
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="spending-tooltip">
      <p className="spending-tooltip-name">{d.name}</p>
      <table>
        <tbody>
          <tr><td>Beneficiaries</td><td>{d.beneficiaries?.toLocaleString() ?? '—'}</td></tr>
          <tr><td>SNF $/cap</td><td>{d.snf_spending_per_cap != null ? `$${d.snf_spending_per_cap.toLocaleString()}` : '—'}</td></tr>
          <tr><td>SNF Adm/1k</td><td>{d.snf_adm ?? '—'}</td></tr>
          <tr><td>Avg LOS</td><td>{d.snf_los != null ? `${d.snf_los}d` : '—'}</td></tr>
          <tr><td>$/Stay</td><td>{d.snf_pay_per_stay != null ? `$${d.snf_pay_per_stay.toLocaleString()}` : '—'}</td></tr>
          <tr><td>Quality Score</td><td>{d.quality_score ?? '—'}</td></tr>
          <tr><td>Savings Rate</td><td>{d.savings_rate != null ? `${d.savings_rate}%` : '—'}</td></tr>
        </tbody>
      </table>
    </div>
  )
}

export default function SpendingView({ acoData, selectedACO }) {
  const [sortCol, setSortCol] = useState('snf_spending_per_cap')
  const [sortAsc, setSortAsc] = useState(false)

  // Filter to ACOs with both scatter axes
  const chartData = useMemo(() => {
    return acoData.filter(a => a.snf_spending_per_cap != null && a.snf_adm != null)
  }, [acoData])

  const medianX = useMemo(() => {
    const vals = chartData.map(a => a.snf_spending_per_cap).sort((a, b) => a - b)
    return vals.length ? vals[Math.floor(vals.length / 2)] : 0
  }, [chartData])

  const medianY = useMemo(() => {
    const vals = chartData.map(a => a.snf_adm).sort((a, b) => a - b)
    return vals.length ? vals[Math.floor(vals.length / 2)] : 0
  }, [chartData])

  const sorted = useMemo(() => {
    return [...acoData].sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortAsc ? av - bv : bv - av
    })
  }, [acoData, sortCol, sortAsc])

  function toggleSort(col) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(false) }
  }

  function sortIcon(col) {
    if (sortCol !== col) return ' ↕'
    return sortAsc ? ' ↑' : ' ↓'
  }

  const columns = [
    { key: 'name', label: 'ACO' },
    { key: 'beneficiaries', label: 'Beneficiaries' },
    { key: 'snf_spending_per_cap', label: 'SNF $/cap' },
    { key: 'snf_adm', label: 'SNF Adm/1k' },
    { key: 'snf_los', label: 'LOS' },
    { key: 'snf_pay_per_stay', label: '$/Stay' },
    { key: 'ed_visits', label: 'ED/1k' },
    { key: 'quality_score', label: 'Quality' },
    { key: 'savings_rate', label: 'Savings Rate' },
  ]

  return (
    <div className="panel-view spending-view">
      <div className="spending-chart-wrap">
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="snf_spending_per_cap"
              name="SNF $/cap"
              type="number"
              tick={{ fontSize: 11 }}
              label={{ value: 'SNF Spending per Capita ($)', position: 'bottom', offset: 0, fontSize: 12 }}
            />
            <YAxis
              dataKey="snf_adm"
              name="SNF Adm/1k"
              type="number"
              tick={{ fontSize: 11 }}
              label={{ value: 'SNF Admissions per 1,000', angle: -90, position: 'insideLeft', offset: 10, fontSize: 12 }}
            />
            <ZAxis
              dataKey="beneficiaries"
              range={[30, 300]}
              name="Beneficiaries"
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine x={medianX} stroke="#9ca3af" strokeDasharray="4 4" />
            <ReferenceLine y={medianY} stroke="#9ca3af" strokeDasharray="4 4" />
            <Scatter data={chartData}>
              {chartData.map((entry) => {
                const isSelected = selectedACO !== 'ALL' && entry.name === selectedACO
                return (
                  <Cell
                    key={entry.id}
                    fill={qualityColor(entry.quality_score)}
                    stroke={isSelected ? '#111827' : 'rgba(255,255,255,0.7)'}
                    strokeWidth={isSelected ? 2.5 : 0.8}
                    opacity={isSelected ? 1 : 0.75}
                  />
                )
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div className="spending-chart-legend">
          <span>Dot size = beneficiaries</span>
          <span>Color: <span style={{color:'hsl(120,65%,42%)'}}>■</span> high quality → <span style={{color:'hsl(0,65%,42%)'}}>■</span> low quality</span>
          <span>Dashed lines = median</span>
        </div>
      </div>

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
            {sorted.map(a => {
              const isSelected = selectedACO !== 'ALL' && a.name === selectedACO
              return (
                <tr key={a.id} className={isSelected ? 'row-selected' : ''}>
                  <td className="cell-name">{a.name}</td>
                  <td>{a.beneficiaries?.toLocaleString() ?? '—'}</td>
                  <td>{a.snf_spending_per_cap != null ? `$${a.snf_spending_per_cap.toLocaleString()}` : '—'}</td>
                  <td>{a.snf_adm ?? '—'}</td>
                  <td>{a.snf_los != null ? `${a.snf_los}d` : '—'}</td>
                  <td>{a.snf_pay_per_stay != null ? `$${a.snf_pay_per_stay.toLocaleString()}` : '—'}</td>
                  <td>{a.ed_visits ?? '—'}</td>
                  <td>{a.quality_score ?? '—'}</td>
                  <td>{a.savings_rate != null ? `${a.savings_rate}%` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
