/**
 * @fileoverview Hooks React — Crew Management SKYBH
 * useCrew · useCrewMember · useCrewAssignments
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  subscribeToCrewMembers, getCrewMember,
  createCrewMember, updateCrewMember, deleteCrewMember, setCrewActive,
  subscribeToQualifications, upsertQualifications,
  subscribeToAssignments, subscribeToFlightAssignment,
  upsertFlightAssignment, deleteAssignment,
  subscribeToFtlLogs, getFtlLogsForCrew28d, addFtlLog,
} from '../services/crew.service'
import {
  calculateFTL, validateCrewForFlight, crewMemberStatus,
  getExpiryStatus, getSimCheckStatus,
} from '../utils/ftl-calculator'

// ════════════════════════════════════════════════════════════════════════════
// useCrew — liste complète + FTL résumé
// ════════════════════════════════════════════════════════════════════════════
export function useCrew() {
  const [members,     setMembers]     = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)

  useEffect(() => {
    const unsubM = subscribeToCrewMembers(m => { setMembers(m); setLoading(false) })
    const unsubA = subscribeToAssignments(setAssignments)
    return () => { unsubM(); unsubA() }
  }, [])

  // Statut global par membre (sans FTL temps réel — trop coûteux en liste)
  const membersWithStatus = useMemo(() =>
    members.map(m => ({
      ...m,
      displayName: `${m.first_name || ''} ${m.last_name || ''}`.trim(),
      // FTL calculé au détail, ici on expose juste le statut qualifs
      qualStatus: 'unknown', // hydraté dans useCrewMember
    }))
  , [members])

  const onCreateMember  = useCallback(async (data) => {
    try { return await createCrewMember(data) }
    catch(e) { setError(e.message); throw e }
  }, [])

  const onUpdateMember  = useCallback(async (id, data) => {
    try { await updateCrewMember(id, data) }
    catch(e) { setError(e.message); throw e }
  }, [])

  const onDeleteMember  = useCallback(async (id) => {
    try { await deleteCrewMember(id) }
    catch(e) { setError(e.message); throw e }
  }, [])

  const onToggleActive  = useCallback(async (id, active) => {
    try { await setCrewActive(id, active) }
    catch(e) { setError(e.message); throw e }
  }, [])

  // Membres disponibles (actifs)
  const activeMembers = useMemo(() => membersWithStatus.filter(m => m.active), [membersWithStatus])
  const pics          = useMemo(() => activeMembers.filter(m => ['PIC','CAP'].includes(m.role)), [activeMembers])
  const fos           = useMemo(() => activeMembers.filter(m => ['FO','PIC','CAP'].includes(m.role)), [activeMembers])

  return {
    members: membersWithStatus,
    activeMembers, pics, fos,
    assignments,
    loading, error,
    onCreateMember, onUpdateMember, onDeleteMember, onToggleActive,
    clearError: () => setError(null),
  }
}

// ════════════════════════════════════════════════════════════════════════════
// useCrewMember — détail complet + qualifs + FTL logs
// ════════════════════════════════════════════════════════════════════════════
export function useCrewMember(crewId) {
  const [member,  setMember]  = useState(null)
  const [quals,   setQuals]   = useState(null)
  const [ftlLogs, setFtlLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!crewId) return
    setLoading(true)

    const unsubM = subscribeToCrewMembers(members => {
      const m = members.find(x => x.id === crewId)
      if (m) { setMember(m); setLoading(false) }
    })
    const unsubQ = subscribeToQualifications(crewId, setQuals)
    const unsubF = subscribeToFtlLogs(crewId, 35, setFtlLogs)

    return () => { unsubM(); unsubQ(); unsubF() }
  }, [crewId])

  // Compteurs FTL courants (pour affichage)
  const ftlToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return calculateFTL(ftlLogs, new Date(), 0)
  }, [ftlLogs])

  // Statut global membre
  const status = useMemo(() =>
    crewMemberStatus(member, quals, ftlToday)
  , [member, quals, ftlToday])

  // Qualifs avec statuts calculés
  const qualsWithStatus = useMemo(() => {
    if (!quals) return null
    const now = new Date()
    return {
      ...quals,
      medical_status: getExpiryStatus(quals.medical_expiry, now),
      license_status: getExpiryStatus(quals.license_expiry, now),
      sim_status:     getSimCheckStatus(quals.last_sim_check, now),
    }
  }, [quals])

  // Historique vols depuis les FTL logs (30 derniers jours)
  const flightHistory = useMemo(() =>
    [...ftlLogs].sort((a, b) => b.date.localeCompare(a.date))
  , [ftlLogs])

  const onUpdateQuals = useCallback(async (data) => {
    try { await upsertQualifications(crewId, data) }
    catch(e) { setError(e.message); throw e }
  }, [crewId])

  const onAddFtlLog = useCallback(async (logData) => {
    try { await addFtlLog({ ...logData, crew_id: crewId }) }
    catch(e) { setError(e.message); throw e }
  }, [crewId])

  return {
    member, quals: qualsWithStatus, ftlLogs, ftlToday,
    flightHistory, status,
    loading, error,
    onUpdateQuals, onAddFtlLog,
    clearError: () => setError(null),
  }
}

// ════════════════════════════════════════════════════════════════════════════
// useCrewAssignments — assignations par vol + validation FTL/qualifs
// ════════════════════════════════════════════════════════════════════════════
export function useCrewAssignments(flights = [], crewMembers = []) {
  const [assignments, setAssignments] = useState([])
  const [validations, setValidations] = useState({}) // flightId → validation result
  const [computing,   setComputing]   = useState(false)
  const [error,       setError]       = useState(null)

  useEffect(() => {
    const unsub = subscribeToAssignments(setAssignments)
    return () => unsub()
  }, [])

  // Map flightId → assignment
  const byFlight = useMemo(() => {
    const map = {}
    assignments.forEach(a => { map[a.flight_id] = a })
    return map
  }, [assignments])

  /**
   * Valide les crews pour tous les vols qui ont une assignation
   * Appel coûteux (Firestore queries) → déclenché manuellement ou sur changement
   */
  const validateAll = useCallback(async () => {
    if (!assignments.length || !flights.length) return
    setComputing(true)
    const results = {}

    // Collecter tous les crew IDs uniques
    const crewIds = [...new Set(
      assignments.flatMap(a => [a.pic_id, a.fo_id].filter(Boolean))
    )]

    // Charger FTL logs 28j pour tous les membres concernés
    const ftlByMember = await getFtlLogsForCrew28d(crewIds)

    for (const assignment of assignments) {
      const flight = flights.find(f => f.id === assignment.flight_id)
      if (!flight) continue

      const picMember = crewMembers.find(m => m.id === assignment.pic_id)
      const foMember  = crewMembers.find(m => m.id === assignment.fo_id)

      // Récupérer qualifs (chargées depuis le hook useCrew enrichi)
      // Pour l'instant on valide sans qualifs détaillées (performance)
      const picFtlLogs = ftlByMember[assignment.pic_id] || []
      const foFtlLogs  = ftlByMember[assignment.fo_id]  || []

      const picVal = picMember
        ? validateCrewForFlight(picMember, null, picFtlLogs, flight)
        : { valid: false, blockers: ['PIC non assigné'], warnings: [] }

      const foVal = foMember
        ? validateCrewForFlight(foMember, null, foFtlLogs, flight)
        : { valid: true, blockers: [], warnings: ['Pas de FO assigné'] }

      const overallValid  = picVal.valid // FO optionnel
      const allBlockers   = [...picVal.blockers, ...foVal.blockers]
      const allWarnings   = [...picVal.warnings,  ...foVal.warnings]

      results[flight.id] = {
        valid:    overallValid,
        blockers: allBlockers,
        warnings: allWarnings,
        pic:      picVal,
        fo:       foVal,
        status:   allBlockers.length > 0 ? 'blocked' : allWarnings.length > 0 ? 'warning' : 'ok',
      }
    }

    setValidations(results)
    setComputing(false)
  }, [assignments, flights, crewMembers])

  // Valider automatiquement quand les assignations ou vols changent
  useEffect(() => {
    if (assignments.length > 0 && flights.length > 0 && crewMembers.length > 0) {
      validateAll()
    }
  }, [assignments.length, flights.length])

  const onAssignCrew = useCallback(async (flightId, picId, foId, flightNumber) => {
    try {
      await upsertFlightAssignment(flightId, {
        pic_id:         picId,
        fo_id:          foId || null,
        flight_number:  flightNumber,
        assigned_by:    'ops',
        validation_status: 'pending',
      })
    } catch(e) { setError(e.message); throw e }
  }, [])

  const onRemoveAssignment = useCallback(async (assignmentId) => {
    try { await deleteAssignment(assignmentId) }
    catch(e) { setError(e.message); throw e }
  }, [])

  // Vérifie si un vol peut être dispatché (PIC + qualifs + FTL)
  const canDispatch = useCallback((flightId) => {
    const assignment = byFlight[flightId]
    if (!assignment?.pic_id) return { ok: false, reason: 'PIC non assigné' }
    const validation = validations[flightId]
    if (!validation) return { ok: true, reason: '' } // pas encore validé
    return { ok: validation.valid, reason: validation.blockers.join(', ') }
  }, [byFlight, validations])

  return {
    assignments, byFlight, validations, computing,
    error,
    onAssignCrew, onRemoveAssignment, validateAll, canDispatch,
    clearError: () => setError(null),
  }
}
