/**
 * @fileoverview Hook moteur d'alertes — analyse la flotte et les vols
 * et persiste automatiquement les alertes dans Firestore.
 * S'exécute en arrière-plan, sans bloquer l'UI.
 */

import { useEffect, useRef, useCallback } from 'react'
import { analyzeAircraftAlerts, analyzeWeatherAlert } from '../utils/alert-engine'
import { createAlert } from '../services/alert.service'

/** Intervalle de ré-analyse en ms (toutes les 5 minutes) */
const ANALYSIS_INTERVAL = 5 * 60 * 1000

/** Consommation moyenne quotidienne par défaut (heures/jour) pour SBH Commuter */
const AVG_HOURS_PER_DAY = 4

/**
 * Lance le moteur d'alertes en arrière-plan.
 * Analyse la flotte + les vols, crée les alertes dans Firestore (avec dédup).
 *
 * @param {Object} params
 * @param {Object[]} params.fleet   - liste des avions (aircraft_fleet)
 * @param {Object[]} params.flights - vols du jour (flight_plans)
 * @param {Object}   params.weather - données météo par ICAO (optionnel)
 * @param {boolean}  params.enabled - désactiver si données pas encore chargées
 */
export function useAlertEngine({ fleet = [], flights = [], weather = {}, enabled = true }) {
  const runningRef = useRef(false)

  const runAnalysis = useCallback(async () => {
    // Évite les analyses concurrentes
    if (runningRef.current || !enabled || fleet.length === 0) return
    runningRef.current = true

    try {
      const allAlerts = []

      // ── Analyse flotte ──────────────────────────────────────────
      for (const aircraft of fleet) {
        const acFlights = flights.filter(
          f => f.aircraft === aircraft.registration || f.aircraft === aircraft.id
        )
        const alerts = analyzeAircraftAlerts(aircraft, acFlights, AVG_HOURS_PER_DAY)
        allAlerts.push(...alerts)
      }

      // ── Analyse météo ───────────────────────────────────────────
      for (const [icao, meteo] of Object.entries(weather)) {
        if (!meteo?.isAdverse && meteo?.status !== 'IFR') continue
        const affectedFlights = flights.filter(
          f => f.origin === icao || f.destination === icao
        )
        const alert = analyzeWeatherAlert(
          {
            ...meteo,
            id: `metar-${icao}-${new Date().toISOString().slice(0, 10)}`,
            isAdverse: true,
            severity: meteo.status === 'IFR' ? 'severe' : 'moderate',
            date: new Date().toISOString().slice(0, 10),
          },
          affectedFlights
        )
        if (alert) allAlerts.push(alert)
      }

      // ── Persistance Firestore (avec déduplication auto) ─────────
      const results = await Promise.allSettled(
        allAlerts.map(alert => createAlert(alert))
      )

      const created  = results.filter(r => r.status === 'fulfilled' && !r.value?.isDuplicate).length
      const updated  = results.filter(r => r.status === 'fulfilled' && r.value?.isDuplicate).length
      const errors   = results.filter(r => r.status === 'rejected').length

      if (created > 0 || updated > 0) {
        console.info(`[AlertEngine] +${created} créées, ${updated} mises à jour, ${errors} erreurs`)
      }
    } catch (err) {
      console.error('[AlertEngine] Erreur analyse:', err)
    } finally {
      runningRef.current = false
    }
  }, [fleet, flights, weather, enabled])

  // Analyse au chargement initial + toutes les 5 min
  useEffect(() => {
    if (!enabled || fleet.length === 0) return

    // Légère temporisation pour ne pas bloquer le rendu initial
    const initial = setTimeout(runAnalysis, 2000)
    const interval = setInterval(runAnalysis, ANALYSIS_INTERVAL)

    return () => {
      clearTimeout(initial)
      clearInterval(interval)
    }
  }, [runAnalysis, enabled, fleet.length])
}
