/**
 * @fileoverview Services Firestore — Crew Management SKYBH
 * crew_members · crew_qualifications · crew_assignments · crew_ftl_logs
 */
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDoc, getDocs, onSnapshot, query,
  where, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

// ── Collections ───────────────────────────────────────────────────────────────
const COL = {
  MEMBERS:     'crew_members',
  QUALS:       'crew_qualifications',
  ASSIGNMENTS: 'crew_assignments',
  FTL_LOGS:    'crew_ftl_logs',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const toDate = ts => ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null)
const snap   = d  => ({ id: d.id, ...d.data() })
const snaps  = qs => qs.docs.map(snap)

// ════════════════════════════════════════════════════════════════════════════
// CREW MEMBERS
// ════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} CrewMember
 * @property {string}  id
 * @property {string}  first_name
 * @property {string}  last_name
 * @property {'PIC'|'FO'|'CAP'}  role
 * @property {boolean} active
 * @property {string}  base            — ICAO aéroport de base (ex: 'TFFJ')
 * @property {string}  email
 * @property {string}  phone
 * @property {string}  employee_id
 * @property {string}  hire_date       — ISO date
 * @property {string}  photo_url
 * @property {Timestamp} created_at
 * @property {Timestamp} updated_at
 */

export const subscribeToCrewMembers = (callback) =>
  onSnapshot(
    query(collection(db, COL.MEMBERS), orderBy('last_name')),
    qs => callback(snaps(qs)),
    err => console.error('[Crew] members subscribe:', err)
  )

export const getCrewMember = async (crewId) => {
  const d = await getDoc(doc(db, COL.MEMBERS, crewId))
  return d.exists() ? snap(d) : null
}

export const createCrewMember = async (data) => {
  try {
    const ref = await addDoc(collection(db, COL.MEMBERS), {
      ...data,
      active:     data.active ?? true,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
    return ref.id
  } catch(e) { throw new Error(`Erreur création membre: ${e.message}`) }
}

export const updateCrewMember = async (crewId, data) => {
  try {
    await updateDoc(doc(db, COL.MEMBERS, crewId), {
      ...data, updated_at: serverTimestamp(),
    })
  } catch(e) { throw new Error(`Erreur mise à jour membre: ${e.message}`) }
}

export const deleteCrewMember = async (crewId) => {
  try {
    await deleteDoc(doc(db, COL.MEMBERS, crewId))
  } catch(e) { throw new Error(`Erreur suppression membre: ${e.message}`) }
}

export const setCrewActive = (crewId, active) =>
  updateCrewMember(crewId, { active })

// ════════════════════════════════════════════════════════════════════════════
// CREW QUALIFICATIONS
// ════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} CrewQualification
 * @property {string}   crew_id
 * @property {string[]} type_ratings    — ex: ['C208', 'BN2']
 * @property {string}   medical_expiry  — ISO date
 * @property {string}   license_expiry  — ISO date
 * @property {string}   license_number
 * @property {string}   last_sim_check  — ISO date
 * @property {string}   next_sim_check  — ISO date
 * @property {string}   ir_expiry       — Instrument Rating
 * @property {string}   notes
 * @property {Timestamp} updated_at
 */

export const subscribeToQualifications = (crewId, callback) =>
  onSnapshot(
    query(collection(db, COL.QUALS), where('crew_id', '==', crewId)),
    qs => callback(qs.empty ? null : snap(qs.docs[0])),
    err => console.error('[Crew] quals subscribe:', err)
  )

export const getQualifications = async (crewId) => {
  const qs = await getDocs(query(
    collection(db, COL.QUALS), where('crew_id', '==', crewId)
  ))
  return qs.empty ? null : snap(qs.docs[0])
}

export const upsertQualifications = async (crewId, data) => {
  try {
    const qs = await getDocs(query(
      collection(db, COL.QUALS), where('crew_id', '==', crewId)
    ))
    if (qs.empty) {
      await addDoc(collection(db, COL.QUALS), {
        ...data, crew_id: crewId, updated_at: serverTimestamp(),
      })
    } else {
      await updateDoc(doc(db, COL.QUALS, qs.docs[0].id), {
        ...data, updated_at: serverTimestamp(),
      })
    }
  } catch(e) { throw new Error(`Erreur qualifications: ${e.message}`) }
}

// ════════════════════════════════════════════════════════════════════════════
// CREW ASSIGNMENTS
// ════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} CrewAssignment
 * @property {string}  flight_id
 * @property {string}  flight_number
 * @property {string}  pic_id          — crew_member id
 * @property {string}  fo_id           — crew_member id (optionnel)
 * @property {string}  assigned_by
 * @property {boolean} ftl_compliant_pic
 * @property {boolean} ftl_compliant_fo
 * @property {boolean} quals_valid_pic
 * @property {boolean} quals_valid_fo
 * @property {string}  validation_status — 'ok'|'warning'|'blocked'
 * @property {Timestamp} created_at
 * @property {Timestamp} updated_at
 */

export const subscribeToAssignments = (callback) =>
  onSnapshot(
    collection(db, COL.ASSIGNMENTS),
    qs => callback(snaps(qs)),
    err => console.error('[Crew] assignments subscribe:', err)
  )

export const subscribeToFlightAssignment = (flightId, callback) =>
  onSnapshot(
    query(collection(db, COL.ASSIGNMENTS), where('flight_id', '==', flightId)),
    qs => callback(qs.empty ? null : snap(qs.docs[0])),
    err => console.error('[Crew] flight assignment subscribe:', err)
  )

export const getFlightAssignment = async (flightId) => {
  const qs = await getDocs(query(
    collection(db, COL.ASSIGNMENTS), where('flight_id', '==', flightId)
  ))
  return qs.empty ? null : snap(qs.docs[0])
}

export const upsertFlightAssignment = async (flightId, data) => {
  try {
    const qs = await getDocs(query(
      collection(db, COL.ASSIGNMENTS), where('flight_id', '==', flightId)
    ))
    if (qs.empty) {
      await addDoc(collection(db, COL.ASSIGNMENTS), {
        ...data, flight_id: flightId,
        created_at: serverTimestamp(), updated_at: serverTimestamp(),
      })
    } else {
      await updateDoc(doc(db, COL.ASSIGNMENTS, qs.docs[0].id), {
        ...data, updated_at: serverTimestamp(),
      })
    }
  } catch(e) { throw new Error(`Erreur assignation: ${e.message}`) }
}

export const deleteAssignment = async (assignmentId) => {
  try { await deleteDoc(doc(db, COL.ASSIGNMENTS, assignmentId)) }
  catch(e) { throw new Error(`Erreur suppression assignation: ${e.message}`) }
}

// ════════════════════════════════════════════════════════════════════════════
// FTL LOGS
// ════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} FtlLog
 * @property {string}  crew_id
 * @property {string}  flight_id
 * @property {string}  flight_number
 * @property {string}  date            — 'YYYY-MM-DD'
 * @property {number}  duty_start_utc  — ms
 * @property {number}  duty_end_utc    — ms
 * @property {number}  flight_minutes
 * @property {string}  origin
 * @property {string}  destination
 * @property {Timestamp} created_at
 */

export const getFtlLogsForCrew = async (crewId, daysBack = 35) => {
  const since = new Date()
  since.setDate(since.getDate() - daysBack)
  const sinceStr = since.toISOString().slice(0, 10)

  const qs = await getDocs(query(
    collection(db, COL.FTL_LOGS),
    where('crew_id', '==', crewId),
    where('date',    '>=', sinceStr),
    orderBy('date',  'asc'),
  ))
  return snaps(qs)
}

export const subscribeToFtlLogs = (crewId, daysBack = 35, callback) => {
  const since = new Date()
  since.setDate(since.getDate() - daysBack)
  const sinceStr = since.toISOString().slice(0, 10)

  return onSnapshot(
    query(
      collection(db, COL.FTL_LOGS),
      where('crew_id', '==', crewId),
      where('date',    '>=', sinceStr),
      orderBy('date',  'asc'),
    ),
    qs => callback(snaps(qs)),
    err => console.error('[FTL] logs subscribe:', err)
  )
}

export const addFtlLog = async (data) => {
  try {
    const ref = await addDoc(collection(db, COL.FTL_LOGS), {
      ...data, created_at: serverTimestamp(),
    })
    return ref.id
  } catch(e) { throw new Error(`Erreur log FTL: ${e.message}`) }
}

export const deleteFtlLog = async (logId) => {
  try { await deleteDoc(doc(db, COL.FTL_LOGS, logId)) }
  catch(e) { throw new Error(`Erreur suppression log FTL: ${e.message}`) }
}

/**
 * Récupère les logs FTL pour plusieurs membres (pour un vol)
 */
export const getFtlLogsForCrew28d = async (crewIds) => {
  const since = new Date()
  since.setDate(since.getDate() - 28)
  const sinceStr = since.toISOString().slice(0, 10)

  const results = {}
  await Promise.all(crewIds.map(async id => {
    const qs = await getDocs(query(
      collection(db, COL.FTL_LOGS),
      where('crew_id', '==', id),
      where('date',    '>=', sinceStr),
      orderBy('date',  'asc'),
    ))
    results[id] = snaps(qs)
  }))
  return results
}
