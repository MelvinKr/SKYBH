/**
 * @fileoverview Calcul score fiabilité flotte — SKYBH
 * Pur, testable isolément, pas d'imports Firebase.
 */

/**
 * Poids des facteurs dans le score (total = 100)
 * Inspiré des métriques IATA OTP + DGAC
 */
const WEIGHTS = {
  potentielMoteur:   25,  // santé potentiel moteur
  potentielCellule:  20,  // santé potentiel cellule
  incidents:         25,  // historique incidents / défauts
  ponctualite:       20,  // retards causés par l'avion
  disponibilite:     10,  // temps hors service AOG/inspection
}

/**
 * Calcule le score fiabilité 0–100 d'un avion
 * @param {Object}   aircraft        — document aircraft_fleet
 * @param {Object[]} techLogs        — journal technique (30 derniers jours)
 * @param {Object[]} unavailabilities — indisponibilités (90 derniers jours)
 * @param {Object[]} flights         — vols (30 derniers jours)
 * @returns {{ score: number, breakdown: Object, trend: 'up'|'stable'|'down' }}
 */
export const computeReliabilityScore = (aircraft, techLogs = [], unavailabilities = [], flights = []) => {
  const toDate = ts => ts?.toDate ? ts.toDate() : new Date(ts)
  const now    = Date.now()
  const d30    = 30 * 86400000
  const d90    = 90 * 86400000

  // ── 1. Potentiel moteur ──────────────────────────────────────────────────
  const enginePct    = (aircraft.engine_hours  || 0) / (aircraft.engine_limit  || 3600)
  const engineScore  = Math.round(Math.max(0, (1 - enginePct) * 100))

  // ── 2. Potentiel cellule ─────────────────────────────────────────────────
  const airframePct  = (aircraft.airframe_hours || 0) / (aircraft.airframe_limit || 20000)
  const airframeScore= Math.round(Math.max(0, (1 - airframePct) * 100))

  // ── 3. Incidents (30j) ───────────────────────────────────────────────────
  const recent = techLogs.filter(l => {
    const d = toDate(l.created_at)
    return now - d.getTime() < d30
  })
  const aogCount    = recent.filter(l => l.severity === 'aog').length
  const majorCount  = recent.filter(l => l.severity === 'major').length
  const minorCount  = recent.filter(l => l.severity === 'minor').length
  const incidentPenalty = Math.min(100, aogCount * 30 + majorCount * 15 + minorCount * 5)
  const incidentScore   = Math.max(0, 100 - incidentPenalty)

  // ── 4. Ponctualité (30j) ────────────────────────────────────────────────
  const acFlights    = flights.filter(f => f.aircraft === aircraft.registration)
  const delayedFlights = acFlights.filter(f => (f.delay_minutes || 0) > 15)
  const delayRate    = acFlights.length > 0 ? delayedFlights.length / acFlights.length : 0
  const avgDelay     = delayedFlights.length > 0
    ? delayedFlights.reduce((s, f) => s + (f.delay_minutes || 0), 0) / delayedFlights.length
    : 0
  const ponctScore   = Math.max(0, Math.round(100 - delayRate * 60 - Math.min(40, avgDelay / 3)))

  // ── 5. Disponibilité (90j) ──────────────────────────────────────────────
  const recentUnavail = unavailabilities.filter(u => {
    const s = toDate(u.start_date)
    return now - s.getTime() < d90
  })
  const unavailDays = recentUnavail.reduce((sum, u) => {
    const s   = toDate(u.start_date).getTime()
    const e   = u.end_date ? toDate(u.end_date).getTime() : now
    return sum + Math.max(0, (e - s) / 86400000)
  }, 0)
  const availScore = Math.max(0, Math.round(100 - (unavailDays / 90) * 100))

  // ── Score global pondéré ─────────────────────────────────────────────────
  const score = Math.round(
    (engineScore   * WEIGHTS.potentielMoteur  / 100) +
    (airframeScore * WEIGHTS.potentielCellule / 100) +
    (incidentScore * WEIGHTS.incidents        / 100) +
    (ponctScore    * WEIGHTS.ponctualite      / 100) +
    (availScore    * WEIGHTS.disponibilite    / 100)
  )

  // ── Tendance (compare score moteur actuel vs il y a 2 semaines) ──────────
  const oldEngPct = ((aircraft.engine_hours || 0) - (aircraft.avg_hours_per_day || 3) * 14)
    / (aircraft.engine_limit || 3600)
  const oldScore  = Math.round(Math.max(0, (1 - Math.max(0, oldEngPct)) * WEIGHTS.potentielMoteur))
  const trend = score > oldScore + 2 ? 'up' : score < oldScore - 2 ? 'down' : 'stable'

  return {
    score: Math.min(100, Math.max(0, score)),
    breakdown: {
      engine:       { score: engineScore,   weight: WEIGHTS.potentielMoteur,  label: 'Potentiel moteur'  },
      airframe:     { score: airframeScore, weight: WEIGHTS.potentielCellule, label: 'Potentiel cellule' },
      incidents:    { score: incidentScore, weight: WEIGHTS.incidents,        label: 'Incidents (30j)'   },
      ponctualite:  { score: ponctScore,    weight: WEIGHTS.ponctualite,      label: 'Ponctualité (30j)' },
      disponibilite:{ score: availScore,    weight: WEIGHTS.disponibilite,    label: 'Disponibilité (90j)'},
    },
    trend,
    stats: {
      aogCount, majorCount, minorCount,
      delayRate:   Math.round(delayRate * 100),
      avgDelay:    Math.round(avgDelay),
      unavailDays: Math.round(unavailDays),
      flightCount: acFlights.length,
    },
  }
}

/**
 * Classe les avions par score décroissant
 */
export const rankFleetByReliability = (fleet, scores) =>
  [...fleet].sort((a, b) => (scores[b.registration]?.score ?? 0) - (scores[a.registration]?.score ?? 0))

/**
 * Couleur selon score
 */
export const scoreColor = (score) => {
  if (score >= 85) return '#4ADE80'
  if (score >= 65) return '#F0B429'
  if (score >= 40) return '#FB923C'
  return '#EF4444'
}

/**
 * Label selon score
 */
export const scoreLabel = (score) => {
  if (score >= 85) return 'Excellent'
  if (score >= 65) return 'Bon'
  if (score >= 40) return 'Dégradé'
  return 'Critique'
}

/**
 * Vérifie l'expiration des documents
 */
export const getDocumentStatus = (doc) => {
  if (!doc.expiry_date) return 'valid'
  const toDate = ts => ts?.toDate ? ts.toDate() : new Date(ts)
  const expiry  = toDate(doc.expiry_date)
  const daysLeft= Math.round((expiry - Date.now()) / 86400000)
  const alertDays = doc.alert_days_before || 30
  if (daysLeft < 0)          return 'expired'
  if (daysLeft <= alertDays) return 'expiring'
  return 'valid'
}

export const docStatusColor = { valid:'#4ADE80', expiring:'#F59E0B', expired:'#EF4444' }
export const docStatusLabel = { valid:'Valide', expiring:'Expire bientôt', expired:'Expiré' }
