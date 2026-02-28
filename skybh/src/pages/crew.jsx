/**
 * @fileoverview Module Crew Management — SKYBH
 * Liste membres · Détail · Qualifications · FTL · Assignations
 */
import { useState, useMemo } from 'react'
import { useCrew, useCrewMember } from '../hooks/use-crew'
import {
  calculateFTL, validateCrewForFlight,
  getExpiryStatus, getSimCheckStatus,
  FTL_LIMITS,
} from '../utils/ftl-calculator'

// ── Palette cohérente SKYBH ───────────────────────────────────────────────────
const P = {
  navy:    '#0B1F3A', navyMid:'#0F2745', navyLight:'#152840',
  blue:    '#1E3A5F', blueMid:'#2D5580', blueLight:'#5B8DB8',
  gold:    '#F0B429', goldMid:'rgba(240,180,41,0.15)',
  green:   '#4ADE80', greenBg:'rgba(74,222,128,0.1)',
  red:     '#EF4444', redBg:  'rgba(239,68,68,0.12)',
  orange:  '#F59E0B', orangeBg:'rgba(245,158,11,0.12)',
  slate:   '#475569', light:  '#CBD5E1',
}

// ── Composants UI réutilisables ───────────────────────────────────────────────
const Badge = ({ label, color = P.blueLight, bg = 'rgba(59,130,246,0.12)', size = 10 }) => (
  <span style={{
    fontSize: size, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
    backgroundColor: bg, color, border: `1px solid ${color}40`,
    whiteSpace: 'nowrap',
  }}>{label}</span>
)

const StatusBadge = ({ status }) => {
  const map = {
    ok:       { label:'✓ Valide',   color:P.green,  bg:P.greenBg  },
    warning:  { label:'⚠ Attention', color:P.orange, bg:P.orangeBg },
    critical: { label:'✕ Critique', color:P.red,    bg:P.redBg    },
    inactive: { label:'— Inactif',  color:P.slate,  bg:'rgba(71,85,105,0.15)' },
    expiring: { label:'⚑ Bientôt',  color:P.orange, bg:P.orangeBg },
    expired:  { label:'✕ Expiré',   color:P.red,    bg:P.redBg    },
    valid:    { label:'✓ Valide',   color:P.green,  bg:P.greenBg  },
    unknown:  { label:'? Inconnu',  color:P.slate,  bg:'rgba(71,85,105,0.1)' },
  }
  const s = map[status] || map.unknown
  return <Badge label={s.label} color={s.color} bg={s.bg}/>
}

const FtlBar = ({ label, used, limit, unit = 'h' }) => {
  const pct = Math.min(100, Math.round((used / limit) * 100))
  const color = pct >= 100 ? P.red : pct >= 95 ? P.red : pct >= 80 ? P.orange : P.green
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: P.light }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color }}>
          {used.toFixed(1)}{unit} / {limit}{unit}
          <span style={{ color: P.blueLight, marginLeft: 6 }}>{pct}%</span>
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(30,58,95,0.5)' }}>
        <div style={{
          height: '100%', borderRadius: 3,
          width: `${pct}%`, backgroundColor: color,
          transition: 'width 0.4s ease, background-color 0.3s',
          boxShadow: pct >= 80 ? `0 0 6px ${color}80` : 'none',
        }}/>
      </div>
    </div>
  )
}

const Card = ({ children, style: s = {} }) => (
  <div style={{
    backgroundColor: P.navyMid, borderRadius: 12,
    border: `1px solid ${P.blue}`,
    padding: 18, ...s,
  }}>{children}</div>
)

const SectionTitle = ({ children }) => (
  <div style={{
    fontSize: 10, fontWeight: 700, color: P.blueLight,
    textTransform: 'uppercase', letterSpacing: '0.1em',
    marginBottom: 12,
  }}>{children}</div>
)

const qualStatusColor = s =>
  s === 'valid' ? P.green : s === 'expiring' ? P.orange : P.red

// ── AVATAR initiales ──────────────────────────────────────────────────────────
const Avatar = ({ member, size = 42, statusColor = P.blueLight }) => {
  const initials = `${(member.first_name||'?')[0]}${(member.last_name||'?')[0]}`.toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      backgroundColor: P.navyLight,
      border: `2px solid ${statusColor}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: size * 0.35, fontWeight: 800, color: statusColor, fontFamily: 'monospace' }}>
        {initials}
      </span>
    </div>
  )
}

// ── Modal Membre (Create / Edit) ──────────────────────────────────────────────
const ROLES = ['PIC','FO','CAP']
const BASES = ['TFFJ','TFFG','TNCM','TQPF']
const TYPE_RATINGS = ['C208','C208B','BN2','DHC6','ATR42']

const MemberModal = ({ member, onSave, onClose }) => {
  const [form, setForm] = useState(member || {
    first_name: '', last_name: '', role: 'PIC', active: true,
    base: 'TFFJ', email: '', phone: '', employee_id: '', hire_date: '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.first_name || !form.last_name) return
    setSaving(true)
    try { await onSave(form); onClose() }
    finally { setSaving(false) }
  }

  const fields = [
    { key:'first_name', label:'Prénom',       placeholder:'Jean',              full:false },
    { key:'last_name',  label:'Nom',           placeholder:'Dupont',            full:false },
    { key:'email',      label:'Email',         placeholder:'j.dupont@sbh.aero', full:true  },
    { key:'phone',      label:'Téléphone',     placeholder:'+590 690 …',        full:false },
    { key:'employee_id',label:'Matricule',     placeholder:'EMP-001',           full:false },
    { key:'hire_date',  label:'Date embauche', placeholder:'2022-01-15',        full:false, type:'date' },
  ]

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:500,
      display:'flex', alignItems:'center', justifyContent:'center',
      backgroundColor:'rgba(0,0,0,0.7)', backdropFilter:'blur(6px)',
    }} onClick={onClose}>
      <div style={{
        backgroundColor:P.navyMid, border:`1px solid ${P.blue}`, borderRadius:16,
        padding:28, width:480, maxWidth:'94vw', maxHeight:'90vh', overflowY:'auto',
      }} onClick={e=>e.stopPropagation()}>
        <h3 style={{ color:P.gold, fontWeight:800, fontSize:16, margin:'0 0 20px' }}>
          {member ? '✏ Modifier membre' : '+ Nouveau membre d\'équipage'}
        </h3>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {fields.map(f => (
            <div key={f.key} style={f.full ? { gridColumn:'1/-1' } : {}}>
              <label style={{ fontSize:10, color:P.blueLight, display:'block', marginBottom:3,
                textTransform:'uppercase', letterSpacing:'0.06em' }}>{f.label}</label>
              <input
                type={f.type || 'text'}
                value={form[f.key] || ''} placeholder={f.placeholder}
                onChange={e => set(f.key, e.target.value)}
                style={{ width:'100%', padding:'7px 10px', borderRadius:8,
                  border:`1px solid ${P.blue}`, backgroundColor:P.navy,
                  color:'#F1F5F9', fontSize:12, boxSizing:'border-box' }}/>
            </div>
          ))}

          {/* Rôle */}
          <div>
            <label style={{ fontSize:10, color:P.blueLight, display:'block', marginBottom:3,
              textTransform:'uppercase', letterSpacing:'0.06em' }}>Rôle</label>
            <select value={form.role} onChange={e=>set('role',e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:8,
                border:`1px solid ${P.blue}`, backgroundColor:P.navy, color:'#F1F5F9', fontSize:12 }}>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>

          {/* Base */}
          <div>
            <label style={{ fontSize:10, color:P.blueLight, display:'block', marginBottom:3,
              textTransform:'uppercase', letterSpacing:'0.06em' }}>Base</label>
            <select value={form.base || 'TFFJ'} onChange={e=>set('base',e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:8,
                border:`1px solid ${P.blue}`, backgroundColor:P.navy, color:'#F1F5F9', fontSize:12 }}>
              {BASES.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>

          {/* Actif */}
          <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:10 }}>
            <input type="checkbox" checked={form.active}
              onChange={e=>set('active',e.target.checked)}
              style={{ width:16, height:16, cursor:'pointer' }}/>
            <span style={{ fontSize:12, color:P.light }}>Membre actif</span>
          </div>
        </div>

        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button onClick={onClose} style={{
            padding:'8px 18px', borderRadius:8, fontSize:12, cursor:'pointer',
            backgroundColor:'rgba(71,85,105,0.3)', color:'#94A3B8', border:`1px solid ${P.blue}`,
          }}>Annuler</button>
          <button onClick={handleSave} disabled={saving || !form.first_name || !form.last_name}
            style={{
              flex:1, padding:'9px', borderRadius:8, fontSize:12, fontWeight:700,
              cursor:'pointer', backgroundColor:P.gold, color:P.navy, border:'none',
              opacity: saving || !form.first_name || !form.last_name ? 0.5 : 1,
            }}>
            {saving ? '⟳ Enregistrement…' : '✓ Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Vue Détail Membre ─────────────────────────────────────────────────────────
const MemberDetail = ({ crewId, onBack }) => {
  const { member, quals, ftlLogs, ftlToday, flightHistory, status, onUpdateQuals } = useCrewMember(crewId)
  const [tab,      setTab]      = useState('ftl')
  const [editQuals,setEditQuals]= useState(false)
  const [qualsForm,setQualsForm]= useState({})
  const [saving,   setSaving]   = useState(false)

  if (!member) return (
    <div style={{ padding:40, textAlign:'center', color:P.blueLight }}>Chargement…</div>
  )

  const statusColor = status==='ok'?P.green:status==='warning'?P.orange:status==='inactive'?P.slate:P.red

  const handleSaveQuals = async () => {
    setSaving(true)
    try { await onUpdateQuals(qualsForm); setEditQuals(false) }
    finally { setSaving(false) }
  }

  const TABS = [
    { id:'ftl',    label:'📊 FTL & Compteurs' },
    { id:'quals',  label:'📋 Qualifications'  },
    { id:'history',label:'🕐 Historique vols'  },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
        <button onClick={onBack} style={{
          padding:'6px 14px', borderRadius:8, fontSize:12, cursor:'pointer',
          backgroundColor:'rgba(30,58,95,0.4)', color:P.blueLight, border:`1px solid ${P.blue}`,
        }}>← Retour</button>

        <Avatar member={member} size={52} statusColor={statusColor}/>

        <div style={{ flex:1 }}>
          <div style={{ fontWeight:900, fontSize:20, color:'#F1F5F9' }}>
            {member.first_name} {member.last_name}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:4, flexWrap:'wrap' }}>
            <Badge label={member.role} color={P.gold} bg={P.goldMid}/>
            <Badge label={member.base || 'TFFJ'} color={P.blueLight}/>
            <StatusBadge status={status}/>
            {!member.active && <Badge label="Inactif" color={P.slate} bg="rgba(71,85,105,0.2)"/>}
          </div>
        </div>

        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:10, color:P.blueLight }}>Matricule</div>
          <div style={{ fontFamily:'monospace', fontWeight:700, color:P.gold }}>
            {member.employee_id || '—'}
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:`1px solid ${P.blue}`, paddingBottom:8 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:'6px 16px', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer', border:'none',
            backgroundColor: tab===t.id ? 'rgba(59,130,246,0.15)' : 'transparent',
            color:           tab===t.id ? '#93C5FD' : P.slate,
            borderBottom:    tab===t.id ? `2px solid #3B82F6` : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── FTL & Compteurs ────────────────────────────────────────────── */}
      {tab === 'ftl' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:14 }}>
          <Card>
            <SectionTitle>Compteurs FTL actuels</SectionTitle>
            <FtlBar label="Temps de vol aujourd'hui"
              used={ftlToday.counters.flight_hours_today}
              limit={FTL_LIMITS.MAX_FLIGHT_HOURS_PER_DAY}/>
            <FtlBar label="Duty journalier"
              used={ftlToday.counters.duty_hours_today}
              limit={FTL_LIMITS.MAX_DUTY_HOURS_PER_DAY}/>
            <FtlBar label="Temps de vol — 7 jours"
              used={ftlToday.counters.flight_hours_7d}
              limit={FTL_LIMITS.MAX_FLIGHT_HOURS_7_DAYS}/>
            <FtlBar label="Temps de vol — 28 jours"
              used={ftlToday.counters.flight_hours_28d}
              limit={FTL_LIMITS.MAX_FLIGHT_HOURS_28_DAYS}/>
          </Card>

          <Card>
            <SectionTitle>Marges disponibles</SectionTitle>
            {[
              { label:"Aujourd'hui restant", val:ftlToday.margins.ft_today_remaining, unit:'h' },
              { label:'7j restant',          val:ftlToday.margins.ft_7d_remaining,    unit:'h' },
              { label:'28j restant',         val:ftlToday.margins.ft_28d_remaining,   unit:'h' },
            ].map(m => {
              const color = m.val <= 0 ? P.red : m.val <= 2 ? P.orange : P.green
              return (
                <div key={m.label} style={{
                  display:'flex', justifyContent:'space-between',
                  padding:'8px 0', borderBottom:`1px solid ${P.blue}40`,
                }}>
                  <span style={{ fontSize:12, color:P.light }}>{m.label}</span>
                  <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:13, color }}>
                    {m.val <= 0 ? '—' : `${m.val.toFixed(1)}${m.unit}`}
                  </span>
                </div>
              )
            })}

            <div style={{ marginTop:14 }}>
              <div style={{
                padding:'10px 14px', borderRadius:10,
                backgroundColor: ftlToday.compliant ? P.greenBg : P.redBg,
                border:`1px solid ${ftlToday.compliant ? P.green+'40' : P.red+'40'}`,
              }}>
                <div style={{ fontSize:11, fontWeight:700,
                  color: ftlToday.compliant ? P.green : P.red }}>
                  {ftlToday.compliant ? '✓ FTL Conforme' : '✕ FTL Non conforme'}
                </div>
                {!ftlToday.compliant && (
                  <div style={{ fontSize:10, color:'#FCA5A5', marginTop:4 }}>
                    {ftlToday.reason}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Qualifications ─────────────────────────────────────────────── */}
      {tab === 'quals' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <span style={{ fontSize:13, fontWeight:700, color:'#F1F5F9' }}>Documents & Qualifications</span>
            <button onClick={() => { setEditQuals(!editQuals); setQualsForm(quals||{}) }}
              style={{ padding:'6px 14px', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer',
                border:'none', backgroundColor:P.goldMid, color:P.gold }}>
              {editQuals ? '✕ Annuler' : '✏ Modifier'}
            </button>
          </div>

          {editQuals ? (
            <Card>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[
                  { key:'medical_expiry', label:'Visite médicale (expiry)' },
                  { key:'license_expiry', label:'Licence (expiry)'         },
                  { key:'license_number', label:'N° Licence'               },
                  { key:'last_sim_check', label:'Dernier sim check'        },
                  { key:'next_sim_check', label:'Prochain sim check'       },
                  { key:'ir_expiry',      label:'IR Expiry'                },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize:10, color:P.blueLight, display:'block', marginBottom:3,
                      textTransform:'uppercase', letterSpacing:'0.06em' }}>{f.label}</label>
                    <input type="date" value={(qualsForm[f.key]||'').slice(0,10)}
                      onChange={e=>setQualsForm(q=>({...q,[f.key]:e.target.value}))}
                      style={{ width:'100%', padding:'7px 10px', borderRadius:8,
                        border:`1px solid ${P.blue}`, backgroundColor:P.navy,
                        color:'#F1F5F9', fontSize:12, boxSizing:'border-box' }}/>
                  </div>
                ))}

                {/* Type ratings */}
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={{ fontSize:10, color:P.blueLight, display:'block', marginBottom:6,
                    textTransform:'uppercase', letterSpacing:'0.06em' }}>Qualifications type</label>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {TYPE_RATINGS.map(tr => {
                      const has = (qualsForm.type_ratings||[]).includes(tr)
                      return (
                        <button key={tr} onClick={()=>setQualsForm(q=>({
                          ...q, type_ratings: has
                            ? (q.type_ratings||[]).filter(x=>x!==tr)
                            : [...(q.type_ratings||[]), tr],
                        }))} style={{
                          padding:'4px 12px', borderRadius:7, fontSize:11, fontWeight:700,
                          cursor:'pointer', border:'none',
                          backgroundColor: has ? 'rgba(59,130,246,0.2)' : 'rgba(30,58,95,0.4)',
                          color:           has ? '#93C5FD' : P.slate,
                        }}>{tr}</button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <button onClick={handleSaveQuals} disabled={saving} style={{
                marginTop:16, width:'100%', padding:'9px', borderRadius:8,
                fontSize:12, fontWeight:700, cursor:'pointer',
                backgroundColor:P.gold, color:P.navy, border:'none',
                opacity:saving?0.6:1,
              }}>
                {saving ? '⟳ Enregistrement…' : '✓ Enregistrer les qualifications'}
              </button>
            </Card>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:12 }}>
              {quals ? [
                { label:'Visite médicale', date:quals.medical_expiry, status:quals.medical_status },
                { label:'Licence',         date:quals.license_expiry, status:quals.license_status },
                { label:'Sim Check',       date:quals.last_sim_check, status:quals.sim_status     },
              ].map(q => (
                <Card key={q.label}>
                  <div style={{ fontSize:11, color:P.blueLight, marginBottom:6 }}>{q.label}</div>
                  <div style={{ fontFamily:'monospace', fontWeight:700, fontSize:14,
                    color:qualStatusColor(q.status) }}>
                    {q.date || 'Non renseignée'}
                  </div>
                  <div style={{ marginTop:6 }}>
                    <StatusBadge status={q.status || 'unknown'}/>
                  </div>
                </Card>
              )) : (
                <div style={{ color:P.blueLight, fontSize:12, padding:16 }}>
                  Aucune qualification enregistrée
                </div>
              )}

              {quals?.type_ratings?.length > 0 && (
                <Card style={{ gridColumn:'1/-1' }}>
                  <SectionTitle>Qualifications type (type ratings)</SectionTitle>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {quals.type_ratings.map(tr => (
                      <Badge key={tr} label={tr} color={P.gold} bg={P.goldMid} size={12}/>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Historique vols ─────────────────────────────────────────────── */}
      {tab === 'history' && (
        <Card>
          <SectionTitle>Historique des vols (28 derniers jours)</SectionTitle>
          {flightHistory.length === 0 ? (
            <div style={{ color:P.blueLight, fontSize:12, textAlign:'center', padding:'20px 0' }}>
              Aucun vol enregistré sur la période
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${P.blue}` }}>
                    {['Date','Vol','Route','Temps vol','Duty','Rôle'].map(h => (
                      <th key={h} style={{ padding:'6px 10px', textAlign:'left',
                        color:P.blueLight, fontWeight:700, fontSize:10,
                        textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flightHistory.map((log, i) => (
                    <tr key={log.id || i} style={{
                      borderBottom:`1px solid ${P.blue}30`,
                      backgroundColor: i%2===0 ? 'transparent' : 'rgba(30,58,95,0.08)',
                    }}>
                      <td style={{ padding:'7px 10px', fontFamily:'monospace', color:P.light }}>
                        {log.date}
                      </td>
                      <td style={{ padding:'7px 10px', fontWeight:700, color:P.gold }}>
                        {log.flight_number || '—'}
                      </td>
                      <td style={{ padding:'7px 10px', color:P.light }}>
                        {log.origin && log.destination ? `${log.origin} → ${log.destination}` : '—'}
                      </td>
                      <td style={{ padding:'7px 10px', fontFamily:'monospace', color:'#F1F5F9' }}>
                        {log.flight_minutes ? `${Math.floor(log.flight_minutes/60)}h${String(log.flight_minutes%60).padStart(2,'0')}` : '—'}
                      </td>
                      <td style={{ padding:'7px 10px', fontFamily:'monospace', color:P.blueLight }}>
                        {log.duty_start_utc && log.duty_end_utc
                          ? `${((log.duty_end_utc-log.duty_start_utc)/3600000).toFixed(1)}h`
                          : '—'}
                      </td>
                      <td style={{ padding:'7px 10px' }}>
                        <Badge label={log.role || member.role} color={P.gold} bg={P.goldMid} size={9}/>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

// ── Page principale Crew ──────────────────────────────────────────────────────
export default function CrewPage({ flights = [], user = null }) {
  const {
    members, activeMembers, pics, fos,
    loading, error,
    onCreateMember, onUpdateMember, onDeleteMember, onToggleActive,
    clearError,
  } = useCrew()

  const [selectedId,   setSelectedId]   = useState(null)
  const [showModal,    setShowModal]     = useState(false)
  const [editMember,   setEditMember]    = useState(null)
  const [filterRole,   setFilterRole]    = useState('all')
  const [filterStatus, setFilterStatus]  = useState('all')
  const [search,       setSearch]        = useState('')

  // Filtrage
  const filtered = useMemo(() => members.filter(m => {
    if (filterRole   !== 'all' && m.role !== filterRole)           return false
    if (filterStatus === 'active'   && !m.active)                  return false
    if (filterStatus === 'inactive' && m.active)                   return false
    if (search) {
      const q = search.toLowerCase()
      return (m.first_name+' '+m.last_name+m.email+m.employee_id).toLowerCase().includes(q)
    }
    return true
  }), [members, filterRole, filterStatus, search])

  const handleSave = async (data) => {
    if (editMember?.id) await onUpdateMember(editMember.id, data)
    else                await onCreateMember(data)
  }

  const kpis = useMemo(() => ({
    total:    members.length,
    active:   members.filter(m=>m.active).length,
    pics:     members.filter(m=>['PIC','CAP'].includes(m.role) && m.active).length,
    fos:      members.filter(m=>m.role==='FO' && m.active).length,
  }), [members])

  // Vue détail membre
  if (selectedId) return (
    <MemberDetail
      crewId={selectedId}
      onBack={() => setSelectedId(null)}
    />
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ color:'#F1F5F9', fontWeight:900, fontSize:20, margin:0 }}>
            👨‍✈️ Crew Management
          </h2>
          <p style={{ color:P.blueLight, fontSize:11, margin:'4px 0 0' }}>
            {members.length} membres · Qualifications · FTL temps réel
          </p>
        </div>
        <button onClick={() => { setEditMember(null); setShowModal(true) }}
          style={{ padding:'9px 20px', borderRadius:10, fontSize:12, fontWeight:700,
            cursor:'pointer', border:'none', backgroundColor:P.gold, color:P.navy }}>
          + Nouveau membre
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Total équipage', value:kpis.total,  color:'#F1F5F9' },
          { label:'Actifs',         value:kpis.active, color:P.green   },
          { label:'PIC / CAP',      value:kpis.pics,   color:P.gold    },
          { label:'FO',             value:kpis.fos,    color:P.blueLight },
        ].map(k => (
          <Card key={k.label} style={{ textAlign:'center', padding:'14px 10px' }}>
            <div style={{ fontSize:26, fontWeight:900, color:k.color, lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:10, color:P.blueLight, marginTop:5, textTransform:'uppercase',
              letterSpacing:'0.06em' }}>{k.label}</div>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input
          placeholder="🔍 Rechercher…"
          value={search} onChange={e=>setSearch(e.target.value)}
          style={{ padding:'7px 12px', borderRadius:8, border:`1px solid ${P.blue}`,
            backgroundColor:P.navy, color:'#F1F5F9', fontSize:12, width:200 }}/>

        {[{ val:'all',label:'Tous rôles'},{ val:'PIC',label:'PIC'},{ val:'FO',label:'FO'},{ val:'CAP',label:'CAP'}].map(r => (
          <button key={r.val} onClick={()=>setFilterRole(r.val)}
            style={{ padding:'5px 14px', borderRadius:7, fontSize:11, fontWeight:600,
              cursor:'pointer', border:'none',
              backgroundColor: filterRole===r.val?'rgba(59,130,246,0.18)':'rgba(30,58,95,0.35)',
              color:           filterRole===r.val?'#93C5FD':P.slate }}>
            {r.label}
          </button>
        ))}

        <div style={{ width:1, height:18, backgroundColor:P.blue }}/>

        {[{val:'all',label:'Tous'},{ val:'active',label:'Actifs'},{ val:'inactive',label:'Inactifs'}].map(s => (
          <button key={s.val} onClick={()=>setFilterStatus(s.val)}
            style={{ padding:'5px 14px', borderRadius:7, fontSize:11, fontWeight:600,
              cursor:'pointer', border:'none',
              backgroundColor: filterStatus===s.val?'rgba(59,130,246,0.18)':'rgba(30,58,95,0.35)',
              color:           filterStatus===s.val?'#93C5FD':P.slate }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Liste membres */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:P.blueLight }}>⟳ Chargement…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, color:P.blueLight }}>
          Aucun membre trouvé
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
          {filtered.map(member => (
            <MemberCard
              key={member.id}
              member={member}
              onSelect={() => setSelectedId(member.id)}
              onEdit={() => { setEditMember(member); setShowModal(true) }}
              onToggleActive={() => onToggleActive(member.id, !member.active)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <MemberModal
          member={editMember}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditMember(null) }}
        />
      )}

      {/* Erreur */}
      {error && (
        <div style={{
          position:'fixed', bottom:20, right:20, zIndex:300,
          padding:'10px 16px', borderRadius:10,
          backgroundColor:P.redBg, border:`1px solid ${P.red}40`,
          display:'flex', gap:12, alignItems:'center',
        }}>
          <span style={{ fontSize:12, color:'#F87171' }}>⚠ {error}</span>
          <button onClick={clearError} style={{ fontSize:12, color:'#F87171',
            cursor:'pointer', background:'none', border:'none' }}>✕</button>
        </div>
      )}
    </div>
  )
}

// ── Card membre ───────────────────────────────────────────────────────────────
const MemberCard = ({ member, onSelect, onEdit, onToggleActive }) => {
  const statusColor = !member.active ? P.slate : P.green  // simplifié (FTL au détail)

  return (
    <Card style={{ cursor:'pointer', transition:'all 0.15s',
      ':hover':{ borderColor: P.blueLight } }}
      >
      <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
        <Avatar member={member} size={44} statusColor={statusColor}/>

        <div style={{ flex:1, minWidth:0 }} onClick={onSelect}>
          <div style={{ fontWeight:800, fontSize:15, color:'#F1F5F9',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {member.first_name} {member.last_name}
          </div>
          <div style={{ fontSize:11, color:P.blueLight, marginTop:2 }}>
            {member.email || 'Email non renseigné'}
          </div>
          <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
            <Badge label={member.role}         color={P.gold}      bg={P.goldMid}/>
            <Badge label={member.base||'TFFJ'} color={P.blueLight}/>
            {!member.active && <Badge label="Inactif" color={P.slate} bg="rgba(71,85,105,0.2)"/>}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <button onClick={e=>{e.stopPropagation();onEdit()}}
            style={{ padding:'4px 10px', borderRadius:7, fontSize:10, fontWeight:600,
              cursor:'pointer', border:'none', backgroundColor:P.goldMid, color:P.gold }}>
            ✏
          </button>
          <button onClick={e=>{e.stopPropagation();onToggleActive()}}
            style={{ padding:'4px 10px', borderRadius:7, fontSize:10, fontWeight:600,
              cursor:'pointer', border:'none',
              backgroundColor: member.active?P.redBg:'rgba(74,222,128,0.1)',
              color:           member.active?P.red:P.green }}>
            {member.active ? '⊘' : '✓'}
          </button>
        </div>
      </div>

      {/* Indicateur hire date */}
      {member.hire_date && (
        <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${P.blue}40`,
          fontSize:10, color:P.slate }}>
          Embauché le {new Date(member.hire_date).toLocaleDateString('fr-FR')}
          {member.employee_id && <span style={{ marginLeft:10, color:P.blueLight }}>#{member.employee_id}</span>}
        </div>
      )}
    </Card>
  )
}
