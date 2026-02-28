/**
 * @fileoverview Calcul FTL (Flight Time Limitations) — SKYBH
 * Règles DGAC/OPS 1 Sous-partie Q (petites compagnies, VFR inter-îles)
 *
 * RÈGLES IMPLÉMENTÉES :
 *   • Max duty time  : 13h / jour calendaire
 *   • Max flight time: 8h  / jour calendaire
 *   • Max FT         : 60h / 7 jours glissants
 *   • Max FT         : 190h / 28 jours glissants
 *   • Rest minimum   : 10h entre deux duties
 *
 * Fonctions PURES — aucune dépendance externe, testables avec Vitest.
 */

// ── Constantes réglementaires ─────────────────────────────────────────────────
export const FTL_LIMITS = {
  MAX_DUTY_HOURS_PER_DAY:    13,
  MAX_FLIGHT_HOURS_PER_DAY:   8,
  MAX_FLIGHT_HOURS_7_DAYS:   60,
  MAX_FLIGHT_HOURS_28_DAYS: 190,
  MIN_REST_HOURS:            10,
}

// Seuils de risque (% de la limite atteinte)
export const RISK_THRESHOLDS = {
  WARNING:  0.80,   // ≥ 80% → warning
  CRITICAL: 0.95,   // ≥ 95% → critical
}

/**
 * @typedef {Object} FtlLog
 * @property {string}  crew_id
 * @property {string}  flight_id
 * @property {string}  date            — ISO date 'YYYY-MM-DD'
 * @property {number}  duty_start_utc  — timestamp ms (début duty)
 * @property {number}  duty_end_utc    — timestamp ms (fin duty)
 * @property {number}  flight_minutes  — durée vol en minutes
 */

/**
 * @typedef {Object} FtlResult
 * @property {boolean}  compliant
 * @property {string}   reason         — vide si compliant
 * @property {'ok'|'warning'|'critical'|'violation'}  risk_level
 * @property {Object}   counters        — détail des compteurs
 * @property {Object}   margins         — marge restante par limite
 */

// ── Helpers ──────────────────────────────────────────────────────────────────
const msToHours = ms => ms / 3_600_000
const minToHours = min => min / 60

/**
 * Filtre les logs dans une fenêtre glissante à partir d'une date de référence
 * @param {FtlLog[]} logs
 * @param {Date}     refDate   — date de référence (date du vol à valider)
 * @param {number}   days      — fenêtre en jours (7 ou 28)
 * @returns {FtlLog[]}
 */
const logsInWindow = (logs, refDate, days) => {
  const windowStart = new Date(refDate)
  windowStart.setDate(windowStart.getDate() - days + 1)
  windowStart.setHours(0, 0, 0, 0)
  return logs.filter(l => {
    const d = new Date(l.date)
    return d >= windowStart && d <= refDate
  })
}

/**
 * Somme les flight_minutes d'un tableau de logs
 */
const sumFlightMinutes = logs =>
  logs.reduce((acc, l) => acc + (l.flight_minutes || 0), 0)

/**
 * Somme le duty time (ms) d'un tableau de logs
 */
const sumDutyMs = logs =>
  logs.reduce((acc, l) => {
    if (!l.duty_start_utc || !l.duty_end_utc) return acc
    return acc + Math.max(0, l.duty_end_utc - l.duty_start_utc)
  }, 0)

/**
 * Calcule le niveau de risque selon le ratio utilisé/limite
 */
const riskLevel = (used, limit) => {
  const ratio = used / limit
  if (ratio >= 1)                      return 'violation'
  if (ratio >= RISK_THRESHOLDS.CRITICAL) return 'critical'
  if (ratio >= RISK_THRESHOLDS.WARNING)  return 'warning'
  return 'ok'
}

// ── Fonction principale ───────────────────────────────────────────────────────
/**
 * Calcule la conformité FTL pour un membre d'équipage à une date donnée
 *
 * @param {FtlLog[]} existingLogs   — logs existants du membre (Firestore)
 * @param {Date}     flightDate     — date du vol à valider
 * @param {number}   newFlightMin   — durée du vol projeté (minutes)
 * @param {number}   newDutyStart   — timestamp ms début duty projeté
 * @param {number}   newDutyEnd     — timestamp ms fin duty projetée
 * @returns {FtlResult}
 */
export const calculateFTL = (
  existingLogs,
  flightDate,
  newFlightMin  = 0,
  newDutyStart  = null,
  newDutyEnd    = null,
) => {
  const date = flightDate instanceof Date ? flightDate : new Date(flightDate)
  const dateStr = date.toISOString().slice(0, 10)

  // Logs du jour (hors vol projeté)
  const logsToday = existingLogs.filter(l => l.date === dateStr)
  // Logs 7j (incluant aujourd'hui)
  const logs7d  = logsInWindow(existingLogs, date, 7)
  // Logs 28j
  const logs28d = logsInWindow(existingLogs, date, 28)

  // ── Compteurs existants ──────────────────────────────────────────────────
  const dutyMsToday       = sumDutyMs(logsToday)
  const flightMinToday    = sumFlightMinutes(logsToday)
  const flightMin7d       = sumFlightMinutes(logs7d)
  const flightMin28d      = sumFlightMinutes(logs28d)

  // ── Compteurs projetés (après ajout du nouveau vol) ──────────────────────
  const projDutyMsToday    = dutyMsToday + (
    newDutyStart && newDutyEnd ? Math.max(0, newDutyEnd - newDutyStart) : 0
  )
  const projFlightMinToday = flightMinToday + newFlightMin
  const projFlightMin7d    = flightMin7d    + newFlightMin
  const projFlightMin28d   = flightMin28d   + newFlightMin

  // ── Conversions en heures ────────────────────────────────────────────────
  const projDutyH   = msToHours(projDutyMsToday)
  const projFtDay   = minToHours(projFlightMinToday)
  const projFt7d    = minToHours(projFlightMin7d)
  const projFt28d   = minToHours(projFlightMin28d)

  // ── Vérification repos minimum ────────────────────────────────────────────
  let restViolation = null
  if (newDutyStart) {
    // Trouver le dernier duty_end avant ce vol
    const prevLogs = existingLogs
      .filter(l => l.duty_end_utc && l.duty_end_utc < newDutyStart)
      .sort((a, b) => b.duty_end_utc - a.duty_end_utc)
    if (prevLogs.length > 0) {
      const lastEnd  = prevLogs[0].duty_end_utc
      const restHours = msToHours(newDutyStart - lastEnd)
      if (restHours < FTL_LIMITS.MIN_REST_HOURS) {
        restViolation = `Repos insuffisant : ${restHours.toFixed(1)}h (min ${FTL_LIMITS.MIN_REST_HOURS}h requis)`
      }
    }
  }

  // ── Évaluation de chaque limite ──────────────────────────────────────────
  const checks = [
    {
      id:    'duty_day',
      label: `Duty journalier`,
      used:  projDutyH,
      limit: FTL_LIMITS.MAX_DUTY_HOURS_PER_DAY,
      unit:  'h',
      msg:   `Duty journalier dépassé : ${projDutyH.toFixed(1)}h / ${FTL_LIMITS.MAX_DUTY_HOURS_PER_DAY}h max`,
    },
    {
      id:    'ft_day',
      label: 'FT journalier',
      used:  projFtDay,
      limit: FTL_LIMITS.MAX_FLIGHT_HOURS_PER_DAY,
      unit:  'h',
      msg:   `Temps de vol journalier dépassé : ${projFtDay.toFixed(1)}h / ${FTL_LIMITS.MAX_FLIGHT_HOURS_PER_DAY}h max`,
    },
    {
      id:    'ft_7d',
      label: 'FT 7 jours',
      used:  projFt7d,
      limit: FTL_LIMITS.MAX_FLIGHT_HOURS_7_DAYS,
      unit:  'h',
      msg:   `Limite 7j dépassée : ${projFt7d.toFixed(1)}h / ${FTL_LIMITS.MAX_FLIGHT_HOURS_7_DAYS}h max`,
    },
    {
      id:    'ft_28d',
      label: 'FT 28 jours',
      used:  projFt28d,
      limit: FTL_LIMITS.MAX_FLIGHT_HOURS_28_DAYS,
      unit:  'h',
      msg:   `Limite 28j dépassée : ${projFt28d.toFixed(1)}h / ${FTL_LIMITS.MAX_FLIGHT_HOURS_28_DAYS}h max`,
    },
  ]

  // Trouver le check le plus grave
  const violations = checks.filter(c => c.used >= c.limit)
  const worstRisk  = checks.reduce((worst, c) => {
    const r = riskLevel(c.used, c.limit)
    const rank = { ok:0, warning:1, critical:2, violation:3 }
    return rank[r] > rank[worst] ? r : worst
  }, 'ok')

  const restRisk = restViolation ? 'violation' : 'ok'
  const overallRisk = (['violation','critical','warning','ok'].find(r =>
    r === worstRisk || r === restRisk
  ))

  const reasons = [
    ...violations.map(c => c.msg),
    ...(restViolation ? [restViolation] : []),
  ]

  return {
    compliant:  reasons.length === 0,
    reason:     reasons.join(' | '),
    risk_level: overallRisk,
    counters: {
      duty_hours_today:   +projDutyH.toFixed(2),
      flight_hours_today: +projFtDay.toFixed(2),
      flight_hours_7d:    +projFt7d.toFixed(2),
      flight_hours_28d:   +projFt28d.toFixed(2),
    },
    margins: {
      duty_today_remaining:   +(FTL_LIMITS.MAX_DUTY_HOURS_PER_DAY    - projDutyH).toFixed(2),
      ft_today_remaining:     +(FTL_LIMITS.MAX_FLIGHT_HOURS_PER_DAY  - projFtDay).toFixed(2),
      ft_7d_remaining:        +(FTL_LIMITS.MAX_FLIGHT_HOURS_7_DAYS   - projFt7d).toFixed(2),
      ft_28d_remaining:       +(FTL_LIMITS.MAX_FLIGHT_HOURS_28_DAYS  - projFt28d).toFixed(2),
    },
    checks: checks.map(c => ({
      ...c,
      risk: riskLevel(c.used, c.limit),
      pct:  Math.min(100, Math.round((c.used / c.limit) * 100)),
    })),
  }
}

// ── Validation qualifications ─────────────────────────────────────────────────
/**
 * @typedef {Object} Qualification
 * @property {string} type_rating      — ex: 'C208', 'BN2'
 * @property {string} medical_expiry   — ISO date
 * @property {string} license_expiry   — ISO date
 * @property {string} last_sim_check   — ISO date
 */

/**
 * Retourne le statut d'une date d'expiration
 * @param {string} expiryDate  — ISO date
 * @param {Date}   refDate     — date de référence (date du vol)
 * @returns {'valid'|'expiring'|'expired'}
 */
export const getExpiryStatus = (expiryDate, refDate = new Date()) => {
  if (!expiryDate) return 'expired'
  const exp  = new Date(expiryDate)
  const ref  = refDate instanceof Date ? refDate : new Date(refDate)
  const diffDays = (exp - ref) / 86_400_000
  if (diffDays < 0)   return 'expired'
  if (diffDays <= 30) return 'expiring'
  return 'valid'
}

/**
 * Vérifie si le dernier sim check est valide (< 6 mois)
 */
export const getSimCheckStatus = (lastSimCheck, refDate = new Date()) => {
  if (!lastSimCheck) return 'expired'
  const last = new Date(lastSimCheck)
  const ref  = refDate instanceof Date ? refDate : new Date(refDate)
  const diffDays = (ref - last) / 86_400_000
  if (diffDays > 180) return 'expired'
  if (diffDays > 150) return 'expiring'  // 30j avant expiration
  return 'valid'
}

/**
 * Valide un membre d'équipage pour un vol donné
 * Combine FTL + qualifications
 *
 * @param {Object}      member        — crew_member Firestore
 * @param {Qualification} quals       — crew_qualifications Firestore
 * @param {FtlLog[]}    ftlLogs       — logs FTL existants
 * @param {Object}      flight        — vol Firestore
 * @returns {{ valid: boolean, blockers: string[], warnings: string[] }}
 */
export const validateCrewForFlight = (member, quals, ftlLogs, flight) => {
  const blockers = []
  const warnings = []

  if (!member) { blockers.push('Membre introuvable'); return { valid:false, blockers, warnings } }
  if (!member.active) { blockers.push('Membre inactif'); return { valid:false, blockers, warnings } }

  const flightDate = flight?.departure_time
    ? (flight.departure_time?.toDate ? flight.departure_time.toDate() : new Date(flight.departure_time))
    : new Date()

  // ── Qualifications ───────────────────────────────────────────────────────
  if (quals) {
    // Medical
    const medStatus = getExpiryStatus(quals.medical_expiry, flightDate)
    if (medStatus === 'expired')   blockers.push(`Visite médicale expirée (${quals.medical_expiry})`)
    else if (medStatus === 'expiring') warnings.push(`Visite médicale expire bientôt (${quals.medical_expiry})`)

    // Licence
    const licStatus = getExpiryStatus(quals.license_expiry, flightDate)
    if (licStatus === 'expired')   blockers.push(`Licence expirée (${quals.license_expiry})`)
    else if (licStatus === 'expiring') warnings.push(`Licence expire bientôt (${quals.license_expiry})`)

    // Sim check
    const simStatus = getSimCheckStatus(quals.last_sim_check, flightDate)
    if (simStatus === 'expired')   blockers.push(`Sim check expiré (dernier: ${quals.last_sim_check || 'jamais'})`)
    else if (simStatus === 'expiring') warnings.push(`Sim check à renouveler bientôt`)

    // Type rating
    if (flight?.aircraft_type && quals.type_ratings) {
      const hasRating = quals.type_ratings.includes(flight.aircraft_type)
      if (!hasRating) blockers.push(`Qualification type manquante : ${flight.aircraft_type}`)
    }
  } else {
    blockers.push('Qualifications non renseignées')
  }

  // ── FTL ─────────────────────────────────────────────────────────────────
  if (ftlLogs && flight) {
    const dep = flight.departure_time?.toDate ? flight.departure_time.toDate() : new Date(flight.departure_time)
    const arr = flight.arrival_time?.toDate   ? flight.arrival_time.toDate()   : new Date(flight.arrival_time)
    const flightMin = arr && dep ? Math.round((arr - dep) / 60000) : 0

    // Duty estimée = vol + 1h brief + 30min post-vol
    const dutyStart = dep ? new Date(dep.getTime() - 60 * 60000) : null
    const dutyEnd   = arr ? new Date(arr.getTime() + 30 * 60000) : null

    const ftl = calculateFTL(
      ftlLogs,
      flightDate,
      flightMin,
      dutyStart?.getTime() || null,
      dutyEnd?.getTime()   || null,
    )

    if (!ftl.compliant) {
      blockers.push(`FTL non conforme : ${ftl.reason}`)
    } else if (ftl.risk_level === 'critical') {
      warnings.push(`FTL critique : ${ftl.checks.filter(c=>c.risk==='critical').map(c=>`${c.label} ${c.pct}%`).join(', ')}`)
    } else if (ftl.risk_level === 'warning') {
      warnings.push(`FTL proche limite : ${ftl.checks.filter(c=>c.risk==='warning').map(c=>`${c.label} ${c.pct}%`).join(', ')}`)
    }
  }

  return {
    valid:    blockers.length === 0,
    blockers,
    warnings,
  }
}

/**
 * Calcule le statut global d'un membre (pour badge UI)
 * @returns {'ok'|'warning'|'critical'|'inactive'}
 */
export const crewMemberStatus = (member, quals, ftlResult = null) => {
  if (!member?.active) return 'inactive'

  const now = new Date()
  const hasExpired =
    getExpiryStatus(quals?.medical_expiry, now)  === 'expired' ||
    getExpiryStatus(quals?.license_expiry, now)   === 'expired' ||
    getSimCheckStatus(quals?.last_sim_check, now)  === 'expired'

  if (hasExpired) return 'critical'

  const hasExpiring =
    getExpiryStatus(quals?.medical_expiry, now)  === 'expiring' ||
    getExpiryStatus(quals?.license_expiry, now)   === 'expiring' ||
    getSimCheckStatus(quals?.last_sim_check, now)  === 'expiring'

  if (hasExpiring || ftlResult?.risk_level === 'critical') return 'warning'
  if (ftlResult?.risk_level === 'warning') return 'warning'

  return 'ok'
}
