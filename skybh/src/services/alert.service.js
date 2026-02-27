/**
 * @fileoverview Service Firestore pour les alertes intelligentes SKYBH
 * Collection: smart_alerts
 */

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

const COLLECTION = 'smart_alerts';

/**
 * @typedef {Object} SmartAlert
 * @property {string} id
 * @property {'maintenance'|'weather'|'crew'|'aircraft'|'regulatory'} type
 * @property {'warning'|'critical'} criticality
 * @property {string} title
 * @property {string} message
 * @property {{ collection: string, id: string }} entityRef
 * @property {string[]} affectedFlights
 * @property {number|null} timeToBlock - minutes avant blocage
 * @property {'active'|'acknowledged'|'resolved'} status
 * @property {string|null} acknowledgedBy
 * @property {Timestamp|null} acknowledgedAt
 * @property {Timestamp|null} resolvedAt
 * @property {string} deduplicationKey
 * @property {{ inApp: boolean, email: boolean, push: boolean }} notificationsSent
 * @property {Timestamp} createdAt
 * @property {Timestamp} updatedAt
 */

/**
 * Génère une clé de déduplication pour éviter les doublons
 * @param {string} type
 * @param {string} entityId
 * @param {string} subType
 * @returns {string}
 */
export const generateDeduplicationKey = (type, entityId, subType = '') => {
  return `${type}__${entityId}__${subType}`;
};

/**
 * Vérifie si une alerte similaire est déjà active (déduplication)
 * @param {string} deduplicationKey
 * @returns {Promise<SmartAlert|null>}
 */
export const findDuplicateAlert = async (deduplicationKey) => {
  try {
    const q = query(
      collection(db, COLLECTION),
      where('deduplicationKey', '==', deduplicationKey),
      where('status', 'in', ['active', 'acknowledged'])
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...docSnap.data() };
  } catch (err) {
    console.error('[AlertService] findDuplicate:', err);
    return null;
  }
};

/**
 * Crée une nouvelle alerte (avec déduplication automatique)
 * @param {Omit<SmartAlert, 'id'|'createdAt'|'updatedAt'>} alertData
 * @returns {Promise<{ id: string, isDuplicate: boolean }>}
 */
export const createAlert = async (alertData) => {
  try {
    const existing = await findDuplicateAlert(alertData.deduplicationKey);
    if (existing) {
      // Mise à jour du timeToBlock si l'alerte existe déjà
      await updateDoc(doc(db, COLLECTION, existing.id), {
        timeToBlock: alertData.timeToBlock,
        affectedFlights: alertData.affectedFlights,
        updatedAt: serverTimestamp(),
      });
      return { id: existing.id, isDuplicate: true };
    }

    const docRef = await addDoc(collection(db, COLLECTION), {
      ...alertData,
      status: 'active',
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedAt: null,
      notificationsSent: { inApp: false, email: false, push: false },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: docRef.id, isDuplicate: false };
  } catch (err) {
    console.error('[AlertService] createAlert:', err);
    throw new Error("Impossible de créer l'alerte. Vérifiez la connexion.");
  }
};

/**
 * Acquitter une alerte
 * @param {string} alertId
 * @param {string} userId
 * @returns {Promise<void>}
 */
export const acknowledgeAlert = async (alertId, userId) => {
  try {
    await updateDoc(doc(db, COLLECTION, alertId), {
      status: 'acknowledged',
      acknowledgedBy: userId,
      acknowledgedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('[AlertService] acknowledge:', err);
    throw new Error("Impossible d'acquitter l'alerte.");
  }
};

/**
 * Résoudre une alerte
 * @param {string} alertId
 * @returns {Promise<void>}
 */
export const resolveAlert = async (alertId) => {
  try {
    await updateDoc(doc(db, COLLECTION, alertId), {
      status: 'resolved',
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('[AlertService] resolve:', err);
    throw new Error("Impossible de résoudre l'alerte.");
  }
};

/**
 * Écoute temps réel des alertes actives, triées par criticité
 * @param {function(SmartAlert[]): void} onUpdate
 * @param {function(Error): void} onError
 * @returns {function} unsubscribe
 */
export const subscribeToActiveAlerts = (onUpdate, onError) => {
  const q = query(
    collection(db, COLLECTION),
    where('status', 'in', ['active', 'acknowledged']),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snap) => {
      const alerts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Tri : critical d'abord, puis par timeToBlock ASC
      alerts.sort((a, b) => {
        if (a.criticality !== b.criticality) {
          return a.criticality === 'critical' ? -1 : 1;
        }
        if (a.timeToBlock !== null && b.timeToBlock !== null) {
          return a.timeToBlock - b.timeToBlock;
        }
        if (a.timeToBlock !== null) return -1;
        if (b.timeToBlock !== null) return 1;
        return 0;
      });
      onUpdate(alerts);
    },
    (err) => {
      console.error('[AlertService] subscribe:', err);
      onError?.(err);
    }
  );
};

/**
 * Marque les notifications in-app comme envoyées
 * @param {string} alertId
 * @returns {Promise<void>}
 */
export const markInAppNotificationSent = async (alertId) => {
  try {
    await updateDoc(doc(db, COLLECTION, alertId), {
      'notificationsSent.inApp': true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('[AlertService] markInApp:', err);
  }
};