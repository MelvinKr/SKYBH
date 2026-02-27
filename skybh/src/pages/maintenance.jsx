/**
 * @fileoverview Page Maintenance Prédictive — SKYBH
 * 5 onglets : Projection · Calendrier · Fenêtres · Historique · Stock
 */

import { useState, useMemo } from 'react'
import { useMaintenance } from '../hooks/use-maintenance'
import { formatThresholdDate, LIMITS } from '../utils/maintenance-predictor'
import { AIRPORTS_FULL } from '../services/flights'

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtDate  = d => d?.toLocaleDateString?.('fr-FR', { day:'numeric', month:'short', year:'numeric' }) || '—'
const fmtShort = d => d?.toLocaleDateString?.('fr-FR', { day:'numeric', month:'short' }) || '—'
const fmtTime  = d => d?.toLocaleTimeString?.('fr-FR', { hour:'2-digit', minute:'2-digit' }) || '—'
const toDate   = ts => ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null)

const CATEGORY_LABELS = { engine:'Moteur', airframe:'Cellule', avionics:'Avionique', cabin:'Cabine', other:'Autre' }
const CATEGORY_ICONS  = { engine:'⚙️', airframe:'✈️', avionics:'📡', cabin:'💺', other:'🔧' }
const STATUS_LABELS   = { planned:'Planifié', in_progress:'En cours', done:'Terminé', cancelled:'Annulé' }
const STATUS_COLORS   = {
  planned:     { bg:'rgba(59,130,246,0.12)',  border:'rgba(59,130,246,0.3)',  text:'#93C5FD' },
  in_progress: { bg:'rgba(245,158,11,0.12)',  border:'rgba(245,158,11,0.3)',  text:'#FCD34D' },
  done:        { bg:'rgba(16,185,129,0.1)',   border:'rgba(16,185,129,0.25)', text:'#34D399' },
  cancelled:   { bg:'rgba(239,68,68,0.1)',    border:'rgba(239,68,68,0.25)',  text:'#F87171' },
}
const PRIORITY_COLORS = {
  low:    { bg:'rgba(16,185,129,0.1)',  border:'rgba(16,185,129,0.25)', text:'#34D399', label:'Faible'  },
  medium: { bg:'rgba(245,158,11,0.12)', border:'rgba(245,158,11,0.3)',  text:'#FCD34D', label:'Moyen'   },
  high:   { bg:'rgba(239,68,68,0.1)',   border:'rgba(239,68,68,0.25)',  text:'#F87171', label:'Élevé'   },
  urgent: { bg:'rgba(239,68,68,0.2)',   border:'#EF4444',               text:'#FCA5A5', label:'Urgent'  },
}

// ── Composants partagés ────────────────────────────────────────────────────────

function SectionTitle({ icon, title, sub }) {
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:16 }}>{icon}</span>
        <h2 style={{ color:'#F1F5F9', fontWeight:800, fontSize:16, margin:0 }}>{title}</h2>
      </div>
      {sub && <p style={{ color:'#475569', fontSize:12, marginTop:4, marginLeft:24 }}>{sub}</p>}
    </div>
  )
}

function Badge({ label, color }) {
  const c = typeof color === 'string' ? { bg:'transparent', border:color, text:color } : color
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99,
      backgroundColor:c.bg, border:`1px solid ${c.border}`, color:c.text, whiteSpace:'nowrap' }}>
      {label}
    </span>
  )
}

function Card({ children, style = {} }) {
  return (
    <div style={{ backgroundColor:'#0A1628', border:'1px solid #1E3A5F', borderRadius:14,
      overflow:'hidden', ...style }}>
      {children}
    </div>
  )
}

// ── HealthGauge ────────────────────────────────────────────────────────────────
function HealthGauge({ score, size = 64 }) {
  const color = score >= 80 ? '#4ADE80' : score >= 55 ? '#F0B429' : '#EF4444'
  const r = (size/2) - 6
  const circ = 2 * Math.PI * r
  const fill = (score / 100) * circ

  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1E3A5F" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        style={{ transition:'stroke-dasharray 0.8s ease, stroke 0.4s' }}/>
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ fill:color, fontSize:size*0.22, fontWeight:800, fontFamily:'monospace',
          transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px` }}>
        {score}
      </text>
    </svg>
  )
}

// ── MiniChart (SVG sparkline) ──────────────────────────────────────────────────
function SparkLine({ data, width = 200, height = 48, warningVal, criticalVal, maxVal }) {
  if (!data?.length) return null
  const max = maxVal || Math.max(...data.map(d => d.engineLeft), warningVal || 0)
  const min = 0
  const range = max - min || 1
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((d.engineLeft - min) / range) * height
    return `${x},${y}`
  })
  const warnY = warningVal  ? height - ((warningVal  - min) / range) * height : null
  const critY = criticalVal ? height - ((criticalVal - min) / range) * height : null

  return (
    <svg width={width} height={height} style={{ overflow:'visible' }}>
      {/* Zone sous la courbe */}
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts.join(' ')} ${width},${height}`}
        fill="url(#sparkGrad)"/>
      <polyline points={pts.join(' ')} fill="none" stroke="#3B82F6" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round"/>
      {/* Lignes seuil */}
      {warnY !== null && (
        <line x1={0} y1={warnY} x2={width} y2={warnY}
          stroke="#F59E0B" strokeWidth={1} strokeDasharray="4,3" opacity={0.7}/>
      )}
      {critY !== null && (
        <line x1={0} y1={critY} x2={width} y2={critY}
          stroke="#EF4444" strokeWidth={1} strokeDasharray="4,3" opacity={0.7}/>
      )}
    </svg>
  )
}

// ── ProgressBar ────────────────────────────────────────────────────────────────
function PotentialBar({ label, current, limit, unit = 'h', showPercent = true }) {
  const pct     = Math.min(100, Math.round((current / limit) * 100))
  const remain  = limit - current
  const color   = remain <= LIMITS.engine.critical ? '#EF4444'
    : remain <= LIMITS.engine.warning ? '#F59E0B'
    : pct > 85 ? '#F0B429' : '#3B82F6'

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
        <span style={{ fontSize:11, color:'#94A3B8' }}>{label}</span>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <span style={{ fontFamily:'monospace', fontSize:11, color:'#CBD5E1', fontWeight:700 }}>
            {current.toLocaleString()} / {limit.toLocaleString()} {unit}
          </span>
          {showPercent && (
            <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:3,
              backgroundColor:`${color}18`, color, border:`1px solid ${color}40` }}>
              {pct}%
            </span>
          )}
        </div>
      </div>
      <div style={{ height:8, backgroundColor:'#1E3A5F', borderRadius:4, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, borderRadius:4,
          background:`linear-gradient(90deg, ${color}90, ${color})`,
          boxShadow: pct > 90 ? `0 0 8px ${color}60` : 'none',
          transition:'width 0.6s ease' }}/>
      </div>
      <div style={{ fontSize:10, color, marginTop:4 }}>
        {remain.toLocaleString()} {unit} restantes
      </div>
    </div>
  )
}

// ── Tab: Projection ────────────────────────────────────────────────────────────
function ProjectionTab({ fleet, projectionsByAircraft, consumptionByAircraft, healthScores }) {
  const [selectedAc, setSelectedAc] = useState(fleet[0]?.registration || '')
  const ac   = fleet.find(a => a.registration === selectedAc)
  const proj = projectionsByAircraft[selectedAc]
  const cons = consumptionByAircraft[selectedAc]
  const health = healthScores[selectedAc] ?? 95

  if (!ac || !proj) return (
    <div style={{ textAlign:'center', padding:40, color:'#2D5580' }}>Sélectionnez un avion</div>
  )

  const engineThresh   = formatThresholdDate(proj.engineThresholdDate)
  const engineWarn     = formatThresholdDate(proj.engineWarningDate)
  const airframeThresh = formatThresholdDate(proj.airframeCritDate)
  const airframeWarn   = formatThresholdDate(proj.airframeWarningDate)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Sélecteur avion */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {fleet.map(a => {
          const h = healthScores[a.registration] ?? 95
          const hColor = h >= 80 ? '#4ADE80' : h >= 55 ? '#F0B429' : '#EF4444'
          return (
            <button key={a.registration} onClick={() => setSelectedAc(a.registration)}
              style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:10, cursor:'pointer',
                border:`1.5px solid ${selectedAc === a.registration ? hColor : '#1E3A5F'}`,
                backgroundColor: selectedAc === a.registration ? `${hColor}12` : 'rgba(7,23,41,0.6)',
                transition:'all 0.15s' }}>
              <HealthGauge score={h} size={36}/>
              <div style={{ textAlign:'left' }}>
                <div style={{ fontFamily:'monospace', fontWeight:800, fontSize:12,
                  color: selectedAc === a.registration ? '#F1F5F9' : '#94A3B8' }}>
                  {a.registration}
                </div>
                <div style={{ fontSize:9, color:'#475569' }}>{a.type || a.model || 'Avion'}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Cartes KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px,1fr))', gap:12 }}>
        {[
          {
            label:'Score de santé', value: health, unit:'/100',
            color: health >= 80 ? '#4ADE80' : health >= 55 ? '#F0B429' : '#EF4444',
            sub: health >= 80 ? 'Nominal' : health >= 55 ? 'Surveillance' : 'Critique',
          },
          {
            label:'Consommation moy.', value: cons?.avgHoursPerDay?.toFixed(2) || '—', unit:'h/j',
            color:'#5B8DB8',
            sub: `${cons?.flightCount || 0} vols / 30 jours`,
          },
          {
            label:'Potentiel moteur',  value: proj.engineRemaining?.toFixed(0) || '—', unit:'h',
            color: engineThresh?.color || '#4ADE80',
            sub: engineWarn ? `⚠️ Warning : ${engineWarn.label}` : 'Nominal',
          },
          {
            label:'Potentiel cellule', value: proj.airframeRemaining?.toFixed(0) || '—', unit:'h',
            color: airframeThresh?.color || '#4ADE80',
            sub: airframeWarn ? `⚠️ Warning : ${airframeWarn.label}` : 'Nominal',
          },
        ].map(kpi => (
          <Card key={kpi.label} style={{ padding:16 }}>
            <div style={{ fontSize:10, color:'#475569', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>
              {kpi.label}
            </div>
            <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:4 }}>
              <span style={{ fontFamily:'monospace', fontSize:28, fontWeight:900, color:kpi.color, lineHeight:1 }}>
                {kpi.value}
              </span>
              <span style={{ fontSize:12, color:'#5B8DB8' }}>{kpi.unit}</span>
            </div>
            <div style={{ fontSize:11, color:'#64748B' }}>{kpi.sub}</div>
          </Card>
        ))}
      </div>

      {/* Barres de potentiel */}
      <Card style={{ padding:20 }}>
        <h3 style={{ color:'#94A3B8', fontSize:12, fontWeight:700, textTransform:'uppercase',
          letterSpacing:'0.08em', marginBottom:16 }}>Potentiels actuels</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <PotentialBar label="Moteur"  current={ac.engine_hours   || 0} limit={ac.engine_limit   || 3600} />
          <PotentialBar label="Cellule" current={ac.airframe_hours  || 0} limit={ac.airframe_limit || 20000} />
        </div>
      </Card>

      {/* Dates seuils */}
      <Card style={{ padding:20 }}>
        <h3 style={{ color:'#94A3B8', fontSize:12, fontWeight:700, textTransform:'uppercase',
          letterSpacing:'0.08em', marginBottom:16 }}>Dates seuils estimées</h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap:10 }}>
          {[
            { label:'⚙️ Warning moteur',   info: engineWarn    },
            { label:'⚙️ Critique moteur',  info: engineThresh  },
            { label:'✈️ Warning cellule',  info: airframeWarn  },
            { label:'✈️ Critique cellule', info: airframeThresh },
          ].map(item => (
            <div key={item.label} style={{ padding:'12px 14px', borderRadius:10,
              backgroundColor:'rgba(15,30,53,0.7)', border:'1px solid #1E3A5F' }}>
              <div style={{ fontSize:11, color:'#5B8DB8', marginBottom:5 }}>{item.label}</div>
              {item.info
                ? <div style={{ fontFamily:'monospace', fontSize:13, fontWeight:700, color:item.info.color }}>
                    {item.info.label}
                  </div>
                : <div style={{ fontSize:12, color:'#2D5580' }}>— Non atteint dans les 60j</div>
              }
            </div>
          ))}
        </div>
      </Card>

      {/* Courbe de projection */}
      <Card style={{ padding:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <h3 style={{ color:'#94A3B8', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>
            Projection 60 jours — Potentiel moteur
          </h3>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:20, height:2, backgroundColor:'#F59E0B', borderRadius:1 }}/>
              <span style={{ fontSize:9, color:'#5B8DB8' }}>Warning ({LIMITS.engine.warning}h)</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:20, height:2, backgroundColor:'#EF4444', borderRadius:1 }}/>
              <span style={{ fontSize:9, color:'#5B8DB8' }}>Critique ({LIMITS.engine.critical}h)</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', backgroundColor:'#3B82F6' }}/>
              <span style={{ fontSize:9, color:'#5B8DB8' }}>Vol planifié</span>
            </div>
          </div>
        </div>

        {/* Graphique SVG */}
        <div style={{ overflowX:'auto' }}>
          <ProjectionChart data={proj.days} warningVal={LIMITS.engine.warning} criticalVal={LIMITS.engine.critical}/>
        </div>
      </Card>
    </div>
  )
}

// ── ProjectionChart (SVG full) ─────────────────────────────────────────────────
function ProjectionChart({ data, warningVal, criticalVal }) {
  if (!data?.length) return null
  const W = 700, H = 160, PAD = { top:10, right:20, bottom:30, left:50 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top  - PAD.bottom

  const maxVal = Math.max(...data.map(d => d.engineLeft), warningVal * 1.5)
  const scaleX = i => PAD.left + (i / (data.length - 1)) * chartW
  const scaleY = v => PAD.top  + chartH - (v / maxVal) * chartH

  const pts = data.map((d,i) => `${scaleX(i)},${scaleY(d.engineLeft)}`).join(' ')
  const areaBottom = `${scaleX(data.length-1)},${PAD.top+chartH} ${scaleX(0)},${PAD.top+chartH}`
  const warnY  = scaleY(warningVal)
  const critY  = scaleY(criticalVal)

  // Labels axe X (tous les 7 jours)
  const xLabels = data.filter((_, i) => i % 7 === 0)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:'block' }}>
      <defs>
        <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.02"/>
        </linearGradient>
        <clipPath id="chartClip">
          <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH}/>
        </clipPath>
      </defs>

      {/* Grille H */}
      {[0, 25, 50, 100, 200].map(v => v <= maxVal && (
        <g key={v}>
          <line x1={PAD.left} y1={scaleY(v)} x2={PAD.left+chartW} y2={scaleY(v)}
            stroke="#1E3A5F" strokeWidth={1} strokeDasharray="4,4"/>
          <text x={PAD.left-6} y={scaleY(v)+4} textAnchor="end"
            style={{ fill:'#2D5580', fontSize:9, fontFamily:'monospace' }}>{v}h</text>
        </g>
      ))}

      {/* Zone courbe */}
      <polygon clipPath="url(#chartClip)"
        points={`${pts} ${areaBottom}`} fill="url(#projGrad)"/>
      <polyline clipPath="url(#chartClip)"
        points={pts} fill="none" stroke="#3B82F6" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round"/>

      {/* Points vols planifiés */}
      {data.filter(d => d.hasPlannedFlights).map((d, i) => (
        <circle key={i} cx={scaleX(data.indexOf(d))} cy={scaleY(d.engineLeft)} r={3}
          fill="#60A5FA" stroke="#0A1628" strokeWidth={1.5}/>
      ))}

      {/* Lignes seuils */}
      <line x1={PAD.left} y1={warnY} x2={PAD.left+chartW} y2={warnY}
        stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="6,3"/>
      <text x={PAD.left+chartW+3} y={warnY+4}
        style={{ fill:'#F59E0B', fontSize:8, fontFamily:'monospace' }}>⚠</text>

      <line x1={PAD.left} y1={critY} x2={PAD.left+chartW} y2={critY}
        stroke="#EF4444" strokeWidth={1.5} strokeDasharray="6,3"/>
      <text x={PAD.left+chartW+3} y={critY+4}
        style={{ fill:'#EF4444', fontSize:8, fontFamily:'monospace' }}>🔴</text>

      {/* Labels axe X */}
      {xLabels.map((d, i) => {
        const idx = data.indexOf(d)
        return (
          <text key={i} x={scaleX(idx)} y={H-4} textAnchor="middle"
            style={{ fill:'#2D5580', fontSize:9, fontFamily:'monospace' }}>
            {d.date.toLocaleDateString('fr-FR', { day:'numeric', month:'short' })}
          </text>
        )
      })}
    </svg>
  )
}

// ── Tab: Calendrier ────────────────────────────────────────────────────────────
function CalendarTab({ calendarEvents, fleet }) {
  const today    = new Date(); today.setHours(0,0,0,0)
  const [month, setMonth] = useState(today.getMonth())
  const [year,  setYear]  = useState(today.getFullYear())

  const firstDay  = new Date(year, month, 1)
  const lastDay   = new Date(year, month + 1, 0)
  const startPad  = (firstDay.getDay() + 6) % 7 // Lundi = 0
  const daysInMonth = lastDay.getDate()

  const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin',
    'Juillet','Août','Septembre','Octobre','Novembre','Décembre']

  const eventsByDay = useMemo(() => {
    const map = {}
    calendarEvents.forEach(ev => {
      const d = toDate(ev.date)
      if (!d || d.getMonth() !== month || d.getFullYear() !== year) return
      const key = d.getDate()
      if (!map[key]) map[key] = []
      map[key].push(ev)
    })
    return map
  }, [calendarEvents, month, year])

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1) } else setMonth(m => m-1) }
  const nextMonth = () => { if (month === 11) { setMonth(0);  setYear(y => y+1) } else setMonth(m => m+1) }

  const cells = Array.from({ length: startPad + daysInMonth }, (_, i) => {
    const day = i - startPad + 1
    return day > 0 ? day : null
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Navigation mois */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={prevMonth} style={{ width:32, height:32, borderRadius:8, border:'1px solid #1E3A5F',
          cursor:'pointer', backgroundColor:'rgba(17,45,82,0.5)', color:'#5B8DB8', fontSize:14 }}>‹</button>
        <h3 style={{ color:'#F1F5F9', fontWeight:800, fontSize:16 }}>
          {MONTH_NAMES[month]} {year}
        </h3>
        <button onClick={nextMonth} style={{ width:32, height:32, borderRadius:8, border:'1px solid #1E3A5F',
          cursor:'pointer', backgroundColor:'rgba(17,45,82,0.5)', color:'#5B8DB8', fontSize:14 }}>›</button>
      </div>

      {/* Grille calendrier */}
      <Card>
        {/* Entêtes jours */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid #1E3A5F' }}>
          {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d => (
            <div key={d} style={{ textAlign:'center', padding:'8px 4px', fontSize:10, fontWeight:700,
              color:'#2D5580', textTransform:'uppercase', letterSpacing:'0.06em' }}>{d}</div>
          ))}
        </div>

        {/* Cellules */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
          {cells.map((day, idx) => {
            const isToday  = day && new Date(year, month, day).toDateString() === today.toDateString()
            const isPast   = day && new Date(year, month, day) < today
            const events   = day ? (eventsByDay[day] || []) : []
            return (
              <div key={idx} style={{
                minHeight:72, padding:'6px 8px',
                borderRight: (idx+1)%7 !== 0 ? '1px solid rgba(30,58,95,0.3)' : 'none',
                borderBottom: idx < cells.length - 7 ? '1px solid rgba(30,58,95,0.3)' : 'none',
                backgroundColor: isToday ? 'rgba(240,180,41,0.06)' : 'transparent',
              }}>
                {day && (
                  <>
                    <div style={{
                      width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:4,
                      backgroundColor: isToday ? '#F0B429' : 'transparent',
                      fontSize:11, fontWeight: isToday ? 800 : 500,
                      color: isToday ? '#0B1F3A' : isPast ? '#2D5580' : '#94A3B8',
                    }}>{day}</div>
                    {events.map((ev, i) => (
                      <div key={i} title={`${ev.label} — ${ev.aircraft}`}
                        style={{ fontSize:8.5, fontWeight:600, padding:'2px 5px', borderRadius:3, marginBottom:2,
                          backgroundColor:`${ev.color}18`, color:ev.color, border:`1px solid ${ev.color}30`,
                          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {ev.type === 'threshold' ? '⚠️ ' : '🔧 '}{ev.label}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Légende */}
      <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:12, height:12, borderRadius:2, backgroundColor:'rgba(59,130,246,0.18)', border:'1px solid rgba(59,130,246,0.4)' }}/>
          <span style={{ fontSize:11, color:'#5B8DB8' }}>🔧 Intervention planifiée</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:12, height:12, borderRadius:2, backgroundColor:'rgba(245,158,11,0.18)', border:'1px solid rgba(245,158,11,0.4)' }}/>
          <span style={{ fontSize:11, color:'#5B8DB8' }}>⚠️ Seuil warning estimé</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:12, height:12, borderRadius:2, backgroundColor:'rgba(239,68,68,0.18)', border:'1px solid rgba(239,68,68,0.4)' }}/>
          <span style={{ fontSize:11, color:'#5B8DB8' }}>⚠️ Seuil critique estimé</span>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Fenêtres ──────────────────────────────────────────────────────────────
function WindowsTab({ suggestedWindows, firestoreWindows, fleet, onSaveWindow, onConfirmWindow, onRejectWindow, user }) {
  const allWindows = useMemo(() => {
    const ids = new Set(firestoreWindows.map(w => w.id))
    return [
      ...firestoreWindows,
      ...suggestedWindows.filter(w => !ids.has(w.id)),
    ].sort((a, b) => {
      const da = a.suggested_start?.toDate ? a.suggested_start.toDate() : a.suggested_start
      const db = b.suggested_start?.toDate ? b.suggested_start.toDate() : b.suggested_start
      return da - db
    })
  }, [suggestedWindows, firestoreWindows])

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <p style={{ fontSize:12, color:'#5B8DB8' }}>
          {allWindows.length} créneau{allWindows.length !== 1 ? 'x' : ''} identifié{allWindows.length !== 1 ? 's' : ''} —
          triés par impact opérationnel minimal
        </p>
      </div>

      {allWindows.length === 0 && (
        <Card style={{ padding:32, textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📅</div>
          <p style={{ color:'#2D5580', fontSize:13 }}>Aucun créneau disponible — tous les avions sont nominaux.</p>
        </Card>
      )}

      {allWindows.map((w, idx) => {
        const start    = w.suggested_start?.toDate ? w.suggested_start.toDate() : w.suggested_start
        const end      = w.suggested_end?.toDate   ? w.suggested_end.toDate()   : w.suggested_end
        const pc       = PRIORITY_COLORS[w.priority] || PRIORITY_COLORS.medium
        const isFirestore = !!firestoreWindows.find(fw => fw.id === w.id)

        return (
          <Card key={w.id || idx} style={{ padding:18 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
              <div style={{ display:'flex', gap:14, alignItems:'flex-start', flex:1, minWidth:0 }}>

                {/* Score */}
                <div style={{ textAlign:'center', flexShrink:0 }}>
                  <div style={{ width:44, height:44, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center',
                    backgroundColor:`${pc.bg}`, border:`1.5px solid ${pc.border}` }}>
                    <span style={{ fontSize:16, fontWeight:900, color:pc.text }}>{w.score ?? '—'}</span>
                  </div>
                  <div style={{ fontSize:8, color:'#2D5580', marginTop:3 }}>score</div>
                </div>

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 }}>
                    <span style={{ fontFamily:'monospace', fontSize:13, fontWeight:800, color:'#F1F5F9' }}>
                      {w.aircraft_registration}
                    </span>
                    <Badge label={pc.label} color={pc}/>
                    <Badge label={
                      w.status === 'confirmed' ? '✅ Confirmé' :
                      w.status === 'rejected'  ? '✕ Rejeté'   : '⚡ Suggéré'
                    } color={
                      w.status === 'confirmed' ? '#4ADE80' :
                      w.status === 'rejected'  ? '#F87171'  : '#93C5FD'
                    }/>
                  </div>

                  <div style={{ fontSize:12, color:'#94A3B8', marginBottom:6 }}>
                    📅 {fmtDate(start)} → {fmtDate(end)}
                    <span style={{ color:'#5B8DB8', marginLeft:8 }}>({w.duration_hours}h de travail)</span>
                  </div>

                  {w.affected_flights?.length > 0 && (
                    <div style={{ fontSize:11, color:'#F59E0B' }}>
                      ⚠️ {w.conflicts_count} vol{w.conflicts_count > 1 ? 's' : ''} à déplacer :&nbsp;
                      {w.affected_flights.slice(0,4).join(', ')}
                      {w.affected_flights.length > 4 && ` +${w.affected_flights.length-4}`}
                    </div>
                  )}
                  {w.conflicts_count === 0 && (
                    <div style={{ fontSize:11, color:'#4ADE80' }}>✅ Aucun vol impacté</div>
                  )}
                </div>
              </div>

              {/* Actions */}
              {w.status !== 'rejected' && (
                <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                  {w.status !== 'confirmed' && (
                    <button onClick={() => isFirestore ? onConfirmWindow(w.id) : onSaveWindow({ ...w, status:'confirmed' })}
                      style={{ fontSize:11, fontWeight:700, padding:'7px 14px', borderRadius:8, cursor:'pointer',
                        backgroundColor:'rgba(16,185,129,0.15)', color:'#34D399', border:'1px solid rgba(16,185,129,0.3)' }}>
                      ✅ Confirmer
                    </button>
                  )}
                  {w.status !== 'confirmed' && (
                    <button onClick={() => isFirestore ? onRejectWindow(w.id) : null}
                      style={{ fontSize:11, padding:'7px 12px', borderRadius:8, cursor:'pointer',
                        backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155' }}>
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── Tab: Historique ────────────────────────────────────────────────────────────
function HistoryTab({ records, fleet, onAddRecord, onCompleteRecord, user }) {
  const [showForm, setShowForm] = useState(false)
  const [filterAc, setFilterAc] = useState('')
  const [filterCat,setFilterCat] = useState('')
  const [form, setForm] = useState({
    aircraft_registration:'', type:'scheduled', category:'engine',
    title:'', description:'', performed_by:'', hours_at_intervention:'',
    cost_eur:'', status:'planned',
  })
  const [saving, setSaving] = useState(false)

  const filtered = records.filter(r => {
    if (filterAc  && r.aircraft_registration !== filterAc)  return false
    if (filterCat && r.category !== filterCat)              return false
    return true
  })

  const handleSave = async () => {
    if (!form.title || !form.aircraft_registration) return
    setSaving(true)
    try {
      await onAddRecord({
        ...form,
        hours_at_intervention: Number(form.hours_at_intervention) || 0,
        cost_eur:              Number(form.cost_eur) || null,
        performed_at:          new Date(),
      })
      setShowForm(false)
      setForm({ aircraft_registration:'', type:'scheduled', category:'engine',
        title:'', description:'', performed_by:'', hours_at_intervention:'', cost_eur:'', status:'planned' })
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

      {/* Barre outils */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', gap:8 }}>
          <select value={filterAc} onChange={e => setFilterAc(e.target.value)}
            style={{ fontSize:11, padding:'5px 10px', borderRadius:8, border:'1px solid #1E3A5F',
              backgroundColor:'#0A1628', color: filterAc ? '#F0B429' : '#5B8DB8', cursor:'pointer' }}>
            <option value="">✈ Tous avions</option>
            {fleet.map(ac => <option key={ac.registration} value={ac.registration}>{ac.registration}</option>)}
          </select>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ fontSize:11, padding:'5px 10px', borderRadius:8, border:'1px solid #1E3A5F',
              backgroundColor:'#0A1628', color: filterCat ? '#F0B429' : '#5B8DB8', cursor:'pointer' }}>
            <option value="">🔧 Toutes catégories</option>
            {Object.entries(CATEGORY_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ fontSize:11, fontWeight:700, padding:'7px 14px', borderRadius:8, cursor:'pointer',
            backgroundColor:'#F0B429', color:'#0B1F3A', border:'none' }}>
          + Nouvelle intervention
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <Card style={{ padding:20 }}>
          <h3 style={{ color:'#F1F5F9', fontWeight:700, fontSize:14, marginBottom:16 }}>
            Nouvelle intervention
          </h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
            {[
              { key:'aircraft_registration', label:'Avion', type:'select',
                opts: fleet.map(ac => ({ v:ac.registration, l:ac.registration })) },
              { key:'type', label:'Type', type:'select',
                opts:[{v:'scheduled',l:'Programmée'},{v:'unscheduled',l:'Non programmée'},{v:'inspection',l:'Inspection'},{v:'repair',l:'Réparation'}] },
              { key:'category', label:'Catégorie', type:'select',
                opts: Object.entries(CATEGORY_LABELS).map(([k,v]) => ({ v:k, l:v })) },
              { key:'status', label:'Statut', type:'select',
                opts:[{v:'planned',l:'Planifiée'},{v:'in_progress',l:'En cours'},{v:'done',l:'Terminée'}] },
              { key:'title', label:'Titre', type:'text' },
              { key:'performed_by', label:'Technicien / Société', type:'text' },
              { key:'hours_at_intervention', label:'Potentiel au moment (h)', type:'number' },
              { key:'cost_eur', label:'Coût (€)', type:'number' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize:10, color:'#5B8DB8', display:'block', marginBottom:4,
                  textTransform:'uppercase', letterSpacing:'0.06em' }}>{f.label}</label>
                {f.type === 'select'
                  ? <select value={form[f.key]} onChange={e => setForm(v => ({ ...v, [f.key]:e.target.value }))}
                      style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid #1E3A5F',
                        backgroundColor:'#071729', color:'#F1F5F9', fontSize:12 }}>
                      <option value="">—</option>
                      {f.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  : <input type={f.type} value={form[f.key]}
                      onChange={e => setForm(v => ({ ...v, [f.key]:e.target.value }))}
                      style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid #1E3A5F',
                        backgroundColor:'#071729', color:'#F1F5F9', fontSize:12, boxSizing:'border-box' }}/>
                }
              </div>
            ))}
          </div>
          <div style={{ gridColumn:'1/-1', marginTop:8 }}>
            <label style={{ fontSize:10, color:'#5B8DB8', display:'block', marginBottom:4,
              textTransform:'uppercase', letterSpacing:'0.06em' }}>Description</label>
            <textarea value={form.description} onChange={e => setForm(v => ({ ...v, description:e.target.value }))}
              rows={3} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #1E3A5F',
                backgroundColor:'#071729', color:'#F1F5F9', fontSize:12, resize:'vertical', boxSizing:'border-box' }}/>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button onClick={() => setShowForm(false)}
              style={{ padding:'8px 20px', borderRadius:8, fontSize:12, cursor:'pointer',
                backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155' }}>
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || !form.title || !form.aircraft_registration}
              style={{ padding:'8px 24px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                backgroundColor:'#F0B429', color:'#0B1F3A', border:'none',
                opacity: saving || !form.title || !form.aircraft_registration ? 0.5 : 1 }}>
              {saving ? 'Enregistrement...' : '✓ Enregistrer'}
            </button>
          </div>
        </Card>
      )}

      {/* Liste */}
      {filtered.length === 0 && !showForm && (
        <Card style={{ padding:32, textAlign:'center' }}>
          <p style={{ color:'#2D5580' }}>Aucune intervention enregistrée.</p>
        </Card>
      )}

      {filtered.map(r => {
        const sc  = STATUS_COLORS[r.status]  || STATUS_COLORS.planned
        const dt  = toDate(r.performed_at)
        return (
          <Card key={r.id} style={{ padding:16 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
              <div style={{ display:'flex', gap:12, alignItems:'flex-start', flex:1 }}>
                <div style={{ width:36, height:36, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center',
                  backgroundColor:'rgba(17,45,82,0.7)', border:'1px solid #1E3A5F', fontSize:16, flexShrink:0 }}>
                  {CATEGORY_ICONS[r.category] || '🔧'}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                    <span style={{ fontWeight:700, fontSize:13, color:'#F1F5F9' }}>{r.title}</span>
                    <Badge label={STATUS_LABELS[r.status] || r.status} color={sc}/>
                    <Badge label={CATEGORY_LABELS[r.category] || r.category} color="#5B8DB8"/>
                    <span style={{ fontFamily:'monospace', fontSize:11,
                      backgroundColor:'rgba(240,180,41,0.08)', color:'#F0B429', padding:'1px 6px', borderRadius:3 }}>
                      {r.aircraft_registration}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:'#64748B', marginBottom:4 }}>
                    {dt ? `📅 ${fmtDate(dt)}` : ''}
                    {r.performed_by ? ` · 🧑‍🔧 ${r.performed_by}` : ''}
                    {r.hours_at_intervention ? ` · ${r.hours_at_intervention}h potentiel` : ''}
                    {r.cost_eur ? ` · 💶 ${r.cost_eur.toLocaleString()}€` : ''}
                  </div>
                  {r.description && (
                    <p style={{ fontSize:11, color:'#94A3B8', lineHeight:1.5, margin:0 }}>{r.description}</p>
                  )}
                </div>
              </div>
              {r.status === 'in_progress' && (
                <button onClick={() => onCompleteRecord(r.id)}
                  style={{ fontSize:11, fontWeight:700, padding:'6px 12px', borderRadius:8, cursor:'pointer',
                    backgroundColor:'rgba(16,185,129,0.12)', color:'#34D399', border:'1px solid rgba(16,185,129,0.25)',
                    flexShrink:0 }}>
                  ✓ Terminer
                </button>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── Tab: Stock ─────────────────────────────────────────────────────────────────
function StockTab({ spareParts, lowStockParts, onAddPart, onAdjustStock }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    reference:'', name:'', category:'consumable', unit:'unit',
    quantity_on_hand:0, quantity_min:2, supplier:'', lead_time_days:7,
    unit_cost_eur:'', location:'', applicable_aircraft: [],
  })
  const [saving, setSaving] = useState(false)
  const [adjusting, setAdjusting] = useState({})

  const handleSave = async () => {
    if (!form.name) return
    setSaving(true)
    try { await onAddPart(form); setShowForm(false) }
    finally { setSaving(false) }
  }

  const handleAdj = async (id, delta) => {
    setAdjusting(a => ({ ...a, [id]:true }))
    await onAdjustStock(id, delta)
    setAdjusting(a => ({ ...a, [id]:false }))
  }

  const CATEGORY_PART_LABELS = { consumable:'Consommable', rotable:'Rotable', expendable:'Dépensable' }
  const UNIT_LABELS = { unit:'unité', liter:'litre', kg:'kg', set:'set' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

      {/* Alertes réapprovisionnement */}
      {lowStockParts.length > 0 && (
        <div style={{ padding:14, borderRadius:12, border:'1px solid rgba(239,68,68,0.3)',
          backgroundColor:'rgba(239,68,68,0.07)', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:18 }}>🚨</span>
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:'#F87171' }}>
              {lowStockParts.length} pièce{lowStockParts.length > 1 ? 's' : ''} sous seuil minimum
            </div>
            <div style={{ fontSize:11, color:'#5B8DB8', marginTop:2 }}>
              {lowStockParts.map(p => p.name).join(', ')}
            </div>
          </div>
        </div>
      )}

      {/* Barre outils */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <p style={{ fontSize:12, color:'#5B8DB8' }}>{spareParts.length} référence{spareParts.length !== 1 ? 's' : ''} en stock</p>
        <button onClick={() => setShowForm(true)}
          style={{ fontSize:11, fontWeight:700, padding:'7px 14px', borderRadius:8, cursor:'pointer',
            backgroundColor:'#F0B429', color:'#0B1F3A', border:'none' }}>
          + Nouvelle pièce
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <Card style={{ padding:20 }}>
          <h3 style={{ color:'#F1F5F9', fontWeight:700, fontSize:14, marginBottom:16 }}>Nouvelle pièce / consommable</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 }}>
            {[
              { key:'reference',     label:'P/N Référence',       type:'text'   },
              { key:'name',          label:'Désignation',          type:'text'   },
              { key:'category',      label:'Catégorie',            type:'select',
                opts: Object.entries(CATEGORY_PART_LABELS).map(([k,v]) => ({ v:k, l:v })) },
              { key:'unit',          label:'Unité',                type:'select',
                opts: Object.entries(UNIT_LABELS).map(([k,v]) => ({ v:k, l:v })) },
              { key:'quantity_on_hand', label:'Qté en stock',      type:'number' },
              { key:'quantity_min',  label:'Seuil mini alerte',    type:'number' },
              { key:'supplier',      label:'Fournisseur',          type:'text'   },
              { key:'lead_time_days',label:'Délai appro (j)',       type:'number' },
              { key:'unit_cost_eur', label:'Coût unitaire (€)',     type:'number' },
              { key:'location',      label:'Emplacement stock',    type:'text'   },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize:10, color:'#5B8DB8', display:'block', marginBottom:4,
                  textTransform:'uppercase', letterSpacing:'0.06em' }}>{f.label}</label>
                {f.type === 'select'
                  ? <select value={form[f.key]} onChange={e => setForm(v => ({ ...v, [f.key]:e.target.value }))}
                      style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid #1E3A5F',
                        backgroundColor:'#071729', color:'#F1F5F9', fontSize:12 }}>
                      {f.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  : <input type={f.type} value={form[f.key]}
                      onChange={e => setForm(v => ({ ...v, [f.key]: f.type==='number' ? Number(e.target.value) : e.target.value }))}
                      style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid #1E3A5F',
                        backgroundColor:'#071729', color:'#F1F5F9', fontSize:12, boxSizing:'border-box' }}/>
                }
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button onClick={() => setShowForm(false)} style={{ padding:'8px 20px', borderRadius:8, fontSize:12, cursor:'pointer',
              backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:'1px solid #334155' }}>Annuler</button>
            <button onClick={handleSave} disabled={saving || !form.name}
              style={{ padding:'8px 24px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                backgroundColor:'#F0B429', color:'#0B1F3A', border:'none', opacity: saving || !form.name ? 0.5 : 1 }}>
              {saving ? 'Enregistrement...' : '✓ Enregistrer'}
            </button>
          </div>
        </Card>
      )}

      {/* Table stock */}
      {spareParts.length === 0 && !showForm && (
        <Card style={{ padding:32, textAlign:'center' }}>
          <p style={{ color:'#2D5580' }}>Aucune pièce enregistrée. Commencez par en ajouter une.</p>
        </Card>
      )}

      {spareParts.length > 0 && (
        <Card style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1E3A5F' }}>
                {['Référence','Désignation','Catégorie','Stock','Seuil','Fournisseur','Délai','Ajuster'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:9, fontWeight:700,
                    color:'#2D5580', textTransform:'uppercase', letterSpacing:'0.08em', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spareParts.map((p, idx) => {
                const isLow = (p.quantity_on_hand || 0) <= (p.quantity_min || 0)
                const isOut = (p.quantity_on_hand || 0) === 0
                return (
                  <tr key={p.id} style={{ borderBottom:'1px solid rgba(30,58,95,0.3)',
                    backgroundColor: isOut ? 'rgba(239,68,68,0.05)' : isLow ? 'rgba(245,158,11,0.04)' : 'transparent' }}>
                    <td style={{ padding:'10px 14px', fontSize:11, fontFamily:'monospace', color:'#94A3B8' }}>
                      {p.reference || '—'}
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ fontWeight:600, fontSize:12, color:'#F1F5F9' }}>{p.name}</div>
                      {p.location && <div style={{ fontSize:10, color:'#475569' }}>📦 {p.location}</div>}
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <Badge label={CATEGORY_PART_LABELS[p.category] || p.category} color="#5B8DB8"/>
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:14,
                          color: isOut ? '#EF4444' : isLow ? '#F59E0B' : '#4ADE80' }}>
                          {p.quantity_on_hand ?? 0}
                        </span>
                        <span style={{ fontSize:10, color:'#475569' }}>{UNIT_LABELS[p.unit] || p.unit}</span>
                        {isLow && !isOut && <span style={{ fontSize:10 }}>⚠️</span>}
                        {isOut && <span style={{ fontSize:10 }}>🚫</span>}
                      </div>
                    </td>
                    <td style={{ padding:'10px 14px', fontSize:11, fontFamily:'monospace', color:'#5B8DB8' }}>
                      {p.quantity_min ?? '—'}
                    </td>
                    <td style={{ padding:'10px 14px', fontSize:11, color:'#94A3B8' }}>
                      {p.supplier || '—'}
                    </td>
                    <td style={{ padding:'10px 14px', fontSize:11, color:'#94A3B8' }}>
                      {p.lead_time_days ? `${p.lead_time_days}j` : '—'}
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:5 }}>
                        <button onClick={() => handleAdj(p.id, -1)} disabled={adjusting[p.id] || p.quantity_on_hand <= 0}
                          style={{ width:26, height:26, borderRadius:6, border:'1px solid #1E3A5F', cursor:'pointer',
                            backgroundColor:'rgba(239,68,68,0.1)', color:'#F87171', fontSize:14, fontWeight:700,
                            opacity: p.quantity_on_hand <= 0 ? 0.3 : 1 }}>−</button>
                        <button onClick={() => handleAdj(p.id, 1)} disabled={adjusting[p.id]}
                          style={{ width:26, height:26, borderRadius:6, border:'1px solid #1E3A5F', cursor:'pointer',
                            backgroundColor:'rgba(16,185,129,0.1)', color:'#34D399', fontSize:14, fontWeight:700 }}>+</button>
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

// ── Page principale ────────────────────────────────────────────────────────────
const TABS = [
  { id:'projection', icon:'📈', label:'Projection'  },
  { id:'calendar',   icon:'📅', label:'Calendrier'  },
  { id:'windows',    icon:'🪟', label:'Fenêtres'    },
  { id:'history',    icon:'📋', label:'Historique'  },
  { id:'stock',      icon:'📦', label:'Stock'       },
]

export default function MaintenancePage({ fleet, flights, user }) {
  const [activeTab, setActiveTab] = useState('projection')

  const {
    records, windows: firestoreWindows, spareParts, loading, error,
    consumptionByAircraft, projectionsByAircraft, healthScores,
    suggestedWindows, calendarEvents, lowStockParts,
    onAddRecord, onUpdateRecord, onCompleteRecord,
    onSaveWindow, onConfirmWindow, onRejectWindow,
    onAddPart, onAdjustStock, clearError,
  } = useMaintenance({ fleet, flights, user })

  // Badge alertes par onglet
  const badges = {
    projection: fleet.filter(ac => {
      const p = projectionsByAircraft[ac.registration]
      return p?.engineThresholdDate || p?.airframeCritDate
    }).length,
    windows: suggestedWindows.filter(w => w.priority === 'high' || w.priority === 'urgent').length,
    stock:   lowStockParts.length,
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200 }}>
      <div style={{ color:'#5B8DB8', fontSize:13, fontFamily:'monospace' }}>
        Chargement maintenance...
      </div>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <div>
          <h1 style={{ color:'#F1F5F9', fontWeight:900, fontSize:20, margin:0, display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:22 }}>🔧</span> Maintenance Prédictive
          </h1>
          <p style={{ color:'#475569', fontSize:12, marginTop:4 }}>
            {fleet.length} avion{fleet.length>1?'s':''} · Projections 60 jours · Basé sur planning réel
          </p>
        </div>

        {/* KPI rapide scores */}
        <div style={{ display:'flex', gap:8 }}>
          {fleet.slice(0,4).map(ac => {
            const h = healthScores[ac.registration] ?? 95
            const c = h >= 80 ? '#4ADE80' : h >= 55 ? '#F0B429' : '#EF4444'
            return (
              <div key={ac.registration} style={{ textAlign:'center', padding:'6px 10px', borderRadius:10,
                backgroundColor:'rgba(7,23,41,0.8)', border:`1px solid ${c}30` }}>
                <div style={{ fontFamily:'monospace', fontSize:16, fontWeight:900, color:c, lineHeight:1 }}>{h}</div>
                <div style={{ fontSize:8, color:'#475569', marginTop:2 }}>{ac.registration.replace('F-','')}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div style={{ padding:'10px 16px', borderRadius:10, backgroundColor:'rgba(239,68,68,0.1)',
          border:'1px solid rgba(239,68,68,0.3)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:12, color:'#F87171' }}>⚠️ {error}</span>
          <button onClick={clearError} style={{ fontSize:12, color:'#F87171', cursor:'pointer', background:'none', border:'none' }}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, padding:4, backgroundColor:'rgba(7,23,41,0.8)',
        borderRadius:12, border:'1px solid #1E3A5F', flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ flex:1, minWidth:100, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              padding:'9px 14px', borderRadius:9, border:'none', cursor:'pointer', position:'relative',
              backgroundColor: activeTab === t.id ? '#1E3A5F' : 'transparent',
              color: activeTab === t.id ? '#F0B429' : '#5B8DB8',
              fontWeight: activeTab === t.id ? 700 : 500, fontSize:12, transition:'all 0.15s' }}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {badges[t.id] > 0 && (
              <span style={{ position:'absolute', top:4, right:4, width:14, height:14, borderRadius:'50%',
                backgroundColor:'#EF4444', color:'#fff', fontSize:8, fontWeight:900,
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow:'0 0 6px #EF4444' }}>{badges[t.id]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div>
        {activeTab === 'projection' && (
          <ProjectionTab fleet={fleet} projectionsByAircraft={projectionsByAircraft}
            consumptionByAircraft={consumptionByAircraft} healthScores={healthScores}/>
        )}
        {activeTab === 'calendar' && (
          <CalendarTab calendarEvents={calendarEvents} fleet={fleet}/>
        )}
        {activeTab === 'windows' && (
          <WindowsTab suggestedWindows={suggestedWindows} firestoreWindows={firestoreWindows}
            fleet={fleet} onSaveWindow={onSaveWindow} onConfirmWindow={onConfirmWindow}
            onRejectWindow={onRejectWindow} user={user}/>
        )}
        {activeTab === 'history' && (
          <HistoryTab records={records} fleet={fleet} onAddRecord={onAddRecord}
            onCompleteRecord={onCompleteRecord} user={user}/>
        )}
        {activeTab === 'stock' && (
          <StockTab spareParts={spareParts} lowStockParts={lowStockParts}
            onAddPart={onAddPart} onAdjustStock={onAdjustStock}/>
        )}
      </div>
    </div>
  )
}
