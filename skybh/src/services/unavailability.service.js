/**
 * @fileoverview Service Firestore — Indisponibilités SKYBH
 * Collection: aircraft_unavailabilities
 */
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

// ── Indisponibilités ──────────────────────────────────────────────────────────
const UNAVAIL_COL = 'aircraft_unavailabilities'

export const subscribeToUnavailabilities = (registration, callback) => {
  const q = registration
    ? query(collection(db, UNAVAIL_COL), where('aircraft_registration','==',registration), orderBy('start_date','desc'))
    : query(collection(db, UNAVAIL_COL), orderBy('start_date','desc'))
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
    err  => console.error('[Unavail] subscribe:', err)
  )
}

export const subscribeToAllUnavailabilities = cb => subscribeToUnavailabilities(null, cb)

export const addUnavailability = async (data, userId) => {
  try {
    const toTs = d => d instanceof Date ? Timestamp.fromDate(d) : d
    const ref = await addDoc(collection(db, UNAVAIL_COL), {
      ...data,
      start_date: toTs(data.start_date),
      end_date:   data.end_date ? toTs(data.end_date) : null,
      created_by: userId,
      created_at: serverTimestamp(),
    })
    return ref.id
  } catch (e) { throw new Error(`Erreur création indispo : ${e.message}`) }
}

export const closeUnavailability = async (id) => {
  try {
    await updateDoc(doc(db, UNAVAIL_COL, id), { end_date: serverTimestamp() })
  } catch (e) { throw new Error(`Erreur clôture indispo : ${e.message}`) }
}

export const deleteUnavailability = async (id) => {
  try { await deleteDoc(doc(db, UNAVAIL_COL, id)) }
  catch (e) { throw new Error(`Erreur suppression indispo : ${e.message}`) }
}

// ── Documents avion ───────────────────────────────────────────────────────────
const DOCS_COL = 'aircraft_documents'

export const subscribeToAircraftDocs = (registration, callback) => {
  const q = registration
    ? query(collection(db, DOCS_COL), where('aircraft_registration','==',registration), orderBy('expiry_date','asc'))
    : query(collection(db, DOCS_COL), orderBy('expiry_date','asc'))
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
    err  => console.error('[AircraftDocs] subscribe:', err)
  )
}

export const subscribeToAllAircraftDocs = cb => subscribeToAircraftDocs(null, cb)

export const addAircraftDoc = async (data) => {
  try {
    const toTs = d => d instanceof Date ? Timestamp.fromDate(d) : d
    const ref = await addDoc(collection(db, DOCS_COL), {
      ...data,
      issue_date:  data.issue_date  ? toTs(data.issue_date)  : null,
      expiry_date: data.expiry_date ? toTs(data.expiry_date) : null,
      status:      'valid',
      updated_at:  serverTimestamp(),
    })
    return ref.id
  } catch (e) { throw new Error(`Erreur ajout document : ${e.message}`) }
}

export const updateAircraftDoc = async (id, data) => {
  try { await updateDoc(doc(db, DOCS_COL, id), { ...data, updated_at: serverTimestamp() }) }
  catch (e) { throw new Error(`Erreur mise à jour document : ${e.message}`) }
}

export const deleteAircraftDoc = async (id) => {
  try { await deleteDoc(doc(db, DOCS_COL, id)) }
  catch (e) { throw new Error(`Erreur suppression document : ${e.message}`) }
}
