/**
 * @fileoverview Calcul OTP (On-Time Performance) — SKYBH
 * Pur, testable isolément, pas d'imports Firebase.
 */

const toDate = ts => ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null)

// Seuils IATA standard
export const OTP_THRESHOLD_MIN = 15   // retard > 15min = vol non-OTP
export const DELAY_CODES = {
  weather:   { label:'Météo',            icon:'🌧', color:'#60A5FA' },
  technical: { label:'Technique',        icon:'⚙️', color:'#F87171' },
  crew:      { label:'Équipage',         icon:'👨‍✈️', color:'#F0B429' },
  atc:       { label:'ATC / espace',     icon:'📡', color:'#A5B4FC' },
  pax:       { label:'Passagers',        icon:'👥', color:'#FB923C' },
  other:     { label:'Autre',            icon:'❓', color:'#94A3B8' },
}

/**
 * Calcule le statut OTP d'un vol individuel
 */
export const getFlightOTPStatus = (flight) => {
  if (flight.status === 'cancelled') return { status:'cancelled', delayMin:null, label:'Annulé',   color:'#EF4444' }
  const delay = flight.delay_minutes || 0
  if (delay > OTP_THRESHOLD_MIN)     return { status:'delayed',   delayMin:delay, label:`+${delay}min`, color:'#F59E0B' }
  return                                    { status:'on_time',   delayMin:delay, label:'À l\'heure', color:'#4ADE80' }
}

/**
 * Calcule l'OTP global d'un ensemble de vols
 * @returns {{ rate: number, onTime: number, delayed: number, cancelled: number, avgDelay: number }}
 */
export const computeOTP = (flights) => {
  if (!flights.length) return { rate:100, onTime:0, delayed:0, cancelled:0, avgDelay:0, total:0 }
  const done      = flights.filter(f => ['landed','cancelled'].includes(f.status) || f.delay_minutes != null)
  const cancelled = done.filter(f => f.status === 'cancelled').length
  const delayed   = done.filter(f => f.status !== 'cancelled' && (f.delay_minutes||0) > OTP_THRESHOLD_MIN).length
  const onTime    = done.length - cancelled - delayed
  const delayedFlights = done.filter(f => (f.delay_minutes||0) > OTP_THRESHOLD_MIN)
  const avgDelay  = delayedFlights.length
    ? Math.round(delayedFlights.reduce((s,f) => s+(f.delay_minutes||0),0) / delayedFlights.length)
    : 0
  const rate = done.length > 0 ? Math.round((onTime / done.length) * 100) : 100
  return { rate, onTime, delayed, cancelled, avgDelay, total: done.length }
}

/**
 * OTP par route (origine→destination)
 */
export const computeOTPByRoute = (flights) => {
  const byRoute = {}
  flights.forEach(f => {
    const key = `${f.origin}→${f.destination}`
    if (!byRoute[key]) byRoute[key] = []
    byRoute[key].push(f)
  })
  const result = {}
  Object.entries(byRoute).forEach(([route, fs]) => {
    result[route] = { route, ...computeOTP(fs), flights: fs.length }
  })
  return Object.values(result).sort((a,b) => b.flights - a.flights)
}

/**
 * OTP par avion
 */
export const computeOTPByAircraft = (flights) => {
  const byAc = {}
  flights.filter(f => f.aircraft).forEach(f => {
    if (!byAc[f.aircraft]) byAc[f.aircraft] = []
    byAc[f.aircraft].push(f)
  })
  const result = {}
  Object.entries(byAc).forEach(([reg, fs]) => {
    result[reg] = { aircraft:reg, ...computeOTP(fs) }
  })
  return result
}

/**
 * Distribution des causes de retard
 */
export const computeDelayCauses = (delays) => {
  const counts = {}
  delays.forEach(d => {
    const c = d.reason_code || 'other'
    counts[c] = (counts[c]||0) + 1
  })
  const total = delays.length || 1
  return Object.entries(counts).map(([code, count]) => ({
    code, count,
    pct: Math.round(count/total*100),
    ...DELAY_CODES[code] || DELAY_CODES.other,
  })).sort((a,b) => b.count - a.count)
}

/**
 * Couleur OTP selon taux
 */
export const otpColor = (rate) => {
  if (rate >= 90) return '#4ADE80'
  if (rate >= 75) return '#F0B429'
  return '#EF4444'
}

/**
 * Calcul W&B simplifié pour petits avions inter-îles
 * Basé sur C208 / BN2 Islander
 */
export const computeWB = (passengers, aircraft) => {
  // Poids de base avion (kg)
  const basicWeight = aircraft?.basic_weight || 2145   // C208B vide
  const maxTOW      = aircraft?.max_tow       || 3969   // C208B MTOW
  const fuelWeight  = aircraft?.fuel_weight   || 400    // carburant standard

  const paxWeight   = passengers.reduce((s,p) => s + (p.weight_kg||80) + (p.baggage_kg||10), 0)
  const totalWeight = basicWeight + fuelWeight + paxWeight
  const margin      = maxTOW - totalWeight
  const loadPct     = Math.round((totalWeight / maxTOW) * 100)

  return {
    basicWeight, fuelWeight, paxWeight, totalWeight,
    maxTOW, margin,
    loadPct,
    status: margin < 0 ? 'over' : margin < 50 ? 'critical' : margin < 150 ? 'warning' : 'ok',
    statusColor: margin < 0 ? '#EF4444' : margin < 50 ? '#F87171' : margin < 150 ? '#F59E0B' : '#4ADE80',
  }
}

/**
 * Checklist dispatch par défaut — C208 / BN2
 */
export const DEFAULT_CHECKLIST = [
  // Météo
  { id:'wx_metar',    label:'METAR départ et destination consultés',    category:'weather', blocking:true  },
  { id:'wx_taf',      label:'TAF valide pour la durée du vol',          category:'weather', blocking:true  },
  { id:'wx_sigmet',   label:'Aucun SIGMET actif sur la route',          category:'weather', blocking:false },
  { id:'wx_vmc',      label:'Conditions VMC confirmées',                category:'weather', blocking:true  },
  // Avion
  { id:'ac_tech',     label:'Carnet de route signé / aucune limitation',category:'aircraft',blocking:true  },
  { id:'ac_fuel',     label:'Carburant vérifié et sufficient',          category:'aircraft',blocking:true  },
  { id:'ac_weight',   label:'W&B dans les limites',                     category:'aircraft',blocking:true  },
  { id:'ac_maint',    label:'Aucune maintenance ouverte (AOG)',         category:'aircraft',blocking:true  },
  // Équipage
  { id:'crew_fit',    label:'Équipage apte (FTL, médicale)',            category:'crew',    blocking:true  },
  { id:'crew_brief',  label:'Briefing équipage effectué',               category:'crew',    blocking:true  },
  // Documents
  { id:'doc_arc',     label:'ARC en cours de validité',                 category:'docs',    blocking:true  },
  { id:'doc_ins',     label:'Assurance valide',                         category:'docs',    blocking:true  },
  { id:'doc_radio',   label:'Licence radio à bord',                     category:'docs',    blocking:false },
  // Passagers
  { id:'pax_manifest',label:'Manifeste passagers finalisé',             category:'pax',     blocking:true  },
  { id:'pax_brief',   label:'Briefing sécurité passagers effectué',     category:'pax',     blocking:true  },
  { id:'pax_wb',      label:'Poids & centrage dans limites',            category:'pax',     blocking:true  },
  // Ops
  { id:'ops_slot',    label:'Créneau départ confirmé',                  category:'ops',     blocking:false },
  { id:'ops_notam',   label:'NOTAMs consultés (TFFJ, TFFG, TQPF)',     category:'ops',     blocking:false },
  { id:'ops_plan',    label:'Plan de vol déposé (si requis)',           category:'ops',     blocking:false },
]

export const CHECKLIST_CATEGORIES = {
  weather:  { label:'Météo',        icon:'🌤', color:'#60A5FA' },
  aircraft: { label:'Avion',        icon:'✈️', color:'#F0B429' },
  crew:     { label:'Équipage',     icon:'👨‍✈️', color:'#A5B4FC' },
  docs:     { label:'Documents',    icon:'📄', color:'#34D399' },
  pax:      { label:'Passagers',    icon:'👥', color:'#FB923C' },
  ops:      { label:'Opérations',   icon:'📡', color:'#94A3B8' },
}
