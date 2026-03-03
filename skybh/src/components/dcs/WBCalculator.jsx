import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { getPassenger } from '../../services/passengerService'
import { useState, useMemo, useEffect } from 'react'
import {
  calculateWB, getAircraftConfig, fuelLitersToKg,
  STD_PAX_WEIGHTS, REGISTRATION_TO_CONFIG,
} from '../../utils/weightBalance'

const FLEET = Object.keys(REGISTRATION_TO_CONFIG)
const NAVY = '#0B1F3A', GOLD = '#C8A951', GREEN = '#16a34a', RED = '#dc2626'

const SEAT_STATIONS = [
  { key: 'r1l', station: 'row1', label: '1' }, { key: 'r1r', station: 'row1', label: '2' },
  { key: 'r2l', station: 'row2', label: '3' }, { key: 'r2r', station: 'row2', label: '4' },
  { key: 'r3l', station: 'row3', label: '5' }, { key: 'r3r', station: 'row3', label: '6' },
  { key: 'r4l', station: 'row4', label: '7' }, { key: 'r4r', station: 'row4', label: '8' },
  { key: 'r5c', station: 'row5', label: '9' },
]

const PAX_TYPES = [
  { value: 'empty',  label: '-', weight: 0 },
  { value: 'adult',  label: 'A', weight: STD_PAX_WEIGHTS.adult },
  { value: 'child',  label: 'E', weight: STD_PAX_WEIGHTS.child },
  { value: 'infant', label: 'B', weight: 0 },
]

const SEAT_COLORS = {
  empty:     { bg: '#f0f0ec', text: '#bbb',    border: '#ddd' },
  adult:     { bg: NAVY,      text: 'white',   border: NAVY },
  child:     { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  infant:    { bg: '#fef9c3', text: '#92400e', border: '#fde68a' },
  checkedin: { bg: '#166534', text: 'white',   border: '#15803d' },
  boarded:   { bg: '#14532d', text: '#86efac', border: '#16a34a' },
}

function bookingsToSeats(bookings = []) {
  const initial = Object.fromEntries(SEAT_STATIONS.map(s => [s.key, 'empty']))
  const active  = bookings.filter(b => ['checked_in', 'boarded', 'confirmed'].includes(b.status))

  active.forEach(booking => {
    const seat = booking.seatNumber
    if (!seat) return
    const seatIdx = parseInt(seat) - 1
    if (seatIdx < 0 || seatIdx >= SEAT_STATIONS.length) return
    initial[SEAT_STATIONS[seatIdx].key] = booking.status === 'boarded' ? 'boarded_pax' : 'checkedin_pax'
  })

  const withoutSeat = active.filter(b => !b.seatNumber)
  let freeIdx = 0
  for (const booking of withoutSeat) {
    while (freeIdx < SEAT_STATIONS.length) {
      const key = SEAT_STATIONS[freeIdx].key
      if (initial[key] === 'empty') { initial[key] = 'adult'; freeIdx++; break }
      freeIdx++
    }
  }
  return initial
}

function getSeatDisplay(seatValue) {
  if (seatValue === 'boarded_pax')   return { label: 'A', color: SEAT_COLORS.boarded,   weight: STD_PAX_WEIGHTS.adult }
  if (seatValue === 'checkedin_pax') return { label: 'A', color: SEAT_COLORS.checkedin, weight: STD_PAX_WEIGHTS.adult }
  const p = PAX_TYPES.find(p => p.value === seatValue) || PAX_TYPES[0]
  return { label: p.label, color: SEAT_COLORS[seatValue] || SEAT_COLORS.empty, weight: p.weight }
}

function Badge({ ok, children }) {
  return <span style={{ padding:'3px 10px', borderRadius:999, fontSize:11, fontWeight:700, background:ok?'#dcfce7':'#fee2e2', color:ok?GREEN:RED, border:`1px solid ${ok?'#86efac':'#fca5a5'}` }}>{children}</span>
}

function StatBox({ label, value, unit, sub, error, warning }) {
  return (
    <div style={{ background:error?'#fee2e2':warning?'#fef9c3':'#f8f8f6', borderRadius:10, padding:'10px 14px', border:`1px solid ${error?'#fca5a5':'#e5e5e0'}` }}>
      <div style={{ fontSize:10, color:'#888', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:800, color:error?RED:NAVY }}>{value} <span style={{ fontSize:11, color:'#888' }}>{unit}</span></div>
      {sub && <div style={{ fontSize:10, color:'#666', marginTop:3 }}>{sub}</div>}
    </div>
  )
}

function CGBar({ cg, limits }) {
  const pct = Math.min(100, Math.max(0, ((cg - limits.forward) / (limits.aft - limits.forward)) * 100))
  const ok  = cg >= limits.forward && cg <= limits.aft
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#888', marginBottom:4 }}>
        <span>AV {limits.forward}m</span>
        <span style={{ fontWeight:700, color:ok?GREEN:RED }}>CG {cg.toFixed(3)}m</span>
        <span>AR {limits.aft}m</span>
      </div>
      <div style={{ position:'relative', height:18, background:'linear-gradient(90deg,#fee2e2 0%,#dcfce7 15%,#dcfce7 85%,#fee2e2 100%)', borderRadius:9 }}>
        <div style={{ position:'absolute', top:'50%', left:`${pct}%`, transform:'translate(-50%,-50%)', width:16, height:16, borderRadius:'50%', background:ok?GREEN:RED, border:'3px solid white', boxShadow:'0 1px 4px rgba(0,0,0,.3)', transition:'left 0.3s' }}/>
      </div>
    </div>
  )
}

function SeatTooltip({ booking }) {
  if (!booking) return null
  return (
    <div style={{ position:'absolute', bottom:'110%', left:'50%', transform:'translateX(-50%)', background:NAVY, color:'white', borderRadius:8, padding:'6px 10px', fontSize:10, fontWeight:600, whiteSpace:'nowrap', zIndex:10, boxShadow:'0 4px 12px rgba(0,0,0,0.3)', pointerEvents:'none' }}>
      {(booking.lastName||'').toUpperCase()} {booking.firstName||''}
      {booking.baggageWeight > 0 && ` · ${booking.baggageWeight}kg`}
      <div style={{ position:'absolute', bottom:-4, left:'50%', transform:'translateX(-50%)', width:8, height:8, background:NAVY, rotate:'45deg' }}/>
    </div>
  )
}

export default function WBCalculator({ onResult, initialRegistration, bookings: bookingsProp, flightId }) {
  const [reg,          setReg]          = useState(initialRegistration || FLEET[0])
  const [seats,        setSeats]        = useState({})
  const [pilot,        setPilot]        = useState(84)
  const [fuel,         setFuel]         = useState(400)
  const [bFwd,         setBFwd]         = useState(0)
  const [bAft,         setBAft]         = useState(0)
  const [trip,         setTrip]         = useState(80)
  const [details,      setDetails]      = useState(false)
  const [tooltip,      setTooltip]      = useState(null)
  const [liveBookings, setLiveBookings] = useState([])

  // Mode autonome : charge depuis Firestore si pas de prop
  useEffect(() => {
    if (bookingsProp !== undefined || !flightId) return
    const q = query(collection(db, 'bookings'), where('flightId', '==', flightId), orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(q, async (snap) => {
      const raw = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const enriched = await Promise.all(raw.map(async b => {
        try {
          const p = await getPassenger(b.passengerId)
          return p ? { ...b, lastName: p.lastName, firstName: p.firstName, baggageWeight: b.baggageWeight || 0 } : b
        } catch { return b }
      }))
      setLiveBookings(enriched)
    }, err => console.warn('[WBCalculator] Firestore:', err.message))
    return () => unsub()
  }, [flightId, bookingsProp])

  const bookings = bookingsProp ?? liveBookings

  const config = useMemo(() => { try { return getAircraftConfig(reg) } catch { return null } }, [reg])
  const fuelKg = useMemo(() => fuelLitersToKg(fuel, config?.fuelDensity), [fuel, config])
  const tripKg = useMemo(() => fuelLitersToKg(trip, config?.fuelDensity), [trip, config])

  // Sync bookings → sièges
  useEffect(() => {
    const active = bookings.filter(b => ['confirmed','checked_in','boarded'].includes(b.status))
    setSeats(bookingsToSeats(active))
    const totalBag = bookings.filter(b => ['checked_in','boarded'].includes(b.status)).reduce((s,b) => s+(b.baggageWeight||0), 0)
    if (totalBag > 0) { setBFwd(Math.round(totalBag * 0.6)); setBAft(Math.round(totalBag * 0.4)) }
  }, [bookings])

  useEffect(() => {
    if (initialRegistration && FLEET.includes(initialRegistration)) setReg(initialRegistration)
  }, [initialRegistration])

  const bookingBySeat = useMemo(() => {
    const map = {}
    bookings.forEach(b => { if (b.seatNumber) map[b.seatNumber] = b })
    return map
  }, [bookings])

  const loadItems = useMemo(() => {
    const items = [{ station: 'pilot', weight: pilot }]
    SEAT_STATIONS.forEach(s => {
      const v = seats[s.key]
      let weight = 0
      if (['adult','checkedin_pax','boarded_pax'].includes(v)) weight = STD_PAX_WEIGHTS.adult
      else if (v === 'child') weight = STD_PAX_WEIGHTS.child
      if (weight > 0) items.push({ station: s.station, weight })
    })
    if (bFwd > 0) items.push({ station: 'baggageFwd', weight: Number(bFwd) })
    if (bAft > 0) items.push({ station: 'baggageAft', weight: Number(bAft) })
    return items
  }, [pilot, seats, bFwd, bAft])

  // ── FIX : onResult dans useEffect, pas dans useMemo ──────
  const result = useMemo(() => {
    try { return calculateWB(reg, loadItems, fuelKg, tripKg) } catch { return null }
  }, [reg, loadItems, fuelKg, tripKg])

  useEffect(() => { if (result) onResult?.(result) }, [result])
  // ─────────────────────────────────────────────────────────

  const cycleSeat = (key) => {
    const seatNum = String(SEAT_STATIONS.findIndex(s => s.key === key) + 1)
    if (bookingBySeat[seatNum]) return
    const order = ['empty','adult','child','infant']
    setSeats(prev => ({ ...prev, [key]: order[(order.indexOf(prev[key]) + 1) % order.length] }))
  }

  const totalPax = SEAT_STATIONS.filter(s => seats[s.key] !== 'empty').length
  const fromDCS  = bookings.filter(b => ['checked_in','boarded'].includes(b.status)).length

  const card = { background:'white', borderRadius:12, padding:16, border:'1px solid #e5e5e0' }
  const lbl  = { fontSize:11, fontWeight:700, color:GOLD, letterSpacing:'0.1em', textTransform:'uppercase', display:'block', marginBottom:10 }

  const renderSeat = (idx) => {
    const s        = SEAT_STATIONS[idx]
    const seatNum  = String(idx + 1)
    const v        = seats[s.key] || 'empty'
    const booking  = bookingBySeat[seatNum]
    const isLocked = !!booking
    const disp     = getSeatDisplay(v)
    return (
      <div key={s.key} style={{ position:'relative' }}
        onMouseEnter={() => booking && setTooltip(s.key)}
        onMouseLeave={() => setTooltip(null)}
      >
        {tooltip === s.key && booking && <SeatTooltip booking={booking}/>}
        <button onClick={() => cycleSeat(s.key)} style={{ width:54, height:54, borderRadius:8, background:disp.color.bg, border:`2px solid ${disp.color.border}`, color:disp.color.text, fontWeight:800, fontSize:15, cursor:isLocked?'default':'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1, transition:'all 0.15s', boxShadow:isLocked?`0 0 0 3px ${disp.color.border}40`:'none' }}>
          {booking ? (
            <><span style={{ fontSize:12, fontWeight:900, lineHeight:1 }}>{(booking.lastName?.[0]||'?').toUpperCase()}</span><span style={{ fontSize:8, opacity:0.8, lineHeight:1 }}>#{s.label}</span></>
          ) : (
            <><span>{disp.label}</span><span style={{ fontSize:9, opacity:0.7 }}>#{s.label}</span></>
          )}
        </button>
      </div>
    )
  }

  return (
    <div style={{ fontFamily:'Helvetica Neue, sans-serif', maxWidth:500, margin:'0 auto', padding:'0 0 40px', color:NAVY }}>

      <div style={{ background:NAVY, color:'white', padding:'16px 20px', borderRadius:'0 0 16px 16px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:10, color:GOLD, fontWeight:700, letterSpacing:'0.12em' }}>WEIGHT & BALANCE</div>
          <div style={{ fontSize:18, fontWeight:800 }}>Calcul de centrage</div>
        </div>
        {result && <Badge ok={result.isValid}>{result.isValid?'✓ CONFORME':'✗ HORS LIMITES'}</Badge>}
      </div>

      <div style={{ padding:'0 16px', display:'flex', flexDirection:'column', gap:14 }}>

        {fromDCS > 0 && (
          <div style={{ padding:'10px 14px', borderRadius:10, background:'#f0fdf4', border:'1px solid #86efac', fontSize:12, color:'#166534', fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:16 }}>✓</span>
            <span>{fromDCS} passager{fromDCS>1?'s':''} chargé{fromDCS>1?'s':''} depuis le check-in DCS · {bookings.filter(b=>['checked_in','boarded'].includes(b.status)).reduce((s,b)=>s+(b.baggageWeight||0),0)} kg bagages</span>
          </div>
        )}

        {/* Appareil */}
        <div style={card}>
          <label style={lbl}>Appareil</label>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {FLEET.map(r => (
              <button key={r} onClick={() => setReg(r)} style={{ padding:'10px 6px', borderRadius:8, border:`2px solid ${reg===r?GOLD:'#e5e5e0'}`, background:reg===r?NAVY:'white', color:reg===r?'white':NAVY, fontWeight:700, fontSize:12, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                <span>{r}</span>
                <span style={{ fontSize:9, color:reg===r?GOLD:'#999' }}>{REGISTRATION_TO_CONFIG[r]==='C208B_EX'?'EX':'STD'}</span>
              </button>
            ))}
          </div>
          {config && <div style={{ marginTop:10, padding:'7px 10px', background:'#f8f8f6', borderRadius:8, fontSize:11, color:'#666' }}>MTOW <strong style={{ color:NAVY }}>{config.mtow}kg</strong> — MZFW <strong style={{ color:NAVY }}>{config.mzfw}kg</strong> — Carbu max <strong style={{ color:NAVY }}>{config.fuelCapacity}L</strong></div>}
        </div>

        {/* Pilote */}
        <div style={card}>
          <label style={lbl}>Pilote</label>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <input type="number" value={pilot} min={60} max={130} onChange={e => setPilot(Number(e.target.value))} style={{ width:80, padding:8, borderRadius:8, border:'2px solid #e5e5e0', fontSize:18, fontWeight:800, color:NAVY, textAlign:'center' }}/>
            <span style={{ fontSize:12, color:'#666' }}>kg</span>
            {[75,80,84,90].map(w => <button key={w} onClick={() => setPilot(w)} style={{ padding:'6px 10px', borderRadius:6, border:`1px solid ${pilot===w?NAVY:'#ddd'}`, background:pilot===w?NAVY:'white', color:pilot===w?'white':'#666', fontSize:12, fontWeight:600, cursor:'pointer' }}>{w}</button>)}
          </div>
        </div>

        {/* Cabine */}
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <label style={{ ...lbl, marginBottom:0 }}>Passagers</label>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {fromDCS > 0 && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:999, background:'#dcfce7', color:'#166534', fontWeight:700, border:'1px solid #86efac' }}>DCS ✓</span>}
              <span style={{ fontSize:13, fontWeight:700 }}>{totalPax}/9</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
            {[{value:'adult',label:'A — Adulte',color:SEAT_COLORS.adult},{value:'child',label:'E — Enfant',color:SEAT_COLORS.child},{value:'infant',label:'B — Bebe',color:SEAT_COLORS.infant},{value:'checkedin',label:'✓ Checké',color:SEAT_COLORS.checkedin},{value:'boarded',label:'✈ Embarqué',color:SEAT_COLORS.boarded}].map(t => (
              <span key={t.value} style={{ fontSize:10, padding:'2px 8px', borderRadius:999, background:t.color.bg, color:t.color.text, border:`1px solid ${t.color.border}`, fontWeight:600 }}>{t.label}</span>
            ))}
          </div>
          <div style={{ background:'#f8f8f6', borderRadius:10, padding:'12px 8px', display:'flex', flexDirection:'column', gap:8 }}>
            {[[0,1],[2,3],[4,5],[6,7]].map((pair, ri) => (
              <div key={ri} style={{ display:'flex', justifyContent:'center', gap:28 }}>
                {pair.map(idx => renderSeat(idx))}
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'center' }}>{renderSeat(8)}</div>
          </div>
          <div style={{ marginTop:8, fontSize:10, color:'#aaa', textAlign:'center' }}>Nez ← → Queue — Sièges verts = checkés DCS (verrouillés)</div>
        </div>

        {/* Bagages */}
        <div style={card}>
          <label style={lbl}>Bagages</label>
          {fromDCS > 0 && <div style={{ marginBottom:10, fontSize:11, color:'#666', padding:'6px 10px', background:'#f0fdf4', borderRadius:8, border:'1px solid #86efac' }}>Auto-calculés depuis DCS · Ajustez si nécessaire</div>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[['Soute avant',bFwd,setBFwd],['Soute arriere',bAft,setBAft]].map(([label,value,setter]) => (
              <div key={label}>
                <div style={{ fontSize:11, color:'#888', marginBottom:6 }}>{label}</div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <button onClick={() => setter(Math.max(0,value-5))} style={{ width:30, height:30, borderRadius:6, border:'1px solid #ddd', background:'#f8f8f6', fontSize:16, cursor:'pointer', fontWeight:700 }}>-</button>
                  <input type="number" value={value} min={0} max={300} onChange={e => setter(Math.max(0,Number(e.target.value)))} style={{ flex:1, padding:'6px 4px', borderRadius:6, border:'1px solid #ddd', fontSize:14, fontWeight:700, textAlign:'center', color:NAVY }}/>
                  <button onClick={() => setter(value+5)} style={{ width:30, height:30, borderRadius:6, border:'1px solid #ddd', background:'#f8f8f6', fontSize:16, cursor:'pointer', fontWeight:700 }}>+</button>
                  <span style={{ fontSize:11, color:'#888' }}>kg</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Carburant */}
        <div style={card}>
          <label style={lbl}>Carburant</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[['Decollage',fuel,setFuel,config?.fuelCapacity||1009],['Trip fuel',trip,setTrip,fuel]].map(([label,value,setter,max]) => (
              <div key={label}>
                <div style={{ fontSize:11, color:'#888', marginBottom:6 }}>{label}</div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <input type="number" value={value} min={0} max={max} onChange={e => setter(Math.min(max,Math.max(0,Number(e.target.value))))} style={{ flex:1, padding:'8px 6px', borderRadius:6, border:'1px solid #ddd', fontSize:14, fontWeight:700, textAlign:'center', color:NAVY }}/>
                  <div style={{ fontSize:10, textAlign:'right' }}><div style={{ color:'#888' }}>L</div><div style={{ color:NAVY, fontWeight:700 }}>{fuelLitersToKg(value,config?.fuelDensity)}kg</div></div>
                </div>
              </div>
            ))}
          </div>
          {config && <div style={{ marginTop:10 }}><div style={{ height:6, background:'#f0f0ec', borderRadius:3, overflow:'hidden' }}><div style={{ height:'100%', borderRadius:3, transition:'width 0.3s', width:`${Math.min(100,(fuel/config.fuelCapacity)*100)}%`, background:fuel>config.fuelCapacity*0.9?'#f59e0b':NAVY }}/></div><div style={{ fontSize:10, color:'#888', marginTop:4 }}>{fuel} / {config.fuelCapacity} L max</div></div>}
        </div>

        {/* Résultats */}
        {result && (
          <div style={{ background:result.isValid?'#f0fdf4':'#fef2f2', borderRadius:12, padding:16, border:`2px solid ${result.isValid?'#86efac':'#fca5a5'}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#888', letterSpacing:'0.1em', textTransform:'uppercase' }}>Resultats W&B</span>
              <Badge ok={result.isValid}>{result.isValid?'✓ CONFORME':'✗ HORS LIMITES'}</Badge>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
              <StatBox label="Zero Fuel Wt"    value={result.zeroFuelWeight}        unit="kg" sub={`Marge MZFW: ${result.marginToMZFW}kg`} error={result.zeroFuelWeight>result.config.mzfw} warning={result.marginToMZFW<50&&result.marginToMZFW>=0}/>
              <StatBox label="Masse decollage" value={result.takeoffWeight}         unit="kg" sub={`Marge MTOW: ${result.marginToMTOW}kg`} error={result.takeoffWeight>result.config.mtow}  warning={result.marginToMTOW<50&&result.marginToMTOW>=0}/>
              <StatBox label="CG decollage"    value={result.takeoffCG.toFixed(3)} unit="m"  sub={`${result.config.cgLimits.forward}-${result.config.cgLimits.aft}m`} error={result.cgStatus!=='ok'}/>
              <StatBox label="Masse atterr."   value={result.landingWeight}         unit="kg" sub={`CG: ${result.landingCG.toFixed(3)}m`}/>
            </div>
            <div style={{ background:'white', borderRadius:8, padding:'10px 12px', marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#888', marginBottom:8, textTransform:'uppercase' }}>Envelope CG</div>
              <CGBar cg={result.takeoffCG} limits={result.config.cgLimits}/>
            </div>
            {result.errors.map((e,i)   => <div key={i} style={{ padding:'8px 12px', borderRadius:8, background:'#fee2e2', border:'1px solid #fca5a5', color:RED,      fontSize:12, fontWeight:600, marginBottom:6 }}>✗ {e}</div>)}
            {result.warnings.map((w,i) => <div key={i} style={{ padding:'8px 12px', borderRadius:8, background:'#fef9c3', border:'1px solid #fde68a', color:'#92400e', fontSize:12, fontWeight:600, marginBottom:6 }}>⚠ {w}</div>)}
            <button onClick={() => setDetails(v => !v)} style={{ width:'100%', padding:8, borderRadius:8, border:'1px solid #ddd', background:'white', color:'#666', fontSize:12, cursor:'pointer', fontWeight:600 }}>
              {details?'Masquer details':'Voir details complets'}
            </button>
            {details && (
              <pre style={{ marginTop:10, padding:12, background:'white', borderRadius:8, fontSize:10, color:'#444', fontFamily:'monospace', whiteSpace:'pre-wrap', lineHeight:1.8 }}>
{`Appareil        : ${result.registration}
Masse a vide    : ${result.config.emptyWeight}kg  CG: ${result.config.emptyCG}m
Carburant       : ${result.usableFuelKg}kg (${fuel}L)
Zero Fuel Wt    : ${result.zeroFuelWeight}kg  CG: ${result.zeroFuelCG}m
Masse decollage : ${result.takeoffWeight}kg  CG: ${result.takeoffCG.toFixed(3)}m
Masse atterr.   : ${result.landingWeight}kg  CG: ${result.landingCG.toFixed(3)}m
MTOW            : ${result.config.mtow}kg  marge: ${result.marginToMTOW}kg
MZFW            : ${result.config.mzfw}kg  marge: ${result.marginToMZFW}kg
Limites CG      : ${result.config.cgLimits.forward}m -> ${result.config.cgLimits.aft}m`}
              </pre>
            )}
          </div>
        )}

        <div style={{ padding:'10px 14px', borderRadius:8, background:'#fef9c3', border:'1px solid #fde68a', fontSize:10, color:'#78350f', lineHeight:1.6 }}>
          <strong>IMPORTANT</strong> — Valeurs constructeur indicatives. A valider par le chef pilote sur les AFM et fiches de pesee officielles. Ne remplace pas la verification DGAC/OSAC obligatoire.
        </div>

      </div>
    </div>
  )
}