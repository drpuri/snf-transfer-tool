import { useMemo } from 'react'
import { GeoJSON, Popup } from 'react-leaflet'
import * as topojson from 'topojson-client'

const CATEGORY_COLORS = {
  accountability_gap: '#e63946',
  greenfield:         '#f4a261',
  benchmark:          '#2a9d8f',
  neutral:            '#d1d5db',
}

const CATEGORY_LABELS = {
  accountability_gap: 'Accountability Gap',
  greenfield:         'Greenfield Market',
  benchmark:          'Benchmark',
  neutral:            'No ACO + Low Rate',
}

const NO_DATA_COLOR = '#e5e7eb'

function countyStyle(feature, countyLookup) {
  const fips = feature.id
  const county = countyLookup[fips]
  const color = county ? (CATEGORY_COLORS[county.category] || NO_DATA_COLOR) : NO_DATA_COLOR

  return {
    fillColor:   color,
    fillOpacity: county ? 0.65 : 0.25,
    color:       '#9ca3af',
    weight:      0.5,
  }
}

function onEachFeature(feature, layer, countyLookup) {
  const fips = feature.id
  const county = countyLookup[fips]
  if (!county) return

  const label = CATEGORY_LABELS[county.category] || 'N/A'
  const acos = county.acos || []
  const acoRows = acos.length > 0
    ? acos.map(a =>
        `<tr><td style="padding-left:12px">${a.name || a.id}</td><td>${a.beneficiaries.toLocaleString()}</td></tr>`
      ).join('')
    : ''

  layer.bindPopup(`
    <div class="popup-content">
      <p class="popup-name">${county.name || 'Unknown County'}, ${county.state}</p>
      <table class="popup-rates">
        <tbody>
          <tr><td>Avg Rehospitalization Rate</td><td><strong>${county.avg_rate.toFixed(2)}%</strong></td></tr>
          <tr><td>SNF Facilities</td><td>${county.facility_count}</td></tr>
          <tr><td>ACO Present</td><td>${county.aco_present ? 'Yes' : 'No'}</td></tr>
          ${county.aco_present ? `<tr><td>Total ACO Beneficiaries</td><td>${county.aco_beneficiaries.toLocaleString()}</td></tr>` : ''}
          ${acoRows ? `<tr><td colspan="2" style="font-weight:600;padding-top:6px">ACOs in County</td></tr>${acoRows}` : ''}
          <tr><td>Category</td><td>${label}</td></tr>
        </tbody>
      </table>
    </div>
  `)
}

export default function CountyView({ countyData, topoData, selectedState }) {
  const countyLookup = useMemo(() => {
    const map = {}
    for (const c of countyData) {
      map[c.fips] = c
    }
    return map
  }, [countyData])

  const geojson = useMemo(() => {
    if (!topoData) return null
    const full = topojson.feature(topoData, topoData.objects.counties)

    if (selectedState === 'ALL') return full

    // Filter by state — FIPS codes: first 2 digits = state
    const stateFips = new Set(
      countyData
        .filter(c => c.state === selectedState)
        .map(c => c.fips.slice(0, 2))
    )
    return {
      ...full,
      features: full.features.filter(f => stateFips.has(String(f.id).padStart(5, '0').slice(0, 2))),
    }
  }, [topoData, selectedState, countyData])

  if (!geojson) return null

  // Use a key that changes on filter to force GeoJSON re-render
  const geoKey = `county-${selectedState}`

  return (
    <>
      <GeoJSON
        key={geoKey}
        data={geojson}
        style={feature => countyStyle(feature, countyLookup)}
        onEachFeature={(feature, layer) => onEachFeature(feature, layer, countyLookup)}
      />
      <CountyLegend />
    </>
  )
}

function CountyLegend() {
  const items = [
    { color: CATEGORY_COLORS.accountability_gap, label: 'Accountability Gap — ACO + High Rate' },
    { color: CATEGORY_COLORS.greenfield,         label: 'Greenfield — No ACO + High Rate' },
    { color: CATEGORY_COLORS.benchmark,          label: 'Benchmark — ACO + Low Rate' },
    { color: CATEGORY_COLORS.neutral,            label: 'No ACO + Low Rate' },
    { color: NO_DATA_COLOR,                      label: 'No SNF Data' },
  ]

  return (
    <div className="legend county-legend">
      <div className="legend-title">County ACO Analysis</div>
      {items.map(item => (
        <div key={item.label} className="county-legend-item">
          <span className="county-legend-swatch" style={{ background: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
      <p className="legend-note">
        High rate = ≥ 75th percentile nationally. Based on observed rehospitalization rate.
      </p>
    </div>
  )
}
