/**
 * @fileoverview Service positions Live Map — SKYBH v2
 * Fix : simulation active sur tous statuts (pas seulement 'in_flight')
 */
import {
  collection, doc, setDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { simulateTrack, AIRPORTS, distanceNm } from '../utils/map-utils'

const POS_COL   = 'aircraft_positions'
const TRACK_COL = 'flight_tracks'

// ── Positions temps réel ───────────────────────────────────────────────────────
export const subscribeToPositions = (callback) =>
  onSnapshot(
    collection(db, POS_COL),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error('[Positions]', err)
  )

export const updatePosition = async (registration, posData) => {
  try {
    await setDoc(doc(db, POS_COL, registration), {
      ...posData, registration, updated_at: serverTimestamp(),
    }, { merge: true })
  } catch(e) { throw new Error(`Erreur position: ${e.message}`) }
}

// ── Trajectoires ───────────────────────────────────────────────────────────────
export const subscribeToTrack = (flightId, callback) =>
  onSnapshot(
    doc(db, TRACK_COL, flightId),
    snap => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    err  => console.error('[Track]', err)
  )

export const saveTrack = async (flightId, registration, points) => {
  try {
    await setDoc(doc(db, TRACK_COL, flightId), {
      flight_id: flightId, registration, points, updated_at: serverTimestamp(),
    }, { merge: true })
  } catch(e) { throw new Error(`Erreur track: ${e.message}`) }
}

// ── Helpers temps ──────────────────────────────────────────────────────────────
const toDate = ts => {
  if (!ts) return null
  if (ts?.toDate) return ts.toDate()
  return new Date(ts)
}

/**
 * Simulation ADS-B — CORRIGÉE
 *
 * Problème original : seuls les vols status='in_flight' étaient simulés.
 * En POC, les vols Firestore ont souvent status='scheduled'/'programmed'.
 *
 * Fix : on simule tous les vols dont la fenêtre horaire inclut maintenant (now ± 30min)
 * pour garantir des avions visibles sur la carte en démo.
 */
export const simulateFlightPositions = async (flights, fleet) => {
  const now = new Date()

  // Vols actifs : in_flight OU dans la fenêtre temporelle (±30min autour de now)
  const activeFlights = flights.filter(f => {
    if (!f.origin || !f.destination || !f.aircraft) return false
    if (f.status === 'cancelled') return false

    const dep = toDate(f.departure_time)
    const arr = toDate(f.arrival_time)
    if (!dep || !arr) return false

    // In_flight explicite OU fenêtre horaire couvrant maintenant
    const windowStart = new Date(dep.getTime() - 30 * 60000)
    const windowEnd   = new Date(arr.getTime() + 30 * 60000)
    return f.status === 'in_flight' || (now >= windowStart && now <= windowEnd)
  })

  // Si aucun vol actif en POC → simuler les 2 prochains vols programmés pour demo
  let toSimulate = activeFlights
  if (toSimulate.length === 0) {
    const upcoming = flights
      .filter(f => f.origin && f.destination && f.aircraft && f.status !== 'cancelled')
      .sort((a, b) => {
        const da = toDate(a.departure_time), db2 = toDate(b.departure_time)
        return (da?.getTime() || 0) - (db2?.getTime() || 0)
      })
      .slice(0, 2)
    toSimulate = upcoming
  }

  for (const flight of toSimulate) {
    const dep = toDate(flight.departure_time) || new Date(now.getTime() - 20 * 60000)
    const arr = toDate(flight.arrival_time)   || new Date(now.getTime() + 20 * 60000)

    const track = simulateTrack(flight.origin, flight.destination, dep, 170)
    if (!track.length) continue

    // Position actuelle par interpolation sur le track
    const totalMs   = Math.max(arr - dep, 1)
    const elapsedMs = now - dep
    const f         = Math.min(1, Math.max(0, elapsedMs / totalMs))
    const idx       = Math.min(Math.floor(f * (track.length - 1)), track.length - 1)
    const pt        = track[idx]

    await updatePosition(flight.aircraft, {
      lat:                pt.lat,
      lng:                pt.lng,
      altitude_ft:        pt.altitude_ft,
      heading:            pt.heading,
      speed_kts:          pt.speed_kts,
      vertical_speed_fpm: 0,
      flight_id:          flight.id,
      flight_number:      flight.flight_number,
      origin:             flight.origin,
      destination:        flight.destination,
      status:             f > 0 && f < 1 ? 'airborne' : 'ground',
      source:             'simulated',
    })

    await saveTrack(flight.id, flight.aircraft, track)
  }

  // Avions au sol (pas en vol simulé)
  const simulatedRegs = new Set(toSimulate.map(f => f.aircraft))
  const groundAc = fleet.filter(ac =>
    ac.registration && !simulatedRegs.has(ac.registration)
  )

  for (const ac of groundAc) {
    const base = AIRPORTS.TFFJ
    // Légère dispersion aléatoire autour de TFFJ (parking)
    const seed = ac.registration.charCodeAt(ac.registration.length - 1) / 100
    await updatePosition(ac.registration, {
      lat:                base.lat + (seed - 0.5) * 0.003,
      lng:                base.lng + (seed - 0.5) * 0.004,
      altitude_ft:        0,
      heading:            Math.round(seed * 360),
      speed_kts:          0,
      vertical_speed_fpm: 0,
      flight_id:          null,
      flight_number:      null,
      origin:             null,
      destination:        null,
      status:             'ground',
      source:             'simulated',
    })
  }
}

// ── OpenSky Network ────────────────────────────────────────────────────────────
export const fetchOpenSkyPositions = async () => {
  try {
    const params = new URLSearchParams({
      lamin:'17.0', lamax:'18.8', lomin:'-64.0', lomax:'-61.5',
    })
    const res = await fetch(
      `https://opensky-network.org/api/states/all?${params}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`)
    const data = await res.json()
    return (data.states || [])
      .filter(s => s[5] !== null && s[6] !== null)
      .map(s => ({
        icao24:             s[0],
        callsign:           s[1]?.trim() || '',
        lng:                s[5],
        lat:                s[6],
        altitude_ft:        s[7] ? Math.round(s[7] * 3.28084) : 0,
        on_ground:          s[8],
        speed_kts:          s[9] ? Math.round(s[9] * 1.94384) : 0,
        heading:            s[10] || 0,
        vertical_speed_fpm: s[11] ? Math.round(s[11] * 196.85) : 0,
        status:             s[8] ? 'ground' : 'airborne',
        source:             'opensky',
        updated_at:         new Date(s[4] * 1000),
      }))
  } catch(e) {
    console.warn('[OpenSky]', e.message)
    return []
  }
}

export const matchOpenSkyToFleet = (states, flights) =>
  states.reduce((acc, s) => {
    const cs = s.callsign.replace(/\s/g,'').toUpperCase()
    const fl = flights.find(f =>
      f.flight_number?.replace(/\s/g,'').toUpperCase() === cs
    )
    if (fl) acc.push({ ...s, flight_id:fl.id, flight_number:fl.flight_number,
      aircraft:fl.aircraft, origin:fl.origin, destination:fl.destination })
    return acc
  }, [])