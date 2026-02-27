/**
 * @fileoverview Gantt renforcé SKYBH — v2
 * Vue Jour / Semaine · Navigation · Privé vs Régulier · Tooltip enrichi
 * Conflits · Filtres · Heatmap · Verrouillage · Export · Suggestions
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { Timestamp } from 'firebase/firestore'
import {
  analyzeAllConflicts, buildConflictIndex, computeHeatmap,
} from '../../utils/gantt-conflicts'
import { usePlanningRules } from '../../hooks/use-planning-rules'
import { updateFlight, AIRPORTS_FULL } from '../../services/flights'

// ── Config ─────────────────────────────────────────────────────────────────────
const GANTT_START = 6
const GANTT_END   = 19

// Distance approximative entre aéroports (nm)
const ROUTE_DISTANCES = {
  'TFFJ-TFFG': 11, 'TFFG-TFFJ': 11,
  'TFFJ-TNCM': 11, 'TNCM-TFFJ': 11,
  'TFFJ-TQPF': 35, 'TQPF-TFFJ': 35,
  'TFFG-TNCM': 3,  'TNCM-TFFG': 3,
  'TFFJ-TFFR': 120,'TFFR-TFFJ': 120,
}
const getDistance = (orig, dest) => ROUTE_DISTANCES[`${orig}-${dest}`] || null

// ── Helpers ────────────────────────────────────────────────────────────────────
const toDate   = ts  => ts?.toDate ? ts.toDate() : new Date(ts)
const fmtTime  = d   => d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
const fmtDay   = d   => d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric' })
const fmtDayFull = d => d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })
const fmtWeek  = (mon, sun) => {
  const opts = { day:'numeric', month:'short' }
  return `${mon.toLocaleDateString('fr-FR', opts)} – ${sun.toLocaleDateString('fr-FR', opts)}`
}

/** Retourne le lundi de la semaine contenant `date` */
const getMonday = (date) => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0,0,0,0)
  return d
}

/** 7 jours à partir du lundi */
const getWeekDays = (monday) =>
  Array.from({ length:7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

/** Durée en min entre dep et arr */
const flightDuration = (dep, arr) => Math.round((toDate(arr) - toDate(dep)) / 60000)

const pctToTime = (pct) => {
  const totalMins = (GANTT_END - GANTT_START) * 60
  const mins = Math.round(pct * totalMins)
  return { h: GANTT_START + Math.floor(mins / 60), m: mins % 60 }
}

const isSameDay = (d1, d2) =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth()    === d2.getMonth()    &&
  d1.getDate()     === d2.getDate()

// ── Palettes ───────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  landed:    { bg:'rgba(30,77,43,0.85)',  border:'#4ADE80', text:'#4ADE80' },
  in_flight: { bg:'rgba(90,60,0,0.9)',   border:'#F0B429', text:'#F0B429' },
  scheduled: { bg:'rgba(17,45,82,0.9)',  border:'#3B82F6', text:'#93C5FD' },
  boarding:  { bg:'rgba(70,35,0,0.9)',   border:'#FB923C', text:'#FB923C' },
  cancelled: { bg:'rgba(50,10,10,0.85)', border:'#F87171', text:'#F87171' },
}

// Différenciation Privé vs Régulier — style de bordure + icône
const FLIGHT_TYPE_STYLE = {
  private:   { borderStyle:'dashed', icon:'✦', label:'PRIVÉ',    accentColor:'#C084FC' },
  regular:   { borderStyle:'solid',  icon:'●', label:'RÉGULIER', accentColor:null       },
}

const CONFLICT_COLORS = {
  critical: { border:'#EF4444', bg:'rgba(239,68,68,0.15)', glow:'rgba(239,68,68,0.4)' },
  warning:  { border:'#F59E0B', bg:'rgba(245,158,11,0.12)', glow:'rgba(245,158,11,0.3)' },
}

const CONFLICT_LABELS = {
  overlap:'Chevauchement', turnaround:'Rotation courte',
  unavailable:'Avion indispo', ftl:'Limite FTL', overload:'Surcharge',
}

const HEATMAP_COLORS = [
  'transparent','rgba(59,130,246,0.15)','rgba(59,130,246,0.3)',
  'rgba(245,158,11,0.35)','rgba(239,68,68,0.45)',
]

// ── Tooltip enrichi ────────────────────────────────────────────────────────────
function FlightTooltip({ flight, conflicts, x, y }) {
  if (!flight) return null
  const dep  = toDate(flight.departure_time)
  const arr  = toDate(flight.arrival_time)
  const dur  = flightDuration(flight.departure_time, flight.arrival_time)
  const dist = getDistance(flight.origin, flight.destination)
  const isPrivate = flight.flight_type === 'private'
  const sc   = STATUS_COLORS[flight.status] || STATUS_COLORS.scheduled

  return (
    <div style={{
      position:'fixed', left: Math.min(x + 14, window.innerWidth - 280), top: Math.max(y - 10, 8),
      zIndex:999, width:260, pointerEvents:'none',
      backgroundColor:'#0A1628', border:'1px solid #1E3A5F', borderRadius:12,
      boxShadow:'0 8px 32px rgba(0,0,0,0.6)',
      overflow:'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding:'10px 14px', borderBottom:'1px solid #1E3A5F',
        background:'linear-gradient(135deg,rgba(17,45,82,0.8),rgba(7,23,41,0.9))',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:14, color:'#F0B429' }}>
            {flight.flight_number}
          </span>
          {isPrivate && (
            <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4,
              backgroundColor:'rgba(192,132,252,0.15)', color:'#C084FC',
              border:'1px solid rgba(192,132,252,0.3)', letterSpacing:'0.06em' }}>
              ✦ PRIVÉ
            </span>
          )}
        </div>
        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4,
          backgroundColor:`${sc.border}18`, color:sc.text, border:`1px solid ${sc.border}40` }}>
          {flight.status?.replace('_',' ').toUpperCase()}
        </span>
      </div>

      <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
        {/* Route */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:'monospace', fontWeight:800, fontSize:16, color:'#F1F5F9' }}>
              {AIRPORTS_FULL[flight.origin]?.short || flight.origin}
            </div>
            <div style={{ fontSize:9, color:'#475569' }}>{flight.origin}</div>
          </div>
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
            <div style={{ width:'100%', height:1, background:'linear-gradient(90deg,#1E3A5F,#3B82F6,#1E3A5F)' }}/>
            <div style={{ display:'flex', gap:6 }}>
              <span style={{ fontSize:9, color:'#5B8DB8', fontFamily:'monospace' }}>{dur} min</span>
              {dist && <span style={{ fontSize:9, color:'#5B8DB8', fontFamily:'monospace' }}>{dist} nm</span>}
            </div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:'monospace', fontWeight:800, fontSize:16, color:'#F1F5F9' }}>
              {AIRPORTS_FULL[flight.destination]?.short || flight.destination}
            </div>
            <div style={{ fontSize:9, color:'#475569' }}>{flight.destination}</div>
          </div>
        </div>

        {/* Horaires */}
        <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 10px', borderRadius:8,
          backgroundColor:'rgba(17,45,82,0.5)', border:'1px solid #1E3A5F' }}>
          <div>
            <div style={{ fontSize:9, color:'#475569' }}>Départ</div>
            <div style={{ fontFamily:'monospace', fontWeight:700, fontSize:13, color:'#F1F5F9' }}>{fmtTime(dep)}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center' }}>
            <span style={{ fontSize:12, color:'#2D5580' }}>→</span>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:9, color:'#475569' }}>Arrivée</div>
            <div style={{ fontFamily:'monospace', fontWeight:700, fontSize:13, color:'#F1F5F9' }}>{fmtTime(arr)}</div>
          </div>
        </div>

        {/* Infos avion / pilote / PAX */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
          {[
            { label:'Avion',  value: flight.aircraft || '—'  },
            { label:'Pilote', value: flight.pilot    || '—'  },
            { label:'PAX',    value: `${flight.pax_count ?? 0} / ${flight.max_pax ?? 9}` },
            { label:'Durée',  value: `${dur} min`            },
            ...(dist ? [{ label:'Distance', value:`${dist} nm` }] : []),
          ].map(item => (
            <div key={item.label} style={{ padding:'5px 8px', borderRadius:6,
              backgroundColor:'rgba(15,30,53,0.6)', border:'1px solid rgba(30,58,95,0.5)' }}>
              <div style={{ fontSize:8, color:'#475569', textTransform:'uppercase', letterSpacing:'0.06em' }}>{item.label}</div>
              <div style={{ fontSize:11, fontWeight:600, color:'#94A3B8', marginTop:1, fontFamily:'monospace' }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Conflits */}
        {conflicts?.length > 0 && (
          <div style={{ borderRadius:7, padding:'7px 9px',
            backgroundColor:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)' }}>
            {conflicts.map((c, i) => (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:6, marginTop: i > 0 ? 5 : 0 }}>
                <span style={{ fontSize:9, flexShrink:0 }}>{c.severity === 'critical' ? '🔴' : '🟡'}</span>
                <span style={{ fontSize:10, color: c.severity === 'critical' ? '#F87171' : '#FCD34D', lineHeight:1.4 }}>
                  {c.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── StatusDot ──────────────────────────────────────────────────────────────────
function StatusDot({ status }) {
  const c = { available:'#4ADE80', in_flight:'#F0B429', maintenance:'#F87171' }[status] || '#9CA3AF'
  return <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', backgroundColor:c, boxShadow:`0 0 6px ${c}`, flexShrink:0 }}/>
}

// ── ConflictBadge ──────────────────────────────────────────────────────────────
function ConflictBadge({ conflicts }) {
  if (!conflicts?.length) return null
  const worst = conflicts.find(c => c.severity === 'critical') || conflicts[0]
  return (
    <div style={{
      position:'absolute', top:-5, right:-5, zIndex:30,
      width:14, height:14, borderRadius:'50%',
      backgroundColor: worst.severity === 'critical' ? '#EF4444' : '#F59E0B',
      border:'2px solid #071729', display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:8, fontWeight:900, color:'#fff',
      boxShadow:`0 0 8px ${worst.severity === 'critical' ? '#EF4444' : '#F59E0B'}`,
    }}>!</div>
  )
}

// ── WeekNavigator ──────────────────────────────────────────────────────────────
function WeekNavigator({ viewMode, setViewMode, selectedDay, setSelectedDay, weekMonday, setWeekMonday }) {
  const today    = new Date(); today.setHours(0,0,0,0)
  const weekDays = getWeekDays(weekMonday)
  const isCurrentWeek = isSameDay(weekMonday, getMonday(today))

  const prevWeek = () => {
    const d = new Date(weekMonday); d.setDate(d.getDate() - 7); setWeekMonday(d)
  }
  const nextWeek = () => {
    const d = new Date(weekMonday); d.setDate(d.getDate() + 7); setWeekMonday(d)
  }
  const goToday = () => {
    setWeekMonday(getMonday(today))
    setSelectedDay(today)
  }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
      {/* Vue toggle */}
      <div style={{ display:'flex', backgroundColor:'rgba(7,23,41,0.8)', borderRadius:8, padding:3, border:'1px solid #1E3A5F' }}>
        {[{ id:'day', label:'Jour' }, { id:'week', label:'Semaine' }].map(v => (
          <button key={v.id} onClick={() => setViewMode(v.id)}
            style={{ fontSize:11, fontWeight:600, padding:'5px 12px', borderRadius:6, cursor:'pointer', border:'none',
              backgroundColor: viewMode === v.id ? '#1E3A5F' : 'transparent',
              color: viewMode === v.id ? '#F0B429' : '#5B8DB8', transition:'all 0.15s' }}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <button onClick={prevWeek}
          style={{ width:28, height:28, borderRadius:7, border:'1px solid #1E3A5F', cursor:'pointer',
            backgroundColor:'rgba(17,45,82,0.5)', color:'#5B8DB8', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>
          ‹
        </button>

        {/* Jours de la semaine (vue jour uniquement) */}
        {viewMode === 'day' && (
          <div style={{ display:'flex', gap:3 }}>
            {weekDays.map((d, i) => {
              const isToday   = isSameDay(d, today)
              const isSelected= isSameDay(d, selectedDay)
              return (
                <button key={i} onClick={() => setSelectedDay(d)}
                  style={{ fontSize:10, fontWeight: isSelected ? 700 : 500,
                    padding:'4px 8px', borderRadius:7, cursor:'pointer', border:'none',
                    minWidth:44, textAlign:'center',
                    backgroundColor: isSelected ? '#1E3A5F' : isToday ? 'rgba(240,180,41,0.08)' : 'transparent',
                    color: isSelected ? '#F0B429' : isToday ? '#F0B429' : '#5B8DB8',
                    outline: isToday && !isSelected ? '1px solid rgba(240,180,41,0.3)' : 'none',
                    transition:'all 0.12s' }}>
                  <div>{['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][i]}</div>
                  <div style={{ fontSize:12, fontWeight:700 }}>{d.getDate()}</div>
                </button>
              )
            })}
          </div>
        )}

        {/* Label semaine (vue semaine) */}
        {viewMode === 'week' && (
          <div style={{ fontSize:12, fontWeight:600, color:'#94A3B8', padding:'4px 12px',
            backgroundColor:'rgba(17,45,82,0.4)', borderRadius:8, border:'1px solid #1E3A5F',
            minWidth:160, textAlign:'center' }}>
            {fmtWeek(weekDays[0], weekDays[6])}
          </div>
        )}

        <button onClick={nextWeek}
          style={{ width:28, height:28, borderRadius:7, border:'1px solid #1E3A5F', cursor:'pointer',
            backgroundColor:'rgba(17,45,82,0.5)', color:'#5B8DB8', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>
          ›
        </button>

        {!isCurrentWeek && (
          <button onClick={goToday}
            style={{ fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:7, cursor:'pointer',
              backgroundColor:'rgba(240,180,41,0.1)', color:'#F0B429', border:'1px solid rgba(240,180,41,0.25)' }}>
            Aujourd'hui
          </button>
        )}
      </div>
    </div>
  )
}

// ── LockBar ────────────────────────────────────────────────────────────────────
function PlanningLockBar({ rules, onLock, onUnlock, onValidate, conflictCount }) {
  const isValidated = !!rules.validated_by
  const isLocked    = rules.locked
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10,
      padding:'10px 16px', borderRadius:12,
      backgroundColor: isValidated ? 'rgba(16,185,129,0.08)' : isLocked ? 'rgba(245,158,11,0.08)' : 'rgba(17,45,82,0.4)',
      border:`1px solid ${isValidated ? 'rgba(16,185,129,0.3)' : isLocked ? 'rgba(245,158,11,0.25)' : '#1E3A5F'}`,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:15 }}>{isValidated ? '✅' : isLocked ? '🔒' : '📋'}</span>
        <div>
          <div style={{ fontSize:12, fontWeight:700, color: isValidated ? '#34D399' : isLocked ? '#FCD34D' : '#94A3B8' }}>
            {isValidated ? `Validé par ${rules.validated_by}` : isLocked ? `Verrouillé par ${rules.locked_by}` : 'Planning en édition'}
          </div>
          {conflictCount > 0 && (
            <div style={{ fontSize:10, color:'#F87171', marginTop:1 }}>
              ⚠️ {conflictCount} conflit{conflictCount > 1 ? 's' : ''} critique{conflictCount > 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        {!isLocked && !isValidated && (
          <button onClick={onLock} style={{ fontSize:11, fontWeight:700, padding:'6px 14px', borderRadius:8, cursor:'pointer',
            backgroundColor:'rgba(245,158,11,0.15)', color:'#FCD34D', border:'1px solid rgba(245,158,11,0.3)' }}>
            🔒 Verrouiller
          </button>
        )}
        {isLocked && !isValidated && (<>
          <button onClick={onUnlock} style={{ fontSize:11, padding:'6px 12px', borderRadius:8, cursor:'pointer',
            backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155' }}>
            🔓 Déverrouiller
          </button>
          <button onClick={onValidate} disabled={conflictCount > 0}
            style={{ fontSize:11, fontWeight:700, padding:'6px 14px', borderRadius:8,
              cursor: conflictCount > 0 ? 'not-allowed' : 'pointer', opacity: conflictCount > 0 ? 0.4 : 1,
              backgroundColor:'rgba(16,185,129,0.15)', color:'#34D399', border:'1px solid rgba(16,185,129,0.3)' }}>
            ✅ Valider
          </button>
        </>)}
        {isValidated && (
          <button onClick={onUnlock} style={{ fontSize:11, padding:'6px 12px', borderRadius:8, cursor:'pointer',
            backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155' }}>
            ✏️ Modifier
          </button>
        )}
      </div>
    </div>
  )
}

// ── RulesEditor ────────────────────────────────────────────────────────────────
function RulesEditor({ rules, onUpdate, onClose }) {
  const [vals, setVals] = useState({
    min_turnaround_minutes: rules.min_turnaround_minutes,
    buffer_minutes:         rules.buffer_minutes,
    max_daily_cycles:       rules.max_daily_cycles,
    max_crew_duty_minutes:  rules.max_crew_duty_minutes,
  })
  const fields = [
    { key:'min_turnaround_minutes', label:'Rotation minimum', unit:'min', min:5,  max:60   },
    { key:'buffer_minutes',         label:'Buffer sécurité',  unit:'min', min:0,  max:30   },
    { key:'max_daily_cycles',       label:'Cycles max/avion', unit:'rot', min:1,  max:20   },
    { key:'max_crew_duty_minutes',  label:'Limite FTL',       unit:'min', min:480,max:1020 },
  ]
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center',
      backgroundColor:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)' }} onClick={onClose}>
      <div style={{ backgroundColor:'#0F1E35', border:'1px solid #1E3A5F', borderRadius:16,
        padding:24, width:360, maxWidth:'90vw' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ color:'#F1F5F9', fontWeight:700, fontSize:15, marginBottom:18 }}>⚙️ Règles de rotation</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {fields.map(f => (
            <div key={f.key}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <label style={{ fontSize:12, color:'#94A3B8' }}>{f.label}</label>
                <span style={{ fontSize:12, fontWeight:700, color:'#F0B429', fontFamily:'monospace' }}>{vals[f.key]} {f.unit}</span>
              </div>
              <input type="range" min={f.min} max={f.max} value={vals[f.key]}
                onChange={e => setVals(v => ({ ...v, [f.key]:Number(e.target.value) }))}
                style={{ width:'100%', accentColor:'#F0B429' }}/>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1, padding:'8px 0', borderRadius:8, fontSize:12, cursor:'pointer',
            backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155' }}>Annuler</button>
          <button onClick={() => { onUpdate(vals); onClose() }}
            style={{ flex:1, padding:'8px 0', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
              backgroundColor:'#F0B429', color:'#0B1F3A', border:'none' }}>Enregistrer</button>
        </div>
      </div>
    </div>
  )
}

// ── ConflictPanel ──────────────────────────────────────────────────────────────
function ConflictPanel({ conflicts, flights, onApplySuggestion, onClose }) {
  const critical = conflicts.filter(c => c.severity === 'critical')
  const warnings = conflicts.filter(c => c.severity === 'warning')
  return (
    <div style={{ backgroundColor:'#0A1628', border:'1px solid #1E3A5F', borderRadius:14,
      overflow:'hidden', maxHeight:400, display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'12px 16px', borderBottom:'1px solid #1E3A5F', backgroundColor:'rgba(7,23,41,0.8)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span>⚠️</span>
          <span style={{ fontSize:13, fontWeight:700, color:'#F1F5F9' }}>{conflicts.length} conflit{conflicts.length > 1 ? 's' : ''}</span>
          <div style={{ display:'flex', gap:6 }}>
            {critical.length > 0 && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99,
              backgroundColor:'rgba(239,68,68,0.15)', color:'#F87171', border:'1px solid rgba(239,68,68,0.25)' }}>
              {critical.length} critique{critical.length > 1 ? 's' : ''}</span>}
            {warnings.length > 0 && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99,
              backgroundColor:'rgba(245,158,11,0.12)', color:'#FCD34D', border:'1px solid rgba(245,158,11,0.2)' }}>
              {warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>}
          </div>
        </div>
        <button onClick={onClose} style={{ fontSize:14, color:'#475569', cursor:'pointer', background:'none', border:'none' }}>✕</button>
      </div>
      <div style={{ overflowY:'auto', padding:12, display:'flex', flexDirection:'column', gap:8 }}>
        {conflicts.map((c, idx) => {
          const flight = flights.find(f => f.id === c.flightId)
          const cc = CONFLICT_COLORS[c.severity]
          return (
            <div key={idx} style={{ borderRadius:10, padding:12, border:`1px solid ${cc.border}40`, backgroundColor:cc.bg }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                <span style={{ fontSize:12, flexShrink:0 }}>{c.severity === 'critical' ? '🔴' : '🟡'}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em',
                      color: c.severity === 'critical' ? '#F87171' : '#FCD34D' }}>{CONFLICT_LABELS[c.type]}</span>
                    {flight && <span style={{ fontSize:10, fontFamily:'monospace', color:'#F0B429',
                      backgroundColor:'rgba(240,180,41,0.1)', padding:'1px 5px', borderRadius:3 }}>{flight.flight_number}</span>}
                  </div>
                  <p style={{ fontSize:11, color:'#94A3B8', marginTop:4, lineHeight:1.5 }}>{c.message}</p>
                  {c.suggestions?.length > 0 && (
                    <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:8 }}>
                      {c.suggestions.map((s, si) => (
                        <button key={si} onClick={() => onApplySuggestion(s)}
                          style={{ fontSize:10, fontWeight:600, padding:'4px 9px', borderRadius:6, cursor:'pointer',
                            backgroundColor:'rgba(59,130,246,0.12)', color:'#93C5FD', border:'1px solid rgba(59,130,246,0.25)' }}>
                          ✦ {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── HeatmapView ────────────────────────────────────────────────────────────────
function HeatmapView({ flights, fleet }) {
  const cells = useMemo(() => computeHeatmap(flights, fleet, GANTT_START, GANTT_END), [flights, fleet])
  const hours = Array.from({ length: GANTT_END - GANTT_START }, (_, i) => GANTT_START + i)
  return (
    <div style={{ backgroundColor:'#071729', borderRadius:12, border:'1px solid #1E3A5F', overflow:'hidden' }}>
      <div style={{ display:'flex', borderBottom:'1px solid #1E3A5F' }}>
        <div style={{ width:96, minWidth:96, padding:'6px 12px', borderRight:'1px solid #1E3A5F' }}>
          <span style={{ color:'#2D5580', fontSize:9, fontWeight:700, letterSpacing:2 }}>CHARGE</span>
        </div>
        {hours.map(h => (
          <div key={h} style={{ flex:1, textAlign:'center', padding:'6px 0', fontSize:9, color:'#2D5580', fontFamily:'monospace' }}>
            {String(h).padStart(2,'0')}h
          </div>
        ))}
      </div>
      {fleet.map(ac => (
        <div key={ac.registration} style={{ display:'flex', borderBottom:'1px solid rgba(30,58,95,0.4)' }}>
          <div style={{ width:96, minWidth:96, padding:'0 12px', borderRight:'1px solid #1E3A5F',
            display:'flex', alignItems:'center', gap:5, height:36 }}>
            <StatusDot status={ac.status}/>
            <span style={{ color:'#CBD5E1', fontSize:11, fontWeight:700, fontFamily:'monospace' }}>
              {ac.registration.replace('F-','')}
            </span>
          </div>
          {hours.map(h => {
            const cell = cells.find(c => c.aircraft === ac.registration && c.hour === h)
            const load = cell?.load || 0
            const colorIdx = Math.min(4, Math.ceil(load * 4))
            return (
              <div key={h} style={{ flex:1, height:36, backgroundColor:HEATMAP_COLORS[colorIdx],
                display:'flex', alignItems:'center', justifyContent:'center',
                borderRight:'1px solid rgba(30,58,95,0.2)', transition:'background-color 0.3s' }}>
                {load > 0.3 && (
                  <span style={{ fontSize:8, fontWeight:700,
                    color: load > 0.7 ? '#F87171' : load > 0.4 ? '#FCD34D' : '#93C5FD' }}>
                    {Math.round(load * 100)}%
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}
      <div style={{ display:'flex', alignItems:'center', gap:16, padding:'8px 16px', borderTop:'1px solid #1E3A5F' }}>
        <span style={{ fontSize:9, color:'#2D5580', textTransform:'uppercase', letterSpacing:2 }}>Charge :</span>
        {[['0%','rgba(59,130,246,0.15)'],['25%','rgba(59,130,246,0.3)'],['50%','rgba(245,158,11,0.35)'],['75%+','rgba(239,68,68,0.45)']].map(([label,color]) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:14, height:10, borderRadius:2, backgroundColor:color, border:'1px solid rgba(255,255,255,0.1)' }}/>
            <span style={{ fontSize:9, color:'#5B8DB8' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Export ─────────────────────────────────────────────────────────────────────
const exportCSV = (flights) => {
  const rows = [
    ['N° Vol','Type','Origine','Destination','Départ','Arrivée','Durée (min)','Distance (nm)','Statut','Avion','Pilote','PAX','Max PAX'],
    ...flights.map(f => {
      const dep = toDate(f.departure_time)
      const arr = toDate(f.arrival_time)
      return [
        f.flight_number, f.flight_type === 'private' ? 'Privé' : 'Régulier',
        AIRPORTS_FULL[f.origin]?.short || f.origin,
        AIRPORTS_FULL[f.destination]?.short || f.destination,
        fmtTime(dep), fmtTime(arr),
        flightDuration(f.departure_time, f.arrival_time),
        getDistance(f.origin, f.destination) || '',
        f.status, f.aircraft, f.pilot || '', f.pax_count, f.max_pax,
      ]
    })
  ]
  const csv  = rows.map(r => r.join(';')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href:url, download:`SKYBH_Planning_${new Date().toISOString().slice(0,10)}.csv` })
  a.click(); URL.revokeObjectURL(url)
}

const copyShareLink = () => {
  const url = `${window.location.origin}/dashboard?tab=gantt&date=${new Date().toISOString().slice(0,10)}`
  navigator.clipboard.writeText(url).then(() => alert('Lien copié !')).catch(() => {})
}

// ── SingleDayGantt ─────────────────────────────────────────────────────────────
function SingleDayGantt({ day, flights, fleet, rules, conflictIndex, onFlightClick, onCreateFlight, dragging, dragX, dragRef, setDragging, setDragX, ganttRef }) {
  const totalMins = (GANTT_END - GANTT_START) * 60
  const hours     = Array.from({ length: GANTT_END - GANTT_START + 1 }, (_, i) => GANTT_START + i)
  const [nowLeft, setNowLeft] = useState(0)

  const getLeft  = d => Math.max(0, Math.min(100, ((d.getHours()-GANTT_START)*60+d.getMinutes()) / totalMins * 100))
  const getWidth = (dep,arr) => Math.max(1, (arr-dep)/60000 / totalMins * 100)

  // Tooltip
  const [tooltip, setTooltip] = useState({ flight:null, conflicts:null, x:0, y:0 })

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      if (isSameDay(now, day)) setNowLeft(getLeft(now))
    }
    tick(); const t = setInterval(tick, 10000); return () => clearInterval(t)
  }, [day])

  const dayFlights = flights.filter(f => {
    const d = toDate(f.departure_time)
    return isSameDay(d, day)
  })

  return (
    <div ref={ganttRef} className="rounded-xl border overflow-hidden select-none"
      style={{ backgroundColor:'#071729', borderColor:'#1E3A5F' }}>

      {/* Header heures */}
      <div style={{ display:'flex', borderBottom:'1px solid #1E3A5F' }}>
        <div style={{ width:96, minWidth:96, padding:'6px 12px', borderRight:'1px solid #1E3A5F',
          display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ color:'#2D5580', fontSize:9, fontWeight:700, letterSpacing:2 }}>AVION</span>
        </div>
        <div style={{ flex:1, position:'relative', height:28 }}>
          {hours.map(h => (
            <div key={h} style={{ position:'absolute', left:`${((h-GANTT_START)/(GANTT_END-GANTT_START))*100}%`,
              top:'50%', transform:'translate(-50%,-50%)', color:'#2D5580', fontSize:10, fontFamily:'monospace' }}>
              {String(h).padStart(2,'0')}h
            </div>
          ))}
        </div>
      </div>

      {/* Lignes avions */}
      {fleet.map((ac, idx) => {
        const acFlights = dayFlights.filter(f => f.aircraft === ac.registration)
        return (
          <div key={ac.id || ac.registration} style={{ display:'flex', borderBottom:'1px solid #1E3A5F',
            backgroundColor: idx%2===0 ? 'transparent' : 'rgba(17,45,82,0.12)' }}>
            <div style={{ width:96, minWidth:96, padding:'0 12px', borderRight:'1px solid #1E3A5F',
              display:'flex', alignItems:'center', gap:6, height:56 }}>
              <StatusDot status={ac.status}/>
              <div>
                <div style={{ color:'#CBD5E1', fontSize:11, fontWeight:700, fontFamily:'monospace' }}>
                  {ac.registration.replace('F-','')}
                </div>
                <div style={{ color:'#2D5580', fontSize:8, marginTop:1 }}>{acFlights.length} rot.</div>
              </div>
            </div>

            <div style={{ flex:1, position:'relative', height:56,
              cursor: rules.locked ? 'default' : 'crosshair' }}
              onClick={e => {
                if (dragging || rules.locked) return
                const rect = ganttRef.current?.getBoundingClientRect()
                if (!rect) return
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left - 96) / (rect.width - 96)))
                const { h, m } = pctToTime(pct)
                const d = new Date(day); d.setHours(h,m,0,0)
                onCreateFlight({ aircraft:ac.registration, hour:h, minute:m, date:d })
              }}>

              {/* Grille */}
              {hours.map(h => (
                <div key={h} style={{ position:'absolute', top:0, bottom:0, width:1,
                  left:`${((h-GANTT_START)/(GANTT_END-GANTT_START))*100}%`, backgroundColor:'#1E3A5F' }}/>
              ))}

              {/* Ligne NOW */}
              {nowLeft > 0 && nowLeft < 100 && (
                <div style={{ position:'absolute', top:0, bottom:0, width:2, left:`${nowLeft}%`,
                  background:'linear-gradient(180deg,transparent,#F0B429,transparent)', zIndex:10 }}/>
              )}

              {/* Blocs vols */}
              {acFlights.map(f => {
                const dep   = toDate(f.departure_time)
                const arr   = toDate(f.arrival_time)
                const left  = getLeft(dep)
                const width = getWidth(dep, arr)
                const sc    = STATUS_COLORS[f.status] || STATUS_COLORS.scheduled
                const fConflicts = conflictIndex[f.id]
                const worstC = fConflicts?.find(c => c.severity === 'critical') || fConflicts?.[0]
                const cc     = worstC ? CONFLICT_COLORS[worstC.severity] : null
                const isDrag = dragging === f.id
                const dragOff= isDrag ? dragX - (dragRef.current?.startX || 0) : 0
                const isPriv = f.flight_type === 'private'
                const dur    = flightDuration(f.departure_time, f.arrival_time)
                const dist   = getDistance(f.origin, f.destination)

                return (
                  <div key={f.id}
                    onMouseDown={e => {
                      if (rules.locked) return
                      e.stopPropagation()
                      const rect = ganttRef.current?.getBoundingClientRect()
                      if (!rect) return
                      dragRef.current = { flight:f, startX:e.clientX, ganttLeft:rect.left, ganttWidth:rect.width }
                      setDragging(f.id); setDragX(e.clientX)
                    }}
                    onMouseEnter={e => setTooltip({ flight:f, conflicts:fConflicts, x:e.clientX, y:e.clientY })}
                    onMouseMove={e => setTooltip(t => ({ ...t, x:e.clientX, y:e.clientY }))}
                    onMouseLeave={() => setTooltip({ flight:null, conflicts:null, x:0, y:0 })}
                    onClick={e => { e.stopPropagation(); if (!isDrag) onFlightClick(f) }}
                    style={{
                      position:'absolute', top:8, bottom:8,
                      left: isDrag ? `calc(${left}% + ${dragOff}px)` : `${left}%`,
                      width:`${width}%`, minWidth:24,
                      backgroundColor: cc ? cc.bg : sc.bg,
                      border:`1.5px ${isPriv ? 'dashed' : 'solid'} ${cc ? cc.border : isPriv ? '#C084FC' : sc.border}`,
                      borderRadius:5, overflow:'hidden',
                      display:'flex', alignItems:'center', padding:'0 6px', gap:3,
                      cursor: rules.locked ? 'pointer' : isDrag ? 'grabbing' : 'grab',
                      zIndex: isDrag ? 20 : 5,
                      boxShadow: cc ? `0 0 10px ${cc.glow}` : isPriv ? '0 0 8px rgba(192,132,252,0.2)' : 'none',
                      transition: isDrag ? 'none' : 'box-shadow 0.15s',
                    }}>
                    {isPriv && (
                      <span style={{ color:'#C084FC', fontSize:7, fontWeight:900, flexShrink:0 }}>✦</span>
                    )}
                    <span style={{ fontSize:9, fontWeight:800, whiteSpace:'nowrap', letterSpacing:0.3, overflow:'hidden',
                      color: cc ? (worstC.severity === 'critical' ? '#F87171' : '#FCD34D') : isPriv ? '#E9D5FF' : sc.text }}>
                      {f.flight_number}
                    </span>
                    {width > 6 && (
                      <span style={{ fontSize:8, color:'#475569', whiteSpace:'nowrap', overflow:'hidden', flexShrink:0 }}>
                        {dur}′{dist ? ` ${dist}nm` : ''}
                      </span>
                    )}
                    <ConflictBadge conflicts={fConflicts}/>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Footer */}
      <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between',
        gap:10, padding:'8px 16px', borderTop:'1px solid #1E3A5F', backgroundColor:'rgba(7,23,41,0.6)' }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
          {Object.entries({ landed:'Atterri', in_flight:'En vol', scheduled:'Programmé', cancelled:'Annulé' }).map(([k,v]) => {
            const sc = STATUS_COLORS[k]
            return (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:5 }}>
                <div style={{ width:10, height:10, borderRadius:2, backgroundColor:sc.bg, border:`1px solid ${sc.border}` }}/>
                <span style={{ color:'#5B8DB8', fontSize:10 }}>{v}</span>
              </div>
            )
          })}
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:10, height:10, borderRadius:2, backgroundColor:'rgba(17,45,82,0.9)',
              border:'1.5px dashed #C084FC' }}/>
            <span style={{ color:'#5B8DB8', fontSize:10 }}>✦ Vol privé</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:10, height:10, borderRadius:2, backgroundColor:CONFLICT_COLORS.critical.bg,
              border:`1px solid ${CONFLICT_COLORS.critical.border}` }}/>
            <span style={{ color:'#5B8DB8', fontSize:10 }}>Conflit</span>
          </div>
        </div>
        <span style={{ color:'#1E3A5F', fontSize:10 }}>
          {rules.locked ? '🔒 Planning verrouillé' : '✦ Clic → créer · Glisser → déplacer'}
        </span>
      </div>

      {/* Tooltip */}
      {tooltip.flight && (
        <FlightTooltip flight={tooltip.flight} conflicts={tooltip.conflicts} x={tooltip.x} y={tooltip.y}/>
      )}
    </div>
  )
}

// ── WeekGantt ──────────────────────────────────────────────────────────────────
function WeekGantt({ weekDays, flights, fleet, rules, conflictIndex, onFlightClick }) {
  const COL_W = 72

  return (
    <div style={{ backgroundColor:'#071729', borderRadius:12, border:'1px solid #1E3A5F', overflow:'hidden' }}>
      {/* Header jours */}
      <div style={{ display:'flex', borderBottom:'1px solid #1E3A5F' }}>
        <div style={{ width:96, minWidth:96, padding:'6px 12px', borderRight:'1px solid #1E3A5F',
          flexShrink:0 }}>
          <span style={{ color:'#2D5580', fontSize:9, fontWeight:700, letterSpacing:2 }}>AVION</span>
        </div>
        {weekDays.map((d, i) => {
          const today = new Date(); today.setHours(0,0,0,0)
          const isToday = isSameDay(d, today)
          return (
            <div key={i} style={{ flex:1, textAlign:'center', padding:'6px 4px',
              borderRight: i < 6 ? '1px solid #1E3A5F' : 'none',
              backgroundColor: isToday ? 'rgba(240,180,41,0.06)' : 'transparent' }}>
              <div style={{ fontSize:9, color:'#5B8DB8', fontWeight:600 }}>
                {['LUN','MAR','MER','JEU','VEN','SAM','DIM'][i]}
              </div>
              <div style={{ fontSize:13, fontWeight:800,
                color: isToday ? '#F0B429' : '#94A3B8', fontFamily:'monospace' }}>
                {d.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Lignes avions */}
      {fleet.map((ac, idx) => (
        <div key={ac.registration} style={{ display:'flex', borderBottom:'1px solid rgba(30,58,95,0.5)',
          backgroundColor: idx%2===0 ? 'transparent' : 'rgba(17,45,82,0.1)' }}>
          <div style={{ width:96, minWidth:96, padding:'0 12px', borderRight:'1px solid #1E3A5F',
            display:'flex', alignItems:'center', gap:6, height:52, flexShrink:0 }}>
            <StatusDot status={ac.status}/>
            <div>
              <div style={{ color:'#CBD5E1', fontSize:11, fontWeight:700, fontFamily:'monospace' }}>
                {ac.registration.replace('F-','')}
              </div>
            </div>
          </div>

          {weekDays.map((d, di) => {
            const today = new Date(); today.setHours(0,0,0,0)
            const isToday = isSameDay(d, today)
            const dayFlights = flights.filter(f =>
              f.aircraft === ac.registration && isSameDay(toDate(f.departure_time), d)
            )
            const dayConflicts = dayFlights.filter(f => conflictIndex[f.id]?.length > 0)
            const hasCritical  = dayFlights.some(f => conflictIndex[f.id]?.some(c => c.severity === 'critical'))
            const hasWarning   = dayFlights.some(f => conflictIndex[f.id]?.some(c => c.severity === 'warning'))
            const hasPrivate   = dayFlights.some(f => f.flight_type === 'private')
            const totalPax     = dayFlights.reduce((s, f) => s + (f.pax_count || 0), 0)
            const totalSeats   = dayFlights.reduce((s, f) => s + (f.max_pax || 9), 0)
            const fillRate     = totalSeats > 0 ? Math.round(totalPax / totalSeats * 100) : 0

            return (
              <div key={di} style={{ flex:1, height:52, borderRight: di < 6 ? '1px solid rgba(30,58,95,0.3)' : 'none',
                padding:'4px 6px', display:'flex', flexDirection:'column', gap:2,
                backgroundColor: isToday ? 'rgba(240,180,41,0.04)' : 'transparent',
                cursor: dayFlights.length > 0 ? 'pointer' : 'default' }}
                onClick={() => dayFlights.length > 0 && onFlightClick(dayFlights[0])}>

                {dayFlights.length === 0 ? (
                  <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ color:'#1E3A5F', fontSize:9 }}>—</span>
                  </div>
                ) : (
                  <>
                    {/* Indicateurs vols */}
                    <div style={{ display:'flex', gap:2, flexWrap:'wrap' }}>
                      {dayFlights.slice(0,4).map(f => {
                        const sc = STATUS_COLORS[f.status] || STATUS_COLORS.scheduled
                        const fC = conflictIndex[f.id]
                        const isPriv = f.flight_type === 'private'
                        return (
                          <div key={f.id} title={`${f.flight_number} · ${AIRPORTS_FULL[f.origin]?.short}→${AIRPORTS_FULL[f.destination]?.short}`}
                            style={{ width:6, height:6, borderRadius:1,
                              backgroundColor: fC?.length ? (fC.some(c=>c.severity==='critical') ? '#EF4444' : '#F59E0B') : sc.border,
                              border: isPriv ? '1px dashed #C084FC' : 'none',
                              opacity:0.9 }}/>
                        )
                      })}
                      {dayFlights.length > 4 && (
                        <span style={{ fontSize:7, color:'#5B8DB8' }}>+{dayFlights.length-4}</span>
                      )}
                    </div>

                    {/* Stats */}
                    <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap' }}>
                      <span style={{ fontSize:9, fontWeight:700, color:'#94A3B8' }}>{dayFlights.length} rot.</span>
                      {hasPrivate && <span style={{ fontSize:8, color:'#C084FC' }}>✦</span>}
                      {(hasCritical || hasWarning) && (
                        <span style={{ fontSize:8 }}>{hasCritical ? '🔴' : '🟡'}</span>
                      )}
                    </div>

                    {/* Taux de remplissage */}
                    <div style={{ height:3, borderRadius:2, backgroundColor:'#1E3A5F', overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${fillRate}%`, borderRadius:2,
                        backgroundColor: fillRate > 85 ? '#4ADE80' : fillRate > 60 ? '#F0B429' : '#3B82F6',
                        transition:'width 0.3s' }}/>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {/* Footer */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 16px',
        borderTop:'1px solid #1E3A5F', backgroundColor:'rgba(7,23,41,0.6)' }}>
        <span style={{ fontSize:9, color:'#2D5580', textTransform:'uppercase', letterSpacing:2 }}>Légende :</span>
        {[
          { color:'#3B82F6', label:'Programmé' }, { color:'#4ADE80', label:'Atterri' },
          { color:'#F0B429', label:'En vol' },    { color:'#F87171', label:'Annulé' },
          { color:'#EF4444', label:'Conflit critique' },
        ].map(item => (
          <div key={item.label} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:8, height:8, borderRadius:1, backgroundColor:item.color }}/>
            <span style={{ fontSize:9, color:'#5B8DB8' }}>{item.label}</span>
          </div>
        ))}
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ fontSize:9, color:'#C084FC' }}>✦</span>
          <span style={{ fontSize:9, color:'#5B8DB8' }}>Vol privé</span>
        </div>
      </div>
    </div>
  )
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function GanttEnhanced({ flights, fleet, user, onFlightClick, onCreateFlight }) {
  const today = new Date(); today.setHours(0,0,0,0)

  // Navigation
  const [viewMode,    setViewMode]    = useState('day')
  const [ganttView,   setGanttView]   = useState('gantt') // 'gantt' | 'heatmap'
  const [selectedDay, setSelectedDay] = useState(today)
  const [weekMonday,  setWeekMonday]  = useState(getMonday(today))
  const weekDays = getWeekDays(weekMonday)

  // UI
  const [showConflicts, setShowConflicts] = useState(false)
  const [showRules,     setShowRules]     = useState(false)
  const [filters, setFilters] = useState({ aircraft:'', pilot:'', route:'', status:'', type:'' })

  // Drag
  const ganttRef = useRef(null)
  const dragRef  = useRef(null)
  const [dragging, setDragging] = useState(null)
  const [dragX,    setDragX]    = useState(0)

  const { rules, onUpdate:updateRules, onLock, onUnlock, onValidate } = usePlanningRules(user)

  // Conflits sur toute la semaine
  const weekFlights   = flights.filter(f => {
    const d = toDate(f.departure_time)
    return d >= weekMonday && d < new Date(weekMonday.getTime() + 7*86400000)
  })
  const conflicts     = useMemo(() => analyzeAllConflicts(weekFlights, fleet, rules), [weekFlights, fleet, rules])
  const conflictIndex = useMemo(() => buildConflictIndex(conflicts), [conflicts])
  const criticalCount = conflicts.filter(c => c.severity === 'critical').length

  // Vols du jour filtrés
  const pilotOptions  = useMemo(() => [...new Set(flights.map(f => f.pilot).filter(Boolean))], [flights])
  const routeOptions  = useMemo(() => [...new Set(flights.map(f => `${f.origin}→${f.destination}`))], [flights])

  const filteredFlights = useMemo(() => {
    return flights.filter(f => {
      if (filters.aircraft && f.aircraft !== filters.aircraft) return false
      if (filters.pilot    && f.pilot    !== filters.pilot)    return false
      if (filters.route    && `${f.origin}→${f.destination}` !== filters.route) return false
      if (filters.status   && f.status   !== filters.status)   return false
      if (filters.type     && f.flight_type !== filters.type)  return false
      return true
    })
  }, [flights, filters])

  const activeFilters = Object.values(filters).filter(Boolean).length

  // Drag global
  const handleMouseMove = useCallback(e => { if (dragRef.current) setDragX(e.clientX) }, [])
  const handleMouseUp   = useCallback(async e => {
    if (!dragRef.current) return
    const { flight, ganttLeft, ganttWidth } = dragRef.current
    const pct = Math.max(0, Math.min(1, (e.clientX - ganttLeft - 96) / (ganttWidth - 96)))
    const dep = toDate(flight.departure_time)
    const arr = toDate(flight.arrival_time)
    const dur = arr - dep
    const { h, m } = pctToTime(pct)
    const newDep = new Date(dep); newDep.setHours(h,m,0,0)
    const newArr = new Date(newDep.getTime() + dur)
    if (flight.id) {
      try { await updateFlight(flight.id, { departure_time:Timestamp.fromDate(newDep), arrival_time:Timestamp.fromDate(newArr) }) }
      catch(err) { console.error(err) }
    }
    dragRef.current = null; setDragging(null)
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup',   handleMouseUp)
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp) }
  }, [handleMouseMove, handleMouseUp])

  const handleApplySuggestion = async (suggestion) => {
    if (suggestion.action === 'delay_flight') {
      const { flightId, delayMinutes } = suggestion.payload
      const f = flights.find(f => f.id === flightId)
      if (!f) return
      const dep = toDate(f.departure_time); dep.setMinutes(dep.getMinutes() + delayMinutes)
      const arr = toDate(f.arrival_time);   arr.setMinutes(arr.getMinutes() + delayMinutes)
      try { await updateFlight(flightId, { departure_time:Timestamp.fromDate(dep), arrival_time:Timestamp.fromDate(arr) }) }
      catch(e) { console.error(e) }
    }
    if (suggestion.action === 'swap_aircraft') {
      const { flightId, newAircraftRegistration } = suggestion.payload
      try { await updateFlight(flightId, { aircraft:newAircraftRegistration }) }
      catch(e) { console.error(e) }
    }
    setShowConflicts(false)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

      {/* ── Barre principale ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>

        {/* Navigation semaine + vue */}
        <WeekNavigator
          viewMode={viewMode} setViewMode={setViewMode}
          selectedDay={selectedDay} setSelectedDay={d => { setSelectedDay(d); setViewMode('day') }}
          weekMonday={weekMonday} setWeekMonday={setWeekMonday}
        />

        {/* Actions droite */}
        <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>

          {/* Toggle gantt/heatmap */}
          <div style={{ display:'flex', backgroundColor:'rgba(7,23,41,0.8)', borderRadius:8, padding:3, border:'1px solid #1E3A5F' }}>
            {[{ id:'gantt', label:'▦ Gantt' }, { id:'heatmap', label:'◫ Charge' }].map(v => (
              <button key={v.id} onClick={() => setGanttView(v.id)}
                style={{ fontSize:11, fontWeight:600, padding:'5px 11px', borderRadius:6, cursor:'pointer', border:'none',
                  backgroundColor: ganttView === v.id ? '#1E3A5F' : 'transparent',
                  color: ganttView === v.id ? '#F0B429' : '#5B8DB8' }}>
                {v.label}
              </button>
            ))}
          </div>

          {/* Filtres */}
          {['aircraft','pilot','route','status','type'].map(key => {
            const opts = key === 'aircraft' ? fleet.map(a => ({ v:a.registration, l:a.registration }))
              : key === 'pilot'   ? pilotOptions.map(p  => ({ v:p, l:p }))
              : key === 'route'   ? routeOptions.map(r  => ({ v:r, l:r }))
              : key === 'status'  ? ['landed','in_flight','scheduled','boarding','cancelled'].map(s => ({ v:s, l:s }))
              : [{ v:'regular', l:'Régulier' }, { v:'private', l:'✦ Privé' }]
            const placeholder = { aircraft:'✈ Avion', pilot:'👨‍✈️ Pilote', route:'🛫 Route', status:'≡ Statut', type:'◈ Type' }[key]
            return (
              <select key={key} value={filters[key]} onChange={e => setFilters(f => ({ ...f, [key]:e.target.value }))}
                style={{ fontSize:11, padding:'5px 8px', borderRadius:8, border:'1px solid #1E3A5F', cursor:'pointer',
                  backgroundColor:'#0A1628', color: filters[key] ? '#F0B429' : '#5B8DB8', maxWidth:110 }}>
                <option value="">{placeholder}</option>
                {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            )
          })}

          {activeFilters > 0 && (
            <button onClick={() => setFilters({ aircraft:'', pilot:'', route:'', status:'', type:'' })}
              style={{ fontSize:10, padding:'5px 10px', borderRadius:8, cursor:'pointer', border:'none',
                backgroundColor:'rgba(239,68,68,0.12)', color:'#F87171' }}>
              ✕ {activeFilters}
            </button>
          )}

          {/* Conflits */}
          {conflicts.length > 0 && (
            <button onClick={() => setShowConflicts(v => !v)}
              style={{ fontSize:11, fontWeight:700, padding:'6px 11px', borderRadius:8, cursor:'pointer',
                backgroundColor: showConflicts ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.1)',
                color:'#F87171', border:'1px solid rgba(239,68,68,0.3)' }}>
              ⚠️ {conflicts.length}
            </button>
          )}

          <button onClick={() => setShowRules(true)}
            style={{ fontSize:11, padding:'6px 11px', borderRadius:8, cursor:'pointer',
              backgroundColor:'rgba(17,45,82,0.6)', color:'#5B8DB8', border:'1px solid #1E3A5F' }}>
            ⚙️
          </button>

          <button onClick={() => exportCSV(filteredFlights)}
            style={{ fontSize:11, padding:'6px 11px', borderRadius:8, cursor:'pointer',
              backgroundColor:'rgba(16,185,129,0.1)', color:'#34D399', border:'1px solid rgba(16,185,129,0.25)' }}>
            ⬇ CSV
          </button>

          <button onClick={copyShareLink}
            style={{ fontSize:11, padding:'6px 11px', borderRadius:8, cursor:'pointer',
              backgroundColor:'rgba(99,102,241,0.1)', color:'#A5B4FC', border:'1px solid rgba(99,102,241,0.25)' }}>
            🔗
          </button>

          {!rules.locked && (
            <button onClick={() => onCreateFlight({})}
              style={{ fontSize:11, fontWeight:700, padding:'6px 14px', borderRadius:8, cursor:'pointer',
                backgroundColor:'#F0B429', color:'#0B1F3A', border:'none' }}>
              + Vol
            </button>
          )}
        </div>
      </div>

      {/* ── Lock bar ── */}
      <PlanningLockBar rules={rules} onLock={onLock} onUnlock={onUnlock} onValidate={onValidate} conflictCount={criticalCount}/>

      {/* ── Panel conflits ── */}
      {showConflicts && conflicts.length > 0 && (
        <ConflictPanel conflicts={conflicts} flights={filteredFlights}
          onApplySuggestion={handleApplySuggestion} onClose={() => setShowConflicts(false)}/>
      )}

      {/* ── Heatmap ── */}
      {ganttView === 'heatmap' && (
        <HeatmapView flights={filteredFlights} fleet={fleet}/>
      )}

      {/* ── Gantt vue jour ── */}
      {ganttView === 'gantt' && viewMode === 'day' && (
        <>
          <div style={{ fontSize:12, color:'#5B8DB8', fontWeight:600 }}>
            📅 {fmtDayFull(selectedDay)}
            <span style={{ marginLeft:10, fontSize:10, color:'#2D5580' }}>
              {filteredFlights.filter(f => isSameDay(toDate(f.departure_time), selectedDay)).length} vols
            </span>
          </div>
          <SingleDayGantt
            day={selectedDay} flights={filteredFlights} fleet={fleet}
            rules={rules} conflictIndex={conflictIndex}
            onFlightClick={onFlightClick} onCreateFlight={onCreateFlight}
            dragging={dragging} dragX={dragX} dragRef={dragRef}
            setDragging={setDragging} setDragX={setDragX} ganttRef={ganttRef}
          />
        </>
      )}

      {/* ── Gantt vue semaine ── */}
      {ganttView === 'gantt' && viewMode === 'week' && (
        <WeekGantt
          weekDays={weekDays} flights={filteredFlights} fleet={fleet}
          rules={rules} conflictIndex={conflictIndex} onFlightClick={onFlightClick}
        />
      )}

      {/* ── Modal règles ── */}
      {showRules && <RulesEditor rules={rules} onUpdate={updateRules} onClose={() => setShowRules(false)}/>}
    </div>
  )
}