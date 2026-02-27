import { db } from './firebase'
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, orderBy, query, getDocs
} from 'firebase/firestore'

const COL = 'aircraft_fleet'

export function subscribeToFleet(callback) {
  return onSnapshot(
    query(collection(db, COL), orderBy('registration')),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  )
}

export async function addAircraft(data) {
  try {
    const ref = await addDoc(collection(db, COL), {
      ...data, created_at: serverTimestamp(), last_updated: serverTimestamp()
    })
    return ref.id
  } catch (e) { throw new Error(`Erreur ajout avion: ${e.message}`) }
}

export async function updateAircraft(id, data) {
  try {
    await updateDoc(doc(db, COL, id), { ...data, last_updated: serverTimestamp() })
  } catch (e) { throw new Error(`Erreur mise à jour: ${e.message}`) }
}

export async function deleteAircraft(id) {
  try { await deleteDoc(doc(db, COL, id)) }
  catch (e) { throw new Error(`Erreur suppression: ${e.message}`) }
}

export async function addMaintenanceRecord(aircraftId, record) {
  try {
    await addDoc(collection(db, COL, aircraftId, 'maintenance_history'), {
      ...record, created_at: serverTimestamp()
    })
  } catch (e) { throw new Error(`Erreur maintenance: ${e.message}`) }
}

export async function getMaintenanceHistory(aircraftId) {
  try {
    const snap = await getDocs(
      query(collection(db, COL, aircraftId, 'maintenance_history'), orderBy('created_at', 'desc'))
    )
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (e) { throw new Error(`Erreur historique: ${e.message}`) }
}

export function getPotentialPercent(current, limit) {
  return Math.max(0, Math.round(((limit - current) / limit) * 100))
}

export function getAlertLevel(percent) {
  if (percent <= 10) return 'critical'
  if (percent <= 20) return 'warning'
  return 'ok'
}