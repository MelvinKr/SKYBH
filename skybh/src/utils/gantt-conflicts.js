/**
 * @fileoverview Moteur de détection de conflits Gantt — SKYBH
 * Entièrement pur (pas d'imports Firebase), testable isolément.
 */

/** @typedef {'overlap'|'turnaround'|'unavailable'|'ftl'|'overload'} ConflictType */

/**
 * @typedef {Object} Conflict
 * @property {string}       flightId
 * @property {ConflictType} type
 * @property {'warning'|'critical'} severity
 * @property {string}       message
 * @property {string[]}     relatedFlightIds
 * @property {Suggestion[]} suggestions
 */

/**
 * @typedef {Object} Suggestion
 * @property {'swap_aircraft'|'delay_flight'|'cancel_flight'} action
 * @property {string} label
 * @property {Object} payload
 */

/**
 * @typedef {Object} PlanningRules
 * @property {number} min_turnaround_minutes
 * @property {number} buffer_minutes
 * @property {number} max_daily_cycles
 * @property {number} max_crew_duty_minutes
 */

/** Règles par défaut */
export const DEFAULT_RULES = {
  min_turnaround_minutes: 20,
  buffer_minutes: 5,
  max_daily_cycles: 8,
  max_crew_duty_minutes: 900,
}

const toMs  = ts => ts?.toDate ? ts.toDate().getTime() : new Date(ts).getTime()
const toMin = ms => Math.round(ms / 60000)

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Retourne tous les vols d'un avion, triés par heure de départ
 */
const flightsByAircraft = (flights, registration) =>
  flights
    .filter(f => f.aircraft === registration && f.status !== 'cancelled')
    .sort((a, b) => toMs(a.departure_time) - toMs(b.departure_time))

/**
 * Retourne tous les vols d'un pilote, triés par heure de départ
 */
const flightsByPilot = (flights, pilot) =>
  flights
    .filter(f => f.pilot === pilot && f.status !== 'cancelled')
    .sort((a, b) => toMs(a.departure_time) - toMs(b.departure_time))

/**
 * Trouver des avions disponibles pour un créneau donné
 */
const findAvailableAircraft = (flights, fleet, depMs, arrMs, excludeReg) => {
  const minTurnaround = DEFAULT_RULES.min_turnaround_minutes * 60000
  return fleet.filter(ac => {
    if (ac.registration === excludeReg) return false
    if (ac.status === 'maintenance') return false
    const acFlights = flightsByAircraft(flights, ac.registration)
    return acFlights.every(f => {
      const fDep = toMs(f.departure_time)
      const fArr = toMs(f.arrival_time)
      // Pas de chevauchement ni turnaround insuffisant
      return arrMs + minTurnaround <= fDep || fArr + minTurnaround <= depMs
    })
  })
}

// ── Détecteurs de conflits ────────────────────────────────────────────────────

/**
 * Détecte les chevauchements (un avion sur 2 vols en même temps)
 */
export const detectOverlaps = (flights) => {
  const conflicts = []
  const byAc = {}
  flights.filter(f => f.status !== 'cancelled').forEach(f => {
    if (!byAc[f.aircraft]) byAc[f.aircraft] = []
    byAc[f.aircraft].push(f)
  })

  for (const [reg, acFlights] of Object.entries(byAc)) {
    const sorted = acFlights.sort((a, b) => toMs(a.departure_time) - toMs(b.departure_time))
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i]
      const next = sorted[i + 1]
      const currArr = toMs(curr.arrival_time)
      const nextDep = toMs(next.departure_time)
      if (nextDep < currArr) {
        conflicts.push({
          flightId: next.id,
          type: 'overlap',
          severity: 'critical',
          message: `${next.flight_number} chevauche ${curr.flight_number} sur ${reg}`,
          relatedFlightIds: [curr.id],
          suggestions: [],
        })
      }
    }
  }
  return conflicts
}

/**
 * Détecte les rotations insuffisantes (turnaround < min_turnaround)
 */
export const detectTurnaroundViolations = (flights, rules = DEFAULT_RULES) => {
  const conflicts = []
  const minMs = (rules.min_turnaround_minutes + rules.buffer_minutes) * 60000
  const warnMs = rules.min_turnaround_minutes * 60000

  const byAc = {}
  flights.filter(f => f.status !== 'cancelled').forEach(f => {
    if (!byAc[f.aircraft]) byAc[f.aircraft] = []
    byAc[f.aircraft].push(f)
  })

  for (const [reg, acFlights] of Object.entries(byAc)) {
    const sorted = acFlights.sort((a, b) => toMs(a.departure_time) - toMs(b.departure_time))
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i]
      const next = sorted[i + 1]
      const gap = toMs(next.departure_time) - toMs(curr.arrival_time)
      if (gap < 0) continue // déjà détecté comme overlap

      if (gap < minMs) {
        const gapMin = toMin(gap)
        const isCritical = gap < warnMs
        conflicts.push({
          flightId: next.id,
          type: 'turnaround',
          severity: isCritical ? 'critical' : 'warning',
          message: `Rotation ${reg} trop courte : ${gapMin} min (min. ${rules.min_turnaround_minutes} min)`,
          relatedFlightIds: [curr.id],
          suggestions: [
            {
              action: 'delay_flight',
              label: `Décaler ${next.flight_number} de ${rules.min_turnaround_minutes + rules.buffer_minutes - gapMin} min`,
              payload: {
                flightId: next.id,
                delayMinutes: rules.min_turnaround_minutes + rules.buffer_minutes - gapMin,
              },
            },
          ],
        })
      }
    }
  }
  return conflicts
}

/**
 * Détecte les vols assignés à un avion en maintenance
 */
export const detectUnavailableAircraft = (flights, fleet) => {
  const conflicts = []
  const maintenanceAc = new Set(
    fleet.filter(ac => ac.status === 'maintenance').map(ac => ac.registration)
  )

  flights
    .filter(f => f.status !== 'cancelled' && maintenanceAc.has(f.aircraft))
    .forEach(f => {
      conflicts.push({
        flightId: f.id,
        type: 'unavailable',
        severity: 'critical',
        message: `${f.aircraft} est en maintenance — vol ${f.flight_number} impossible`,
        relatedFlightIds: [],
        suggestions: [],
      })
    })

  return conflicts
}

/**
 * Détecte les dépassements FTL (temps de service équipage)
 */
export const detectFTLViolations = (flights, rules = DEFAULT_RULES) => {
  const conflicts = []
  const byPilot = {}
  flights.filter(f => f.status !== 'cancelled' && f.pilot).forEach(f => {
    if (!byPilot[f.pilot]) byPilot[f.pilot] = []
    byPilot[f.pilot].push(f)
  })

  for (const [pilot, pilotFlights] of Object.entries(byPilot)) {
    const sorted = pilotFlights.sort((a, b) => toMs(a.departure_time) - toMs(b.departure_time))
    if (sorted.length < 2) continue
    const firstDep = toMs(sorted[0].departure_time)
    const lastArr  = toMs(sorted[sorted.length - 1].arrival_time)
    const dutyMin  = toMin(lastArr - firstDep)

    if (dutyMin > rules.max_crew_duty_minutes) {
      conflicts.push({
        flightId: sorted[sorted.length - 1].id,
        type: 'ftl',
        severity: 'critical',
        message: `FTL dépassé pour ${pilot} : ${dutyMin} min (max ${rules.max_crew_duty_minutes} min)`,
        relatedFlightIds: sorted.slice(0, -1).map(f => f.id),
        suggestions: [],
      })
    } else if (dutyMin > rules.max_crew_duty_minutes * 0.9) {
      conflicts.push({
        flightId: sorted[sorted.length - 1].id,
        type: 'ftl',
        severity: 'warning',
        message: `FTL à ${Math.round((dutyMin / rules.max_crew_duty_minutes) * 100)}% pour ${pilot} (${dutyMin} min)`,
        relatedFlightIds: sorted.slice(0, -1).map(f => f.id),
        suggestions: [],
      })
    }
  }
  return conflicts
}

/**
 * Détecte les avions surcharges (> max_daily_cycles)
 */
export const detectOverload = (flights, rules = DEFAULT_RULES) => {
  const conflicts = []
  const byAc = {}
  flights.filter(f => f.status !== 'cancelled').forEach(f => {
    if (!byAc[f.aircraft]) byAc[f.aircraft] = []
    byAc[f.aircraft].push(f)
  })

  for (const [reg, acFlights] of Object.entries(byAc)) {
    if (acFlights.length > rules.max_daily_cycles) {
      conflicts.push({
        flightId: acFlights[acFlights.length - 1].id,
        type: 'overload',
        severity: 'warning',
        message: `${reg} : ${acFlights.length} cycles aujourd'hui (max ${rules.max_daily_cycles})`,
        relatedFlightIds: acFlights.slice(0, -1).map(f => f.id),
        suggestions: [],
      })
    }
  }
  return conflicts
}

/**
 * Enrichit les suggestions avec les avions disponibles
 */
export const enrichSuggestionsWithFleet = (conflicts, flights, fleet) => {
  return conflicts.map(conflict => {
    if (conflict.type !== 'unavailable' && conflict.type !== 'turnaround') return conflict

    const flight = flights.find(f => f.id === conflict.flightId)
    if (!flight) return conflict

    const depMs = toMs(flight.departure_time)
    const arrMs = toMs(flight.arrival_time)
    const available = findAvailableAircraft(flights, fleet, depMs, arrMs, flight.aircraft)

    const swapSuggestions = available.slice(0, 2).map(ac => ({
      action: 'swap_aircraft',
      label: `Réassigner à ${ac.registration}`,
      payload: { flightId: flight.id, newAircraftRegistration: ac.registration },
    }))

    return {
      ...conflict,
      suggestions: [...swapSuggestions, ...conflict.suggestions],
    }
  })
}

/**
 * Lance l'analyse complète et retourne tous les conflits
 * @param {Object[]} flights
 * @param {Object[]} fleet
 * @param {PlanningRules} rules
 * @returns {Conflict[]}
 */
export const analyzeAllConflicts = (flights, fleet, rules = DEFAULT_RULES) => {
  const raw = [
    ...detectOverlaps(flights),
    ...detectTurnaroundViolations(flights, rules),
    ...detectUnavailableAircraft(flights, fleet),
    ...detectFTLViolations(flights, rules),
    ...detectOverload(flights, rules),
  ]
  return enrichSuggestionsWithFleet(raw, flights, fleet)
}

/**
 * Construit un index flightId → Conflict[] pour accès O(1) dans le Gantt
 * @param {Conflict[]} conflicts
 * @returns {Record<string, Conflict[]>}
 */
export const buildConflictIndex = (conflicts) => {
  const index = {}
  for (const c of conflicts) {
    if (!index[c.flightId]) index[c.flightId] = []
    index[c.flightId].push(c)
  }
  return index
}

/**
 * Calcule la heatmap de charge par heure et par avion
 * Retourne un tableau { hour, aircraft, load } normalisé 0–1
 */
export const computeHeatmap = (flights, fleet, ganttStart = 6, ganttEnd = 19) => {
  const cells = []
  for (const ac of fleet) {
    for (let h = ganttStart; h < ganttEnd; h++) {
      const slotStart = h * 60
      const slotEnd   = (h + 1) * 60
      const occupied  = flights
        .filter(f => f.aircraft === ac.registration && f.status !== 'cancelled')
        .reduce((sum, f) => {
          const dep = f.departure_time?.toDate ? f.departure_time.toDate() : new Date(f.departure_time)
          const arr = f.arrival_time?.toDate   ? f.arrival_time.toDate()   : new Date(f.arrival_time)
          const depMin = dep.getHours() * 60 + dep.getMinutes()
          const arrMin = arr.getHours() * 60 + arr.getMinutes()
          const overlap = Math.max(0, Math.min(arrMin, slotEnd) - Math.max(depMin, slotStart))
          return sum + overlap
        }, 0)
      cells.push({ hour: h, aircraft: ac.registration, load: Math.min(1, occupied / 60) })
    }
  }
  return cells
}
