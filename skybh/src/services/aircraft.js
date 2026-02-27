import { db } from './firebase'
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'

/** @typedef {'available' | 'in_flight' | 'maintenance'} AircraftStatus */

/**
 * @typedef {Object} Aircraft
 * @property {string} id
 * @property {string} registration
 * @property {string} type
 * @property {number} seats
 * @property {AircraftStatus} status
 * @property {number} airframe_hours
 * @property {number} engine_hours
 * @property {number} airframe_limit
 * @property {number} engine_limit
 * @property {string} [notes]
 */

const COLLECTION = 'aircraft_fleet'

/**
 * Écoute la flotte en temps réel
 * @param {(aircraft: Aircraft[]) => void} callback
 * @returns {() => void} unsubscribe
 */
export function subscribeToFleet(callback) {
  return onSnapshot(collection(db, COLLECTION), (snapshot) => {
    const fleet = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    callback(fleet)
  })
}

/**
 * Met à jour le statut d'un avion
 * @param {string} id
 * @param {AircraftStatus} status
 */
export async function updateAircraftStatus(id, status) {
  try {
    await updateDoc(doc(db, COLLECTION, id), {
      status,
      last_updated: serverTimestamp(),
    })
  } catch (error) {
    throw new Error(`Erreur mise à jour statut: ${error.message}`)
  }
}

/**
 * Calcule le pourcentage de potentiel restant
 * @param {number} current
 * @param {number} limit
 * @returns {number} pourcentage 0-100
 */
export function getPotentialPercent(current, limit) {
  return Math.max(0, Math.round(((limit - current) / limit) * 100))
}

/**
 * Retourne le niveau d'alerte selon le potentiel restant
 * @param {number} percent
 * @returns {'ok' | 'warning' | 'critical'}
 */
export function getAlertLevel(percent) {
  if (percent <= 10) return 'critical'
  if (percent <= 20) return 'warning'
  return 'ok'
}