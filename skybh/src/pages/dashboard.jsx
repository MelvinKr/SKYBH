import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { useAircraft } from '../hooks/useAircraft'
import { useFlights } from '../hooks/useFlights'
import { getPotentialPercent, getAlertLevel } from '../services/aircraft'
import { updateFlight, addFlight, AIRPORTS_FULL } from '../services/flights'
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
import FlightCreationModal from '../components/gantt/flight-creation-modal'

// ── Config ─────────────────────────────────────────────────────────────────
const AVWX_KEY = import.meta.env.VITE_AVWX_API_KEY || ''
const SBH_TZ   = 'America/St_Barthelemy'

// ── Mock data ───────────────────────────────────────────────────────────────
const mkDate = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return { toDate: () => d } }

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
]

const WEATHER_MOCK = {
  TFFJ: { icao:'TFFJ', name:'Saint-Barth',   temp:28, wind_speed:12, wind_dir:'ENE', wind_deg:70,  vis:10, ceiling:null, dewpoint:22, wind_gust:null, status:'VFR',  raw:'TFFJ 271200Z 07012KT 9999 FEW022 28/22 Q1015', updated:new Date() },
  TFFG: { icao:'TFFG', name:'Grand Case',    temp:29, wind_speed:18, wind_dir:'E',   wind_deg:90,  vis:8,  ceiling:null, dewpoint:23, wind_gust:25,   status:'VFR',  raw:'TFFG 271200Z 09018KT 8000 SCT018 29/23 Q1014', updated:new Date() },
  TNCM: { icao:'TNCM', name:'Sint-Maarten',  temp:27, wind_speed:22, wind_dir:'NE',  wind_deg:50,  vis:6,  ceiling:1200, dewpoint:24, wind_gust:30,   status:'MVFR', raw:'TNCM 271200Z 05022KT 6000 BKN012 27/24 Q1013', updated:new Date() },
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const toDate   = ts  => ts?.toDate ? ts.toDate() : new Date(ts)
const fmtTime  = d   => d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
const fmtClock = d   => d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone:SBH_TZ })
const fmtDate  = d   => d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', timeZone:SBH_TZ })
const fmtDateShort = d => d.toLocaleDateString('fr-FR', { day:'numeric', month:'short', timeZone:SBH_TZ })

function computeRealtimeStatus(flight) {
  const now = new Date()
  const dep = flight.departure_time?.toDate?.() || (flight.departure_time instanceof Date ? flight.departure_time : null)
  const arr = flight.arrival_time?.toDate?.()   || (flight.arrival_time  instanceof Date ? flight.arrival_time  : null)
  if (!dep) return flight.status || 'scheduled'
  if (flight.status === 'cancelled') return 'cancelled'
  if (flight.status === 'landed')    return 'landed'
  const diffDepMin = (dep - now) / 60000
  const diffArrMin = arr ? (arr - now) / 60000 : null
  if (diffArrMin !== null && diffArrMin < 0 && diffDepMin < 0) return 'landed'
  if (diffDepMin < 0 && (diffArrMin === null || diffArrMin > 0)) return 'in_flight'
  if (diffDepMin >= 0 && diffDepMin <= 20) return 'boarding'
  return 'scheduled'
}

function normalizeFlight(flight) {
  return {
    ...flight,
    flightNumber:       flight.flight_number  || flight.flightNumber  || '',
    registration:       flight.aircraft       || flight.registration  || '',
    origin:             flight.origin         || '',
    destination:        flight.destination    || '',
    scheduledDeparture: flight.departure_time || flight.scheduledDeparture || null,
    scheduledArrival:   flight.arrival_time   || flight.scheduledArrival   || null,
    status: computeRealtimeStatus(flight),
  }
}

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:         '#060D1A',
  bgPanel:    '#0A1525',
  bgCard:     '#0D1C30',
  border:     '#112038',
  borderHi:   '#1A3356',
  gold:       '#D4A843',
  goldDim:    '#7A5E20',
  blue:       '#2A6ADB',
  blueLight:  '#5B9EFF',
  text:       '#C8D8EE',
  textDim:    '#4A6480',
  textFaint:  '#1E3050',
  green:      '#2ECC8A',
  red:        '#E05050',
  amber:      '#E8963C',
}

const STATUS_STYLE = {
  landed:    { dot:'#2ECC8A', label:'Atterri',      bg:'rgba(46,204,138,0.08)',  border:'rgba(46,204,138,0.2)'  },
  in_flight: { dot:'#D4A843', label:'En vol',        bg:'rgba(212,168,67,0.1)',   border:'rgba(212,168,67,0.25)' },
  boarding:  { dot:'#E8963C', label:'Embarquement',  bg:'rgba(232,150,60,0.1)',   border:'rgba(232,150,60,0.3)'  },
  scheduled: { dot:'#2A6ADB', label:'Programmé',     bg:'rgba(42,106,219,0.08)',  border:'rgba(42,106,219,0.2)'  },
  cancelled: { dot:'#E05050', label:'Annulé',        bg:'rgba(224,80,80,0.06)',   border:'rgba(224,80,80,0.15)'  },
}

// ── Micro-composants ─────────────────────────────────────────────────────────

function Dot({ color, pulse }) {
  return (
    <span style={{ position:'relative', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <span style={{ width:7, height:7, borderRadius:'50%', backgroundColor:color, boxShadow:`0 0 6px ${color}`, display:'block' }}/>
      {pulse && <span style={{
        position:'absolute', width:13, height:13, borderRadius:'50%',
        border:`1px solid ${color}`, opacity:0.4,
        animation:'ripple 2s ease-out infinite',
      }}/>}
    </span>
  )
}

function Tag({ children, color = C.textDim, bg = 'transparent', border }) {
  return (
    <span style={{
      fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase',
      padding:'2px 7px', borderRadius:3,
      color, backgroundColor:bg, border:`1px solid ${border || color}`,
    }}>{children}</span>
  )
}

function Divider() {
  return <div style={{ height:1, backgroundColor:C.border, margin:'0' }}/>
}

// ── KPI Strip ───────────────────────────────────────────────────────────────
function KPIStrip({ kpis, flights }) {
  const inFlightFlights = flights.filter(f => computeRealtimeStatus(f) === 'in_flight')
  const boardingFlights = flights.filter(f => computeRealtimeStatus(f) === 'boarding')
  const stats = [
    {
      label: 'VOLS AUJOURD\'HUI',
      value: kpis.total,
      color: C.text,
      sub: `${kpis.completed || 0} atterris · ${kpis.cancelled || 0} annulés`,
      accent: C.borderHi,
    },
    {
      label: 'EN VOL',
      value: kpis.inFlight || 0,
      color: kpis.inFlight > 0 ? C.gold : C.textDim,
      sub: boardingFlights.length > 0 ? `${boardingFlights.length} en embarquement` : 'aucun en cours',
      pulse: kpis.inFlight > 0,
      accent: kpis.inFlight > 0 ? C.gold : C.borderHi,
      detail: inFlightFlights.map(f => f.flight_number).join(' · ') || null,
    },
    {
      label: 'PAX TOTAL',
      value: kpis.totalPax || 0,
      color: C.blueLight,
      sub: `${flights.filter(f=>computeRealtimeStatus(f)==='scheduled').length} vol(s) restant(s)`,
      accent: C.borderHi,
    },
    {
      label: 'REMPLISSAGE',
      value: `${kpis.fillRate || 0}%`,
      color: (kpis.fillRate||0) >= 80 ? C.green : (kpis.fillRate||0) >= 50 ? C.amber : C.textDim,
      sub: (() => {
        const totalPax  = flights.reduce((s,f) => s + (f.pax_count||0), 0)
        const totalSeats= flights.reduce((s,f) => s + (f.max_pax||9), 0)
        return `${totalPax} / ${totalSeats} sièges`
      })(),
      accent: (kpis.fillRate||0) >= 80 ? C.green : (kpis.fillRate||0) >= 50 ? C.amber : C.borderHi,
      bar: kpis.fillRate || 0,
    },
  ]
  return (
    <div className="kpi-strip" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:1, backgroundColor:C.border, flexShrink:0 }}>
      {stats.map((s, i) => (
        <div key={i} style={{
          backgroundColor: s.pulse ? 'rgba(212,168,67,0.04)' : C.bgPanel,
          padding:'10px 16px', position:'relative', overflow:'hidden',
        }}>
          {/* Accent top border */}
          <div style={{ position:'absolute', top:0, left:0, right:0, height:2, backgroundColor:s.accent }}/>

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
            <div style={{ fontSize:8, fontWeight:700, letterSpacing:'0.15em', color:C.textDim }}>{s.label}</div>
            {s.pulse && <Dot color={C.gold} pulse/>}
          </div>

          <div style={{ fontSize:22, fontWeight:900, color:s.color, fontFamily:'monospace', lineHeight:1 }}>
            {s.value}
          </div>

          {/* Barre remplissage inline */}
          {s.bar !== undefined && (
            <div style={{ margin:'6px 0 4px', height:2, backgroundColor:C.border, borderRadius:1, overflow:'hidden' }}>
              <div style={{
                height:'100%', borderRadius:1, transition:'width 0.6s',
                width:`${s.bar}%`,
                backgroundColor: s.bar >= 80 ? C.green : s.bar >= 50 ? C.amber : C.blueLight,
              }}/>
            </div>
          )}

          <div style={{ fontSize:9, color:C.textFaint, marginTop: s.bar !== undefined ? 0 : 4, lineHeight:1.3 }}>{s.sub}</div>
          {s.detail && (
            <div style={{ fontSize:9, color:C.gold, marginTop:2, fontFamily:'monospace', letterSpacing:'0.05em' }}>{s.detail}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Flight Row ───────────────────────────────────────────────────────────────
function FlightRow({ flight, onClick, compact }) {
  const dep    = toDate(flight.departure_time)
  const arr    = toDate(flight.arrival_time)
  const status = computeRealtimeStatus(flight)
  const ss     = STATUS_STYLE[status] || STATUS_STYLE.scheduled
  const orig   = AIRPORTS_FULL[flight.origin]?.short    || flight.origin
  const dest   = AIRPORTS_FULL[flight.destination]?.short || flight.destination
  const dur    = arr ? Math.round((arr - dep) / 60000) : null

  return (
    <div onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:12,
      padding: compact ? '8px 16px' : '10px 16px',
      cursor:'pointer', transition:'background 0.15s',
      borderBottom:`1px solid ${C.border}`,
    }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
    >
      <Dot color={ss.dot} pulse={status === 'in_flight'}/>

      <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:800, color:C.gold, minWidth:52 }}>
        {flight.flight_number}
      </span>

      <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:0 }}>
        <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{orig}</span>
        <span style={{ color:C.textFaint, fontSize:10 }}>→</span>
        <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{dest}</span>
        {dur && <span style={{ fontSize:9, color:C.textDim }}>{dur}′</span>}
      </div>

      <span style={{ fontFamily:'monospace', fontSize:11, color:C.textDim, minWidth:40, textAlign:'right' }}>
        {fmtTime(dep)}
      </span>

      <span style={{
        fontSize:9, fontWeight:700, letterSpacing:'0.08em', padding:'2px 8px', borderRadius:3,
        color:ss.dot, backgroundColor:ss.bg, border:`1px solid ${ss.border}`,
        minWidth:80, textAlign:'center',
      }}>
        {ss.label.toUpperCase()}
      </span>

      {!compact && (
        <span style={{ fontSize:10, color:C.textDim, minWidth:70, textAlign:'right' }}>
          {flight.aircraft}
        </span>
      )}
    </div>
  )
}

// ── Aircraft Row ─────────────────────────────────────────────────────────────
function AircraftRow({ aircraft, onClick }) {
  const ep = getPotentialPercent(aircraft.engine_hours, aircraft.engine_limit)
  const ap = getPotentialPercent(aircraft.airframe_hours, aircraft.airframe_limit)
  const minPot      = Math.min(ep, ap)
  const statusColor = aircraft.status === 'maintenance' ? C.red : aircraft.status === 'in_flight' ? C.gold : C.green
  const alertLevel  = minPot <= 10 ? 'critical' : minPot <= 20 ? 'warning' : null
  const shortType   = aircraft.type?.includes('EX') ? '208B EX' : '208B'
  const epColor     = ep <= 10 ? C.red : ep <= 20 ? C.amber : C.green
  const apColor     = ap <= 10 ? C.red : ap <= 20 ? C.amber : C.blueLight

  return (
    <div onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:10, padding:'8px 16px',
      cursor:'pointer', transition:'background 0.15s', borderBottom:`1px solid ${C.border}`,
    }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.025)'}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
    >
      <Dot color={statusColor}/>

      {/* Immatriculation + type */}
      <div style={{ minWidth:68 }}>
        <div style={{ fontFamily:'monospace', fontSize:11, fontWeight:800, color:C.text, letterSpacing:'0.04em' }}>
          {aircraft.registration.replace('F-','')}
        </div>
        <div style={{ fontSize:8, color:C.textFaint, marginTop:1 }}>{shortType}</div>
      </div>

      {/* Barres superposées M / C */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:3 }}>
        {/* Moteur — barre fine + label inline */}
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ fontSize:8, fontWeight:800, color:epColor, width:8, flexShrink:0 }}>M</span>
          <div style={{ flex:1, height:3, backgroundColor:C.border, borderRadius:2, overflow:'hidden' }}>
            <div style={{
              height:'100%', width:`${ep}%`, borderRadius:2,
              backgroundColor:epColor, transition:'width 0.5s',
            }}/>
          </div>
          <span style={{ fontSize:9, fontFamily:'monospace', color:epColor, width:28, textAlign:'right', flexShrink:0 }}>
            {ep}%
          </span>
        </div>
        {/* Cellule */}
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ fontSize:8, fontWeight:800, color:apColor, width:8, flexShrink:0 }}>C</span>
          <div style={{ flex:1, height:3, backgroundColor:C.border, borderRadius:2, overflow:'hidden' }}>
            <div style={{
              height:'100%', width:`${ap}%`, borderRadius:2,
              backgroundColor:apColor, transition:'width 0.5s',
            }}/>
          </div>
          <span style={{ fontSize:9, fontFamily:'monospace', color:apColor, width:28, textAlign:'right', flexShrink:0 }}>
            {ap}%
          </span>
        </div>
      </div>

      {/* Badge statut */}
      <div style={{ minWidth:52, textAlign:'right', flexShrink:0 }}>
        {aircraft.status === 'maintenance' ? (
          <Tag color={C.red} border={C.red}>MAINT</Tag>
        ) : alertLevel === 'critical' ? (
          <Tag color={C.red} border={C.red}>⚠ CRIT</Tag>
        ) : alertLevel === 'warning' ? (
          <Tag color={C.amber} border={C.amber}>⚠ WARN</Tag>
        ) : (
          <Tag color={C.textFaint} border={C.borderHi}>OK</Tag>
        )}
      </div>
    </div>
  )
}

// ── Weather Pill ─────────────────────────────────────────────────────────────
function WeatherPill({ w }) {
  const statusColor = { VFR:C.green, MVFR:C.amber, IFR:C.red }[w.status] || C.textDim
  const statusBg    = { VFR:'rgba(46,204,138,0.07)', MVFR:'rgba(232,150,60,0.08)', IFR:'rgba(224,80,80,0.08)' }[w.status] || 'transparent'
  const windStr     = w.wind_gust ? `${w.wind_speed}G${w.wind_gust}kt` : `${w.wind_speed}kt`
  const updatedAgo  = w.updated ? Math.round((Date.now() - w.updated) / 60000) : null

  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, padding:'9px 16px',
      borderBottom:`1px solid ${C.border}`,
      borderLeft:`2px solid ${statusColor}`,
      backgroundColor: statusBg,
      transition:'background 0.2s',
    }}>
      {/* ICAO + nom */}
      <div style={{ minWidth:80 }}>
        <span style={{ fontSize:11, fontWeight:800, color:C.text, fontFamily:'monospace', letterSpacing:'0.04em' }}>{w.icao}</span>
        <div style={{ fontSize:9, color:C.textDim, marginTop:1 }}>{w.name}</div>
      </div>

      {/* Données météo */}
      <div style={{ flex:1, display:'flex', gap:14, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:12, fontFamily:'monospace', fontWeight:700, color:C.text }}>{w.temp}°C</span>
        <span style={{ fontSize:10, color:C.textDim }}>{w.wind_dir} {windStr}</span>
        {w.ceiling && (
          <span style={{ fontSize:9, color:C.amber }}>☁ {w.ceiling}ft</span>
        )}
        {w.vis && w.vis < 10 && (
          <span style={{ fontSize:9, color:w.vis < 5 ? C.red : C.amber }}>👁 {w.vis}km</span>
        )}
      </div>

      {/* Statut + heure */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
        <Tag color={statusColor}>{w.status}</Tag>
        {updatedAgo !== null && (
          <span style={{ fontSize:8, color:C.textFaint }}>{updatedAgo === 0 ? 'à l\'instant' : `${updatedAgo} min`}</span>
        )}
      </div>
    </div>
  )
}

// ── Panel (boîte réutilisable) ────────────────────────────────────────────────
function Panel({ title, label, action, onAction, children, style }) {
  return (
    <div style={{
      backgroundColor:C.bgPanel, border:`1px solid ${C.border}`,
      display:'flex', flexDirection:'column', ...style,
    }}>
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 16px', borderBottom:`1px solid ${C.border}`,
        flexShrink:0,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {label && <Tag color={C.goldDim} bg='rgba(212,168,67,0.06)' border='rgba(212,168,67,0.2)'>{label}</Tag>}
          <span style={{ fontSize:11, fontWeight:700, color:C.text, letterSpacing:'0.05em' }}>{title}</span>
        </div>
        {onAction && (
          <button onClick={onAction} style={{
            fontSize:10, color:C.gold, background:'none', border:'none', cursor:'pointer',
            letterSpacing:'0.05em', padding:0,
          }}>{action || 'Voir tout →'}</button>
        )}
      </div>
      <div style={{ flex:1, overflow:'hidden' }}>{children}</div>
    </div>
  )
}

// ── DCS Flight Card ───────────────────────────────────────────────────────────
function DCSFlightCard({ flight, selected, onSelect }) {
  const dep    = toDate(flight.departure_time)
  const arr    = flight.arrival_time ? toDate(flight.arrival_time) : null
  const now    = new Date()
  const status = computeRealtimeStatus(flight)
  const ss     = STATUS_STYLE[status] || STATUS_STYLE.scheduled
  const diffMin = Math.round((dep - now) / 60000)

  const fmtT = d => d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', timeZone:SBH_TZ })

  return (
    <div onClick={() => onSelect(normalizeFlight(flight))} style={{
      padding:'11px 14px', cursor:'pointer', transition:'all 0.15s',
      borderLeft:`2px solid ${selected ? C.gold : ss.dot}`,
      backgroundColor: selected ? 'rgba(212,168,67,0.06)' : 'transparent',
      borderBottom:`1px solid ${C.border}`,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
            <Dot color={ss.dot} pulse={status === 'in_flight'}/>
            <span style={{ fontFamily:'monospace', fontSize:13, fontWeight:900, color:C.gold }}>
              {flight.flight_number || flight.flightNumber}
            </span>
          </div>
          <div style={{ fontSize:10, color:C.textDim, paddingLeft:16 }}>
            {flight.origin} → {flight.destination}
          </div>
          <div style={{ fontSize:9, color:C.textFaint, paddingLeft:16, marginTop:1 }}>
            {flight.aircraft || flight.registration}
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:'monospace', fontSize:16, fontWeight:900, color: status==='in_flight' ? C.gold : C.text }}>
            {fmtT(dep)}
          </div>
          <div style={{
            marginTop:4, padding:'2px 8px', borderRadius:2,
            fontSize:9, fontWeight:800, letterSpacing:'0.08em',
            color:ss.dot, backgroundColor:ss.bg, border:`1px solid ${ss.border}`,
          }}>
            {diffMin > 0 && diffMin < 60 ? `${diffMin} min` : ss.label.toUpperCase()}
          </div>
        </div>
      </div>
      {status === 'in_flight' && arr && (
        <div style={{ marginTop:8, paddingLeft:16 }}>
          <div style={{ height:2, background:C.border, borderRadius:1, overflow:'hidden' }}>
            <div style={{
              height:'100%', borderRadius:1,
              background:`linear-gradient(90deg, ${C.gold}, ${C.green})`,
              width:`${Math.min(100, Math.max(0, ((now-dep)/(arr-dep))*100))}%`,
            }}/>
          </div>
        </div>
      )}
    </div>
  )
}

// ── DCS Section ──────────────────────────────────────────────────────────────
function DCSSectionEmbed({ flights }) {
  const [selectedFlight, setSelectedFlight] = useState(null)
  const [dcsTab,         setDcsTab]         = useState('checkin')
  const [wbResult,       setWbResult]       = useState(null)
  const [dcsFullscreen,  setDcsFullscreen]  = useState(false)
  const [now,            setNow]            = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const todayFlights = useMemo(() =>
    [...flights]
      .map(f => ({ ...f, _rs: computeRealtimeStatus(f) }))
      .sort((a, b) => {
        const da = a.departure_time?.toDate?.() || new Date(0)
        const db_ = b.departure_time?.toDate?.() || new Date(0)
        return da - db_
      }),
    [flights, now]
  )

  useEffect(() => {
    if (todayFlights.length === 0) return
    if (selectedFlight) {
      const updated = todayFlights.find(f => f.id === selectedFlight.id)
      if (updated) setSelectedFlight(normalizeFlight(updated))
      return
    }
    const priority = todayFlights.find(f => ['boarding','in_flight'].includes(computeRealtimeStatus(f)))
      || todayFlights.find(f => computeRealtimeStatus(f) === 'scheduled')
      || todayFlights[0]
    if (priority) setSelectedFlight(normalizeFlight(priority))
  }, [todayFlights])

  const kpis = useMemo(() => ({
    total:      todayFlights.length,
    enCours:    todayFlights.filter(f => ['in_flight','boarding'].includes(f._rs)).length,
    programmes: todayFlights.filter(f => f._rs === 'scheduled').length,
    totalPax:   todayFlights.reduce((s,f) => s + (f.pax_count || 0), 0),
  }), [todayFlights])

  const DCS_TABS = [
    { id:'checkin', label:'CHECK-IN', icon:'✓' },
    { id:'wb',      label:'W & B',   icon:'⚖' },
  ]

  const CheckinPanel = () => (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        {DCS_TABS.map(t => (
          <button key={t.id} onClick={() => setDcsTab(t.id)} style={{
            flex:1, padding:'10px', border:'none', background:'none', cursor:'pointer',
            borderBottom:`2px solid ${dcsTab===t.id ? C.gold : 'transparent'}`,
            color: dcsTab===t.id ? C.gold : C.textDim,
            fontSize:10, fontWeight:800, letterSpacing:'0.1em',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
        <button onClick={() => setDcsFullscreen(true)} style={{
          padding:'0 14px', border:'none', background:'none',
          borderLeft:`1px solid ${C.border}`, color:C.textFaint,
          cursor:'pointer', fontSize:14, flexShrink:0,
        }}
          onMouseEnter={e => e.currentTarget.style.color=C.gold}
          onMouseLeave={e => e.currentTarget.style.color=C.textFaint}
        >⤢</button>
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {dcsTab === 'checkin' && <PassengerCheckin flight={selectedFlight}/>}
        {dcsTab === 'wb' && (
          <WBCalculator
            initialRegistration={selectedFlight?.registration || selectedFlight?.aircraft}
            onResult={setWbResult}
            flightId={selectedFlight?.id}
          />
        )}
      </div>
      {wbResult && dcsTab !== 'wb' && (
        <div style={{
          padding:'8px 16px', borderTop:`1px solid ${C.border}`,
          display:'flex', alignItems:'center', gap:8, fontSize:10, flexShrink:0,
        }}>
          <Tag color={wbResult.isValid ? C.green : C.red} border={wbResult.isValid ? C.green : C.red}>
            W&B {wbResult.isValid ? '✓ CONFORME' : '✗ HORS LIMITES'}
          </Tag>
          <span style={{ color:C.textDim }}>TOW: {wbResult.takeoffWeight} kg · CG: {wbResult.takeoffCG?.toFixed(3)} m</span>
        </div>
      )}
    </div>
  )

  return (
    <div>
      {/* KPI bar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:1, backgroundColor:C.border, marginBottom:1 }}>
        {[
          { l:'VOLS', v:kpis.total,      c:C.text },
          { l:'EN COURS', v:kpis.enCours,c:C.gold },
          { l:'PROGRAMMÉS', v:kpis.programmes, c:C.blueLight },
          { l:'PAX', v:kpis.totalPax,    c:C.green },
        ].map((k,i) => (
          <div key={i} style={{ backgroundColor:C.bgPanel, padding:'10px 14px' }}>
            <div style={{ fontSize:8, fontWeight:700, letterSpacing:'0.15em', color:C.textDim }}>{k.l}</div>
            <div style={{ fontSize:22, fontWeight:900, fontFamily:'monospace', color:k.c, marginTop:2 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Layout */}
      <div style={{ display:'grid', gridTemplateColumns:'240px 1fr', gap:1, backgroundColor:C.border }}>
        {/* Liste vols */}
        <div style={{ backgroundColor:C.bgPanel, overflowY:'auto', maxHeight:600 }}>
          <div style={{ padding:'8px 16px', borderBottom:`1px solid ${C.border}` }}>
            <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.15em', color:C.textDim }}>VOLS · AST</span>
          </div>
          {todayFlights.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:C.textFaint, fontSize:12 }}>Aucun vol planifié</div>
          ) : todayFlights.map(f => (
            <DCSFlightCard key={f.id} flight={f} selected={selectedFlight?.id === f.id} onSelect={setSelectedFlight}/>
          ))}
          <a href="/dcs" target="_blank" rel="noopener noreferrer" style={{
            display:'block', margin:12, padding:'9px',
            textAlign:'center', borderRadius:4,
            backgroundColor:C.gold, color:'#06080F',
            fontSize:10, fontWeight:900, textDecoration:'none', letterSpacing:'0.08em',
          }}>
            OUVRIR DCS TERRAIN →
          </a>
        </div>

        {/* Zone check-in */}
        <div style={{ backgroundColor:C.bgPanel }}>
          {!selectedFlight ? (
            <div style={{ height:300, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:C.textFaint }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🛂</div>
              <div style={{ fontWeight:700, fontSize:13, color:C.textDim }}>Sélectionner un vol</div>
              <div style={{ fontSize:11, marginTop:4 }}>pour démarrer le check-in</div>
            </div>
          ) : <CheckinPanel/>}
        </div>
      </div>

      {/* Plein écran */}
      {dcsFullscreen && selectedFlight && (
        <>
          <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.85)', zIndex:200 }} onClick={() => setDcsFullscreen(false)}/>
          <div style={{
            position:'fixed', inset:24, zIndex:201,
            backgroundColor:C.bgPanel, border:`1px solid ${C.borderHi}`,
            display:'flex', flexDirection:'column', overflow:'hidden',
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
              <div style={{ display:'flex', flex:1 }}>
                {DCS_TABS.map(t => (
                  <button key={t.id} onClick={() => setDcsTab(t.id)} style={{
                    padding:'14px 20px', border:'none', background:'none', cursor:'pointer',
                    borderBottom:`2px solid ${dcsTab===t.id ? C.gold : 'transparent'}`,
                    color: dcsTab===t.id ? C.gold : C.textDim,
                    fontSize:11, fontWeight:800, letterSpacing:'0.08em',
                  }}>{t.icon} {t.label}</button>
                ))}
              </div>
              <span style={{ fontSize:11, color:C.textDim, marginRight:16 }}>
                <span style={{ fontFamily:'monospace', fontWeight:900, color:C.gold }}>{selectedFlight.flightNumber || selectedFlight.flight_number}</span>
                {' · '}{selectedFlight.origin} → {selectedFlight.destination}
              </span>
              <button onClick={() => setDcsFullscreen(false)} style={{
                width:32, height:32, border:`1px solid ${C.border}`, borderRadius:2,
                background:'transparent', cursor:'pointer', color:C.textDim, fontSize:16,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>✕</button>
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {dcsTab === 'checkin' && <PassengerCheckin flight={selectedFlight}/>}
              {dcsTab === 'wb' && (
                <WBCalculator
                  initialRegistration={selectedFlight?.registration || selectedFlight?.aircraft}
                  onResult={setWbResult}
                  flightId={selectedFlight?.id}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── SIDEBAR NAV ───────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id:'dashboard',  icon:'⊞',  label:'Vue d\'ensemble' },
  { id:'planning',   icon:'▦',  label:'Planning',    subs:[{id:'gantt',label:'Gantt'},{id:'flights',label:'Vols'},{id:'crew',label:'Équipage'}] },
  { id:'fleet',      icon:'✈',  label:'Flotte',      subs:[{id:'aircraft',label:'Appareils'},{id:'maintenance',label:'Maintenance'}] },
  { id:'operations', icon:'◉',  label:'Opérations',  subs:[{id:'livemap',label:'Live Map'},{id:'weather',label:'Météo'}] },
  { id:'dcs',        icon:'🛂', label:'Ops Sol' },
  { id:'alerts',     icon:'◬',  label:'Alertes' },
]

function Sidebar({ activeSection, activeSub, onNav, onSubNav, hasAlert, user, role, onProfile, onLogout }) {
  const [collapsed, setCollapsed] = useState(false)
  const [expanded,  setExpanded]  = useState({})

  const toggle = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  return (
    <aside className="sidebar-full" style={{
      width: collapsed ? 52 : 200, flexShrink:0, transition:'width 0.2s',
      backgroundColor:C.bgPanel, borderRight:`1px solid ${C.border}`,
      display:'flex', flexDirection:'column',
      position:'sticky', top:0, height:'100vh', zIndex:50, overflow:'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding: collapsed ? '16px 0' : '16px 14px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <div style={{
            width:28, height:28, borderRadius:3, flexShrink:0,
            background:`linear-gradient(135deg, ${C.gold} 0%, #8A6020 100%)`,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily:'monospace', fontSize:12, fontWeight:900, color:'#06080F',
          }}>O</div>
          <div className="sidebar-logo-text" style={{ display: collapsed ? 'none' : 'block' }}>
            <div style={{ fontFamily:'monospace', fontSize:13, fontWeight:900, color:C.text, letterSpacing:'0.08em' }}>OPSAIR</div>
            <div style={{ fontSize:8, fontWeight:700, color:C.goldDim, letterSpacing:'0.15em' }}>OPS PLATFORM</div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
        {NAV_ITEMS.map(item => {
          const isActive = activeSection === item.id
          const isExpanded = expanded[item.id]
          const alertDot = item.id === 'alerts' && hasAlert

          return (
            <div key={item.id}>
              <button className="sidebar-nav-btn" onClick={() => {
                if (item.subs) { toggle(item.id); onNav(item.id) }
                else onNav(item.id)
              }} style={{
                width:'100%', display:'flex', alignItems:'center',
                gap:10, padding: collapsed ? '10px 0' : '9px 14px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                border:'none', cursor:'pointer', position:'relative',
                backgroundColor: isActive ? 'rgba(212,168,67,0.08)' : 'transparent',
                borderLeft:`2px solid ${isActive ? C.gold : 'transparent'}`,
                transition:'all 0.15s',
              }}>
                <span style={{ fontSize:14, position:'relative', flexShrink:0 }}>
                  {item.icon}
                  {alertDot && (
                    <span style={{
                      position:'absolute', top:-3, right:-3, width:6, height:6, borderRadius:'50%',
                      backgroundColor:C.red, boxShadow:`0 0 5px ${C.red}`,
                    }}/>
                  )}
                </span>
                <span className="sidebar-label" style={{ display: collapsed ? 'none' : 'flex', alignItems:'center', flex:1, gap:0 }}>
                  <span style={{ fontSize:11, fontWeight:700, color: isActive ? C.gold : C.textDim, flex:1, textAlign:'left', letterSpacing:'0.04em' }}>
                    {item.label}
                  </span>
                  {item.subs && (
                    <span className="sidebar-chevron" style={{ fontSize:8, color:C.textFaint, transform: isExpanded ? 'rotate(180deg)' : 'none', transition:'transform 0.15s' }}>▼</span>
                  )}
                </span>
              </button>

              {/* Sous-items */}
              {!collapsed && item.subs && isExpanded && (
                <div style={{ paddingLeft:24, paddingBottom:4 }}>
                  {item.subs.map(sub => (
                    <button key={sub.id} onClick={() => onSubNav(item.id, sub.id)} style={{
                      width:'100%', display:'block', padding:'6px 12px',
                      border:'none', cursor:'pointer', textAlign:'left',
                      backgroundColor: activeSub === sub.id ? 'rgba(212,168,67,0.06)' : 'transparent',
                      color: activeSub === sub.id ? C.gold : C.textFaint,
                      fontSize:10, fontWeight:600, letterSpacing:'0.04em',
                      borderLeft:`1px solid ${activeSub === sub.id ? C.goldDim : C.border}`,
                      transition:'all 0.1s',
                    }}>{sub.label}</button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* User */}
      <div style={{ borderTop:`1px solid ${C.border}`, padding: collapsed ? '10px 0' : '12px 14px', flexShrink:0 }}>
        <button onClick={onProfile} style={{
          width:'100%', display:'flex', alignItems:'center',
          gap: collapsed ? 0 : 9, justifyContent: collapsed ? 'center' : 'flex-start',
          border:'none', background:'none', cursor:'pointer', padding: collapsed ? '4px 0' : '4px 0',
        }}>
          <div style={{
            width:28, height:28, borderRadius:'50%', flexShrink:0,
            background:`linear-gradient(135deg, ${C.borderHi}, ${C.bgCard})`,
            border:`1px solid ${C.goldDim}`,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:11, fontWeight:900, color:C.gold, fontFamily:'monospace',
          }}>{(user?.email?.[0] || 'U').toUpperCase()}</div>
          <div className="sidebar-user-detail" style={{ display: collapsed ? 'none' : 'block', flex:1, textAlign:'left', minWidth:0 }}>
            <div style={{ fontSize:10, fontWeight:700, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {user?.email || 'Utilisateur'}
            </div>
            <div style={{ fontSize:8, fontWeight:800, color:C.goldDim, letterSpacing:'0.12em', textTransform:'uppercase', marginTop:1 }}>
              {role || 'USER'}
            </div>
          </div>
        </button>
        {!collapsed && (
          <button className="sidebar-logout" onClick={onLogout} style={{
            width:'100%', marginTop:8, padding:'6px 0',
            border:`1px solid ${C.border}`, borderRadius:3,
            background:'none', cursor:'pointer', color:C.textDim,
            fontSize:10, fontWeight:600, letterSpacing:'0.06em',
            transition:'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor=C.red; e.currentTarget.style.color=C.red }}
            onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.textDim }}
          >↩ DÉCONNEXION</button>
        )}
      </div>

      {/* Collapse toggle */}
      <button className="sidebar-collapse-btn" onClick={() => setCollapsed(c => !c)} style={{
        position:'absolute', top:'50%', right:-10, transform:'translateY(-50%)',
        width:20, height:20, borderRadius:'50%',
        border:`1px solid ${C.borderHi}`, backgroundColor:C.bgPanel,
        cursor:'pointer', color:C.textDim, fontSize:9,
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>{collapsed ? '›' : '‹'}</button>
    </aside>
  )
}

// ── TOPBAR ────────────────────────────────────────────────────────────────────
function Topbar({ time, section, hasAlert, onAlerts }) {
  const sectionLabels = {
    dashboard:'Vue d\'ensemble', planning:'Planning', fleet:'Flotte',
    operations:'Opérations', dcs:'Ops Sol — DCS', alerts:'Alertes',
  }

  return (
    <header style={{
      height:48, borderBottom:`1px solid ${C.border}`, backgroundColor:C.bg,
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 20px', flexShrink:0,
    }}>
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:9, fontWeight:700, color:C.textFaint, letterSpacing:'0.15em' }}>OPSAIR</span>
        <span style={{ color:C.textFaint, fontSize:10 }}>/</span>
        <span style={{ fontSize:11, fontWeight:700, color:C.text }}>{sectionLabels[section] || section}</span>
      </div>

      {/* Centre — horloge */}
      <div style={{ position:'absolute', left:'50%', transform:'translateX(-50%)', textAlign:'center' }}>
        <div style={{ fontFamily:'monospace', fontSize:18, fontWeight:900, color:C.gold, letterSpacing:'0.05em' }}>
          {fmtClock(time)}
        </div>
        <div className="topbar-clock-sub" style={{ fontSize:8, fontWeight:700, color:C.textFaint, letterSpacing:'0.15em', marginTop:1 }}>
          AST · UTC-4 · {fmtDateShort(time).toUpperCase()}
        </div>
      </div>

      {/* Droite — alertes */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        {hasAlert && (
          <button onClick={onAlerts} style={{
            display:'flex', alignItems:'center', gap:7, padding:'4px 12px',
            border:`1px solid rgba(224,80,80,0.4)`, borderRadius:3,
            backgroundColor:'rgba(224,80,80,0.06)', color:C.red,
            fontSize:10, fontWeight:700, letterSpacing:'0.08em', cursor:'pointer',
            animation:'blink 2s ease-in-out infinite',
          }}>
            <Dot color={C.red} pulse/>
            ALERTE ACTIVE
          </button>
        )}
        <span className="topbar-aoc"><Tag color={C.textDim} border={C.border}>FR.AOC.0033</Tag></span>
      </div>
    </header>
  )
}

// ── DASHBOARD HOME ────────────────────────────────────────────────────────────
function DashboardHome({ kpis, flights, fleet, weather, onFlightClick, onAircraftClick, onSubNav, fetchWeather, weatherLoading, onCreateFlight }) {
  const upcomingFlights = flights
    .filter(f => ['scheduled','boarding','in_flight'].includes(computeRealtimeStatus(f)))
    .sort((a,b) => toDate(a.departure_time) - toDate(b.departure_time))
    .slice(0, 8)

  const recentFlights = flights
    .filter(f => computeRealtimeStatus(f) === 'landed')
    .sort((a,b) => toDate(b.departure_time) - toDate(a.departure_time))
    .slice(0, 6)

  const hasUpcoming = upcomingFlights.length > 0

  // Météo — pire statut pour alerte globale
  const worstWeather = Object.values(weather).reduce((worst, w) => {
    const rank = { IFR:3, MVFR:2, VFR:1 }
    return (rank[w.status] || 0) > (rank[worst?.status] || 0) ? w : worst
  }, null)

  return (
    <div className="dashboard-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 240px', height:'100%', gap:1, backgroundColor:C.border }}>

      {/* ── COLONNE GAUCHE : vols ── */}
      <div style={{ gridColumn:1, gridRow:'1/3', backgroundColor:C.bgPanel, display:'flex', flexDirection:'column' }}>
        {/* Header */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'10px 16px', borderBottom:`1px solid ${C.border}`, flexShrink:0,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Tag color={C.goldDim} bg='rgba(212,168,67,0.06)' border='rgba(212,168,67,0.2)'>PLANNING</Tag>
            <span style={{ fontSize:11, fontWeight:700, color:C.text }}>
              {hasUpcoming ? 'Prochains vols' : 'Vols du jour'}
            </span>
            {!hasUpcoming && recentFlights.length > 0 && (
              <Tag color={C.textFaint} border={C.border}>atterris</Tag>
            )}
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={onCreateFlight} style={{
              fontSize:10, fontWeight:800, color:C.gold,
              background:'none', border:`1px solid ${C.goldDim}`, borderRadius:3,
              padding:'3px 10px', cursor:'pointer', letterSpacing:'0.06em',
            }}>+ VOL</button>
            <button onClick={() => onSubNav('planning','flights')} style={{
              fontSize:10, color:C.textDim, background:'none', border:'none', cursor:'pointer',
            }}>Planning →</button>
          </div>
        </div>

        {/* Liste */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {hasUpcoming ? (
            upcomingFlights.map(f => <FlightRow key={f.id} flight={f} onClick={() => onFlightClick(f)}/>)
          ) : recentFlights.length > 0 ? (
            <>
              {recentFlights.map(f => <FlightRow key={f.id} flight={f} onClick={() => onFlightClick(f)}/>)}
            </>
          ) : (
            <div style={{
              flex:1, display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', padding:40, gap:16, height:'100%',
            }}>
              <div style={{ fontSize:36, opacity:0.3 }}>✈</div>
              <div style={{ fontSize:12, fontWeight:700, color:C.textDim, textAlign:'center' }}>
                Aucun vol planifié aujourd'hui
              </div>
              <button onClick={onCreateFlight} style={{
                padding:'8px 20px', backgroundColor:C.gold, color:'#060D1A',
                border:'none', borderRadius:3, cursor:'pointer',
                fontSize:11, fontWeight:900, letterSpacing:'0.08em',
              }}>+ CRÉER UN VOL</button>
            </div>
          )}
        </div>
      </div>

      {/* ── COLONNE CENTRE HAUT : météo ── */}
      <div style={{ gridColumn:2, gridRow:1, backgroundColor:C.bgPanel, display:'flex', flexDirection:'column' }}>
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'10px 16px', borderBottom:`1px solid ${C.border}`, flexShrink:0,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Tag color={C.goldDim} bg='rgba(212,168,67,0.06)' border='rgba(212,168,67,0.2)'>AVWX</Tag>
            <span style={{ fontSize:11, fontWeight:700, color:C.text }}>Météo aérodromes</span>
            {worstWeather?.status === 'IFR' && (
              <Tag color={C.red} border={C.red}>⚠ IFR</Tag>
            )}
            {worstWeather?.status === 'MVFR' && (
              <Tag color={C.amber} border={C.amber}>MVFR</Tag>
            )}
          </div>
          <button onClick={fetchWeather} disabled={weatherLoading || !AVWX_KEY} style={{
            fontSize:10, color: AVWX_KEY ? C.gold : C.textFaint,
            background:'none', border:'none', cursor: AVWX_KEY ? 'pointer' : 'default',
          }}>
            {weatherLoading ? '⟳ Chargement' : AVWX_KEY ? 'Actualiser' : 'DÉMO'}
          </button>
        </div>
        <div>
          {Object.values(weather).map(w => <WeatherPill key={w.icao} w={w}/>)}
        </div>
      </div>

      {/* ── COLONNE CENTRE BAS : flotte ── */}
      <div style={{ gridColumn:2, gridRow:2, backgroundColor:C.bgPanel, display:'flex', flexDirection:'column' }}>
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'10px 16px', borderBottom:`1px solid ${C.border}`, flexShrink:0,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Tag color={C.goldDim} bg='rgba(212,168,67,0.06)' border='rgba(212,168,67,0.2)'>FLEET</Tag>
            <span style={{ fontSize:11, fontWeight:700, color:C.text }}>État flotte</span>
          </div>
          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
            {/* Légende M / C */}
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <span style={{ fontSize:8, color:C.green, fontWeight:800 }}>M</span>
              <span style={{ fontSize:8, color:C.textFaint }}>moteur</span>
              <span style={{ fontSize:8, color:C.blueLight, fontWeight:800 }}>C</span>
              <span style={{ fontSize:8, color:C.textFaint }}>cellule</span>
            </div>
            <button onClick={() => onSubNav('fleet','aircraft')} style={{
              fontSize:10, color:C.textDim, background:'none', border:'none', cursor:'pointer',
            }}>Détail →</button>
          </div>
        </div>
        <div style={{ overflowY:'auto', flex:1 }}>
          {fleet.map(a => (
            <AircraftRow key={a.id||a.registration} aircraft={a} onClick={() => onAircraftClick(a)}/>
          ))}
        </div>
      </div>

      {/* ── COLONNE DROITE : synthèse ── */}
      <div className="dashboard-right-col" style={{
        gridColumn:3, gridRow:'1/3', backgroundColor:C.bgPanel,
        display:'flex', flexDirection:'column', overflow:'hidden',
      }}>

        {/* Flotte statuts */}
        <div style={{ padding:'12px 14px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:8, fontWeight:700, letterSpacing:'0.15em', color:C.textDim, marginBottom:10 }}>FLOTTE</div>
          {[
            { label:'Disponibles', count:fleet.filter(a=>a.status==='available').length,   color:C.green  },
            { label:'En vol',      count:fleet.filter(a=>a.status==='in_flight').length,   color:C.gold   },
            { label:'Maintenance', count:fleet.filter(a=>a.status==='maintenance').length, color:C.red    },
          ].map(s => (
            <div key={s.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Dot color={s.color}/>
                <span style={{ fontSize:10, color:C.textDim }}>{s.label}</span>
              </div>
              <span style={{ fontFamily:'monospace', fontSize:16, fontWeight:900, color:s.color }}>{s.count}</span>
            </div>
          ))}
        </div>

        {/* Vols statuts */}
        <div style={{ padding:'12px 14px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:8, fontWeight:700, letterSpacing:'0.15em', color:C.textDim, marginBottom:10 }}>VOLS</div>
          {[
            { label:'Atterris',     count:flights.filter(f=>computeRealtimeStatus(f)==='landed').length,    color:C.green     },
            { label:'En vol',       count:flights.filter(f=>computeRealtimeStatus(f)==='in_flight').length, color:C.gold      },
            { label:'Embarquement', count:flights.filter(f=>computeRealtimeStatus(f)==='boarding').length,  color:C.amber     },
            { label:'Programmés',   count:flights.filter(f=>computeRealtimeStatus(f)==='scheduled').length, color:C.blueLight },
            { label:'Annulés',      count:flights.filter(f=>computeRealtimeStatus(f)==='cancelled').length, color:C.red       },
          ].filter(s => s.count > 0 || s.label === 'Programmés').map(s => (
            <div key={s.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Dot color={s.color} pulse={s.label==='En vol' && s.count>0}/>
                <span style={{ fontSize:10, color:C.textDim }}>{s.label}</span>
              </div>
              <span style={{ fontFamily:'monospace', fontSize:15, fontWeight:900, color:s.count > 0 ? s.color : C.textFaint }}>
                {s.count}
              </span>
            </div>
          ))}
        </div>

        {/* Remplissage */}
        <div style={{ padding:'12px 14px', flex:1 }}>
          <div style={{ fontSize:8, fontWeight:700, letterSpacing:'0.15em', color:C.textDim, marginBottom:10 }}>REMPLISSAGE</div>

          {/* Valeur principale */}
          <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:8 }}>
            <span style={{
              fontFamily:'monospace', fontSize:28, fontWeight:900, lineHeight:1,
              color: (kpis.fillRate||0) >= 80 ? C.green : (kpis.fillRate||0) >= 50 ? C.amber : C.textDim,
            }}>{kpis.fillRate || 0}%</span>
            <span style={{ fontSize:9, color:C.textFaint }}>moy. journée</span>
          </div>

          {/* Barre */}
          <div style={{ height:5, backgroundColor:C.border, borderRadius:3, overflow:'hidden', marginBottom:6 }}>
            <div style={{
              height:'100%', borderRadius:3, transition:'width 0.6s',
              width:`${kpis.fillRate || 0}%`,
              backgroundColor: (kpis.fillRate||0) >= 80 ? C.green : (kpis.fillRate||0) >= 50 ? C.amber : C.blueLight,
            }}/>
          </div>

          {/* PAX détail */}
          <div style={{ fontSize:9, color:C.textFaint }}>
            {kpis.totalPax || 0} pax · {flights.reduce((s,f)=>s+(f.max_pax||9),0)} sièges totaux
          </div>

          {/* Breakdown par vol */}
          {flights.filter(f => ['in_flight','boarding'].includes(computeRealtimeStatus(f))).length > 0 && (
            <div style={{ marginTop:10 }}>
              <div style={{ fontSize:8, color:C.textFaint, marginBottom:6, letterSpacing:'0.1em' }}>EN COURS</div>
              {flights.filter(f => ['in_flight','boarding'].includes(computeRealtimeStatus(f))).map(f => {
                const pct = Math.round((f.pax_count||0)/(f.max_pax||9)*100)
                return (
                  <div key={f.id} style={{ marginBottom:6 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                      <span style={{ fontSize:9, fontFamily:'monospace', color:C.gold }}>{f.flight_number}</span>
                      <span style={{ fontSize:9, color:C.textDim }}>{f.pax_count}/{f.max_pax}</span>
                    </div>
                    <div style={{ height:3, backgroundColor:C.border, borderRadius:2, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, borderRadius:2, backgroundColor: pct >= 80 ? C.green : C.blueLight }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── SECTION HEADER ────────────────────────────────────────────────────────────
function SectionHeader({ title, breadcrumb, subItems, activeSub, onSubNav, section }) {
  return (
    <div style={{ flexShrink:0, borderBottom:`1px solid ${C.border}`, backgroundColor:C.bg }}>
      <div style={{ padding:'12px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          {breadcrumb && <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.15em', color:C.textFaint, marginBottom:3 }}>{breadcrumb}</div>}
          <h1 style={{ fontSize:18, fontWeight:900, color:C.text, margin:0, fontFamily:'monospace', letterSpacing:'0.04em' }}>{title}</h1>
        </div>
        {subItems && (
          <div style={{ display:'flex', gap:1, backgroundColor:C.border }}>
            {subItems.map(t => (
              <button key={t.id} onClick={() => onSubNav(section, t.id)} style={{
                padding:'7px 16px', border:'none', cursor:'pointer',
                backgroundColor: activeSub===t.id ? C.bgCard : C.bgPanel,
                color: activeSub===t.id ? C.gold : C.textDim,
                fontSize:10, fontWeight:700, letterSpacing:'0.08em',
                borderBottom:`2px solid ${activeSub===t.id ? C.gold : 'transparent'}`,
                transition:'all 0.15s',
              }}>{t.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ── DASHBOARD PRINCIPAL ──────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { user, role, logout } = useAuth()
  const { fleet: fsFleet }     = useAircraft()
  const { flights: fsFlights, kpis: fsKpis } = useFlights()

  const [tab,               setTab]              = useState('dashboard')
  const [liveMapFullscreen, setLiveMapFullscreen] = useState(false)
  const [time,              setTime]             = useState(new Date())
  const [weather,           setWeather]          = useState(WEATHER_MOCK)
  const [weatherLoading,    setWeatherLoading]   = useState(false)
  const [flightModal,       setFlightModal]      = useState(null)
  const [aircraftModal,     setAircraftModal]    = useState(null)
  const [profileOpen,       setProfileOpen]      = useState(false)
  const [creationModal,     setCreationModal]    = useState(false)
  const [newFlightInitData, setNewFlightInitData]= useState({})

  const fleet   = fsFleet.length   > 0 ? fsFleet   : MOCK_FLEET
  const flights = fsFlights.length > 0 ? fsFlights : MOCK_FLIGHTS
  const kpis    = fsFlights.length > 0 ? fsKpis : {
    total:     MOCK_FLIGHTS.length,
    completed: MOCK_FLIGHTS.filter(f=>f.status==='landed').length,
    inFlight:  MOCK_FLIGHTS.filter(f=>f.status==='in_flight').length,
    cancelled: MOCK_FLIGHTS.filter(f=>f.status==='cancelled').length,
    totalPax:  MOCK_FLIGHTS.reduce((s,f)=>s+f.pax_count,0),
    fillRate:  Math.round(MOCK_FLIGHTS.reduce((s,f)=>s+f.pax_count,0)/MOCK_FLIGHTS.reduce((s,f)=>s+f.max_pax,0)*100),
  }

  useAlertEngine({ fleet, flights, weather, enabled: fleet.length > 0 })

  const maintenanceAlerts = fleet.filter(a =>
    getPotentialPercent(a.engine_hours,   a.engine_limit)   <= 20 ||
    getPotentialPercent(a.airframe_hours, a.airframe_limit) <= 20 ||
    a.status === 'maintenance'
  )
  const hasAlert = maintenanceAlerts.length > 0 || Object.values(weather).some(w=>w.status==='IFR')

  const [subTab, setSubTab] = useState({ planning:'gantt', fleet:'aircraft', operations:'livemap' })

  const setMainTab   = id => setTab(id)
  const setSubTabFor = (section, sub) => { setSubTab(s=>({...s,[section]:sub})); setTab(section) }

  const resolveTab = rawTab => {
    const m = { overview:'dashboard', gantt:'planning', flights:'planning', crew:'planning', aircraft:'fleet', maintenance:'fleet', livemap:'operations', weather:'operations' }
    return m[rawTab] ? [m[rawTab], rawTab] : [rawTab, null]
  }
  const [activeSection, _sub0] = resolveTab(tab)
  const activeSub = _sub0 ?? subTab[activeSection] ?? null

  // Synchro sidebar expand sur tab change
  useEffect(() => {
    const item = NAV_ITEMS.find(n => n.id === activeSection)
    if (item?.subs) {
      // s'assurer que le parent est ouvert — géré dans Sidebar via isExpanded
    }
  }, [activeSection])

  const fetchWeather = useCallback(async () => {
    if (!AVWX_KEY) return
    setWeatherLoading(true)
    try {
      const results = await Promise.allSettled(
        ['TFFJ','TFFG','TNCM'].map(icao =>
          fetch(`https://avwx.rest/api/metar/${icao}?token=${AVWX_KEY}`).then(r=>r.json())
        )
      )
      const nw = { ...WEATHER_MOCK }
      results.forEach((r,i) => {
        const icao = ['TFFJ','TFFG','TNCM'][i]
        if (r.status==='fulfilled' && r.value?.raw) {
          const d = r.value; const vis = d.visibility?.value ?? 10; const ceil = d.ceiling?.value ?? null
          nw[icao] = { icao, name:WEATHER_MOCK[icao].name, temp:d.temperature?.value??0, dewpoint:d.dewpoint?.value??null, wind_speed:d.wind_speed?.value??0, wind_gust:d.wind_gust?.value??null, wind_dir:d.wind_direction?.repr??'--', wind_deg:d.wind_direction?.value??null, vis, ceiling:ceil, status:(vis<3||(ceil&&ceil<500))?'IFR':(vis<5||(ceil&&ceil<1000))?'MVFR':'VFR', raw:d.raw||'', updated:new Date() }
        }
      })
      setWeather(nw)
    } catch(e) { console.error(e) }
    finally { setWeatherLoading(false) }
  }, [])

  useEffect(() => { fetchWeather(); const t=setInterval(fetchWeather,600_000); return()=>clearInterval(t) }, [fetchWeather])
  useEffect(() => { const t=setInterval(()=>setTime(new Date()),1000); return()=>clearInterval(t) }, [])

  const handleFlightClick  = f => setFlightModal(f)
  const handleAircraftClick = a => setAircraftModal(a)

  const handleCreateFlight = ({ aircraft, hour, minute, date, duration } = {}) => {
    const hStr = hour !== undefined
      ? `${String(hour).padStart(2,'0')}:${String(minute||0).padStart(2,'0')}`
      : '08:00'
    const base = date || new Date()
    const flightDate = new Intl.DateTimeFormat('en-CA', { timeZone:SBH_TZ }).format(base)
    let arrStr = ''
    if (duration && hour !== undefined) {
      const totalMin = hour*60+(minute||0)+duration
      arrStr = `${String(Math.floor(totalMin/60)%24).padStart(2,'0')}:${String(totalMin%60).padStart(2,'0')}`
    }
    setNewFlightInitData({ aircraft:aircraft||'', departure_time:hStr, arrival_time:arrStr, flight_date:flightDate })
    setCreationModal(true)
  }

  const handleSaveFlight = async (formData) => {
    const { Timestamp } = await import('firebase/firestore')
    await addFlight({
      flight_number:  formData.flight_number,
      aircraft:       formData.aircraft,
      origin:         formData.origin,
      destination:    formData.destination,
      departure_time: Timestamp.fromDate(formData.departure_time),
      arrival_time:   Timestamp.fromDate(formData.arrival_time),
      pax_count:      formData.pax_count,
      max_pax:        formData.max_pax,
      pilot:          formData.pilot || '',
      status:         formData.status || 'scheduled',
      notes:          formData.notes  || '',
      flight_type:    formData.flight_type || 'regular',
    })
  }

  const handleDropFlight = async (flight, newDep, newArr) => {
    if (!flight.id || !fsFlights.length) return
    try { await updateFlight(flight.id, { departure_time:newDep, arrival_time:newArr }) }
    catch(e) { console.error(e) }
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', height:'100vh', backgroundColor:C.bg, color:C.text, fontFamily:"'JetBrains Mono','Cascadia Code','Consolas','Courier New',monospace" }}>

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.borderHi}; border-radius:2px; }
        ::-webkit-scrollbar-thumb:hover { background: ${C.textFaint}; }
        @keyframes ripple { 0%{transform:scale(1);opacity:0.4} 100%{transform:scale(2.2);opacity:0} }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0.5} }
        select, input, button, textarea { font-family: inherit; }
        select option { background-color: ${C.bgPanel}; color: ${C.text}; }

        /* ── RESPONSIVE ─────────────────────────────────── */

        /* Tablette (768–1023px) : sidebar icônes seulement */
        @media (max-width: 1023px) {
          .sidebar-full { width: 52px !important; }
          .sidebar-label, .sidebar-sub, .sidebar-user-detail,
          .sidebar-chevron, .sidebar-logout { display: none !important; }
          .sidebar-nav-btn { padding: 10px 0 !important; justify-content: center !important; }
          .sidebar-logo-text { display: none !important; }
          .sidebar-collapse-btn { display: none !important; }
          .dashboard-grid { grid-template-columns: 1fr 1fr !important; }
          .dashboard-right-col { display: none !important; }
          .kpi-strip { grid-template-columns: repeat(2,1fr) !important; }
        }

        /* Mobile (<768px) : bottom nav, pas de sidebar */
        @media (max-width: 767px) {
          .sidebar-full { display: none !important; }
          .mobile-bottom-nav { display: flex !important; }
          .main-scroll { padding-bottom: 56px !important; }
          .topbar-clock-sub { display: none !important; }
          .topbar-aoc { display: none !important; }
          .kpi-strip { grid-template-columns: repeat(2,1fr) !important; }
          .dashboard-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto !important;
          }
          .dashboard-grid > * {
            grid-column: 1 !important;
            grid-row: auto !important;
          }
          .dashboard-right-col { display: none !important; }
          .dcs-layout { grid-template-columns: 1fr !important; }
          .dcs-flight-list { max-height: 220px !important; }
          .section-header-subs { flex-wrap: wrap !important; }
          .flight-row-aircraft { display: none !important; }
          .weather-pill-details { display: none !important; }
        }
      `}</style>

      {/* Sidebar */}
      <Sidebar
        activeSection={activeSection}
        activeSub={activeSub}
        onNav={setMainTab}
        onSubNav={setSubTabFor}
        hasAlert={hasAlert}
        user={user}
        role={role}
        onProfile={() => setProfileOpen(true)}
        onLogout={logout}
      />

      {/* Contenu principal */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Topbar */}
        <Topbar
          time={time}
          section={activeSection}
          hasAlert={hasAlert}
          onAlerts={() => setMainTab('alerts')}
        />

        {/* Modales */}
        {(creationModal || (flightModal && !flightModal.id)) && (
          <FlightCreationModal
            onClose={() => { setCreationModal(false); setFlightModal(null) }}
            onSave={handleSaveFlight}
            flights={flights} fleet={fleet} aircraft_fleet={fsFleet}
            rules={{ min_turnaround_minutes:20, buffer_minutes:5, max_daily_cycles:8, max_crew_duty_minutes:720 }}
            user={user} initialData={newFlightInitData}
          />
        )}
        {flightModal?.id && (
          <FlightModal flight={flightModal} fleet={fleet} onClose={()=>setFlightModal(null)} onSaved={()=>setFlightModal(null)}/>
        )}
        {aircraftModal && (
          <AircraftModal aircraft={aircraftModal==='new'?null:aircraftModal} onClose={()=>setAircraftModal(null)} onSaved={()=>setAircraftModal(null)}/>
        )}

        {/* Alerte barre maintenance */}
        {maintenanceAlerts.length > 0 && !['alerts','dcs'].includes(activeSection) && (
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8,
            padding:'7px 20px', backgroundColor:'rgba(224,80,80,0.06)', borderBottom:`1px solid rgba(224,80,80,0.2)`,
            flexShrink:0,
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <Dot color={C.red} pulse/>
              <span style={{ fontSize:10, fontWeight:700, color:C.red, letterSpacing:'0.06em' }}>
                MAINTENANCE — {maintenanceAlerts.length} appareil{maintenanceAlerts.length>1?'s':''}
              </span>
              {maintenanceAlerts.map(a => {
                const ep = getPotentialPercent(a.engine_hours,   a.engine_limit)
                const ap = getPotentialPercent(a.airframe_hours, a.airframe_limit)
                return (
                  <button key={a.id||a.registration} onClick={()=>setAircraftModal(a)} style={{
                    display:'flex', alignItems:'center', gap:5, padding:'2px 8px',
                    border:`1px solid rgba(224,80,80,0.3)`, borderRadius:2,
                    background:'transparent', cursor:'pointer',
                  }}>
                    <span style={{ fontFamily:'monospace', fontSize:10, fontWeight:800, color:C.text }}>{a.registration}</span>
                    {a.status==='maintenance' && <Tag color={C.red}>MAINT</Tag>}
                    {ep<=20 && <Tag color={C.amber}>M {ep}%</Tag>}
                    {ap<=20 && <Tag color={C.amber}>C {ap}%</Tag>}
                  </button>
                )
              })}
            </div>
            <button onClick={()=>setMainTab('alerts')} style={{
              fontSize:10, color:C.red, background:'none',
              border:`1px solid rgba(224,80,80,0.3)`, padding:'3px 10px', cursor:'pointer', letterSpacing:'0.06em',
            }}>VOIR LES ALERTES →</button>
          </div>
        )}

        {/* Zone scrollable */}
        <div className="main-scroll" style={{ flex:1, overflow:'auto', display:'flex', flexDirection:'column' }}>

          {/* ── DASHBOARD ── */}
          {activeSection === 'dashboard' && (
            <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
              <KPIStrip kpis={kpis} flights={flights}/>
              <div style={{ flex:1, overflow:'hidden' }}>
                <DashboardHome
                  kpis={kpis} flights={flights} fleet={fleet} weather={weather}
                  onFlightClick={handleFlightClick}
                  onAircraftClick={handleAircraftClick}
                  onSubNav={setSubTabFor}
                  fetchWeather={fetchWeather}
                  weatherLoading={weatherLoading}
                  onCreateFlight={handleCreateFlight}
                />
              </div>
            </div>
          )}

          {/* ── PLANNING ── */}
          {activeSection === 'planning' && (
            <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
              <SectionHeader
                title="PLANNING"
                breadcrumb="OPSAIR / PLANNING"
                section="planning"
                subItems={[{id:'gantt',label:'GANTT'},{id:'flights',label:'VOLS'},{id:'crew',label:'ÉQUIPAGE'}]}
                activeSub={activeSub}
                onSubNav={setSubTabFor}
              />
              <div style={{ flex:1, overflow:'auto', padding:20 }}>
                {activeSub === 'gantt' && (
                  <GanttEnhanced
                    flights={flights} fleet={fleet} user={user}
                    onFlightClick={handleFlightClick}
                    onCreateFlight={handleCreateFlight}
                  />
                )}
                {activeSub === 'flights' && (
                  <FlightsPage flights={flights} fleet={fleet} user={user} onCreateFlight={()=>setFlightModal({})}/>
                )}
                {activeSub === 'crew' && <CrewPage flights={flights} user={user}/>}
              </div>
            </div>
          )}

          {/* ── FLOTTE ── */}
          {activeSection === 'fleet' && (
            <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
              <SectionHeader
                title="FLOTTE"
                breadcrumb="OPSAIR / FLOTTE"
                section="fleet"
                subItems={[{id:'aircraft',label:'APPAREILS'},{id:'maintenance',label:'MAINTENANCE'}]}
                activeSub={activeSub}
                onSubNav={setSubTabFor}
              />
              <div style={{ flex:1, overflow:'auto', padding:20 }}>
                {activeSub === 'aircraft'    && <FleetPage fleet={fleet} flights={flights} user={user}/>}
                {activeSub === 'maintenance' && <MaintenancePage fleet={fleet} flights={flights} user={user}/>}
              </div>
            </div>
          )}

          {/* ── OPÉRATIONS ── */}
          {activeSection === 'operations' && (
            <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
              <SectionHeader
                title="OPÉRATIONS"
                breadcrumb="OPSAIR / OPÉRATIONS"
                section="operations"
                subItems={[{id:'livemap',label:'LIVE MAP'},{id:'weather',label:'MÉTÉO'}]}
                activeSub={activeSub}
                onSubNav={setSubTabFor}
              />
              <div style={{ flex:1, overflow:'auto' }}>
                {activeSub === 'livemap' && (
                  <LiveMap flights={flights} fleet={fleet} user={user} fullscreen={false} onToggleFullscreen={()=>setLiveMapFullscreen(true)}/>
                )}
                {activeSub === 'weather' && (
                  <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span style={{ fontSize:10, color:C.textDim }}>{AVWX_KEY?'Données AVWX · Actualisation toutes les 10 min':'Données de démonstration'}</span>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        {!AVWX_KEY && <Tag color={C.goldDim}>DÉMO</Tag>}
                        <button onClick={fetchWeather} disabled={weatherLoading||!AVWX_KEY} style={{
                          padding:'5px 12px', border:`1px solid ${C.border}`, borderRadius:3,
                          background:'none', color:C.textDim, fontSize:10, cursor:'pointer',
                        }}>{weatherLoading?'Chargement...':'Actualiser'}</button>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:1, backgroundColor:C.border }}>
                      {Object.values(weather).map(w => <WeatherCard key={w.icao} w={w}/>)}
                    </div>
                    <WeatherForecast flights={flights} weather={weather}/>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── DCS ── */}
          {activeSection === 'dcs' && (
            <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
              <SectionHeader title="OPS SOL — DCS" breadcrumb="OPSAIR / DEPARTURE CONTROL"/>
              <div style={{ flex:1, overflow:'auto' }}>
                <DCSSectionEmbed flights={flights}/>
              </div>
            </div>
          )}

          {/* ── ALERTES ── */}
          {activeSection === 'alerts' && (
            <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
              <SectionHeader title="ALERTES" breadcrumb="OPSAIR / ALERTES"/>
              <div style={{ flex:1, overflow:'auto', padding:20 }}>
                <SmartAlertsPanel userId={user?.uid}/>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{
          flexShrink:0, borderTop:`1px solid ${C.border}`, padding:'6px 20px',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          backgroundColor:C.bgPanel,
        }}>
          <span style={{ fontSize:8, fontWeight:700, letterSpacing:'0.15em', color:C.textFaint }}>
            OPSAIR v3.0 · DGAC/OSAC · EASA PART-145
          </span>
          <span style={{ fontSize:8, color:C.textFaint }}>
            {fmtClock(time)} AST
          </span>
        </div>
      </div>

      {/* Live Map plein écran */}
      {liveMapFullscreen && (
        <div style={{ position:'fixed', inset:0, zIndex:500, backgroundColor:'#020408', display:'flex', flexDirection:'column' }}>
          <LiveMap flights={flights} fleet={fleet} user={user} fullscreen={true} onToggleFullscreen={()=>setLiveMapFullscreen(false)}/>
        </div>
      )}

      {/* ── BOTTOM NAV MOBILE ── */}
      <nav className="mobile-bottom-nav" style={{
        display:'none',
        position:'fixed', bottom:0, left:0, right:0, zIndex:100,
        backgroundColor:C.bgPanel, borderTop:`1px solid ${C.borderHi}`,
        paddingBottom:'env(safe-area-inset-bottom, 0px)',
      }}>
        <div style={{ display:'flex', height:56 }}>
          {[
            { id:'dcs',        icon:'🛂', label:'Ops Sol'  },
            { id:'planning',   icon:'▦',  label:'Planning'  },
            { id:'fleet',      icon:'✈',  label:'Flotte'    },
            { id:'operations', icon:'◉',  label:'Météo'     },
            { id:'alerts',     icon:'◬',  label:'Alertes'   },
          ].map(item => {
            // Pour "Météo" on pointe vers la sous-section weather
            const isActive = item.id === 'operations'
              ? activeSection === 'operations'
              : activeSection === item.id
            const alertDot = item.id === 'alerts' && hasAlert
            const handleTap = () => {
              if (item.id === 'operations') setSubTabFor('operations', 'weather')
              else setMainTab(item.id)
            }
            return (
              <button key={item.id} onClick={handleTap} style={{
                flex:1, display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center', gap:3,
                border:'none', background: isActive ? 'rgba(212,168,67,0.07)' : 'none',
                cursor:'pointer', position:'relative',
                borderTop:`2px solid ${isActive ? C.gold : 'transparent'}`,
                transition:'all 0.15s',
              }}>
                <span style={{ fontSize:17, lineHeight:1 }}>{item.icon}</span>
                <span style={{
                  fontSize:9, fontWeight:700, letterSpacing:'0.05em',
                  color: isActive ? C.gold : C.textDim,
                }}>
                  {item.label}
                </span>
                {alertDot && (
                  <span style={{
                    position:'absolute', top:6, right:'calc(50% - 14px)',
                    width:7, height:7, borderRadius:'50%',
                    backgroundColor:C.red, boxShadow:`0 0 6px ${C.red}`,
                  }}/>
                )}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Profil */}
      {profileOpen && <ProfilePage onClose={()=>setProfileOpen(false)}/>}
    </div>
  )
}