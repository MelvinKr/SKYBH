/**
 * @fileoverview Page Flotte enrichie — SKYBH
 * Vue d'ensemble · Heures/Cycles · Journal technique · Indisponibilités · Documents
 */
import { useState, useMemo } from 'react'
import { useFleetDetail } from '../hooks/use-fleet-detail'
import {
  scoreColor, scoreLabel, rankFleetByReliability,
  docStatusColor, docStatusLabel,
} from '../utils/fleet-reliability'
import { LIMITS } from '../utils/maintenance-predictor'

// ── Helpers ────────────────────────────────────────────────────────────────────
const toDate   = ts  => ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null)
const fmtDate  = d   => d?.toLocaleDateString?.('fr-FR', { day:'numeric', month:'short', year:'numeric' }) || '—'
const fmtShort = d   => d?.toLocaleDateString?.('fr-FR', { day:'numeric', month:'short' }) || '—'
const daysUntil= d   => d ? Math.round((toDate(d) - Date.now()) / 86400000) : null

const AC_STATUS_COLORS = {
  available:   { bg:'rgba(16,185,129,0.12)',  border:'rgba(16,185,129,0.3)',  text:'#34D399', label:'Disponible'    },
  in_flight:   { bg:'rgba(245,158,11,0.12)',  border:'rgba(245,158,11,0.3)',  text:'#FCD34D', label:'En vol'        },
  maintenance: { bg:'rgba(239,68,68,0.1)',    border:'rgba(239,68,68,0.25)',  text:'#F87171', label:'Maintenance'   },
  aog:         { bg:'rgba(239,68,68,0.18)',   border:'#EF4444',               text:'#FCA5A5', label:'AOG'           },
  inspection:  { bg:'rgba(99,102,241,0.1)',   border:'rgba(99,102,241,0.3)',  text:'#A5B4FC', label:'Inspection'    },
}

const SEV_COLORS = {
  info:  { bg:'rgba(59,130,246,0.1)',   border:'rgba(59,130,246,0.3)',  text:'#93C5FD', label:'Info'    },
  minor: { bg:'rgba(245,158,11,0.1)',   border:'rgba(245,158,11,0.3)',  text:'#FCD34D', label:'Mineur'  },
  major: { bg:'rgba(239,68,68,0.1)',    border:'rgba(239,68,68,0.25)',  text:'#F87171', label:'Majeur'  },
  aog:   { bg:'rgba(239,68,68,0.2)',    border:'#EF4444',               text:'#FCA5A5', label:'AOG'     },
}

const LOG_ICONS = { incident:'⚡', delay:'⏱', defect:'🔴', observation:'👁', repair:'🔧', fuel:'⛽' }

const DOC_TYPES = {
  arc:           { label:"Certificat de Navigabilité (ARC)", icon:"📄" },
  insurance:     { label:"Assurance",                         icon:"🛡" },
  noise_cert:    { label:"Certificat acoustique",             icon:"🔊" },
  airworthiness: { label:"Navigabilité",                      icon:"✅" },
  radio:         { label:"Licence radio",                     icon:"📡" },
  manual:        { label:"Manuel de vol",                     icon:"📘" },
  other:         { label:"Autre document",                    icon:"📎" },
}

const UNAVAIL_TYPES = {
  aog:         { label:'AOG',          icon:'🚫', color:'#EF4444' },
  inspection:  { label:'Inspection',   icon:'🔍', color:'#A5B4FC' },
  maintenance: { label:'Maintenance',  icon:'🔧', color:'#F0B429' },
  weather:     { label:'Météo',        icon:'🌧', color:'#60A5FA' },
  admin:       { label:'Administratif',icon:'📋', color:'#94A3B8' },
  other:       { label:'Autre',        icon:'❓', color:'#64748B' },
}

// ── Composants partagés ────────────────────────────────────────────────────────
function Card({ children, style={} }) {
  return <div style={{ backgroundColor:'#0A1628', border:'1px solid #1E3A5F', borderRadius:14, overflow:'hidden', ...style }}>{children}</div>
}

function Badge({ label, color }) {
  const c = typeof color === 'string' ? { bg:'transparent', border:color, text:color } : color
  return <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99,
    backgroundColor:c.bg, border:`1px solid ${c.border}`, color:c.text, whiteSpace:'nowrap' }}>{label}</span>
}

function FormField({ label, children }) {
  return (
    <div>
      <label style={{ fontSize:10, color:'#5B8DB8', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle = { width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid #1E3A5F', backgroundColor:'#071729', color:'#F1F5F9', fontSize:12, boxSizing:'border-box' }
const selectStyle = { ...inputStyle, cursor:'pointer' }

// ── ReliabilityGauge ───────────────────────────────────────────────────────────
function ReliabilityGauge({ score, size=72 }) {
  const color = scoreColor(score)
  const r = size/2 - 7
  const circ = 2 * Math.PI * r
  const fill = (score / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1E3A5F" strokeWidth={6}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        style={{ transition:'stroke-dasharray 0.8s ease' }}/>
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ fill:color, fontSize:size*0.22, fontWeight:900, fontFamily:'monospace',
          transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px` }}>
        {score}
      </text>
    </svg>
  )
}

// ── PotentialBar ──────────────────────────────────────────────────────────────
function PotentialBar({ label, current=0, limit=1, unit='h' }) {
  const pct    = Math.min(100, Math.round((current / limit) * 100))
  const remain = limit - current
  const color  = remain <= LIMITS.engine.critical ? '#EF4444'
    : remain <= LIMITS.engine.warning ? '#F59E0B'
    : pct > 80 ? '#F0B429' : '#3B82F6'
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ fontSize:11, color:'#94A3B8' }}>{label}</span>
        <span style={{ fontSize:11, fontFamily:'monospace', color:'#CBD5E1', fontWeight:700 }}>
          {current.toLocaleString()} / {limit.toLocaleString()} {unit}
          <span style={{ fontSize:10, color, marginLeft:8 }}>({pct}%)</span>
        </span>
      </div>
      <div style={{ height:8, backgroundColor:'#1E3A5F', borderRadius:4, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, borderRadius:4,
          background:`linear-gradient(90deg,${color}80,${color})`,
          boxShadow: pct > 90 ? `0 0 8px ${color}60` : 'none', transition:'width 0.5s' }}/>
      </div>
      <div style={{ fontSize:10, color, marginTop:3 }}>{remain.toLocaleString()} {unit} restantes</div>
    </div>
  )
}

// ── FleetOverview ──────────────────────────────────────────────────────────────
function FleetOverview({ fleet, reliabilityScores, currentlyUnavailable, expiringDocs, onSelectAircraft }) {
  const ranked = useMemo(() => rankFleetByReliability(fleet, reliabilityScores), [fleet, reliabilityScores])

  const globalScore = fleet.length
    ? Math.round(fleet.reduce((s, ac) => s + (reliabilityScores[ac.registration]?.score ?? 80), 0) / fleet.length)
    : 0

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* KPI bande */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12 }}>
        {[
          { label:'Score flotte moyen', value:globalScore, unit:'/100', color:scoreColor(globalScore), sub:scoreLabel(globalScore) },
          { label:'Avions disponibles', value:fleet.filter(a=>a.status==='available').length, unit:`/ ${fleet.length}`, color:'#4ADE80', sub:'Opérationnels' },
          { label:'En vol',             value:fleet.filter(a=>a.status==='in_flight').length, unit:'', color:'#F0B429', sub:'Actuellement' },
          { label:'Indisponibles',      value:currentlyUnavailable.length, unit:'', color: currentlyUnavailable.length ? '#EF4444' : '#4ADE80', sub:'AOG / Maintenance' },
          { label:'Documents expirants',value:expiringDocs.length, unit:'', color: expiringDocs.length ? '#F59E0B' : '#4ADE80', sub:'À renouveler' },
        ].map(k => (
          <Card key={k.label} style={{ padding:16 }}>
            <div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>{k.label}</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:3 }}>
              <span style={{ fontFamily:'monospace', fontSize:26, fontWeight:900, color:k.color, lineHeight:1 }}>{k.value}</span>
              <span style={{ fontSize:12, color:'#5B8DB8' }}>{k.unit}</span>
            </div>
            <div style={{ fontSize:11, color:'#64748B' }}>{k.sub}</div>
          </Card>
        ))}
      </div>

      {/* Grille avions */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
        {ranked.map(ac => {
          const rel     = reliabilityScores[ac.registration]
          const score   = rel?.score ?? 80
          const sc      = scoreColor(score)
          const acs     = AC_STATUS_COLORS[ac.status] || AC_STATUS_COLORS.available
          const isUnavail = currentlyUnavailable.some(u => u.aircraft_registration === ac.registration)
          const acExpDocs = expiringDocs.filter(d => d.aircraft_registration === ac.registration)

          return (
            <div key={ac.id || ac.registration}
              onClick={() => onSelectAircraft(ac)}
              style={{ backgroundColor:'#0A1628', border:`1.5px solid ${isUnavail ? '#EF444440' : '#1E3A5F'}`,
                borderRadius:16, padding:18, cursor:'pointer',
                transition:'all 0.2s', boxShadow: isUnavail ? '0 0 20px rgba(239,68,68,0.1)' : 'none' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = sc}
              onMouseLeave={e => e.currentTarget.style.borderColor = isUnavail ? '#EF444440' : '#1E3A5F'}>

              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <ReliabilityGauge score={score} size={56}/>
                  <div>
                    <div style={{ fontFamily:'monospace', fontWeight:900, fontSize:18, color:'#F1F5F9', letterSpacing:1 }}>
                      {ac.registration}
                    </div>
                    <div style={{ fontSize:11, color:'#5B8DB8', marginTop:2 }}>{ac.type || ac.model || '—'}</div>
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:5, alignItems:'flex-end' }}>
                  <Badge label={acs.label} color={acs}/>
                  <span style={{ fontSize:10, fontWeight:700, color:sc }}>{scoreLabel(score)}</span>
                </div>
              </div>

              {/* Tendance */}
              {rel?.trend && (
                <div style={{ fontSize:10, color:'#64748B', marginBottom:10 }}>
                  {rel.trend === 'up'     && <span style={{color:'#4ADE80'}}>↑ Tendance positive</span>}
                  {rel.trend === 'down'   && <span style={{color:'#F87171'}}>↓ Tendance dégradée</span>}
                  {rel.trend === 'stable' && <span>→ Tendance stable</span>}
                </div>
              )}

              {/* Barres mini */}
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontSize:10, color:'#475569' }}>Moteur</span>
                    <span style={{ fontSize:10, fontFamily:'monospace', color:'#94A3B8' }}>
                      {ac.engine_hours?.toLocaleString() || 0} / {(ac.engine_limit || 3600)} h
                    </span>
                  </div>
                  <div style={{ height:5, backgroundColor:'#1E3A5F', borderRadius:3 }}>
                    <div style={{ height:'100%', borderRadius:3, transition:'width 0.5s',
                      width:`${Math.min(100,(ac.engine_hours||0)/(ac.engine_limit||3600)*100)}%`,
                      backgroundColor: (ac.engine_limit||3600)-(ac.engine_hours||0) <= 20 ? '#EF4444'
                        : (ac.engine_limit||3600)-(ac.engine_hours||0) <= 50 ? '#F59E0B' : '#3B82F6' }}/>
                  </div>
                </div>
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontSize:10, color:'#475569' }}>Cellule</span>
                    <span style={{ fontSize:10, fontFamily:'monospace', color:'#94A3B8' }}>
                      {ac.airframe_hours?.toLocaleString() || 0} / {(ac.airframe_limit || 20000)} h
                    </span>
                  </div>
                  <div style={{ height:5, backgroundColor:'#1E3A5F', borderRadius:3 }}>
                    <div style={{ height:'100%', borderRadius:3, transition:'width 0.5s',
                      width:`${Math.min(100,(ac.airframe_hours||0)/(ac.airframe_limit||20000)*100)}%`,
                      backgroundColor: '#3B82F6' }}/>
                  </div>
                </div>
              </div>

              {/* Stats fiabilité */}
              {rel?.stats && (
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {rel.stats.aogCount > 0 && (
                    <span style={{ fontSize:9, color:'#F87171', backgroundColor:'rgba(239,68,68,0.1)',
                      padding:'2px 6px', borderRadius:4 }}>🚫 {rel.stats.aogCount} AOG</span>
                  )}
                  {rel.stats.majorCount > 0 && (
                    <span style={{ fontSize:9, color:'#FB923C', backgroundColor:'rgba(251,146,60,0.1)',
                      padding:'2px 6px', borderRadius:4 }}>⚡ {rel.stats.majorCount} majeurs</span>
                  )}
                  {rel.stats.delayRate > 0 && (
                    <span style={{ fontSize:9, color:'#94A3B8', backgroundColor:'rgba(71,85,105,0.2)',
                      padding:'2px 6px', borderRadius:4 }}>⏱ {rel.stats.delayRate}% retards</span>
                  )}
                  {rel.stats.flightCount > 0 && (
                    <span style={{ fontSize:9, color:'#5B8DB8', backgroundColor:'rgba(17,45,82,0.4)',
                      padding:'2px 6px', borderRadius:4 }}>✈ {rel.stats.flightCount} vols/30j</span>
                  )}
                </div>
              )}

              {/* Docs expirants */}
              {acExpDocs.length > 0 && (
                <div style={{ marginTop:10, padding:'7px 10px', borderRadius:8,
                  backgroundColor:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)' }}>
                  <span style={{ fontSize:10, color:'#FCD34D' }}>
                    ⚠️ {acExpDocs.length} document{acExpDocs.length>1?'s':''} à renouveler
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── PotentialsTab ──────────────────────────────────────────────────────────────
function PotentialsTab({ aircraft, reliability, flights }) {
  const breakdown = reliability?.breakdown || {}
  const stats     = reliability?.stats || {}
  const acFlights = flights.filter(f => f.aircraft === aircraft.registration)
  const today     = new Date(); today.setHours(0,0,0,0)
  const todayFlights = acFlights.filter(f => {
    const d = toDate(f.departure_time); return d && d >= today
  })
  const totalToday = todayFlights.reduce((s,f) => {
    const dep = toDate(f.departure_time); const arr = toDate(f.arrival_time)
    return s + Math.max(0, (arr-dep)/3600000)
  }, 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Potentiels */}
      <Card style={{ padding:20 }}>
        <h3 style={{ color:'#94A3B8', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16 }}>
          Potentiels actuels
        </h3>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <PotentialBar label="Moteur"  current={aircraft.engine_hours  ||0} limit={aircraft.engine_limit  ||3600}/>
          <PotentialBar label="Cellule" current={aircraft.airframe_hours ||0} limit={aircraft.airframe_limit||20000}/>
        </div>
      </Card>

      {/* Score fiabilité détaillé */}
      <Card style={{ padding:20 }}>
        <h3 style={{ color:'#94A3B8', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16 }}>
          Décomposition score fiabilité
        </h3>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {Object.entries(breakdown).map(([key, item]) => {
            const pct = item.score
            const c   = pct >= 80 ? '#4ADE80' : pct >= 55 ? '#F0B429' : '#EF4444'
            return (
              <div key={key}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:11, color:'#94A3B8' }}>{item.label}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:9, color:'#475569' }}>Poids : {item.weight}%</span>
                    <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color:c }}>{pct}/100</span>
                  </div>
                </div>
                <div style={{ height:6, backgroundColor:'#1E3A5F', borderRadius:3 }}>
                  <div style={{ height:'100%', width:`${pct}%`, borderRadius:3,
                    background:`linear-gradient(90deg,${c}70,${c})`, transition:'width 0.6s' }}/>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Stat vols */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
        {[
          { label:'Vols (30j)',     value: stats.flightCount  || 0,          unit:'',   color:'#5B8DB8' },
          { label:'Retards avion', value: `${stats.delayRate || 0}%`,         unit:'',   color: stats.delayRate > 20 ? '#F59E0B' : '#4ADE80' },
          { label:'Délai moyen',   value: stats.avgDelay      || 0,           unit:'min',color:'#94A3B8' },
          { label:'Incidents (30j)',value: (stats.aogCount||0)+(stats.majorCount||0)+(stats.minorCount||0), unit:'', color:(stats.aogCount||0)>0?'#EF4444':'#4ADE80' },
          { label:'Indispo (90j)', value: stats.unavailDays   || 0,           unit:'j',  color: stats.unavailDays > 5 ? '#F59E0B' : '#4ADE80' },
          { label:'Heures auj.',   value: totalToday.toFixed(1),              unit:'h',  color:'#F0B429' },
        ].map(k => (
          <Card key={k.label} style={{ padding:14 }}>
            <div style={{ fontSize:9, color:'#475569', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{k.label}</div>
            <div style={{ fontFamily:'monospace', fontSize:20, fontWeight:900, color:k.color, lineHeight:1 }}>
              {k.value}<span style={{ fontSize:11, marginLeft:3, color:'#5B8DB8' }}>{k.unit}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── TechLogTab ─────────────────────────────────────────────────────────────────
function TechLogTab({ aircraft, techLogs, onAddLog, onResolveLog, user }) {
  const [showForm, setShowForm] = useState(false)
  const [filterSev, setFilterSev] = useState('')
  const [filterType,setFilterType] = useState('')
  const [resolveId, setResolveId] = useState(null)
  const [resolution, setResolution] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    type:'observation', severity:'info', title:'', description:'',
    reported_by:'', flight_ref:'', engine_hours_at_event:'', airframe_hours_at_event:'',
    tags:'',
  })

  const logs = techLogs
    .filter(l => l.aircraft_registration === aircraft.registration)
    .filter(l => !filterSev  || l.severity === filterSev)
    .filter(l => !filterType || l.type     === filterType)

  const handleSave = async () => {
    if (!form.title) return
    setSaving(true)
    try {
      await onAddLog({
        ...form,
        aircraft_registration: aircraft.registration,
        aircraft_id: aircraft.id,
        engine_hours_at_event:   Number(form.engine_hours_at_event)   || aircraft.engine_hours   || 0,
        airframe_hours_at_event: Number(form.airframe_hours_at_event) || aircraft.airframe_hours || 0,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
        resolution: null, resolved_at: null, resolved_by: null,
      })
      setShowForm(false)
      setForm({ type:'observation', severity:'info', title:'', description:'', reported_by:'', flight_ref:'', engine_hours_at_event:'', airframe_hours_at_event:'', tags:'' })
    } finally { setSaving(false) }
  }

  const handleResolve = async () => {
    if (!resolution) return
    setSaving(true)
    try { await onResolveLog(resolveId, resolution); setResolveId(null); setResolution('') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Barre outils */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', gap:8 }}>
          <select value={filterSev} onChange={e => setFilterSev(e.target.value)} style={selectStyle}>
            <option value="">⚡ Toutes sévérités</option>
            {Object.entries(SEV_COLORS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
            <option value="">🔧 Tous types</option>
            {Object.entries(LOG_ICONS).map(([k,v]) => <option key={k} value={k}>{v} {k}</option>)}
          </select>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ fontSize:11, fontWeight:700, padding:'7px 14px', borderRadius:8, cursor:'pointer',
            backgroundColor:'#F0B429', color:'#0B1F3A', border:'none' }}>+ Nouvelle entrée</button>
      </div>

      {/* Formulaire */}
      {showForm && (
        <Card style={{ padding:20 }}>
          <h3 style={{ color:'#F1F5F9', fontWeight:700, fontSize:14, marginBottom:16 }}>Nouvelle entrée journal</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 }}>
            <FormField label="Type">
              <select value={form.type} onChange={e => setForm(v=>({...v,type:e.target.value}))} style={selectStyle}>
                {Object.entries(LOG_ICONS).map(([k,v]) => <option key={k} value={k}>{v} {k}</option>)}
              </select>
            </FormField>
            <FormField label="Sévérité">
              <select value={form.severity} onChange={e => setForm(v=>({...v,severity:e.target.value}))} style={selectStyle}>
                {Object.entries(SEV_COLORS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </FormField>
            <FormField label="Titre">
              <input value={form.title} onChange={e => setForm(v=>({...v,title:e.target.value}))} style={inputStyle} placeholder="Description courte"/>
            </FormField>
            <FormField label="Rapporté par">
              <input value={form.reported_by} onChange={e => setForm(v=>({...v,reported_by:e.target.value}))} style={inputStyle}/>
            </FormField>
            <FormField label="N° vol associé">
              <input value={form.flight_ref} onChange={e => setForm(v=>({...v,flight_ref:e.target.value}))} style={inputStyle} placeholder="ex: PV801"/>
            </FormField>
            <FormField label="Tags (virgule)">
              <input value={form.tags} onChange={e => setForm(v=>({...v,tags:e.target.value}))} style={inputStyle} placeholder="train,hydraulique"/>
            </FormField>
          </div>
          <div style={{ marginTop:12 }}>
            <FormField label="Description détaillée">
              <textarea value={form.description} onChange={e => setForm(v=>({...v,description:e.target.value}))}
                rows={3} style={{ ...inputStyle, resize:'vertical' }}/>
            </FormField>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button onClick={() => setShowForm(false)} style={{ padding:'7px 18px', borderRadius:8, fontSize:12, cursor:'pointer',
              backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155' }}>Annuler</button>
            <button onClick={handleSave} disabled={saving || !form.title}
              style={{ padding:'7px 22px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                backgroundColor:'#F0B429', color:'#0B1F3A', border:'none', opacity: saving||!form.title?0.5:1 }}>
              {saving ? '...' : '✓ Enregistrer'}
            </button>
          </div>
        </Card>
      )}

      {/* Modal résolution */}
      {resolveId && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center',
          backgroundColor:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)' }} onClick={() => setResolveId(null)}>
          <div style={{ backgroundColor:'#0F1E35', border:'1px solid #1E3A5F', borderRadius:16, padding:24, width:380, maxWidth:'90vw' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color:'#F1F5F9', fontWeight:700, fontSize:14, marginBottom:14 }}>Clôturer l'entrée</h3>
            <textarea value={resolution} onChange={e => setResolution(e.target.value)}
              placeholder="Décrire la résolution / action corrective..." rows={4}
              style={{ ...inputStyle, resize:'vertical', marginBottom:14 }}/>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setResolveId(null)} style={{ padding:'7px 18px', borderRadius:8, fontSize:12, cursor:'pointer',
                backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155' }}>Annuler</button>
              <button onClick={handleResolve} disabled={saving || !resolution}
                style={{ padding:'7px 22px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                  backgroundColor:'rgba(16,185,129,0.15)', color:'#34D399', border:'1px solid rgba(16,185,129,0.3)',
                  opacity: saving||!resolution?0.5:1 }}>
                {saving ? '...' : '✓ Clôturer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liste */}
      {logs.length === 0 && (
        <Card style={{ padding:28, textAlign:'center' }}>
          <p style={{ color:'#2D5580' }}>Aucune entrée dans le journal technique.</p>
        </Card>
      )}
      {logs.map(log => {
        const sc  = SEV_COLORS[log.severity]  || SEV_COLORS.info
        const dt  = toDate(log.created_at)
        const isResolved = !!log.resolved_at
        return (
          <Card key={log.id} style={{ padding:16, opacity: isResolved ? 0.7 : 1 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
              <div style={{ display:'flex', gap:12, flex:1, minWidth:0 }}>
                <div style={{ width:36, height:36, borderRadius:9, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                  backgroundColor:sc.bg, border:`1px solid ${sc.border}`, fontSize:16 }}>
                  {LOG_ICONS[log.type] || '🔧'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:5 }}>
                    <span style={{ fontWeight:700, fontSize:13, color: isResolved ? '#475569' : '#F1F5F9' }}>{log.title}</span>
                    <Badge label={sc.label} color={sc}/>
                    {isResolved && <Badge label="✓ Résolu" color="#4ADE80"/>}
                    {log.flight_ref && (
                      <span style={{ fontSize:10, fontFamily:'monospace', color:'#F0B429',
                        backgroundColor:'rgba(240,180,41,0.1)', padding:'1px 5px', borderRadius:3 }}>{log.flight_ref}</span>
                    )}
                  </div>
                  <div style={{ fontSize:10, color:'#5B8DB8', marginBottom:5 }}>
                    {dt ? fmtDate(dt) : ''}
                    {log.reported_by ? ` · ${log.reported_by}` : ''}
                    {log.engine_hours_at_event ? ` · ⚙️ ${log.engine_hours_at_event}h` : ''}
                  </div>
                  {log.description && <p style={{ fontSize:11, color:'#94A3B8', lineHeight:1.5, margin:0, marginBottom:6 }}>{log.description}</p>}
                  {log.resolution && (
                    <div style={{ fontSize:11, color:'#34D399', padding:'6px 10px', borderRadius:7,
                      backgroundColor:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)' }}>
                      ✓ {log.resolution}
                    </div>
                  )}
                  {log.tags?.length > 0 && (
                    <div style={{ display:'flex', gap:5, marginTop:7, flexWrap:'wrap' }}>
                      {log.tags.map(tag => (
                        <span key={tag} style={{ fontSize:9, padding:'1px 6px', borderRadius:3,
                          backgroundColor:'rgba(17,45,82,0.7)', color:'#5B8DB8', border:'1px solid #1E3A5F' }}>#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {!isResolved && (
                <button onClick={() => { setResolveId(log.id); setResolution('') }}
                  style={{ fontSize:10, fontWeight:700, padding:'5px 10px', borderRadius:7, cursor:'pointer', flexShrink:0,
                    backgroundColor:'rgba(16,185,129,0.1)', color:'#34D399', border:'1px solid rgba(16,185,129,0.25)' }}>
                  Clôturer
                </button>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── UnavailabilityTab ──────────────────────────────────────────────────────────
function UnavailabilityTab({ aircraft, unavailabilities, onAddUnavail, onCloseUnavail, onDeleteUnavail, user }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ type:'maintenance', reason:'', start_date:'', end_date:'' })

  const items = unavailabilities.filter(u => u.aircraft_registration === aircraft.registration)
    .sort((a, b) => toDate(b.start_date) - toDate(a.start_date))
  const active = items.filter(u => !u.end_date)

  const handleSave = async () => {
    if (!form.reason || !form.start_date) return
    setSaving(true)
    try {
      await onAddUnavail({
        ...form,
        aircraft_registration: aircraft.registration,
        aircraft_id: aircraft.id,
        start_date: new Date(form.start_date),
        end_date:   form.end_date ? new Date(form.end_date) : null,
        impact_flights: [],
      })
      setShowForm(false)
      setForm({ type:'maintenance', reason:'', start_date:'', end_date:'' })
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* AOG banner */}
      {active.length > 0 && (
        <div style={{ padding:'12px 16px', borderRadius:12, border:'1px solid #EF444460',
          backgroundColor:'rgba(239,68,68,0.1)', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:20 }}>🚫</span>
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:'#F87171' }}>
              Avion actuellement indisponible
            </div>
            <div style={{ fontSize:11, color:'#EF4444', marginTop:2 }}>
              {active.map(u => `${UNAVAIL_TYPES[u.type]?.label || u.type} — ${u.reason}`).join(' · ')}
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:12, color:'#5B8DB8' }}>{items.length} entrée{items.length!==1?'s':''}</span>
        <button onClick={() => setShowForm(true)}
          style={{ fontSize:11, fontWeight:700, padding:'7px 14px', borderRadius:8, cursor:'pointer',
            backgroundColor:'#F0B429', color:'#0B1F3A', border:'none' }}>+ Déclarer indispo</button>
      </div>

      {showForm && (
        <Card style={{ padding:20 }}>
          <h3 style={{ color:'#F1F5F9', fontWeight:700, fontSize:14, marginBottom:16 }}>Déclarer une indisponibilité</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 }}>
            <FormField label="Type">
              <select value={form.type} onChange={e => setForm(v=>({...v,type:e.target.value}))} style={selectStyle}>
                {Object.entries(UNAVAIL_TYPES).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </FormField>
            <FormField label="Début">
              <input type="datetime-local" value={form.start_date} onChange={e => setForm(v=>({...v,start_date:e.target.value}))} style={inputStyle}/>
            </FormField>
            <FormField label="Fin prévue (laisser vide si en cours)">
              <input type="datetime-local" value={form.end_date} onChange={e => setForm(v=>({...v,end_date:e.target.value}))} style={inputStyle}/>
            </FormField>
          </div>
          <div style={{ marginTop:12 }}>
            <FormField label="Motif">
              <input value={form.reason} onChange={e => setForm(v=>({...v,reason:e.target.value}))} style={inputStyle} placeholder="ex: Défaut hydraulique, visite 100h..."/>
            </FormField>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button onClick={() => setShowForm(false)} style={{ padding:'7px 18px', borderRadius:8, fontSize:12, cursor:'pointer',
              backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155' }}>Annuler</button>
            <button onClick={handleSave} disabled={saving||!form.reason||!form.start_date}
              style={{ padding:'7px 22px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                backgroundColor:'#F0B429', color:'#0B1F3A', border:'none', opacity:saving||!form.reason||!form.start_date?0.5:1 }}>
              {saving ? '...' : '✓ Déclarer'}
            </button>
          </div>
        </Card>
      )}

      {items.length === 0 && (
        <Card style={{ padding:28, textAlign:'center' }}>
          <p style={{ color:'#2D5580' }}>Aucune indisponibilité enregistrée.</p>
        </Card>
      )}
      {items.map(u => {
        const ut    = UNAVAIL_TYPES[u.type] || UNAVAIL_TYPES.other
        const start = toDate(u.start_date)
        const end   = u.end_date ? toDate(u.end_date) : null
        const durDays = end ? Math.round((end-start)/86400000) : Math.round((Date.now()-start)/86400000)
        const isActive = !u.end_date
        return (
          <Card key={u.id} style={{ padding:16 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
              <div style={{ display:'flex', gap:12, flex:1 }}>
                <div style={{ width:38, height:38, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center',
                  backgroundColor:`${ut.color}15`, border:`1px solid ${ut.color}40`, fontSize:18, flexShrink:0 }}>
                  {ut.icon}
                </div>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:5 }}>
                    <span style={{ fontWeight:700, fontSize:13, color:'#F1F5F9' }}>{u.reason}</span>
                    <Badge label={ut.label} color={ut.color}/>
                    {isActive
                      ? <Badge label="En cours" color="#EF4444"/>
                      : <Badge label="Clôturée" color="#4ADE80"/>}
                  </div>
                  <div style={{ fontSize:11, color:'#5B8DB8' }}>
                    📅 {fmtDate(start)} {end ? `→ ${fmtDate(end)}` : '→ en cours'}
                    <span style={{ marginLeft:10, color:'#94A3B8' }}>({durDays} j{durDays>1?'ours':'our'})</span>
                  </div>
                </div>
              </div>
              <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                {isActive && (
                  <button onClick={() => onCloseUnavail(u.id)}
                    style={{ fontSize:10, fontWeight:700, padding:'5px 10px', borderRadius:7, cursor:'pointer',
                      backgroundColor:'rgba(16,185,129,0.1)', color:'#34D399', border:'1px solid rgba(16,185,129,0.25)' }}>
                    ✓ Clôturer
                  </button>
                )}
                <button onClick={() => onDeleteUnavail(u.id)}
                  style={{ fontSize:10, padding:'5px 10px', borderRadius:7, cursor:'pointer',
                    backgroundColor:'rgba(71,85,105,0.2)', color:'#64748B', border:'1px solid #334155' }}>
                  ✕
                </button>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── DocumentsTab ───────────────────────────────────────────────────────────────
function DocumentsTab({ aircraft, aircraftDocs, onAddDoc, onDeleteDoc }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ type:'arc', title:'', reference:'', issued_by:'', issue_date:'', expiry_date:'', alert_days_before:30, file_url:'' })

  const docs = aircraftDocs.filter(d => d.aircraft_registration === aircraft.registration)
    .sort((a, b) => {
      const order = { expired:0, expiring:1, valid:2 }
      return (order[a.computed_status]||2) - (order[b.computed_status]||2)
    })

  const handleSave = async () => {
    if (!form.title) return
    setSaving(true)
    try {
      await onAddDoc({
        ...form,
        aircraft_registration: aircraft.registration,
        aircraft_id: aircraft.id,
        issue_date:  form.issue_date  ? new Date(form.issue_date)  : null,
        expiry_date: form.expiry_date ? new Date(form.expiry_date) : null,
        alert_days_before: Number(form.alert_days_before) || 30,
      })
      setShowForm(false)
      setForm({ type:'arc', title:'', reference:'', issued_by:'', issue_date:'', expiry_date:'', alert_days_before:30, file_url:'' })
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Alerte docs expirés */}
      {docs.some(d => d.computed_status !== 'valid') && (
        <div style={{ padding:'10px 16px', borderRadius:10, border:'1px solid rgba(245,158,11,0.3)',
          backgroundColor:'rgba(245,158,11,0.07)', display:'flex', gap:10, alignItems:'center' }}>
          <span>⚠️</span>
          <span style={{ fontSize:12, color:'#FCD34D' }}>
            {docs.filter(d=>d.computed_status==='expired').length} document(s) expiré(s) ·
            {' '}{docs.filter(d=>d.computed_status==='expiring').length} à renouveler bientôt
          </span>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:12, color:'#5B8DB8' }}>{docs.length} document{docs.length!==1?'s':''}</span>
        <button onClick={() => setShowForm(true)}
          style={{ fontSize:11, fontWeight:700, padding:'7px 14px', borderRadius:8, cursor:'pointer',
            backgroundColor:'#F0B429', color:'#0B1F3A', border:'none' }}>+ Ajouter document</button>
      </div>

      {showForm && (
        <Card style={{ padding:20 }}>
          <h3 style={{ color:'#F1F5F9', fontWeight:700, fontSize:14, marginBottom:16 }}>Nouveau document</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 }}>
            <FormField label="Type">
              <select value={form.type} onChange={e => setForm(v=>({...v,type:e.target.value}))} style={selectStyle}>
                {Object.entries(DOC_TYPES).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </FormField>
            <FormField label="Titre / désignation">
              <input value={form.title} onChange={e => setForm(v=>({...v,title:e.target.value}))} style={inputStyle}/>
            </FormField>
            <FormField label="Référence / N°">
              <input value={form.reference} onChange={e => setForm(v=>({...v,reference:e.target.value}))} style={inputStyle}/>
            </FormField>
            <FormField label="Émis par">
              <input value={form.issued_by} onChange={e => setForm(v=>({...v,issued_by:e.target.value}))} style={inputStyle} placeholder="DGAC, assureur..."/>
            </FormField>
            <FormField label="Date d'émission">
              <input type="date" value={form.issue_date} onChange={e => setForm(v=>({...v,issue_date:e.target.value}))} style={inputStyle}/>
            </FormField>
            <FormField label="Date d'expiration">
              <input type="date" value={form.expiry_date} onChange={e => setForm(v=>({...v,expiry_date:e.target.value}))} style={inputStyle}/>
            </FormField>
            <FormField label="Alerter X jours avant">
              <input type="number" value={form.alert_days_before} onChange={e => setForm(v=>({...v,alert_days_before:Number(e.target.value)}))} style={inputStyle} min={1} max={180}/>
            </FormField>
            <FormField label="Lien fichier (URL)">
              <input value={form.file_url} onChange={e => setForm(v=>({...v,file_url:e.target.value}))} style={inputStyle} placeholder="https://..."/>
            </FormField>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button onClick={() => setShowForm(false)} style={{ padding:'7px 18px', borderRadius:8, fontSize:12, cursor:'pointer',
              backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155' }}>Annuler</button>
            <button onClick={handleSave} disabled={saving||!form.title}
              style={{ padding:'7px 22px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                backgroundColor:'#F0B429', color:'#0B1F3A', border:'none', opacity:saving||!form.title?0.5:1 }}>
              {saving ? '...' : '✓ Enregistrer'}
            </button>
          </div>
        </Card>
      )}

      {docs.length === 0 && (
        <Card style={{ padding:28, textAlign:'center' }}>
          <p style={{ color:'#2D5580' }}>Aucun document enregistré.</p>
        </Card>
      )}
      {docs.map(d => {
        const dt  = DOC_TYPES[d.type] || DOC_TYPES.other
        const sc  = { valid:docStatusColor.valid, expiring:docStatusColor.expiring, expired:docStatusColor.expired }[d.computed_status]
        const sl  = { valid:docStatusLabel.valid, expiring:docStatusLabel.expiring, expired:docStatusLabel.expired }[d.computed_status]
        const exp = toDate(d.expiry_date)
        const days= exp ? daysUntil(d.expiry_date) : null
        return (
          <Card key={d.id} style={{ padding:16 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
              <div style={{ display:'flex', gap:12, flex:1 }}>
                <div style={{ width:38, height:38, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center',
                  backgroundColor:`${sc}15`, border:`1px solid ${sc}40`, fontSize:18, flexShrink:0 }}>
                  {dt.icon}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:5 }}>
                    <span style={{ fontWeight:700, fontSize:13, color:'#F1F5F9' }}>{d.title}</span>
                    <Badge label={sl} color={sc}/>
                    <Badge label={dt.label} color="#5B8DB8"/>
                  </div>
                  <div style={{ fontSize:11, color:'#5B8DB8' }}>
                    {d.reference && <span style={{ marginRight:10, fontFamily:'monospace' }}>{d.reference}</span>}
                    {d.issued_by && <span style={{ marginRight:10 }}>🏛 {d.issued_by}</span>}
                  </div>
                  <div style={{ fontSize:11, color:'#64748B', marginTop:3 }}>
                    {toDate(d.issue_date) && `Émis : ${fmtDate(toDate(d.issue_date))}`}
                    {exp && (
                      <span style={{ marginLeft:10, color:sc, fontWeight:600 }}>
                        Expire : {fmtDate(exp)}
                        {days !== null && ` (${days > 0 ? `dans ${days}j` : 'expiré'})`}
                      </span>
                    )}
                    {!exp && <span style={{ marginLeft:10, color:'#2D5580' }}>Pas d'expiration</span>}
                  </div>
                  {d.file_url && (
                    <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize:11, color:'#60A5FA', marginTop:6, display:'inline-block' }}>
                      📎 Voir le document
                    </a>
                  )}
                </div>
              </div>
              <button onClick={() => onDeleteDoc(d.id)}
                style={{ fontSize:10, padding:'5px 10px', borderRadius:7, cursor:'pointer',
                  backgroundColor:'rgba(71,85,105,0.2)', color:'#64748B', border:'1px solid #334155', flexShrink:0 }}>
                ✕
              </button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── AircraftDetail ─────────────────────────────────────────────────────────────
const DETAIL_TABS = [
  { id:'potentials', icon:'📊', label:'Heures/Cycles' },
  { id:'techlog',    icon:'📋', label:'Journal technique' },
  { id:'unavail',    icon:'🚫', label:'Indisponibilités' },
  { id:'docs',       icon:'📄', label:'Documents' },
]

function AircraftDetail({ aircraft, reliability, flights, techLogs, unavailabilities, aircraftDocs,
  onAddLog, onResolveLog, onAddUnavail, onCloseUnavail, onDeleteUnavail, onAddDoc, onDeleteDoc, onBack, user }) {

  const [activeTab, setActiveTab] = useState('potentials')
  const sc   = AC_STATUS_COLORS[aircraft.status] || AC_STATUS_COLORS.available
  const score= reliability?.score ?? 80
  const color= scoreColor(score)

  const badges = {
    techlog:  techLogs.filter(l => l.aircraft_registration === aircraft.registration && !l.resolved_at).length,
    unavail:  unavailabilities.filter(u => u.aircraft_registration === aircraft.registration && !u.end_date).length,
    docs:     aircraftDocs.filter(d => d.aircraft_registration === aircraft.registration && d.computed_status !== 'valid').length,
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 20px',
        backgroundColor:'#0A1628', border:'1px solid #1E3A5F', borderRadius:14 }}>
        <button onClick={onBack} style={{ width:34, height:34, borderRadius:8, border:'1px solid #1E3A5F',
          cursor:'pointer', backgroundColor:'rgba(17,45,82,0.5)', color:'#5B8DB8', fontSize:16,
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>‹</button>

        <ReliabilityGauge score={score} size={64}/>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:22, color:'#F1F5F9', letterSpacing:2 }}>
              {aircraft.registration}
            </span>
            <Badge label={sc.label} color={sc}/>
            <span style={{ fontSize:12, fontWeight:700, color }}>{scoreLabel(score)}</span>
            {reliability?.trend === 'down' && <span style={{ fontSize:11, color:'#F87171' }}>↓</span>}
            {reliability?.trend === 'up'   && <span style={{ fontSize:11, color:'#4ADE80' }}>↑</span>}
          </div>
          <div style={{ fontSize:12, color:'#5B8DB8', marginTop:3 }}>
            {aircraft.type || aircraft.model || '—'}
            {aircraft.msn && <span style={{ marginLeft:10, fontFamily:'monospace', color:'#2D5580' }}>MSN {aircraft.msn}</span>}
          </div>
        </div>

        {/* Mini stats */}
        <div style={{ display:'flex', gap:12, flexShrink:0 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:18, fontWeight:900, fontFamily:'monospace', color:'#5B8DB8', lineHeight:1 }}>
              {aircraft.engine_hours?.toLocaleString() || 0}
            </div>
            <div style={{ fontSize:9, color:'#2D5580' }}>h moteur</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:18, fontWeight:900, fontFamily:'monospace', color:'#5B8DB8', lineHeight:1 }}>
              {aircraft.airframe_hours?.toLocaleString() || 0}
            </div>
            <div style={{ fontSize:9, color:'#2D5580' }}>h cellule</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, padding:4, backgroundColor:'rgba(7,23,41,0.8)',
        borderRadius:12, border:'1px solid #1E3A5F' }}>
        {DETAIL_TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              padding:'9px 12px', borderRadius:9, border:'none', cursor:'pointer', position:'relative',
              backgroundColor: activeTab === t.id ? '#1E3A5F' : 'transparent',
              color: activeTab === t.id ? '#F0B429' : '#5B8DB8',
              fontWeight: activeTab === t.id ? 700 : 500, fontSize:12 }}>
            <span>{t.icon}</span>
            <span style={{ display:'none' }} className="sm-inline">{t.label}</span>
            {badges[t.id] > 0 && (
              <span style={{ position:'absolute', top:4, right:4, width:14, height:14, borderRadius:'50%',
                backgroundColor:'#EF4444', color:'#fff', fontSize:8, fontWeight:900,
                display:'flex', alignItems:'center', justifyContent:'center' }}>{badges[t.id]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {activeTab === 'potentials' && <PotentialsTab aircraft={aircraft} reliability={reliability} flights={flights}/>}
      {activeTab === 'techlog'    && <TechLogTab aircraft={aircraft} techLogs={techLogs} onAddLog={onAddLog} onResolveLog={onResolveLog} user={user}/>}
      {activeTab === 'unavail'    && <UnavailabilityTab aircraft={aircraft} unavailabilities={unavailabilities} onAddUnavail={onAddUnavail} onCloseUnavail={onCloseUnavail} onDeleteUnavail={onDeleteUnavail} user={user}/>}
      {activeTab === 'docs'       && <DocumentsTab aircraft={aircraft} aircraftDocs={aircraftDocs} onAddDoc={onAddDoc} onDeleteDoc={onDeleteDoc}/>}
    </div>
  )
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function FleetPage({ fleet, flights, user }) {
  const [selectedAircraft, setSelectedAircraft] = useState(null)

  const {
    techLogs, unavailabilities, aircraftDocs, loading, error,
    reliabilityScores, expiringDocs, currentlyUnavailable,
    onAddLog, onResolveLog,
    onAddUnavail, onCloseUnavail, onDeleteUnavail,
    onAddDoc, onUpdateDoc, onDeleteDoc,
    clearError,
  } = useFleetDetail({ fleet, flights, user })

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200 }}>
      <div style={{ color:'#5B8DB8', fontSize:13, fontFamily:'monospace' }}>Chargement flotte...</div>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Header */}
      {!selectedAircraft && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <div>
            <h1 style={{ color:'#F1F5F9', fontWeight:900, fontSize:20, margin:0, display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:22 }}>✈️</span> Gestion Flotte
            </h1>
            <p style={{ color:'#475569', fontSize:12, marginTop:4 }}>
              {fleet.length} avion{fleet.length>1?'s':''} · Score fiabilité basé sur potentiels, incidents et ponctualité
            </p>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            {currentlyUnavailable.length > 0 && (
              <span style={{ fontSize:11, fontWeight:700, padding:'5px 12px', borderRadius:8,
                backgroundColor:'rgba(239,68,68,0.12)', color:'#F87171', border:'1px solid rgba(239,68,68,0.3)' }}>
                🚫 {currentlyUnavailable.length} indispo
              </span>
            )}
            {expiringDocs.length > 0 && (
              <span style={{ fontSize:11, fontWeight:700, padding:'5px 12px', borderRadius:8,
                backgroundColor:'rgba(245,158,11,0.1)', color:'#FCD34D', border:'1px solid rgba(245,158,11,0.25)' }}>
                ⚠️ {expiringDocs.length} docs
              </span>
            )}
          </div>
        </div>
      )}

      {/* Erreur */}
      {error && (
        <div style={{ padding:'10px 16px', borderRadius:10, backgroundColor:'rgba(239,68,68,0.1)',
          border:'1px solid rgba(239,68,68,0.3)', display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontSize:12, color:'#F87171' }}>⚠️ {error}</span>
          <button onClick={clearError} style={{ fontSize:12, color:'#F87171', cursor:'pointer', background:'none', border:'none' }}>✕</button>
        </div>
      )}

      {/* Vue */}
      {!selectedAircraft ? (
        <FleetOverview
          fleet={fleet}
          reliabilityScores={reliabilityScores}
          currentlyUnavailable={currentlyUnavailable}
          expiringDocs={expiringDocs}
          onSelectAircraft={setSelectedAircraft}
        />
      ) : (
        <AircraftDetail
          aircraft={selectedAircraft}
          reliability={reliabilityScores[selectedAircraft.registration]}
          flights={flights}
          techLogs={techLogs}
          unavailabilities={unavailabilities}
          aircraftDocs={aircraftDocs}
          onAddLog={onAddLog}
          onResolveLog={onResolveLog}
          onAddUnavail={onAddUnavail}
          onCloseUnavail={onCloseUnavail}
          onDeleteUnavail={onDeleteUnavail}
          onAddDoc={onAddDoc}
          onDeleteDoc={onDeleteDoc}
          onBack={() => setSelectedAircraft(null)}
          user={user}
        />
      )}
    </div>
  )
}