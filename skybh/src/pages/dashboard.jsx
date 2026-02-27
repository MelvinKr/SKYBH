import { useEffect, useState, useRef, useCallback } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { useAircraft } from '../hooks/useAircraft'
import { useFlights } from '../hooks/useFlights'
import { getPotentialPercent, getAlertLevel } from '../services/aircraft'
import { updateFlight, AIRPORTS_FULL, FLIGHT_STATUS_LABELS } from '../services/flights'
import FlightModal from '../components/FlightModal'
import AircraftModal from '../components/AircraftModal'
import WeatherCard from '../components/WeatherCard'
import WeatherForecast from '../components/WeatherForecast'
import SmartAlertsPanel from '../components/alerts/smart-alerts-panel'
import AlertBadge from '../components/alerts/alert-badge'
import { useAlertEngine } from '../hooks/use-alert-engine'
import GanttEnhanced from '../components/gantt/gantt-enhanced'

// ── Config ────────────────────────────────────────────────────────────────────
const AVWX_KEY    = import.meta.env.VITE_AVWX_API_KEY || ''
const GANTT_START = 6
const GANTT_END   = 19

// ── Mock fallback (si Firestore vide) ────────────────────────────────────────
const mkDate = (h, m) => { const d = new Date(); d.setHours(h,m,0,0); return { toDate: () => d } }

const MOCK_FLEET = [
  { id:'F-OSBC', registration:'F-OSBC', type:'Cessna 208B Grand Caravan', msn:'208B2188', year:2010, seats:9, status:'available',   airframe_hours:7821, engine_hours:1680, airframe_limit:20000, engine_limit:3600 },
  { id:'F-OSBM', registration:'F-OSBM', type:'Cessna 208B Grand Caravan', msn:'208B2391', year:2012, seats:9, status:'available',   airframe_hours:6234, engine_hours:2891, airframe_limit:20000, engine_limit:3600 },
  { id:'F-OSBS', registration:'F-OSBS', type:'Cessna 208B Grand Caravan', msn:'208B2378', year:2013, seats:9, status:'available',   airframe_hours:5980, engine_hours:1204, airframe_limit:20000, engine_limit:3600 },
  { id:'F-OSJR', registration:'F-OSJR', type:'Cessna 208B Grand Caravan', msn:'208B5350', year:2019, seats:9, status:'available',   airframe_hours:3102, engine_hours:3480, airframe_limit:20000, engine_limit:3600 },
  { id:'F-OSCO', registration:'F-OSCO', type:'Cessna 208B Grand Caravan', msn:'208B5681', year:2022, seats:9, status:'maintenance', airframe_hours:1450, engine_hours:980,  airframe_limit:20000, engine_limit:3600 },
]

const MOCK_FLIGHTS = [
  { id:'1',  flight_number:'PV801', origin:'TFFJ', destination:'TNCM', departure_time:mkDate(6,30),  arrival_time:mkDate(6,55),  status:'landed',    pax_count:8, max_pax:9, aircraft:'F-OSBC', pilot:'J. Dupont' },
  { id:'2',  flight_number:'PV802', origin:'TNCM', destination:'TFFJ', departure_time:mkDate(7,30),  arrival_time:mkDate(7,55),  status:'landed',    pax_count:9, max_pax:9, aircraft:'F-OSBC', pilot:'J. Dupont' },
  { id:'3',  flight_number:'PV803', origin:'TFFJ', destination:'TFFG', departure_time:mkDate(8,0),   arrival_time:mkDate(8,20),  status:'landed',    pax_count:7, max_pax:9, aircraft:'F-OSBM', pilot:'S. Martin' },
  { id:'4',  flight_number:'PV804', origin:'TFFG', destination:'TFFJ', departure_time:mkDate(9,0),   arrival_time:mkDate(9,20),  status:'in_flight', pax_count:5, max_pax:9, aircraft:'F-OSBM', pilot:'S. Martin' },
  { id:'5',  flight_number:'PV805', origin:'TFFJ', destination:'TNCM', departure_time:mkDate(9,30),  arrival_time:mkDate(9,55),  status:'scheduled', pax_count:6, max_pax:9, aircraft:'F-OSBS', pilot:'C. Leroy' },
  { id:'6',  flight_number:'PV806', origin:'TNCM', destination:'TFFJ', departure_time:mkDate(10,45), arrival_time:mkDate(11,10), status:'scheduled', pax_count:8, max_pax:9, aircraft:'F-OSBS', pilot:'C. Leroy' },
  { id:'7',  flight_number:'PV807', origin:'TFFJ', destination:'TFFG', departure_time:mkDate(11,0),  arrival_time:mkDate(11,20), status:'scheduled', pax_count:9, max_pax:9, aircraft:'F-OSJR', pilot:'A. Blanc' },
  { id:'8',  flight_number:'PV808', origin:'TFFG', destination:'TFFJ', departure_time:mkDate(12,0),  arrival_time:mkDate(12,20), status:'scheduled', pax_count:4, max_pax:9, aircraft:'F-OSJR', pilot:'A. Blanc' },
  { id:'9',  flight_number:'PV809', origin:'TFFJ', destination:'TNCM', departure_time:mkDate(13,30), arrival_time:mkDate(13,55), status:'scheduled', pax_count:7, max_pax:9, aircraft:'F-OSBC', pilot:'J. Dupont' },
  { id:'10', flight_number:'PV810', origin:'TNCM', destination:'TFFJ', departure_time:mkDate(14,30), arrival_time:mkDate(14,55), status:'scheduled', pax_count:6, max_pax:9, aircraft:'F-OSBM', pilot:'S. Martin' },
  { id:'11', flight_number:'PV811', origin:'TFFJ', destination:'TFFG', departure_time:mkDate(15,30), arrival_time:mkDate(15,50), status:'scheduled', pax_count:5, max_pax:9, aircraft:'F-OSBS', pilot:'C. Leroy' },
  { id:'12', flight_number:'PV812', origin:'TFFG', destination:'TFFJ', departure_time:mkDate(16,30), arrival_time:mkDate(16,50), status:'scheduled', pax_count:8, max_pax:9, aircraft:'F-OSJR', pilot:'A. Blanc' },
]

const WEATHER_MOCK = {
  TFFJ: { icao:'TFFJ', name:'Saint-Barthélemy',     temp:28, wind_speed:12, wind_dir:'ENE', wind_deg:70,  vis:10, ceiling:null, dewpoint:22, wind_gust:null, status:'VFR',  raw:'TFFJ 271200Z 07012KT 9999 FEW022 28/22 Q1015', updated:new Date() },
  TFFG: { icao:'TFFG', name:'St-Martin Grand Case', temp:29, wind_speed:18, wind_dir:'E',   wind_deg:90,  vis:8,  ceiling:null, dewpoint:23, wind_gust:25,  status:'VFR',  raw:'TFFG 271200Z 09018KT 8000 SCT018 29/23 Q1014', updated:new Date() },
  TNCM: { icao:'TNCM', name:'Sint-Maarten Juliana', temp:27, wind_speed:22, wind_dir:'NE',  wind_deg:50,  vis:6,  ceiling:1200, dewpoint:24, wind_gust:30,  status:'MVFR', raw:'TNCM 271200Z 05022KT 6000 BKN012 27/24 Q1013', updated:new Date() },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const toDate  = ts => ts?.toDate ? ts.toDate() : new Date(ts)
const fmtTime = d  => d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
const fmtClock= d  => d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
const fmtDate = d  => d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })

const pctToTime = pct => {
  const totalMins = (GANTT_END - GANTT_START) * 60
  const mins = Math.round(pct * totalMins)
  return { h: GANTT_START + Math.floor(mins / 60), m: mins % 60 }
}

const STATUS_COLORS = {
  landed:    { bg:'rgba(30,77,43,0.85)',  border:'#4ADE80', text:'#4ADE80' },
  in_flight: { bg:'rgba(90,60,0,0.9)',   border:'#F0B429', text:'#F0B429' },
  scheduled: { bg:'rgba(17,45,82,0.9)',  border:'#3B82F6', text:'#93C5FD' },
  boarding:  { bg:'rgba(70,35,0,0.9)',   border:'#FB923C', text:'#FB923C' },
  cancelled: { bg:'rgba(50,10,10,0.85)', border:'#F87171', text:'#F87171' },
}

const STATUS_LABEL = { available:'Disponible', in_flight:'En vol', maintenance:'Maintenance' }

// ── Composants atomiques ──────────────────────────────────────────────────────
function StatusDot({ status }) {
  const c = { available:'#4ADE80', in_flight:'#F0B429', maintenance:'#F87171' }[status] || '#9CA3AF'
  return (
    <span style={{
      display:'inline-block', width:9, height:9, borderRadius:'50%',
      backgroundColor:c, boxShadow:`0 0 7px ${c}`, flexShrink:0,
    }}/>
  )
}

function PotentialBar({ current, limit, label }) {
  const pct = getPotentialPercent(current, limit)
  const lvl = getAlertLevel(pct)
  const bar = lvl==='critical'?'#EF4444':lvl==='warning'?'#F0B429':'#4ADE80'
  const txt = lvl==='critical'?'#F87171':lvl==='warning'?'#F0B429':'#86EFAC'
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
        <span style={{color:'#5B8DB8',fontSize:11}}>{label}</span>
        <span style={{color:txt,fontSize:11,fontWeight:700}}>{pct}%</span>
      </div>
      <div style={{height:5,backgroundColor:'#1E3A5F',borderRadius:3,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${pct}%`,backgroundColor:bar,borderRadius:3,transition:'width 0.6s ease'}}/>
      </div>
      <div style={{color:'#2D5580',fontSize:10,marginTop:2}}>{Math.round(current).toLocaleString()} / {limit.toLocaleString()} h</div>
    </div>
  )
}

function KPICard({ label, value, sub, color, icon }) {
  return (
    <div className="rounded-xl border p-4" style={{backgroundColor:'#112D52',borderColor:'#1E3A5F'}}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-black" style={{color}}>{value}</div>
          <div style={{color:'#5B8DB8',fontSize:12,marginTop:3}}>{label}</div>
          {sub && <div style={{color:'#2D5580',fontSize:10,marginTop:2}}>{sub}</div>}
        </div>
        <span style={{fontSize:22,opacity:0.2}}>{icon}</span>
      </div>
    </div>
  )
}

// ── Gantt ─────────────────────────────────────────────────────────────────────
function GanttChart({ flights, fleet, onFlightClick, onCreateFlight, onDropFlight }) {
  const ganttRef = useRef(null)
  const dragRef  = useRef(null)
  const [dragging, setDragging] = useState(null)
  const [dragX,    setDragX]    = useState(0)
  const [nowLeft,  setNowLeft]  = useState(0)

  const totalMins = (GANTT_END - GANTT_START) * 60
  const hours     = Array.from({length: GANTT_END - GANTT_START + 1}, (_, i) => GANTT_START + i)

  const getLeft  = d => Math.max(0, Math.min(100, ((d.getHours()-GANTT_START)*60+d.getMinutes()) / totalMins * 100))
  const getWidth = (dep,arr) => Math.max(1, (arr-dep)/60000 / totalMins * 100)

  useEffect(() => {
    const tick = () => setNowLeft(getLeft(new Date()))
    tick()
    const t = setInterval(tick, 10000)
    return () => clearInterval(t)
  }, [])

  const handleMouseDown = (e, flight) => {
    e.stopPropagation()
    const rect = ganttRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = { flight, startX: e.clientX, ganttLeft: rect.left, ganttWidth: rect.width }
    setDragging(flight.id)
    setDragX(e.clientX)
  }

  const handleMouseMove = useCallback(e => {
    if (dragRef.current) setDragX(e.clientX)
  }, [])

  const handleMouseUp = useCallback(e => {
    if (!dragRef.current) return
    const { flight, ganttLeft, ganttWidth } = dragRef.current
    const COL_W = 96
    const pct   = Math.max(0, Math.min(1, (e.clientX - ganttLeft - COL_W) / (ganttWidth - COL_W)))
    const dep   = toDate(flight.departure_time)
    const arr   = toDate(flight.arrival_time)
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

  const handleRowClick = (e, ac) => {
    if (dragging) return
    const rect = ganttRef.current?.getBoundingClientRect()
    if (!rect) return
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left - 96) / (rect.width - 96)))
    const { h, m } = pctToTime(pct)
    onCreateFlight({ aircraft: ac.registration, hour: h, minute: m })
  }

  return (
    <div ref={ganttRef} className="rounded-xl border overflow-hidden select-none" style={{backgroundColor:'#071729', borderColor:'#1E3A5F'}}>
      <div className="flex border-b" style={{borderColor:'#1E3A5F'}}>
        <div style={{width:96,minWidth:96,padding:'6px 12px',borderRight:'1px solid #1E3A5F'}}>
          <span style={{color:'#2D5580',fontSize:10,fontWeight:700,letterSpacing:2}}>AVION</span>
        </div>
        <div style={{flex:1,position:'relative',height:28}}>
          {hours.map(h => (
            <div key={h} style={{
              position:'absolute', left:`${((h-GANTT_START)/(GANTT_END-GANTT_START))*100}%`,
              top:'50%', transform:'translate(-50%,-50%)',
              color:'#2D5580', fontSize:10, fontFamily:'monospace',
            }}>{String(h).padStart(2,'0')}h</div>
          ))}
        </div>
      </div>

      {fleet.map((ac, idx) => {
        const acFlights = flights.filter(f => f.aircraft === ac.registration)
        return (
          <div key={ac.id || ac.registration}
            className="flex border-b"
            style={{borderColor:'#1E3A5F', backgroundColor: idx%2===0 ? 'transparent' : 'rgba(17,45,82,0.12)'}}>
            <div style={{width:96,minWidth:96,padding:'0 12px',borderRight:'1px solid #1E3A5F',display:'flex',alignItems:'center',gap:6,cursor:'default'}}>
              <StatusDot status={ac.status}/>
              <span style={{color:'#CBD5E1',fontSize:11,fontWeight:700,fontFamily:'monospace',letterSpacing:0.5}}>
                {ac.registration.replace('F-','')}
              </span>
            </div>
            <div
              style={{flex:1,position:'relative',height:52,cursor:'crosshair'}}
              onClick={e => handleRowClick(e, ac)}
            >
              {hours.map(h => (
                <div key={h} style={{
                  position:'absolute',top:0,bottom:0,width:1,
                  left:`${((h-GANTT_START)/(GANTT_END-GANTT_START))*100}%`,
                  backgroundColor:'#1E3A5F',
                }}/>
              ))}
              {nowLeft > 0 && nowLeft < 100 && (
                <div style={{
                  position:'absolute',top:0,bottom:0,width:2,
                  left:`${nowLeft}%`,
                  background:'linear-gradient(180deg,transparent,#F0B429,transparent)',
                  zIndex:10,
                }}/>
              )}
              {acFlights.map(f => {
                const dep  = toDate(f.departure_time)
                const arr  = toDate(f.arrival_time)
                const left = getLeft(dep)
                const width= getWidth(dep, arr)
                const sc   = STATUS_COLORS[f.status] || STATUS_COLORS.scheduled
                const isDragging  = dragging === f.id
                const dragOffset  = isDragging ? dragX - (dragRef.current?.startX || 0) : 0
                return (
                  <div key={f.id}
                    onMouseDown={e => handleMouseDown(e, f)}
                    onClick={e => { e.stopPropagation(); if (!isDragging) onFlightClick(f) }}
                    title={`${f.flight_number} · ${AIRPORTS_FULL[f.origin]?.short}→${AIRPORTS_FULL[f.destination]?.short} · ${fmtTime(dep)}→${fmtTime(arr)} · ${f.pax_count}/${f.max_pax} pax`}
                    style={{
                      position:'absolute',top:7,bottom:7,
                      left: isDragging ? `calc(${left}% + ${dragOffset}px)` : `${left}%`,
                      width:`${width}%`,minWidth:22,
                      backgroundColor:sc.bg,
                      border:`1px solid ${sc.border}`,
                      borderRadius:5,
                      display:'flex',alignItems:'center',padding:'0 6px',gap:4,
                      cursor: isDragging ? 'grabbing' : 'grab',
                      zIndex: isDragging ? 20 : 5,
                      transition: isDragging ? 'none' : 'box-shadow 0.15s ease',
                      boxShadow: isDragging ? `0 6px 24px ${sc.border}50` : 'none',
                      overflow:'hidden',
                    }}>
                    <span style={{color:sc.text,fontSize:9,fontWeight:800,whiteSpace:'nowrap',letterSpacing:0.3}}>
                      {f.flight_number}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t" style={{borderColor:'#1E3A5F',backgroundColor:'rgba(7,23,41,0.6)'}}>
        <div className="flex flex-wrap gap-4">
          {Object.entries({landed:'Atterri',in_flight:'En vol',scheduled:'Programmé',boarding:'Embarquement',cancelled:'Annulé'}).map(([k,v]) => {
            const sc = STATUS_COLORS[k]
            return (
              <div key={k} style={{display:'flex',alignItems:'center',gap:5}}>
                <div style={{width:10,height:10,borderRadius:2,backgroundColor:sc.bg,border:`1px solid ${sc.border}`}}/>
                <span style={{color:'#5B8DB8',fontSize:10}}>{v}</span>
              </div>
            )
          })}
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            <div style={{width:2,height:12,background:'linear-gradient(180deg,transparent,#F0B429,transparent)'}}/>
            <span style={{color:'#5B8DB8',fontSize:10}}>Maintenant</span>
          </div>
        </div>
        <span style={{color:'#1E3A5F',fontSize:10}}>✦ Clic ligne vide → créer vol · Glisser → déplacer</span>
      </div>
    </div>
  )
}

// ── Dashboard principal ───────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, role, logout } = useAuth()
  const { fleet: fsFleet }     = useAircraft()
  const { flights: fsFlights, kpis: fsKpis } = useFlights()

  const [tab,            setTab]            = useState('overview')
  const [time,           setTime]           = useState(new Date())
  const [weather,        setWeather]        = useState(WEATHER_MOCK)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [flightModal,    setFlightModal]    = useState(null)
  const [aircraftModal,  setAircraftModal]  = useState(null)

  const fleet   = fsFleet.length   > 0 ? fsFleet   : MOCK_FLEET
  const flights = fsFlights.length > 0 ? fsFlights : MOCK_FLIGHTS
  const kpis    = fsFlights.length > 0 ? fsKpis : {
    total:     MOCK_FLIGHTS.length,
    completed: MOCK_FLIGHTS.filter(f => f.status === 'landed').length,
    inFlight:  MOCK_FLIGHTS.filter(f => f.status === 'in_flight').length,
    cancelled: MOCK_FLIGHTS.filter(f => f.status === 'cancelled').length,
    totalPax:  MOCK_FLIGHTS.reduce((s, f) => s + f.pax_count, 0),
    fillRate:  Math.round(MOCK_FLIGHTS.reduce((s,f)=>s+f.pax_count,0) / MOCK_FLIGHTS.reduce((s,f)=>s+f.max_pax,0) * 100),
  }

  // ── Moteur d'alertes intelligentes ───────────────────────────────────────────
  // Analyse la flotte + les vols + la météo et persiste les alertes dans Firestore
  useAlertEngine({
    fleet,
    flights,
    weather,
    enabled: fleet.length > 0,
  })

  const maintenanceAlerts = fleet.filter(a =>
    getPotentialPercent(a.engine_hours,   a.engine_limit)   <= 20 ||
    getPotentialPercent(a.airframe_hours, a.airframe_limit) <= 20 ||
    a.status === 'maintenance'
  )

  const upcomingFlights = flights
    .filter(f => f.status === 'scheduled' || f.status === 'boarding')
    .slice(0, 3)

  const fetchWeather = useCallback(async () => {
    if (!AVWX_KEY) return
    setWeatherLoading(true)
    try {
      const results = await Promise.allSettled(
        ['TFFJ','TFFG','TNCM'].map(icao =>
          fetch(`https://avwx.rest/api/metar/${icao}?token=${AVWX_KEY}`).then(r => r.json())
        )
      )
      const nw = { ...WEATHER_MOCK }
      results.forEach((r, i) => {
        const icao = ['TFFJ','TFFG','TNCM'][i]
        if (r.status === 'fulfilled' && r.value?.raw) {
          const d    = r.value
          const vis  = d.visibility?.value ?? 10
          const ceil = d.ceiling?.value ?? null
          nw[icao] = {
            icao,
            name:       WEATHER_MOCK[icao].name,
            temp:       d.temperature?.value    ?? 0,
            dewpoint:   d.dewpoint?.value       ?? null,
            wind_speed: d.wind_speed?.value     ?? 0,
            wind_gust:  d.wind_gust?.value      ?? null,
            wind_dir:   d.wind_direction?.repr  ?? '--',
            wind_deg:   d.wind_direction?.value ?? null,
            vis, ceiling: ceil,
            status: (vis < 3 || (ceil && ceil < 500)) ? 'IFR'
                  : (vis < 5 || (ceil && ceil < 1000)) ? 'MVFR' : 'VFR',
            raw:     d.raw || '',
            updated: new Date(),
          }
        }
      })
      setWeather(nw)
    } catch(e) { console.error('AVWX error:', e) }
    finally { setWeatherLoading(false) }
  }, [])

  useEffect(() => {
    fetchWeather()
    const t = setInterval(fetchWeather, 600_000)
    return () => clearInterval(t)
  }, [fetchWeather])

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const handleFlightClick  = flight => setFlightModal(flight)
  const handleCreateFlight = ({ aircraft, hour, minute }) => {
    const dep = new Date(); dep.setHours(hour, minute, 0, 0)
    const arr = new Date(dep.getTime() + 25 * 60_000)
    setFlightModal({
      aircraft,
      departure_time: { toDate: () => dep },
      arrival_time:   { toDate: () => arr },
    })
  }
  const handleDropFlight = async (flight, newDep, newArr) => {
    if (!flight.id || !fsFlights.length) return
    try { await updateFlight(flight.id, { departure_time: newDep, arrival_time: newArr }) }
    catch(e) { console.error('Drop error:', e) }
  }

  const TABS = [
    { id:'overview', icon:'⊞', label:'Vue globale'   },
    { id:'gantt',    icon:'▦', label:'Planning Gantt' },
    { id:'fleet',    icon:'✈', label:'Flotte'         },
    { id:'flights',  icon:'≡', label:'Vols'           },
    { id:'weather',  icon:'◎', label:'Météo'          },
    { id:'alerts',   icon:'🔔', label:'Alertes'       },
  ]

  const hasIfrAlert = maintenanceAlerts.length > 0 || Object.values(weather).some(w => w.status === 'IFR')

  return (
    <div className="min-h-screen text-white" style={{backgroundColor:'#0B1F3A',fontFamily:"'Segoe UI',system-ui,sans-serif"}}>

      {/* ── MODALES ── */}
      {flightModal && (
        <FlightModal
          flight={flightModal?.id ? flightModal : null}
          fleet={fleet}
          onClose={() => setFlightModal(null)}
          onSaved={() => setFlightModal(null)}
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
      <header className="sticky top-0 z-40 border-b" style={{backgroundColor:'#071729',borderColor:'#1E3A5F'}}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">

          {/* Logo + nom */}
          <div className="flex items-center gap-3 shrink-0">
            <img src="/logo-sbh.png" alt="SBH" className="h-9 w-auto" onError={e => e.target.style.display='none'}/>
            <div>
              <div className="font-black text-white tracking-wide text-base">SKYBH</div>
              <div style={{color:'#F0B429',fontSize:9,letterSpacing:3,textTransform:'uppercase'}}>St Barth Commuter</div>
            </div>
          </div>

          {/* Horloge */}
          <div className="hidden sm:block text-center">
            <div className="font-mono text-xl font-black" style={{color:'#F0B429'}}>{fmtClock(time)}</div>
            <div className="text-xs capitalize" style={{color:'#5B8DB8'}}>{fmtDate(time)}</div>
          </div>

          {/* Infos utilisateur */}
          <div className="flex items-center gap-3 shrink-0">

            {/* Bouton 🔔 Alertes — remplace l'ancien badge ALERTE statique */}
            <button
              onClick={() => setTab('alerts')}
              className="hidden md:flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-all hover:bg-white/5"
              style={{
                border: `1px solid ${hasIfrAlert ? 'rgba(127,29,29,0.6)' : '#1E3A5F'}`,
                backgroundColor: hasIfrAlert ? 'rgba(127,29,29,0.1)' : 'transparent',
              }}
            >
              <span style={{fontSize:15}}>🔔</span>
              {/* AlertBadge affiche les compteurs depuis Firestore en temps réel */}
              <AlertBadge />
              {/* Fallback si Firestore vide mais maintenance locale détectée */}
              {hasIfrAlert && (
                <span style={{color:'#F87171',fontSize:10,fontWeight:700}}>
                  ALERTE
                </span>
              )}
            </button>

            <div className="hidden md:block text-right">
              <div style={{color:'#5B8DB8',fontSize:11}}>{user?.email}</div>
              <div style={{color:'#F0B429',fontSize:9,fontWeight:700,letterSpacing:2,textTransform:'uppercase'}}>{role}</div>
            </div>
            <button onClick={logout}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-white/5"
              style={{borderColor:'#1E3A5F',color:'#5B8DB8'}}>
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* ── NAVIGATION ── */}
      <nav className="border-b overflow-x-auto" style={{backgroundColor:'#071729',borderColor:'#1E3A5F'}}>
        <div className="flex min-w-max px-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors relative"
              style={{
                borderColor: tab === t.id ? '#F0B429' : 'transparent',
                color:       tab === t.id ? '#F0B429' : '#5B8DB8',
              }}>
              <span className="mr-1.5">{t.icon}</span>{t.label}
              {/* Point rouge sur l'onglet Alertes si alertes actives */}
              {t.id === 'alerts' && hasIfrAlert && tab !== 'alerts' && (
                <span style={{
                  position:'absolute', top:8, right:8,
                  width:6, height:6, borderRadius:'50%',
                  backgroundColor:'#EF4444',
                  boxShadow:'0 0 6px #EF4444',
                }}/>
              )}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── BANDEAU ALERTES MAINTENANCE (tous tabs sauf 'alerts') ── */}
        {maintenanceAlerts.length > 0 && tab !== 'alerts' && (
          <div className="rounded-xl border p-4" style={{backgroundColor:'rgba(127,29,29,0.12)',borderColor:'rgba(127,29,29,0.6)'}}>
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span className="font-bold text-sm" style={{color:'#FCA5A5'}}>
                  Alertes maintenance — {maintenanceAlerts.length} appareil{maintenanceAlerts.length > 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => setTab('alerts')}
                style={{
                  fontSize:10, color:'#F87171', fontWeight:700,
                  padding:'3px 10px', borderRadius:6,
                  border:'1px solid rgba(127,29,29,0.5)',
                  backgroundColor:'rgba(127,29,29,0.15)',
                  cursor:'pointer',
                }}>
                Voir toutes les alertes →
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {maintenanceAlerts.map(a => {
                const ep = getPotentialPercent(a.engine_hours,   a.engine_limit)
                const ap = getPotentialPercent(a.airframe_hours, a.airframe_limit)
                return (
                  <button key={a.id || a.registration} onClick={() => setAircraftModal(a)}
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5 transition-opacity hover:opacity-80"
                    style={{backgroundColor:'rgba(0,0,0,0.3)',border:'1px solid rgba(127,29,29,0.5)'}}>
                    <span className="font-mono font-black text-xs text-white">{a.registration}</span>
                    {a.status === 'maintenance' && <span className="text-xs px-1.5 rounded" style={{backgroundColor:'#7F1D1D',color:'#FCA5A5'}}>MAINT.</span>}
                    {ep <= 20 && <span className="text-xs px-1.5 rounded" style={{backgroundColor:'#78350F',color:'#FCD34D'}}>Moteur {ep}%</span>}
                    {ap <= 20 && <span className="text-xs px-1.5 rounded" style={{backgroundColor:'#78350F',color:'#FCD34D'}}>Cellule {ap}%</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            VUE GLOBALE
        ════════════════════════════════════════════════════════ */}
        {tab === 'overview' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KPICard label="Vols du jour"   value={kpis.total}         color="#FFFFFF"  icon="✈"  sub={`${kpis.completed} atterris`}/>
              <KPICard label="En vol"         value={kpis.inFlight}      color="#F0B429"  icon="🛫" sub="temps réel"/>
              <KPICard label="Passagers"      value={kpis.totalPax}      color="#7DD3FC"  icon="👥" sub="aujourd'hui"/>
              <KPICard label="Remplissage"    value={`${kpis.fillRate}%`} color="#4ADE80" icon="📊" sub={`${kpis.cancelled||0} annulé(s)`}/>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 style={{color:'#5B8DB8',fontSize:10,fontWeight:700,letterSpacing:3,textTransform:'uppercase'}}>Météo aérodromes</h2>
                {!AVWX_KEY && (
                  <span style={{color:'#F0B429',fontSize:9,padding:'2px 8px',border:'1px solid rgba(240,180,41,0.4)',borderRadius:4}}>
                    DÉMO — ajouter VITE_AVWX_API_KEY
                  </span>
                )}
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {Object.values(weather).map(w => <WeatherCard key={w.icao} w={w}/>)}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 style={{color:'#5B8DB8',fontSize:10,fontWeight:700,letterSpacing:3,textTransform:'uppercase'}}>Prochains vols</h2>
                  <button onClick={() => setTab('flights')} style={{color:'#F0B429',fontSize:11}}>Voir tout →</button>
                </div>
                <div className="space-y-2">
                  {upcomingFlights.length === 0 && (
                    <div className="rounded-xl border p-4 text-center text-sm" style={{backgroundColor:'#112D52',borderColor:'#1E3A5F',color:'#2D5580'}}>
                      Aucun vol programmé
                    </div>
                  )}
                  {upcomingFlights.map(f => (
                    <button key={f.id} onClick={() => setFlightModal(f)}
                      className="w-full rounded-xl border p-3 text-left transition-all hover:border-[#F0B429]/40"
                      style={{backgroundColor:'#112D52',borderColor:'#1E3A5F'}}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs" style={{color:'#F0B429'}}>{f.flight_number}</span>
                          <span className="text-xs font-bold text-white">
                            {AIRPORTS_FULL[f.origin]?.short} → {AIRPORTS_FULL[f.destination]?.short}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs" style={{color:'#5B8DB8'}}>{fmtTime(toDate(f.departure_time))}</span>
                          <span className="text-xs" style={{color:'#5B8DB8'}}>{f.pax_count}/{f.max_pax}</span>
                        </div>
                      </div>
                      <div className="text-xs mt-1" style={{color:'#2D5580'}}>{f.aircraft} · {f.pilot || 'Pilote N/A'}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 style={{color:'#5B8DB8',fontSize:10,fontWeight:700,letterSpacing:3,textTransform:'uppercase'}}>État flotte</h2>
                  <button onClick={() => setTab('fleet')} style={{color:'#F0B429',fontSize:11}}>Voir tout →</button>
                </div>
                <div className="space-y-2">
                  {fleet.map(a => (
                    <button key={a.id || a.registration} onClick={() => setAircraftModal(a)}
                      className="w-full rounded-xl border p-3 text-left transition-all hover:border-[#F0B429]/40"
                      style={{backgroundColor:'#112D52',borderColor:a.status==='maintenance'?'rgba(127,29,29,0.6)':'#1E3A5F'}}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StatusDot status={a.status}/>
                          <span className="font-mono font-bold text-xs text-white">{a.registration}</span>
                          <span style={{color:'#5B8DB8',fontSize:10}}>{STATUS_LABEL[a.status]}</span>
                        </div>
                        <div className="flex gap-2">
                          {getPotentialPercent(a.engine_hours, a.engine_limit) <= 20 && (
                            <span className="text-xs px-1.5 rounded" style={{backgroundColor:'#78350F',color:'#FCD34D'}}>
                              M {getPotentialPercent(a.engine_hours, a.engine_limit)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            PLANNING GANTT
        ════════════════════════════════════════════════════════ */}
        {tab === 'gantt' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 style={{color:'#5B8DB8',fontSize:10,fontWeight:700,letterSpacing:3,textTransform:'uppercase'}}>Planning Gantt</h2>
                <div className="text-xs capitalize mt-0.5" style={{color:'#2D5580'}}>{fmtDate(time)}</div>
              </div>
            </div>
            <GanttEnhanced
              flights={flights}
              fleet={fleet}
              user={user}
              onFlightClick={handleFlightClick}
              onCreateFlight={handleCreateFlight}
            />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            FLOTTE
        ════════════════════════════════════════════════════════ */}
        {tab === 'fleet' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 style={{color:'#5B8DB8',fontSize:10,fontWeight:700,letterSpacing:3,textTransform:'uppercase'}}>Flotte SBH Commuter</h2>
                <div className="text-xs mt-0.5" style={{color:'#2D5580'}}>{fleet.length} Cessna C208B Grand Caravan</div>
              </div>
              <button onClick={() => setAircraftModal('new')}
                className="text-xs px-4 py-2 rounded-lg font-bold transition-opacity hover:opacity-90"
                style={{backgroundColor:'#F0B429',color:'#0B1F3A'}}>
                + Avion
              </button>
            </div>
            <div className="space-y-3">
              {fleet.map(a => (
                <button key={a.id || a.registration} onClick={() => setAircraftModal(a)}
                  className="w-full rounded-xl border p-5 text-left transition-all hover:border-[#F0B429]/40"
                  style={{backgroundColor:'#112D52',borderColor:a.status==='maintenance'?'rgba(127,29,29,0.6)':'#1E3A5F'}}>
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xl font-black text-white">{a.registration}</span>
                        <StatusDot status={a.status}/>
                        <span style={{color:'#5B8DB8',fontSize:12}}>{STATUS_LABEL[a.status]}</span>
                      </div>
                      <div style={{color:'#5B8DB8',fontSize:11,marginTop:3}}>
                        {a.type} · MSN {a.msn} · {a.year} · {a.seats} sièges
                      </div>
                    </div>
                    <div style={{color:'#5B8DB8',fontSize:11,padding:'4px 10px',border:'1px solid #1E3A5F',borderRadius:6}}>
                      ✏️ Modifier
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <PotentialBar current={a.engine_hours}   limit={a.engine_limit}   label="Moteur PT6A-114A"/>
                    <PotentialBar current={a.airframe_hours} limit={a.airframe_limit} label="Cellule"/>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            VOLS
        ════════════════════════════════════════════════════════ */}
        {tab === 'flights' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 style={{color:'#5B8DB8',fontSize:10,fontWeight:700,letterSpacing:3,textTransform:'uppercase'}}>
                  Rotations du jour
                </h2>
                <div className="text-xs mt-0.5" style={{color:'#2D5580'}}>
                  {flights.length} vols · {kpis.completed} atterris · {kpis.inFlight} en vol
                </div>
              </div>
              <button onClick={() => setFlightModal({})}
                className="text-xs px-4 py-2 rounded-lg font-bold transition-opacity hover:opacity-90"
                style={{backgroundColor:'#F0B429',color:'#0B1F3A'}}>
                + Nouveau vol
              </button>
            </div>

            {flights.map(f => {
              const sc  = STATUS_COLORS[f.status] || STATUS_COLORS.scheduled
              const dep = toDate(f.departure_time)
              const arr = toDate(f.arrival_time)
              const isFull = f.pax_count >= f.max_pax
              return (
                <button key={f.id} onClick={() => setFlightModal(f)}
                  className="w-full rounded-xl border p-4 text-left transition-all hover:border-[#F0B429]/40"
                  style={{
                    backgroundColor: f.status==='in_flight' ? 'rgba(90,60,0,0.2)' : '#112D52',
                    borderColor:     f.status==='in_flight' ? '#F0B429'
                                   : f.status==='cancelled' ? 'rgba(127,29,29,0.6)' : '#1E3A5F',
                  }}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono font-black text-sm w-14 shrink-0" style={{color:'#F0B429'}}>
                      {f.flight_number}
                    </span>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="min-w-0">
                        <div className="font-bold text-white text-sm">{AIRPORTS_FULL[f.origin]?.short || f.origin}</div>
                        <div style={{color:'#5B8DB8',fontSize:9}} className="truncate">{AIRPORTS_FULL[f.origin]?.name}</div>
                      </div>
                      <span style={{color:'#1E3A5F',fontSize:16,flexShrink:0}}>→</span>
                      <div className="min-w-0">
                        <div className="font-bold text-white text-sm">{AIRPORTS_FULL[f.destination]?.short || f.destination}</div>
                        <div style={{color:'#5B8DB8',fontSize:9}} className="truncate">{AIRPORTS_FULL[f.destination]?.name}</div>
                      </div>
                    </div>
                    <div className="font-mono text-xs shrink-0" style={{color:'#5B8DB8'}}>
                      {fmtTime(dep)} → {fmtTime(arr)}
                    </div>
                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                      <span style={{color:'#2D5580',fontSize:11,fontFamily:'monospace'}}>{f.aircraft}</span>
                      {f.pilot && <span style={{color:'#2D5580',fontSize:11}}>✈ {f.pilot}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold" style={{color:sc.text}}>{FLIGHT_STATUS_LABELS[f.status]}</span>
                      <span style={{color:'#5B8DB8',fontSize:11}}>{f.pax_count}/{f.max_pax}</span>
                      {isFull && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{backgroundColor:'#064E3B',color:'#6EE7B7'}}>
                          FULL
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            MÉTÉO
        ════════════════════════════════════════════════════════ */}
        {tab === 'weather' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 style={{color:'#5B8DB8',fontSize:10,fontWeight:700,letterSpacing:3,textTransform:'uppercase'}}>
                  METAR temps réel
                </h2>
                <div className="text-xs mt-0.5" style={{color:'#2D5580'}}>
                  {AVWX_KEY ? 'Données AVWX · Actualisation toutes les 10 min' : 'Données de démonstration'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!AVWX_KEY && (
                  <span style={{color:'#F0B429',fontSize:9,padding:'3px 8px',border:'1px solid rgba(240,180,41,0.4)',borderRadius:4}}>
                    DÉMO
                  </span>
                )}
                <button onClick={fetchWeather} disabled={weatherLoading || !AVWX_KEY}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-30"
                  style={{borderColor:'#1E3A5F',color:'#5B8DB8'}}>
                  {weatherLoading ? '⟳ ...' : '↻ Actualiser'}
                </button>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {Object.values(weather).map(w => <WeatherCard key={w.icao} w={w}/>)}
            </div>

            <div className="rounded-xl border p-4" style={{backgroundColor:'#112D52',borderColor:'#1E3A5F'}}>
              <div className="font-bold text-sm text-white mb-3">Règles VFR — DGAC/OSAC</div>
              <div className="space-y-1.5 text-sm">
                {[
                  { code:'VFR',  color:'#4ADE80', desc:'Visibilité > 5km, plafond > 1000ft — Vol autorisé' },
                  { code:'MVFR', color:'#F0B429', desc:'Visibilité 3–5km ou plafond 500–1000ft — Décision pilote' },
                  { code:'IFR',  color:'#F87171', desc:'Visibilité < 3km ou plafond < 500ft — Vol non recommandé VFR' },
                ].map(({code,color,desc}) => (
                  <div key={code} className="flex gap-3 items-center">
                    <span className="font-black w-12 text-sm" style={{color}}>{code}</span>
                    <span style={{color:'#5B8DB8',fontSize:12}}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{height:1, backgroundColor:'#1E3A5F'}}/>
            <WeatherForecast flights={flights} weather={weather} />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            ALERTES INTELLIGENTES
        ════════════════════════════════════════════════════════ */}
        {tab === 'alerts' && (
          <div className="rounded-xl border p-5" style={{backgroundColor:'#071729',borderColor:'#1E3A5F',minHeight:400}}>
            <SmartAlertsPanel userId={user?.uid} />
          </div>
        )}

      </main>

      {/* ── FOOTER ── */}
      <footer className="border-t mt-12 py-4 text-center" style={{borderColor:'#1E3A5F'}}>
        <span style={{color:'#1E3A5F',fontSize:10,letterSpacing:1}}>
          SKYBH v3.0 · SBH Commuter · FR.AOC.0033 · DGAC/OSAC · EASA Part-145
        </span>
      </footer>
    </div>
  )
}