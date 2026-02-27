/**
 * @fileoverview Service Firestore — règles de planning SKYBH
 * Collection: planning_rules (document unique "default")
 */

import {
  doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'

const DOC_REF = () => doc(db, 'planning_rules', 'default')

/**
 * @typedef {Object} PlanningRules
 * @property {number}          min_turnaround_minutes
 * @property {number}          buffer_minutes
 * @property {number}          max_daily_cycles
 * @property {number}          max_crew_duty_minutes
 * @property {boolean}         locked
 * @property {string|null}     locked_by
 * @property {Timestamp|null}  locked_at
 * @property {string|null}     validated_by
 * @property {Timestamp|null}  validated_at
 * @property {Timestamp}       updatedAt
 */

export const DEFAULT_RULES = {
  min_turnaround_minutes: 20,
  buffer_minutes: 5,
  max_daily_cycles: 8,
  max_crew_duty_minutes: 900,
  locked: false,
  locked_by: null,
  locked_at: null,
  validated_by: null,
  validated_at: null,
}

/**
 * Initialise les règles si elles n'existent pas encore
 */
export const initRulesIfNeeded = async () => {
  try {
    const snap = await getDoc(DOC_REF())
    if (!snap.exists()) {
      await setDoc(DOC_REF(), { ...DEFAULT_RULES, updatedAt: serverTimestamp() })
    }
  } catch (err) {
    console.error('[PlanningRules] init:', err)
  }
}

/**
 * Mise à jour des règles de rotation
 * @param {Partial<PlanningRules>} updates
 */
export const updateRules = async (updates) => {
  try {
    await setDoc(DOC_REF(), { ...updates, updatedAt: serverTimestamp() }, { merge: true })
  } catch (err) {
    console.error('[PlanningRules] update:', err)
    throw new Error('Impossible de mettre à jour les règles.')
  }
}

/**
 * Verrouille le planning
 * @param {string} userId
 * @param {string} userEmail
 */
export const lockPlanning = async (userId, userEmail) => {
  try {
    await setDoc(DOC_REF(), {
      locked: true,
      locked_by: userEmail || userId,
      locked_at: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch (err) {
    throw new Error('Impossible de verrouiller le planning.')
  }
}

/**
 * Déverrouille le planning
 */
export const unlockPlanning = async () => {
  try {
    await setDoc(DOC_REF(), {
      locked: false,
      locked_by: null,
      locked_at: null,
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch (err) {
    throw new Error('Impossible de déverrouiller le planning.')
  }
}

/**
 * Valide le planning (workflow final)
 * @param {string} userId
 * @param {string} userEmail
 */
export const validatePlanning = async (userId, userEmail) => {
  try {
    await setDoc(DOC_REF(), {
      locked: true,
      validated_by: userEmail || userId,
      validated_at: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch (err) {
    throw new Error('Impossible de valider le planning.')
  }
}

/**
 * Souscription temps réel aux règles
 * @param {function} onUpdate
 * @returns {function} unsubscribe
 */
export const subscribeToRules = (onUpdate) => {
  return onSnapshot(DOC_REF(), (snap) => {
    if (snap.exists()) {
      onUpdate({ ...DEFAULT_RULES, ...snap.data() })
    } else {
      onUpdate(DEFAULT_RULES)
      initRulesIfNeeded()
    }
  }, (err) => {
    console.error('[PlanningRules] subscribe:', err)
    onUpdate(DEFAULT_RULES)
  })
}
