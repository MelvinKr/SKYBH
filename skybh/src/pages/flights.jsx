/**
 * @fileoverview Page Vols enrichie — SKYBH
 * Liste vols · Manifeste · Checklist · Briefing · Retards · OTP
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useFlightOps } from '../hooks/use-flight-ops'
import {
  getFlightOTPStatus, computeWB, DELAY_CODES,
  CHECKLIST_CATEGORIES, OTP_THRESHOLD_MIN, otpColor,
} from '../utils/otp-calculator'
import { AIRPORTS_FULL } from '../services/flights'

// ── Helpers ────────────────────────────────────────────────────────────────────
const toDate   = ts  => ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null)
const fmtTime  = d   => d?.toLocaleTimeString?.('fr-FR', { hour:'2-digit', minute:'2-digit' }) || '—'
const fmtDate  = d   => d?.toLocaleDateString?.('fr-FR', { day:'numeric', month:'short' }) || '—'
const today    = ()  => { const d = new Date(); d.setHours(0,0,0,0); return d }
const isTodayFn= d   => d && d.toDateString() === new Date().toDateString()

const STATUS_COLORS = {
  landed:    { bg:'rgba(16,185,129,0.12)',  border:'#4ADE80', text:'#34D399', label:'Atterri'       },
  in_flight: { bg:'rgba(245,158,11,0.12)',  border:'#F0B429', text:'#FCD34D', label:'En vol'         },
  scheduled: { bg:'rgba(17,45,82,0.9)',     border:'#3B82F6', text:'#93C5FD', label:'Programmé'      },
  boarding:  { bg:'rgba(70,35,0,0.9)',      border:'#FB923C', text:'#FB923C', label:'Embarquement'   },
  cancelled: { bg:'rgba(50,10,10,0.85)',    border:'#F87171', text:'#F87171', label:'Annulé'         },
}

const PAX_STATUS = {
  confirmed:  { color:'#5B8DB8', label:'Confirmé',     icon:'🎫' },
  checked_in: { color:'#F0B429', label:'Enregistré',   icon:'✅' },
  boarded:    { color:'#4ADE80', label:'À bord',        icon:'🛫' },
  no_show:    { color:'#F87171', label:'No-show',       icon:'🚫' },
  offloaded:  { color:'#EF4444', label:'Débarqué',      icon:'⬇️' },
}
const PAX_TYPE  = { adult:'Adulte', child:'Enfant', infant:'Nourrisson', crew:'Équipage' }

// ── Composants partagés ────────────────────────────────────────────────────────
function Card({ children, style={} }) {
  return <div style={{ backgroundColor:'#0A1628', border:'1px solid #1E3A5F', borderRadius:14, overflow:'hidden', ...style }}>{children}</div>
}
function Badge({ label, color }) {
  const c = typeof color === 'string' ? { bg:'transparent', border:color, text:color } : color
  return <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99,
    backgroundColor:c.bg||'transparent', border:`1px solid ${c.border||c}`, color:c.text||c, whiteSpace:'nowrap' }}>{label}</span>
}
function FormField({ label, children }) {
  return (
    <div>
      <label style={{ fontSize:10, color:'#5B8DB8', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</label>
      {children}
    </div>
  )
}
const inputStyle  = { width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid #1E3A5F', backgroundColor:'#071729', color:'#F1F5F9', fontSize:12, boxSizing:'border-box' }
const selectStyle = { ...inputStyle, cursor:'pointer' }

// ── OTPBadge ──────────────────────────────────────────────────────────────────
function OTPBadge({ flight }) {
  const otp = getFlightOTPStatus(flight)
  return <Badge label={otp.label} color={otp.color}/>
}

// ── FlightCard (liste vols) ────────────────────────────────────────────────────
function FlightCard({ flight, pax, onClick }) {
  const sc     = STATUS_COLORS[flight.status] || STATUS_COLORS.scheduled
  const otp    = getFlightOTPStatus(flight)
  const dep    = toDate(flight.departure_time)
  const arr    = toDate(flight.arrival_time)
  const paxCount    = pax?.filter(p => p.status !== 'no_show').length || flight.pax_count || 0
  const maxPax      = flight.max_pax || 9
  const isFull      = paxCount >= maxPax
  const boardedCount= pax?.filter(p => p.status === 'boarded').length || 0

  return (
    <div onClick={onClick} style={{
      padding:16, borderRadius:14, border:`1.5px solid ${sc.border}30`,
      backgroundColor:'#0A1628', cursor:'pointer', transition:'all 0.15s',
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = sc.border}
    onMouseLeave={e => e.currentTarget.style.borderColor = `${sc.border}30`}>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:16, color:'#F1F5F9' }}>{flight.flight_number}</span>
          <Badge label={sc.label} color={sc}/>
          <OTPBadge flight={flight}/>
          {isFull && <Badge label="FULL 🔴" color="#EF4444"/>}
          {flight.dispatch_cleared && <Badge label="✅ Dispatch" color="#4ADE80"/>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, color:'#5B8DB8' }}>{flight.aircraft || '—'}</span>
          <span style={{ fontSize:11, color:'#475569' }}>{flight.pilot || '—'}</span>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontFamily:'monospace', fontWeight:800, fontSize:18, color:'#F1F5F9' }}>
            {AIRPORTS_FULL[flight.origin]?.short || flight.origin}
          </div>
          <div style={{ fontSize:10, color:'#475569' }}>{fmtTime(dep)}</div>
        </div>
        <div style={{ flex:1, textAlign:'center' }}>
          <div style={{ height:1, background:`linear-gradient(90deg,${sc.border}40,${sc.border},${sc.border}40)`, marginBottom:4 }}/>
          {flight.delay_minutes > 0 && (
            <span style={{ fontSize:10, color:'#F59E0B', fontFamily:'monospace' }}>+{flight.delay_minutes}min</span>
          )}
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontFamily:'monospace', fontWeight:800, fontSize:18, color:'#F1F5F9' }}>
            {AIRPORTS_FULL[flight.destination]?.short || flight.destination}
          </div>
          <div style={{ fontSize:10, color:'#475569' }}>{fmtTime(arr)}</div>
        </div>
      </div>

      {/* Barre PAX */}
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          <span style={{ fontSize:10, color:'#475569' }}>
            PAX : {paxCount}/{maxPax}
            {boardedCount > 0 && <span style={{ color:'#4ADE80', marginLeft:6 }}>· {boardedCount} à bord</span>}
          </span>
          <span style={{ fontSize:10, color: isFull ? '#EF4444' : '#475569' }}>
            {Math.round(paxCount/maxPax*100)}%
          </span>
        </div>
        <div style={{ height:5, backgroundColor:'#1E3A5F', borderRadius:3 }}>
          <div style={{ height:'100%', borderRadius:3, transition:'width 0.4s',
            width:`${Math.min(100,paxCount/maxPax*100)}%`,
            backgroundColor: isFull ? '#EF4444' : paxCount/maxPax > 0.8 ? '#F0B429' : '#3B82F6' }}/>
        </div>
      </div>
    </div>
  )
}

// ── PassengersTab ──────────────────────────────────────────────────────────────
function PassengersTab({ flight, pax, fleet, onAddPax, onCheckIn, onNoShow, onBoard, onDeletePax }) {
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [form, setForm] = useState({ last_name:'', first_name:'', weight_kg:80, baggage_kg:10, pax_type:'adult', seat:'', booking_ref:'', notes:'' })

  const aircraft = fleet?.find(a => a.registration === flight.aircraft)
  const wb       = useMemo(() => computeWB(pax.filter(p=>p.status!=='no_show'), aircraft), [pax, aircraft])

  const confirmed  = pax.filter(p => p.status === 'confirmed')
  const checkedIn  = pax.filter(p => p.status === 'checked_in')
  const boarded    = pax.filter(p => p.status === 'boarded')
  const noShows    = pax.filter(p => p.status === 'no_show')
  const active     = pax.filter(p => !['no_show','offloaded'].includes(p.status))
  const maxPax     = flight.max_pax || 9
  const isFull     = active.length >= maxPax

  const handleSave = async () => {
    if (!form.last_name) return
    setSaving(true)
    try {
      await onAddPax({
        ...form,
        weight_kg:   Number(form.weight_kg)   || 80,
        baggage_kg:  Number(form.baggage_kg)  || 10,
        flight_id:   flight.id,
        flight_number: flight.flight_number,
      })
      setShowForm(false)
      setForm({ last_name:'', first_name:'', weight_kg:80, baggage_kg:10, pax_type:'adult', seat:'', booking_ref:'', notes:'' })
    } finally { setSaving(false) }
  }

  // Impression manifeste
  const printManifest = () => {
    const dep = toDate(flight.departure_time)
    const rows = pax.filter(p=>p.status!=='no_show').map(p =>
      `<tr><td>${p.last_name?.toUpperCase()}</td><td>${p.first_name}</td><td>${PAX_TYPE[p.pax_type]||p.pax_type}</td><td>${p.weight_kg||80}kg</td><td>${p.baggage_kg||10}kg</td><td>${p.seat||'—'}</td><td>${(PAX_STATUS[p.status]?.label)||p.status}</td></tr>`
    ).join('')
    const html = `<!DOCTYPE html><html><head><title>Manifeste ${flight.flight_number}</title>
    <style>body{font-family:Arial;font-size:12px;padding:20px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:6px} th{background:#f0f0f0} h2{margin-bottom:4px} .meta{color:#555;font-size:11px;margin-bottom:16px}</style></head>
    <body><h2>MANIFESTE PASSAGERS — ${flight.flight_number}</h2>
    <div class="meta">${AIRPORTS_FULL[flight.origin]?.short||flight.origin} → ${AIRPORTS_FULL[flight.destination]?.short||flight.destination} · ${fmtTime(dep)} · ${flight.aircraft||'—'} · ${fmtDate(dep)}</div>
    <table><thead><tr><th>NOM</th><th>PRÉNOM</th><th>TYPE</th><th>POIDS</th><th>BAGAGE</th><th>SIÈGE</th><th>STATUT</th></tr></thead><tbody>${rows}</tbody></table>
    <p style="margin-top:16px;font-size:11px">Masse totale pax+bagages : ${wb.paxWeight}kg · TOW estimé : ${wb.totalWeight}kg / ${wb.maxTOW}kg</p>
    <script>window.print()</script></body></html>`
    const w = window.open('','_blank'); w.document.write(html); w.document.close()
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* W&B summary */}
      <Card style={{ padding:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            {[
              { label:'PAX actifs',    value:`${active.length}/${maxPax}`, color: isFull ? '#EF4444' : '#F1F5F9' },
              { label:'Enregistrés',   value: checkedIn.length + boarded.length, color:'#F0B429' },
              { label:'À bord',        value: boarded.length,  color:'#4ADE80' },
              { label:'No-show',       value: noShows.length,  color:'#F87171' },
              { label:'Masse pax+bag', value:`${wb.paxWeight}kg`, color:'#94A3B8' },
              { label:'TOW estimé',    value:`${wb.totalWeight}kg`, color: wb.statusColor },
            ].map(k => (
              <div key={k.label} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:'monospace', fontSize:18, fontWeight:900, color:k.color, lineHeight:1 }}>{k.value}</div>
                <div style={{ fontSize:9, color:'#475569', marginTop:2 }}>{k.label}</div>
              </div>
            ))}
          </div>
          {/* W&B barre */}
          <div style={{ minWidth:160 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:10, color:'#5B8DB8' }}>W&B</span>
              <span style={{ fontSize:10, fontWeight:700, color: wb.statusColor }}>{wb.loadPct}%</span>
            </div>
            <div style={{ height:8, backgroundColor:'#1E3A5F', borderRadius:4 }}>
              <div style={{ height:'100%', borderRadius:4, width:`${Math.min(100,wb.loadPct)}%`,
                background:`linear-gradient(90deg,${wb.statusColor}70,${wb.statusColor})`, transition:'width 0.5s' }}/>
            </div>
            <div style={{ fontSize:9, color: wb.statusColor, marginTop:3 }}>
              {wb.status === 'over'     && '⚠️ SURCHARGE — Vol impossible'}
              {wb.status === 'critical' && `⚠️ Marge critique : +${wb.margin}kg`}
              {wb.status === 'warning'  && `⚠️ Marge faible : +${wb.margin}kg`}
              {wb.status === 'ok'       && `✅ Marge : +${wb.margin}kg`}
            </div>
          </div>
        </div>
      </Card>

      {/* Barre outils */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', gap:6 }}>
          {isFull && (
            <span style={{ fontSize:11, fontWeight:700, padding:'6px 12px', borderRadius:8,
              backgroundColor:'rgba(239,68,68,0.15)', color:'#F87171', border:'1px solid rgba(239,68,68,0.3)' }}>
              🔴 FULL — {active.length}/{maxPax}
            </span>
          )}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={printManifest}
            style={{ fontSize:11, padding:'6px 12px', borderRadius:8, cursor:'pointer',
              backgroundColor:'rgba(99,102,241,0.12)', color:'#A5B4FC', border:'1px solid rgba(99,102,241,0.25)' }}>
            🖨 Manifeste
          </button>
          {!isFull && (
            <button onClick={() => setShowForm(true)}
              style={{ fontSize:11, fontWeight:700, padding:'6px 14px', borderRadius:8, cursor:'pointer',
                backgroundColor:'#F0B429', color:'#0B1F3A', border:'none' }}>
              + Passager
            </button>
          )}
        </div>
      </div>

      {/* Formulaire */}
      {showForm && (
        <Card style={{ padding:18 }}>
          <h3 style={{ color:'#F1F5F9', fontWeight:700, fontSize:14, marginBottom:14 }}>Nouveau passager</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10 }}>
            <FormField label="Nom"><input value={form.last_name} onChange={e=>setForm(v=>({...v,last_name:e.target.value}))} style={inputStyle} placeholder="DUPONT"/></FormField>
            <FormField label="Prénom"><input value={form.first_name} onChange={e=>setForm(v=>({...v,first_name:e.target.value}))} style={inputStyle}/></FormField>
            <FormField label="Type">
              <select value={form.pax_type} onChange={e=>setForm(v=>({...v,pax_type:e.target.value}))} style={selectStyle}>
                {Object.entries(PAX_TYPE).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FormField>
            <FormField label="Poids (kg)"><input type="number" value={form.weight_kg} onChange={e=>setForm(v=>({...v,weight_kg:Number(e.target.value)}))} style={inputStyle}/></FormField>
            <FormField label="Bagage (kg)"><input type="number" value={form.baggage_kg} onChange={e=>setForm(v=>({...v,baggage_kg:Number(e.target.value)}))} style={inputStyle}/></FormField>
            <FormField label="Siège"><input value={form.seat} onChange={e=>setForm(v=>({...v,seat:e.target.value}))} style={inputStyle} placeholder="1A"/></FormField>
            <FormField label="Réf. dossier"><input value={form.booking_ref} onChange={e=>setForm(v=>({...v,booking_ref:e.target.value}))} style={inputStyle}/></FormField>
            <FormField label="Notes"><input value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))} style={inputStyle}/></FormField>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button onClick={() => setShowForm(false)} style={{ padding:'6px 16px', borderRadius:8, fontSize:12, cursor:'pointer',
              backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155' }}>Annuler</button>
            <button onClick={handleSave} disabled={saving||!form.last_name}
              style={{ padding:'6px 20px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                backgroundColor:'#F0B429', color:'#0B1F3A', border:'none', opacity:saving||!form.last_name?0.5:1 }}>
              {saving?'...':'✓ Ajouter'}
            </button>
          </div>
        </Card>
      )}

      {/* Table passagers */}
      {pax.length === 0 && (
        <Card style={{ padding:28, textAlign:'center' }}>
          <p style={{ color:'#2D5580' }}>Aucun passager enregistré pour ce vol.</p>
        </Card>
      )}

      {pax.length > 0 && (
        <Card style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1E3A5F' }}>
                {['Passager','Type','Poids','Bagage','Siège','Réf.','Statut','Actions'].map(h => (
                  <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:9, fontWeight:700,
                    color:'#2D5580', textTransform:'uppercase', letterSpacing:'0.08em', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pax.map(p => {
                const ps = PAX_STATUS[p.status] || PAX_STATUS.confirmed
                return (
                  <tr key={p.id} style={{ borderBottom:'1px solid rgba(30,58,95,0.3)',
                    backgroundColor: p.status==='no_show' ? 'rgba(239,68,68,0.04)' : 'transparent',
                    opacity: p.status==='no_show' ? 0.6 : 1 }}>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ fontWeight:700, fontSize:12, color:'#F1F5F9' }}>{p.last_name?.toUpperCase()} {p.first_name}</div>
                      {p.notes && <div style={{ fontSize:10, color:'#475569' }}>{p.notes}</div>}
                    </td>
                    <td style={{ padding:'10px 14px', fontSize:11, color:'#94A3B8' }}>{PAX_TYPE[p.pax_type]||p.pax_type}</td>
                    <td style={{ padding:'10px 14px', fontSize:11, fontFamily:'monospace', color:'#94A3B8' }}>{p.weight_kg||80}kg</td>
                    <td style={{ padding:'10px 14px', fontSize:11, fontFamily:'monospace', color:'#94A3B8' }}>{p.baggage_kg||10}kg</td>
                    <td style={{ padding:'10px 14px', fontSize:11, fontFamily:'monospace', color:'#F0B429' }}>{p.seat||'—'}</td>
                    <td style={{ padding:'10px 14px', fontSize:10, fontFamily:'monospace', color:'#475569' }}>{p.booking_ref||'—'}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99,
                        backgroundColor:`${ps.color}18`, border:`1px solid ${ps.color}40`, color:ps.color }}>
                        {ps.icon} {ps.label}
                      </span>
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:5 }}>
                        {p.status === 'confirmed'  && <button onClick={() => onCheckIn(p.id)} style={{ ...btnStyle('#F0B429') }}>✅</button>}
                        {p.status === 'checked_in' && <button onClick={() => onBoard(p.id)}   style={{ ...btnStyle('#4ADE80') }}>🛫</button>}
                        {['confirmed','checked_in'].includes(p.status) && (
                          <button onClick={() => onNoShow(p.id)} style={{ ...btnStyle('#F87171') }}>🚫</button>
                        )}
                        <button onClick={() => onDeletePax(p.id)} style={{ ...btnStyle('#64748B') }}>✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

const btnStyle = (color) => ({
  width:26, height:26, borderRadius:6, border:`1px solid ${color}40`,
  cursor:'pointer', backgroundColor:`${color}12`, color, fontSize:12,
  display:'flex', alignItems:'center', justifyContent:'center',
})

// ── ChecklistTab ───────────────────────────────────────────────────────────────
function ChecklistTab({ flight, checklist, onCheckItem, onClearDispatch, onResetDispatch, user }) {
  const items     = checklist?.items || []
  const byCategory= useMemo(() => {
    const map = {}
    items.forEach(i => {
      if (!map[i.category]) map[i.category] = []
      map[i.category].push(i)
    })
    return map
  }, [items])

  const blockingUnchecked = items.filter(i => i.blocking && !i.checked)
  const totalChecked      = items.filter(i => i.checked).length
  const progress          = items.length ? Math.round(totalChecked/items.length*100) : 0
  const isCleared         = checklist?.cleared

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Progress + dispatch */}
      <Card style={{ padding:18 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div style={{ flex:1, minWidth:180 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:12, color:'#94A3B8', fontWeight:600 }}>Checklist dispatch</span>
              <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:700,
                color: progress === 100 ? '#4ADE80' : '#F0B429' }}>
                {totalChecked}/{items.length}
              </span>
            </div>
            <div style={{ height:8, backgroundColor:'#1E3A5F', borderRadius:4, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${progress}%`, borderRadius:4, transition:'width 0.4s',
                background: progress===100 ? 'linear-gradient(90deg,#4ADE8070,#4ADE80)' : 'linear-gradient(90deg,#F0B42970,#F0B429)' }}/>
            </div>
          </div>

          <div>
            {isCleared ? (
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:13, fontWeight:800, color:'#4ADE80' }}>✅ OK TO GO</div>
                  <div style={{ fontSize:10, color:'#5B8DB8' }}>par {checklist.cleared_by}</div>
                </div>
                <button onClick={() => onResetDispatch(flight.id)}
                  style={{ fontSize:10, padding:'5px 10px', borderRadius:7, cursor:'pointer',
                    backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155' }}>
                  Annuler
                </button>
              </div>
            ) : (
              <button
                onClick={() => onClearDispatch(flight.id)}
                disabled={blockingUnchecked.length > 0}
                style={{ fontSize:12, fontWeight:800, padding:'10px 20px', borderRadius:10, cursor: blockingUnchecked.length > 0 ? 'not-allowed' : 'pointer',
                  backgroundColor: blockingUnchecked.length > 0 ? 'rgba(71,85,105,0.2)' : 'rgba(16,185,129,0.15)',
                  color:           blockingUnchecked.length > 0 ? '#334155' : '#34D399',
                  border:          blockingUnchecked.length > 0 ? '1px solid #1E3A5F' : '1px solid rgba(16,185,129,0.35)',
                  opacity:         blockingUnchecked.length > 0 ? 0.5 : 1 }}>
                {blockingUnchecked.length > 0
                  ? `🔒 ${blockingUnchecked.length} item${blockingUnchecked.length>1?'s':''} bloquant${blockingUnchecked.length>1?'s':''}`
                  : '✅ Valider dispatch'}
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Items par catégorie */}
      {Object.entries(CHECKLIST_CATEGORIES).map(([cat, catInfo]) => {
        const catItems = byCategory[cat] || []
        if (!catItems.length) return null
        const catChecked = catItems.filter(i => i.checked).length
        return (
          <Card key={cat}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid #1E3A5F',
              display:'flex', alignItems:'center', justifyContent:'space-between',
              backgroundColor:'rgba(7,23,41,0.6)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:14 }}>{catInfo.icon}</span>
                <span style={{ fontSize:12, fontWeight:700, color:'#F1F5F9' }}>{catInfo.label}</span>
              </div>
              <span style={{ fontSize:10, fontFamily:'monospace', color: catChecked===catItems.length ? '#4ADE80' : '#5B8DB8' }}>
                {catChecked}/{catItems.length}
              </span>
            </div>
            <div style={{ padding:12, display:'flex', flexDirection:'column', gap:6 }}>
              {catItems.map(item => (
                <div key={item.id}
                  onClick={() => !isCleared && onCheckItem(flight.id, item.id, !item.checked)}
                  style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 10px', borderRadius:9,
                    backgroundColor: item.checked ? 'rgba(16,185,129,0.06)' : 'rgba(15,30,53,0.5)',
                    border:`1px solid ${item.checked ? 'rgba(16,185,129,0.2)' : item.blocking ? 'rgba(239,68,68,0.15)' : '#1E3A5F'}`,
                    cursor: isCleared ? 'default' : 'pointer', transition:'all 0.15s' }}>
                  <div style={{ width:18, height:18, borderRadius:5, flexShrink:0, marginTop:1,
                    border:`2px solid ${item.checked ? '#4ADE80' : item.blocking ? '#EF4444' : '#334155'}`,
                    backgroundColor: item.checked ? '#4ADE80' : 'transparent',
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {item.checked && <span style={{ fontSize:10, color:'#0B1F3A', fontWeight:900 }}>✓</span>}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, color: item.checked ? '#94A3B8' : '#F1F5F9',
                      textDecoration: item.checked ? 'line-through' : 'none' }}>
                      {item.label}
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:3 }}>
                      {item.blocking && !item.checked && (
                        <span style={{ fontSize:9, color:'#F87171' }}>🔒 Bloquant</span>
                      )}
                      {item.checked_by && (
                        <span style={{ fontSize:9, color:'#475569' }}>✓ {item.checked_by}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── BriefingTab ────────────────────────────────────────────────────────────────
function BriefingTab({ flight, onUpdateBriefing }) {
  const [notes, setNotes]   = useState(flight.briefing_notes || '')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const timerRef = useRef(null)

  const handleChange = (val) => {
    setNotes(val); setSaved(false)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSaving(true)
      await onUpdateBriefing(flight.id, val)
      setSaving(false); setSaved(true)
    }, 1200)
  }

  const dep    = toDate(flight.departure_time)
  const arr    = toDate(flight.arrival_time)
  const durMin = dep && arr ? Math.round((arr-dep)/60000) : null

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Résumé vol */}
      <Card style={{ padding:18 }}>
        <h3 style={{ color:'#94A3B8', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>
          Résumé vol
        </h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10 }}>
          {[
            { label:'Vol',         value: flight.flight_number },
            { label:'Départ',      value: `${AIRPORTS_FULL[flight.origin]?.short||flight.origin} ${fmtTime(dep)}` },
            { label:'Arrivée',     value: `${AIRPORTS_FULL[flight.destination]?.short||flight.destination} ${fmtTime(arr)}` },
            { label:'Durée',       value: durMin ? `${durMin} min` : '—' },
            { label:'Avion',       value: flight.aircraft || '—' },
            { label:'Commandant',  value: flight.pilot    || '—' },
            { label:'Type de vol', value: flight.flight_type === 'private' ? '✦ Privé' : 'Régulier' },
            { label:'Statut',      value: STATUS_COLORS[flight.status]?.label || flight.status },
          ].map(k => (
            <div key={k.label} style={{ padding:'10px 12px', borderRadius:9, backgroundColor:'rgba(15,30,53,0.6)', border:'1px solid #1E3A5F' }}>
              <div style={{ fontSize:9, color:'#475569', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{k.label}</div>
              <div style={{ fontSize:12, fontWeight:600, color:'#CBD5E1', fontFamily:'monospace' }}>{k.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Notes ops */}
      <Card style={{ padding:18 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <h3 style={{ color:'#94A3B8', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>
            Notes opérationnelles
          </h3>
          <span style={{ fontSize:10, color: saving ? '#F0B429' : saved ? '#4ADE80' : '#475569', fontFamily:'monospace' }}>
            {saving ? '⟳ Sauvegarde...' : saved ? '✓ Sauvegardé' : ''}
          </span>
        </div>
        <textarea
          value={notes}
          onChange={e => handleChange(e.target.value)}
          placeholder="Briefing météo, instructions spéciales, contact ATC, remarques sol, infos passagers VIP..."
          rows={8}
          style={{ ...inputStyle, resize:'vertical', lineHeight:1.6 }}/>
        <div style={{ fontSize:10, color:'#2D5580', marginTop:6 }}>
          Sauvegarde automatique · Visible par l'équipage et les ops
        </div>
      </Card>

      {/* Retard actif */}
      {(flight.delay_minutes > 0) && (
        <Card style={{ padding:16, border:'1px solid rgba(245,158,11,0.3)', backgroundColor:'rgba(245,158,11,0.05)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:20 }}>⏱</span>
            <div>
              <div style={{ fontWeight:700, fontSize:13, color:'#FCD34D' }}>Retard actif : +{flight.delay_minutes} min</div>
              {flight.delay_reason && <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>{flight.delay_reason}</div>}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

// ── DelayTab ───────────────────────────────────────────────────────────────────
function DelayTab({ flight, delays, onReportDelay, user }) {
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [form, setForm] = useState({ reason_code:'weather', delay_minutes:'', reason_detail:'' })

  const flightDelays = delays.filter(d => d.flight_id === flight.id)

  const handleSave = async () => {
    if (!form.delay_minutes || !form.reason_detail) return
    setSaving(true)
    try {
      await onReportDelay({
        flight_id:            flight.id,
        flight_number:        flight.flight_number,
        aircraft_registration:flight.aircraft,
        route:                `${flight.origin}→${flight.destination}`,
        delay_minutes:        Number(form.delay_minutes),
        reason_code:          form.reason_code,
        reason_detail:        form.reason_detail,
      })
      setShowForm(false)
      setForm({ reason_code:'weather', delay_minutes:'', reason_detail:'' })
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          {flight.delay_minutes > 0
            ? <span style={{ fontSize:13, fontWeight:700, color:'#F59E0B' }}>⏱ Retard actuel : +{flight.delay_minutes} min</span>
            : <span style={{ fontSize:13, color:'#4ADE80' }}>✅ Vol à l'heure</span>}
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ fontSize:11, fontWeight:700, padding:'6px 14px', borderRadius:8, cursor:'pointer',
            backgroundColor:'rgba(245,158,11,0.12)', color:'#FCD34D', border:'1px solid rgba(245,158,11,0.3)' }}>
          + Déclarer retard
        </button>
      </div>

      {showForm && (
        <Card style={{ padding:18 }}>
          <h3 style={{ color:'#F1F5F9', fontWeight:700, fontSize:14, marginBottom:14 }}>Déclaration de retard</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
            <FormField label="Cause">
              <select value={form.reason_code} onChange={e=>setForm(v=>({...v,reason_code:e.target.value}))} style={selectStyle}>
                {Object.entries(DELAY_CODES).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </FormField>
            <FormField label="Durée estimée (min)">
              <input type="number" value={form.delay_minutes} onChange={e=>setForm(v=>({...v,delay_minutes:e.target.value}))} style={inputStyle} min={1} placeholder="30"/>
            </FormField>
          </div>
          <div style={{ marginTop:10 }}>
            <FormField label="Détail / explication">
              <textarea value={form.reason_detail} onChange={e=>setForm(v=>({...v,reason_detail:e.target.value}))}
                rows={3} style={{ ...inputStyle, resize:'vertical' }} placeholder="ex: METAR TFFJ plafond < 1500ft, attente amélioration..."/>
            </FormField>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button onClick={() => setShowForm(false)} style={{ padding:'6px 16px', borderRadius:8, fontSize:12, cursor:'pointer',
              backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155' }}>Annuler</button>
            <button onClick={handleSave} disabled={saving||!form.delay_minutes||!form.reason_detail}
              style={{ padding:'6px 20px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                backgroundColor:'#F0B429', color:'#0B1F3A', border:'none',
                opacity:saving||!form.delay_minutes||!form.reason_detail?0.5:1 }}>
              {saving?'...':'✓ Déclarer'}
            </button>
          </div>
        </Card>
      )}

      {flightDelays.length === 0 && (
        <Card style={{ padding:28, textAlign:'center' }}>
          <p style={{ color:'#2D5580' }}>Aucun retard déclaré pour ce vol.</p>
        </Card>
      )}
      {flightDelays.map(d => {
        const dc  = DELAY_CODES[d.reason_code] || DELAY_CODES.other
        const dt  = toDate(d.reported_at)
        return (
          <Card key={d.id} style={{ padding:14 }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
              <div style={{ width:36, height:36, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center',
                backgroundColor:`${dc.color}15`, border:`1px solid ${dc.color}40`, fontSize:18, flexShrink:0 }}>
                {dc.icon}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                  <span style={{ fontFamily:'monospace', fontWeight:800, fontSize:14,
                    color:'#F59E0B' }}>+{d.delay_minutes} min</span>
                  <Badge label={dc.label} color={dc.color}/>
                  {d.resolved_at && <Badge label="Résolu" color="#4ADE80"/>}
                </div>
                <p style={{ fontSize:11, color:'#94A3B8', margin:0, lineHeight:1.5 }}>{d.reason_detail}</p>
                <div style={{ fontSize:10, color:'#5B8DB8', marginTop:4 }}>
                  {dt ? fmtDate(dt) + ' ' + fmtTime(dt) : ''}
                </div>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── OTPTab ─────────────────────────────────────────────────────────────────────
function OTPTab({ flights, otpGlobal, otpByRoute, otpByAircraft, delayCauses }) {
  const totalDelayMin = flights.reduce((s,f) => s+(f.delay_minutes||0), 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* KPI OTP globaux */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12 }}>
        {[
          { label:'Taux OTP',       value:`${otpGlobal.rate}%`,    color:otpColor(otpGlobal.rate) },
          { label:'Vols à l\'heure',value:otpGlobal.onTime,        color:'#4ADE80' },
          { label:'Vols retardés',  value:otpGlobal.delayed,       color:'#F59E0B' },
          { label:'Annulés',        value:otpGlobal.cancelled,     color:'#F87171' },
          { label:'Retard moyen',   value:`${otpGlobal.avgDelay}min`,color:'#94A3B8' },
          { label:'Total retard',   value:`${totalDelayMin}min`,   color:'#64748B' },
        ].map(k => (
          <Card key={k.label} style={{ padding:14, textAlign:'center' }}>
            <div style={{ fontFamily:'monospace', fontSize:22, fontWeight:900, color:k.color, lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:9, color:'#475569', marginTop:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>{k.label}</div>
          </Card>
        ))}
      </div>

      {/* OTP par route */}
      <Card style={{ padding:18 }}>
        <h3 style={{ color:'#94A3B8', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>
          OTP par route
        </h3>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {otpByRoute.length === 0 && <p style={{ color:'#2D5580', fontSize:12 }}>Pas encore de données.</p>}
          {otpByRoute.map(r => (
            <div key={r.route} style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:12, color:'#F1F5F9', minWidth:100 }}>
                {r.route}
              </span>
              <div style={{ flex:1 }}>
                <div style={{ height:8, backgroundColor:'#1E3A5F', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:4, width:`${r.rate}%`,
                    backgroundColor:otpColor(r.rate), transition:'width 0.5s' }}/>
                </div>
              </div>
              <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:12, color:otpColor(r.rate), minWidth:40, textAlign:'right' }}>
                {r.rate}%
              </span>
              <span style={{ fontSize:10, color:'#475569', minWidth:50 }}>
                {r.flights} vol{r.flights!==1?'s':''}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Causes de retard */}
      {delayCauses.length > 0 && (
        <Card style={{ padding:18 }}>
          <h3 style={{ color:'#94A3B8', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>
            Causes de retard
          </h3>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {delayCauses.map(c => (
              <div key={c.code} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:14, width:20 }}>{c.icon}</span>
                <span style={{ fontSize:12, color:'#94A3B8', minWidth:100 }}>{c.label}</span>
                <div style={{ flex:1 }}>
                  <div style={{ height:7, backgroundColor:'#1E3A5F', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:3, width:`${c.pct}%`, backgroundColor:c.color, transition:'width 0.5s' }}/>
                  </div>
                </div>
                <span style={{ fontFamily:'monospace', fontSize:11, fontWeight:700, color:c.color, minWidth:36, textAlign:'right' }}>
                  {c.pct}%
                </span>
                <span style={{ fontSize:10, color:'#475569', minWidth:28 }}>×{c.count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* OTP par avion */}
      {Object.keys(otpByAircraft).length > 0 && (
        <Card style={{ padding:18 }}>
          <h3 style={{ color:'#94A3B8', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>
            OTP par avion
          </h3>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {Object.values(otpByAircraft).sort((a,b)=>b.rate-a.rate).map(ac => (
              <div key={ac.aircraft} style={{ display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:12, color:'#F0B429', minWidth:80 }}>
                  {ac.aircraft}
                </span>
                <div style={{ flex:1 }}>
                  <div style={{ height:7, backgroundColor:'#1E3A5F', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:3, width:`${ac.rate}%`, backgroundColor:otpColor(ac.rate), transition:'width 0.5s' }}/>
                  </div>
                </div>
                <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:12, color:otpColor(ac.rate), minWidth:40, textAlign:'right' }}>
                  {ac.rate}%
                </span>
                <span style={{ fontSize:10, color:'#475569', minWidth:50 }}>
                  {ac.total} vol{ac.total!==1?'s':''}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── FlightDetail ───────────────────────────────────────────────────────────────
const DETAIL_TABS = [
  { id:'pax',       icon:'👥', label:'Passagers'  },
  { id:'checklist', icon:'✅', label:'Checklist'  },
  { id:'briefing',  icon:'📋', label:'Briefing'   },
  { id:'delays',    icon:'⏱',  label:'Retards'    },
]

function FlightDetail({ flight, pax, delays, checklist, fleet, ops, onBack, user }) {
  const [tab, setTab] = useState('pax')
  const sc   = STATUS_COLORS[flight.status] || STATUS_COLORS.scheduled
  const otp  = getFlightOTPStatus(flight)
  const dep  = toDate(flight.departure_time)
  const arr  = toDate(flight.arrival_time)
  const blockingLeft = checklist?.items?.filter(i => i.blocking && !i.checked).length ?? null

  const badges = {
    pax:      pax.filter(p=>p.status==='confirmed').length,   // non encore check-in
    checklist:blockingLeft > 0 ? blockingLeft : 0,
    delays:   delays.filter(d => d.flight_id === flight.id && !d.resolved_at).length,
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Header */}
      <Card style={{ padding:18 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
          <button onClick={onBack} style={{ width:34, height:34, borderRadius:8, border:'1px solid #1E3A5F',
            cursor:'pointer', backgroundColor:'rgba(17,45,82,0.5)', color:'#5B8DB8', fontSize:16,
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>‹</button>

          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:6 }}>
              <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:22, color:'#F1F5F9' }}>{flight.flight_number}</span>
              <Badge label={sc.label} color={sc}/>
              <Badge label={otp.label} color={otp.color}/>
              {flight.dispatch_cleared && <Badge label="✅ Dispatch OK" color="#4ADE80"/>}
              {flight.flight_type === 'private' && <Badge label="✦ Privé" color="#C084FC"/>}
            </div>
            <div style={{ display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
              <span style={{ fontFamily:'monospace', fontSize:16, fontWeight:700, color:'#F1F5F9' }}>
                {AIRPORTS_FULL[flight.origin]?.short||flight.origin}
              </span>
              <span style={{ color:'#1E3A5F', fontSize:16 }}>→</span>
              <span style={{ fontFamily:'monospace', fontSize:16, fontWeight:700, color:'#F1F5F9' }}>
                {AIRPORTS_FULL[flight.destination]?.short||flight.destination}
              </span>
              <span style={{ fontSize:12, color:'#5B8DB8' }}>
                {fmtTime(dep)} → {fmtTime(arr)}
              </span>
            </div>
          </div>

          {/* Mini stats PAX */}
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:'monospace', fontSize:20, fontWeight:900,
                color: pax.filter(p=>!['no_show','offloaded'].includes(p.status)).length >= (flight.max_pax||9) ? '#EF4444' : '#F1F5F9', lineHeight:1 }}>
                {pax.filter(p=>!['no_show','offloaded'].includes(p.status)).length}/{flight.max_pax||9}
              </div>
              <div style={{ fontSize:9, color:'#2D5580' }}>PAX</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:'monospace', fontSize:20, fontWeight:900, color:'#4ADE80', lineHeight:1 }}>
                {pax.filter(p=>p.status==='boarded').length}
              </div>
              <div style={{ fontSize:9, color:'#2D5580' }}>à bord</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, padding:4, backgroundColor:'rgba(7,23,41,0.8)',
        borderRadius:12, border:'1px solid #1E3A5F' }}>
        {DETAIL_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5,
              padding:'9px 10px', borderRadius:9, border:'none', cursor:'pointer', position:'relative',
              backgroundColor: tab===t.id ? '#1E3A5F' : 'transparent',
              color: tab===t.id ? '#F0B429' : '#5B8DB8',
              fontWeight: tab===t.id ? 700 : 500, fontSize:11 }}>
            <span>{t.icon}</span><span>{t.label}</span>
            {badges[t.id] > 0 && (
              <span style={{ position:'absolute', top:4, right:4, width:14, height:14, borderRadius:'50%',
                backgroundColor:'#EF4444', color:'#fff', fontSize:8, fontWeight:900,
                display:'flex', alignItems:'center', justifyContent:'center' }}>{badges[t.id]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {tab === 'pax'       && <PassengersTab flight={flight} pax={pax} fleet={fleet} onAddPax={ops.onAddPax} onCheckIn={ops.onCheckIn} onNoShow={ops.onNoShow} onBoard={ops.onBoard} onDeletePax={ops.onDeletePax}/>}
      {tab === 'checklist' && <ChecklistTab  flight={flight} checklist={checklist} onCheckItem={ops.onCheckItem} onClearDispatch={ops.onClearDispatch} onResetDispatch={ops.onResetDispatch} user={user}/>}
      {tab === 'briefing'  && <BriefingTab   flight={flight} onUpdateBriefing={ops.onUpdateBriefing}/>}
      {tab === 'delays'    && <DelayTab      flight={flight} delays={delays} onReportDelay={ops.onReportDelay} user={user}/>}
    </div>
  )
}

// ── FlightsOverview ────────────────────────────────────────────────────────────
function FlightsOverview({ flights, paxByFlight, otpGlobal, onSelectFlight, onCreateFlight }) {
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRoute,  setFilterRoute]  = useState('')

  const routes   = useMemo(() => [...new Set(flights.map(f=>`${f.origin}→${f.destination}`))], [flights])
  const filtered = flights
    .filter(f => !filterStatus || f.status === filterStatus)
    .filter(f => !filterRoute  || `${f.origin}→${f.destination}` === filterRoute)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* KPI bande OTP */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10 }}>
        {[
          { label:'OTP global',     value:`${otpGlobal.rate}%`, color:otpColor(otpGlobal.rate) },
          { label:'Total vols',     value:flights.length,       color:'#5B8DB8' },
          { label:'En vol',         value:flights.filter(f=>f.status==='in_flight').length, color:'#F0B429' },
          { label:'Retardés',       value:flights.filter(f=>(f.delay_minutes||0)>OTP_THRESHOLD_MIN).length, color:'#F59E0B' },
          { label:'Dispatch OK',    value:flights.filter(f=>f.dispatch_cleared).length, color:'#4ADE80' },
        ].map(k => (
          <Card key={k.label} style={{ padding:12, textAlign:'center' }}>
            <div style={{ fontFamily:'monospace', fontSize:22, fontWeight:900, color:k.color, lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:9, color:'#475569', marginTop:3, textTransform:'uppercase', letterSpacing:'0.06em' }}>{k.label}</div>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:8 }}>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ ...selectStyle, maxWidth:140 }}>
            <option value="">≡ Tous statuts</option>
            {Object.entries(STATUS_COLORS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterRoute} onChange={e=>setFilterRoute(e.target.value)} style={{ ...selectStyle, maxWidth:150 }}>
            <option value="">🛫 Toutes routes</option>
            {routes.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {(filterStatus||filterRoute) && (
            <button onClick={() => { setFilterStatus(''); setFilterRoute('') }}
              style={{ fontSize:10, padding:'5px 10px', borderRadius:8, cursor:'pointer', border:'none',
                backgroundColor:'rgba(239,68,68,0.12)', color:'#F87171' }}>✕ Effacer</button>
          )}
        </div>
        <button onClick={onCreateFlight}
          style={{ fontSize:11, fontWeight:700, padding:'7px 16px', borderRadius:8, cursor:'pointer',
            backgroundColor:'#F0B429', color:'#0B1F3A', border:'none' }}>+ Nouveau vol</button>
      </div>

      {/* Liste vols */}
      {filtered.length === 0 && (
        <Card style={{ padding:32, textAlign:'center' }}>
          <p style={{ color:'#2D5580' }}>Aucun vol trouvé.</p>
        </Card>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:12 }}>
        {filtered.map(f => (
          <FlightCard
            key={f.id} flight={f}
            pax={paxByFlight[f.id] || []}
            onClick={() => onSelectFlight(f)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function FlightsPage({ flights, fleet, user, onCreateFlight }) {
  const [selectedFlight, setSelectedFlight] = useState(null)
  const [view, setView] = useState('list') // 'list' | 'otp'

  const ops = useFlightOps({ flights, user })

  // Charger checklist quand on sélectionne un vol
  useEffect(() => {
    if (selectedFlight) {
      ops.loadChecklist(selectedFlight.id, selectedFlight.flight_number)
    }
  }, [selectedFlight?.id])

  // Si le vol sélectionné est mis à jour en temps réel, sync
  const currentFlight = selectedFlight
    ? flights.find(f => f.id === selectedFlight.id) || selectedFlight
    : null

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Header */}
      {!selectedFlight && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <div>
            <h1 style={{ color:'#F1F5F9', fontWeight:900, fontSize:20, margin:0, display:'flex', alignItems:'center', gap:10 }}>
              <span>✈️</span> Vols & Opérations
            </h1>
            <p style={{ color:'#475569', fontSize:12, marginTop:4 }}>
              {flights.length} vol{flights.length!==1?'s':''} · Manifeste · Dispatch · OTP
            </p>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            {['list','otp'].map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ fontSize:11, fontWeight:600, padding:'6px 14px', borderRadius:8, cursor:'pointer', border:'none',
                  backgroundColor: view===v ? '#1E3A5F' : 'rgba(7,23,41,0.6)',
                  color:           view===v ? '#F0B429' : '#5B8DB8',
                  outline: view===v ? '1px solid #1E3A5F' : 'none' }}>
                {v === 'list' ? '≡ Vols' : '📊 OTP'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Erreur */}
      {ops.error && (
        <div style={{ padding:'10px 16px', borderRadius:10, backgroundColor:'rgba(239,68,68,0.1)',
          border:'1px solid rgba(239,68,68,0.3)', display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontSize:12, color:'#F87171' }}>⚠️ {ops.error}</span>
          <button onClick={ops.clearError} style={{ fontSize:12, color:'#F87171', cursor:'pointer', background:'none', border:'none' }}>✕</button>
        </div>
      )}

      {/* Vues */}
      {!selectedFlight && view === 'list' && (
        <FlightsOverview
          flights={flights}
          paxByFlight={ops.paxByFlight}
          otpGlobal={ops.otpGlobal}
          onSelectFlight={setSelectedFlight}
          onCreateFlight={onCreateFlight}
        />
      )}

      {!selectedFlight && view === 'otp' && (
        <OTPTab
          flights={flights}
          otpGlobal={ops.otpGlobal}
          otpByRoute={ops.otpByRoute}
          otpByAircraft={ops.otpByAircraft}
          delayCauses={ops.delayCauses}
        />
      )}

      {selectedFlight && currentFlight && (
        <FlightDetail
          flight={currentFlight}
          pax={ops.paxByFlight[currentFlight.id] || []}
          delays={ops.allDelays}
          checklist={ops.checklists[currentFlight.id]}
          fleet={fleet}
          ops={ops}
          onBack={() => setSelectedFlight(null)}
          user={user}
        />
      )}
    </div>
  )
}
