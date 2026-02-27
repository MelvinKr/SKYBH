import { useEffect, useState, useRef, useCallback } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { useAircraft } from '../hooks/useAircraft'
import { useFlights } from '../hooks/useFlights'
import { getPotentialPercent, getAlertLevel, updateAircraft } from '../services/aircraft'
import { updateFlight, AIRPORTS_FULL, FLIGHT_STATUS_LABELS, FLIGHT_STATUS_COLORS } from '../services/flights'
import FlightModal from '../components/FlightModal'
import AircraftModal from '../components/AircraftModal'

// ── Mock data fallback ───────────────────────────────────────────────────────
const REAL_FLEET = [
  { id:'F-OSBC', registration:'F-OSBC', type:'Cessna 208B Grand Caravan', msn:'208B2188', year:2010, seats:9, status:'available',   airframe_hours:7821, engine_hours:1680, airframe_limit:20000, engine_limit:3600 },
  { id:'F-OSBM', registration:'F-OSBM', type:'Cessna 208B Grand Caravan', msn:'208B2391', year:2012, seats:9, status:'in_flight',   airframe_hours:6234, engine_hours:2891, airframe_limit:20000, engine_limit:3600 },
  { id:'F-OSBS', registration:'F-OSBS', type:'Cessna 208B Grand Caravan', msn:'208B2378', year:2013, seats:9, status:'available',   airframe_hours:5980, engine_hours:1204, airframe_limit:20000, engine_limit:3600 },
  { id:'F-OSJR', registration:'F-OSJR', type:'Cessna 208B Grand Caravan', msn:'208B5350', year:2019, seats:9, status:'available',   airframe_hours:3102, engine_hours:3480, airframe_limit:20000, engine_limit:3600 },
  { id:'F-OSCO', registration:'F-OSCO', type:'Cessna 208B Grand Caravan', msn:'208B5681', year:2022, seats:9, status:'maintenance', airframe_hours:1450, engine_hours:980,  airframe_limit:20000, engine_limit:3600 },
]

const mkDate = (h, m) => { const d = new Date(); d.setHours(h,m,0,0); return { toDate: () => d } }
const MOCK_FLIGHTS = [
  { id:'1', flight_number:'PV801', origin:'TFFJ', destination:'TNCM', departure_time:mkDate(6,30), arrival_time:mkDate(6,55), status:'landed',    pax_count:8, max_pax:9, aircraft:'F-OSBC', pilot:'Dupont J.' },
  { id:'2', flight_number:'PV802', origin:'TNCM', destination:'TFFJ', departure_time:mkDate(7,30), arrival_time:mkDate(7,55), status:'landed',    pax_count:9, max_pax:9, aircraft:'F-OSBC', pilot:'Dupont J.' },
  { id:'3', flight_number:'PV803', origin:'TFFJ', destination:'TFFG', departure_time:mkDate(8,0),  arrival_time:mkDate(8,20), status:'landed',    pax_count:7, max_pax:9, aircraft:'F-OSBM', pilot:'Martin S.' },
  { id:'4', flight_number:'PV804', origin:'TFFG', destination:'TFFJ', departure_time:mkDate(9,0),  arrival_time:mkDate(9,20), status:'in_flight', pax_count:5, max_pax:9, aircraft:'F-OSBM', pilot:'Martin S.' },
  { id:'5', flight_number:'PV805', origin:'TFFJ', destination:'TNCM', departure_time:mkDate(9,30), arrival_time:mkDate(9,55), status:'scheduled', pax_count:6, max_pax:9, aircraft:'F-OSBS', pilot:'Leroy C.' },
  { id:'6', flight_number:'PV806', origin:'TNCM', destination:'TFFJ', departure_time:mkDate(10,45),arrival_time:mkDate(11,10),status:'scheduled', pax_count:8, max_pax:9, aircraft:'F-OSBS', pilot:'Leroy C.' },
  { id:'7', flight_number:'PV807', origin:'TFFJ', destination:'TFFG', departure_time:mkDate(11,0), arrival_time:mkDate(11,20),status:'scheduled', pax_count:9, max_pax:9, aircraft:'F-OSJR', pilot:'Blanc A.' },
  { id:'8', flight_number:'PV808', origin:'TFFG', destination:'TFFJ', departure_time:mkDate(12,0), arrival_time:mkDate(12,20),status:'scheduled', pax_count:4, max_pax:9, aircraft:'F-OSJR', pilot:'Blanc A.' },
  { id:'9', flight_number:'PV809', origin:'TFFJ', destination:'TNCM', departure_time:mkDate(13,30),arrival_time:mkDate(13,55),status:'scheduled', pax_count:7, max_pax:9, aircraft:'F-OSBC', pilot:'Dupont J.' },
  { id:'10',flight_number:'PV810', origin:'TNCM', destination:'TFFJ', departure_time:mkDate(14,30),arrival_time:mkDate(14,55),status:'scheduled', pax_count:6, max_pax:9, aircraft:'F-OSBM', pilot:'Martin S.' },
]

const WEATHER_MOCK = {
  TFFJ: { icao:'TFFJ', name:'Saint-Barthélemy',      temp:28, wind_speed:12, wind_dir:'ENE', vis:10, ceiling:null, status:'VFR',  raw:'TFFJ 271200Z 07012KT 9999 FEW022 28/22 Q1015', updated:new Date() },
  TFFG: { icao:'TFFG', name:'St-Martin Grand Case',  temp:29, wind_speed:18, wind_dir:'E',   vis:8,  ceiling:null, status:'VFR',  raw:'TFFG 271200Z 09018KT 8000 SCT018 29/23 Q1014', updated:new Date() },
  TNCM: { icao:'TNCM', name:'Sint-Maarten Juliana',  temp:27, wind_speed:22, wind_dir:'NE',  vis:6,  ceiling:1200, status:'MVFR', raw:'TNCM 271200Z 05022KT 6000 BKN012 27/24 Q1013', updated:new Date() },
}

const AVWX_KEY = import.meta.env.VITE_AVWX_API_KEY || ''
const GANTT_START = 6
const GANTT_END = 19

// ── Helpers ──────────────────────────────────────────────────────────────────
const toDate = ts => ts?.toDate ? ts.toDate() : new Date(ts)
const fmtTime = d => d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
const fmtClock = d => d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
const fmtDate = d => d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })
const pctToTime = pct => {
  const totalMins = (GANTT_END - GANTT_START) * 60
  const mins = Math.round(pct * totalMins)
  const h = GANTT_START + Math.floor(mins / 60)
  const m = mins % 60
  return { h, m }
}

// ── UI Atoms ─────────────────────────────────────────────────────────────────
function StatusDot({ status }) {
  const c = { available:'#4ADE80', in_flight:'#F0B429', maintenance:'#F87171' }
  return <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', backgroundColor:c[status]||'#9CA3AF', boxShadow:`0 0 6px ${c[status]||'#9CA3AF'}` }} />
}

function PotentialBar({ current, limit, label }) {
  const pct = getPotentialPercent(current, limit)
  const lvl = getAlertLevel(pct)
  const bar = lvl==='critical'?'#EF4444':lvl==='warning'?'#F0B429':'#4ADE80'
  const txt = lvl==='critical'?'#F87171':lvl==='warning'?'#F0B429':'#4ADE80'
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
        <span style={{ color:'#5B8DB8', fontSize:11 }}>{label}</span>
        <span style={{ color:txt, fontSize:11, fontWeight:700 }}>{pct}%</span>
      </div>
      <div style={{ height:6, backgroundColor:'#1E3A5F', borderRadius:3, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, backgroundColor:bar, borderRadius:3, transition:'width 0.6s ease' }} />
      </div>
      <div style={{ color:'#2D5580', fontSize:10, marginTop:2 }}>{Math.round(current)} / {limit} h</div>
    </div>
  )
}

// ── GANTT interactif ─────────────────────────────────────────────────────────
function GanttChart({ flights, fleet, onFlightClick, onCreateFlight, onDropFlight }) {
  const ganttRef = useRef(null)
  const dragRef = useRef(null)
  const [dragging, setDragging] = useState(null)
  const [dragX, setDragX] = useState(0)
  const now = new Date()

  const totalMins = (GANTT_END - GANTT_START) * 60
  const getLeft = d => Math.max(0, Math.min(100, ((d.getHours()-GANTT_START)*60+d.getMinutes()) / totalMins * 100))
  const getWidth = (dep,arr) => Math.max(0.8, (arr-dep)/60000 / totalMins * 100)
  const nowLeft = getLeft(now)
  const hours = Array.from({ length: GANTT_END - GANTT_START + 1 }, (_,i) => GANTT_START+i)

  const statusColors = {
    landed:    { bg:'rgba(30,77,43,0.8)',   border:'#4ADE80', text:'#4ADE80' },
    in_flight: { bg:'rgba(74,48,0,0.9)',    border:'#F0B429', text:'#F0B429' },
    scheduled: { bg:'rgba(17,45,82,0.9)',   border:'#3B82F6', text:'#93C5FD' },
    boarding:  { bg:'rgba(59,32,0,0.9)',    border:'#FB923C', text:'#FB923C' },
    cancelled: { bg:'rgba(45,10,10,0.8)',   border:'#F87171', text:'#F87171' },
  }

  const handleMouseDown = (e, flight) => {
    e.stopPropagation()
    const rect = ganttRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = { flight, startX: e.clientX, ganttLeft: rect.left, ganttWidth: rect.width }
    setDragging(flight.id)
    setDragX(e.clientX)
  }

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current) return
    setDragX(e.clientX)
  }, [])

  const handleMouseUp = useCallback((e) => {
    if (!dragRef.current) return
    const { flight, ganttLeft, ganttWidth } = dragRef.current
    const pct = Math.max(0, Math.min(1, (e.clientX - ganttLeft - 96) / (ganttWidth - 96)))
    const dep = toDate(flight.departure_time)
    const arr = toDate(flight.arrival_time)
    const duration = arr - dep
    const { h, m } = pctToTime(pct)
    const newDep = new Date(); newDep.setHours(h, m, 0, 0)
    const newArr = new Date(newDep.getTime() + duration)
    onDropFlight(flight, Timestamp.fromDate(newDep), Timestamp.fromDate(newArr))
    dragRef.current = null
    setDragging(null)
  }, [onDropFlight])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp) }
  }, [handleMouseMove, handleMouseUp])

  const handleRowClick = (e, aircraft) => {
    const rect = ganttRef.current?.getBoundingClientRect()
    if (!rect) return
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left - 96) / (rect.width - 96)))
    const { h, m } = pctToTime(pct)
    onCreateFlight({ aircraft: aircraft.registration, hour: h, minute: m })
  }

  return (
    <div ref={ganttRef} className="rounded-xl border overflow-hidden select-none" style={{ backgroundColor:'#071729', borderColor:'#1E3A5F' }}>
      {/* Header heures */}
      <div className="flex border-b" style={{ borderColor:'#1E3A5F' }}>
        <div style={{ width:96, minWidth:96, padding:'8px 12px', borderRight:'1px solid #1E3A5F' }}>
          <span style={{ color:'#2D5580', fontSize:10, fontWeight:700 }}>AVION</span>
        </div>
        <div style={{ flex:1, position:'relative', height:32 }}>
          {hours.map(h => (
            <div key={h} style={{ position:'absolute', left:`${((h-GANTT_START)/(GANTT_END-GANTT_START))*100}%`, top:'50%', transform:'translate(-50%,-50%)', color:'#2D5580', fontSize:10 }}>{h}h</div>
          ))}
        </div>
      </div>

      {/* Lignes avions */}
      {fleet.map((ac, idx) => {
        const acFlights = flights.filter(f => f.aircraft === ac.registration)
        return (
          <div key={ac.registration} className="flex border-b" style={{ borderColor:'#1E3A5F', backgroundColor: idx%2===0?'transparent':'rgba(17,45,82,0.15)', cursor:'crosshair' }}>
            <div style={{ width:96, minWidth:96, padding:'8px 12px', borderRight:'1px solid #1E3A5F', display:'flex', alignItems:'center', gap:6 }}>
              <StatusDot status={ac.status} />
              <span style={{ color:'#fff', fontSize:11, fontWeight:700, fontFamily:'monospace' }}>{ac.registration}</span>
            </div>
            <div style={{ flex:1, position:'relative', height:48 }} onClick={e => handleRowClick(e, ac)}>
              {/* Grille */}
              {hours.map(h => (
                <div key={h} style={{ position:'absolute', top:0, bottom:0, width:1, left:`${((h-GANTT_START)/(GANTT_END-GANTT_START))*100}%`, backgroundColor:'#1E3A5F' }} />
              ))}
              {/* Ligne NOW */}
              {nowLeft > 0 && nowLeft < 100 && (
                <div style={{ position:'absolute', top:0, bottom:0, width:2, left:`${nowLeft}%`, backgroundColor:'#F0B429', opacity:0.9, zIndex:10 }} />
              )}
              {/* Blocs vols */}
              {acFlights.map(f => {
                const dep = toDate(f.departure_time)
                const arr = toDate(f.arrival_time)
                const left = getLeft(dep)
                const width = getWidth(dep, arr)
                const sc = statusColors[f.status] || statusColors.scheduled
                const isDragging = dragging === f.id
                const dragOffset = isDragging ? dragX - (dragRef.current?.startX || 0) : 0
                const dragLeftPx = isDragging ? `calc(${left}% + ${dragOffset}px)` : `${left}%`
                return (
                  <div key={f.id}
                    onMouseDown={e => handleMouseDown(e, f)}
                    onClick={e => { e.stopPropagation(); if (!isDragging) onFlightClick(f) }}
                    title={`${f.flight_number} ${AIRPORTS_FULL[f.origin]?.short}→${AIRPORTS_FULL[f.destination]?.short} ${fmtTime(dep)} ${f.pax_count}/${f.max_pax}pax`}
                    style={{
                      position:'absolute', top:6, bottom:6,
                      left: dragLeftPx,
                      width:`${width}%`, minWidth:20,
                      backgroundColor: sc.bg,
                      border:`1px solid ${sc.border}`,
                      borderRadius:4,
                      display:'flex', alignItems:'center', padding:'0 6px',
                      cursor: isDragging ? 'grabbing' : 'grab',
                      zIndex: isDragging ? 20 : 5,
                      transition: isDragging ? 'none' : 'left 0.2s ease',
                      boxShadow: isDragging ? `0 4px 20px ${sc.border}60` : 'none',
                    }}>
                    <span style={{ color:sc.text, fontSize:9, fontWeight:700, overflow:'hidden', whiteSpace:'nowrap' }}>
                      {f.flight_number}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Légende + bouton créer */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t" style={{ borderColor:'#1E3A5F' }}>
        <div className="flex flex-wrap gap-3">
          {Object.entries({ landed:'Atterri', in_flight:'En vol', scheduled:'Programmé', cancelled:'Annulé' }).map(([k,v]) => {
            const sc = statusColors[k]
            return (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:12, height:12, borderRadius:2, backgroundColor:sc.bg, border:`1px solid ${sc.border}` }} />
                <span style={{ color:'#5B8DB8', fontSize:10 }}>{v}</span>
              </div>
            )
          })}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:2, height:12, backgroundColor:'#F0B429' }} />
            <span style={{ color:'#5B8DB8', fontSize:10 }}>Maintenant</span>
          </div>
        </div>
        <span style={{ color:'#2D5580', fontSize:10 }}>💡 Clic sur ligne vide = nouveau vol · Glisser = déplacer</span>
      </div>
    </div>
  )
}

// ── Weather ───────────────────────────────────────────────────────────────────
function WeatherCard({ w }) {
  const cfg = {
    VFR:  { c:'#4ADE80', b:'rgba(74,222,128,0.3)',  bg:'rgba(74,222,128,0.05)' },
    MVFR: { c:'#F0B429', b:'rgba(240,180,41,0.3)',  bg:'rgba(240,180,41,0.05)' },
    IFR:  { c:'#F87171', b:'rgba(248,113,113,0.3)', bg:'rgba(248,113,113,0.05)' },
  }[w.status] || { c:'#4ADE80', b:'rgba(74,222,128,0.3)', bg:'rgba(74,222,128,0.05)' }
  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor:cfg.bg, borderColor:cfg.b }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div style={{ color:'#5B8DB8', fontSize:10, fontFamily:'monospace', letterSpacing:2 }}>{w.icao}</div>
          <div className="font-bold text-sm text-white">{w.name}</div>
        </div>
        <span className="text-xs font-black px-2 py-0.5 rounded border" style={{ color:cfg.c, borderColor:cfg.b }}>{w.status}</span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center mb-2">
        {[{v:`${w.temp}°C`,l:'Temp'},{v:`${w.wind_speed}kt`,l:w.wind_dir},{v:w.ceiling?`${w.ceiling}ft`:`${w.vis}km`,l:w.ceiling?'Plafond':'Visib.'}].map(({v,l})=>(
          <div key={l}><div className="text-base font-bold text-white">{v}</div><div style={{color:'#5B8DB8',fontSize:10}}>{l}</div></div>
        ))}
      </div>
      {w.raw && <div className="text-xs font-mono rounded px-2 py-1 truncate" style={{backgroundColor:'#071729',color:'#5B8DB8'}}>{w.raw}</div>}
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, color, icon }) {
  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor:'#112D52', borderColor:'#1E3A5F' }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-black" style={{ color }}>{value}</div>
          <div style={{ color:'#5B8DB8', fontSize:12, marginTop:4 }}>{label}</div>
        </div>
        <span className="text-xl opacity-30">{icon}</span>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, role, logout } = useAuth()
  const { fleet: fsFleet } = useAircraft()
  const { flights: fsFlights, kpis: fsKpis } = useFlights()
  const [tab, setTab] = useState('overview')
  const [time, setTime] = useState(new Date())
  const [weather, setWeather] = useState(WEATHER_MOCK)
  const [weatherLoading, setWeatherLoading] = useState(false)

  // Modales
  const [flightModal, setFlightModal] = useState(null)   // null | flight | 'new'
  const [aircraftModal, setAircraftModal] = useState(null) // null | aircraft | 'new'

  const fleet = fsFleet.length > 0 ? fsFleet : REAL_FLEET
  const flights = fsFlights.length > 0 ? fsFlights : MOCK_FLIGHTS
  const kpis = fsFlights.length > 0 ? fsKpis : {
    total: MOCK_FLIGHTS.length,
    completed: MOCK_FLIGHTS.filter(f=>f.status==='landed').length,
    inFlight: MOCK_FLIGHTS.filter(f=>f.status==='in_flight').length,
    totalPax: MOCK_FLIGHTS.reduce((s,f)=>s+f.pax_count,0),
    fillRate: Math.round(MOCK_FLIGHTS.reduce((s,f)=>s+f.pax_count,0)/MOCK_FLIGHTS.reduce((s,f)=>s+f.max_pax,0)*100),
  }

  const alerts = fleet.filter(a =>
    getPotentialPercent(a.engine_hours,a.engine_limit) <= 20 ||
    getPotentialPercent(a.airframe_hours,a.airframe_limit) <= 20 ||
    a.status === 'maintenance'
  )

  // Météo AVWX
  const fetchWeather = useCallback(async () => {
    if (!AVWX_KEY) return
    setWeatherLoading(true)
    try {
      const results = await Promise.allSettled(['TFFJ','TFFG','TNCM'].map(icao =>
        fetch(`https://avwx.rest/api/metar/${icao}?token=${AVWX_KEY}`).then(r=>r.json())
      ))
      const nw = { ...WEATHER_MOCK }
      results.forEach((r,i) => {
        const icao = ['TFFJ','TFFG','TNCM'][i]
        if (r.status==='fulfilled' && r.value?.raw) {
          const d = r.value
          const vis = d.visibility?.value||10
          const ceil = d.ceiling?.value||null
          nw[icao] = { icao, name:WEATHER_MOCK[icao].name, temp:d.temperature?.value||0, wind_speed:d.wind_speed?.value||0, wind_dir:d.wind_direction?.repr||'--', vis, ceiling:ceil, status: (vis<3||(ceil&&ceil<500))?'IFR':(vis<5||(ceil&&ceil<1000))?'MVFR':'VFR', raw:d.raw||'', updated:new Date() }
        }
      })
      setWeather(nw)
    } catch(e) { console.error(e) }
    finally { setWeatherLoading(false) }
  }, [])

  useEffect(() => { fetchWeather(); const t=setInterval(fetchWeather,600000); return ()=>clearInterval(t) }, [fetchWeather])
  useEffect(() => { const t=setInterval(()=>setTime(new Date()),1000); return ()=>clearInterval(t) }, [])

  // Gantt handlers
  const handleFlightClick = (flight) => setFlightModal(flight)

  const handleCreateFlight = ({ aircraft, hour, minute }) => {
    const dep = new Date(); dep.setHours(hour, minute, 0, 0)
    const arr = new Date(dep.getTime() + 25*60000)
    setFlightModal({
      aircraft,
      departure_time: { toDate: () => dep },
      arrival_time: { toDate: () => arr },
    })
  }

  const handleDropFlight = async (flight, newDep, newArr) => {
    if (!flight.id || !fsFlights.length) return
    try { await updateFlight(flight.id, { departure_time: newDep, arrival_time: newArr }) }
    catch(e) { console.error(e) }
  }

  const statusLabel = { available:'Disponible', in_flight:'En vol', maintenance:'Maintenance' }

  const tabs = [
    { id:'overview', icon:'⊞', label:'Vue globale' },
    { id:'gantt',    icon:'▦', label:'Planning Gantt' },
    { id:'fleet',    icon:'✈', label:'Flotte' },
    { id:'flights',  icon:'≡', label:'Vols' },
    { id:'weather',  icon:'◎', label:'Météo' },
  ]

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor:'#0B1F3A', fontFamily:"'Segoe UI',system-ui,sans-serif" }}>

      {/* ── MODALES ── */}
      {flightModal && (
        <FlightModal
          flight={flightModal?.id ? flightModal : null}
          fleet={fleet}
          onClose={() => setFlightModal(null)}
          onSaved={() => setFlightModal(null)}
          defaultValues={!flightModal?.id ? flightModal : undefined}
        />
      )}
      {aircraftModal && (
        <AircraftModal
          aircraft={aircraftModal === 'new' ? null : aircraftModal}
          onClose={() => setAircraftModal(null)}
          onSaved={() => setAircraftModal(null)}
        />
      )}

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor:'#071729', borderColor:'#1E3A5F' }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <img src="/logo-sbh.png" alt="SBH" className="h-9 w-auto"
              onError={e=>e.target.style.display='none'} />
            <div>
              <div className="font-black text-white tracking-wide">SKYBH</div>
              <div style={{ color:'#F0B429', fontSize:10, letterSpacing:2, textTransform:'uppercase' }}>St Barth Commuter</div>
            </div>
          </div>
          <div className="hidden sm:block text-center">
            <div className="font-mono text-xl font-bold" style={{ color:'#F0B429' }}>{fmtClock(time)}</div>
            <div style={{ color:'#5B8DB8', fontSize:11 }} className="capitalize">{fmtDate(time)}</div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden md:block text-right">
              <div style={{ color:'#5B8DB8', fontSize:11 }}>{user?.email}</div>
              <div style={{ color:'#F0B429', fontSize:10, fontWeight:700, letterSpacing:2, textTransform:'uppercase' }}>{role}</div>
            </div>
            <button onClick={logout} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor:'#1E3A5F', color:'#5B8DB8' }}>
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* ── TABS ── */}
      <nav className="border-b overflow-x-auto" style={{ backgroundColor:'#071729', borderColor:'#1E3A5F' }}>
        <div className="flex min-w-max px-4">
          {tabs.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)}
              className="px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors"
              style={{ borderColor:tab===t.id?'#F0B429':'transparent', color:tab===t.id?'#F0B429':'#5B8DB8' }}>
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── ALERTES ── */}
        {alerts.length > 0 && (
          <div className="rounded-xl border p-4" style={{ backgroundColor:'rgba(127,29,29,0.15)', borderColor:'#7F1D1D' }}>
            <div className="flex items-center gap-2 mb-2">
              <span>⚠️</span>
              <span className="font-bold text-red-300 text-sm">Alertes maintenance — {alerts.length} appareil{alerts.length>1?'s':''}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {alerts.map(a => {
                const ep = getPotentialPercent(a.engine_hours,a.engine_limit)
                const ap = getPotentialPercent(a.airframe_hours,a.airframe_limit)
                return (
                  <button key={a.id} onClick={()=>setAircraftModal(a)} className="flex items-center gap-2 text-sm rounded-lg px-3 py-1.5 transition-colors hover:opacity-80" style={{ backgroundColor:'rgba(0,0,0,0.3)', border:'1px solid #7F1D1D' }}>
                    <span className="font-mono font-black text-white">{a.registration}</span>
                    {a.status==='maintenance'&&<span className="text-xs px-1.5 py-0.5 rounded" style={{backgroundColor:'#7F1D1D',color:'#FCA5A5'}}>MAINT.</span>}
                    {ep<=20&&<span className="text-xs px-1.5 py-0.5 rounded" style={{backgroundColor:'#78350F',color:'#FCD34D'}}>Moteur {ep}%</span>}
                    {ap<=20&&<span className="text-xs px-1.5 py-0.5 rounded" style={{backgroundColor:'#78350F',color:'#FCD34D'}}>Cellule {ap}%</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── VUE GLOBALE ── */}
        {tab==='overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KPICard label="Vols du jour" value={kpis.total} color="#fff" icon="✈" />
              <KPICard label="En vol" value={kpis.inFlight} color="#F0B429" icon="🛫" />
              <KPICard label="Passagers" value={kpis.totalPax} color="#7DD3FC" icon="👥" />
              <KPICard label="Remplissage" value={`${kpis.fillRate}%`} color="#4ADE80" icon="📊" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 style={{ color:'#5B8DB8', fontSize:11, fontWeight:700, letterSpacing:3, textTransform:'uppercase' }}>Météo aérodromes</h2>
                {!AVWX_KEY && <span style={{ color:'#F0B429', fontSize:10, padding:'2px 8px', border:'1px solid #F0B429', borderRadius:4 }}>Données démo — ajouter VITE_AVWX_API_KEY</span>}
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {Object.values(weather).map(w => <WeatherCard key={w.icao} w={w} />)}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 style={{ color:'#5B8DB8', fontSize:11, fontWeight:700, letterSpacing:3, textTransform:'uppercase' }}>Flotte</h2>
                <button onClick={()=>setAircraftModal('new')} className="text-xs px-3 py-1.5 rounded-lg font-bold transition-colors hover:opacity-90" style={{ backgroundColor:'#F0B429', color:'#0B1F3A' }}>+ Avion</button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {fleet.map(a => (
                  <button key={a.id} onClick={()=>setAircraftModal(a)} className="rounded-xl border p-4 text-left transition-all hover:border-[#F0B429]/60 w-full" style={{ backgroundColor:'#112D52', borderColor:'#1E3A5F' }}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-mono font-black text-white">{a.registration}</div>
                        <div style={{ color:'#5B8DB8', fontSize:11 }}>{a.type}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusDot status={a.status} />
                        <span style={{ color:'#5B8DB8', fontSize:11 }}>{statusLabel[a.status]}</span>
                      </div>
                    </div>
                    <PotentialBar current={a.engine_hours} limit={a.engine_limit} label="Moteur" />
                    <PotentialBar current={a.airframe_hours} limit={a.airframe_limit} label="Cellule" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── GANTT ── */}
        {tab==='gantt' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 style={{ color:'#5B8DB8', fontSize:11, fontWeight:700, letterSpacing:3, textTransform:'uppercase' }}>Planning Gantt — {fmtDate(time)}</h2>
              <button onClick={()=>setFlightModal({})} className="text-xs px-4 py-2 rounded-lg font-bold" style={{ backgroundColor:'#F0B429', color:'#0B1F3A' }}>
                + Nouveau vol
              </button>
            </div>
            <GanttChart
              flights={flights}
              fleet={fleet}
              onFlightClick={handleFlightClick}
              onCreateFlight={handleCreateFlight}
              onDropFlight={handleDropFlight}
            />
          </div>
        )}

        {/* ── FLOTTE ── */}
        {tab==='fleet' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 style={{ color:'#5B8DB8', fontSize:11, fontWeight:700, letterSpacing:3, textTransform:'uppercase' }}>5 Cessna C208B Grand Caravan</h2>
              <button onClick={()=>setAircraftModal('new')} className="text-xs px-4 py-2 rounded-lg font-bold" style={{ backgroundColor:'#F0B429', color:'#0B1F3A' }}>+ Avion</button>
            </div>
            {fleet.map(a => (
              <button key={a.id} onClick={()=>setAircraftModal(a)} className="w-full rounded-xl border p-5 text-left transition-all hover:border-[#F0B429]/40" style={{ backgroundColor:'#112D52', borderColor:a.status==='maintenance'?'#7F1D1D':'#1E3A5F' }}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xl font-black text-white">{a.registration}</span>
                      <StatusDot status={a.status} />
                      <span style={{ color:'#5B8DB8', fontSize:12 }}>{statusLabel[a.status]}</span>
                    </div>
                    <div style={{ color:'#5B8DB8', fontSize:12, marginTop:2 }}>
                      {a.type} · MSN {a.msn} · {a.year} · {a.seats} sièges
                    </div>
                  </div>
                  <div style={{ color:'#5B8DB8', fontSize:11, padding:'4px 8px', border:'1px solid #1E3A5F', borderRadius:6 }}>
                    ✏️ Modifier
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <PotentialBar current={a.engine_hours} limit={a.engine_limit} label="Potentiel moteur PT6A-114A" />
                  <PotentialBar current={a.airframe_hours} limit={a.airframe_limit} label="Potentiel cellule" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── VOLS ── */}
        {tab==='flights' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 style={{ color:'#5B8DB8', fontSize:11, fontWeight:700, letterSpacing:3, textTransform:'uppercase' }}>Rotations du jour — {flights.length} vols</h2>
              <div className="flex items-center gap-3">
                <span style={{ color:'#5B8DB8', fontSize:11 }}>✅ {kpis.completed} atterris · <span style={{color:'#F0B429'}}>● {kpis.inFlight} en vol</span></span>
                <button onClick={()=>setFlightModal({})} className="text-xs px-4 py-2 rounded-lg font-bold" style={{ backgroundColor:'#F0B429', color:'#0B1F3A' }}>+ Vol</button>
              </div>
            </div>
            {flights.map(f => {
              const sc = { landed:{c:'#4ADE80'}, in_flight:{c:'#F0B429'}, scheduled:{c:'#93C5FD'}, boarding:{c:'#FB923C'}, cancelled:{c:'#F87171'} }[f.status]||{c:'#9CA3AF'}
              return (
                <button key={f.id} onClick={()=>setFlightModal(f)} className="w-full rounded-xl border p-4 text-left transition-all hover:border-[#F0B429]/40"
                  style={{ backgroundColor:f.status==='in_flight'?'rgba(74,48,0,0.3)':'#112D52', borderColor:f.status==='in_flight'?'#F0B429':f.status==='cancelled'?'#7F1D1D':'#1E3A5F' }}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono font-black text-sm w-14" style={{color:'#F0B429'}}>{f.flight_number}</span>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div>
                        <div className="font-bold text-white text-sm">{AIRPORTS_FULL[f.origin]?.short||f.origin}</div>
                        <div style={{color:'#5B8DB8',fontSize:10}}>{AIRPORTS_FULL[f.origin]?.name}</div>
                      </div>
                      <span style={{color:'#1E3A5F',fontSize:18}}>→</span>
                      <div>
                        <div className="font-bold text-white text-sm">{AIRPORTS_FULL[f.destination]?.short||f.destination}</div>
                        <div style={{color:'#5B8DB8',fontSize:10}}>{AIRPORTS_FULL[f.destination]?.name}</div>
                      </div>
                    </div>
                    <div className="font-mono text-sm" style={{color:'#5B8DB8'}}>
                      {fmtTime(toDate(f.departure_time))} → {fmtTime(toDate(f.arrival_time))}
                    </div>
                    <div style={{color:'#2D5580',fontSize:11,fontFamily:'monospace'}}>{f.aircraft}</div>
                    {f.pilot && <div style={{color:'#2D5580',fontSize:11}}>👨‍✈️ {f.pilot}</div>}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{color:sc.c}}>{FLIGHT_STATUS_LABELS[f.status]}</span>
                      <span style={{color:'#5B8DB8',fontSize:11}}>{f.pax_count}/{f.max_pax}</span>
                      {f.pax_count===f.max_pax&&<span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{backgroundColor:'#064E3B',color:'#6EE7B7'}}>FULL</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* ── MÉTÉO ── */}
        {tab==='weather' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 style={{ color:'#5B8DB8', fontSize:11, fontWeight:700, letterSpacing:3, textTransform:'uppercase' }}>METAR temps réel</h2>
              {AVWX_KEY && <button onClick={fetchWeather} disabled={weatherLoading} className="text-xs px-3 py-1.5 rounded-lg border" style={{borderColor:'#1E3A5F',color:'#5B8DB8'}}>{weatherLoading?'...':'↻ Actualiser'}</button>}
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {Object.values(weather).map(w => <WeatherCard key={w.icao} w={w} />)}
            </div>
            <div className="rounded-xl border p-4" style={{backgroundColor:'#112D52',borderColor:'#1E3A5F'}}>
              <div className="font-bold text-sm text-white mb-3">Légende</div>
              <div className="space-y-1 text-sm">
                <div className="flex gap-3"><span className="font-black w-12" style={{color:'#4ADE80'}}>VFR</span><span style={{color:'#5B8DB8'}}>Vis &gt; 5km, plafond &gt; 1000ft</span></div>
                <div className="flex gap-3"><span className="font-black w-12" style={{color:'#F0B429'}}>MVFR</span><span style={{color:'#5B8DB8'}}>Vis 3–5km ou plafond 500–1000ft</span></div>
                <div className="flex gap-3"><span className="font-black w-12 text-red-400">IFR</span><span style={{color:'#5B8DB8'}}>Vis &lt; 3km ou plafond &lt; 500ft</span></div>
              </div>
              {!AVWX_KEY && <div className="mt-3 pt-3 border-t text-xs" style={{borderColor:'#1E3A5F',color:'#F0B429'}}>💡 Ajouter VITE_AVWX_API_KEY=votre_token dans .env.local pour données réelles</div>}
            </div>
          </div>
        )}

      </main>

      <footer className="border-t mt-12 py-4 text-center" style={{borderColor:'#1E3A5F'}}>
        <span style={{color:'#1E3A5F',fontSize:11}}>SKYBH v2.0 · SBH Commuter · FR.AOC.0033 · DGAC/OSAC · EASA Part-145</span>
      </footer>
    </div>
  )
}