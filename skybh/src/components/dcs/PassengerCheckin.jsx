import { useState, useEffect, useRef } from 'react'
import { useDCS } from '../../hooks/useDCS'

const NAVY = '#0B1F3A', GOLD = '#C8A951', GREEN = '#16a34a', RED = '#dc2626', ORANGE = '#ea580c'
const MAX_SEATS = 9

const STATUS_CONFIG = {
  confirmed:  { label: 'Confirmé', bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
  checked_in: { label: 'Checké',   bg: '#dcfce7', color: GREEN,     border: '#86efac' },
  boarded:    { label: 'Embarqué', bg: '#f0fdf4', color: '#15803d', border: '#4ade80' },
  no_show:    { label: 'No-show',  bg: '#fee2e2', color: RED,       border: '#fca5a5' },
  cancelled:  { label: 'Annulé',   bg: '#f5f5f5', color: '#999',    border: '#ddd'    },
}

function StatusBadge({ status }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.confirmed
  return <span style={{ padding:'3px 10px', borderRadius:999, fontSize:11, fontWeight:700, background:c.bg, color:c.color, border:`1px solid ${c.border}` }}>{c.label}</span>
}

function SeatPicker({ value, onChange, occupiedSeats = [] }) {
  return (
    <div>
      <div style={{ fontSize:10, fontWeight:700, color:GOLD, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:8 }}>Siège</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6 }}>
        <button onClick={() => onChange(null)} style={{ gridColumn:'span 5', padding:'7px', borderRadius:8, fontSize:11, fontWeight:700, border:`2px solid ${!value?NAVY:'#e5e5e0'}`, background:!value?NAVY:'#f8f8f6', color:!value?'white':'#888', cursor:'pointer' }}>
          Non attribué
        </button>
        {Array.from({length:MAX_SEATS},(_,i)=>i+1).map(seat => {
          const s = String(seat)
          const occupied = occupiedSeats.includes(s) && s !== value
          const selected = value === s
          return (
            <button key={seat} onClick={() => !occupied && onChange(s)} disabled={occupied} style={{ padding:'10px 0', borderRadius:8, fontSize:13, fontWeight:800, border:`2px solid ${selected?GOLD:occupied?'#f0f0ec':'#e5e5e0'}`, background:selected?GOLD:occupied?'#f9f9f7':'white', color:selected?NAVY:occupied?'#ccc':NAVY, cursor:occupied?'not-allowed':'pointer' }}>
              {seat}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PassengerCard({ booking, onCheckIn, onBoard, onNoShow, onRemove, expanded, onToggle, occupiedSeats }) {
  const [baggageWeight, setBaggageWeight] = useState(booking.baggageWeight || 0)
  const [seatNumber,    setSeatNumber]    = useState(booking.seatNumber || null)
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const canCheckIn = booking.status === 'confirmed'
  const canBoard   = booking.status === 'checked_in'
  const canNoShow  = ['confirmed','checked_in'].includes(booking.status)
  const canRemove  = booking.status !== 'cancelled'
  const isActive   = ['confirmed','checked_in','boarded'].includes(booking.status)

  const displayName = (booking.lastName || booking.firstName)
    ? `${(booking.lastName||'').toUpperCase()} ${booking.firstName||''}`.trim()
    : 'Passager inconnu'
  const initials = booking.lastName?.[0] || booking.firstName?.[0] || '?'

  const doAction = async (fn) => {
    setActionLoading(true)
    try { await fn() } catch { /* erreur gérée par le hook */ } finally { setActionLoading(false) }
  }

  return (
    <div style={{ background:'white', borderRadius:12, marginBottom:10, border:`2px solid ${expanded?GOLD:'#e5e5e0'}`, opacity:isActive?1:0.55, transition:'border-color 0.2s' }}>
      <div onClick={onToggle} style={{ padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:'50%', flexShrink:0, background:booking.status==='boarded'?GREEN:booking.status==='checked_in'?'#dbeafe':booking.status==='no_show'?'#fee2e2':'#f0f0ec', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:booking.status==='boarded'?'white':booking.status==='checked_in'?NAVY:'#888' }}>
            {initials.toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:15, color:NAVY }}>{displayName}</div>
            <div style={{ fontSize:11, color:'#888', marginTop:1 }}>
              {booking.docNumber || 'Doc non renseigné'}
              {booking.baggageWeight>0 && ` · ${booking.baggageWeight} kg`}
              {booking.seatNumber && ` · Siège ${booking.seatNumber}`}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <StatusBadge status={booking.status}/>
          <span style={{ color:'#bbb', fontSize:18 }}>{expanded?'▲':'▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop:'1px solid #f0f0ec', padding:'14px 16px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            {[['Nationalité',booking.nationality||'—'],['Document',booking.docType||'—'],['Numéro doc',booking.docNumber||'—'],['Siège',booking.seatNumber||'Non attribué']].map(([label,value]) => (
              <div key={label} style={{ background:'#f8f8f6', borderRadius:8, padding:'8px 10px' }}>
                <div style={{ fontSize:10, color:'#888', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em' }}>{label}</div>
                <div style={{ fontSize:13, fontWeight:700, color:NAVY, marginTop:2 }}>{value}</div>
              </div>
            ))}
          </div>

          {canCheckIn && (
            <>
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:10, fontWeight:700, color:GOLD, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8 }}>Poids bagages</div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <button onClick={() => setBaggageWeight(Math.max(0,baggageWeight-1))} style={{ width:36, height:36, borderRadius:8, border:'1px solid #ddd', background:'#f8f8f6', fontSize:18, fontWeight:700, cursor:'pointer' }}>−</button>
                  <input type="number" value={baggageWeight} min={0} max={100} onChange={e => setBaggageWeight(Math.max(0,Number(e.target.value)))} style={{ flex:1, padding:'8px', borderRadius:8, border:'2px solid #e5e5e0', fontSize:20, fontWeight:800, textAlign:'center', color:NAVY }} />
                  <button onClick={() => setBaggageWeight(baggageWeight+1)} style={{ width:36, height:36, borderRadius:8, border:'1px solid #ddd', background:'#f8f8f6', fontSize:18, fontWeight:700, cursor:'pointer' }}>+</button>
                  <span style={{ fontSize:13, color:'#666' }}>kg</span>
                </div>
                {baggageWeight>10 && <div style={{ marginTop:6, fontSize:11, color:ORANGE, fontWeight:600 }}>⚠ Excédent : {baggageWeight-10} kg (franchise 10 kg)</div>}
              </div>
              <div style={{ marginBottom:16 }}>
                <SeatPicker value={seatNumber} onChange={setSeatNumber} occupiedSeats={occupiedSeats}/>
              </div>
            </>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {canCheckIn && (
              <button onClick={() => doAction(() => onCheckIn(booking.id,{baggageWeight,seatNumber}))} disabled={actionLoading} style={{ padding:'14px', borderRadius:10, border:'none', background:NAVY, color:'white', fontSize:15, fontWeight:800, cursor:'pointer', opacity:actionLoading?0.6:1 }}>
                {actionLoading?'...':'✓ CHECK-IN'}
              </button>
            )}
            {canBoard && (
              <button onClick={() => doAction(() => onBoard(booking.id))} disabled={actionLoading} style={{ padding:'14px', borderRadius:10, border:'none', background:GREEN, color:'white', fontSize:15, fontWeight:800, cursor:'pointer', opacity:actionLoading?0.6:1 }}>
                {actionLoading?'...':'✈ EMBARQUER'}
              </button>
            )}
            {canNoShow && (
              <button onClick={() => doAction(() => onNoShow(booking.id))} disabled={actionLoading} style={{ padding:'12px', borderRadius:10, border:`2px solid ${RED}`, background:'white', color:RED, fontSize:13, fontWeight:700, cursor:'pointer', opacity:actionLoading?0.6:1 }}>
                NO-SHOW
              </button>
            )}
            {canRemove && !confirmRemove && (
              <button onClick={() => setConfirmRemove(true)} style={{ padding:'10px', borderRadius:10, border:'1px solid #e0e0e0', background:'#fafafa', color:'#999', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                🗑 Retirer du vol
              </button>
            )}
            {confirmRemove && (
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => doAction(() => onRemove(booking.id))} disabled={actionLoading} style={{ flex:1, padding:'12px', borderRadius:10, border:'none', background:RED, color:'white', fontSize:13, fontWeight:800, cursor:'pointer', opacity:actionLoading?0.6:1 }}>
                  {actionLoading?'...':'✓ Confirmer'}
                </button>
                <button onClick={() => setConfirmRemove(false)} style={{ padding:'12px 16px', borderRadius:10, border:'1px solid #ddd', background:'white', color:'#666', fontSize:13, cursor:'pointer', fontWeight:600 }}>
                  Annuler
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function WalkInForm({ onSubmit, onClose, occupiedSeats }) {
  const [form, setForm] = useState({ lastName:'', firstName:'', nationality:'FR', documentType:'passport', documentNumber:'', baggageWeight:0, seatNumber:null })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const set = (key,value) => setForm(prev => ({...prev,[key]:value}))
  const isValid = form.lastName.trim() && form.firstName.trim() && form.documentNumber.trim()

  const handleSubmit = async () => {
    if (!isValid) return
    setLoading(true); setError(null)
    try { await onSubmit(form) }
    catch (err) { setError(err.message); setLoading(false) }
  }

  const inp = { width:'100%', padding:'10px 12px', borderRadius:8, border:'2px solid #e5e5e0', fontSize:14, color:NAVY, fontWeight:600, boxSizing:'border-box' }
  const lbl = { fontSize:10, fontWeight:700, color:GOLD, letterSpacing:'0.1em', textTransform:'uppercase', display:'block', marginBottom:6 }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'flex-end', zIndex:100 }}>
      <div style={{ background:'white', borderRadius:'20px 20px 0 0', padding:24, width:'100%', maxHeight:'92vh', overflowY:'auto', boxSizing:'border-box' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:10, color:GOLD, fontWeight:700, letterSpacing:'0.1em' }}>PASSAGER WALK-IN</div>
            <div style={{ fontSize:18, fontWeight:800, color:NAVY }}>Nouveau passager</div>
          </div>
          <button onClick={onClose} style={{ width:36, height:36, borderRadius:'50%', border:'1px solid #ddd', background:'#f8f8f6', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>
        {error && <div style={{ padding:'10px 14px', borderRadius:8, background:'#fee2e2', color:RED, fontSize:13, marginBottom:14 }}>✗ {error}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div><label style={lbl}>Nom *</label><input style={inp} value={form.lastName} onChange={e => set('lastName',e.target.value.toUpperCase())} placeholder="DUPONT"/></div>
            <div><label style={lbl}>Prénom *</label><input style={inp} value={form.firstName} onChange={e => set('firstName',e.target.value)} placeholder="Jean"/></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={lbl}>Nationalité</label>
              <select style={inp} value={form.nationality} onChange={e => set('nationality',e.target.value)}>
                {['FR','US','GB','DE','NL','BE','CH','CA','BR','MQ','GP','SX','AW','IT','ES','PT'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Type document</label>
              <select style={inp} value={form.documentType} onChange={e => set('documentType',e.target.value)}>
                <option value="passport">Passeport</option>
                <option value="id_card">CNI</option>
                <option value="residence_permit">Titre séjour</option>
                <option value="driving_license">Permis conduire</option>
              </select>
            </div>
          </div>
          <div><label style={lbl}>Numéro document *</label><input style={inp} value={form.documentNumber} onChange={e => set('documentNumber',e.target.value.toUpperCase())} placeholder="AB123456"/></div>
          <div>
            <label style={lbl}>Bagages (kg)</label>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={() => set('baggageWeight',Math.max(0,form.baggageWeight-1))} style={{ width:36, height:36, borderRadius:8, border:'1px solid #ddd', background:'#f8f8f6', fontSize:18, cursor:'pointer', fontWeight:700 }}>−</button>
              <input type="number" value={form.baggageWeight} min={0} max={50} onChange={e => set('baggageWeight',Math.max(0,Number(e.target.value)))} style={{ flex:1, padding:'8px', borderRadius:8, border:'2px solid #e5e5e0', fontSize:18, fontWeight:800, textAlign:'center', color:NAVY }}/>
              <button onClick={() => set('baggageWeight',form.baggageWeight+1)} style={{ width:36, height:36, borderRadius:8, border:'1px solid #ddd', background:'#f8f8f6', fontSize:18, cursor:'pointer', fontWeight:700 }}>+</button>
              <span style={{ fontSize:13, color:'#666' }}>kg</span>
            </div>
            {form.baggageWeight>10 && <div style={{ marginTop:6, fontSize:11, color:ORANGE, fontWeight:600 }}>⚠ Excédent : {form.baggageWeight-10} kg</div>}
          </div>
          <SeatPicker value={form.seatNumber} onChange={v => set('seatNumber',v)} occupiedSeats={occupiedSeats}/>
          <button onClick={handleSubmit} disabled={!isValid||loading} style={{ padding:'16px', borderRadius:12, border:'none', background:isValid?NAVY:'#ddd', color:isValid?'white':'#999', fontSize:15, fontWeight:800, cursor:isValid?'pointer':'not-allowed', letterSpacing:'0.05em' }}>
            {loading?'ENREGISTREMENT...':'+ AJOUTER AU VOL'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PassengerCheckin({ flight, onBookingsChange }) {
  const flightId = flight?.id
  const { bookings, manifest, stats, loading, error, occupiedSeats, searchPassengers, clearSearch, handleCheckIn, handleBoard, handleNoShow, handleCancel, handleWalkIn, handleGenerateManifest, handleCloseManifest, handleDeparture, clearError } = useDCS(flightId, flight)

  const [search,     setSearch]     = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [showWalkIn, setShowWalkIn] = useState(false)
  const [filter,     setFilter]     = useState('all')
  const searchTimer = useRef(null)

  useEffect(() => { onBookingsChange?.(bookings) }, [bookings])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (search.length >= 2) searchTimer.current = setTimeout(() => searchPassengers(search), 300)
    else clearSearch()
    return () => clearTimeout(searchTimer.current)
  }, [search])

  const filteredBookings = bookings.filter(b => {
    if (filter !== 'all' && b.status !== filter) return false
    if (search.length >= 2) {
      const q = search.toLowerCase()
      return b.lastName?.toLowerCase().includes(q) || b.firstName?.toLowerCase().includes(q) || b.docNumber?.toLowerCase().includes(q)
    }
    return true
  })

  const manifestClosed = manifest?.status === 'closed' || manifest?.status === 'departed'

  if (!flight) return (
    <div style={{ padding:32, textAlign:'center', color:'#888' }}>
      <div style={{ fontSize:40, marginBottom:12 }}>✈</div>
      <div style={{ fontSize:16, fontWeight:700, color:NAVY }}>Aucun vol sélectionné</div>
      <div style={{ fontSize:13, marginTop:6 }}>Sélectionnez un vol pour démarrer le check-in</div>
    </div>
  )

  const flightNumber = flight.flightNumber || flight.flight_number || '--'
  const registration = flight.registration || flight.aircraft      || '--'
  const origin       = flight.origin       || '--'
  const destination  = flight.destination  || '--'
  const depTime = flight.scheduledDeparture?.toDate?.() || flight.departure_time?.toDate?.() || null
  const depStr  = depTime ? depTime.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '--:--'

  return (
    <div style={{ fontFamily:'Helvetica Neue, sans-serif', maxWidth:520, margin:'0 auto', color:NAVY }}>
      <div style={{ background:NAVY, padding:'16px 20px', borderRadius:'0 0 16px 16px', marginBottom:16 }}>
        <div style={{ fontSize:10, color:GOLD, fontWeight:700, letterSpacing:'0.12em', marginBottom:2 }}>CHECK-IN</div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:22, fontWeight:900, color:'white', letterSpacing:'0.05em' }}>{flightNumber}</div>
            <div style={{ fontSize:13, color:GOLD, marginTop:2 }}>{origin} → {destination} · {registration}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:18, fontWeight:800, color:'white' }}>{depStr}</div>
            <div style={{ marginTop:4, padding:'3px 10px', borderRadius:999, fontSize:10, fontWeight:700, background:manifest?.status==='departed'?'#dcfce7':manifest?.status==='closed'?'#fef9c3':'rgba(255,255,255,0.15)', color:manifest?.status==='departed'?GREEN:manifest?.status==='closed'?'#92400e':'white' }}>
              {manifest?.status==='departed'?'PARTI':manifest?.status==='closed'?'CLÔTURÉ':'OUVERT'}
            </div>
          </div>
        </div>
        {stats && (
          <div style={{ display:'flex', gap:12, marginTop:14, paddingTop:12, borderTop:'1px solid rgba(255,255,255,0.1)' }}>
            {[{label:'Total',value:stats.total,color:'white'},{label:'Checkés',value:stats.checkedIn,color:'#86efac'},{label:'Embarqués',value:stats.boarded,color:GOLD},{label:'Bagages',value:`${stats.totalBaggage} kg`,color:'#93c5fd'}].map(({label,value,color}) => (
              <div key={label} style={{ flex:1, textAlign:'center' }}>
                <div style={{ fontSize:18, fontWeight:900, color }}>{value}</div>
                <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)', fontWeight:600, textTransform:'uppercase' }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding:'0 16px' }}>
        {error && (
          <div onClick={clearError} style={{ padding:'12px 16px', borderRadius:10, background:'#fee2e2', border:'1px solid #fca5a5', color:RED, fontSize:13, fontWeight:600, marginBottom:14, cursor:'pointer' }}>
            ✗ {error} <span style={{ float:'right', opacity:0.5 }}>✕</span>
          </div>
        )}

        <div style={{ display:'flex', gap:8, marginBottom:14 }}>
          <div style={{ flex:1, position:'relative' }}>
            <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#bbb', fontSize:16 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, prénom ou numéro doc..." style={{ width:'100%', padding:'12px 12px 12px 38px', borderRadius:10, border:'2px solid #e5e5e0', fontSize:14, color:NAVY, boxSizing:'border-box' }}/>
          </div>
          {!manifestClosed && (
            <button onClick={() => setShowWalkIn(true)} style={{ padding:'12px 16px', borderRadius:10, border:'none', background:GOLD, color:NAVY, fontSize:13, fontWeight:800, cursor:'pointer', whiteSpace:'nowrap' }}>+ Walk-in</button>
          )}
        </div>

        <div style={{ display:'flex', gap:6, marginBottom:16, overflowX:'auto', paddingBottom:4 }}>
          {[
            {value:'all',       label:`Tous (${bookings.length})`},
            {value:'confirmed', label:`Confirmés (${stats?.confirmed||0})`},
            {value:'checked_in',label:`Checkés (${stats?.checkedIn||0})`},
            {value:'boarded',   label:`Embarqués (${stats?.boarded||0})`},
            {value:'no_show',   label:`No-show (${stats?.noShow||0})`},
          ].map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)} style={{ padding:'6px 12px', borderRadius:999, border:`1.5px solid ${filter===f.value?NAVY:'#e5e5e0'}`, background:filter===f.value?NAVY:'white', color:filter===f.value?'white':'#666', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>{f.label}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#888' }}>Chargement...</div>
        ) : filteredBookings.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#888' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>👤</div>
            <div style={{ fontWeight:700, color:NAVY }}>{search?'Aucun passager trouvé':'Aucune réservation'}</div>
          </div>
        ) : filteredBookings.map(booking => (
          <PassengerCard
            key={booking.id}
            booking={booking}
            expanded={expandedId === booking.id}
            onToggle={() => setExpandedId(prev => prev === booking.id ? null : booking.id)}
            onCheckIn={handleCheckIn}
            onBoard={handleBoard}
            onNoShow={handleNoShow}
            onRemove={handleCancel}
            occupiedSeats={occupiedSeats}
          />
        ))}

        {!manifestClosed && bookings.filter(b => b.status !== 'cancelled').length > 0 && (
          <div style={{ marginTop:20, display:'flex', flexDirection:'column', gap:8 }}>
            <button onClick={handleGenerateManifest} style={{ padding:'14px', borderRadius:12, border:`2px solid ${NAVY}`, background:'white', color:NAVY, fontSize:14, fontWeight:800, cursor:'pointer' }}>
              ↻ Regénérer manifeste
            </button>
            {stats?.checkedIn > 0 && (
              <button onClick={handleCloseManifest} style={{ padding:'14px', borderRadius:12, border:'none', background:GOLD, color:NAVY, fontSize:14, fontWeight:800, cursor:'pointer' }}>
                🔒 Clôturer le vol
              </button>
            )}
          </div>
        )}

        {manifest?.status === 'closed' && (
          <div style={{ marginTop:20 }}>
            <button onClick={handleDeparture} style={{ width:'100%', padding:'18px', borderRadius:12, border:'none', background:GREEN, color:'white', fontSize:16, fontWeight:900, cursor:'pointer', letterSpacing:'0.05em' }}>
              ✈ DÉPART — CONFIRMER
            </button>
          </div>
        )}
      </div>

      {showWalkIn && (
        <WalkInForm
          onSubmit={async (formData) => { await handleWalkIn(formData,{baggageWeight:formData.baggageWeight,seatNumber:formData.seatNumber}); setShowWalkIn(false); setSearch('') }}
          onClose={() => setShowWalkIn(false)}
          occupiedSeats={occupiedSeats}
        />
      )}
    </div>
  )
}