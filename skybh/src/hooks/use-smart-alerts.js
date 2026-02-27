/**
 * @fileoverview Hook React pour les alertes intelligentes SKYBH
 * Gère la souscription temps réel, les actions et les notifications in-app.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  subscribeToActiveAlerts,
  acknowledgeAlert,
  resolveAlert,
  markInAppNotificationSent,
} from '../services/alert.service';

/**
 * Hook principal pour les alertes intelligentes
 * @param {Object} options
 * @param {string} options.userId - UID Firebase de l'utilisateur courant
 * @param {boolean} [options.enableNotifications=true] - activer les notifs in-app
 * @returns {Object}
 */
export const useSmartAlerts = ({ userId, enableNotifications = true } = {}) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null); // alertId en cours
  const previousAlertIds = useRef(new Set());

  // Compteurs dérivés
  const criticalCount = alerts.filter(
    (a) => a.criticality === 'critical' && a.status === 'active'
  ).length;
  const warningCount = alerts.filter(
    (a) => a.criticality === 'warning' && a.status === 'active'
  ).length;
  const totalActive = alerts.filter((a) => a.status === 'active').length;

  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToActiveAlerts(
      async (updatedAlerts) => {
        setAlerts(updatedAlerts);
        setLoading(false);

        if (enableNotifications) {
          // Détecter les nouvelles alertes non notifiées
          for (const alert of updatedAlerts) {
            const isNew = !previousAlertIds.current.has(alert.id);
            const notSent = !alert.notificationsSent?.inApp;
            if (isNew && notSent) {
              // Déclencher notification browser si permission
              triggerBrowserNotification(alert);
              await markInAppNotificationSent(alert.id).catch(() => {});
            }
          }
          previousAlertIds.current = new Set(updatedAlerts.map((a) => a.id));
        }
      },
      (err) => {
        setError('Impossible de charger les alertes. Vérifiez la connexion réseau.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [enableNotifications]);

  const handleAcknowledge = useCallback(
    async (alertId) => {
      if (!userId) return;
      setActionLoading(alertId);
      try {
        await acknowledgeAlert(alertId, userId);
      } catch (err) {
        setError(err.message);
      } finally {
        setActionLoading(null);
      }
    },
    [userId]
  );

  const handleResolve = useCallback(async (alertId) => {
    setActionLoading(alertId);
    try {
      await resolveAlert(alertId);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    alerts,
    loading,
    error,
    actionLoading,
    criticalCount,
    warningCount,
    totalActive,
    onAcknowledge: handleAcknowledge,
    onResolve: handleResolve,
    clearError,
  };
};

/**
 * Déclenche une notification browser
 * @param {Object} alert
 */
const triggerBrowserNotification = (alert) => {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') {
    Notification.requestPermission();
    return;
  }
  const icon = alert.criticality === 'critical' ? '🔴' : '🟡';
  new Notification(`${icon} SKYBH — ${alert.title}`, {
    body: alert.message,
    icon: '/favicon.ico',
    tag: alert.id, // évite les doublons browser
  });
};

/**
 * Hook léger pour le badge de navigation (juste les compteurs)
 * @returns {{ criticalCount: number, warningCount: number }}
 */
export const useAlertBadge = () => {
  const [counts, setCounts] = useState({ critical: 0, warning: 0 });

  useEffect(() => {
    const unsub = subscribeToActiveAlerts((alerts) => {
      setCounts({
        critical: alerts.filter((a) => a.criticality === 'critical' && a.status === 'active').length,
        warning: alerts.filter((a) => a.criticality === 'warning' && a.status === 'active').length,
      });
    });
    return () => unsub();
  }, []);

  return counts;
};
