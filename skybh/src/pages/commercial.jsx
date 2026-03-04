/**
 * CommercialPage.jsx — Module S5 Commercial
 * SBH Commuter — Réservations, tarifs, stats, export
 * Accès : admin, ops
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuth } from '../context/AuthContext'

// ── Palette ───────────────────────────────────────────────────
const C = {
  bg:       '#0B1F3A',
  bgPanel:  '#0F2847',
  bgCard:   '#112D52',
  border:   '#1E3A5F',
  border2:  '#2D5580',
  gold:     '#F0B429',
  goldDim:  '#C8962A',
  text:     '#F1F5F9',
  textDim:  '#5B8DB8',
  textMuted:'#2D5580',
  green:    '#4ADE80',
  greenDim: '#16a34a',
  red:      '#F87171',
  redDim:   '#dc2626',
  orange:   '#FB923C',
  blue:     '#7DD3FC',
}

// ── Données statiques ─────────────────────────────────────────
const ROUTES = [
  { id: 'TFFJ-TNCM', label: 'SBH → SXM', origin: 'TFFJ', destination: 'TNCM', duration: 25 },
  { id: 'TNCM-TFFJ', label: 'SXM → SBH', origin: 'TNCM', destination: 'TFFJ', duration: 25 },
  { id: 'TFFJ-TFFG', label: 'SBH → GCE', origin: 'TFFJ', destination: 'TFFG', duration: 20 },
  { id: 'TFFG-TFFJ', label: 'GCE → SBH', origin: 'TFFG', destination: 'TFFJ', duration: 20 },
  { id: 'TFFJ-TQPF', label: 'SBH → AXA', origin: 'TFFJ', destination: 'TQPF', duration: 30 },
  { id: 'TQPF-TFFJ', label: 'AXA → SBH', origin: 'TQPF', destination: 'TFFJ', duration: 30 },
]

const FARE_CLASSES = {
  promo:    { label: 'Promo',    color: C.green,  bg: '#dcfce720' },
  standard: { label: 'Standard', color: C.blue,   bg: '#7dd3fc20' },
  flex:     { label: 'Flex',     color: C.gold,   bg: '#f0b42920' },
}

const CHANNELS = {
  direct:  { label: 'Direct',  icon: '🏢' },
  agent:   { label: 'Agent',   icon: '🤝' },
  walk_in: { label: 'Walk-in', icon: '🚶' },
  online:  { label: 'Online',  icon: '💻' },
}

const STATUS_CONFIG = {
  confirmed:  { label: 'Confirmé',  color: C.blue,  bg: '#7dd3fc18', dot: '#7DD3FC' },
  checked_in: { label: 'Checké',    color: C.green, bg: '#4ade8018', dot: '#4ADE80' },
  boarded:    { label: 'Embarqué',  color: C.gold,  bg: '#f0b42918', dot: '#F0B429' },
  no_show:    { label: 'No-show',   color: C.red,   bg: '#f8717118', dot: '#F87171' },
  cancelled:  { label: 'Annulé',    color: C.textMuted, bg: '#2d558018', dot: '#2D5580' },
}

// Tarifs par défaut
const DEFAULT_FARES = {
  'TFFJ-TNCM': { promo: 89,  standard: 139, flex: 199 },
  'TNCM-TFFJ': { promo: 89,  standard: 139, flex: 199 },
  'TFFJ-TFFG': { promo: 69,  standard: 109, flex: 159 },
  'TFFG-TFFJ': { promo: 69,  standard: 109, flex: 159 },
  'TFFJ-TQPF': { promo: 99,  standard: 159, flex: 219 },
  'TQPF-TFFJ': { promo: 99,  standard: 159, flex: 219 },
}

const BAGGAGE_ALLOWANCE = { promo: 10, standard: 15, flex: 23 }

// Mock bookings pour démo
const MOCK_BOOKINGS = [
  { id:'b1', flightNumber:'PV805', flightId:'5', origin:'TFFJ', destination:'TNCM', scheduledDate: new Date(), status:'confirmed',  channel:'direct',  fareClass:'standard', fareAmount:139, passenger:{ lastName:'MARTIN',  firstName:'Sophie',  nationality:'FR', docType:'passport', docNumber:'AB123456' }, baggageWeight:12, seatNumber:'2', createdAt: new Date(Date.now()-3600000) },
  { id:'b2', flightNumber:'PV805', flightId:'5', origin:'TFFJ', destination:'TNCM', scheduledDate: new Date(), status:'checked_in', channel:'online',  fareClass:'flex',     fareAmount:199, passenger:{ lastName:'JOHNSON', firstName:'Mike',    nationality:'US', docType:'passport', docNumber:'US789012' }, baggageWeight:8,  seatNumber:'1', createdAt: new Date(Date.now()-7200000) },
  { id:'b3', flightNumber:'PV806', flightId:'6', origin:'TNCM', destination:'TFFJ', scheduledDate: new Date(), status:'confirmed',  channel:'agent',   fareClass:'promo',    fareAmount:89,  passenger:{ lastName:'DUPONT',  firstName:'Pierre',  nationality:'FR', docType:'id_card',  docNumber:'FR456789' }, baggageWeight:5,  seatNumber:null, createdAt: new Date(Date.now()-1800000) },
  { id:'b4', flightNumber:'PV807', flightId:'7', origin:'TFFJ', destination:'TFFG', scheduledDate: new Date(), status:'confirmed',  channel:'direct',  fareClass:'standard', fareAmount:109, passenger:{ lastName:'GARCIA',  firstName:'Maria',   nationality:'ES', docType:'passport', docNumber:'ES321654' }, baggageWeight:10, seatNumber:'4', createdAt: new Date(Date.now()-5400000) },
  { id:'b5', flightNumber:'PV805', flightId:'5', origin:'TFFJ', destination:'TNCM', scheduledDate: new Date(), status:'no_show',   channel:'direct',  fareClass:'standard', fareAmount:139, passenger:{ lastName:'SMITH',   firstName:'John',    nationality:'GB', docType:'passport', docNumber:'GB654321' }, baggageWeight:0,  seatNumber:'3', createdAt: new Date(Date.now()-9000000) },
  { id:'b6', flightNumber:'PV808', flightId:'8', origin:'TFFG', destination:'TFFJ', scheduledDate: new Date(), status:'confirmed',  channel:'walk_in', fareClass:'flex',     fareAmount:159, passenger:{ lastName:'LEBLANC', firstName:'Claire',  nationality:'FR', docType:'passport', docNumber:'FR112233' }, baggageWeight:15, seatNumber:'5', createdAt: new Date(Date.now()-600000)  },
  { id:'b7', flightNumber:'PV809', flightId:'9', origin:'TFFJ', destination:'TNCM', scheduledDate: new Date(), status:'cancelled', channel:'online',  fareClass:'promo',    fareAmount:89,  passenger:{ lastName:'BROWN',   firstName:'Emma',    nationality:'US', docType:'passport', docNumber:'US998877' }, baggageWeight:7,  seatNumber:null, createdAt: new Date(Date.now()-14400000) },
  { id:'b8', flightNumber:'PV810', flightId:'10',origin:'TNCM', destination:'TFFJ', scheduledDate: new Date(), status:'confirmed',  channel:'agent',   fareClass:'standard', fareAmount:139, passenger:{ lastName:'MÜLLER',  firstName:'Klaus',   nationality:'DE', docType:'passport', docNumber:'DE445566' }, baggageWeight:20, seatNumber:'6', createdAt: new Date(Date.now()-2700000)  },
]

// ── Helpers ───────────────────────────────────────────────────
const fmtEUR   = n  => new Intl.NumberFormat('fr-FR', { style:'currency', currency:'EUR', maximumFractionDigits:0 }).format(n)
const fmtDate  = d  => new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' })
const fmtTime  = d  => new Date(d).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
const fmtDT    = d  => `${fmtDate(d)} ${fmtTime(d)}`

// ── Composants UI ─────────────────────────────────────────────
function Badge({ status }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.confirmed
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'3px 10px', borderRadius:999, fontSize:11, fontWeight:700,
      background:c.bg, color:c.color, border:`1px solid ${c.color}30`,
    }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:c.dot, flexShrink:0 }}/>
      {c.label}
    </span>
  )
}

function FareBadge({ fareClass }) {
  const f = FARE_CLASSES[fareClass] || FARE_CLASSES.standard
  return (
    <span style={{
      padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:800,
      background:f.bg, color:f.color, border:`1px solid ${f.color}40`,
      letterSpacing:'0.05em', textTransform:'uppercase',
    }}>{f.label}</span>
  )
}

function StatCard({ label, value, sub, color, icon, trend }) {
  return (
    <div style={{
      background:C.bgCard, border:`1px solid ${C.border}`,
      borderRadius:14, padding:'18px 20px',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ fontSize:11, color:C.textMuted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>{label}</div>
          <div style={{ fontSize:28, fontWeight:900, color:color||C.text, lineHeight:1 }}>{value}</div>
          {sub && <div style={{ fontSize:11, color:C.textDim, marginTop:4 }}>{sub}</div>}
        </div>
        <div style={{ fontSize:22, opacity:0.25 }}>{icon}</div>
      </div>
      {trend !== undefined && (
        <div style={{ marginTop:10, fontSize:11, fontWeight:700, color: trend >= 0 ? C.green : C.red }}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs hier
        </div>
      )}
    </div>
  )
}

// ── Formulaire réservation ────────────────────────────────────
function BookingForm({ booking, flights, onSave, onClose }) {
  const isEdit = !!booking?.id
  const [form, setForm] = useState({
    flightId:      booking?.flightId      || '',
    flightNumber:  booking?.flightNumber  || '',
    origin:        booking?.origin        || '',
    destination:   booking?.destination   || '',
    status:        booking?.status        || 'confirmed',
    channel:       booking?.channel       || 'direct',
    fareClass:     booking?.fareClass     || 'standard',
    fareAmount:    booking?.fareAmount    || 139,
    baggageWeight: booking?.baggageWeight || 0,
    seatNumber:    booking?.seatNumber    || '',
    notes:         booking?.notes         || '',
    lastName:      booking?.passenger?.lastName    || '',
    firstName:     booking?.passenger?.firstName   || '',
    nationality:   booking?.passenger?.nationality || 'FR',
    docType:       booking?.passenger?.docType     || 'passport',
    docNumber:     booking?.passenger?.docNumber   || '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleFlightSelect = (flightId) => {
    const f = flights.find(fl => fl.id === flightId)
    if (!f) return
    const routeId = `${f.origin}-${f.destination}`
    const price   = DEFAULT_FARES[routeId]?.[form.fareClass] || 139
    set('flightId',     f.id)
    set('flightNumber', f.flightNumber || f.flight_number || '')
    set('origin',       f.origin)
    set('destination',  f.destination)
    set('fareAmount',   price)
  }

  const handleFareClassChange = (fc) => {
    const routeId = `${form.origin}-${form.destination}`
    const price   = DEFAULT_FARES[routeId]?.[fc] || form.fareAmount
    set('fareClass',  fc)
    set('fareAmount', price)
  }

  const handleSubmit = async () => {
    if (!form.lastName || !form.firstName || !form.docNumber || !form.flightId) {
      setError('Veuillez remplir tous les champs obligatoires')
      return
    }
    setSaving(true); setError(null)
    try {
      const data = {
        flightId:      form.flightId,
        flightNumber:  form.flightNumber,
        origin:        form.origin,
        destination:   form.destination,
        status:        form.status,
        channel:       form.channel,
        fareClass:     form.fareClass,
        fareAmount:    Number(form.fareAmount),
        baggageWeight: Number(form.baggageWeight),
        seatNumber:    form.seatNumber || null,
        notes:         form.notes || null,
        passenger: {
          lastName:    form.lastName.toUpperCase(),
          firstName:   form.firstName,
          nationality: form.nationality,
          docType:     form.docType,
          docNumber:   form.docNumber.toUpperCase(),
        },
        updatedAt: serverTimestamp(),
      }
      if (!isEdit) data.createdAt = serverTimestamp()
      await onSave(data, booking?.id)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8,
    border:`1.5px solid ${C.border}`, background:C.bgPanel,
    color:C.text, fontSize:13, fontWeight:600, boxSizing:'border-box',
    outline:'none',
  }
  const lbl = { fontSize:10, fontWeight:700, color:C.gold, letterSpacing:'0.1em', textTransform:'uppercase', display:'block', marginBottom:5 }
  const sect = { fontSize:10, fontWeight:800, color:C.textMuted, letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${C.border}` }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(7,23,41,0.85)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}>
      <div style={{
        background:C.bgPanel, borderRadius:20, border:`1px solid ${C.border}`,
        width:'100%', maxWidth:560, maxHeight:'92vh', overflowY:'auto',
        boxShadow:'0 32px 80px rgba(0,0,0,0.6)', margin:16,
      }}>
        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:C.bgPanel, zIndex:10 }}>
          <div>
            <div style={{ fontSize:10, color:C.gold, fontWeight:700, letterSpacing:'0.12em' }}>
              {isEdit ? 'MODIFIER' : 'NOUVELLE'} RÉSERVATION
            </div>
            <div style={{ fontSize:18, fontWeight:900, color:C.text, marginTop:2 }}>
              {isEdit ? `${booking.passenger?.lastName} ${booking.passenger?.firstName}` : 'Nouveau passager'}
            </div>
          </div>
          <button onClick={onClose} style={{ width:34, height:34, borderRadius:'50%', border:`1px solid ${C.border}`, background:'transparent', color:C.textDim, fontSize:16, cursor:'pointer' }}>✕</button>
        </div>

        <div style={{ padding:24 }}>
          {error && (
            <div style={{ padding:'10px 14px', borderRadius:8, background:'#F8717120', border:`1px solid ${C.red}50`, color:C.red, fontSize:12, marginBottom:16 }}>
              ✗ {error}
            </div>
          )}

          {/* Vol */}
          <div style={{ marginBottom:20 }}>
            <div style={sect}>Vol</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div style={{ gridColumn:'span 2' }}>
                <label style={lbl}>Vol *</label>
                <select style={inp} value={form.flightId} onChange={e => handleFlightSelect(e.target.value)}>
                  <option value="">Sélectionner un vol...</option>
                  {flights.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.flightNumber || f.flight_number} — {f.origin} → {f.destination}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Canal</label>
                <select style={inp} value={form.channel} onChange={e => set('channel', e.target.value)}>
                  {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Statut</label>
                <select style={inp} value={form.status} onChange={e => set('status', e.target.value)}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Passager */}
          <div style={{ marginBottom:20 }}>
            <div style={sect}>Passager</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label style={lbl}>Nom *</label>
                <input style={inp} value={form.lastName} onChange={e => set('lastName', e.target.value.toUpperCase())} placeholder="DUPONT"/>
              </div>
              <div>
                <label style={lbl}>Prénom *</label>
                <input style={inp} value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Jean"/>
              </div>
              <div>
                <label style={lbl}>Nationalité</label>
                <select style={inp} value={form.nationality} onChange={e => set('nationality', e.target.value)}>
                  {['FR','US','GB','DE','NL','BE','CH','CA','BR','MQ','GP','SX','AW','IT','ES','PT'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Type document</label>
                <select style={inp} value={form.docType} onChange={e => set('docType', e.target.value)}>
                  <option value="passport">Passeport</option>
                  <option value="id_card">CNI</option>
                  <option value="residence_permit">Titre séjour</option>
                  <option value="driving_license">Permis conduire</option>
                </select>
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label style={lbl}>Numéro document *</label>
                <input style={inp} value={form.docNumber} onChange={e => set('docNumber', e.target.value.toUpperCase())} placeholder="AB123456"/>
              </div>
            </div>
          </div>

          {/* Tarif */}
          <div style={{ marginBottom:20 }}>
            <div style={sect}>Tarif & Bagages</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:12 }}>
              {Object.entries(FARE_CLASSES).map(([k, v]) => {
                const routeId = `${form.origin}-${form.destination}`
                const price   = DEFAULT_FARES[routeId]?.[k]
                return (
                  <button key={k} onClick={() => handleFareClassChange(k)} style={{
                    padding:'12px 8px', borderRadius:10, border:`2px solid ${form.fareClass===k ? v.color : C.border}`,
                    background: form.fareClass===k ? `${v.color}15` : C.bg,
                    color: form.fareClass===k ? v.color : C.textDim,
                    cursor:'pointer', textAlign:'center',
                  }}>
                    <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em' }}>{v.label}</div>
                    {price && <div style={{ fontSize:16, fontWeight:900, marginTop:4 }}>{price}€</div>}
                    <div style={{ fontSize:9, color:C.textMuted, marginTop:2 }}>{BAGGAGE_ALLOWANCE[k]} kg inclus</div>
                  </button>
                )
              })}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              <div>
                <label style={lbl}>Prix (€)</label>
                <input type="number" style={inp} value={form.fareAmount} onChange={e => set('fareAmount', e.target.value)} min={0}/>
              </div>
              <div>
                <label style={lbl}>Bagages (kg)</label>
                <input type="number" style={inp} value={form.baggageWeight} onChange={e => set('baggageWeight', e.target.value)} min={0} max={50}/>
              </div>
              <div>
                <label style={lbl}>Siège</label>
                <select style={inp} value={form.seatNumber} onChange={e => set('seatNumber', e.target.value)}>
                  <option value="">Non attribué</option>
                  {Array.from({length:9}, (_, i) => i+1).map(s => <option key={s} value={String(s)}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom:24 }}>
            <label style={lbl}>Notes</label>
            <textarea style={{ ...inp, minHeight:60, resize:'vertical' }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Remarques, demandes spéciales..."/>
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={onClose} style={{
              flex:1, padding:'13px', borderRadius:10, border:`1px solid ${C.border}`,
              background:'transparent', color:C.textDim, fontSize:13, fontWeight:700, cursor:'pointer',
            }}>Annuler</button>
            <button onClick={handleSubmit} disabled={saving} style={{
              flex:2, padding:'13px', borderRadius:10, border:'none',
              background:C.gold, color:C.bg, fontSize:14, fontWeight:800, cursor:'pointer',
              opacity:saving?0.6:1, letterSpacing:'0.03em',
            }}>
              {saving ? 'Enregistrement...' : isEdit ? '✓ Modifier' : '+ Créer la réservation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Grille tarifaire ─────────────────────────────────────────
function FareGrid({ fares, onUpdate }) {
  const [editing, setEditing] = useState(null) // { routeId, fareClass }
  const [val, setVal]         = useState('')

  const startEdit = (routeId, fareClass, current) => {
    setEditing({ routeId, fareClass })
    setVal(String(current))
  }

  const saveEdit = async () => {
    if (!editing) return
    await onUpdate(editing.routeId, editing.fareClass, Number(val))
    setEditing(null)
  }

  return (
    <div style={{ background:C.bgCard, borderRadius:16, border:`1px solid ${C.border}`, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'16px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:14, fontWeight:800, color:C.text }}>Grille tarifaire</div>
          <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>Cliquez sur un tarif pour le modifier</div>
        </div>
        <span style={{ fontSize:20, opacity:0.3 }}>💶</span>
      </div>

      {/* Table */}
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${C.border}` }}>
              <th style={{ padding:'12px 20px', textAlign:'left', fontSize:10, fontWeight:800, color:C.textMuted, textTransform:'uppercase', letterSpacing:'0.1em' }}>Route</th>
              {Object.entries(FARE_CLASSES).map(([k, v]) => (
                <th key={k} style={{ padding:'12px 16px', textAlign:'center', fontSize:10, fontWeight:800, color:v.color, textTransform:'uppercase', letterSpacing:'0.1em' }}>
                  {v.label}
                  <div style={{ fontSize:9, color:C.textMuted, fontWeight:600, marginTop:2 }}>{BAGGAGE_ALLOWANCE[k]} kg incl.</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROUTES.map((route, i) => (
              <tr key={route.id} style={{ borderBottom: i < ROUTES.length-1 ? `1px solid ${C.border}30` : 'none' }}>
                <td style={{ padding:'14px 20px' }}>
                  <div style={{ fontWeight:800, color:C.text, fontSize:13 }}>{route.label}</div>
                  <div style={{ fontSize:10, color:C.textMuted, marginTop:2 }}>{route.duration} min</div>
                </td>
                {Object.keys(FARE_CLASSES).map(fc => {
                  const current = fares[route.id]?.[fc] ?? DEFAULT_FARES[route.id]?.[fc] ?? 0
                  const isEd    = editing?.routeId === route.id && editing?.fareClass === fc
                  return (
                    <td key={fc} style={{ padding:'10px 16px', textAlign:'center' }}>
                      {isEd ? (
                        <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                          <input
                            type="number" value={val}
                            onChange={e => setVal(e.target.value)}
                            autoFocus
                            onKeyDown={e => { if(e.key==='Enter') saveEdit(); if(e.key==='Escape') setEditing(null) }}
                            style={{ width:70, padding:'6px 8px', borderRadius:6, border:`2px solid ${C.gold}`, background:C.bg, color:C.text, fontSize:13, fontWeight:800, textAlign:'center' }}
                          />
                          <button onClick={saveEdit} style={{ padding:'6px 8px', borderRadius:6, border:'none', background:C.gold, color:C.bg, fontSize:11, fontWeight:800, cursor:'pointer' }}>✓</button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(route.id, fc, current)} style={{
                          padding:'8px 14px', borderRadius:8, border:`1px solid ${C.border}`,
                          background:C.bg, color:C.text, fontSize:15, fontWeight:900, cursor:'pointer',
                          transition:'all 0.15s',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor=C.gold; e.currentTarget.style.color=C.gold }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text }}
                        >
                          {current}€
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Stats revenus ─────────────────────────────────────────────
function RevenueStats({ bookings }) {
  const active = bookings.filter(b => b.status !== 'cancelled')

  const byRoute = useMemo(() => {
    const map = {}
    active.forEach(b => {
      const key = `${b.origin}-${b.destination}`
      if (!map[key]) map[key] = { route:key, count:0, revenue:0, baggage:0 }
      map[key].count++
      map[key].revenue += b.fareAmount || 0
      map[key].baggage += b.baggageWeight || 0
    })
    return Object.values(map).sort((a,b) => b.revenue - a.revenue)
  }, [bookings])

  const byFare = useMemo(() => {
    const map = { promo:0, standard:0, flex:0 }
    active.forEach(b => { if(map[b.fareClass] !== undefined) map[b.fareClass]++ })
    const total = active.length || 1
    return Object.entries(map).map(([k,v]) => ({ class:k, count:v, pct: Math.round(v/total*100) }))
  }, [bookings])

  const byChannel = useMemo(() => {
    const map = {}
    active.forEach(b => {
      if (!map[b.channel]) map[b.channel] = 0
      map[b.channel]++
    })
    return Object.entries(map).sort((a,b) => b[1]-a[1])
  }, [bookings])

  const totalRevenue = active.reduce((s, b) => s + (b.fareAmount||0), 0)
  const avgFare      = active.length ? Math.round(totalRevenue / active.length) : 0
  const totalBaggage = active.reduce((s, b) => s + (b.baggageWeight||0), 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12 }}>
        <StatCard label="Revenu total"   value={fmtEUR(totalRevenue)} color={C.green}  icon="💶" sub={`${active.length} réservations actives`}/>
        <StatCard label="Tarif moyen"    value={`${avgFare}€`}        color={C.gold}   icon="📊" sub="par passager"/>
        <StatCard label="Bagages total"  value={`${totalBaggage} kg`} color={C.blue}   icon="🧳" sub={`~${active.length ? Math.round(totalBaggage/active.length) : 0} kg / pax`}/>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Par route */}
        <div style={{ background:C.bgCard, borderRadius:14, border:`1px solid ${C.border}`, padding:20 }}>
          <div style={{ fontSize:11, color:C.textMuted, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:14 }}>Revenus par route</div>
          {byRoute.length === 0 ? (
            <div style={{ color:C.textMuted, fontSize:12, textAlign:'center', padding:16 }}>Aucune donnée</div>
          ) : byRoute.map(r => {
            const route = ROUTES.find(rt => rt.id === r.route)
            const pct   = totalRevenue ? Math.round(r.revenue/totalRevenue*100) : 0
            return (
              <div key={r.route} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{route?.label || r.route}</span>
                  <span style={{ fontSize:12, fontWeight:800, color:C.gold }}>{fmtEUR(r.revenue)}</span>
                </div>
                <div style={{ height:6, borderRadius:3, background:C.bg, overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:3, background:`linear-gradient(90deg, ${C.gold}, ${C.goldDim})`, width:`${pct}%`, transition:'width 0.4s' }}/>
                </div>
                <div style={{ fontSize:10, color:C.textMuted, marginTop:3 }}>{r.count} pax · {pct}%</div>
              </div>
            )
          })}
        </div>

        {/* Par classe + canal */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ background:C.bgCard, borderRadius:14, border:`1px solid ${C.border}`, padding:18, flex:1 }}>
            <div style={{ fontSize:11, color:C.textMuted, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>Mix tarifaire</div>
            {byFare.map(f => {
              const fc = FARE_CLASSES[f.class]
              return (
                <div key={f.class} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:fc.color, flexShrink:0 }}/>
                  <span style={{ fontSize:12, color:C.textDim, flex:1, fontWeight:600 }}>{fc.label}</span>
                  <div style={{ flex:2, height:5, borderRadius:3, background:C.bg, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:3, background:fc.color, width:`${f.pct}%` }}/>
                  </div>
                  <span style={{ fontSize:11, fontWeight:800, color:C.text, minWidth:28, textAlign:'right' }}>{f.pct}%</span>
                </div>
              )
            })}
          </div>

          <div style={{ background:C.bgCard, borderRadius:14, border:`1px solid ${C.border}`, padding:18, flex:1 }}>
            <div style={{ fontSize:11, color:C.textMuted, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>Canaux de vente</div>
            {byChannel.map(([ch, count]) => {
              const c   = CHANNELS[ch] || { label:ch, icon:'?' }
              const pct = active.length ? Math.round(count/active.length*100) : 0
              return (
                <div key={ch} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <span style={{ fontSize:14 }}>{c.icon}</span>
                  <span style={{ fontSize:12, color:C.textDim, flex:1, fontWeight:600 }}>{c.label}</span>
                  <span style={{ fontSize:12, fontWeight:800, color:C.text }}>{count}</span>
                  <span style={{ fontSize:10, color:C.textMuted }}>({pct}%)</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers date ─────────────────────────────────────────────
function toMidnight(d) {
  const r = new Date(d); r.setHours(0,0,0,0); return r
}
function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate()+n); return r
}
function fmtISO(d) {
  return d.toISOString().slice(0,10)
}
function parseISO(s) {
  const [y,m,day] = s.split('-').map(Number)
  return new Date(y, m-1, day)
}

// ── Presets rapides ──────────────────────────────────────────
const DATE_PRESETS = [
  { id:'today',   label:"Aujourd'hui" },
  { id:'tomorrow',label:'Demain'       },
  { id:'week',    label:'7 jours'      },
  { id:'month',   label:'30 jours'     },
  { id:'custom',  label:'Personnalisé' },
]

// ── Export CSV ────────────────────────────────────────────────
function exportCSV(bookings, filename = 'reservations_sbh.csv') {
  const headers = [
    'Vol','Date','Statut','Nom','Prénom','Nationalité','Document','N° Doc',
    'Siège','Classe','Prix (€)','Bagages (kg)','Canal','Notes'
  ]
  const rows = bookings.map(b => [
    b.flightNumber,
    b.scheduledDate ? fmtDate(b.scheduledDate?.toDate?.() || b.scheduledDate) : '',
    STATUS_CONFIG[b.status]?.label || b.status,
    b.passenger?.lastName || '',
    b.passenger?.firstName || '',
    b.passenger?.nationality || '',
    b.passenger?.docType || '',
    b.passenger?.docNumber || '',
    b.seatNumber || '',
    FARE_CLASSES[b.fareClass]?.label || b.fareClass,
    b.fareAmount || 0,
    b.baggageWeight || 0,
    CHANNELS[b.channel]?.label || b.channel,
    b.notes || '',
  ])
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href=url; a.download=filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Page principale ───────────────────────────────────────────
export default function CommercialPage({ flights = [] }) {
  const { user } = useAuth()

  const [tab,           setTab]           = useState('bookings')
  const [bookings,      setBookings]      = useState([])
  const [fares,         setFares]         = useState({})
  const [loading,       setLoading]       = useState(true)
  const [usingMock,     setUsingMock]     = useState(false)
  const [showForm,      setShowForm]      = useState(false)
  const [editBooking,   setEditBooking]   = useState(null)
  const [filterStatus,  setFilterStatus]  = useState('all')
  const [filterFlight,  setFilterFlight]  = useState('all')
  const [filterRoute,   setFilterRoute]   = useState('all')
  const [search,        setSearch]        = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // ── Filtre date ──
  const [datePreset, setDatePreset] = useState('today')
  const [dateFrom,   setDateFrom]   = useState(fmtISO(new Date()))
  const [dateTo,     setDateTo]     = useState(fmtISO(new Date()))

  // Vols disponibles (Firestore + fallback)
  const allFlights = flights.length > 0 ? flights : [
    { id:'5', flightNumber:'PV805', flight_number:'PV805', origin:'TFFJ', destination:'TNCM', status:'scheduled' },
    { id:'6', flightNumber:'PV806', flight_number:'PV806', origin:'TNCM', destination:'TFFJ', status:'scheduled' },
    { id:'7', flightNumber:'PV807', flight_number:'PV807', origin:'TFFJ', destination:'TFFG', status:'scheduled' },
    { id:'8', flightNumber:'PV808', flight_number:'PV808', origin:'TFFG', destination:'TFFJ', status:'scheduled' },
    { id:'9', flightNumber:'PV809', flight_number:'PV809', origin:'TFFJ', destination:'TNCM', status:'scheduled' },
    { id:'10',flightNumber:'PV810', flight_number:'PV810', origin:'TNCM', destination:'TFFJ', status:'scheduled' },
  ]

  // Sync dateFrom/dateTo quand preset change
  useEffect(() => {
    const today = new Date()
    if (datePreset === 'today')    { setDateFrom(fmtISO(today));          setDateTo(fmtISO(today)) }
    if (datePreset === 'tomorrow') { setDateFrom(fmtISO(addDays(today,1)));setDateTo(fmtISO(addDays(today,1))) }
    if (datePreset === 'week')     { setDateFrom(fmtISO(today));          setDateTo(fmtISO(addDays(today,6))) }
    if (datePreset === 'month')    { setDateFrom(fmtISO(today));          setDateTo(fmtISO(addDays(today,29))) }
    // 'custom' : on ne touche pas les dates
  }, [datePreset])

  // Charger réservations Firestore selon plage date
  useEffect(() => {
    const from = toMidnight(parseISO(dateFrom))
    const to   = addDays(toMidnight(parseISO(dateTo)), 1) // lendemain minuit (exclusif)
    let unsub = () => {}
    try {
      const q = query(
        collection(db, 'bookings'),
        where('scheduledDate', '>=', from),
        where('scheduledDate', '<',  to),
        orderBy('scheduledDate', 'asc')
      )
      unsub = onSnapshot(q,
        snap => {
          const data = snap.docs.map(d => ({ id:d.id, ...d.data() }))
          if (data.length > 0) { setBookings(data); setUsingMock(false) }
          else                  { setBookings(MOCK_BOOKINGS); setUsingMock(true) }
          setLoading(false)
        },
        () => { setBookings(MOCK_BOOKINGS); setUsingMock(true); setLoading(false) }
      )
    } catch { setBookings(MOCK_BOOKINGS); setUsingMock(true); setLoading(false) }
    return () => unsub()
  }, [dateFrom, dateTo])

  // Charger tarifs Firestore
  useEffect(() => {
    let unsub = () => {}
    try {
      unsub = onSnapshot(collection(db, 'fare_rules'), snap => {
        const map = {}
        snap.docs.forEach(d => {
          const data = d.data()
          if (!map[data.route]) map[data.route] = {}
          map[data.route][data.fareClass] = data.price
        })
        setFares(map)
      }, () => {})
    } catch {}
    return () => unsub()
  }, [])

  // CRUD réservations
  const handleSave = useCallback(async (data, id) => {
    if (usingMock) return // pas d'écriture en mode mock
    if (id) await updateDoc(doc(db, 'bookings', id), data)
    else    await addDoc(collection(db, 'bookings'), data)
  }, [usingMock])

  const handleDelete = useCallback(async (id) => {
    if (usingMock) return
    await deleteDoc(doc(db, 'bookings', id))
    setDeleteConfirm(null)
  }, [usingMock])

  const handleFareUpdate = useCallback(async (routeId, fareClass, price) => {
    if (usingMock) {
      setFares(prev => ({ ...prev, [routeId]: { ...(prev[routeId]||{}), [fareClass]: price } }))
      return
    }
    // Chercher doc existant ou créer
    const existing = await import('firebase/firestore').then(({ getDocs, query: q2, where: w, collection: col }) =>
      getDocs(q2(col(db, 'fare_rules'), w('route', '==', routeId), w('fareClass', '==', fareClass)))
    )
    if (!existing.empty) {
      await updateDoc(doc(db, 'fare_rules', existing.docs[0].id), { price, updatedAt: serverTimestamp() })
    } else {
      await addDoc(collection(db, 'fare_rules'), { route:routeId, fareClass, price, baggageIncluded: BAGGAGE_ALLOWANCE[fareClass], flexible: fareClass==='flex', createdAt: serverTimestamp() })
    }
  }, [usingMock])

  // Filtres
  const filtered = useMemo(() => bookings.filter(b => {
    if (filterStatus !== 'all' && b.status !== filterStatus) return false
    if (filterFlight !== 'all' && b.flightNumber !== filterFlight) return false
    if (filterRoute  !== 'all' && `${b.origin}-${b.destination}` !== filterRoute) return false
    // Filtre date client (redondant mais sécurise le mode mock)
    if (!usingMock) {
      const bDate = b.scheduledDate?.toDate?.() || (b.scheduledDate instanceof Date ? b.scheduledDate : null)
      if (bDate) {
        const from = toMidnight(parseISO(dateFrom))
        const to   = addDays(toMidnight(parseISO(dateTo)), 1)
        if (bDate < from || bDate >= to) return false
      }
    }
    if (search.length >= 2) {
      const q = search.toLowerCase()
      return (
        b.passenger?.lastName?.toLowerCase().includes(q)  ||
        b.passenger?.firstName?.toLowerCase().includes(q) ||
        b.passenger?.docNumber?.toLowerCase().includes(q) ||
        b.flightNumber?.toLowerCase().includes(q)
      )
    }
    return true
  }), [bookings, filterStatus, filterFlight, filterRoute, search, dateFrom, dateTo, usingMock])

  // Stats rapides
  const stats = useMemo(() => {
    const active = bookings.filter(b => b.status !== 'cancelled')
    return {
      total:     bookings.length,
      active:    active.length,
      revenue:   active.reduce((s,b) => s+(b.fareAmount||0), 0),
      checkedIn: bookings.filter(b => b.status==='checked_in').length,
      boarded:   bookings.filter(b => b.status==='boarded').length,
      noShow:    bookings.filter(b => b.status==='no_show').length,
      cancelled: bookings.filter(b => b.status==='cancelled').length,
    }
  }, [bookings])

  const uniqueFlights = [...new Set(bookings.map(b => b.flightNumber))].sort()

  const TABS_DEF = [
    { id:'bookings', label:'Réservations', icon:'📋' },
    { id:'fares',    label:'Tarifs',       icon:'💶' },
    { id:'stats',    label:'Statistiques', icon:'📊' },
  ]

  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif" }}>

      {/* Header section */}
      <div style={{ marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <p style={{ fontSize:10, fontWeight:700, letterSpacing:'0.15em', textTransform:'uppercase', color:C.textMuted, margin:'0 0 4px' }}>SBH Commuter</p>
            <h1 style={{ fontSize:22, fontWeight:900, color:C.text, margin:0, letterSpacing:'-0.02em', display:'flex', alignItems:'center', gap:10 }}>
              Commercial
              {usingMock && (
                <span style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:`${C.gold}20`, color:C.gold, border:`1px solid ${C.gold}40`, fontWeight:700, letterSpacing:'0.08em' }}>DÉMO</span>
              )}
            </h1>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button
              onClick={() => exportCSV(filtered)}
              style={{
                display:'flex', alignItems:'center', gap:6,
                padding:'9px 16px', borderRadius:10, border:`1px solid ${C.border}`,
                background:'transparent', color:C.textDim, fontSize:12, fontWeight:700, cursor:'pointer',
              }}
            >
              ↓ CSV
            </button>
            <button
              onClick={() => { setEditBooking(null); setShowForm(true) }}
              style={{
                display:'flex', alignItems:'center', gap:6,
                padding:'9px 16px', borderRadius:10, border:'none',
                background:C.gold, color:C.bg, fontSize:12, fontWeight:800, cursor:'pointer',
              }}
            >
              + Réservation
            </button>
          </div>
        </div>
        <div style={{ height:1, background:C.border, marginTop:16 }}/>
      </div>

      {/* ── Barre filtre date ── */}
      <div style={{
        display:'flex', alignItems:'center', gap:8, marginBottom:20,
        padding:'10px 14px', borderRadius:12,
        background:C.bgPanel, border:`1px solid ${C.border}`,
        flexWrap:'wrap',
      }}>
        {/* Presets */}
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {DATE_PRESETS.map(p => (
            <button key={p.id} onClick={() => setDatePreset(p.id)} style={{
              padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:700,
              border:'none', cursor:'pointer', transition:'all 0.15s',
              background: datePreset===p.id ? C.gold : C.bgCard,
              color:       datePreset===p.id ? C.bg   : C.textDim,
              boxShadow:   datePreset===p.id ? `0 2px 6px ${C.gold}40` : 'none',
            }}>{p.label}</button>
          ))}
        </div>

        {/* Séparateur */}
        <div style={{ width:1, height:24, background:C.border, flexShrink:0 }}/>

        {/* Inputs date */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:11, color:C.textMuted, fontWeight:600 }}>Du</span>
          <input type="date" value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setDatePreset('custom') }}
            style={{ padding:'5px 10px', borderRadius:8, border:`1.5px solid ${datePreset==='custom' ? C.gold : C.border}`, background:C.bgCard, color:C.text, fontSize:12, fontWeight:600, cursor:'pointer' }}
          />
          <span style={{ fontSize:11, color:C.textMuted, fontWeight:600 }}>au</span>
          <input type="date" value={dateTo}
            min={dateFrom}
            onChange={e => { setDateTo(e.target.value); setDatePreset('custom') }}
            style={{ padding:'5px 10px', borderRadius:8, border:`1.5px solid ${datePreset==='custom' ? C.gold : C.border}`, background:C.bgCard, color:C.text, fontSize:12, fontWeight:600, cursor:'pointer' }}
          />
        </div>

        {/* Badge résumé */}
        <div style={{ marginLeft:'auto', fontSize:11, color:C.textMuted, fontWeight:600, whiteSpace:'nowrap' }}>
          {dateFrom === dateTo
            ? new Date(dateFrom+'T12:00:00').toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' })
            : `${new Date(dateFrom+'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' })} — ${new Date(dateTo+'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' })}`
          }
          {' · '}<span style={{ color:C.green, fontWeight:800 }}>{filtered.length} résultat{filtered.length!==1?'s':''}</span>
        </div>
      </div>

      {/* KPIs rapides */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr) repeat(3, 1fr)', gap:10, marginBottom:24 }}>
        <StatCard label="Réservations" value={stats.active}         color={C.text}  icon="🎫" sub={`${stats.cancelled} annulées`}/>
        <StatCard label="Revenu jour"  value={fmtEUR(stats.revenue)} color={C.green} icon="💶" sub="hors annulations"/>
        <StatCard label="Checkés"      value={stats.checkedIn}       color={C.blue}  icon="✓"/>
        <StatCard label="Embarqués"    value={stats.boarded}         color={C.gold}  icon="✈"/>
        <StatCard label="No-show"      value={stats.noShow}          color={C.red}   icon="⚠"/>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, background:C.bgPanel, padding:4, borderRadius:12, border:`1px solid ${C.border}`, width:'fit-content' }}>
        {TABS_DEF.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'8px 20px', borderRadius:9, fontSize:12, fontWeight:700,
            border:'none', cursor:'pointer', transition:'all 0.15s',
            background: tab===t.id ? C.gold : 'transparent',
            color:       tab===t.id ? C.bg   : C.textDim,
            boxShadow:   tab===t.id ? `0 2px 8px ${C.gold}40` : 'none',
          }}>
            <span style={{ marginRight:6 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Réservations ── */}
      {tab === 'bookings' && (
        <div>
          {/* Filtres */}
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
            <div style={{ position:'relative', flex:'1 1 200px' }}>
              <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:C.textMuted, fontSize:14 }}>🔍</span>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Nom, prénom, doc, vol..."
                style={{ width:'100%', padding:'9px 12px 9px 36px', borderRadius:9, border:`1.5px solid ${C.border}`, background:C.bgPanel, color:C.text, fontSize:13, boxSizing:'border-box' }}
              />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding:'9px 12px', borderRadius:9, border:`1.5px solid ${C.border}`, background:C.bgPanel, color:C.text, fontSize:12, fontWeight:600 }}>
              <option value="all">Tous statuts</option>
              {Object.entries(STATUS_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterFlight} onChange={e => setFilterFlight(e.target.value)} style={{ padding:'9px 12px', borderRadius:9, border:`1.5px solid ${C.border}`, background:C.bgPanel, color:C.text, fontSize:12, fontWeight:600 }}>
              <option value="all">Tous vols</option>
              {uniqueFlights.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={filterRoute} onChange={e => setFilterRoute(e.target.value)} style={{ padding:'9px 12px', borderRadius:9, border:`1.5px solid ${C.border}`, background:C.bgPanel, color:C.text, fontSize:12, fontWeight:600 }}>
              <option value="all">Toutes routes</option>
              {ROUTES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <button onClick={() => exportCSV(filtered, `reservations_${new Date().toISOString().slice(0,10)}.csv`)} style={{ padding:'9px 14px', borderRadius:9, border:`1px solid ${C.border}`, background:'transparent', color:C.textDim, fontSize:12, fontWeight:700, cursor:'pointer' }}>
              ↓ CSV ({filtered.length})
            </button>
          </div>

          {/* Compteur résultats */}
          <div style={{ fontSize:11, color:C.textMuted, marginBottom:12 }}>
            {filtered.length} réservation{filtered.length!==1?'s':''} · {filtered.filter(b=>b.status!=='cancelled').reduce((s,b)=>s+(b.fareAmount||0),0)}€ de revenu
          </div>

          {/* Liste */}
          {loading ? (
            <div style={{ textAlign:'center', padding:40, color:C.textDim }}>Chargement...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:48, color:C.textMuted }}>
              <div style={{ fontSize:32, marginBottom:8 }}>🎫</div>
              <div style={{ fontWeight:700, color:C.textDim }}>Aucune réservation</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {/* Header tableau */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 80px 80px 60px', gap:12, padding:'8px 16px', fontSize:10, fontWeight:800, color:C.textMuted, textTransform:'uppercase', letterSpacing:'0.08em' }}>
                <span>Passager</span><span>Vol / Route</span><span>Statut</span><span>Tarif</span><span>Prix</span><span>Bagages</span><span></span>
              </div>
              {filtered.map(b => (
                <div key={b.id} style={{
                  display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 80px 80px 60px',
                  gap:12, padding:'14px 16px', borderRadius:12,
                  background:C.bgCard, border:`1px solid ${C.border}`,
                  alignItems:'center', transition:'border-color 0.15s',
                  cursor:'pointer',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor=C.border2}
                  onMouseLeave={e => e.currentTarget.style.borderColor=C.border}
                  onClick={() => { setEditBooking(b); setShowForm(true) }}
                >
                  {/* Passager */}
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:C.text }}>
                      {b.passenger?.lastName} {b.passenger?.firstName}
                    </div>
                    <div style={{ fontSize:10, color:C.textMuted, marginTop:1 }}>
                      {b.passenger?.docNumber} · {b.passenger?.nationality}
                    </div>
                  </div>
                  {/* Vol */}
                  <div>
                    <div style={{ fontWeight:800, fontSize:13, color:C.gold }}>{b.flightNumber}</div>
                    <div style={{ fontSize:11, color:C.textDim, marginTop:1 }}>{b.origin} → {b.destination}</div>
                  </div>
                  {/* Statut */}
                  <div><Badge status={b.status}/></div>
                  {/* Tarif */}
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <FareBadge fareClass={b.fareClass}/>
                    {b.seatNumber && <span style={{ fontSize:10, color:C.textMuted }}>S.{b.seatNumber}</span>}
                  </div>
                  {/* Prix */}
                  <div style={{ fontWeight:800, fontSize:14, color:b.status==='cancelled'?C.textMuted:C.green }}>
                    {b.status==='cancelled' ? <span style={{ textDecoration:'line-through' }}>{b.fareAmount}€</span> : `${b.fareAmount}€`}
                  </div>
                  {/* Bagages */}
                  <div style={{ fontSize:12, color:C.textDim, fontWeight:600 }}>
                    {b.baggageWeight > 0 ? `${b.baggageWeight} kg` : '—'}
                    {b.baggageWeight > BAGGAGE_ALLOWANCE[b.fareClass] && (
                      <span style={{ color:C.orange, fontSize:10, marginLeft:4 }}>+{b.baggageWeight-BAGGAGE_ALLOWANCE[b.fareClass]}kg</span>
                    )}
                  </div>
                  {/* Actions */}
                  <div style={{ display:'flex', gap:4 }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => { setEditBooking(b); setShowForm(true) }}
                      style={{ padding:'5px 8px', borderRadius:6, border:`1px solid ${C.border}`, background:'transparent', color:C.textDim, fontSize:11, cursor:'pointer' }}
                    >✏</button>
                    {!usingMock && b.status !== 'cancelled' && (
                      <button
                        onClick={() => setDeleteConfirm(b.id)}
                        style={{ padding:'5px 8px', borderRadius:6, border:`1px solid ${C.border}`, background:'transparent', color:C.red, fontSize:11, cursor:'pointer' }}
                      >🗑</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab Tarifs ── */}
      {tab === 'fares' && (
        <FareGrid fares={fares} onUpdate={handleFareUpdate}/>
      )}

      {/* ── Tab Stats ── */}
      {tab === 'stats' && (
        <RevenueStats bookings={bookings}/>
      )}

      {/* ── Formulaire ── */}
      {showForm && (
        <BookingForm
          booking={editBooking}
          flights={allFlights}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditBooking(null) }}
        />
      )}

      {/* ── Confirm suppression ── */}
      {deleteConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(7,23,41,0.85)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:C.bgPanel, borderRadius:16, border:`1px solid ${C.border}`, padding:28, maxWidth:360, width:'90%', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🗑</div>
            <div style={{ fontWeight:800, color:C.text, fontSize:15, marginBottom:8 }}>Supprimer la réservation ?</div>
            <div style={{ color:C.textDim, fontSize:12, marginBottom:20 }}>Cette action est irréversible</div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex:1, padding:'12px', borderRadius:9, border:`1px solid ${C.border}`, background:'transparent', color:C.textDim, fontSize:13, fontWeight:700, cursor:'pointer' }}>Annuler</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ flex:1, padding:'12px', borderRadius:9, border:'none', background:C.red, color:'white', fontSize:13, fontWeight:800, cursor:'pointer' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}