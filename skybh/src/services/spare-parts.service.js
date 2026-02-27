/**
 * @fileoverview Service Firestore — Pièces détachées / stock SKYBH
 * Collection: spare_parts
 */

import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy, increment,
} from 'firebase/firestore'
import { db } from './firebase'

const COL = 'spare_parts'

/** @returns {function} unsubscribe */
export const subscribeToSpareParts = (callback) => {
  return onSnapshot(
    query(collection(db, COL), orderBy('name', 'asc')),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error('[SpareParts] subscribe:', err)
  )
}

export const addSparePart = async (data) => {
  try {
    const ref = await addDoc(collection(db, COL), {
      ...data,
      quantity_on_order: 0,
      updated_at: serverTimestamp(),
    })
    return ref.id
  } catch (err) {
    throw new Error(`Erreur création pièce : ${err.message}`)
  }
}

export const updateSparePart = async (id, data) => {
  try {
    await updateDoc(doc(db, COL, id), { ...data, updated_at: serverTimestamp() })
  } catch (err) {
    throw new Error(`Erreur mise à jour pièce : ${err.message}`)
  }
}

export const adjustStock = async (id, delta, note = '') => {
  try {
    await updateDoc(doc(db, COL, id), {
      quantity_on_hand: increment(delta),
      last_used_at: delta < 0 ? serverTimestamp() : undefined,
      last_ordered_at: delta > 0 ? serverTimestamp() : undefined,
      updated_at: serverTimestamp(),
    })
  } catch (err) {
    throw new Error(`Erreur ajustement stock : ${err.message}`)
  }
}

export const deleteSparePart = async (id) => {
  try { await deleteDoc(doc(db, COL, id)) }
  catch (err) { throw new Error(`Erreur suppression pièce : ${err.message}`) }
}

/** Retourne les pièces en rupture ou sous seuil minimum */
export const getLowStockParts = (parts) =>
  parts.filter(p => (p.quantity_on_hand || 0) <= (p.quantity_min || 0))
