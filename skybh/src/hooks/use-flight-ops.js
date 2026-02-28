/**
 * @fileoverview Hook React — données opérationnelles vols temps réel
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  subscribeToAllPax, addPassenger, updatePassenger,
  checkInPassenger, markNoShow, boardPassenger, deletePassenger,
  subscribeToAllDelays, reportDelay, resolveDelay,
  subscribeToChecklist, initChecklist, checkItem, clearDispatch, resetDispatch,
  updateBriefingNotes, updateFlightDelay,
} from '../services/flight-ops.service'
import { computeOTP, computeOTPByRoute, computeOTPByAircraft, computeDelayCauses } from '../utils/otp-calculator'

export function useFlightOps({ flights = [], user = null }) {
  const [allPax,    setAllPax]    = useState([])
  const [allDelays, setAllDelays] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  // Checklist par vol (chargée à la demande)
  const [checklists, setChecklists] = useState({})
  const clUnsubs = useRef({})

  useEffect(() => {
    const unsubs = [
      subscribeToAllPax(p   => { setAllPax(p);    setLoading(false) }),
      subscribeToAllDelays(d => setAllDelays(d)),
    ]
    return () => {
      unsubs.forEach(u => u())
      Object.values(clUnsubs.current).forEach(u => u())
    }
  }, [])

  // ── Chargement checklist à la demande ─────────────────────────────────────
  const loadChecklist = useCallback((flightId, flightNumber) => {
    if (clUnsubs.current[flightId]) return // déjà souscrit
    // Init si nécessaire puis souscription
    initChecklist(flightId, flightNumber).catch(console.error)
    const unsub = subscribeToChecklist(flightId, cl => {
      setChecklists(prev => ({ ...prev, [flightId]: cl }))
    })
    clUnsubs.current[flightId] = unsub
  }, [])

  // ── OTP calculé ───────────────────────────────────────────────────────────
  const otpGlobal     = useMemo(() => computeOTP(flights),          [flights])
  const otpByRoute    = useMemo(() => computeOTPByRoute(flights),   [flights])
  const otpByAircraft = useMemo(() => computeOTPByAircraft(flights),[flights])
  const delayCauses   = useMemo(() => computeDelayCauses(allDelays),[allDelays])

  // ── Pax par vol ───────────────────────────────────────────────────────────
  const paxByFlight = useMemo(() => {
    const map = {}
    allPax.forEach(p => {
      if (!map[p.flight_id]) map[p.flight_id] = []
      map[p.flight_id].push(p)
    })
    return map
  }, [allPax])

  // ── Retards par vol ───────────────────────────────────────────────────────
  const delaysByFlight = useMemo(() => {
    const map = {}
    allDelays.forEach(d => {
      if (!map[d.flight_id]) map[d.flight_id] = []
      map[d.flight_id].push(d)
    })
    return map
  }, [allDelays])

  // ── Actions passagers ──────────────────────────────────────────────────────
  const onAddPax       = useCallback(async (data)     => { try { await addPassenger(data, user?.uid) }           catch(e) { setError(e.message) } }, [user])
  const onUpdatePax    = useCallback(async (id, data)  => { try { await updatePassenger(id, data) }              catch(e) { setError(e.message) } }, [])
  const onCheckIn      = useCallback(async (id)        => { try { await checkInPassenger(id, user?.uid) }        catch(e) { setError(e.message) } }, [user])
  const onNoShow       = useCallback(async (id)        => { try { await markNoShow(id) }                         catch(e) { setError(e.message) } }, [])
  const onBoard        = useCallback(async (id)        => { try { await boardPassenger(id) }                     catch(e) { setError(e.message) } }, [])
  const onDeletePax    = useCallback(async (id)        => { try { await deletePassenger(id) }                    catch(e) { setError(e.message) } }, [])

  // ── Actions retards ───────────────────────────────────────────────────────
  const onReportDelay  = useCallback(async (data)      => { try { await reportDelay(data, user?.uid);
    await updateFlightDelay(data.flight_id, data.delay_minutes, data.reason_detail, user?.uid) }
    catch(e) { setError(e.message) } }, [user])
  const onResolveDelay = useCallback(async (id)        => { try { await resolveDelay(id) }                      catch(e) { setError(e.message) } }, [])

  // ── Actions checklist ──────────────────────────────────────────────────────
  const onCheckItem     = useCallback(async (flightId, itemId, checked) => {
    try { await checkItem(flightId, itemId, checked, user?.uid) } catch(e) { setError(e.message) }
  }, [user])
  const onClearDispatch = useCallback(async (flightId) => {
    try { await clearDispatch(flightId, user?.uid, user?.email) } catch(e) { setError(e.message) }
  }, [user])
  const onResetDispatch = useCallback(async (flightId) => {
    try { await resetDispatch(flightId) } catch(e) { setError(e.message) }
  }, [])

  // ── Actions briefing ───────────────────────────────────────────────────────
  const onUpdateBriefing = useCallback(async (flightId, notes) => {
    try { await updateBriefingNotes(flightId, notes) } catch(e) { setError(e.message) }
  }, [])

  return {
    allPax, allDelays, checklists, loading, error,
    paxByFlight, delaysByFlight,
    otpGlobal, otpByRoute, otpByAircraft, delayCauses,
    loadChecklist,
    onAddPax, onUpdatePax, onCheckIn, onNoShow, onBoard, onDeletePax,
    onReportDelay, onResolveDelay,
    onCheckItem, onClearDispatch, onResetDispatch,
    onUpdateBriefing,
    clearError: () => setError(null),
  }
}
