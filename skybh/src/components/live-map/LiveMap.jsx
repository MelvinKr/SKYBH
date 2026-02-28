/**
 * @fileoverview Live Map SVG — SKYBH
 * Carte SVG custom Caraïbes · Avions animés · Trajectoires · Météo · ETA
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLiveMap } from '../../hooks/use-live-map'
import {
  project, AIRPORTS, MAP_BOUNDS, WEATHER_ZONES,
  distanceNm, bearingDeg, headingToCardinal, intermediatePoint,
} from '../../utils/map-utils'

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  bg:      '#071118',
  sea:     '#0A1628',
  land:    '#112240',
  border:  '#1E3A5F',
  grid:    'rgba(30,58,95,0.25)',
  airport: '#F0B429',
  airborne:'#3B82F6',
  ground:  '#5B8DB8',
  track:   'rgba(59,130,246,0.5)',
  eta:     '#4ADE80',
  wx:      '#F59E0B',
}

const SVG_W = 900
const SVG_H = 560

// ── Helpers ────────────────────────────────────────────────────────────────────
const proj = (lat, lng) => project(lat, lng, SVG_W, SVG_H)

const toDate = ts => ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null)
const fmtTime = d => d?.toLocaleTimeString?.('fr-FR', { hour:'2-digit', minute:'2-digit' }) || '—'

// ── Géographie SVG simplifiée (îles Caraïbes nord) ────────────────────────────
// Polygones approximatifs des îles principales pour rendu SVG
const ISLANDS = [
  // Saint-Barthélemy
  { name:'St-Barth', fill:'#152840', stroke:'#1E3A5F', points:[
    [17.877,-62.878],[17.912,-62.846],[17.929,-62.808],[17.919,-62.777],
    [17.897,-62.760],[17.873,-62.778],[17.858,-62.818],[17.865,-62.860],
  ]},
  // Saint-Martin (partie française + néerlandaise)
  { name:'St-Martin', fill:'#152840', stroke:'#1E3A5F', points:[
    [18.064,-63.156],[18.083,-63.099],[18.118,-63.028],[18.134,-62.985],
    [18.120,-62.960],[18.084,-62.965],[18.047,-62.990],[18.020,-63.040],
    [18.018,-63.095],[18.038,-63.148],[18.058,-63.162],
  ]},
  // Anguilla
  { name:'Anguilla', fill:'#152840', stroke:'#1E3A5F', points:[
    [18.169,-63.152],[18.187,-63.090],[18.211,-63.040],[18.235,-62.984],
    [18.222,-62.959],[18.197,-62.966],[18.178,-63.000],[18.161,-63.060],
    [18.152,-63.118],[18.160,-63.150],
  ]},
  // Saba (petite)
  { name:'Saba', fill:'#152840', stroke:'#1E3A5F', points:[
    [17.623,-63.244],[17.635,-63.226],[17.645,-63.218],[17.648,-63.233],
    [17.639,-63.251],[17.626,-63.254],
  ]},
  // Sint Eustatius
  { name:'Statia', fill:'#152840', stroke:'#1E3A5F', points:[
    [17.467,-62.985],[17.481,-62.968],[17.498,-62.962],[17.507,-62.972],
    [17.503,-62.991],[17.484,-63.003],[17.467,-62.998],
  ]},
  // Antigua (simplifiée)
  { name:'Antigua', fill:'#152840', stroke:'#1E3A5F', points:[
    [17.061,-61.895],[17.093,-61.844],[17.121,-61.780],[17.133,-61.720],
    [17.110,-61.695],[17.074,-61.706],[17.047,-61.752],[17.028,-61.810],
    [17.033,-61.864],[17.051,-61.895],
  ]},
  // Montserrat
  { name:'Montserrat', fill:'#152840', stroke:'#1E3A5F', points:[
    [16.696,-62.233],[16.718,-62.212],[16.738,-62.197],[16.748,-62.206],
    [16.742,-62.228],[16.720,-62.249],[16.697,-62.249],
  ]},
  // Guadeloupe - Grande-Terre (simplifiée)
  { name:'Guadeloupe-GT', fill:'#152840', stroke:'#1E3A5F', points:[
    [16.175,-61.540],[16.204,-61.483],[16.247,-61.435],[16.278,-61.402],
    [16.294,-61.413],[16.290,-61.453],[16.262,-61.500],[16.230,-61.543],
    [16.200,-61.556],
  ]},
  // Guadeloupe - Basse-Terre (simplifiée)
  { name:'Guadeloupe-BT', fill:'#152840', stroke:'#1E3A5F', points:[
    [16.178,-61.749],[16.200,-61.720],[16.245,-61.680],[16.280,-61.658],
    [16.285,-61.671],[16.265,-61.698],[16.220,-61.739],[16.190,-61.762],
  ]},
]

// Conversion polygone en points SVG
const islandPoints = (pts) =>
  pts.map(([lat,lng]) => { const p = proj(lat,lng); return `${p.x},${p.y}` }).join(' ')

// ── Lignes de grille (lat/lng) ──────────────────────────────────────────────
const GRID_LATS = [16, 16.5, 17, 17.5, 18, 18.5]
const GRID_LNGS = [-64, -63.5, -63, -62.5, -62, -61.5, -61]

// ── Routes SBH (pour affichage) ───────────────────────────────────────────────
const ROUTES = [
  ['TFFJ','TFFG'], ['TFFJ','TNCM'], ['TFFJ','TQPF'], ['TFFJ','TFFR'],
  ['TFFG','TNCM'], ['TFFG','TQPF'],
]

// ── Icône avion SVG (path centré sur 0,0) ─────────────────────────────────────
const PlaneIcon = ({ x, y, heading, color, size=14, animated=false }) => (
  <g transform={`translate(${x},${y}) rotate(${heading})`}
    style={{ transition: animated ? 'transform 1s ease' : 'none' }}>
    {/* Corps */}
    <polygon points={`0,${-size} ${size*0.3},${size*0.4} 0,${size*0.2} ${-size*0.3},${size*0.4}`}
      fill={color} opacity={0.95}/>
    {/* Ailes */}
    <polygon points={`${-size*0.9},${size*0.05} ${size*0.9},${size*0.05} ${size*0.2},${size*0.25} ${-size*0.2},${size*0.25}`}
      fill={color} opacity={0.8}/>
    {/* Empennage */}
    <polygon points={`${-size*0.35},${size*0.3} ${size*0.35},${size*0.3} ${size*0.15},${size*0.5} ${-size*0.15},${size*0.5}`}
      fill={color} opacity={0.75}/>
    {/* Halo sélectionné */}
  </g>
)

// ── Composant principal ────────────────────────────────────────────────────────
export default function LiveMap({ flights, fleet, user, fullscreen = false, onToggleFullscreen }) {
  const [selectedReg,   setSelectedReg]   = useState(null)
  const [showRoutes,    setShowRoutes]     = useState(true)
  const [showWeather,   setShowWeather]    = useState(true)
  const [showGrid,      setShowGrid]       = useState(false)
  const [showTracks,    setShowTracks]     = useState(true)
  const [manualModal,   setManualModal]    = useState(false)
  const [manualForm,    setManualForm]     = useState({ registration:'', lat:'', lng:'', altitude_ft:'', heading:'', speed_kts:'', status:'airborne' })
  const [savingManual,  setSavingManual]   = useState(false)
  const svgRef = useRef(null)

  const {
    positions, tracks, etas, weatherAlerts,
    airborne, openSkyData, openSkyStatus,
    simulationOn, setSimulationOn,
    loading, error,
    onManualUpdate, onFetchOpenSky, clearError,
  } = useLiveMap({ flights, fleet, user })

  const selectedPos  = selectedReg ? positions[selectedReg] : null
  const selectedFlight = selectedReg
    ? flights.find(f => f.aircraft === selectedReg && f.status === 'in_flight')
    : null
  const selectedTrack = selectedFlight ? tracks[selectedFlight.id] : null
  const selectedETA   = selectedReg ? etas[selectedReg] : null

  // ── Dimensions SVG responsives ─────────────────────────────────────────────
  const [svgSize, setSvgSize] = useState({ w: SVG_W, h: SVG_H })
  useEffect(() => {
    if (!svgRef.current) return
    const ro = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect
      setSvgSize({ w: width, h: Math.round(width * (SVG_H / SVG_W)) })
    })
    ro.observe(svgRef.current)
    return () => ro.disconnect()
  }, [])

  const scale = svgSize.w / SVG_W
  const projS = (lat, lng) => {
    const p = proj(lat, lng)
    return { x: p.x * scale, y: p.y * scale }
  }

  // ── Mise à jour manuelle ───────────────────────────────────────────────────
  const handleManualSave = async () => {
    if (!manualForm.registration || !manualForm.lat || !manualForm.lng) return
    setSavingManual(true)
    try {
      await onManualUpdate(manualForm.registration, {
        lat:           Number(manualForm.lat),
        lng:           Number(manualForm.lng),
        altitude_ft:   Number(manualForm.altitude_ft) || 0,
        heading:       Number(manualForm.heading)     || 0,
        speed_kts:     Number(manualForm.speed_kts)   || 0,
        status:        manualForm.status,
        vertical_speed_fpm: 0,
      })
      setManualModal(false)
    } finally { setSavingManual(false) }
  }

  const mapH = Math.round(svgSize.w * (SVG_H / SVG_W))

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0,
      backgroundColor: C.bg, borderRadius: fullscreen ? 0 : 16,
      border: fullscreen ? 'none' : '1px solid #1E3A5F',
      overflow:'hidden', position:'relative' }}>

      {/* ── Barre de contrôle ─────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 16px', backgroundColor:'rgba(7,17,24,0.95)',
        borderBottom:'1px solid #1E3A5F', flexWrap:'wrap', gap:8 }}>

        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', gap:4 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', backgroundColor:'#EF4444',
              boxShadow:'0 0 6px #EF4444', animation:'pulse 1.5s infinite' }}/>
          </div>
          <span style={{ fontSize:12, fontWeight:800, color:'#F1F5F9', letterSpacing:1 }}>LIVE MAP</span>
          <span style={{ fontSize:10, color:'#2D5580', fontFamily:'monospace' }}>
            {airborne.length} en vol · {Object.keys(positions).length - airborne.length} au sol
          </span>
        </div>

        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          {/* Toggles */}
          {[
            { key:'routes',  label:'Routes',   state:showRoutes,  set:setShowRoutes  },
            { key:'weather', label:'Météo',    state:showWeather, set:setShowWeather },
            { key:'tracks',  label:'Tracks',   state:showTracks,  set:setShowTracks  },
            { key:'grid',    label:'Grille',   state:showGrid,    set:setShowGrid    },
          ].map(t => (
            <button key={t.key} onClick={() => t.set(!t.state)}
              style={{ fontSize:10, fontWeight:600, padding:'4px 10px', borderRadius:6, cursor:'pointer', border:'none',
                backgroundColor: t.state ? 'rgba(59,130,246,0.2)' : 'rgba(30,58,95,0.3)',
                color:           t.state ? '#93C5FD' : '#475569', transition:'all 0.15s' }}>
              {t.label}
            </button>
          ))}

          <div style={{ width:1, height:16, backgroundColor:'#1E3A5F' }}/>

          {/* Simulation */}
          <button onClick={() => setSimulationOn(!simulationOn)}
            style={{ fontSize:10, fontWeight:600, padding:'4px 10px', borderRadius:6, cursor:'pointer', border:'none',
              backgroundColor: simulationOn ? 'rgba(16,185,129,0.15)' : 'rgba(71,85,105,0.2)',
              color:           simulationOn ? '#34D399' : '#475569' }}>
            {simulationOn ? '⟳ Sim ON' : '⟳ Sim OFF'}
          </button>

          {/* OpenSky */}
          <button onClick={onFetchOpenSky}
            disabled={openSkyStatus === 'loading'}
            style={{ fontSize:10, fontWeight:600, padding:'4px 10px', borderRadius:6, cursor:'pointer', border:'none',
              backgroundColor: openSkyStatus === 'ok' ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.12)',
              color:           openSkyStatus === 'ok' ? '#34D399' : openSkyStatus === 'error' ? '#F87171' : '#A5B4FC' }}>
            {openSkyStatus === 'loading' ? '⟳ ADS-B...' : openSkyStatus === 'ok' ? '✓ ADS-B' : '📡 ADS-B'}
          </button>

          {/* Position manuelle */}
          <button onClick={() => setManualModal(true)}
            style={{ fontSize:10, fontWeight:600, padding:'4px 10px', borderRadius:6, cursor:'pointer', border:'none',
              backgroundColor:'rgba(240,180,41,0.12)', color:'#F0B429' }}>
            📍 Posit. manuell
          </button>

          {/* Plein écran */}
          <button onClick={onToggleFullscreen}
            style={{ fontSize:12, padding:'4px 8px', borderRadius:6, cursor:'pointer', border:'none',
              backgroundColor:'rgba(30,58,95,0.5)', color:'#5B8DB8' }}>
            {fullscreen ? '⊠' : '⊞'}
          </button>
        </div>
      </div>

      {/* ── Carte SVG ─────────────────────────────────────────────────────── */}
      <div ref={svgRef} style={{ position:'relative', width:'100%', backgroundColor: C.sea }}>
        <svg
          width="100%"
          height={mapH}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ display:'block' }}
          onClick={(e) => {
            // Déselectionner si clic sur fond
            if (e.target.tagName === 'svg' || e.target.tagName === 'rect') setSelectedReg(null)
          }}>

          {/* Fond mer */}
          <rect width={SVG_W} height={SVG_H} fill={C.sea}/>

          {/* Grille */}
          {showGrid && (
            <g opacity={0.4}>
              {GRID_LATS.map(lat => {
                const p1 = proj(lat, MAP_BOUNDS.minLng)
                const p2 = proj(lat, MAP_BOUNDS.maxLng)
                return <line key={`glat${lat}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={C.grid} strokeWidth={0.5} strokeDasharray="4,4"/>
              })}
              {GRID_LNGS.map(lng => {
                const p1 = proj(MAP_BOUNDS.minLat, lng)
                const p2 = proj(MAP_BOUNDS.maxLat, lng)
                return <line key={`glng${lng}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={C.grid} strokeWidth={0.5} strokeDasharray="4,4"/>
              })}
              {GRID_LATS.map(lat => {
                const p = proj(lat, MAP_BOUNDS.minLng + 0.1)
                return <text key={`tlat${lat}`} x={p.x+3} y={p.y-3} fill={C.grid} fontSize={7} fontFamily="monospace">{lat}°N</text>
              })}
              {GRID_LNGS.map(lng => {
                const p = proj(MAP_BOUNDS.minLat + 0.1, lng)
                return <text key={`tlng${lng}`} x={p.x+2} y={p.y-4} fill={C.grid} fontSize={7} fontFamily="monospace">{Math.abs(lng)}°W</text>
              })}
            </g>
          )}

          {/* Îles */}
          {ISLANDS.map(island => (
            <polygon key={island.name} points={islandPoints(island.points)}
              fill={island.fill} stroke={island.stroke} strokeWidth={0.8} opacity={0.9}/>
          ))}

          {/* Zones météo */}
          {showWeather && WEATHER_ZONES.map(zone => {
            const c  = proj(zone.lat, zone.lng)
            // Rayon en pixels approximatif (1° ≈ 60nm, zone.radiusNm en nm)
            const degPerNm = 1/60
            const rPx = (zone.radiusNm * degPerNm / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * SVG_H
            return (
              <g key={zone.id}>
                <circle cx={c.x} cy={c.y} r={rPx} fill={zone.color} stroke={zone.border}
                  strokeWidth={1.5} strokeDasharray="6,4" opacity={0.85}/>
                <text x={c.x} y={c.y-rPx-5} textAnchor="middle"
                  style={{ fill:zone.border, fontSize:9, fontWeight:700, fontFamily:'monospace' }}>
                  ⚠ {zone.label}
                </text>
              </g>
            )
          })}

          {/* Routes aériennes */}
          {showRoutes && ROUTES.map(([a, b]) => {
            const pa = proj(AIRPORTS[a].lat, AIRPORTS[a].lng)
            const pb = proj(AIRPORTS[b].lat, AIRPORTS[b].lng)
            // Grande-circulaire approx via 3 points
            const mid = intermediatePoint(AIRPORTS[a].lat, AIRPORTS[a].lng, AIRPORTS[b].lat, AIRPORTS[b].lng, 0.5)
            const pm  = proj(mid.lat, mid.lng)
            const isActive = flights.some(f =>
              f.status === 'in_flight' &&
              ((f.origin===a&&f.destination===b)||(f.origin===b&&f.destination===a))
            )
            return (
              <path key={`${a}-${b}`}
                d={`M${pa.x},${pa.y} Q${pm.x},${pm.y} ${pb.x},${pb.y}`}
                fill="none"
                stroke={ isActive ? 'rgba(59,130,246,0.6)' : 'rgba(30,58,95,0.45)' }
                strokeWidth={ isActive ? 1.5 : 0.8 }
                strokeDasharray={ isActive ? 'none' : '5,5' }/>
            )
          })}

          {/* Trajectoires en vol */}
          {showTracks && Object.entries(tracks).map(([fid, track]) => {
            if (!track?.points?.length) return null
            const flight = flights.find(f => f.id === fid)
            if (!flight) return null
            const now = new Date()
            const pts  = track.points
            const elapsed = pts.filter(p => new Date(p.timestamp) <= now)
            const future  = pts.filter(p => new Date(p.timestamp) >  now)

            const pathStr = (points) => points.map((p,i) => {
              const { x,y } = proj(p.lat, p.lng)
              return `${i===0?'M':'L'}${x},${y}`
            }).join(' ')

            const isSelected = selectedFlight?.id === fid

            return (
              <g key={fid}>
                {/* Passé — ligne pleine */}
                {elapsed.length > 1 && (
                  <path d={pathStr(elapsed)} fill="none"
                    stroke={isSelected ? '#60A5FA' : 'rgba(59,130,246,0.5)'}
                    strokeWidth={isSelected ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round"/>
                )}
                {/* Futur — tirets */}
                {future.length > 1 && (
                  <path d={pathStr([elapsed[elapsed.length-1],...future].filter(Boolean))} fill="none"
                    stroke="rgba(59,130,246,0.3)" strokeWidth={1.2}
                    strokeDasharray="6,4" strokeLinecap="round"/>
                )}
                {/* Points track */}
                {isSelected && elapsed.filter((_,i) => i%3===0).map((p,i) => {
                  const { x,y } = proj(p.lat, p.lng)
                  return <circle key={i} cx={x} cy={y} r={2} fill="#3B82F6" opacity={0.5}/>
                })}
              </g>
            )
          })}

          {/* Aéroports */}
          {Object.values(AIRPORTS).map(ap => {
            const { x, y } = proj(ap.lat, ap.lng)
            const isSelected = selectedPos?.origin === ap.icao || selectedPos?.destination === ap.icao
            return (
              <g key={ap.icao}>
                {/* Runways croisées */}
                <line x1={x-8} y1={y} x2={x+8} y2={y} stroke={C.airport} strokeWidth={isSelected?2:1.2} opacity={0.8}/>
                <line x1={x} y1={y-8} x2={x} y2={y+8} stroke={C.airport} strokeWidth={isSelected?2:1.2} opacity={0.8}/>
                <circle cx={x} cy={y} r={4} fill={C.bg} stroke={C.airport} strokeWidth={isSelected?2:1.2}/>
                {/* Label */}
                <text x={x+10} y={y+4} fill={C.airport} fontSize={10} fontWeight={700} fontFamily="monospace">
                  {ap.short}
                </text>
                <text x={x+10} y={y+15} fill="#2D5580" fontSize={8} fontFamily="monospace">
                  {ap.icao}
                </text>
              </g>
            )
          })}

          {/* Avions */}
          {Object.entries(positions).map(([reg, pos]) => {
            if (!pos.lat || !pos.lng) return null
            const { x, y } = proj(pos.lat, pos.lng)
            const isAirborne  = pos.status === 'airborne'
            const isSelected  = selectedReg === reg
            const color = isSelected ? '#F0B429' : isAirborne ? C.airborne : C.ground
            const size  = isSelected ? 16 : isAirborne ? 13 : 10

            return (
              <g key={reg} style={{ cursor:'pointer' }}
                onClick={(e) => { e.stopPropagation(); setSelectedReg(isSelected ? null : reg) }}>

                {/* Halo sélection */}
                {isSelected && (
                  <circle cx={x} cy={y} r={24} fill="none" stroke="#F0B429" strokeWidth={1.5}
                    strokeDasharray="4,3" opacity={0.6}/>
                )}

                {/* Ombre / glow */}
                <circle cx={x} cy={y} r={isAirborne ? size+4 : size+2}
                  fill={`${color}15`} stroke={`${color}40`} strokeWidth={1}/>

                {/* Icône avion */}
                <PlaneIcon x={x} y={y} heading={pos.heading || 0} color={color} size={size} animated={true}/>

                {/* Label registration */}
                <text x={x+size+6} y={y-4} fill={color} fontSize={9} fontWeight={800} fontFamily="monospace">
                  {reg.replace('F-','')}
                </text>
                {pos.flight_number && (
                  <text x={x+size+6} y={y+7} fill="#5B8DB8" fontSize={8} fontFamily="monospace">
                    {pos.flight_number}
                  </text>
                )}
                {isAirborne && pos.altitude_ft > 0 && (
                  <text x={x+size+6} y={y+18} fill="#2D5580" fontSize={7} fontFamily="monospace">
                    FL{Math.round(pos.altitude_ft/100).toString().padStart(3,'0')}
                  </text>
                )}

                {/* Indicateur source */}
                {pos.source === 'opensky' && (
                  <circle cx={x-size} cy={y-size} r={3} fill="#4ADE80" stroke="#0A1628" strokeWidth={1}/>
                )}
              </g>
            )
          })}

          {/* ETA labels sur destinations */}
          {Object.entries(etas).map(([reg, eta]) => {
            const pos  = positions[reg]
            if (!pos?.destination) return null
            const dest = AIRPORTS[pos.destination]
            if (!dest) return null
            const { x, y } = proj(dest.lat, dest.lng)
            return (
              <g key={`eta-${reg}`}>
                <rect x={x-22} y={y-32} width={44} height={14} rx={4}
                  fill="rgba(7,17,24,0.85)" stroke={C.eta} strokeWidth={1}/>
                <text x={x} y={y-22} textAnchor="middle" fill={C.eta} fontSize={9} fontWeight={700} fontFamily="monospace">
                  {eta.etaStr}
                </text>
              </g>
            )
          })}

          {/* Légende */}
          <g transform="translate(12,12)">
            <rect width={110} height={74} rx={6} fill="rgba(7,17,24,0.85)" stroke="#1E3A5F" strokeWidth={1}/>
            <text x={8} y={16} fill="#5B8DB8" fontSize={9} fontWeight={700} fontFamily="monospace" letterSpacing={1}>LÉGENDE</text>
            {[
              { color:C.airborne, label:'En vol', y:30 },
              { color:C.ground,   label:'Au sol',  y:44 },
              { color:C.airport,  label:'Aéroport', y:58 },
              { color:C.eta,      label:'ETA',      y:72 },
            ].map(item => (
              <g key={item.label}>
                <circle cx={16} cy={item.y-4} r={4} fill={item.color}/>
                <text x={26} y={item.y} fill="#94A3B8" fontSize={9} fontFamily="monospace">{item.label}</text>
              </g>
            ))}
          </g>

          {/* Timestamp */}
          <text x={SVG_W-8} y={SVG_H-6} textAnchor="end" fill="#1E3A5F" fontSize={8} fontFamily="monospace">
            {new Date().toLocaleTimeString('fr-FR')} UTC-4
          </text>
        </svg>

        {/* Loader overlay */}
        {loading && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
            backgroundColor:'rgba(7,17,24,0.8)', backdropFilter:'blur(4px)' }}>
            <div style={{ color:'#3B82F6', fontFamily:'monospace', fontSize:13 }}>
              ⟳ Initialisation carte...
            </div>
          </div>
        )}
      </div>

      {/* ── Panneau infos avion sélectionné ───────────────────────────────── */}
      {selectedReg && selectedPos && (
        <div style={{ padding:'14px 16px', backgroundColor:'rgba(7,23,41,0.97)',
          borderTop:'1px solid #1E3A5F', display:'flex', flexWrap:'wrap', gap:16, alignItems:'flex-start' }}>

          {/* Identité */}
          <div style={{ minWidth:130 }}>
            <div style={{ fontFamily:'monospace', fontWeight:900, fontSize:20, color:'#F0B429', letterSpacing:2, lineHeight:1 }}>
              {selectedReg}
            </div>
            {selectedPos.flight_number && (
              <div style={{ fontSize:11, color:'#5B8DB8', marginTop:3 }}>{selectedPos.flight_number}</div>
            )}
            <div style={{ marginTop:6 }}>
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6,
                backgroundColor: selectedPos.status==='airborne' ? 'rgba(59,130,246,0.15)' : 'rgba(91,141,184,0.15)',
                color:           selectedPos.status==='airborne' ? '#93C5FD'                : '#5B8DB8',
                border:          `1px solid ${selectedPos.status==='airborne'?'rgba(59,130,246,0.3)':'rgba(30,58,95,0.5)'}` }}>
                {selectedPos.status === 'airborne' ? '▲ EN VOL' : '■ AU SOL'}
              </span>
            </div>
          </div>

          {/* Route */}
          {selectedPos.origin && selectedPos.destination && (
            <div>
              <div style={{ fontSize:9, color:'#2D5580', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Route</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:'monospace', fontWeight:800, fontSize:15, color:'#F1F5F9' }}>
                    {AIRPORTS[selectedPos.origin]?.short || selectedPos.origin}
                  </div>
                  <div style={{ fontSize:9, color:'#475569' }}>{selectedPos.origin}</div>
                </div>
                <div style={{ color:'#1E3A5F', fontSize:18 }}>→</div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:'monospace', fontWeight:800, fontSize:15, color:'#F1F5F9' }}>
                    {AIRPORTS[selectedPos.destination]?.short || selectedPos.destination}
                  </div>
                  <div style={{ fontSize:9, color:'#475569' }}>{selectedPos.destination}</div>
                </div>
              </div>
            </div>
          )}

          {/* Données vol */}
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            {[
              { label:'Cap',       value: `${Math.round(selectedPos.heading||0)}° ${headingToCardinal(selectedPos.heading||0)}` },
              { label:'Vitesse',   value: `${selectedPos.speed_kts||0} kts` },
              { label:'Altitude',  value: selectedPos.altitude_ft > 0 ? `FL${Math.round(selectedPos.altitude_ft/100).toString().padStart(3,'0')}` : 'Sol' },
              { label:'Lat/Lng',   value: `${selectedPos.lat?.toFixed(4)}° / ${selectedPos.lng?.toFixed(4)}°` },
              { label:'Source',    value: selectedPos.source === 'opensky' ? '📡 ADS-B réel' : selectedPos.source === 'manual' ? '📍 Manuel' : '⟳ Simulé' },
            ].map(k => (
              <div key={k.label}>
                <div style={{ fontSize:9, color:'#2D5580', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>{k.label}</div>
                <div style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#CBD5E1' }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* ETA */}
          {selectedETA && (
            <div style={{ padding:'10px 14px', borderRadius:10,
              backgroundColor:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.2)' }}>
              <div style={{ fontSize:9, color:'#2D5580', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>ETA</div>
              <div style={{ fontFamily:'monospace', fontSize:18, fontWeight:900, color:'#4ADE80', lineHeight:1 }}>
                {selectedETA.etaStr}
              </div>
              <div style={{ fontSize:10, color:'#5B8DB8', marginTop:3 }}>
                {selectedETA.remainNm} nm · {selectedETA.remainMin} min
              </div>
            </div>
          )}

          {/* Alertes météo route */}
          {selectedFlight && weatherAlerts[selectedFlight.id]?.length > 0 && (
            <div style={{ padding:'10px 14px', borderRadius:10,
              backgroundColor:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)' }}>
              <div style={{ fontSize:9, color:'#F59E0B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>
                ⚠ Alertes route
              </div>
              {weatherAlerts[selectedFlight.id].map(z => (
                <div key={z.id} style={{ fontSize:11, color:'#FCD34D', marginTop:3 }}>
                  • {z.label} — {z.detail}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Barre statut bas ──────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'6px 16px', backgroundColor:'rgba(7,17,24,0.95)',
        borderTop:'1px solid rgba(30,58,95,0.4)', flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', gap:16 }}>
          {Object.values(AIRPORTS).map(ap => {
            const ac = Object.values(positions).filter(p => p.destination === ap.icao && p.status==='airborne')
            return (
              <div key={ap.icao} style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ fontSize:10, fontFamily:'monospace', color:'#F0B429', fontWeight:700 }}>{ap.short}</span>
                {ac.length > 0
                  ? <span style={{ fontSize:9, color:'#4ADE80' }}>← {ac.length} inbound</span>
                  : <span style={{ fontSize:9, color:'#1E3A5F' }}>—</span>}
              </div>
            )
          })}
        </div>
        <div style={{ display:'flex', gap:12 }}>
          <span style={{ fontSize:9, fontFamily:'monospace', color:'#1E3A5F' }}>
            OpenSky: {openSkyStatus === 'ok' ? `${openSkyData.length} correspondances` : openSkyStatus}
          </span>
          <span style={{ fontSize:9, fontFamily:'monospace', color:'#1E3A5F' }}>
            {simulationOn ? '⟳ Simulation active' : '— Simulation off'}
          </span>
        </div>
      </div>

      {/* ── Modal mise à jour manuelle ────────────────────────────────────── */}
      {manualModal && (
        <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center',
          backgroundColor:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)' }}
          onClick={() => setManualModal(false)}>
          <div style={{ backgroundColor:'#0F1E35', border:'1px solid #1E3A5F', borderRadius:16,
            padding:24, width:400, maxWidth:'92vw' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color:'#F0B429', fontWeight:800, fontSize:15, marginBottom:16 }}>
              📍 Mise à jour manuelle position
            </h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { key:'registration', label:'Immatriculation', placeholder:'F-OSBC', full:true },
                { key:'lat',     label:'Latitude',   placeholder:'17.92' },
                { key:'lng',     label:'Longitude',  placeholder:'-62.84' },
                { key:'altitude_ft', label:'Altitude (ft)', placeholder:'8500' },
                { key:'heading', label:'Cap (°)',     placeholder:'045' },
                { key:'speed_kts', label:'Vitesse (kts)', placeholder:'170' },
              ].map(f => (
                <div key={f.key} style={f.full ? { gridColumn:'1/-1' } : {}}>
                  <label style={{ fontSize:10, color:'#5B8DB8', display:'block', marginBottom:3, textTransform:'uppercase', letterSpacing:'0.06em' }}>{f.label}</label>
                  <input value={manualForm[f.key]} placeholder={f.placeholder}
                    onChange={e => setManualForm(v => ({ ...v, [f.key]:e.target.value }))}
                    style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid #1E3A5F',
                      backgroundColor:'#071729', color:'#F1F5F9', fontSize:12, boxSizing:'border-box' }}/>
                </div>
              ))}
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ fontSize:10, color:'#5B8DB8', display:'block', marginBottom:3, textTransform:'uppercase', letterSpacing:'0.06em' }}>Statut</label>
                <select value={manualForm.status} onChange={e => setManualForm(v=>({...v,status:e.target.value}))}
                  style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid #1E3A5F',
                    backgroundColor:'#071729', color:'#F1F5F9', fontSize:12 }}>
                  <option value="airborne">▲ En vol</option>
                  <option value="ground">■ Au sol</option>
                </select>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button onClick={() => setManualModal(false)}
                style={{ padding:'8px 18px', borderRadius:8, fontSize:12, cursor:'pointer',
                  backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155' }}>
                Annuler
              </button>
              <button onClick={handleManualSave} disabled={savingManual || !manualForm.registration || !manualForm.lat}
                style={{ flex:1, padding:'8px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                  backgroundColor:'#F0B429', color:'#0B1F3A', border:'none',
                  opacity: savingManual || !manualForm.registration || !manualForm.lat ? 0.5 : 1 }}>
                {savingManual ? '⟳ Envoi...' : '✓ Mettre à jour'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Erreur */}
      {error && (
        <div style={{ position:'absolute', top:50, left:'50%', transform:'translateX(-50%)',
          padding:'8px 16px', borderRadius:8, backgroundColor:'rgba(239,68,68,0.15)',
          border:'1px solid rgba(239,68,68,0.4)', display:'flex', gap:10, alignItems:'center', zIndex:10 }}>
          <span style={{ fontSize:11, color:'#F87171' }}>⚠ {error}</span>
          <button onClick={clearError} style={{ fontSize:11, color:'#F87171', cursor:'pointer', background:'none', border:'none' }}>✕</button>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.5; transform:scale(1.4); }
        }
      `}</style>
    </div>
  )
}