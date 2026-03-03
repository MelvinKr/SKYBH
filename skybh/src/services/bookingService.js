import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp, onSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'

const COL = 'bookings'

/**
 * Statuts possibles d'une réservation
 * confirmed → checked_in → boarded | no_show | cancelled
 */
export const BOOKING_STATUS = {
  CONFIRMED:  'confirmed',
  CHECKED_IN: 'checked_in',
  BOARDED:    'boarded',
  NO_SHOW:    'no_show',
  CANCELLED:  'cancelled',
}

/** Récupère toutes les réservations d'un vol */
export async function getBookingsByFlight(flightId) {
  try {
    const q = query(
      collection(db, COL),
      where('flightId', '==', flightId),
      orderBy('createdAt', 'asc')
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) { throw new Error(`Réservations introuvables : ${err.message}`) }
}

/** Écoute temps réel des réservations d'un vol */
export function subscribeToFlightBookings(flightId, onData, onError) {
  const q = query(
    collection(db, COL),
    where('flightId', '==', flightId),
    orderBy('createdAt', 'asc')
  )
  return onSnapshot(q, snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}

/** Récupère les réservations d'un passager */
export async function getBookingsByPassenger(passengerId) {
  try {
    const q = query(
      collection(db, COL),
      where('passengerId', '==', passengerId),
      orderBy('createdAt', 'desc')
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) { throw new Error(`Historique passager introuvable : ${err.message}`) }
}

/** Crée une réservation */
export async function createBooking(data) {
  try {
    const ref = await addDoc(collection(db, COL), {
      flightId:      data.flightId,
      passengerId:   data.passengerId,
      status:        BOOKING_STATUS.CONFIRMED,
      baggageWeight: data.baggageWeight || 0,
      seatNumber:    data.seatNumber || null,
      ticketNumber:  data.ticketNumber || null,
      bookingSource: data.bookingSource || 'manual',
      agentId:       data.agentId,
      notes:         data.notes || '',
      checkinTime:   null,
      createdAt:     serverTimestamp(),
      updatedAt:     serverTimestamp(),
    })
    return ref.id
  } catch (err) { throw new Error(`Création réservation échouée : ${err.message}`) }
}

/** Check-in d'un passager */
export async function checkInPassenger(bookingId, agentId, { baggageWeight, seatNumber } = {}) {
  try {
    await updateDoc(doc(db, COL, bookingId), {
      status:        BOOKING_STATUS.CHECKED_IN,
      checkinTime:   serverTimestamp(),
      agentId,
      ...(baggageWeight !== undefined && { baggageWeight }),
      ...(seatNumber    !== undefined && { seatNumber }),
      updatedAt:     serverTimestamp(),
    })
  } catch (err) { throw new Error(`Check-in échoué : ${err.message}`) }
}

/** Marque un passager comme embarqué */
export async function boardPassenger(bookingId) {
  try {
    await updateDoc(doc(db, COL, bookingId), {
      status:    BOOKING_STATUS.BOARDED,
      updatedAt: serverTimestamp(),
    })
  } catch (err) { throw new Error(`Embarquement échoué : ${err.message}`) }
}

/** Marque un passager no-show */
export async function markNoShow(bookingId, agentId) {
  try {
    await updateDoc(doc(db, COL, bookingId), {
      status:    BOOKING_STATUS.NO_SHOW,
      agentId,
      updatedAt: serverTimestamp(),
    })
  } catch (err) { throw new Error(`No-show échoué : ${err.message}`) }
}

/** Annule une réservation */
export async function cancelBooking(bookingId, reason = '') {
  try {
    await updateDoc(doc(db, COL, bookingId), {
      status:          BOOKING_STATUS.CANCELLED,
      cancellationNote: reason,
      updatedAt:       serverTimestamp(),
    })
  } catch (err) { throw new Error(`Annulation échouée : ${err.message}`) }
}

/** Stats rapides pour un vol */
export async function getFlightBookingStats(flightId) {
  const bookings = await getBookingsByFlight(flightId)
  return {
    total:      bookings.length,
    confirmed:  bookings.filter(b => b.status === BOOKING_STATUS.CONFIRMED).length,
    checkedIn:  bookings.filter(b => b.status === BOOKING_STATUS.CHECKED_IN).length,
    boarded:    bookings.filter(b => b.status === BOOKING_STATUS.BOARDED).length,
    noShow:     bookings.filter(b => b.status === BOOKING_STATUS.NO_SHOW).length,
    cancelled:  bookings.filter(b => b.status === BOOKING_STATUS.CANCELLED).length,
    totalBaggageWeight: bookings
      .filter(b => [BOOKING_STATUS.CHECKED_IN, BOOKING_STATUS.BOARDED].includes(b.status))
      .reduce((sum, b) => sum + (b.baggageWeight || 0), 0),
  }
}