/**
 * @fileoverview Services Firestore — Ops vols SKYBH
 * Passagers · Retards · Checklists dispatch
 */
import {
  collection, doc, addDoc, updateDoc, deleteDoc, setDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { DEFAULT_CHECKLIST } from '../utils/otp-calculator'

// ── Passagers ──────────────────────────────────────────────────────────────────
const PAX_COL = 'flight_passengers'

export const subscribeToPax = (flightId, callback) => {
  const q = query(collection(db, PAX_COL), where('flight_id','==',flightId), orderBy('last_name','asc'))
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
    err  => console.error('[Pax] subscribe:', err)
  )
}

export const subscribeToAllPax = (callback) => {
  return onSnapshot(query(collection(db, PAX_COL), orderBy('created_at','desc')),
    snap => callback(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
    err  => console.error('[Pax] subscribeAll:', err)
  )
}

export const addPassenger = async (data, userId) => {
  try {
    const ref = await addDoc(collection(db, PAX_COL), {
      ...data,
      status:       data.status || 'confirmed',
      pax_type:     data.pax_type || 'adult',
      checked_in_at:null, checked_in_by:null,
      created_at:   serverTimestamp(),
    })
    return ref.id
  } catch (e) { throw new Error(`Erreur ajout passager : ${e.message}`) }
}

export const updatePassenger = async (id, data) => {
  try { await updateDoc(doc(db, PAX_COL, id), data) }
  catch (e) { throw new Error(`Erreur mise à jour passager : ${e.message}`) }
}

export const checkInPassenger = async (id, userId) => {
  try {
    await updateDoc(doc(db, PAX_COL, id), {
      status:        'checked_in',
      checked_in_at: serverTimestamp(),
      checked_in_by: userId,
    })
  } catch (e) { throw new Error(`Erreur check-in : ${e.message}`) }
}

export const markNoShow = async (id) => {
  try { await updateDoc(doc(db, PAX_COL, id), { status:'no_show' }) }
  catch (e) { throw new Error(`Erreur no-show : ${e.message}`) }
}

export const boardPassenger = async (id) => {
  try { await updateDoc(doc(db, PAX_COL, id), { status:'boarded' }) }
  catch (e) { throw new Error(`Erreur embarquement : ${e.message}`) }
}

export const deletePassenger = async (id) => {
  try { await deleteDoc(doc(db, PAX_COL, id)) }
  catch (e) { throw new Error(`Erreur suppression passager : ${e.message}`) }
}

// ── Retards ────────────────────────────────────────────────────────────────────
const DELAYS_COL = 'flight_delays'

export const subscribeToDelays = (flightId, callback) => {
  const q = flightId
    ? query(collection(db, DELAYS_COL), where('flight_id','==',flightId), orderBy('reported_at','desc'))
    : query(collection(db, DELAYS_COL), orderBy('reported_at','desc'))
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
    err  => console.error('[Delays] subscribe:', err)
  )
}

export const subscribeToAllDelays = cb => subscribeToDelays(null, cb)

export const reportDelay = async (data, userId) => {
  try {
    const ref = await addDoc(collection(db, DELAYS_COL), {
      ...data,
      reported_by: userId,
      reported_at: serverTimestamp(),
      resolved_at: null,
    })
    return ref.id
  } catch (e) { throw new Error(`Erreur déclaration retard : ${e.message}`) }
}

export const resolveDelay = async (id) => {
  try { await updateDoc(doc(db, DELAYS_COL, id), { resolved_at: serverTimestamp() }) }
  catch (e) { throw new Error(`Erreur résolution retard : ${e.message}`) }
}

// ── Checklist dispatch ─────────────────────────────────────────────────────────
const CL_COL = 'flight_checklists'

export const subscribeToChecklist = (flightId, callback) => {
  return onSnapshot(doc(db, CL_COL, flightId),
    snap => {
      if (snap.exists()) callback({ id:snap.id, ...snap.data() })
      else callback(null)
    },
    err => console.error('[Checklist] subscribe:', err)
  )
}

/**
 * Initialise une checklist pour un vol (si elle n'existe pas)
 */
export const initChecklist = async (flightId, flightNumber) => {
  try {
    const items = DEFAULT_CHECKLIST.map(item => ({
      ...item,
      checked:false, checked_by:null, checked_at:null, note:null,
    }))
    await setDoc(doc(db, CL_COL, flightId), {
      flight_id:    flightId,
      flight_number:flightNumber,
      items,
      cleared:      false,
      cleared_by:   null,
      cleared_at:   null,
      updated_at:   serverTimestamp(),
    }, { merge:true })
  } catch (e) { throw new Error(`Erreur init checklist : ${e.message}`) }
}

export const checkItem = async (flightId, itemId, checked, userId) => {
  try {
    const ref  = doc(db, CL_COL, flightId)
    const snap = await import('firebase/firestore').then(m => m.getDoc(ref))
    if (!snap.exists()) return
    const items = snap.data().items.map(i =>
      i.id === itemId
        ? { ...i, checked, checked_by: checked ? userId : null, checked_at: checked ? new Date().toISOString() : null }
        : i
    )
    await updateDoc(ref, { items, updated_at: serverTimestamp() })
  } catch (e) { throw new Error(`Erreur check item : ${e.message}`) }
}

export const clearDispatch = async (flightId, userId, userEmail) => {
  try {
    await updateDoc(doc(db, CL_COL, flightId), {
      cleared:    true,
      cleared_by: userEmail || userId,
      cleared_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
    // Mettre à jour le vol principal aussi
    await updateDoc(doc(db, 'flight_plans', flightId), {
      dispatch_cleared:    true,
      dispatch_cleared_by: userEmail || userId,
      dispatch_cleared_at: serverTimestamp(),
    })
  } catch (e) { throw new Error(`Erreur dispatch clear : ${e.message}`) }
}

export const resetDispatch = async (flightId) => {
  try {
    await updateDoc(doc(db, CL_COL, flightId), {
      cleared:false, cleared_by:null, cleared_at:null, updated_at:serverTimestamp(),
    })
    await updateDoc(doc(db, 'flight_plans', flightId), {
      dispatch_cleared:false, dispatch_cleared_by:null, dispatch_cleared_at:null,
    })
  } catch (e) { throw new Error(`Erreur reset dispatch : ${e.message}`) }
}

// ── Briefing / notes ops ───────────────────────────────────────────────────────
export const updateBriefingNotes = async (flightId, notes) => {
  try {
    await updateDoc(doc(db, 'flight_plans', flightId), {
      briefing_notes: notes,
    })
  } catch (e) { throw new Error(`Erreur notes briefing : ${e.message}`) }
}

export const updateFlightDelay = async (flightId, delayMinutes, reason, userId) => {
  try {
    await updateDoc(doc(db, 'flight_plans', flightId), {
      delay_minutes: delayMinutes,
      delay_reason:  reason,
      otp_status:    delayMinutes > 15 ? 'delayed' : 'on_time',
    })
  } catch (e) { throw new Error(`Erreur mise à jour retard vol : ${e.message}`) }
}
