import { useEffect, useState, useRef, useCallback } from 'react'
import { Timestamp } from 'firebase/firestore'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuth } from '../context/AuthContext'
import { useAircraft } from '../hooks/useAircraft'
import { useFlights } from '../hooks/useFlights'
import { getPotentialPercent, getAlertLevel } from '../services/aircraft'
import { updateFlight, AIRPORTS_FULL } from '../services/flights'
import FlightModal from '../components/FlightModal'
import AircraftModal from '../components/AircraftModal'
import WeatherCard from '../components/WeatherCard'
import WeatherForecast from '../components/WeatherForecast'
import SmartAlertsPanel from '../components/alerts/smart-alerts-panel'
import { useAlertEngine } from '../hooks/use-alert-engine'
import GanttEnhanced from '../components/gantt/gantt-enhanced'
import MaintenancePage from './maintenance'
import FleetPage from './fleet'
import FlightsPage from './flights'
import LiveMap from '../components/live-map/LiveMap'
import CrewPage from './crew'
import ProfilePage from './profile'
import PassengerCheckin from '../components/dcs/PassengerCheckin'
import WBCalculator from '../components/dcs/WBCalculator'

// ── Config ────────────────────────────────────────────────────
const AVWX_KEY    = import.meta.env.VITE_AVWX_API_KEY || ''
const GANTT_START = 6
const GANTT_END   = 19
const SBH_TZ      = 'America/St_Barthelemy'

// ── Mock fallback ─────────────────────────────────────────────
const mkDate = (h, m) => {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return { toDate: () => d }
}

const MOCK_FLEET = [
  { id:'F-OSBC', registration:'F-OSBC', type:'Cessna 208B Grand Caravan',    msn:'208B2188', year:2010, seats:9, status:'available',   airframe_hours:7821, engine_hours:1680, airframe_limit:20000, engine_limit:3600 },
  { id:'F-OSBM', registration:'F-OSBM', type:'Cessna 208B Grand Caravan',    msn:'208B2391', year:2012, seats:9, status:'available',   airframe_hours:6234, engine_hours:2891, airframe_limit:20000, engine_limit:3600 },
  { id:'F-OSBS', registration:'F-OSBS', type:'Cessna 208B Grand Caravan',    msn:'208B2378', year:2013, seats:9, status:'available',   airframe_hours:5980, engine_hours:1204, airframe_limit:20000, engine_limit:3600 },
  { id:'F-OSJR', registration:'F-OSJR', type:'Cessna 208B Grand Caravan EX', msn:'208B5350', year:2019, seats:9, status:'available',   airframe_hours:3102, engine_hours:3480, airframe_limit:20000, engine_limit:3600 },
  { id:'F-OSCO', registration:'F-OSCO', type:'Cessna 208B Grand Caravan EX', msn:'208B5681', year:2022, seats:9, status:'maintenance', airframe_hours:1450, engine_hours:980,  airframe_limit:20000, engine_limit:3600 },
  { id:'F-OSCP', registration:'F-OSCP', type:'Cessna 208B Grand Caravan EX', msn:'208B5720', year:2023, seats:9, status:'available',   airframe_hours:820,  engine_hours:820,  airframe_limit:20000, engine_limit:3600 },
]

const MOCK_FLIGHTS = [
  { id:'1',  flight_number:'PV801', origin:'TFFJ', destination:'TNCM', departure_time:mkDate(6,30),  arrival_time:mkDate(6,55),  status:'landed',    pax_count:8, max_pax:9, aircraft:'F-OSBC', pilot:'J. Dupont' },
  { id:'2',  flight_number:'PV802', origin:'TNCM', destination:'TFFJ', departure_time:mkDate(7,30),  arrival_time:mkDate(7,55),  status:'landed',    pax_count:9, max_pax:9, aircraft:'F-OSBC', pilot:'J. Dupont' },
  { id:'3',  flight_number:'PV803', origin:'TFFJ', destination:'TFFG', departure_time:mkDate(8,0),   arrival_time:mkDate(8,20),  status:'landed',    pax_count:7, max_pax:9, aircraft:'F-OSBM', pilot:'S. Martin' },
  { id:'4',  flight_number:'PV804', origin:'TFFG', destination:'TFFJ', departure_time:mkDate(9,0),   arrival_time:mkDate(9,20),  status:'in_flight', pax_count:5, max_pax:9, aircraft:'F-OSBM', pilot:'S. Martin' },
  { id:'5',  flight_number:'PV805', origin:'TFFJ', destination:'TNCM', departure_time:mkDate(9,30),  arrival_time:mkDate(9,55),  status:'scheduled', pax_count:6, max_pax:9, aircraft:'F-OSBS', pilot:'C. Leroy'  },
  { id:'6',  flight_number:'PV806', origin:'TNCM', destination:'TFFJ', departure_time:mkDate(10,45), arrival_time:mkDate(11,10), status:'scheduled', pax_count:8, max_pax:9, aircraft:'F-OSBS', pilot:'C. Leroy'  },
  { id:'7',  flight_number:'PV807', origin:'TFFJ', destination:'TFFG', departure_time:mkDate(11,0),  arrival_time:mkDate(11,20), status:'scheduled', pax_count:9, max_pax:9, aircraft:'F-OSJR', pilot:'A. Blanc'  },
  { id:'8',  flight_number:'PV808', origin:'TFFG', destination:'TFFJ', departure_time:mkDate(12,0),  arrival_time:mkDate(12,20), status:'scheduled', pax_count:4, max_pax:9, aircraft:'F-OSJR', pilot:'A. Blanc'  },
  { id:'9',  flight_number:'PV809', origin:'TFFJ', destination:'TNCM', departure_time:mkDate(13,30), arrival_time:mkDate(13,55), status:'scheduled', pax_count:7, max_pax:9, aircraft:'F-OSBC', pilot:'J. Dupont' },
  { id:'10', flight_number:'PV810', origin:'TNCM', destination:'TFFJ', departure_time:mkDate(14,30), arrival_time:mkDate(14,55), status:'scheduled', pax_count:6, max_pax:9, aircraft:'F-OSBM', pilot:'S. Martin' },
  { id:'11', flight_number:'PV811', origin:'TFFJ', destination:'TFFG', departure_time:mkDate(15,30), arrival_time:mkDate(15,50), status:'scheduled', pax_count:5, max_pax:9, aircraft:'F-OSBS', pilot:'C. Leroy'  },
  { id:'12', flight_number:'PV812', origin:'TFFG', destination:'TFFJ', departure_time:mkDate(16,30), arrival_time:mkDate(16,50), status:'scheduled', pax_count:8, max_pax:9, aircraft:'F-OSJR', pilot:'A. Blanc'  },
]

const WEATHER_MOCK = {
  TFFJ: { icao:'TFFJ', name:'Saint-Barthelemy',     temp:28, wind_speed:12, wind_dir:'ENE', wind_deg:70, vis:10, ceiling:null, dewpoint:22, wind_gust:null, status:'VFR',  raw:'TFFJ 271200Z 07012KT 9999 FEW022 28/22 Q1015', updated:new Date() },
  TFFG: { icao:'TFFG', name:'St-Martin Grand Case', temp:29, wind_speed:18, wind_dir:'E',   wind_deg:90, vis:8,  ceiling:null, dewpoint:23, wind_gust:25,   status:'VFR',  raw:'TFFG 271200Z 09018KT 8000 SCT018 29/23 Q1014', updated:new Date() },
  TNCM: { icao:'TNCM', name:'Sint-Maarten Juliana', temp:27, wind_speed:22, wind_dir:'NE',  wind_deg:50, vis:6,  ceiling:1200, dewpoint:24, wind_gust:30,   status:'MVFR', raw:'TNCM 271200Z 05022KT 6000 BKN012 27/24 Q1013', updated:new Date() },
}

// ── Helpers ───────────────────────────────────────────────────
const toDate   = ts => ts?.toDate ? ts.toDate() : new Date(ts)
const fmtTime  = d  => d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
const fmtClock = d  => d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone: SBH_TZ })
const fmtDate  = d  => d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', timeZone: SBH_TZ })

const pctToTime = pct => {
  const totalMins = (GANTT_END - GANTT_START) * 60
  const mins = Math.round(pct * totalMins)
  return { h: GANTT_START + Math.floor(mins / 60), m: mins % 60 }
}

const STATUS_LABEL = { available:'Disponible', in_flight:'En vol', maintenance:'Maintenance' }

// ── Composants atomiques ──────────────────────────────────────

function StatusDot({ status }) {
  const c = { available:'#4ADE80', in_flight:'#F0B429', maintenance:'#F87171' }[status] || '#9CA3AF'
  return (
    <span style={{
      display:'inline-block', width:9, height:9, borderRadius:'50%',
      backgroundColor:c, boxShadow:`0 0 7px ${c}`, flexShrink:0,
    }}/>
  )
}

function KPICard({ label, value, sub, color, icon }) {
  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor:'#112D52', borderColor:'#1E3A5F' }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-black" style={{ color }}>{value}</div>
          <div style={{ color:'#5B8DB8', fontSize:12, marginTop:3 }}>{label}</div>
          {sub && <div style={{ color:'#2D5580', fontSize:10, marginTop:2 }}>{sub}</div>}
        </div>
        <span style={{ fontSize:22, opacity:0.2 }}>{icon}</span>
      </div>
    </div>
  )
}

// ── Carte vol pour le sélecteur DCS ──────────────────────────
function DCSFlightCard({ flight, selected, onSelect }) {
  const depTime  = flight.scheduledDeparture?.toDate?.() || toDate(flight.departure_time)
  const diffMin  = Math.round((depTime - new Date()) / 60000)
  const isUrgent = diffMin > 0 && diffMin < 30
  const isPast   = diffMin < -60

  return (
    <div
      onClick={() => onSelect(flight)}
      style={{
        background: selected ? '#112D52' : '#071729',
        borderRadius:12, padding:'14px 16px',
        border:`2px solid ${selected ? '#F0B429' : isUrgent ? 'rgba(240,180,41,0.3)' : '#1E3A5F'}`,
        cursor:'pointer', transition:'all 0.2s', opacity: isPast ? 0.4 : 1,
      }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ fontSize:16, fontWeight:900, color:'#F1F5F9', letterSpacing:'0.05em' }}>
            {flight.flight_number || flight.flightNumber}
          </div>
          <div style={{ fontSize:12, color:'#5B8DB8', marginTop:2 }}>
            {flight.origin} → {flight.destination}
          </div>
          <div style={{ fontSize:10, color:'#2D5580', marginTop:2 }}>
            {flight.aircraft || flight.registration}
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:18, fontWeight:900, color: isUrgent ? '#F0B429' : '#F1F5F9' }}>
            {fmtTime(depTime)}
          </div>
          <div style={{
            marginTop:4, padding:'2px 8px', borderRadius:999, fontSize:10, fontWeight:700,
            background: isPast ? 'rgba(30,58,95,0.3)' : isUrgent ? 'rgba(240,180,41,0.15)' : 'rgba(59,130,246,0.15)',
            color: isPast ? '#2D5580' : isUrgent ? '#F0B429' : '#93C5FD',
          }}>
            {isPast
              ? 'Parti'
              : isUrgent
                ? `${diffMin} min`
                : diffMin < 0
                  ? 'En cours'
                  : `${Math.floor(diffMin/60)}h${String(diffMin%60).padStart(2,'0')}`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Section DCS embarquée dans le dashboard ───────────────────

function DCSSectionEmbed({ flights }) {
  const [todayFlights,    setTodayFlights]    = useState([])
  const [selectedFlight,  setSelectedFlight]  = useState(null)
  const [dcsTab,          setDcsTab]          = useState('checkin')
  const [wbResult,        setWbResult]        = useState(null)
  const [dcsFullscreen,   setDcsFullscreen]   = useState(false)


  // Vols du jour Firestore (fallback mock)
  useEffect(() => {
    const today    = new Date(); today.setHours(0,0,0,0)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    try {
      const q = query(
        collection(db, 'flight_plans'),
        where('scheduledDeparture', '>=', today),
        where('scheduledDeparture', '<', tomorrow),
        orderBy('scheduledDeparture', 'asc')
      )
      const unsub = onSnapshot(q,
        snap => {
          const data = snap.docs.map(d => ({ id:d.id, ...d.data() }))
          setTodayFlights(data.length > 0 ? data : flights)
        },
        () => setTodayFlights(flights)
      )
      return () => unsub()
    } catch {
      setTodayFlights(flights)
    }
  }, [flights])

  // Auto-sélection prochain vol
  useEffect(() => {
    if (!selectedFlight && todayFlights.length > 0) {
      const now  = new Date()
      const next = todayFlights.find(f => {
        const dep = f.scheduledDeparture?.toDate?.() || toDate(f.departure_time)
        return dep > now
      })
      setSelectedFlight(next || todayFlights[0])
    }
  }, [todayFlights, selectedFlight])

  const DCS_TABS = [
    { id:'checkin', label:'Check-in', icon:'✓' },
    { id:'wb',      label:'W&B',      icon:'⚖' },
  ]

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KPICard label="Vols du jour" value={todayFlights.length}                                                                         color="#FFFFFF" icon="✈"  sub={`${todayFlights.filter(f=>f.status==='landed').length} atterris`}/>
        <KPICard label="En cours"     value={todayFlights.filter(f=>f.status==='in_flight'||f.status==='boarding').length}                 color="#F0B429" icon="🛫" sub="temps reel"/>
        <KPICard label="Programmes"   value={todayFlights.filter(f=>f.status==='scheduled').length}                                        color="#7DD3FC" icon="📋" sub="a venir"/>
        <KPICard label="Total pax"    value={todayFlights.reduce((s,f) => s + (f.pax_count || 0), 0)}                                     color="#4ADE80" icon="👥" sub="aujourd'hui"/>
      </div>

      {/* Layout 2 colonnes : liste vols | zone check-in */}
      <div style={{ display:'grid', gridTemplateColumns:'260px 1fr', gap:20, alignItems:'flex-start' }}>

        {/* Colonne vols */}
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:'#2D5580', letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:10 }}>
            Vols du jour
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:580, overflowY:'auto' }}>
            {todayFlights.length === 0 ? (
              <div style={{ padding:24, textAlign:'center', color:'#2D5580', fontSize:13 }}>
                Aucun vol planifie
              </div>
            ) : todayFlights.map(f => (
              <DCSFlightCard
                key={f.id}
                flight={f}
                selected={selectedFlight?.id === f.id}
                onSelect={setSelectedFlight}
              />
            ))}
          </div>

          {/* Lien plein écran terrain */}
          <a
            href="/dcs"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              marginTop:12, padding:'10px', borderRadius:10,
              backgroundColor:'#F0B429', color:'#0B1F3A',
              fontSize:12, fontWeight:800, textDecoration:'none', letterSpacing:'0.05em',
            }}
          >
            Ouvrir DCS terrain →
          </a>
        </div>

        {/* Zone check-in / W&B */}
        <div style={{ background:'#071729', borderRadius:16, border:'1px solid #1E3A5F', overflow:'hidden' }}>
          {!selectedFlight ? (
            <div style={{ padding:60, textAlign:'center', color:'#2D5580' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🛂</div>
              <div style={{ fontWeight:700, color:'#5B8DB8', fontSize:15 }}>Selectionnez un vol</div>
              <div style={{ fontSize:12, marginTop:6 }}>pour demarrer le check-in</div>
            </div>
          ) : (
            <>
              {/* Tabs + bouton agrandir */}
              <div style={{ display:'flex', borderBottom:'1px solid #1E3A5F', alignItems:'stretch' }}>
                {DCS_TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setDcsTab(t.id)}
                    style={{
                      flex:1, padding:'12px 8px', border:'none', background:'none', cursor:'pointer',
                      borderBottom:`3px solid ${dcsTab===t.id ? '#F0B429' : 'transparent'}`,
                      color: dcsTab===t.id ? '#F0B429' : '#5B8DB8',
                      fontSize:12, fontWeight:700, transition:'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize:15, marginRight:6 }}>{t.icon}</span>{t.label}
                  </button>
                ))}
                {/* Bouton agrandir */}
                <button
                  onClick={() => setDcsFullscreen(true)}
                  title="Agrandir"
                  style={{
                    padding:'0 14px', border:'none', background:'none', cursor:'pointer',
                    borderLeft:'1px solid #1E3A5F', color:'#2D5580', fontSize:16,
                    transition:'color 0.15s', flexShrink:0,
                  }}
                  onMouseEnter={e => e.currentTarget.style.color='#F0B429'}
                  onMouseLeave={e => e.currentTarget.style.color='#2D5580'}
                >
                  ⤢
                </button>
              </div>

              {/* Contenu tabs */}
              <div style={{ maxHeight:620, overflowY:'auto' }}>
                {dcsTab === 'checkin' && <PassengerCheckin flight={selectedFlight}/>}
                {dcsTab === 'wb' && (
                  <WBCalculator
                    initialRegistration={selectedFlight.aircraft || selectedFlight.registration}
                    onResult={setWbResult}
                    flightId={selectedFlight?.id}
                  />
                )}
              </div>

              {/* Badge W&B persistant */}
              {wbResult && dcsTab !== 'wb' && (
                <div style={{
                  padding:'8px 16px', borderTop:'1px solid #1E3A5F',
                  display:'flex', alignItems:'center', gap:8, fontSize:11,
                }}>
                  <span style={{
                    padding:'2px 8px', borderRadius:999, fontWeight:700, fontSize:10,
                    background: wbResult.isValid ? '#dcfce7' : '#fee2e2',
                    color:      wbResult.isValid ? '#16a34a' : '#dc2626',
                  }}>
                    W&B {wbResult.isValid ? 'CONFORME' : 'HORS LIMITES'}
                  </span>
                  <span style={{ color:'#2D5580' }}>
                    TOW: {wbResult.takeoffWeight} kg · CG: {wbResult.takeoffCG?.toFixed(3)} m
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Overlay plein écran DCS ── */}
      {dcsFullscreen && selectedFlight && (
        <>
          {/* Fond */}
          <div
            style={{ position:'fixed', inset:0, backgroundColor:'rgba(7,23,41,0.92)', zIndex:200, backdropFilter:'blur(4px)' }}
            onClick={() => setDcsFullscreen(false)}
          />
          {/* Panel */}
          <div style={{
            position:'fixed', inset:'24px', zIndex:201,
            background:'#071729', borderRadius:20, border:'1px solid #1E3A5F',
            display:'flex', flexDirection:'column', overflow:'hidden',
            boxShadow:'0 32px 80px rgba(0,0,0,0.6)',
          }}>
            {/* Header overlay */}
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'0 20px', borderBottom:'1px solid #1E3A5F', flexShrink:0,
            }}>
              <div style={{ display:'flex', flex:1 }}>
                {DCS_TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setDcsTab(t.id)}
                    style={{
                      padding:'14px 20px', border:'none', background:'none', cursor:'pointer',
                      borderBottom:`3px solid ${dcsTab===t.id ? '#F0B429' : 'transparent'}`,
                      color: dcsTab===t.id ? '#F0B429' : '#5B8DB8',
                      fontSize:13, fontWeight:700, transition:'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize:16, marginRight:6 }}>{t.icon}</span>{t.label}
                  </button>
                ))}
              </div>
              {/* Info vol */}
              <div style={{ padding:'0 20px', textAlign:'center', color:'#5B8DB8', fontSize:12 }}>
                <span style={{ fontWeight:900, color:'#F0B429', marginRight:8 }}>
                  {selectedFlight.flight_number || selectedFlight.flightNumber}
                </span>
                {selectedFlight.origin} → {selectedFlight.destination}
              </div>
              {/* Fermer */}
              <button
                onClick={() => setDcsFullscreen(false)}
                style={{
                  width:36, height:36, borderRadius:'50%', border:'1px solid #1E3A5F',
                  background:'transparent', cursor:'pointer', color:'#5B8DB8',
                  fontSize:18, display:'flex', alignItems:'center', justifyContent:'center',
                  transition:'all 0.15s', flexShrink:0,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#F87171'; e.currentTarget.style.color='#F87171' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='#1E3A5F'; e.currentTarget.style.color='#5B8DB8' }}
              >
                ✕
              </button>
            </div>

            {/* Contenu plein écran */}
            <div style={{ flex:1, overflowY:'auto' }}>
              {dcsTab === 'checkin' && <PassengerCheckin flight={selectedFlight}/>}
              {dcsTab === 'wb' && (
                <WBCalculator
                  initialRegistration={selectedFlight.aircraft || selectedFlight.registration}
                  onResult={setWbResult}
                  flightId={selectedFlight?.id}
                />
              )}
            </div>

            {/* Badge W&B en bas */}
            {wbResult && dcsTab !== 'wb' && (
              <div style={{
                padding:'10px 20px', borderTop:'1px solid #1E3A5F',
                display:'flex', alignItems:'center', gap:10, fontSize:12, flexShrink:0,
              }}>
                <span style={{
                  padding:'3px 10px', borderRadius:999, fontWeight:700, fontSize:11,
                  background: wbResult.isValid ? '#dcfce7' : '#fee2e2',
                  color:      wbResult.isValid ? '#16a34a' : '#dc2626',
                }}>
                  W&B {wbResult.isValid ? '✓ CONFORME' : '✗ HORS LIMITES'}
                </span>
                <span style={{ color:'#2D5580' }}>
                  TOW: {wbResult.takeoffWeight} kg · CG: {wbResult.takeoffCG?.toFixed(3)} m
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Dashboard principal ───────────────────────────────────────
export default function Dashboard() {
  const { user, role, logout } = useAuth()
  const { fleet: fsFleet }     = useAircraft()
  const { flights: fsFlights, kpis: fsKpis } = useFlights()

  const [tab,               setTab]               = useState('dashboard')
  const [liveMapFullscreen, setLiveMapFullscreen]  = useState(false)
  const [time,              setTime]               = useState(new Date())
  const [weather,           setWeather]            = useState(WEATHER_MOCK)
  const [weatherLoading,    setWeatherLoading]     = useState(false)
  const [flightModal,       setFlightModal]        = useState(null)
  const [aircraftModal,     setAircraftModal]      = useState(null)
  const [userMenuOpen,      setUserMenuOpen]       = useState(false)
  const [profileOpen,       setProfileOpen]        = useState(false)
  const userMenuRef = useRef(null)

  const fleet   = fsFleet.length   > 0 ? fsFleet   : MOCK_FLEET
  const flights = fsFlights.length > 0 ? fsFlights : MOCK_FLIGHTS
  const kpis    = fsFlights.length > 0 ? fsKpis : {
    total:     MOCK_FLIGHTS.length,
    completed: MOCK_FLIGHTS.filter(f => f.status === 'landed').length,
    inFlight:  MOCK_FLIGHTS.filter(f => f.status === 'in_flight').length,
    cancelled: MOCK_FLIGHTS.filter(f => f.status === 'cancelled').length,
    totalPax:  MOCK_FLIGHTS.reduce((s, f) => s + f.pax_count, 0),
    fillRate:  Math.round(
      MOCK_FLIGHTS.reduce((s,f) => s + f.pax_count, 0) /
      MOCK_FLIGHTS.reduce((s,f) => s + f.max_pax,   0) * 100
    ),
  }

  useAlertEngine({ fleet, flights, weather, enabled: fleet.length > 0 })

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
          const ceil = d.ceiling?.value    ?? null
          nw[icao] = {
            icao, name: WEATHER_MOCK[icao].name,
            temp:       d.temperature?.value    ?? 0,
            dewpoint:   d.dewpoint?.value       ?? null,
            wind_speed: d.wind_speed?.value     ?? 0,
            wind_gust:  d.wind_gust?.value      ?? null,
            wind_dir:   d.wind_direction?.repr  ?? '--',
            wind_deg:   d.wind_direction?.value ?? null,
            vis, ceiling: ceil,
            status: (vis < 3 || (ceil && ceil < 500))  ? 'IFR'
                  : (vis < 5 || (ceil && ceil < 1000)) ? 'MVFR' : 'VFR',
            raw: d.raw || '', updated: new Date(),
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

  const handleFlightClick  = f => setFlightModal(f)
  const handleCreateFlight = ({ aircraft, hour, minute }) => {
    const dep = new Date(); dep.setHours(hour, minute, 0, 0)
    const arr = new Date(dep.getTime() + 25 * 60_000)
    setFlightModal({ aircraft, departure_time:{ toDate:() => dep }, arrival_time:{ toDate:() => arr } })
  }
  const handleDropFlight = async (flight, newDep, newArr) => {
    if (!flight.id || !fsFlights.length) return
    try { await updateFlight(flight.id, { departure_time:newDep, arrival_time:newArr }) }
    catch(e) { console.error('Drop error:', e) }
  }

  // ── Navigation ────────────────────────────────────────────
  const NAV = [
    { id:'dashboard',  icon:'⊞', label:'Dashboard' },
    {
      id:'planning', icon:'▦', label:'Planning',
      subs:[ { id:'gantt', label:'Gantt' }, { id:'flights', label:'Vols' }, { id:'crew', label:'Equipage' } ],
    },
    {
      id:'fleet', icon:'✈', label:'Flotte',
      subs:[ { id:'aircraft', label:'Appareils' }, { id:'maintenance', label:'Maintenance' } ],
    },
    {
      id:'operations', icon:'🗺', label:'Operations',
      subs:[ { id:'livemap', label:'Live Map' }, { id:'weather', label:'Meteo' } ],
    },
    { id:'dcs',    icon:'🛂', label:'Ops Sol' },
    { id:'alerts', icon:'🔔', label:'Alertes'  },
  ]

  const [subTab, setSubTab] = useState({
    planning:'gantt', fleet:'aircraft', operations:'livemap',
  })

  const setMainTab   = id => setTab(id)
  const setSubTabFor = (section, sub) => {
    setSubTab(s => ({ ...s, [section]: sub }))
    setTab(section)
  }

  const resolveTab = rawTab => {
    const m = {
      overview:'dashboard', gantt:'planning', flights:'planning', crew:'planning',
      fleet:'fleet', maintenance:'fleet', livemap:'operations', weather:'operations',
    }
    return m[rawTab] ? [m[rawTab], rawTab] : [rawTab, null]
  }

  const [_section, _sub] = resolveTab(tab)
  const activeSection = _section
  const activeSub     = _sub ?? subTab[_section] ?? null

  const hasIfrAlert = maintenanceAlerts.length > 0 || Object.values(weather).some(w => w.status === 'IFR')

  // ── Helper sous-nav ───────────────────────────────────────
  const SubNav = ({ items }) => (
    <div style={{ display:'flex', gap:3, padding:'4px', backgroundColor:'rgba(15,39,69,0.8)', borderRadius:12, border:'1px solid #1E3A5F' }}>
      {items.map(t => (
        <button key={t.id} onClick={() => setSubTabFor(activeSection, t.id)} style={{
          padding:'7px 18px', borderRadius:9, fontSize:12, fontWeight:700,
          border:'none', cursor:'pointer', transition:'all 0.15s',
          backgroundColor: activeSub===t.id ? '#F0B429' : 'transparent',
          color:           activeSub===t.id ? '#0B1F3A' : '#5B8DB8',
          boxShadow:       activeSub===t.id ? '0 2px 8px rgba(240,180,41,0.3)' : 'none',
        }}>{t.label}</button>
      ))}
    </div>
  )

  const SectionHeader = ({ title, subItems }) => (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <p style={{ fontSize:10, fontWeight:700, letterSpacing:'0.15em', textTransform:'uppercase', color:'#2D5580', margin:'0 0 4px' }}>
            SBH Commuter
          </p>
          <h1 style={{ fontSize:22, fontWeight:900, color:'#F1F5F9', margin:0, letterSpacing:'-0.02em' }}>{title}</h1>
        </div>
        {subItems && <SubNav items={subItems}/>}
      </div>
      <div style={{ height:1, backgroundColor:'#1E3A5F', marginTop:16 }}/>
    </div>
  )

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor:'#0B1F3A', fontFamily:"'Segoe UI',system-ui,sans-serif" }}>

      <style>{`
        @keyframes navPulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.4;transform:scale(1.6);} }
        @keyframes dropIn   { from{opacity:0;transform:translateY(-6px) scale(0.97);} to{opacity:1;transform:translateY(0) scale(1);} }
        .nav-scroll::-webkit-scrollbar { display:none; }
      `}</style>

      {/* Modales */}
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

      {/* ══ HEADER ══ */}
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor:'#071729', borderColor:'#1E3A5F' }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">

          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <img src="/logo-sbh.png" alt="SBH" className="h-9 w-auto" onError={e => e.target.style.display='none'}/>
            <div>
              <div className="font-black text-white tracking-wide text-base">OpsAir</div>
              <div style={{ color:'#F0B429', fontSize:9, letterSpacing:3, textTransform:'uppercase' }}>SOFTWARE</div>
            </div>
          </div>

          {/* Horloge */}
          <div className="hidden sm:block text-center">
            <div className="font-mono text-xl font-black" style={{ color:'#F0B429' }}>{fmtClock(time)}</div>
            <div className="text-xs capitalize" style={{ color:'#5B8DB8' }}>{fmtDate(time)}</div>
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:'#2D5580', marginTop:1, textTransform:'uppercase' }}>AST · UTC-4</div>
          </div>

          {/* Zone utilisateur */}
          <div className="flex items-center gap-3 shrink-0">

            {/* Cloche alertes */}
            <button onClick={() => setMainTab('alerts')} style={{
              position:'relative', width:36, height:36, borderRadius:'50%',
              border:`1px solid ${hasIfrAlert ? 'rgba(239,68,68,0.5)' : '#1E3A5F'}`,
              backgroundColor: hasIfrAlert ? 'rgba(239,68,68,0.08)' : 'transparent',
              cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <span style={{ fontSize:15 }}>🔔</span>
              {hasIfrAlert && (
                <span style={{
                  position:'absolute', top:5, right:5, width:7, height:7, borderRadius:'50%',
                  backgroundColor:'#EF4444', boxShadow:'0 0 6px #EF4444',
                  animation:'navPulse 1.8s ease-in-out infinite',
                }}/>
              )}
            </button>

            {/* Avatar + dropdown */}
            <div style={{ position:'relative' }} ref={userMenuRef}>
              <button onClick={() => setUserMenuOpen(o => !o)} style={{
                display:'flex', alignItems:'center', gap:9, padding:'5px',
                borderRadius:40,
                border:`1px solid ${userMenuOpen ? '#F0B429' : '#1E3A5F'}`,
                backgroundColor: userMenuOpen ? 'rgba(240,180,41,0.06)' : 'transparent',
                cursor:'pointer', transition:'all 0.15s',
              }}>
                <div style={{
                  width:32, height:32, borderRadius:'50%',
                  background:'linear-gradient(135deg,#1E3A5F 0%,#2D5580 100%)',
                  border:'2px solid #F0B429',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                }}>
                  <span style={{ fontSize:13, fontWeight:900, color:'#F0B429', fontFamily:'monospace' }}>
                    {(user?.email?.[0] || 'U').toUpperCase()}
                  </span>
                </div>
                <span className="hidden sm:block" style={{ fontSize:9, fontWeight:800, color:'#F0B429', letterSpacing:'0.12em', textTransform:'uppercase', paddingRight:4 }}>
                  {role || 'USER'}
                </span>
                <span style={{ fontSize:9, color:'#2D5580', paddingRight:6, transform: userMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform 0.2s' }}>▼</span>
              </button>

              {userMenuOpen && (
                <>
                  <div style={{ position:'fixed', inset:0, zIndex:98 }} onClick={() => setUserMenuOpen(false)}/>
                  <div style={{
                    position:'absolute', top:'calc(100% + 8px)', right:0, zIndex:99, width:220,
                    backgroundColor:'#0A1E36', border:'1px solid #1E3A5F', borderRadius:14,
                    boxShadow:'0 16px 48px rgba(0,0,0,0.5)', overflow:'hidden', animation:'dropIn 0.15s ease-out',
                  }}>
                    <div style={{ padding:'14px 16px 12px', borderBottom:'1px solid #1E3A5F' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{
                          width:38, height:38, borderRadius:'50%',
                          background:'linear-gradient(135deg,#1E3A5F 0%,#2D5580 100%)',
                          border:'2px solid #F0B429',
                          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                        }}>
                          <span style={{ fontSize:15, fontWeight:900, color:'#F0B429', fontFamily:'monospace' }}>
                            {(user?.email?.[0] || 'U').toUpperCase()}
                          </span>
                        </div>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:'#F1F5F9', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {user?.email || 'Utilisateur'}
                          </div>
                          <div style={{ fontSize:9, fontWeight:800, color:'#F0B429', letterSpacing:'0.12em', textTransform:'uppercase', marginTop:2 }}>
                            {role || 'USER'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ padding:'6px 0' }}>
                      {[
                        { icon:'👤', label:'Mon profil',  sub:'Parametres & photo',       action:() => { setUserMenuOpen(false); setProfileOpen(true) } },
                        { icon:'🛂', label:'Ops Sol DCS', sub:'Departure Control System', action:() => { setMainTab('dcs'); setUserMenuOpen(false) } },
                        { icon:'🔔', label:'Alertes',     sub: hasIfrAlert ? 'Alertes actives' : 'Tout est nominal', subColor: hasIfrAlert ? '#F87171' : '#475569', action:() => { setMainTab('alerts'); setUserMenuOpen(false) } },
                      ].map((item, i) => (
                        <button key={i} onClick={item.action} style={{
                          width:'100%', display:'flex', alignItems:'center', gap:11,
                          padding:'9px 16px', border:'none', cursor:'pointer',
                          backgroundColor:'transparent', textAlign:'left', transition:'background 0.1s',
                        }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor='rgba(30,58,95,0.4)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor='transparent'}
                        >
                          <span style={{ fontSize:15, width:20, textAlign:'center', flexShrink:0 }}>{item.icon}</span>
                          <div>
                            <div style={{ fontSize:12, fontWeight:600, color:'#F1F5F9' }}>{item.label}</div>
                            <div style={{ fontSize:10, color: item.subColor || '#475569', marginTop:1 }}>{item.sub}</div>
                          </div>
                        </button>
                      ))}

                      <div style={{ height:1, backgroundColor:'#1E3A5F', margin:'4px 0' }}/>

                      <button onClick={() => { setUserMenuOpen(false); logout() }} style={{
                        width:'100%', display:'flex', alignItems:'center', gap:11,
                        padding:'9px 16px', border:'none', cursor:'pointer',
                        backgroundColor:'transparent', textAlign:'left', transition:'background 0.1s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor='rgba(239,68,68,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor='transparent'}
                      >
                        <span style={{ fontSize:15, width:20, textAlign:'center', flexShrink:0, color:'#EF4444' }}>↩</span>
                        <div>
                          <div style={{ fontSize:12, fontWeight:600, color:'#F87171' }}>Deconnexion</div>
                          <div style={{ fontSize:10, color:'#475569', marginTop:1 }}>Fermer la session</div>
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ══ NAV PRINCIPALE ══ */}
      <nav style={{ backgroundColor:'#071729', borderBottom:'1px solid #1E3A5F', position:'sticky', top:57, zIndex:30 }}>
        <div className="nav-scroll" style={{
          maxWidth:1280, margin:'0 auto',
          display:'flex', alignItems:'stretch',
          overflowX:'auto', WebkitOverflowScrolling:'touch',
          scrollbarWidth:'none', msOverflowStyle:'none',
        }}>
          {NAV.map(item => {
            const isActive = activeSection === item.id
            const alertDot = item.id === 'alerts' && hasIfrAlert && !isActive
            return (
              <button key={item.id} onClick={() => setMainTab(item.id)} style={{
                display:'flex', alignItems:'center', gap:6,
                padding:'0 16px', height:46,
                fontSize:12, fontWeight:700, letterSpacing:'0.04em',
                whiteSpace:'nowrap', flexShrink:0,
                border:'none', cursor:'pointer', position:'relative',
                backgroundColor:'transparent',
                color:        isActive ? '#F0B429' : '#5B8DB8',
                borderBottom:`2px solid ${isActive ? '#F0B429' : 'transparent'}`,
                transition:'color 0.15s, border-color 0.15s',
              }}>
                <span style={{ fontSize:14 }}>{item.icon}</span>
                {item.label}
                {alertDot && (
                  <span style={{
                    position:'absolute', top:9, right:6, width:7, height:7, borderRadius:'50%',
                    backgroundColor:'#EF4444', boxShadow:'0 0 7px #EF4444',
                    animation:'navPulse 1.8s ease-in-out infinite',
                  }}/>
                )}
              </button>
            )
          })}

          {/* Spacer + Audit */}
          <div style={{ flex:1, minWidth:8 }}/>
          <button onClick={() => setMainTab('audit')} style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'0 16px', height:46, fontSize:11, fontWeight:600,
            border:'none', cursor:'pointer', backgroundColor:'transparent',
            color:        activeSection==='audit' ? '#F0B429' : '#2D5580',
            borderBottom:`2px solid ${activeSection==='audit' ? '#F0B429' : 'transparent'}`,
            whiteSpace:'nowrap', flexShrink:0, letterSpacing:'0.04em',
          }}>
            🔍 Audit
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Bandeau alertes maintenance — masqué sur Ops Sol */}
        {maintenanceAlerts.length > 0 && activeSection !== 'alerts' && activeSection !== 'dcs' && (
          <div className="rounded-xl border p-4" style={{ backgroundColor:'rgba(127,29,29,0.12)', borderColor:'rgba(127,29,29,0.6)' }}>
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span className="font-bold text-sm" style={{ color:'#FCA5A5' }}>
                  Alertes maintenance — {maintenanceAlerts.length} appareil{maintenanceAlerts.length > 1 ? 's' : ''}
                </span>
              </div>
              <button onClick={() => setMainTab('alerts')} style={{
                fontSize:10, color:'#F87171', fontWeight:700,
                padding:'3px 10px', borderRadius:6,
                border:'1px solid rgba(127,29,29,0.5)',
                backgroundColor:'rgba(127,29,29,0.15)', cursor:'pointer',
              }}>Voir toutes les alertes →</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {maintenanceAlerts.map(a => {
                const ep = getPotentialPercent(a.engine_hours,   a.engine_limit)
                const ap = getPotentialPercent(a.airframe_hours, a.airframe_limit)
                return (
                  <button key={a.id||a.registration} onClick={() => setAircraftModal(a)}
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5"
                    style={{ backgroundColor:'rgba(0,0,0,0.3)', border:'1px solid rgba(127,29,29,0.5)' }}>
                    <span className="font-mono font-black text-xs text-white">{a.registration}</span>
                    {a.status==='maintenance' && <span className="text-xs px-1.5 rounded" style={{ backgroundColor:'#7F1D1D', color:'#FCA5A5' }}>MAINT.</span>}
                    {ep<=20 && <span className="text-xs px-1.5 rounded" style={{ backgroundColor:'#78350F', color:'#FCD34D' }}>Moteur {ep}%</span>}
                    {ap<=20 && <span className="text-xs px-1.5 rounded" style={{ backgroundColor:'#78350F', color:'#FCD34D' }}>Cellule {ap}%</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════
            1. DASHBOARD
        ═══════════════════════════════════ */}
        {activeSection === 'dashboard' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KPICard label="Vols du jour" value={kpis.total}          color="#FFFFFF" icon="✈"  sub={`${kpis.completed} atterris`}/>
              <KPICard label="En vol"       value={kpis.inFlight}       color="#F0B429" icon="🛫" sub="temps reel"/>
              <KPICard label="Passagers"    value={kpis.totalPax}       color="#7DD3FC" icon="👥" sub="aujourd'hui"/>
              <KPICard label="Remplissage"  value={`${kpis.fillRate}%`} color="#4ADE80" icon="📊" sub={`${kpis.cancelled||0} annule(s)`}/>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 style={{ color:'#5B8DB8', fontSize:10, fontWeight:700, letterSpacing:3, textTransform:'uppercase' }}>Meteo aerodromes</h2>
                {!AVWX_KEY && <span style={{ color:'#F0B429', fontSize:9, padding:'2px 8px', border:'1px solid rgba(240,180,41,0.4)', borderRadius:4 }}>DEMO</span>}
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {Object.values(weather).map(w => <WeatherCard key={w.icao} w={w}/>)}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 style={{ color:'#5B8DB8', fontSize:10, fontWeight:700, letterSpacing:3, textTransform:'uppercase' }}>Prochains vols</h2>
                  <button onClick={() => setSubTabFor('planning','flights')} style={{ color:'#F0B429', fontSize:11 }}>Voir tout →</button>
                </div>
                <div className="space-y-2">
                  {upcomingFlights.length === 0 ? (
                    <div className="rounded-xl border p-4 text-center text-sm" style={{ backgroundColor:'#112D52', borderColor:'#1E3A5F', color:'#2D5580' }}>
                      Aucun vol programme
                    </div>
                  ) : upcomingFlights.map(f => (
                    <button key={f.id} onClick={() => setFlightModal(f)}
                      className="w-full rounded-xl border p-3 text-left"
                      style={{ backgroundColor:'#112D52', borderColor:'#1E3A5F' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs" style={{ color:'#F0B429' }}>{f.flight_number}</span>
                          <span className="text-xs font-bold text-white">
                            {AIRPORTS_FULL[f.origin]?.short} → {AIRPORTS_FULL[f.destination]?.short}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs" style={{ color:'#5B8DB8' }}>{fmtTime(toDate(f.departure_time))}</span>
                          <span className="text-xs" style={{ color:'#5B8DB8' }}>{f.pax_count}/{f.max_pax}</span>
                        </div>
                      </div>
                      <div className="text-xs mt-1" style={{ color:'#2D5580' }}>{f.aircraft} · {f.pilot || 'Pilote N/A'}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 style={{ color:'#5B8DB8', fontSize:10, fontWeight:700, letterSpacing:3, textTransform:'uppercase' }}>Etat flotte</h2>
                  <button onClick={() => setSubTabFor('fleet','aircraft')} style={{ color:'#F0B429', fontSize:11 }}>Voir tout →</button>
                </div>
                <div className="space-y-2">
                  {fleet.map(a => (
                    <button key={a.id||a.registration} onClick={() => setAircraftModal(a)}
                      className="w-full rounded-xl border p-3 text-left"
                      style={{ backgroundColor:'#112D52', borderColor: a.status==='maintenance' ? 'rgba(127,29,29,0.6)' : '#1E3A5F' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StatusDot status={a.status}/>
                          <span className="font-mono font-bold text-xs text-white">{a.registration}</span>
                          <span style={{ color:'#5B8DB8', fontSize:10 }}>{STATUS_LABEL[a.status]}</span>
                        </div>
                        {getPotentialPercent(a.engine_hours, a.engine_limit) <= 20 && (
                          <span className="text-xs px-1.5 rounded" style={{ backgroundColor:'#78350F', color:'#FCD34D' }}>
                            M {getPotentialPercent(a.engine_hours, a.engine_limit)}%
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════
            2. PLANNING
        ═══════════════════════════════════ */}
        {activeSection === 'planning' && (
          <div>
            <SectionHeader
              title="Planning"
              subItems={[
                { id:'gantt',   label:'▦ Gantt'    },
                { id:'flights', label:'≡ Vols'      },
                { id:'crew',    label:'Equipage'    },
              ]}
            />
            {activeSub === 'gantt' && (
              <div className="space-y-4">
                <div className="text-xs capitalize" style={{ color:'#2D5580' }}>{fmtDate(time)}</div>
                <GanttEnhanced
                  flights={flights} fleet={fleet} user={user}
                  onFlightClick={handleFlightClick}
                  onCreateFlight={handleCreateFlight}
                />
              </div>
            )}
            {activeSub === 'flights' && (
              <FlightsPage flights={flights} fleet={fleet} user={user} onCreateFlight={() => setFlightModal({})}/>
            )}
            {activeSub === 'crew' && (
              <CrewPage flights={flights} user={user}/>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════
            3. FLOTTE
        ═══════════════════════════════════ */}
        {activeSection === 'fleet' && (
          <div>
            <SectionHeader
              title="Flotte"
              subItems={[
                { id:'aircraft',    label:'✈ Appareils'   },
                { id:'maintenance', label:'🔧 Maintenance' },
              ]}
            />
            {activeSub === 'aircraft'    && <FleetPage       fleet={fleet} flights={flights} user={user}/>}
            {activeSub === 'maintenance' && <MaintenancePage fleet={fleet} flights={flights} user={user}/>}
          </div>
        )}

        {/* ═══════════════════════════════════
            4. OPERATIONS
        ═══════════════════════════════════ */}
        {activeSection === 'operations' && (
          <div>
            <SectionHeader
              title="Operations"
              subItems={[
                { id:'livemap', label:'🗺 Live Map' },
                { id:'weather', label:'◎ Meteo'    },
              ]}
            />
            {activeSub === 'livemap' && (
              <LiveMap
                flights={flights} fleet={fleet} user={user}
                fullscreen={false}
                onToggleFullscreen={() => setLiveMapFullscreen(true)}
              />
            )}
            {activeSub === 'weather' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-xs" style={{ color:'#2D5580' }}>
                    {AVWX_KEY ? 'Donnees AVWX · Actualisation toutes les 10 min' : 'Donnees de demonstration'}
                  </div>
                  <div className="flex items-center gap-2">
                    {!AVWX_KEY && <span style={{ color:'#F0B429', fontSize:9, padding:'3px 8px', border:'1px solid rgba(240,180,41,0.4)', borderRadius:4 }}>DEMO</span>}
                    <button onClick={fetchWeather} disabled={weatherLoading||!AVWX_KEY}
                      className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-30"
                      style={{ borderColor:'#1E3A5F', color:'#5B8DB8' }}>
                      {weatherLoading ? 'Chargement...' : 'Actualiser'}
                    </button>
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  {Object.values(weather).map(w => <WeatherCard key={w.icao} w={w}/>)}
                </div>
                <div className="rounded-xl border p-4" style={{ backgroundColor:'#112D52', borderColor:'#1E3A5F' }}>
                  <div className="font-bold text-sm text-white mb-3">Regles VFR — DGAC/OSAC</div>
                  <div className="space-y-1.5">
                    {[
                      { code:'VFR',  color:'#4ADE80', desc:'Visibilite > 5km, plafond > 1000ft — Vol autorise' },
                      { code:'MVFR', color:'#F0B429', desc:'Visibilite 3-5km ou plafond 500-1000ft — Decision pilote' },
                      { code:'IFR',  color:'#F87171', desc:'Visibilite < 3km ou plafond < 500ft — Vol non recommande VFR' },
                    ].map(({ code, color, desc }) => (
                      <div key={code} className="flex gap-3 items-center">
                        <span className="font-black w-12 text-sm" style={{ color }}>{code}</span>
                        <span style={{ color:'#5B8DB8', fontSize:12 }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ height:1, backgroundColor:'#1E3A5F' }}/>
                <WeatherForecast flights={flights} weather={weather}/>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════
            5. DCS — OPS SOL
        ═══════════════════════════════════ */}
        {activeSection === 'dcs' && (
          <div>
            <div style={{ marginBottom:24 }}>
              <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
                <div>
                  <p style={{ fontSize:10, fontWeight:700, letterSpacing:'0.15em', textTransform:'uppercase', color:'#2D5580', margin:'0 0 4px' }}>SBH Commuter</p>
                  <h1 style={{ fontSize:22, fontWeight:900, color:'#F1F5F9', margin:0, letterSpacing:'-0.02em' }}>Ops Sol — DCS</h1>
                </div>
                <a href="/dcs" target="_blank" rel="noopener noreferrer" style={{
                  display:'flex', alignItems:'center', gap:6,
                  padding:'8px 16px', borderRadius:10,
                  backgroundColor:'#F0B429', color:'#0B1F3A',
                  fontSize:12, fontWeight:800, textDecoration:'none', letterSpacing:'0.05em',
                }}>
                  🛂 Ouvrir DCS terrain →
                </a>
              </div>
              <div style={{ height:1, backgroundColor:'#1E3A5F', marginTop:16 }}/>
            </div>
            <DCSSectionEmbed flights={flights}/>
          </div>
        )}

        {/* ═══════════════════════════════════
            6. ALERTES
        ═══════════════════════════════════ */}
        {activeSection === 'alerts' && (
          <div className="rounded-xl border p-5" style={{ backgroundColor:'#071729', borderColor:'#1E3A5F', minHeight:400 }}>
            <SmartAlertsPanel userId={user?.uid}/>
          </div>
        )}

      </main>

      {/* Profil */}
      {profileOpen && <ProfilePage onClose={() => setProfileOpen(false)}/>}

      {/* Live Map plein écran */}
      {liveMapFullscreen && (
        <div style={{ position:'fixed', inset:0, zIndex:500, backgroundColor:'#071118', display:'flex', flexDirection:'column' }}>
          <LiveMap
            flights={flights} fleet={fleet} user={user}
            fullscreen={true}
            onToggleFullscreen={() => setLiveMapFullscreen(false)}
          />
        </div>
      )}

      <footer className="border-t mt-12 py-4 text-center" style={{ borderColor:'#1E3A5F' }}>
        <span style={{ color:'#1E3A5F', fontSize:10, letterSpacing:1 }}>
          SKYBH v3.0 · SBH Commuter · FR.AOC.0033 · DGAC/OSAC · EASA Part-145
        </span>
      </footer>
    </div>
  )
}