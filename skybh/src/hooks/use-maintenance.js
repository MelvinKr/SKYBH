/**
 * @fileoverview Hook React — données maintenance temps réel
 * Agrège records, windows, spare parts + calculs prédictifs
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  subscribeToAllRecords, addRecord, updateRecord, completeRecord,
  subscribeToWindows, saveWindow, confirmWindow, rejectWindow,
} from '../services/maintenance.service'
import { subscribeToSpareParts, addSparePart, updateSparePart, adjustStock, getLowStockParts } from '../services/spare-parts.service'
import {
  projectPotentials, findMaintenanceWindows, computeActualConsumption,
  computeHealthScore, buildMaintenanceCalendar,
} from '../utils/maintenance-predictor'

export function useMaintenance({ fleet = [], flights = [], user = null }) {
  const [records,     setRecords]     = useState([])
  const [windows,     setWindows]     = useState([])
  const [spareParts,  setSpareParts]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)

  // ── Souscriptions Firestore ────────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      subscribeToAllRecords(r => { setRecords(r);    setLoading(false) }),
      subscribeToWindows(w    => setWindows(w)),
      subscribeToSpareParts(p => setSpareParts(p)),
    ]
    return () => unsubs.forEach(u => u())
  }, [])

  // ── Consommations réelles par avion ────────────────────────────────────────
  const consumptionByAircraft = useMemo(() => {
    const result = {}
    fleet.forEach(ac => {
      result[ac.registration] = computeActualConsumption(flights, ac.registration, 30)
    })
    return result
  }, [fleet, flights])

  // ── Projections par avion ──────────────────────────────────────────────────
  const projectionsByAircraft = useMemo(() => {
    const result = {}
    fleet.forEach(ac => {
      const { avgHoursPerDay } = consumptionByAircraft[ac.registration] || {}
      const avg = avgHoursPerDay || ac.avg_hours_per_day || 3
      result[ac.registration] = projectPotentials(ac, flights, avg, 60)
    })
    return result
  }, [fleet, flights, consumptionByAircraft])

  // ── Scores santé ──────────────────────────────────────────────────────────
  const healthScores = useMemo(() => {
    const result = {}
    fleet.forEach(ac => { result[ac.registration] = computeHealthScore(ac) })
    return result
  }, [fleet])

  // ── Fenêtres suggérées (calculées localement) ──────────────────────────────
  const suggestedWindows = useMemo(() => {
    const allWindows = []
    fleet.forEach(ac => {
      const proj = projectionsByAircraft[ac.registration]
      if (!proj) return
      const urgency = proj.engineThresholdDate
        ? Math.max(7, Math.round((proj.engineThresholdDate - Date.now()) / 86400000) - 5)
        : 30
      const wins = findMaintenanceWindows(ac, flights, 2, Math.min(urgency, 45))
      allWindows.push(...wins)
    })
    return allWindows.sort((a, b) => a.suggested_start - b.suggested_start)
  }, [fleet, flights, projectionsByAircraft])

  // ── Calendrier maintenance ─────────────────────────────────────────────────
  const calendarEvents = useMemo(() => {
    const avgMap = {}
    fleet.forEach(ac => {
      avgMap[ac.registration] = consumptionByAircraft[ac.registration]?.avgHoursPerDay || 3
    })
    return buildMaintenanceCalendar(fleet, records, avgMap)
  }, [fleet, records, consumptionByAircraft])

  // ── Stock alertes ──────────────────────────────────────────────────────────
  const lowStockParts = useMemo(() => getLowStockParts(spareParts), [spareParts])

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleAddRecord = useCallback(async (data) => {
    try { await addRecord(data, user?.uid) }
    catch (e) { setError(e.message) }
  }, [user])

  const handleUpdateRecord = useCallback(async (id, data) => {
    try { await updateRecord(id, data) }
    catch (e) { setError(e.message) }
  }, [])

  const handleCompleteRecord = useCallback(async (id) => {
    try { await completeRecord(id, user?.uid) }
    catch (e) { setError(e.message) }
  }, [user])

  const handleSaveWindow = useCallback(async (windowData) => {
    try { await saveWindow(windowData) }
    catch (e) { setError(e.message) }
  }, [])

  const handleConfirmWindow = useCallback(async (id) => {
    try { await confirmWindow(id, user?.uid, user?.email) }
    catch (e) { setError(e.message) }
  }, [user])

  const handleRejectWindow = useCallback(async (id) => {
    try { await rejectWindow(id) }
    catch (e) { setError(e.message) }
  }, [])

  const handleAddPart = useCallback(async (data) => {
    try { await addSparePart(data) }
    catch (e) { setError(e.message) }
  }, [])

  const handleAdjustStock = useCallback(async (id, delta) => {
    try { await adjustStock(id, delta) }
    catch (e) { setError(e.message) }
  }, [])

  return {
    // Données Firestore
    records, windows, spareParts, loading, error,
    // Calculé
    consumptionByAircraft, projectionsByAircraft, healthScores,
    suggestedWindows, calendarEvents, lowStockParts,
    // Actions
    onAddRecord:     handleAddRecord,
    onUpdateRecord:  handleUpdateRecord,
    onCompleteRecord:handleCompleteRecord,
    onSaveWindow:    handleSaveWindow,
    onConfirmWindow: handleConfirmWindow,
    onRejectWindow:  handleRejectWindow,
    onAddPart:       handleAddPart,
    onAdjustStock:   handleAdjustStock,
    clearError: () => setError(null),
  }
}
