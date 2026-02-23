import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import CountyView from './CountyView'

// ── Color helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the rate to use for coloring, based on the active metric.
 * Falls back to the other metric if the primary is null.
 */
function getDisplayRate(facility, metric) {
  if (metric === 'vbp') {
    return facility.readmission_rate_vbp ?? facility.rehospitalization_rate_observed
  }
  return facility.rehospitalization_rate_observed ?? facility.readmission_rate_vbp
}

/**
 * Binary search: returns the 0-100 percentile of `rate` within `sortedRates`.
 * Ties are broken by counting all strictly-lower values.
 */
function getPercentile(rate, sortedRates) {
  if (rate == null || !sortedRates.length) return null
  let lo = 0, hi = sortedRates.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sortedRates[mid] < rate) lo = mid + 1
    else hi = mid
  }
  return (lo / sortedRates.length) * 100
}

/**
 * Maps a rate to an HSL color using percentile anchors:
 *   p ≤ 20  →  green   (hsl 120)
 *   p = 50  →  yellow  (hsl  60)
 *   p ≥ 80  →  red     (hsl   0)
 * Formula: hue = clamp(160 − 2p, 0, 120)
 */
function rateToColor(rate, sortedRates) {
  if (rate == null || isNaN(rate)) return '#9ca3af'
  const p   = getPercentile(rate, sortedRates)
  if (p == null) return '#9ca3af'
  const hue = Math.max(0, Math.min(120, Math.round(160 - 2 * p)))
  return `hsl(${hue}, 68%, ${hue < 40 ? 44 : 40}%)`
}

/** Format a nullable rate value for display. */
function fmt(val) {
  return val != null ? `${val.toFixed(2)}%` : 'N/A'
}


// ── Map behaviour ─────────────────────────────────────────────────────────────

/**
 * Flies the map to the bounding box of visible facilities whenever the state
 * filter changes.  On initial mount (selectedState === 'ALL') it stays put.
 */
function BoundsUpdater({ facilities, selectedState }) {
  const map     = useMap()
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }

    if (selectedState === 'ALL') {
      map.flyTo([39.5, -98.35], 4, { duration: 0.6 })
      return
    }
    if (facilities.length === 0) return

    const bounds = L.latLngBounds(facilities.map(f => [f.lat, f.lng]))
    map.flyToBounds(bounds, { padding: [52, 52], maxZoom: 9, duration: 0.7 })
  }, [selectedState]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}


// ── Main component ────────────────────────────────────────────────────────────

export default function MapView({
  facilities, colorMetric, colorRange, selectedState,
  viewMode, countyData, topoData,
}) {
  const sortedRates = colorRange

  return (
    <div className="map-wrapper">
      <MapContainer
        center={[39.5, -98.35]}
        zoom={4}
        preferCanvas          // use Canvas renderer — much faster for 12 k+ markers
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        {/* CartoDB Positron — clean, light base map ideal for data overlays */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
        />

        <BoundsUpdater facilities={facilities} selectedState={selectedState} />

        {viewMode === 'facility' && facilities.map(f => {
          const rate  = getDisplayRate(f, colorMetric)
          const color = rateToColor(rate, sortedRates)
          const pct   = rate != null ? Math.round(getPercentile(rate, sortedRates)) : null

          return (
            <CircleMarker
              key={f.id}
              center={[f.lat, f.lng]}
              radius={5}
              pathOptions={{
                fillColor:   color,
                fillOpacity: 0.85,
                color:       'rgba(255,255,255,0.6)',
                weight:      0.8,
              }}
            >
              <Popup>
                <div className="popup-content">
                  <p className="popup-name">{f.name}</p>
                  <p className="popup-address">{f.address}</p>

                  <table className="popup-rates">
                    <tbody>
                      <tr className={colorMetric === 'observed' ? 'active-metric' : ''}>
                        <td>Observed (raw)</td>
                        <td>{fmt(f.rehospitalization_rate_observed)}</td>
                      </tr>
                      <tr>
                        <td>Adjusted (Care Compare)</td>
                        <td>{fmt(f.rehospitalization_rate_adjusted)}</td>
                      </tr>
                      <tr className={colorMetric === 'vbp' ? 'active-metric' : ''}>
                        <td>VBP Rate (FY 2024)</td>
                        <td>{fmt(f.readmission_rate_vbp)}</td>
                      </tr>
                    </tbody>
                  </table>

                  <p className="popup-source">
                    Color: <strong>{colorMetric === 'vbp' ? 'VBP Rate' : 'Observed Rate'}</strong>
                    {pct != null && ` · ${pct}th percentile nationally`}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}

        {viewMode === 'county' && countyData.length > 0 && topoData && (
          <CountyView
            countyData={countyData}
            topoData={topoData}
            selectedState={selectedState}
          />
        )}
      </MapContainer>

      {viewMode === 'facility' && (
        <Legend sortedRates={sortedRates} metric={colorMetric} />
      )}
    </div>
  )
}


// ── Legend ────────────────────────────────────────────────────────────────────

/** Return the rate value at the given percentile from a sorted array. */
function pctValue(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1)))
  return sorted[idx]
}

function Legend({ sortedRates, metric }) {
  const label = metric === 'vbp'
    ? 'VBP Readmission Rate (FY 2024)'
    : 'Observed Rehospitalization Rate'

  const p20 = pctValue(sortedRates, 20)
  const p50 = pctValue(sortedRates, 50)
  const p80 = pctValue(sortedRates, 80)

  return (
    <div className="legend">
      <div className="legend-title">{label}</div>
      <div className="legend-bar" />
      <div className="legend-pcts">
        <span><strong>p20</strong> {p20?.toFixed(1)}%</span>
        <span><strong>p50</strong> {p50?.toFixed(1)}%</span>
        <span><strong>p80</strong> {p80?.toFixed(1)}%</span>
      </div>
      <p className="legend-note">
        Percentiles are national. Gray = no data.
      </p>
    </div>
  )
}
