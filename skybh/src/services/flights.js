import { db } from './firebase'
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, orderBy, query, where, Timestamp
} from 'firebase/firestore'

const COL = 'flight_plans'

export function subscribeTodayFlights(callback) {
  const start = new Date(); start.setHours(0,0,0,0)
  const end = new Date(); end.setHours(23,59,59,999)
  return onSnapshot(
    query(collection(db, COL),
      where('departure_time', '>=', Timestamp.fromDate(start)),
      where('departure_time', '<=', Timestamp.fromDate(end)),
      orderBy('departure_time', 'asc')
    ),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  )
}

export async function addFlight(data) {
  try {
    const ref = await addDoc(collection(db, COL), {
      ...data, created_at: serverTimestamp(), last_updated: serverTimestamp()
    })
    return ref.id
  } catch (e) { throw new Error(`Erreur création vol: ${e.message}`) }
}

export async function updateFlight(id, data) {
  try {
    await updateDoc(doc(db, COL, id), { ...data, last_updated: serverTimestamp() })
  } catch (e) { throw new Error(`Erreur mise à jour vol: ${e.message}`) }
}

export async function deleteFlight(id) {
  try { await deleteDoc(doc(db, COL, id)) }
  catch (e) { throw new Error(`Erreur suppression vol: ${e.message}`) }
}

export async function duplicateFlight(flight) {
  const { id, created_at, last_updated, ...data } = flight
  const dep = data.departure_time.toDate ? data.departure_time.toDate() : new Date(data.departure_time)
  const arr = data.arrival_time.toDate ? data.arrival_time.toDate() : new Date(data.arrival_time)
  dep.setDate(dep.getDate() + 1)
  arr.setDate(arr.getDate() + 1)
  return addFlight({
    ...data,
    departure_time: Timestamp.fromDate(dep),
    arrival_time: Timestamp.fromDate(arr),
    status: 'scheduled',
  })
}

export function computeDayKPIs(flights) {
  const total = flights.length
  const completed = flights.filter(f => f.status === 'landed').length
  const cancelled = flights.filter(f => f.status === 'cancelled').length
  const inFlight = flights.filter(f => f.status === 'in_flight').length
  const totalPax = flights.reduce((s, f) => s + (f.pax_count || 0), 0)
  const totalSeats = flights.reduce((s, f) => s + (f.max_pax || 0), 0)
  const fillRate = totalSeats > 0 ? Math.round((totalPax / totalSeats) * 100) : 0
  return { total, completed, cancelled, inFlight, totalPax, fillRate }
}

export const AIRPORTS_FULL = {
  TFFJ: { name: 'Saint-Barthélemy', short: 'SBH' },
  TFFG: { name: 'St-Martin Grand Case', short: 'SFG' },
  TNCM: { name: 'Sint-Maarten Juliana', short: 'SXM' },
  TQPF: { name: 'Anguilla', short: 'AXA' },
  TFFR: { name: 'Guadeloupe Pôle Caraïbes', short: 'PTP' },
}

export const FLIGHT_STATUS_COLORS = {
  scheduled: 'text-blue-400', boarding: 'text-amber-400',
  in_flight: 'text-green-400', landed: 'text-gray-400', cancelled: 'text-red-400',
}

export const FLIGHT_STATUS_LABELS = {
  scheduled: 'Programmé', boarding: 'Embarquement',
  in_flight: 'En vol', landed: 'Atterri', cancelled: 'Annulé',
}