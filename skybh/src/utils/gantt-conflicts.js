/**
 * @fileoverview Analyse des conflits planning SKYBH
 * Détecte : chevauchements, rotations courtes, limites FTL, maintenance
 * Génère des suggestions de résolution actionnables
 */

const MIN_TURNAROUND = 20 // minutes minimum entre 2 vols sur le même avion

// ── Helpers temps ─────────────────────────────────────────────────────────────

const toDate = ts => {
  if (!ts) return new Date(0)
  if (ts?.toDate) return ts.toDate()
  if (ts?.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

const diffMinutes = (a, b) => Math.round((b - a) / 60000)

const fmtTime = d => {
  try {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } catch { return '--:--' }
}

const addMinutes = (date, mins) => {
  const d = new Date(date)
  d.setMinutes(d.getMinutes() + mins)
  return d
}

// ── Analyse principale ────────────────────────────────────────────────────────

/**
 * Analyse tous les conflits d'une liste de vols
 * @param {Array} flights - vols à analyser
 * @param {Array} fleet   - flotte disponible
 * @param {Object} rules  - règles de planification
 * @returns {Array} liste de conflits avec suggestions
 */
export function analyzeAllConflicts(flights = [], fleet = [], rules = {}) {
  if (!flights.length) return []

  // Utiliser les règles dynamiques si dispo, sinon valeurs par défaut
  const minTurnaround = rules?.min_turnaround_minutes ?? MIN_TURNAROUND
  const bufferMins    = rules?.buffer_minutes ?? 0

  const allConflicts = []

  // Regrouper les vols par avion
  const byAircraft = {}
  for (const f of flights) {
    const reg = f.aircraft || f.registration
    if (!reg) continue
    if (!byAircraft[reg]) byAircraft[reg] = []
    byAircraft[reg].push(f)
  }

  // ── 1. Chevauchements et rotations courtes ────────────────────────────────
  for (const [reg, aircraftFlights] of Object.entries(byAircraft)) {
    // Trier par heure de départ
    const sorted = [...aircraftFlights].sort((a, b) =>
      toDate(a.departure_time) - toDate(b.departure_time)
    )

    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i]
      const next = sorted[i + 1]

      if (curr.status === 'cancelled' || next.status === 'cancelled') continue

      const currDep = toDate(curr.departure_time)
      const currArr = toDate(curr.arrival_time)
      const nextDep = toDate(next.departure_time)
      const nextArr = toDate(next.arrival_time)

      const gapMinutes = diffMinutes(currArr, nextDep)

      // ── Chevauchement réel (vol suivant démarre avant que le précédent atterrisse)
      if (gapMinutes < 0) {
        const overlapMins = Math.abs(gapMinutes)
        const suggestions = []

        // Suggestion 1 : décaler le vol suivant après l'atterrissage + marge (toujours présente)
        const requiredDelay = overlapMins + minTurnaround + bufferMins
        suggestions.push({
          label: `Décaler ${next.flight_number || 'vol'} +${requiredDelay}min`,
          action: 'delay_flight',
          payload: {
            flightId: next.id,
            delayMinutes: requiredDelay,
          },
        })

        // Suggestion 2 : chercher un avion disponible pour le vol suivant
        const availableAircraft = findAvailableAircraft(next, flights, fleet, reg, minTurnaround)
        if (availableAircraft) {
          suggestions.push({
            label: `Basculer sur ${availableAircraft}`,
            action: 'swap_aircraft',
            payload: {
              flightId: next.id,
              newAircraftRegistration: availableAircraft,
            },
          })
        }

        // Suggestion 3 : décaler le vol courant en avance si possible
        if (i > 0) {
          const prevFlight = sorted[i - 1]
          const prevArr = toDate(prevFlight.arrival_time)
          const advancePossible = diffMinutes(prevArr, currDep) > minTurnaround + overlapMins
          if (advancePossible) {
            suggestions.push({
              label: `Avancer ${curr.flight_number || 'vol'} de ${overlapMins}min`,
              action: 'delay_flight',
              payload: {
                flightId: curr.id,
                delayMinutes: -overlapMins,
              },
            })
          }
        }

        allConflicts.push({
          id: `overlap-${curr.id}-${next.id}`,
          type: 'overlap',
          severity: 'critical',
          flightId: next.id,
          relatedFlightId: curr.id,
          aircraft: reg,
          message: `${next.flight_number || next.id} chevauche ${curr.flight_number || curr.id} sur ${reg} (${overlapMins}min de chevauchement)`,
          details: {
            overlapMinutes: overlapMins,
            currentArrival: fmtTime(currArr),
            nextDeparture: fmtTime(nextDep),
          },
          suggestions,
        })
      }
      // ── Rotation trop courte (gap > 0 mais < minimum)
      else if (gapMinutes < minTurnaround && gapMinutes >= 0) {
        const missingMins = minTurnaround - gapMinutes
        const suggestions = []

        suggestions.push({
          label: `Décaler ${next.flight_number || 'vol'} de +${missingMins}min`,
          action: 'delay_flight',
          payload: {
            flightId: next.id,
            delayMinutes: missingMins,
          },
        })

        const availableAircraft = findAvailableAircraft(next, flights, fleet, reg, minTurnaround)
        if (availableAircraft) {
          suggestions.push({
            label: `Basculer sur ${availableAircraft}`,
            action: 'swap_aircraft',
            payload: {
              flightId: next.id,
              newAircraftRegistration: availableAircraft,
            },
          })
        }

        allConflicts.push({
          id: `turnaround-${curr.id}-${next.id}`,
          type: 'turnaround',
          severity: 'warning',
          flightId: next.id,
          relatedFlightId: curr.id,
          aircraft: reg,
          message: `Rotation courte sur ${reg} — seulement ${gapMinutes}min entre ${curr.flight_number || curr.id} et ${next.flight_number || next.id} (min. ${minTurnaround}min)`,
          details: {
            gapMinutes,
            minRequired: MIN_TURNAROUND,
          },
          suggestions,
        })
      }
    }
  }

  // ── 2. Pilote sur deux vols simultanés ────────────────────────────────────
  const byPilot = {}
  for (const f of flights) {
    const pilot = f.pilot
    if (!pilot || f.status === 'cancelled') continue
    if (!byPilot[pilot]) byPilot[pilot] = []
    byPilot[pilot].push(f)
  }

  for (const [pilot, pilotFlights] of Object.entries(byPilot)) {
    const sorted = [...pilotFlights].sort((a, b) =>
      toDate(a.departure_time) - toDate(b.departure_time)
    )
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i]
      const next = sorted[i + 1]
      const currArr = toDate(curr.arrival_time)
      const nextDep = toDate(next.departure_time)
      if (nextDep < currArr) {
        allConflicts.push({
          id: `pilot-overlap-${curr.id}-${next.id}`,
          type: 'pilot_overlap',
          severity: 'critical',
          flightId: next.id,
          relatedFlightId: curr.id,
          pilot,
          message: `Pilote ${pilot} affecté à deux vols simultanés : ${curr.flight_number || curr.id} et ${next.flight_number || next.id}`,
          suggestions: [],
        })
      }
    }
  }

  // ── 3. Avion en maintenance planifié sur un vol ───────────────────────────
  for (const f of flights) {
    if (f.status === 'cancelled') continue
    const aircraft = fleet.find(a => a.registration === (f.aircraft || f.registration))
    if (aircraft?.status === 'maintenance') {
      const available = findAvailableAircraft(f, flights, fleet, f.aircraft || f.registration, minTurnaround)
      const suggestions = available ? [{
        label: `Remplacer par ${available}`,
        action: 'swap_aircraft',
        payload: { flightId: f.id, newAircraftRegistration: available },
      }] : []

      allConflicts.push({
        id: `maintenance-${f.id}`,
        type: 'maintenance',
        severity: 'critical',
        flightId: f.id,
        aircraft: f.aircraft || f.registration,
        message: `${f.flight_number || f.id} — avion ${f.aircraft || f.registration} est en maintenance`,
        suggestions,
      })
    }
  }

  // Dédoublonnage par id
  const seen = new Set()
  return allConflicts.filter(c => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })
}

// ── Trouver un avion disponible ───────────────────────────────────────────────

/**
 * Cherche un avion disponible pour un vol donné (pas de conflit horaire)
 * @param {Object} targetFlight - vol à réassigner
 * @param {Array}  allFlights   - tous les vols
 * @param {Array}  fleet        - flotte
 * @param {string} excludeReg   - immatriculation à exclure
 * @returns {string|null} immatriculation disponible ou null
 */
function findAvailableAircraft(targetFlight, allFlights, fleet, excludeReg, minTurnaround = MIN_TURNAROUND) {
  const dep = toDate(targetFlight.departure_time)
  const arr = toDate(targetFlight.arrival_time)

  const candidates = fleet.filter(a =>
    a.registration !== excludeReg &&
    a.status !== 'maintenance' // tout avion non en maintenance est candidat
  )

  for (const candidate of candidates) {
    const reg = candidate.registration
    const conflicting = allFlights.some(f => {
      if (f.id === targetFlight.id) return false
      if (f.status === 'cancelled') return false
      if ((f.aircraft || f.registration) !== reg) return false
      const fDep = toDate(f.departure_time)
      const fArr = toDate(f.arrival_time)
      // Chevauchement avec marge de rotation
      const fDepWithMargin = addMinutes(fDep, -minTurnaround)
      const fArrWithMargin = addMinutes(fArr, minTurnaround)
      return dep < fArrWithMargin && arr > fDepWithMargin
    })
    if (!conflicting) return reg
  }
  return null
}

// ── Index des conflits par vol ────────────────────────────────────────────────

/**
 * Construit un index {flightId: [conflicts]} pour un accès O(1)
 * @param {Array} conflicts
 * @returns {Object}
 */
export function buildConflictIndex(conflicts = []) {
  const index = {}
  for (const c of conflicts) {
    if (!index[c.flightId]) index[c.flightId] = []
    index[c.flightId].push(c)
    // Indexer aussi le vol relié pour affichage visuel
    if (c.relatedFlightId) {
      if (!index[c.relatedFlightId]) index[c.relatedFlightId] = []
      // Ne pas dupliquer le même conflit
      if (!index[c.relatedFlightId].find(x => x.id === c.id)) {
        index[c.relatedFlightId].push(c)
      }
    }
  }
  return index
}

// ── Heatmap de charge ─────────────────────────────────────────────────────────

/**
 * Calcule la charge par heure pour la heatmap
 * @param {Array}  flights
 * @param {Array}  fleet
 * @param {number} startHour
 * @param {number} endHour
 * @returns {Array} tableau {hour, count, pct}
 */
export function computeHeatmap(flights = [], fleet = [], startHour = 6, endHour = 19) {
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const maxAircraft = fleet.length || 1

  return hours.map(h => {
    const count = flights.filter(f => {
      if (f.status === 'cancelled') return false
      try {
        const dep = toDate(f.departure_time)
        const arr = toDate(f.arrival_time)
        const slotStart = new Date(dep); slotStart.setHours(h, 0, 0, 0)
        const slotEnd   = new Date(dep); slotEnd.setHours(h + 1, 0, 0, 0)
        return dep < slotEnd && arr > slotStart
      } catch { return false }
    }).length

    return {
      hour: h,
      count,
      pct: Math.min(100, Math.round((count / maxAircraft) * 100)),
    }
  })
}