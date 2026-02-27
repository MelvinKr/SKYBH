import { db } from './firebase'
import {
  collection,
  query,
  where,
  Timestamp,
  onSnapshot,
  orderBy,
} from 'firebase/firestore'

/**
 * @typedef {Object} Flight
 * @property {string} id
 * @property {string} flight_number
 * @property {string} origin      // ICAO ex: TFFJ
 * @property {string} destination // ICAO ex: TFFG
 * @property {Timestamp} departure_time
 * @property {Timestamp} arrival_time
 * @property {string} aircraft_id
 * @property {string} pilot_id
 * @property {'scheduled' | 'boarding' | 'in_flight' | 'landed' | 'cancelled'} status
 * @property {number} pax_count
 * @property {number} max_pax
 */

const COLLECTION = 'flight_plans'

/**
 * Écoute les vols du jour en temps réel
 * @param {(flights: Flight[]) => void} callback
 * @returns {() => void} unsubscribe
 */
export function subscribeTodayFlights(callback) {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)

  const q = query(
    collection(db, COLLECTION),
    where('departure_time', '>=', Timestamp.fromDate(startOfDay)),
    where('departure_time', '<=', Timestamp.fromDate(endOfDay)),
    orderBy('departure_time', 'asc')
  )

  return onSnapshot(q, (snapshot) => {
    const flights = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    callback(flights)
  })
}

/**
 * Calcule les KPIs du jour
 * @param {Flight[]} flights
 */
export function computeDayKPIs(flights) {
  const total = flights.length
  const completed = flights.filter((f) => f.status === 'landed').length
  const cancelled = flights.filter((f) => f.status === 'cancelled').length
  const inFlight = flights.filter((f) => f.status === 'in_flight').length
  const totalPax = flights.reduce((sum, f) => sum + (f.pax_count || 0), 0)
  const totalSeats = flights.reduce((sum, f) => sum + (f.max_pax || 0), 0)
  const fillRate = totalSeats > 0 ? Math.round((totalPax / totalSeats) * 100) : 0

  return { total, completed, cancelled, inFlight, totalPax, fillRate }
}

/** Noms des aéroports */
export const AIRPORTS = {
  TFFJ: 'Saint-Barth',
  TFFG: 'Saint-Martin (Grand Case)',
  TNCE: 'Sint Maarten (Princess J.)',
  TQPF: 'Anguilla',
}

/** Couleurs statut vol */
export const FLIGHT_STATUS_COLORS = {
  scheduled: 'text-blue-400',
  boarding: 'text-amber-400',
  in_flight: 'text-green-400',
  landed: 'text-gray-400',
  cancelled: 'text-red-400',
}

export const FLIGHT_STATUS_LABELS = {
  scheduled: 'Programmé',
  boarding: 'Embarquement',
  in_flight: 'En vol',
  landed: 'Atterri',
  cancelled: 'Annulé',
}