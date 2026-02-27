/**
 * @fileoverview Moteur de génération d'alertes intelligentes SKYBH
 * Analyse la flotte, le planning et la météo pour détecter les alertes.
 * Toujours testable isolément (pas d'import Firebase ici).
 */

import { generateDeduplicationKey } from '../services/alert.service';

/** Seuils opérationnels (heures) */
export const THRESHOLDS = {
  ENGINE_HOURS_WARNING: 50,    // warning à 50h du potentiel
  ENGINE_HOURS_CRITICAL: 20,   // critique à 20h du potentiel
  AIRFRAME_HOURS_WARNING: 100,
  AIRFRAME_HOURS_CRITICAL: 30,
  CREW_DUTY_WARNING: 60,       // 60 min avant dépassement temps de service
  CREW_DUTY_CRITICAL: 20,
  MEL_EXPIRY_WARNING_DAYS: 3,  // MEL (Minimum Equipment List) expirant
  MEL_EXPIRY_CRITICAL_DAYS: 1,
};

/**
 * Calcule l'estimation "temps restant avant blocage" en minutes
 * @param {number} remaining - heures restantes sur le potentiel
 * @param {number} avgHoursPerDay - consommation moyenne quotidienne (heures)
 * @returns {number|null} minutes avant blocage ou null si indéterminable
 */
export const estimateTimeToBlock = (remaining, avgHoursPerDay) => {
  if (!avgHoursPerDay || avgHoursPerDay <= 0) return null;
  const days = remaining / avgHoursPerDay;
  return Math.round(days * 24 * 60);
};

/**
 * Formate le temps restant de façon lisible
 * @param {number|null} minutes
 * @returns {string}
 */
export const formatTimeToBlock = (minutes) => {
  if (minutes === null || minutes === undefined) return 'Indéterminé';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}j`;
};

/**
 * Analyse un avion et retourne les alertes potentielles
 * @param {Object} aircraft - document Firestore aircraft_fleet
 * @param {Object[]} upcomingFlights - vols planifiés pour cet avion
 * @param {number} avgHoursPerDay
 * @returns {Object[]} alertes générées (non encore persistées)
 */
export const analyzeAircraftAlerts = (aircraft, upcomingFlights = [], avgHoursPerDay = 2) => {
  const alerts = [];
  const { id, registration, engineHours, enginePotential, airframeHours, airframePotential } = aircraft;

  // --- Potentiel moteur ---
  const engineRemaining = enginePotential - engineHours;
  if (engineRemaining > 0) {
    const isCritical = engineRemaining <= THRESHOLDS.ENGINE_HOURS_CRITICAL;
    const isWarning = engineRemaining <= THRESHOLDS.ENGINE_HOURS_WARNING;

    if (isCritical || isWarning) {
      const timeToBlock = estimateTimeToBlock(engineRemaining, avgHoursPerDay);
      const affectedFlights = upcomingFlights
        .filter((f) => f.aircraftId === id)
        .map((f) => f.id);

      alerts.push({
        type: 'maintenance',
        criticality: isCritical ? 'critical' : 'warning',
        title: `Potentiel moteur ${registration}`,
        message: `${engineRemaining.toFixed(1)}h restantes avant inspection moteur. ${affectedFlights.length} vol(s) impacté(s).`,
        entityRef: { collection: 'aircraft_fleet', id },
        affectedFlights,
        timeToBlock,
        deduplicationKey: generateDeduplicationKey('maintenance', id, 'engine'),
      });
    }
  }

  // --- Potentiel cellule ---
  const airframeRemaining = airframePotential - airframeHours;
  if (airframeRemaining > 0) {
    const isCritical = airframeRemaining <= THRESHOLDS.AIRFRAME_HOURS_CRITICAL;
    const isWarning = airframeRemaining <= THRESHOLDS.AIRFRAME_HOURS_WARNING;

    if (isCritical || isWarning) {
      const timeToBlock = estimateTimeToBlock(airframeRemaining, avgHoursPerDay);
      const affectedFlights = upcomingFlights
        .filter((f) => f.aircraftId === id)
        .map((f) => f.id);

      alerts.push({
        type: 'maintenance',
        criticality: isCritical ? 'critical' : 'warning',
        title: `Potentiel cellule ${registration}`,
        message: `${airframeRemaining.toFixed(1)}h restantes avant inspection cellule.`,
        entityRef: { collection: 'aircraft_fleet', id },
        affectedFlights,
        timeToBlock,
        deduplicationKey: generateDeduplicationKey('maintenance', id, 'airframe'),
      });
    }
  }

  return alerts;
};

/**
 * Analyse un pilote (temps de service) et retourne les alertes potentielles
 * @param {Object} pilot - document Firestore users
 * @param {Object[]} todayFlights - vols du jour pour ce pilote
 * @param {number} dutyLimitMinutes - limite réglementaire en minutes (ex: 900 = FTL DGAC)
 * @returns {Object[]}
 */
export const analyzeCrewAlerts = (pilot, todayFlights = [], dutyLimitMinutes = 900) => {
  const alerts = [];
  const { id, displayName, dutyMinutesToday = 0 } = pilot;

  const remainingMinutes = dutyLimitMinutes - dutyMinutesToday;
  const affectedFlights = todayFlights.filter((f) => f.pilotId === id).map((f) => f.id);

  if (remainingMinutes <= 0) {
    alerts.push({
      type: 'crew',
      criticality: 'critical',
      title: `FTL dépassé — ${displayName}`,
      message: `Le pilote ${displayName} a atteint sa limite réglementaire de temps de service.`,
      entityRef: { collection: 'users', id },
      affectedFlights,
      timeToBlock: 0,
      deduplicationKey: generateDeduplicationKey('crew', id, 'ftl'),
    });
  } else if (remainingMinutes <= THRESHOLDS.CREW_DUTY_CRITICAL) {
    alerts.push({
      type: 'crew',
      criticality: 'critical',
      title: `FTL imminent — ${displayName}`,
      message: `${remainingMinutes} min avant la limite FTL pour ${displayName}. ${affectedFlights.length} vol(s) concerné(s).`,
      entityRef: { collection: 'users', id },
      affectedFlights,
      timeToBlock: remainingMinutes,
      deduplicationKey: generateDeduplicationKey('crew', id, 'ftl'),
    });
  } else if (remainingMinutes <= THRESHOLDS.CREW_DUTY_WARNING) {
    alerts.push({
      type: 'crew',
      criticality: 'warning',
      title: `Alerte FTL — ${displayName}`,
      message: `${remainingMinutes} min restantes avant la limite de temps de service.`,
      entityRef: { collection: 'users', id },
      affectedFlights,
      timeToBlock: remainingMinutes,
      deduplicationKey: generateDeduplicationKey('crew', id, 'ftl'),
    });
  }

  return alerts;
};

/**
 * Analyse les conditions météo et génère une alerte si nécessaire
 * @param {Object} meteo - données météo (ex: depuis API ou saisie manuelle)
 * @param {Object[]} affectedFlights - vols impactés
 * @returns {Object|null}
 */
export const analyzeWeatherAlert = (meteo, affectedFlights = []) => {
  if (!meteo?.isAdverse) return null;

  return {
    type: 'weather',
    criticality: meteo.severity === 'severe' ? 'critical' : 'warning',
    title: `Météo dégradée — ${meteo.station}`,
    message: meteo.description || 'Conditions VFR non conformes détectées.',
    entityRef: { collection: 'weather_reports', id: meteo.id },
    affectedFlights: affectedFlights.map((f) => f.id),
    timeToBlock: meteo.expectedClearanceMinutes ?? null,
    deduplicationKey: generateDeduplicationKey('weather', meteo.station, meteo.date),
  };
};

/**
 * Regroupe et déduplique une liste d'alertes par deduplicationKey
 * @param {Object[]} alerts
 * @returns {Object[]}
 */
export const deduplicateAlerts = (alerts) => {
  const seen = new Map();
  for (const alert of alerts) {
    const key = alert.deduplicationKey;
    if (!seen.has(key)) {
      seen.set(key, alert);
    } else {
      // Garder le plus critique
      const existing = seen.get(key);
      if (alert.criticality === 'critical' && existing.criticality !== 'critical') {
        seen.set(key, alert);
      }
    }
  }
  return Array.from(seen.values());
};

/**
 * Groupe les alertes par type pour affichage groupé
 * @param {Object[]} alerts
 * @returns {Record<string, Object[]>}
 */
export const groupAlertsByType = (alerts) => {
  return alerts.reduce((acc, alert) => {
    if (!acc[alert.type]) acc[alert.type] = [];
    acc[alert.type].push(alert);
    return acc;
  }, {});
};

/** Labels FR pour les types d'alerte */
export const ALERT_TYPE_LABELS = {
  maintenance: 'Maintenance',
  weather: 'Météo',
  crew: 'Équipage',
  aircraft: 'Aéronef',
  regulatory: 'Réglementaire',
};

/** Icônes (emoji) pour les types */
export const ALERT_TYPE_ICONS = {
  maintenance: '🔧',
  weather: '⛈️',
  crew: '👨‍✈️',
  aircraft: '✈️',
  regulatory: '📋',
};
