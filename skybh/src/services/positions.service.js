/**
 * @fileoverview Service positions Live Map — SKYBH
 * Firestore temps réel · Simulation ADS-B · OpenSky Network API
 */
import {
  collection, doc, setDoc, onSnapshot,
  serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { simulateTrack, AIRPORTS } from '../utils/map-utils'

const POS_COL   = 'aircraft_positions'
const TRACK_COL = 'flight_tracks'

// ── Positions temps réel ───────────────────────────────────────────────────────
export const subscribeToPositions = (callback) => {
  return onSnapshot(collection(db, POS_COL),
    snap => callback(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
    err  => console.error('[Positions] subscribe:', err)
  )
}

export const updatePosition = async (registration, posData) => {
  try {
    await setDoc(doc(db, POS_COL, registration), {
      ...posData,
      registration,
      updated_at: serverTimestamp(),
    }, { merge:true })
  } catch (e) { throw new Error(`Erreur mise à jour position : ${e.message}`) }
}

// ── Trajectoires ───────────────────────────────────────────────────────────────
export const subscribeToTrack = (flightId, callback) => {
  return onSnapshot(doc(db, TRACK_COL, flightId),
    snap => callback(snap.exists() ? { id:snap.id, ...snap.data() } : null),
    err  => console.error('[Track] subscribe:', err)
  )
}

export const saveTrack = async (flightId, registration, points) => {
  try {
    await setDoc(doc(db, TRACK_COL, flightId), {
      flight_id:    flightId,
      registration,
      points,
      updated_at:   serverTimestamp(),
    }, { merge:true })
  } catch (e) { throw new Error(`Erreur sauvegarde track : ${e.message}`) }
}

// ── Simulation ADS-B ───────────────────────────────────────────────────────────
/**
 * Génère et enregistre des positions simulées pour les vols en cours
 * @param {Object[]} flights  — vols Firestore
 * @param {Object[]} fleet    — avions Firestore
 */
export const simulateFlightPositions = async (flights, fleet) => {
  const inFlight = flights.filter(f => f.status === 'in_flight')

  for (const flight of inFlight) {
    if (!flight.origin || !flight.destination || !flight.aircraft) continue

    const dep   = flight.departure_time?.toDate?.() || new Date(flight.departure_time)
    const arr   = flight.arrival_time?.toDate?.()   || new Date(flight.arrival_time)
    const now   = new Date()

    if (now < dep || now > arr) continue

    const track  = simulateTrack(flight.origin, flight.destination, dep, 170)
    if (!track.length) continue

    // Interpolation position actuelle
    const totalMs = arr - dep
    const elapsedMs = now - dep
    const f = Math.min(1, Math.max(0, elapsedMs / totalMs))
    const idx = Math.floor(f * (track.length - 1))
    const pt  = track[Math.min(idx, track.length - 1)]

    await updatePosition(flight.aircraft, {
      lat:           pt.lat,
      lng:           pt.lng,
      altitude_ft:   pt.altitude_ft,
      heading:       pt.heading,
      speed_kts:     pt.speed_kts,
      vertical_speed_fpm: 0,
      flight_id:     flight.id,
      flight_number: flight.flight_number,
      origin:        flight.origin,
      destination:   flight.destination,
      status:        'airborne',
      source:        'simulated',
    })

    // Sauvegarde track complet
    await saveTrack(flight.id, flight.aircraft, track)
  }

  // Avions au sol (non en vol)
  const onGroundAc = fleet.filter(ac =>
    !inFlight.some(f => f.aircraft === ac.registration) &&
    ['available','maintenance'].includes(ac.status)
  )
  for (const ac of onGroundAc) {
    const base = AIRPORTS.TFFJ
    await updatePosition(ac.registration, {
      lat: base.lat + (Math.random()-0.5)*0.002,
      lng: base.lng + (Math.random()-0.5)*0.002,
      altitude_ft:   0,
      heading:       Math.floor(Math.random()*360),
      speed_kts:     0,
      vertical_speed_fpm: 0,
      flight_id:     null,
      flight_number: null,
      origin:        null,
      destination:   null,
      status:        'ground',
      source:        'simulated',
    })
  }
}

// ── OpenSky Network API (ADS-B réel, gratuit, sans clé) ───────────────────────
const OPENSKY_URL = 'https://opensky-network.org/api/states/all'

/**
 * Récupère les positions réelles depuis OpenSky dans la bounding box SBH
 * Bounding box : lat 15.5–19.0, lng -65.0–-60.5
 * Filtre sur les immatriculations SBH Commuter (F-OSxx)
 */
export const fetchOpenSkyPositions = async (registrations = []) => {
  try {
    // Bounding box Caraïbes nord autour de Saint-Barth
    const params = new URLSearchParams({
      lamin: '15.5', lamax: '19.0',
      lomin: '-65.0', lomax: '-60.5',
    })
    const res = await fetch(`${OPENSKY_URL}?${params}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`)
    const data = await res.json()

    if (!data.states?.length) return []

    // Colonnes OpenSky : [icao24, callsign, origin_country, time_position,
    //   last_contact, longitude, latitude, baro_altitude, on_ground,
    //   velocity, true_track, vertical_rate, sensors, geo_altitude,
    //   squawk, spi, position_source]
    return data.states
      .filter(s => s[5] !== null && s[6] !== null) // doit avoir lat/lng
      .map(s => ({
        icao24:        s[0],
        callsign:      s[1]?.trim() || '',
        lng:           s[5],
        lat:           s[6],
        altitude_ft:   s[7] ? Math.round(s[7] * 3.28084) : 0,  // m→ft
        on_ground:     s[8],
        speed_kts:     s[9] ? Math.round(s[9] * 1.94384) : 0,  // m/s→kts
        heading:       s[10] || 0,
        vertical_speed_fpm: s[11] ? Math.round(s[11] * 196.85) : 0,
        status:        s[8] ? 'ground' : 'airborne',
        source:        'opensky',
        updated_at:    new Date(s[4] * 1000),
      }))
  } catch (e) {
    console.warn('[OpenSky] Fetch failed:', e.message)
    return []
  }
}

/**
 * Tente de matcher une position OpenSky avec une immatriculation SBH Commuter
 * via le callsign (ex: "PV801" → vol SBH)
 */
export const matchOpenSkyToFleet = (openSkyStates, flights) => {
  const matched = []
  for (const state of openSkyStates) {
    const cs = state.callsign.replace(/\s/g,'').toUpperCase()
    const flight = flights.find(f =>
      f.flight_number && f.flight_number.replace(/\s/g,'').toUpperCase() === cs
    )
    if (flight) {
      matched.push({ ...state, flight_id: flight.id, flight_number: flight.flight_number,
        aircraft: flight.aircraft, origin: flight.origin, destination: flight.destination })
    }
  }
  return matched
}
