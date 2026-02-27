/**
 * @fileoverview Moteur de maintenance prédictive SKYBH
 * Projections consommation · Dates seuils · Fenêtres optimales
 * Entièrement pur — pas d'imports Firebase, testable isolément.
 */

export const LIMITS = {
  engine:   { warning: 50,  critical: 20  },
  airframe: { warning: 100, critical: 30  },
}

const ROUTE_NM = {
  'TFFJ-TFFG': 11, 'TFFG-TFFJ': 11, 'TFFJ-TNCM': 11, 'TNCM-TFFJ': 11,
  'TFFJ-TQPF': 35, 'TQPF-TFFJ': 35, 'TFFG-TNCM': 3,  'TNCM-TFFG': 3,
  'TFFJ-TFFR': 120,'TFFR-TFFJ': 120,
}
const CRUISE_SPEED = { 'C208': 175, 'BN2': 140, default: 150 }

const toDate = ts => ts?.toDate ? ts.toDate() : new Date(ts)

export const estimateFlightHours = (origin, dest, aircraftType = 'default') => {
  const nm    = ROUTE_NM[`${origin}-${dest}`]
  const speed = CRUISE_SPEED[aircraftType] || CRUISE_SPEED.default
  if (!nm) return 0.5
  return nm / speed + 0.15
}

export const computeActualConsumption = (flights, registration, days = 30) => {
  const cutoff = Date.now() - days * 86400000
  const recent = flights.filter(f =>
    f.aircraft === registration && f.status !== 'cancelled' &&
    toDate(f.departure_time).getTime() >= cutoff
  )
  const totalHours = recent.reduce((sum, f) => {
    const dep = toDate(f.departure_time); const arr = toDate(f.arrival_time)
    return sum + Math.max(0, (arr - dep) / 3600000)
  }, 0)
  return { avgHoursPerDay: totalHours / days, totalHours, flightCount: recent.length }
}

export const projectPotentials = (aircraft, upcomingFlights, avgHoursPerDay, projectionDays = 60) => {
  const engineRemaining   = (aircraft.engine_limit   || 3600)  - (aircraft.engine_hours  || 0)
  const airframeRemaining = (aircraft.airframe_limit  || 20000) - (aircraft.airframe_hours || 0)
  const today = new Date(); today.setHours(0,0,0,0)
  const days  = []
  let cumulEngine = 0, cumulAirframe = 0
  let engineWarningDate = null, engineThresholdDate = null
  let airframeWarningDate = null, airframeCritDate = null

  for (let i = 0; i <= projectionDays; i++) {
    const date = new Date(today.getTime() + i * 86400000)
    const dayFlights = upcomingFlights.filter(f => {
      if (f.aircraft !== aircraft.registration || f.status === 'cancelled') return false
      return toDate(f.departure_time).toDateString() === date.toDateString()
    })
    const plannedHours = dayFlights.reduce((sum, f) => {
      const dep = toDate(f.departure_time); const arr = toDate(f.arrival_time)
      return sum + Math.max(0, (arr - dep) / 3600000)
    }, 0)
    const hoursToday = dayFlights.length > 0 ? plannedHours : (i > 0 ? avgHoursPerDay : 0)
    cumulEngine += hoursToday; cumulAirframe += hoursToday
    const engineLeft = engineRemaining - cumulEngine
    const airframeLeft = airframeRemaining - cumulAirframe
    if (!engineWarningDate   && engineLeft   <= LIMITS.engine.warning)   engineWarningDate   = new Date(date)
    if (!engineThresholdDate && engineLeft   <= LIMITS.engine.critical)  engineThresholdDate = new Date(date)
    if (!airframeWarningDate && airframeLeft <= LIMITS.airframe.warning) airframeWarningDate = new Date(date)
    if (!airframeCritDate    && airframeLeft <= LIMITS.airframe.critical)airframeCritDate    = new Date(date)
    days.push({
      date: new Date(date), dayIndex: i,
      engineLeft: Math.max(0, engineLeft), airframeLeft: Math.max(0, airframeLeft),
      hoursFlown: hoursToday, cumulEngine, cumulAirframe,
      hasPlannedFlights: dayFlights.length > 0,
    })
  }
  return {
    days, engineWarningDate, engineThresholdDate, airframeWarningDate, airframeCritDate,
    engineRemaining, airframeRemaining,
    currentEnginePercent:   Math.round(((aircraft.engine_hours  || 0) / (aircraft.engine_limit   || 3600))  * 100),
    currentAirframePercent: Math.round(((aircraft.airframe_hours || 0) / (aircraft.airframe_limit || 20000)) * 100),
  }
}

export const findMaintenanceWindows = (aircraft, flights, durationDays = 2, urgencyDays = 30) => {
  const today = new Date(); today.setHours(0,0,0,0)
  const windows = []
  for (let i = 1; i <= urgencyDays - durationDays; i++) {
    const start = new Date(today.getTime() + i * 86400000)
    const end   = new Date(start.getTime() + durationDays * 86400000)
    const conflictFlights = flights.filter(f => {
      if (f.aircraft !== aircraft.registration || f.status === 'cancelled') return false
      const dep = toDate(f.departure_time)
      return dep >= start && dep < end
    })
    const score = Math.max(0, 10 - conflictFlights.length * 2)
    if (score >= 6) {
      windows.push({
        id: `win-${aircraft.registration}-${i}`,
        aircraft_registration: aircraft.registration,
        aircraft_id: aircraft.id,
        suggested_start: start, suggested_end: end,
        duration_hours: durationDays * 8,
        conflicts_count: conflictFlights.length,
        affected_flights: conflictFlights.map(f => f.flight_number || f.id),
        score,
        priority: score >= 9 ? 'low' : score >= 7 ? 'medium' : 'high',
        status: 'suggested',
        reason: `Maintenance ${aircraft.registration}`,
      })
    }
  }
  return windows.sort((a, b) => b.score - a.score).slice(0, 5)
}

export const computeHealthScore = (aircraft) => {
  const ep = (aircraft.engine_hours   || 0) / (aircraft.engine_limit   || 3600)
  const ap = (aircraft.airframe_hours || 0) / (aircraft.airframe_limit || 20000)
  const w  = Math.max(ep, ap)
  if (w >= 0.99) return 0;  if (w >= 0.97) return 15; if (w >= 0.94) return 35
  if (w >= 0.90) return 55; if (w >= 0.80) return 72; if (w >= 0.65) return 85
  return 95
}

export const formatThresholdDate = (date) => {
  if (!date) return null
  const today = new Date(); today.setHours(0,0,0,0)
  const diffDays = Math.round((date - today) / 86400000)
  const fmtDate  = date.toLocaleDateString('fr-FR', { day:'numeric', month:'short' })
  if (diffDays <= 0)  return { label:'Dépassé !',            color:'#EF4444', days: diffDays }
  if (diffDays <= 7)  return { label:`${fmtDate} (${diffDays}j)`, color:'#EF4444', days: diffDays }
  if (diffDays <= 21) return { label:`${fmtDate} (${diffDays}j)`, color:'#F59E0B', days: diffDays }
  return                     { label:`${fmtDate} (${diffDays}j)`, color:'#4ADE80', days: diffDays }
}

export const buildMaintenanceCalendar = (aircraftList, maintenanceRecords, avgByAircraft = {}) => {
  const events = []
  maintenanceRecords.filter(r => ['planned','in_progress'].includes(r.status)).forEach(r => {
    events.push({
      id: r.id, date: toDate(r.performed_at), type: 'planned',
      label: r.title, aircraft: r.aircraft_registration,
      category: r.category, color: '#3B82F6',
    })
  })
  aircraftList.forEach(ac => {
    const engineRem   = (ac.engine_limit   || 3600)  - (ac.engine_hours   || 0)
    const airframeRem = (ac.airframe_limit  || 20000) - (ac.airframe_hours || 0)
    const avgH = avgByAircraft[ac.registration] || ac.avg_hours_per_day || 3
    if (avgH > 0) {
      if (engineRem < 200) {
        const date = new Date(Date.now() + (engineRem / avgH) * 86400000)
        events.push({ id:`eng-${ac.registration}`, date, type:'threshold',
          label:`Seuil moteur ${ac.registration}`, aircraft: ac.registration, category:'engine',
          color: engineRem <= LIMITS.engine.critical ? '#EF4444' : '#F59E0B' })
      }
      if (airframeRem < 300) {
        const date = new Date(Date.now() + (airframeRem / avgH) * 86400000)
        events.push({ id:`airframe-${ac.registration}`, date, type:'threshold',
          label:`Seuil cellule ${ac.registration}`, aircraft: ac.registration, category:'airframe',
          color: airframeRem <= LIMITS.airframe.critical ? '#EF4444' : '#F59E0B' })
      }
    }
  })
  return events
}
