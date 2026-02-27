/**
 * @fileoverview Service Firestore — Journal technique SKYBH
 * Collection: aircraft_tech_logs
 */
import {
  collection, doc, addDoc, updateDoc, onSnapshot,
  query, where, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

const COL = 'aircraft_tech_logs'

export const subscribeToTechLogs = (registration, callback) => {
  const q = registration
    ? query(collection(db, COL), where('aircraft_registration','==', registration), orderBy('created_at','desc'))
    : query(collection(db, COL), orderBy('created_at','desc'))
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
    err  => console.error('[TechLog] subscribe:', err)
  )
}

export const subscribeToAllTechLogs = cb => subscribeToTechLogs(null, cb)

export const addTechLog = async (data, userId) => {
  try {
    const ref = await addDoc(collection(db, COL), {
      ...data,
      created_by: userId,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
    return ref.id
  } catch (e) { throw new Error(`Erreur création log : ${e.message}`) }
}

export const resolveTechLog = async (id, resolution, userId) => {
  try {
    await updateDoc(doc(db, COL, id), {
      resolution, resolved_by: userId,
      resolved_at: serverTimestamp(), updated_at: serverTimestamp(),
    })
  } catch (e) { throw new Error(`Erreur résolution log : ${e.message}`) }
}

export const updateTechLog = async (id, data) => {
  try { await updateDoc(doc(db, COL, id), { ...data, updated_at: serverTimestamp() }) }
  catch (e) { throw new Error(`Erreur mise à jour log : ${e.message}`) }
}
