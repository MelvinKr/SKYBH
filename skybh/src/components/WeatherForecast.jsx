import { useState, useEffect, useCallback } from 'react'

const AVWX_KEY = import.meta.env.VITE_AVWX_API_KEY || ''

const AIRPORT_NAMES = {
  TFFJ: 'Saint-Barthélemy',
  TFFG: 'St-Martin Grand Case',
  TNCM: 'Sint-Maarten Juliana',
}

// Ces aérodromes n'émettent pas de TAF OACI — comportement attendu
const NO_TAF_AIRPORTS = ['TFFJ', 'TFFG']

const fmtHour  = d => d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
const fmtShort = d => d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' })
const toDate   = ts => ts?.toDate ? ts.toDate() : new Date(ts)

// ── Classification ────────────────────────────────────────────────────────────
function classifyConditions(vis, ceiling) {
  if (vis < 3 || (ceiling && ceiling < 500))  return 'IFR'
  if (vis < 5 || (ceiling && ceiling < 1000)) return 'MVFR'
  return 'VFR'
}

const VFR_CFG = {
  VFR:  { color:'#4ADE80', bg:'rgba(74,222,128,0.12)',  border:'rgba(74,222,128,0.3)',  label:'VFR',  short:'✓' },
  MVFR: { color:'#F0B429', bg:'rgba(240,180,41,0.12)',  border:'rgba(240,180,41,0.3)',  label:'MVFR', short:'~' },
  IFR:  { color:'#F87171', bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.3)', label:'IFR',  short:'✗' },
}

// ── Parse TAF ─────────────────────────────────────────────────────────────────
function parseTafForecast(tafData) {
  if (!tafData?.forecast?.length) return []
  return tafData.forecast.map(period => {
    const start   = period.start_time?.dt ? new Date(period.start_time.dt) : null
    const end     = period.end_time?.dt   ? new Date(period.end_time.dt)   : null
    if (!start || !end) return null
    const vis     = period.visibility?.value ?? 10
    const winds   = period.wind_speed?.value  ?? 0
    const gust    = period.wind_gust?.value   ?? null
    const clouds  = period.clouds || []
    const ceiling = clouds.find(c => ['BKN','OVC'].includes(c.type))?.altitude ?? null
    const wx      = (period.wx_codes || []).map(w => w.value).join(' ')
    return { start, end, vis, winds, gust, ceiling, wx, type: period.type || 'FM', status: classifyConditions(vis, ceiling), raw: period.raw || '' }
  }).filter(Boolean)
}

// ── Fenêtres horaires sur 24h depuis TAF ──────────────────────────────────────
function buildHourlyWindows(forecasts, hoursAhead = 24) {
  const now = new Date()
  return Array.from({ length: hoursAhead }, (_, i) => {
    const slot   = new Date(now.getTime() + i * 3_600_000)
    const period = forecasts.find(f => f.start <= slot && f.end > slot)
      || (i === 0 ? forecasts[0] : null)
    if (!period) return { hour: slot, status:'VFR', vis:10, ceiling:null, winds:0, gust:null, wx:'' }
    return { hour: slot, status: period.status, vis: period.vis, ceiling: period.ceiling, winds: period.winds, gust: period.gust, wx: period.wx }
  })
}

// ── Fenêtres horaires depuis METAR (projection plate) ────────────────────────
function buildMetarWindows(metar, hoursAhead = 24) {
  if (!metar) return []
  const status = metar.status || classifyConditions(metar.vis ?? 10, metar.ceiling ?? null)
  return Array.from({ length: hoursAhead }, (_, i) => ({
    hour: new Date(Date.now() + i * 3_600_000),
    status, isEstimate: true,
    vis:     metar.vis         ?? 10,
    ceiling: metar.ceiling     ?? null,
    winds:   metar.wind_speed  ?? 0,
    gust:    metar.wind_gust   ?? null,
    wx: '',
  }))
}

// ── Croiser vols + prévisions ─────────────────────────────────────────────────
function computeFlightRisks(flights, windowsByIcao) {
  return flights
    .filter(f => f.status === 'scheduled' || f.status === 'boarding')
    .map(f => {
      const dep = toDate(f.departure_time)
      const arr = toDate(f.arrival_time)
      const find = (icao, time) =>
        (windowsByIcao[icao] || []).find(w => Math.abs(w.hour - time) < 3_600_000) || null
      const depCond = find(f.origin,      dep)
      const arrCond = find(f.destination, arr)
      const statuses = [depCond?.status, arrCond?.status].filter(Boolean)
      const risk = statuses.includes('IFR') ? 'IFR' : statuses.includes('MVFR') ? 'MVFR' : 'VFR'
      return { flight: f, dep, arr, depCond, arrCond, risk }
    })
    .filter(r => r.risk !== 'VFR')
}

// ── Barre horaire 24h ─────────────────────────────────────────────────────────
function HourlyBar({ windows }) {
  const [hovered, setHovered] = useState(null)
  if (!windows.length) return null

  return (
    <div>
      <div style={{ position:'relative' }}>
        {/* Barre */}
        <div style={{ display:'flex', height:30, borderRadius:6, overflow:'hidden', border:'1px solid #1E3A5F' }}>
          {windows.map((w, i) => {
            const cfg = VFR_CFG[w.status]
            return (
              <div key={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  flex: 1,
                  backgroundColor: hovered === i ? cfg.color + '50' : cfg.bg,
                  borderRight: i < windows.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                  cursor: 'default',
                  transition: 'background-color 0.1s',
                  backgroundImage: w.isEstimate
                    ? 'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(0,0,0,0.1) 4px,rgba(0,0,0,0.1) 8px)'
                    : 'none',
                }}
              />
            )
          })}
        </div>

        {/* Tooltip */}
        {hovered !== null && (() => {
          const w   = windows[hovered]
          const cfg = VFR_CFG[w.status]
          return (
            <div style={{
              position:'absolute', bottom:'calc(100% + 8px)',
              left:`clamp(0px, ${(hovered / windows.length) * 100}%, calc(100% - 170px))`,
              backgroundColor:'#071729',
              border:`1px solid ${cfg.border}`,
              borderRadius:8, padding:'8px 12px', zIndex:50, minWidth:160,
              pointerEvents:'none',
              boxShadow:'0 8px 24px rgba(0,0,0,0.6)',
            }}>
              <div style={{ color:cfg.color, fontSize:11, fontWeight:700 }}>{w.status}</div>
              <div style={{ color:'#CBD5E1', fontSize:11, marginTop:1 }}>{fmtHour(w.hour)}</div>
              <div style={{ color:'#5B8DB8', fontSize:10, marginTop:4, lineHeight:1.6 }}>
                Vis: {w.vis >= 9999 ? '10+ km' : `${w.vis} km`}<br/>
                {w.ceiling ? `Plafond: ${w.ceiling.toLocaleString()} ft` : 'CAVOK'}<br/>
                Vent: {w.winds} kt{w.gust ? ` (↑${w.gust} kt)` : ''}
              </div>
              {w.wx && <div style={{ color:'#F0B429', fontSize:10, marginTop:3 }}>{w.wx}</div>}
              {w.isEstimate && (
                <div style={{ color:'#2D5580', fontSize:9, marginTop:4, borderTop:'1px solid #0F2A4A', paddingTop:4 }}>
                  Estimation METAR
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Graduation heures */}
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
        {[0, 6, 12, 18, 23].map(i => (
          <span key={i} style={{ color:'#2D5580', fontSize:9, fontFamily:'monospace' }}>
            {fmtHour(windows[Math.min(i, windows.length - 1)].hour)}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Carte aérodrome ───────────────────────────────────────────────────────────
function TafCard({ icao, tafData, metar, loading }) {
  const [expanded, setExpanded] = useState(false)

  const noTafExpected = NO_TAF_AIRPORTS.includes(icao)
  const hasTaf        = tafData?.forecast?.length > 0
  const forecasts     = hasTaf ? parseTafForecast(tafData) : []
  const windows       = hasTaf ? buildHourlyWindows(forecasts, 24) : buildMetarWindows(metar, 24)
  const isEstimate    = !hasTaf && windows.length > 0
  const name          = AIRPORT_NAMES[icao] || icao

  const stats = windows.reduce((acc, w) => { acc[w.status] = (acc[w.status]||0)+1; return acc }, {})
  const worstStatus = windows.some(w => w.status === 'IFR') ? 'IFR'
                    : windows.some(w => w.status === 'MVFR') ? 'MVFR' : 'VFR'
  const cfg = VFR_CFG[worstStatus]

  return (
    <div className="rounded-xl border" style={{
      backgroundColor:'#112D52',
      borderColor: worstStatus !== 'VFR' ? cfg.border : '#1E3A5F',
    }}>
      <button className="w-full px-4 py-4 text-left" onClick={() => setExpanded(e => !e)}>

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ color:'#5B8DB8', fontSize:10, fontFamily:'monospace', letterSpacing:2 }}>{icao}</span>
              {loading ? (
                <span style={{ color:'#2D5580', fontSize:9 }}>chargement...</span>
              ) : hasTaf ? (
                <span style={{ backgroundColor:'rgba(74,222,128,0.08)', color:'#4ADE80', border:'1px solid rgba(74,222,128,0.2)', fontSize:9, padding:'1px 6px', borderRadius:4 }}>
                  TAF officiel
                </span>
              ) : noTafExpected ? (
                <span style={{ backgroundColor:'rgba(240,180,41,0.08)', color:'#F0B429', border:'1px solid rgba(240,180,41,0.2)', fontSize:9, padding:'1px 6px', borderRadius:4 }}>
                  Pas de TAF · Estimation METAR
                </span>
              ) : (
                <span style={{ backgroundColor:'rgba(240,180,41,0.08)', color:'#F0B429', border:'1px solid rgba(240,180,41,0.2)', fontSize:9, padding:'1px 6px', borderRadius:4 }}>
                  TAF indisponible · Estimation METAR
                </span>
              )}
            </div>
            <div className="font-bold text-white mt-0.5">{name}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!loading && Object.entries(stats).map(([s, n]) => (
              <span key={s} style={{ color: VFR_CFG[s].color, borderColor: VFR_CFG[s].border, backgroundColor: VFR_CFG[s].bg, border:`1px solid ${VFR_CFG[s].border}`, fontSize:11, fontWeight:700, padding:'1px 8px', borderRadius:4 }}>
                {VFR_CFG[s].short} {n}h
              </span>
            ))}
            <span style={{ color:'#5B8DB8', fontSize:12 }}>{expanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {/* Barre 24h */}
        <div style={{ marginTop:10 }}>
          {loading ? (
            <div style={{ height:30, backgroundColor:'#1E3A5F', borderRadius:6 }}/>
          ) : windows.length === 0 ? (
            <div style={{ height:30, backgroundColor:'rgba(17,45,82,0.5)', borderRadius:6, border:'1px solid #1E3A5F', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ color:'#2D5580', fontSize:10 }}>Aucune donnée disponible</span>
            </div>
          ) : (
            <HourlyBar windows={windows} />
          )}
        </div>

        {/* Note estimation */}
        {!loading && isEstimate && metar && (
          <div style={{ color:'#2D5580', fontSize:9, marginTop:5 }}>
            ℹ {noTafExpected ? `${icao} n'émet pas de TAF officiel` : 'TAF non reçu'} — projection depuis METAR actuel ({metar.status})
          </div>
        )}
      </button>

      {/* Détail au clic */}
      {expanded && (
        <div className="border-t px-4 py-3 space-y-3" style={{ borderColor:'#1E3A5F' }}>

          {hasTaf && forecasts.length > 0 && (
            <>
              <div style={{ color:'#5B8DB8', fontSize:10, fontWeight:700, letterSpacing:2, textTransform:'uppercase' }}>
                Périodes TAF officielles
              </div>
              <div className="space-y-2">
                {forecasts.map((p, i) => {
                  const pc = VFR_CFG[p.status]
                  return (
                    <div key={i} className="rounded-lg px-3 py-2.5 flex items-start gap-3"
                      style={{ backgroundColor: pc.bg, border:`1px solid ${pc.border}` }}>
                      <div className="shrink-0">
                        <span style={{ color: pc.color, fontSize:11, fontWeight:700 }}>{p.status}</span>
                        <div style={{ color:'#2D5580', fontSize:9, marginTop:1 }}>{p.type}</div>
                      </div>
                      <div className="flex-1">
                        <div style={{ color:'#CBD5E1', fontSize:11, fontWeight:600 }}>
                          {fmtHour(p.start)} → {fmtHour(p.end)}
                          <span style={{ color:'#5B8DB8', fontWeight:400, marginLeft:6, fontSize:10 }}>{fmtShort(p.start)}</span>
                        </div>
                        <div style={{ color:'#5B8DB8', fontSize:10, marginTop:2 }}>
                          Vis: {p.vis >= 9999 ? '10+ km' : `${p.vis} km`}
                          {p.ceiling ? ` · Plafond: ${p.ceiling.toLocaleString()} ft` : ' · CAVOK'}
                          {` · Vent: ${p.winds} kt`}{p.gust ? ` (↑${p.gust} kt)` : ''}
                          {p.wx ? ` · ${p.wx}` : ''}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {tafData?.raw && (
                <div className="rounded-lg px-3 py-2" style={{ backgroundColor:'#071729', border:'1px solid #0F2A4A' }}>
                  <div style={{ color:'#2D5580', fontSize:9, letterSpacing:2, textTransform:'uppercase', marginBottom:3 }}>TAF brut OACI</div>
                  <div className="font-mono text-xs break-all" style={{ color:'#5B8DB8', lineHeight:1.6 }}>{tafData.raw}</div>
                </div>
              )}
            </>
          )}

          {!hasTaf && metar && (
            <>
              <div style={{ color:'#5B8DB8', fontSize:10, fontWeight:700, letterSpacing:2, textTransform:'uppercase' }}>
                Conditions actuelles — METAR
              </div>
              <div className="rounded-lg px-3 py-3" style={{ backgroundColor: VFR_CFG[metar.status||'VFR'].bg, border:`1px solid ${VFR_CFG[metar.status||'VFR'].border}` }}>
                <div className="flex items-center gap-3 mb-2">
                  <span style={{ color: VFR_CFG[metar.status||'VFR'].color, fontWeight:700, fontSize:13 }}>{metar.status||'VFR'}</span>
                  <span style={{ color:'#5B8DB8', fontSize:11 }}>{metar.temp}°C · Vent {metar.wind_speed} kt {metar.wind_dir}</span>
                  {metar.wind_gust && <span style={{ color:'#F0B429', fontSize:11 }}>↑{metar.wind_gust} kt</span>}
                </div>
                <div style={{ color:'#5B8DB8', fontSize:11 }}>
                  Vis: {metar.vis >= 9999 ? '10+ km' : `${metar.vis} km`}
                  {metar.ceiling ? ` · Plafond: ${metar.ceiling} ft` : ' · CAVOK'}
                </div>
                {metar.raw && (
                  <div className="font-mono text-xs mt-2 break-all" style={{ color:'#2D5580' }}>{metar.raw}</div>
                )}
              </div>
              <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor:'rgba(240,180,41,0.05)', border:'1px solid rgba(240,180,41,0.15)' }}>
                <div style={{ color:'#F0B429', fontSize:10, fontWeight:600, marginBottom:4 }}>Pourquoi pas de TAF ?</div>
                <div style={{ color:'#5B8DB8', fontSize:10, lineHeight:1.6 }}>
                  {icao === 'TFFJ' && 'Saint-Barthélemy (TFFJ) est un aérodrome de classe B. La diffusion de TAF OACI n\'est pas obligatoire pour ce type de terrain selon la réglementation DGAC.'}
                  {icao === 'TFFG' && 'Grand Case (TFFG) n\'émet pas de TAF systématique. Pour les prévisions de la région, référencez-vous au TAF de TNCM (Sint-Maarten Juliana, ~5 nm).'}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Alertes vols à risque ─────────────────────────────────────────────────────
function FlightRiskAlerts({ risks, loading }) {
  if (loading) return <div style={{ height:60, backgroundColor:'#112D52', borderRadius:12 }}/>
  if (!risks.length) return (
    <div className="rounded-xl border p-4" style={{ backgroundColor:'rgba(74,222,128,0.05)', borderColor:'rgba(74,222,128,0.2)' }}>
      <div className="flex items-center gap-3">
        <span style={{ color:'#4ADE80', fontSize:20 }}>✓</span>
        <div>
          <div style={{ color:'#4ADE80', fontSize:13, fontWeight:700 }}>Tous les vols programmés en conditions VFR</div>
          <div style={{ color:'#5B8DB8', fontSize:11, marginTop:1 }}>Aucune dégradation prévue sur les rotations du jour</div>
        </div>
      </div>
    </div>
  )
  return (
    <div className="space-y-2">
      {risks.map(({ flight: f, dep, arr, depCond, arrCond, risk }, i) => {
        const cfg = VFR_CFG[risk]
        return (
          <div key={f.id || i} className="rounded-xl border p-4" style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span style={{ color:'#F0B429', fontFamily:'monospace', fontWeight:700, fontSize:13 }}>{f.flight_number}</span>
                  <span style={{ color:'#fff', fontWeight:600, fontSize:13 }}>{f.origin} → {f.destination}</span>
                  <span style={{ color:'#5B8DB8', fontSize:11 }}>{fmtHour(dep)} → {fmtHour(arr)}</span>
                  <span style={{ color:'#2D5580', fontSize:11, fontFamily:'monospace' }}>{f.aircraft}</span>
                </div>
                <div className="space-y-1">
                  {depCond && depCond.status !== 'VFR' && (
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize:10, padding:'1px 5px', borderRadius:3, backgroundColor:'rgba(0,0,0,0.25)', color:'#5B8DB8' }}>DEP</span>
                      <span style={{ color: VFR_CFG[depCond.status].color, fontSize:11 }}>
                        {f.origin} · {depCond.status} · Vis {depCond.vis >= 9999 ? '10+ km' : `${depCond.vis}km`}
                        {depCond.ceiling ? ` · Plafond ${depCond.ceiling}ft` : ''}
                        {depCond.wx ? ` · ${depCond.wx}` : ''}
                        {depCond.isEstimate ? ' ·  estimation' : ''}
                      </span>
                    </div>
                  )}
                  {arrCond && arrCond.status !== 'VFR' && (
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize:10, padding:'1px 5px', borderRadius:3, backgroundColor:'rgba(0,0,0,0.25)', color:'#5B8DB8' }}>ARR</span>
                      <span style={{ color: VFR_CFG[arrCond.status].color, fontSize:11 }}>
                        {f.destination} · {arrCond.status} · Vis {arrCond.vis >= 9999 ? '10+ km' : `${arrCond.vis}km`}
                        {arrCond.ceiling ? ` · Plafond ${arrCond.ceiling}ft` : ''}
                        {arrCond.wx ? ` · ${arrCond.wx}` : ''}
                        {arrCond.isEstimate ? ' · estimation' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <span style={{ color: cfg.color, borderColor: cfg.border, backgroundColor:'rgba(0,0,0,0.2)', border:`1px solid ${cfg.border}`, fontWeight:700, fontSize:13, padding:'3px 10px', borderRadius:8, whiteSpace:'nowrap' }}>
                {risk}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── SIGMETs ───────────────────────────────────────────────────────────────────
function SigmetPanel({ sigmets, loading }) {
  if (loading) return <div style={{ height:52, backgroundColor:'#112D52', borderRadius:12 }}/>
  if (!sigmets?.length) return (
    <div className="rounded-xl border p-4" style={{ backgroundColor:'rgba(74,222,128,0.05)', borderColor:'rgba(74,222,128,0.2)' }}>
      <div className="flex items-center gap-2">
        <span style={{ color:'#4ADE80' }}>✓</span>
        <span style={{ color:'#4ADE80', fontSize:12, fontWeight:600 }}>Aucun SIGMET/AIRMET actif sur la zone Caraïbes</span>
      </div>
    </div>
  )
  return (
    <div className="space-y-2">
      {sigmets.map((s, i) => (
        <div key={i} className="rounded-xl border p-3" style={{ backgroundColor:'rgba(248,113,113,0.08)', borderColor:'rgba(248,113,113,0.3)' }}>
          <div className="flex items-start gap-3">
            <span style={{ backgroundColor:'rgba(248,113,113,0.2)', color:'#F87171', fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4, whiteSpace:'nowrap' }}>
              {s.type || 'SIGMET'}
            </span>
            <div>
              <div style={{ color:'#fff', fontSize:12, fontWeight:600 }}>{s.hazard || s.phenomenon || 'Phénomène inconnu'}</div>
              <div style={{ color:'#5B8DB8', fontSize:10, marginTop:2 }}>
                {s.area || s.fir || 'Zone Caraïbes'}
                {s.valid_from && ` · Valide ${fmtHour(new Date(s.valid_from))}`}
                {s.valid_to   && ` → ${fmtHour(new Date(s.valid_to))}`}
              </div>
              {s.raw && <div className="font-mono text-xs mt-1" style={{ color:'#5B8DB8' }}>{s.raw}</div>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Export principal ──────────────────────────────────────────────────────────
// Props:
//   flights → vols du jour (Firestore)
//   weather → { TFFJ: {...metar}, TFFG: {...}, TNCM: {...} }
export default function WeatherForecast({ flights = [], weather = {} }) {
  const ICAOS = ['TFFJ', 'TFFG', 'TNCM']

  const [tafData,    setTafData]    = useState({})
  const [tafLoading, setTafLoading] = useState({})
  const [sigmets,    setSigmets]    = useState([])
  const [sigLoading, setSigLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [anyLoading, setAnyLoading] = useState(false)

  const fetchTaf = useCallback(async () => {
    if (!AVWX_KEY) return
    setAnyLoading(true)
    setTafLoading(Object.fromEntries(ICAOS.map(i => [i, true])))
    await Promise.allSettled(ICAOS.map(async icao => {
      try {
        const res  = await fetch(`https://avwx.rest/api/taf/${icao}?token=${AVWX_KEY}`)
        const data = await res.json()
        setTafData(prev => ({ ...prev, [icao]: data?.forecast?.length ? data : null }))
      } catch {
        setTafData(prev => ({ ...prev, [icao]: null }))
      } finally {
        setTafLoading(prev => ({ ...prev, [icao]: false }))
      }
    }))
    setLastUpdate(new Date())
    setAnyLoading(false)
  }, [])

  const fetchSigmets = useCallback(async () => {
    if (!AVWX_KEY) return
    setSigLoading(true)
    try {
      const res  = await fetch(`https://avwx.rest/api/sigmet?token=${AVWX_KEY}&region=carib`)
      const data = await res.json()
      setSigmets(Array.isArray(data) ? data : [])
    } catch { setSigmets([]) }
    finally  { setSigLoading(false) }
  }, [])

  useEffect(() => {
    fetchTaf(); fetchSigmets()
    const t = setInterval(() => { fetchTaf(); fetchSigmets() }, 1_800_000)
    return () => clearInterval(t)
  }, [fetchTaf, fetchSigmets])

  // Fenêtres pour le croisement vols
  const windowsByIcao = {}
  ICAOS.forEach(icao => {
    const taf   = tafData[icao]
    const metar = weather[icao]
    windowsByIcao[icao] = taf?.forecast?.length
      ? buildHourlyWindows(parseTafForecast(taf), 24)
      : buildMetarWindows(metar, 24)
  })

  const flightRisks = computeFlightRisks(flights, windowsByIcao)
  const dataReady   = !anyLoading

  return (
    <div className="space-y-5">

      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div style={{ color:'#5B8DB8', fontSize:10, fontWeight:700, letterSpacing:3, textTransform:'uppercase' }}>
            Prévisions &amp; risques météo
          </div>
          <div style={{ color:'#2D5580', fontSize:11, marginTop:2 }}>
            {!AVWX_KEY
              ? 'Clé AVWX requise pour les prévisions TAF'
              : lastUpdate
                ? `TAF · Mis à jour ${lastUpdate.toLocaleTimeString('fr-FR')} · Actualisation auto 30 min`
                : 'Chargement des TAF...'}
          </div>
        </div>
        {AVWX_KEY && (
          <button onClick={() => { fetchTaf(); fetchSigmets() }} disabled={anyLoading}
            className="text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40"
            style={{ borderColor:'#1E3A5F', color:'#5B8DB8' }}>
            {anyLoading ? '⟳ ...' : '↻ Actualiser TAF'}
          </button>
        )}
      </div>

      {!AVWX_KEY ? (
        <div className="rounded-xl border p-5 text-center" style={{ backgroundColor:'rgba(240,180,41,0.04)', borderColor:'rgba(240,180,41,0.25)' }}>
          <div style={{ color:'#F0B429', fontSize:18, marginBottom:6 }}>🔑</div>
          <div style={{ color:'#fff', fontSize:13, fontWeight:700 }}>Prévisions TAF non disponibles</div>
          <div style={{ color:'#5B8DB8', fontSize:11, marginTop:6, lineHeight:1.6 }}>
            Ajouter{' '}
            <code style={{ backgroundColor:'#071729', padding:'1px 6px', borderRadius:4, color:'#F0B429' }}>VITE_AVWX_API_KEY=votre_token</code>
            {' '}dans <code style={{ color:'#F0B429' }}>.env.local</code>
          </div>
        </div>
      ) : (
        <>
          {/* 1. Vols à risque */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div style={{ color:'#5B8DB8', fontSize:10, fontWeight:700, letterSpacing:3, textTransform:'uppercase' }}>
                Vols à risque
              </div>
              {flightRisks.length > 0 && (
                <span style={{ backgroundColor:'rgba(248,113,113,0.15)', color:'#F87171', border:'1px solid rgba(248,113,113,0.3)', fontSize:11, fontWeight:700, padding:'1px 8px', borderRadius:4 }}>
                  {flightRisks.length} vol{flightRisks.length > 1 ? 's' : ''} affecté{flightRisks.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <FlightRiskAlerts risks={flightRisks} loading={!dataReady} />
          </div>

          {/* 2. Fenêtres VFR/IFR */}
          <div>
            <div style={{ color:'#5B8DB8', fontSize:10, fontWeight:700, letterSpacing:3, textTransform:'uppercase', marginBottom:12 }}>
              Fenêtres VFR/IFR — 24h
            </div>
            <div className="space-y-3">
              {ICAOS.map(icao => (
                <TafCard
                  key={icao}
                  icao={icao}
                  tafData={tafData[icao]}
                  metar={weather[icao]}
                  loading={tafLoading[icao] === true}
                />
              ))}
            </div>
            {/* Légende */}
            <div className="flex items-center gap-4 mt-3 px-1 flex-wrap">
              {Object.entries(VFR_CFG).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <div style={{ width:16, height:10, borderRadius:2, backgroundColor: v.bg, border:`1px solid ${v.border}` }}/>
                  <span style={{ color:'#5B8DB8', fontSize:10 }}>{v.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <div style={{ width:16, height:10, borderRadius:2, backgroundColor:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.2)',
                  backgroundImage:'repeating-linear-gradient(45deg,transparent,transparent 2px,rgba(0,0,0,0.15) 2px,rgba(0,0,0,0.15) 4px)' }}/>
                <span style={{ color:'#5B8DB8', fontSize:10 }}>Estimation METAR</span>
              </div>
              <span style={{ color:'#2D5580', fontSize:10, marginLeft:'auto' }}>Survoler → détail horaire</span>
            </div>
          </div>

          {/* 3. SIGMETs */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div style={{ color:'#5B8DB8', fontSize:10, fontWeight:700, letterSpacing:3, textTransform:'uppercase' }}>
                SIGMETs / AIRMETs
              </div>
              <span style={{ color:'#2D5580', fontSize:10 }}>Zone Caraïbes</span>
            </div>
            <SigmetPanel sigmets={sigmets} loading={sigLoading} />
          </div>
        </>
      )}
    </div>
  )
}