/**
 * @fileoverview Service Firestore — Maintenance SKYBH
 * Collections: maintenance_records · maintenance_windows
 */

import {
  collection, doc, addDoc, updateDoc, onSnapshot, serverTimestamp,
  query, where, orderBy, getDocs, Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

const RECORDS_COL = 'maintenance_records'
const WINDOWS_COL = 'maintenance_windows'

// ── maintenance_records ────────────────────────────────────────────────────────

/** @returns {function} unsubscribe */
export const subscribeToRecords = (aircraftRegistration, callback) => {
  const q = aircraftRegistration
    ? query(collection(db, RECORDS_COL),
        where('aircraft_registration', '==', aircraftRegistration),
        orderBy('performed_at', 'desc'))
    : query(collection(db, RECORDS_COL), orderBy('performed_at', 'desc'))

  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error('[Maintenance] subscribe records:', err)
  )
}

export const subscribeToAllRecords = (callback) => subscribeToRecords(null, callback)

export const addRecord = async (data, userId) => {
  try {
    const ref = await addDoc(collection(db, RECORDS_COL), {
      ...data,
      created_by: userId,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
    return ref.id
  } catch (err) {
    throw new Error(`Erreur création intervention : ${err.message}`)
  }
}

export const updateRecord = async (id, data) => {
  try {
    await updateDoc(doc(db, RECORDS_COL, id), { ...data, updated_at: serverTimestamp() })
  } catch (err) {
    throw new Error(`Erreur mise à jour intervention : ${err.message}`)
  }
}

export const completeRecord = async (id, userId) => {
  return updateRecord(id, { status: 'done', completed_by: userId })
}

// ── maintenance_windows ────────────────────────────────────────────────────────

export const subscribeToWindows = (callback) => {
  const q = query(collection(db, WINDOWS_COL),
    where('status', 'in', ['suggested', 'confirmed']),
    orderBy('suggested_start', 'asc')
  )
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error('[Maintenance] subscribe windows:', err)
  )
}

export const saveWindow = async (windowData) => {
  try {
    const data = {
      ...windowData,
      suggested_start: windowData.suggested_start instanceof Date
        ? Timestamp.fromDate(windowData.suggested_start)
        : windowData.suggested_start,
      suggested_end: windowData.suggested_end instanceof Date
        ? Timestamp.fromDate(windowData.suggested_end)
        : windowData.suggested_end,
      created_at: serverTimestamp(),
    }
    const ref = await addDoc(collection(db, WINDOWS_COL), data)
    return ref.id
  } catch (err) {
    throw new Error(`Erreur sauvegarde créneau : ${err.message}`)
  }
}

export const confirmWindow = async (id, userId, userEmail) => {
  try {
    await updateDoc(doc(db, WINDOWS_COL, id), {
      status:       'confirmed',
      confirmed_by: userEmail || userId,
      confirmed_at: serverTimestamp(),
    })
  } catch (err) {
    throw new Error(`Erreur confirmation créneau : ${err.message}`)
  }
}

export const rejectWindow = async (id) => {
  try {
    await updateDoc(doc(db, WINDOWS_COL, id), { status: 'rejected' })
  } catch (err) {
    throw new Error(`Erreur rejet créneau : ${err.message}`)
  }
}
