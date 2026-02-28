/**
 * @fileoverview Live Map SVG — SKYBH v2
 * Fixes : bounding box resserrée · zones météo en px · îles recalibrées · simulation tous statuts
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLiveMap } from '../../hooks/use-live-map'
import {
  project, AIRPORTS, ISLANDS, ROUTES, WEATHER_ZONES,
  nmToPx, intermediatePoint, headingToCardinal,
  SVG_W, SVG_H, MAP_BOUNDS,
} from '../../utils/map-utils'

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  sea:     '#071828',
  seaMid:  '#0A1E32',
  land:    '#152840',
  landEdge:'#1E4A6F',
  grid:    'rgba(30,74,111,0.22)',
  airport: '#F0B429',
  airborne:'#3B82F6',
  ground:  '#4A7A9B',
  track:   'rgba(59,130,246,0.55)',
  future:  'rgba(59,130,246,0.25)',
  eta:     '#4ADE80',
  selected:'#F0B429',
  navy:    '#0B1F3A',
}

// ── Icône avion SVG (centrée sur 0,0, orientée cap=0 vers le haut) ─────────────
const PlaneShape = ({ color, size }) => (
  <g>
    {/* Fuselage */}
    <polygon
      points={`0,${-size} ${size*0.28},${size*0.35} 0,${size*0.18} ${-size*0.28},${size*0.35}`}
      fill={color} opacity={0.96}
    />
    {/* Ailes */}
    <polygon
      points={`${-size*0.85},${size*0.08} ${size*0.85},${size*0.08} ${size*0.18},${size*0.28} ${-size*0.18},${size*0.28}`}
      fill={color} opacity={0.82}
    />
    {/* Empennage */}
    <polygon
      points={`${-size*0.32},${size*0.28} ${size*0.32},${size*0.28} ${size*0.14},${size*0.48} ${-size*0.14},${size*0.48}`}
      fill={color} opacity={0.75}
    />
  </g>
)

// ── Marqueur aéroport ─────────────────────────────────────────────────────────
const AirportMarker = ({ ap, px, py, isHighlighted }) => {
  const sz = isHighlighted ? 9 : 7
  return (
    <g>
      {/* Croix runway */}
      <line x1={px-sz} y1={py} x2={px+sz} y2={py} stroke={C.airport} strokeWidth={isHighlighted?2:1.4} opacity={0.9}/>
      <line x1={px} y1={py-sz} x2={px} y2={py+sz} stroke={C.airport} strokeWidth={isHighlighted?2:1.4} opacity={0.9}/>
      {/* Cercle centre */}
      <circle cx={px} cy={py} r={3.5} fill={C.navy} stroke={C.airport} strokeWidth={isHighlighted?2:1.2}/>
      {/* Short name */}
      <text x={px+12} y={py+2} fill={C.airport} fontSize={11} fontWeight="700" fontFamily="monospace">
        {ap.short}
      </text>
      <text x={px+12} y={py+13} fill="#2D5580" fontSize={8.5} fontFamily="monospace">
        {ap.icao}
      </text>
    </g>
  )
}

// ── Lignes de grille ──────────────────────────────────────────────────────────
const GRID_LATS = [17.4, 17.6, 17.8, 18.0, 18.2, 18.4]
const GRID_LNGS = [-63.4, -63.2, -63.0, -62.8, -62.6, -62.4, -62.2]

export default function LiveMap({ flights = [], fleet = [], user = null, fullscreen = false, onToggleFullscreen }) {
  const [selectedReg,   setSelectedReg]   = useState(null)
  const [showRoutes,    setShowRoutes]     = useState(true)
  const [showWeather,   setShowWeather]    = useState(true)
  const [showGrid,      setShowGrid]       = useState(false)
  const [showTracks,    setShowTracks]     = useState(true)
  const [manualModal,   setManualModal]    = useState(false)
  const [manualForm,    setManualForm]     = useState({
    registration:'', lat:'', lng:'', altitude_ft:'', heading:'', speed_kts:'', status:'airborne',
  })
  const [savingManual,  setSavingManual]   = useState(false)
  const [svgSize,       setSvgSize]        = useState({ w: SVG_W, h: SVG_H })
  const svgRef = useRef(null)

  const {
    positions, tracks, etas, weatherAlerts,
    airborne, openSkyData, openSkyStatus,
    simulationOn, setSimulationOn,
    loading, error,
    onManualUpdate, onFetchOpenSky, clearError,
  } = useLiveMap({ flights, fleet, user })

  // ── Responsive SVG ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width
      setSvgSize({ w, h: Math.round(w * (SVG_H / SVG_W)) })
    })
    ro.observe(svgRef.current)
    return () => ro.disconnect()
  }, [])

  const scale   = svgSize.w / SVG_W
  // Helper : projet lat/lng → pixels écran (scale appliqué)
  const px = useCallback((lat, lng) => {
    const p = project(lat, lng)
    return { x: p.x * scale, y: p.y * scale }
  }, [scale])

  // ── Objets dérivés ─────────────────────────────────────────────────────────
  const selectedPos    = selectedReg ? positions[selectedReg] : null
  const selectedFlight = selectedReg
    ? flights.find(f => f.aircraft === selectedReg)
    : null
  const selectedTrack  = selectedFlight ? tracks[selectedFlight.id] : null
  const selectedETA    = selectedReg ? etas[selectedReg] : null

  // ── Polygone île → points SVG string ──────────────────────────────────────
  const islandSvgPts = useCallback((pts) =>
    pts.map(([lat,lng]) => { const p = px(lat,lng); return `${p.x},${p.y}` }).join(' ')
  , [px])

  // ── Chemin SVG pour une trajectoire ───────────────────────────────────────
  const trackPath = useCallback((points) =>
    points.map((p, i) => {
      const { x, y } = px(p.lat, p.lng)
      return `${i===0?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  , [px])

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
      setManualForm({ registration:'', lat:'', lng:'', altitude_ft:'', heading:'', speed_kts:'', status:'airborne' })
    } finally { setSavingManual(false) }
  }

  const mapH = Math.round(svgSize.w * (SVG_H / SVG_W))

  // ── Toggle style ───────────────────────────────────────────────────────────
  const btnStyle = (active, activeColor='rgba(59,130,246,0.2)', activeText='#93C5FD') => ({
    fontSize:11, fontWeight:600, padding:'4px 11px', borderRadius:7,
    cursor:'pointer', border:'none', transition:'all 0.15s',
    backgroundColor: active ? activeColor : 'rgba(30,58,95,0.35)',
    color:           active ? activeText  : '#475569',
  })

  return (
    <div style={{
      display:'flex', flexDirection:'column',
      backgroundColor: C.navy,
      borderRadius: fullscreen ? 0 : 14,
      border: fullscreen ? 'none' : '1px solid #1E3A5F',
      overflow:'hidden', position:'relative',
    }}>

      {/* ── Barre contrôle ─────────────────────────────────────────────────── */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'9px 16px', backgroundColor:'rgba(7,17,24,0.97)',
        borderBottom:'1px solid #1E3A5F', flexWrap:'wrap', gap:8,
      }}>
        {/* Titre */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{
            width:8, height:8, borderRadius:'50%',
            backgroundColor:'#EF4444', boxShadow:'0 0 7px #EF4444',
            animation:'livePulse 1.5s ease-in-out infinite',
          }}/>
          <span style={{ fontSize:12, fontWeight:800, color:'#F1F5F9', letterSpacing:1.5 }}>LIVE MAP</span>
          <span style={{ fontSize:10, color:'#2D5580', fontFamily:'monospace' }}>
            {airborne.length} en vol · {Object.keys(positions).length - airborne.length} au sol
          </span>
        </div>

        {/* Contrôles */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          {[
            { label:'Routes',  state:showRoutes,  set:setShowRoutes  },
            { label:'Météo',   state:showWeather, set:setShowWeather },
            { label:'Tracks',  state:showTracks,  set:setShowTracks  },
            { label:'Grille',  state:showGrid,    set:setShowGrid    },
          ].map(t => (
            <button key={t.label} onClick={() => t.set(!t.state)} style={btnStyle(t.state)}>
              {t.label}
            </button>
          ))}

          <div style={{ width:1, height:16, backgroundColor:'#1E3A5F' }}/>

          <button onClick={() => setSimulationOn(!simulationOn)}
            style={btnStyle(simulationOn,'rgba(16,185,129,0.15)','#34D399')}>
            ⟳ Sim {simulationOn ? 'ON' : 'OFF'}
          </button>

          <button onClick={onFetchOpenSky} disabled={openSkyStatus==='loading'}
            style={btnStyle(openSkyStatus==='ok','rgba(16,185,129,0.12)','#34D399')}>
            {openSkyStatus==='loading' ? '⟳ ADS-B…' : openSkyStatus==='ok' ? '✓ ADS-B' : '📡 ADS-B'}
          </button>

          <button onClick={() => setManualModal(true)}
            style={{ ...btnStyle(false), backgroundColor:'rgba(240,180,41,0.12)', color:'#F0B429' }}>
            📍 Manuel
          </button>

          <button onClick={onToggleFullscreen}
            style={{ fontSize:13, padding:'4px 9px', borderRadius:7, cursor:'pointer',
              border:'none', backgroundColor:'rgba(30,58,95,0.5)', color:'#5B8DB8' }}>
            {fullscreen ? '⊠' : '⊞'}
          </button>
        </div>
      </div>

      {/* ── SVG Carte ──────────────────────────────────────────────────────── */}
      <div ref={svgRef} style={{ width:'100%', backgroundColor: C.sea, position:'relative' }}>
        <svg
          width="100%" height={mapH}
          viewBox={`0 0 ${svgSize.w} ${svgSize.w * SVG_H / SVG_W}`}
          style={{ display:'block' }}
          onClick={e => { if(e.target.tagName==='svg'||e.target.tagName==='rect') setSelectedReg(null) }}>

          {/* Fond */}
          <defs>
            <radialGradient id="seaGrad" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor="#0A1E32"/>
              <stop offset="100%" stopColor="#071118"/>
            </radialGradient>
          </defs>
          <rect width={svgSize.w} height={mapH} fill="url(#seaGrad)"/>

          {/* Grille */}
          {showGrid && GRID_LATS.map(lat => {
            const p1 = px(lat, MAP_BOUNDS.minLng + 0.05)
            const p2 = px(lat, MAP_BOUNDS.maxLng - 0.05)
            return (
              <g key={`glat${lat}`}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={C.grid} strokeWidth={0.5} strokeDasharray="5,5"/>
                <text x={p1.x+3} y={p1.y-3} fill={C.grid} fontSize={7} fontFamily="monospace">{lat}°N</text>
              </g>
            )
          })}
          {showGrid && GRID_LNGS.map(lng => {
            const p1 = px(MAP_BOUNDS.minLat+0.05, lng)
            const p2 = px(MAP_BOUNDS.maxLat-0.05, lng)
            return (
              <g key={`glng${lng}`}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={C.grid} strokeWidth={0.5} strokeDasharray="5,5"/>
                <text x={p1.x+2} y={p1.y-4} fill={C.grid} fontSize={7} fontFamily="monospace">{Math.abs(lng)}°W</text>
              </g>
            )
          })}

          {/* Îles */}
          {ISLANDS.map(island => (
            <polygon key={island.name}
              points={islandSvgPts(island.points)}
              fill={island.fill} stroke={island.stroke} strokeWidth={island.sw * scale}
              opacity={0.92}/>
          ))}

          {/* Zones météo — rayon en PIXELS grâce à nmToPx */}
          {showWeather && WEATHER_ZONES.map(zone => {
            const c   = px(zone.lat, zone.lng)
            const rPx = nmToPx(zone.radiusNm, svgSize.w)   // ← FIX : plus de cercles géants
            return (
              <g key={zone.id}>
                <circle cx={c.x} cy={c.y} r={rPx}
                  fill={zone.color} stroke={zone.border}
                  strokeWidth={1.5} strokeDasharray="7,4" opacity={0.88}/>
                <text x={c.x} y={c.y - rPx - 6} textAnchor="middle"
                  fill={zone.border} fontSize={9.5} fontWeight="700" fontFamily="monospace">
                  ⚠ {zone.label}
                </text>
              </g>
            )
          })}

          {/* Routes aériennes */}
          {showRoutes && ROUTES.map(([a, b]) => {
            const oa = AIRPORTS[a], ob = AIRPORTS[b]
            if (!oa || !ob) return null
            const pa  = px(oa.lat, oa.lng)
            const pb  = px(ob.lat, ob.lng)
            const mid = { lat:(oa.lat+ob.lat)/2, lng:(oa.lng+ob.lng)/2 }
            const pm  = px(mid.lat, mid.lng)
            const isActive = flights.some(f =>
              f.status !== 'cancelled' &&
              ((f.origin===a&&f.destination===b)||(f.origin===b&&f.destination===a))
            )
            return (
              <path key={`${a}-${b}`}
                d={`M${pa.x.toFixed(1)},${pa.y.toFixed(1)} Q${pm.x.toFixed(1)},${pm.y.toFixed(1)} ${pb.x.toFixed(1)},${pb.y.toFixed(1)}`}
                fill="none"
                stroke={isActive ? 'rgba(59,130,246,0.55)' : 'rgba(30,74,111,0.4)'}
                strokeWidth={isActive ? 1.8 : 0.9}
                strokeDasharray={isActive ? 'none' : '6,5'}/>
            )
          })}

          {/* Trajectoires */}
          {showTracks && Object.entries(tracks).map(([fid, track]) => {
            if (!track?.points?.length) return null
            const now     = new Date()
            const elapsed = track.points.filter(p => new Date(p.timestamp) <= now)
            const future  = track.points.filter(p => new Date(p.timestamp) >  now)
            const isSel   = selectedFlight?.id === fid

            return (
              <g key={fid}>
                {elapsed.length > 1 && (
                  <path d={trackPath(elapsed)} fill="none"
                    stroke={isSel ? '#60A5FA' : 'rgba(59,130,246,0.5)'}
                    strokeWidth={isSel ? 2.5 : 1.6}
                    strokeLinecap="round" strokeLinejoin="round"/>
                )}
                {future.length > 1 && (
                  <path
                    d={trackPath([elapsed[elapsed.length-1], ...future].filter(Boolean))}
                    fill="none" stroke="rgba(59,130,246,0.28)"
                    strokeWidth={1.2} strokeDasharray="7,5" strokeLinecap="round"/>
                )}
                {isSel && elapsed.filter((_,i)=>i%4===0).map((p,i) => {
                  const { x,y } = px(p.lat, p.lng)
                  return <circle key={i} cx={x} cy={y} r={2.5} fill="#3B82F6" opacity={0.45}/>
                })}
              </g>
            )
          })}

          {/* Aéroports */}
          {Object.values(AIRPORTS).map(ap => {
            const { x, y } = px(ap.lat, ap.lng)
            const isHL = selectedPos?.origin===ap.icao || selectedPos?.destination===ap.icao
            return <AirportMarker key={ap.icao} ap={ap} px={x} py={y} isHighlighted={isHL}/>
          })}

          {/* ETA labels sur destinations */}
          {Object.entries(etas).map(([reg, eta]) => {
            const pos  = positions[reg]
            if (!pos?.destination) return null
            const dest = AIRPORTS[pos.destination]
            if (!dest) return null
            const { x, y } = px(dest.lat, dest.lng)
            return (
              <g key={`eta-${reg}`}>
                <rect x={x-24} y={y-34} width={48} height={16} rx={5}
                  fill="rgba(7,17,24,0.88)" stroke={C.eta} strokeWidth={1}/>
                <text x={x} y={y-23} textAnchor="middle"
                  fill={C.eta} fontSize={9.5} fontWeight="700" fontFamily="monospace">
                  {eta.etaStr}
                </text>
              </g>
            )
          })}

          {/* ── Avions ─────────────────────────────────────────────────────── */}
          {Object.entries(positions).map(([reg, pos]) => {
            if (pos.lat == null || pos.lng == null) return null
            const { x, y }  = px(pos.lat, pos.lng)
            const isAirborne = pos.status === 'airborne'
            const isSel      = selectedReg === reg
            const color      = isSel ? C.selected : isAirborne ? C.airborne : C.ground
            const size       = (isSel ? 15 : isAirborne ? 12 : 9) * Math.max(0.7, Math.min(1.3, scale))

            return (
              <g key={reg} style={{ cursor:'pointer' }}
                onClick={e => { e.stopPropagation(); setSelectedReg(isSel ? null : reg) }}>

                {/* Halo sélection */}
                {isSel && (
                  <circle cx={x} cy={y} r={26}
                    fill="none" stroke="#F0B429" strokeWidth={1.5}
                    strokeDasharray="5,4" opacity={0.65}/>
                )}

                {/* Glow */}
                <circle cx={x} cy={y} r={size + (isAirborne ? 5 : 3)}
                  fill={`${color}12`} stroke={`${color}35`} strokeWidth={1}/>

                {/* Avion */}
                <g transform={`translate(${x},${y}) rotate(${pos.heading || 0})`}>
                  <PlaneShape color={color} size={size}/>
                </g>

                {/* Labels */}
                <text x={x + size + 7} y={y - 3}
                  fill={color} fontSize={9.5} fontWeight="800" fontFamily="monospace">
                  {reg.replace('F-', '')}
                </text>
                {pos.flight_number && (
                  <text x={x + size + 7} y={y + 9}
                    fill="#5B8DB8" fontSize={8} fontFamily="monospace">
                    {pos.flight_number}
                  </text>
                )}
                {isAirborne && pos.altitude_ft > 0 && (
                  <text x={x + size + 7} y={y + 20}
                    fill="#2D5580" fontSize={7.5} fontFamily="monospace">
                    FL{Math.round(pos.altitude_ft / 100).toString().padStart(3,'0')}
                  </text>
                )}
                {/* Badge source OpenSky */}
                {pos.source === 'opensky' && (
                  <circle cx={x - size - 2} cy={y - size}
                    r={3.5} fill="#4ADE80" stroke={C.navy} strokeWidth={1.2}/>
                )}
              </g>
            )
          })}

          {/* Légende */}
          <g transform="translate(12,12)">
            <rect width={116} height={80} rx={8}
              fill="rgba(7,17,24,0.88)" stroke="#1E3A5F" strokeWidth={1}/>
            <text x={10} y={17} fill="#5B8DB8" fontSize={9} fontWeight="700"
              fontFamily="monospace" letterSpacing={1.2}>LÉGENDE</text>
            {[
              { color:C.airborne, label:'En vol',    y:33 },
              { color:C.ground,   label:'Au sol',    y:47 },
              { color:C.airport,  label:'Aéroport',  y:61 },
              { color:C.eta,      label:'ETA',        y:75 },
            ].map(item => (
              <g key={item.label}>
                <circle cx={18} cy={item.y - 4} r={4.5} fill={item.color}/>
                <text x={30} y={item.y} fill="#94A3B8" fontSize={9} fontFamily="monospace">
                  {item.label}
                </text>
              </g>
            ))}
          </g>

          {/* Timestamp */}
          <text x={svgSize.w - 10} y={mapH - 8} textAnchor="end"
            fill="#1E3A5F" fontSize={8} fontFamily="monospace">
            {new Date().toLocaleTimeString('fr-FR')} UTC-4
          </text>
        </svg>

        {/* Loader */}
        {loading && (
          <div style={{
            position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
            backgroundColor:'rgba(7,17,24,0.82)', backdropFilter:'blur(4px)',
          }}>
            <span style={{ color:'#3B82F6', fontFamily:'monospace', fontSize:13 }}>
              ⟳ Initialisation carte…
            </span>
          </div>
        )}
      </div>

      {/* ── Panneau avion sélectionné ──────────────────────────────────────── */}
      {selectedReg && selectedPos && (
        <div style={{
          padding:'14px 20px', backgroundColor:'rgba(7,23,41,0.98)',
          borderTop:'1px solid #1E3A5F',
          display:'flex', flexWrap:'wrap', gap:18, alignItems:'flex-start',
        }}>
          {/* Identité */}
          <div style={{ minWidth:130 }}>
            <div style={{ fontFamily:'monospace', fontWeight:900, fontSize:22, color:'#F0B429', letterSpacing:2, lineHeight:1 }}>
              {selectedReg}
            </div>
            {selectedPos.flight_number && (
              <div style={{ fontSize:11, color:'#5B8DB8', marginTop:3 }}>{selectedPos.flight_number}</div>
            )}
            <div style={{ marginTop:7 }}>
              <span style={{
                fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:6,
                backgroundColor: selectedPos.status==='airborne' ? 'rgba(59,130,246,0.15)' : 'rgba(91,141,184,0.12)',
                color:           selectedPos.status==='airborne' ? '#93C5FD'                : '#5B8DB8',
                border:          `1px solid ${selectedPos.status==='airborne'?'rgba(59,130,246,0.3)':'rgba(30,58,95,0.5)'}`,
              }}>
                {selectedPos.status==='airborne' ? '▲ EN VOL' : '■ AU SOL'}
              </span>
            </div>
          </div>

          {/* Route */}
          {selectedPos.origin && selectedPos.destination && (
            <div>
              <div style={{ fontSize:9, color:'#2D5580', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Route</div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:'monospace', fontWeight:800, fontSize:16, color:'#F1F5F9' }}>
                    {AIRPORTS[selectedPos.origin]?.short || selectedPos.origin}
                  </div>
                  <div style={{ fontSize:9, color:'#475569' }}>{selectedPos.origin}</div>
                </div>
                <div style={{ color:'#1E3A5F', fontSize:20 }}>→</div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:'monospace', fontWeight:800, fontSize:16, color:'#F1F5F9' }}>
                    {AIRPORTS[selectedPos.destination]?.short || selectedPos.destination}
                  </div>
                  <div style={{ fontSize:9, color:'#475569' }}>{selectedPos.destination}</div>
                </div>
              </div>
            </div>
          )}

          {/* Données vol */}
          <div style={{ display:'flex', gap:18, flexWrap:'wrap' }}>
            {[
              { label:'Cap',      value:`${Math.round(selectedPos.heading||0)}° ${headingToCardinal(selectedPos.heading||0)}` },
              { label:'Vitesse',  value:`${selectedPos.speed_kts||0} kts` },
              { label:'Altitude', value: selectedPos.altitude_ft>0 ? `FL${Math.round(selectedPos.altitude_ft/100).toString().padStart(3,'0')}` : 'Sol' },
              { label:'Position', value:`${selectedPos.lat?.toFixed(3)}° / ${selectedPos.lng?.toFixed(3)}°` },
              { label:'Source',   value: selectedPos.source==='opensky'?'📡 ADS-B réel': selectedPos.source==='manual'?'📍 Manuel':'⟳ Simulé' },
            ].map(k => (
              <div key={k.label}>
                <div style={{ fontSize:9, color:'#2D5580', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:3 }}>{k.label}</div>
                <div style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#CBD5E1' }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* ETA */}
          {selectedETA && (
            <div style={{
              padding:'10px 16px', borderRadius:10,
              backgroundColor:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.2)',
            }}>
              <div style={{ fontSize:9, color:'#2D5580', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>ETA</div>
              <div style={{ fontFamily:'monospace', fontSize:20, fontWeight:900, color:'#4ADE80', lineHeight:1 }}>
                {selectedETA.etaStr}
              </div>
              <div style={{ fontSize:10, color:'#5B8DB8', marginTop:3 }}>
                {selectedETA.remainNm} nm · {selectedETA.remainMin} min
              </div>
            </div>
          )}

          {/* Alertes météo route */}
          {selectedFlight && weatherAlerts[selectedFlight.id]?.length > 0 && (
            <div style={{
              padding:'10px 14px', borderRadius:10,
              backgroundColor:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)',
            }}>
              <div style={{ fontSize:9, color:'#F59E0B', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>
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

      {/* ── Barre statut bas ────────────────────────────────────────────────── */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'6px 16px', backgroundColor:'rgba(7,17,24,0.97)',
        borderTop:'1px solid rgba(30,58,95,0.35)', flexWrap:'wrap', gap:6,
      }}>
        <div style={{ display:'flex', gap:14 }}>
          {Object.values(AIRPORTS).map(ap => {
            const inbound = Object.values(positions).filter(p => p.destination===ap.icao && p.status==='airborne')
            return (
              <div key={ap.icao} style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ fontSize:10, fontFamily:'monospace', color:'#F0B429', fontWeight:700 }}>{ap.short}</span>
                {inbound.length > 0
                  ? <span style={{ fontSize:9, color:'#4ADE80' }}>← {inbound.length} inbound</span>
                  : <span style={{ fontSize:9, color:'#1E3A5F' }}>—</span>}
              </div>
            )
          })}
        </div>
        <div style={{ display:'flex', gap:12 }}>
          <span style={{ fontSize:9, fontFamily:'monospace', color:'#1E3A5F' }}>
            OpenSky: {openSkyStatus==='ok' ? `${openSkyData.length} match` : openSkyStatus}
          </span>
          <span style={{ fontSize:9, fontFamily:'monospace', color:'#1E3A5F' }}>
            {simulationOn ? '⟳ Simulation active' : '— Sim off'}
          </span>
        </div>
      </div>

      {/* ── Modal position manuelle ─────────────────────────────────────────── */}
      {manualModal && (
        <div style={{
          position:'fixed', inset:0, zIndex:400,
          display:'flex', alignItems:'center', justifyContent:'center',
          backgroundColor:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)',
        }} onClick={() => setManualModal(false)}>
          <div style={{
            backgroundColor:'#0F1E35', border:'1px solid #1E3A5F',
            borderRadius:16, padding:24, width:400, maxWidth:'92vw',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color:'#F0B429', fontWeight:800, fontSize:15, margin:'0 0 18px' }}>
              📍 Mise à jour manuelle position
            </h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { key:'registration', label:'Immatriculation', placeholder:'F-OSBC', full:true },
                { key:'lat',          label:'Latitude',        placeholder:'17.92'             },
                { key:'lng',          label:'Longitude',       placeholder:'-62.84'            },
                { key:'altitude_ft',  label:'Altitude (ft)',   placeholder:'8500'              },
                { key:'heading',      label:'Cap (°)',         placeholder:'045'               },
                { key:'speed_kts',    label:'Vitesse (kts)',   placeholder:'170'               },
              ].map(f => (
                <div key={f.key} style={f.full ? { gridColumn:'1/-1' } : {}}>
                  <label style={{ fontSize:10, color:'#5B8DB8', display:'block', marginBottom:3,
                    textTransform:'uppercase', letterSpacing:'0.06em' }}>{f.label}</label>
                  <input
                    value={manualForm[f.key]} placeholder={f.placeholder}
                    onChange={e => setManualForm(v => ({ ...v, [f.key]: e.target.value }))}
                    style={{ width:'100%', padding:'7px 10px', borderRadius:8,
                      border:'1px solid #1E3A5F', backgroundColor:'#071729',
                      color:'#F1F5F9', fontSize:12, boxSizing:'border-box' }}/>
                </div>
              ))}
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ fontSize:10, color:'#5B8DB8', display:'block', marginBottom:3,
                  textTransform:'uppercase', letterSpacing:'0.06em' }}>Statut</label>
                <select value={manualForm.status}
                  onChange={e => setManualForm(v => ({ ...v, status:e.target.value }))}
                  style={{ width:'100%', padding:'7px 10px', borderRadius:8,
                    border:'1px solid #1E3A5F', backgroundColor:'#071729',
                    color:'#F1F5F9', fontSize:12 }}>
                  <option value="airborne">▲ En vol</option>
                  <option value="ground">■ Au sol</option>
                </select>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:18 }}>
              <button onClick={() => setManualModal(false)} style={{
                padding:'8px 18px', borderRadius:8, fontSize:12, cursor:'pointer',
                backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155',
              }}>Annuler</button>
              <button onClick={handleManualSave}
                disabled={savingManual || !manualForm.registration || !manualForm.lat}
                style={{
                  flex:1, padding:'8px', borderRadius:8, fontSize:12, fontWeight:700,
                  cursor:'pointer', backgroundColor:'#F0B429', color:'#0B1F3A', border:'none',
                  opacity: savingManual || !manualForm.registration || !manualForm.lat ? 0.5 : 1,
                }}>
                {savingManual ? '⟳ Envoi…' : '✓ Mettre à jour'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Erreur */}
      {error && (
        <div style={{
          position:'absolute', top:54, left:'50%', transform:'translateX(-50%)',
          padding:'8px 16px', borderRadius:8, zIndex:20,
          backgroundColor:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.4)',
          display:'flex', gap:10, alignItems:'center',
        }}>
          <span style={{ fontSize:11, color:'#F87171' }}>⚠ {error}</span>
          <button onClick={clearError} style={{ fontSize:11, color:'#F87171', cursor:'pointer', background:'none', border:'none' }}>✕</button>
        </div>
      )}

      <style>{`
        @keyframes livePulse {
          0%,100% { opacity:1; transform:scale(1);   }
          50%      { opacity:0.4; transform:scale(1.5); }
        }
      `}</style>
    </div>
  )
}