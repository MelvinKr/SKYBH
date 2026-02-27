/**
 * @fileoverview Composant carte d'alerte individuelle
 * Props: alert, onAcknowledge, onResolve, isLoading
 */

import { formatTimeToBlock, ALERT_TYPE_LABELS, ALERT_TYPE_ICONS } from '../../utils/alert-engine';

/**
 * @param {Object} props
 * @param {import('../../services/alert.service').SmartAlert} props.alert
 * @param {(id: string) => void} props.onAcknowledge
 * @param {(id: string) => void} props.onResolve
 * @param {boolean} props.isLoading
 */
const AlertCard = ({ alert, onAcknowledge, onResolve, isLoading }) => {
  const isCritical = alert.criticality === 'critical';
  const isAcknowledged = alert.status === 'acknowledged';
  const hasFlights = alert.affectedFlights?.length > 0;

  return (
    <div
      className={`
        relative overflow-hidden rounded-xl border transition-all duration-200
        ${isCritical
          ? 'border-red-500/40 bg-red-950/20 shadow-lg shadow-red-900/20'
          : 'border-amber-500/30 bg-amber-950/10 shadow-md shadow-amber-900/10'
        }
        ${isAcknowledged ? 'opacity-60' : ''}
      `}
    >
      {/* Barre latérale criticité */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 ${
          isCritical ? 'bg-red-500' : 'bg-amber-400'
        }`}
      />

      <div className="pl-4 pr-3 py-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg flex-shrink-0" aria-hidden>
              {ALERT_TYPE_ICONS[alert.type] ?? '⚠️'}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    isCritical
                      ? 'bg-red-500/20 text-red-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {isCritical ? 'Critique' : 'Avertissement'}
                </span>
                <span className="text-xs text-slate-400">
                  {ALERT_TYPE_LABELS[alert.type]}
                </span>
                {isAcknowledged && (
                  <span className="text-xs text-slate-500 italic">Acquitté</span>
                )}
              </div>
              <h3 className="text-sm font-semibold text-slate-100 mt-0.5 truncate">
                {alert.title}
              </h3>
            </div>
          </div>

          {/* Temps restant */}
          {alert.timeToBlock !== null && (
            <div
              className={`flex-shrink-0 text-center rounded-lg px-2 py-1 ${
                isCritical ? 'bg-red-500/15' : 'bg-amber-500/10'
              }`}
            >
              <div
                className={`text-lg font-black tabular-nums leading-none ${
                  isCritical ? 'text-red-400' : 'text-amber-400'
                }`}
              >
                {formatTimeToBlock(alert.timeToBlock)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">avant blocage</div>
            </div>
          )}
        </div>

        {/* Message */}
        <p className="text-xs text-slate-300 mt-2 leading-relaxed">{alert.message}</p>

        {/* Vols impactés */}
        {hasFlights && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Vols :</span>
            {alert.affectedFlights.slice(0, 4).map((flightId) => (
              <span
                key={flightId}
                className="text-[10px] font-mono bg-slate-700/60 text-slate-300 px-1.5 py-0.5 rounded"
              >
                {flightId.slice(0, 8)}
              </span>
            ))}
            {alert.affectedFlights.length > 4 && (
              <span className="text-[10px] text-slate-500">
                +{alert.affectedFlights.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          {!isAcknowledged && (
            <button
              onClick={() => onAcknowledge(alert.id)}
              disabled={isLoading}
              className={`
                flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isCritical
                  ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/25'
                }
              `}
            >
              {isLoading ? '...' : 'Acquitter'}
            </button>
          )}
          <button
            onClick={() => onResolve(alert.id)}
            disabled={isLoading}
            className="
              flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors
              bg-slate-700/50 hover:bg-slate-600/60 text-slate-300
              border border-slate-600/40
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            {isLoading ? '...' : 'Résoudre'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertCard;
