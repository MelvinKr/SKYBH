import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp, onSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'

const COL = 'passengers'

/** Récupère un passager par ID */
export async function getPassenger(passengerId) {
  try {
    const snap = await getDoc(doc(db, COL, passengerId))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  } catch (err) { throw new Error(`Passager introuvable : ${err.message}`) }
}

/** Recherche par nom (min 2 caractères) */
export async function searchPassengersByName(lastName, maxResults = 10) {
  if (!lastName || lastName.length < 2) return []
  try {
    const upper = lastName.toUpperCase()
    const q = query(
      collection(db, COL),
      where('lastNameUpper', '>=', upper),
      where('lastNameUpper', '<=', upper + '\uf8ff'),
      orderBy('lastNameUpper'),
      limit(maxResults)
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) { throw new Error(`Erreur recherche : ${err.message}`) }
}

/** Recherche par numéro de document */
export async function getPassengerByDocument(documentNumber) {
  try {
    const q = query(
      collection(db, COL),
      where('documentNumber', '==', documentNumber.toUpperCase()),
      limit(1)
    )
    const snap = await getDocs(q)
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
  } catch (err) { throw new Error(`Erreur document : ${err.message}`) }
}

/** Écoute temps réel */
export function subscribeToPassenger(passengerId, onData, onError) {
  return onSnapshot(
    doc(db, COL, passengerId),
    snap => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  )
}

/** Crée un nouveau passager */
export async function createPassenger(data) {
  try {
    const ref = await addDoc(collection(db, COL), {
      ...data,
      lastName:       data.lastName.trim(),
      firstName:      data.firstName.trim(),
      lastNameUpper:  data.lastName.trim().toUpperCase(),
      documentNumber: data.documentNumber?.toUpperCase().trim(),
      createdAt:      serverTimestamp(),
      updatedAt:      serverTimestamp(),
    })
    return ref.id
  } catch (err) { throw new Error(`Création passager échouée : ${err.message}`) }
}

/** Met à jour un passager */
export async function updatePassenger(passengerId, updates) {
  try {
    await updateDoc(doc(db, COL, passengerId), {
      ...updates,
      ...(updates.lastName && { lastNameUpper: updates.lastName.trim().toUpperCase() }),
      updatedAt: serverTimestamp(),
    })
  } catch (err) { throw new Error(`Mise à jour échouée : ${err.message}`) }
}

/** Trouve ou crée un passager — évite les doublons */
export async function findOrCreatePassenger(documentNumber, data) {
  const existing = await getPassengerByDocument(documentNumber)
  if (existing) return { id: existing.id, isNew: false }
  const id = await createPassenger(data)
  return { id, isNew: true }
}