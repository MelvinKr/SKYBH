/**
 * @fileoverview Panneau principal des alertes intelligentes SKYBH
 * Affiche toutes les alertes actives avec filtres, groupement et actions bulk.
 */

import { useState, useMemo } from 'react';
import { useSmartAlerts } from '../../hooks/use-smart-alerts';
import AlertCard from './alert-card';
import { groupAlertsByType, ALERT_TYPE_LABELS, ALERT_TYPE_ICONS } from '../../utils/alert-engine';

/**
 * @param {Object} props
 * @param {string} props.userId - UID Firebase courant
 * @param {boolean} [props.compact=false] - mode compact pour sidebar
 */
const SmartAlertsPanel = ({ userId, compact = false }) => {
  const {
    alerts,
    loading,
    error,
    actionLoading,
    criticalCount,
    warningCount,
    totalActive,
    onAcknowledge,
    onResolve,
    clearError,
  } = useSmartAlerts({ userId });

  const [filter, setFilter] = useState('all'); // 'all' | 'critical' | 'warning' | type
  const [groupByType, setGroupByType] = useState(false);

  const filteredAlerts = useMemo(() => {
    if (filter === 'all') return alerts;
    if (filter === 'critical') return alerts.filter((a) => a.criticality === 'critical');
    if (filter === 'warning') return alerts.filter((a) => a.criticality === 'warning');
    return alerts.filter((a) => a.type === filter);
  }, [alerts, filter]);

  const groupedAlerts = useMemo(
    () => (groupByType ? groupAlertsByType(filteredAlerts) : null),
    [filteredAlerts, groupByType]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-sky-500/40 border-t-sky-500 rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Chargement des alertes…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${compact ? '' : 'max-w-2xl mx-auto'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 tracking-tight">
            Alertes Intelligentes
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {totalActive === 0
              ? 'Aucune alerte active'
              : `${totalActive} alerte${totalActive > 1 ? 's' : ''} active${totalActive > 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Badges résumés */}
        {(criticalCount > 0 || warningCount > 0) && (
          <div className="flex gap-2">
            {criticalCount > 0 && (
              <div className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/30 rounded-lg px-2.5 py-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-bold text-red-400">{criticalCount}</span>
                <span className="text-xs text-red-400/70">critique{criticalCount > 1 ? 's' : ''}</span>
              </div>
            )}
            {warningCount > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-sm font-bold text-amber-400">{warningCount}</span>
                <span className="text-xs text-amber-400/70">warning{warningCount > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 bg-red-900/30 border border-red-700/40 rounded-lg px-3 py-2.5 mb-3">
          <span className="text-red-400 text-sm flex-1">{error}</span>
          <button
            onClick={clearError}
            className="text-red-400/60 hover:text-red-300 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filtres */}
      {!compact && alerts.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex bg-slate-800/60 rounded-lg p-1 gap-1">
            {['all', 'critical', 'warning'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`
                  text-xs font-medium px-2.5 py-1 rounded-md transition-colors
                  ${filter === f
                    ? f === 'critical'
                      ? 'bg-red-500/25 text-red-300'
                      : f === 'warning'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-slate-600 text-slate-200'
                    : 'text-slate-400 hover:text-slate-300'
                  }
                `}
              >
                {f === 'all' ? 'Toutes' : f === 'critical' ? '🔴 Critiques' : '🟡 Warnings'}
              </button>
            ))}
          </div>

          {/* Toggle groupement */}
          <button
            onClick={() => setGroupByType((v) => !v)}
            className={`
              text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors
              ${groupByType
                ? 'bg-sky-500/20 border-sky-500/30 text-sky-300'
                : 'border-slate-600/50 text-slate-400 hover:text-slate-300'
              }
            `}
          >
            Grouper par type
          </button>
        </div>
      )}

      {/* Liste des alertes */}
      <div className="flex-1 overflow-y-auto">
        {filteredAlerts.length === 0 ? (
          <EmptyState />
        ) : groupedAlerts ? (
          // Mode groupé
          <div className="space-y-6">
            {Object.entries(groupedAlerts).map(([type, typeAlerts]) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">{ALERT_TYPE_ICONS[type]}</span>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {ALERT_TYPE_LABELS[type]}
                  </span>
                  <span className="text-xs text-slate-600">({typeAlerts.length})</span>
                </div>
                <div className="space-y-2">
                  {typeAlerts.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onAcknowledge={onAcknowledge}
                      onResolve={onResolve}
                      isLoading={actionLoading === alert.id}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Mode liste
          <div className="space-y-2">
            {filteredAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAcknowledge={onAcknowledge}
                onResolve={onResolve}
                isLoading={actionLoading === alert.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="text-5xl mb-3">✅</div>
    <p className="text-sm font-medium text-slate-300">Aucune alerte active</p>
    <p className="text-xs text-slate-500 mt-1">
      Toutes les opérations sont dans les limites normales.
    </p>
  </div>
);

export default SmartAlertsPanel;
