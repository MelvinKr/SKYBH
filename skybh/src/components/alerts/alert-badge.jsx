/**
 * @fileoverview Badge d'alertes pour la navigation SKYBH
 * Indicateur compact avec compteurs critiques/warnings.
 */

import { useAlertBadge } from '../../hooks/use-smart-alerts';

/**
 * @param {Object} props
 * @param {boolean} [props.showLabels=false] - afficher les labels texte
 * @param {string} [props.className]
 */
const AlertBadge = ({ showLabels = false, className = '' }) => {
  const { critical, warning } = useAlertBadge();
  const total = critical + warning;

  if (total === 0) return null;

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {critical > 0 && (
        <span className="relative flex items-center">
          <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-40" />
          <span className="relative flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] justify-center">
            {critical}
            {showLabels && <span className="hidden sm:inline ml-0.5">critique{critical > 1 ? 's' : ''}</span>}
          </span>
        </span>
      )}
      {warning > 0 && (
        <span className="flex items-center gap-1 bg-amber-500 text-slate-900 text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] justify-center">
          {warning}
          {showLabels && <span className="hidden sm:inline ml-0.5">warning{warning > 1 ? 's' : ''}</span>}
        </span>
      )}
    </div>
  );
};

export default AlertBadge;
