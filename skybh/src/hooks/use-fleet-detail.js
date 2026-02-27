/**
 * @fileoverview Hook React — données flotte enrichies temps réel
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { subscribeToAllTechLogs, addTechLog, resolveTechLog } from '../services/tech-log.service'
import {
  subscribeToAllUnavailabilities, addUnavailability, closeUnavailability, deleteUnavailability,
  subscribeToAllAircraftDocs, addAircraftDoc, updateAircraftDoc, deleteAircraftDoc,
} from '../services/unavailability.service'
import { computeReliabilityScore, getDocumentStatus } from '../utils/fleet-reliability'

export function useFleetDetail({ fleet = [], flights = [], user = null }) {
  const [techLogs,        setTechLogs]        = useState([])
  const [unavailabilities,setUnavailabilities] = useState([])
  const [aircraftDocs,    setAircraftDocs]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    const unsubs = [
      subscribeToAllTechLogs(d       => { setTechLogs(d);         setLoading(false) }),
      subscribeToAllUnavailabilities(d => setUnavailabilities(d)),
      subscribeToAllAircraftDocs(d   => setAircraftDocs(d)),
    ]
    return () => unsubs.forEach(u => u())
  }, [])

  // ── Scores fiabilité ──────────────────────────────────────────────────────
  const reliabilityScores = useMemo(() => {
    const result = {}
    fleet.forEach(ac => {
      const logs    = techLogs.filter(l => l.aircraft_registration === ac.registration)
      const unavail = unavailabilities.filter(u => u.aircraft_registration === ac.registration)
      const acFlights = flights.filter(f => f.aircraft === ac.registration)
      result[ac.registration] = computeReliabilityScore(ac, logs, unavail, acFlights)
    })
    return result
  }, [fleet, techLogs, unavailabilities, flights])

  // ── Documents avec statut expiration ─────────────────────────────────────
  const docsWithStatus = useMemo(() =>
    aircraftDocs.map(d => ({ ...d, computed_status: getDocumentStatus(d) })),
    [aircraftDocs]
  )

  const expiringDocs = useMemo(() =>
    docsWithStatus.filter(d => d.computed_status !== 'valid'),
    [docsWithStatus]
  )

  // ── Avions actuellement indisponibles ─────────────────────────────────────
  const currentlyUnavailable = useMemo(() =>
    unavailabilities.filter(u => !u.end_date),
    [unavailabilities]
  )

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleAddLog = useCallback(async (data) => {
    try { await addTechLog(data, user?.uid) }
    catch (e) { setError(e.message) }
  }, [user])

  const handleResolveLog = useCallback(async (id, resolution) => {
    try { await resolveTechLog(id, resolution, user?.uid) }
    catch (e) { setError(e.message) }
  }, [user])

  const handleAddUnavail = useCallback(async (data) => {
    try { await addUnavailability(data, user?.uid) }
    catch (e) { setError(e.message) }
  }, [user])

  const handleCloseUnavail = useCallback(async (id) => {
    try { await closeUnavailability(id) }
    catch (e) { setError(e.message) }
  }, [])

  const handleDeleteUnavail = useCallback(async (id) => {
    try { await deleteUnavailability(id) }
    catch (e) { setError(e.message) }
  }, [])

  const handleAddDoc = useCallback(async (data) => {
    try { await addAircraftDoc(data) }
    catch (e) { setError(e.message) }
  }, [])

  const handleUpdateDoc = useCallback(async (id, data) => {
    try { await updateAircraftDoc(id, data) }
    catch (e) { setError(e.message) }
  }, [])

  const handleDeleteDoc = useCallback(async (id) => {
    try { await deleteAircraftDoc(id) }
    catch (e) { setError(e.message) }
  }, [])

  return {
    techLogs, unavailabilities, aircraftDocs: docsWithStatus, loading, error,
    reliabilityScores, expiringDocs, currentlyUnavailable,
    onAddLog:         handleAddLog,
    onResolveLog:     handleResolveLog,
    onAddUnavail:     handleAddUnavail,
    onCloseUnavail:   handleCloseUnavail,
    onDeleteUnavail:  handleDeleteUnavail,
    onAddDoc:         handleAddDoc,
    onUpdateDoc:      handleUpdateDoc,
    onDeleteDoc:      handleDeleteDoc,
    clearError: () => setError(null),
  }
}
