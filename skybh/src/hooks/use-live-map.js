/**
 * @fileoverview Hook React — Live Map temps réel SKYBH
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  subscribeToPositions, updatePosition,
  subscribeToTrack, simulateFlightPositions,
  fetchOpenSkyPositions, matchOpenSkyToFleet,
} from '../services/positions.service'
import {
  interpolatePosition, computeETA, AIRPORTS,
  routeIntersectsWeather, WEATHER_ZONES,
} from '../utils/map-utils'

const SIMULATE_INTERVAL_MS = 30000   // re-simuler toutes les 30s
const OPENSKY_INTERVAL_MS  = 60000   // OpenSky toutes les 60s (rate limit)
const INTERP_INTERVAL_MS   = 1000    // interpolation locale toutes les 1s

export function useLiveMap({ flights = [], fleet = [], user = null }) {
  const [positions,    setPositions]    = useState({})   // reg → posData
  const [tracks,       setTracks]       = useState({})   // flightId → {points}
  const [livePositions,setLivePositions]= useState({})   // interpolées temps réel
  const [openSkyData,  setOpenSkyData]  = useState([])
  const [openSkyStatus,setOpenSkyStatus]= useState('idle') // idle|loading|ok|error
  const [simulationOn, setSimulationOn] = useState(true)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)

  const trackUnsubs  = useRef({})
  const simTimerRef  = useRef(null)
  const oskyTimerRef = useRef(null)
  const interpRef    = useRef(null)

  // ── Souscription positions Firestore ────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToPositions(posList => {
      const map = {}
      posList.forEach(p => { map[p.registration] = p })
      setPositions(map)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // ── Souscription tracks pour vols en cours ──────────────────────────────────
  useEffect(() => {
    const inFlightIds = flights.filter(f => f.status === 'in_flight').map(f => f.id)

    // Désabonner les tracks obsolètes
    Object.keys(trackUnsubs.current).forEach(fid => {
      if (!inFlightIds.includes(fid)) {
        trackUnsubs.current[fid]()
        delete trackUnsubs.current[fid]
      }
    })

    // S'abonner aux nouveaux
    inFlightIds.forEach(fid => {
      if (!trackUnsubs.current[fid]) {
        const unsub = subscribeToTrack(fid, track => {
          if (track) setTracks(prev => ({ ...prev, [fid]: track }))
        })
        trackUnsubs.current[fid] = unsub
      }
    })

    return () => {}
  }, [flights])

  // Nettoyage global tracks
  useEffect(() => {
    return () => Object.values(trackUnsubs.current).forEach(u => u())
  }, [])

  // ── Simulation ADS-B ────────────────────────────────────────────────────────
  const runSimulation = useCallback(async () => {
    if (!simulationOn || !flights.length) return
    try { await simulateFlightPositions(flights, fleet) }
    catch (e) { console.warn('[Simulation]', e.message) }
  }, [simulationOn, flights, fleet])

  useEffect(() => {
    if (!simulationOn) return
    runSimulation()
    simTimerRef.current = setInterval(runSimulation, SIMULATE_INTERVAL_MS)
    return () => clearInterval(simTimerRef.current)
  }, [runSimulation, simulationOn])

  // ── Interpolation locale (smooth 1fps) ─────────────────────────────────────
  useEffect(() => {
    interpRef.current = setInterval(() => {
      const now = new Date()
      const live = {}
      Object.entries(positions).forEach(([reg, pos]) => {
        // Trouver le track associé
        const flight = flights.find(f => f.aircraft === reg && f.status === 'in_flight')
        if (flight && tracks[flight.id]?.points?.length) {
          const interp = interpolatePosition(tracks[flight.id].points, now)
          if (interp) { live[reg] = { ...pos, ...interp }; return }
        }
        live[reg] = pos
      })
      setLivePositions(live)
    }, INTERP_INTERVAL_MS)
    return () => clearInterval(interpRef.current)
  }, [positions, tracks, flights])

  // ── OpenSky Network ─────────────────────────────────────────────────────────
  const fetchOpenSky = useCallback(async () => {
    setOpenSkyStatus('loading')
    try {
      const states  = await fetchOpenSkyPositions()
      const matched = matchOpenSkyToFleet(states, flights)
      setOpenSkyData(matched)
      setOpenSkyStatus('ok')

      // Si on trouve des avions réels, mettre à jour Firestore
      for (const m of matched) {
        if (m.aircraft) {
          await updatePosition(m.aircraft, {
            lat: m.lat, lng: m.lng,
            altitude_ft:   m.altitude_ft,
            heading:       m.heading,
            speed_kts:     m.speed_kts,
            vertical_speed_fpm: m.vertical_speed_fpm,
            flight_id:     m.flight_id,
            flight_number: m.flight_number,
            origin:        m.origin,
            destination:   m.destination,
            status:        m.status,
            source:        'opensky',
          })
        }
      }
    } catch (e) {
      setOpenSkyStatus('error')
      setError(`OpenSky : ${e.message}`)
    }
  }, [flights])

  // ── Mise à jour manuelle position ───────────────────────────────────────────
  const handleManualUpdate = useCallback(async (registration, posData) => {
    try {
      await updatePosition(registration, { ...posData, source:'manual' })
    } catch (e) { setError(e.message) }
  }, [])

  // ── ETA dynamiques ──────────────────────────────────────────────────────────
  const etas = useMemo(() => {
    const result = {}
    Object.entries(livePositions).forEach(([reg, pos]) => {
      if (pos.destination && pos.status === 'airborne') {
        const dest = AIRPORTS[pos.destination]
        if (dest && pos.speed_kts > 10) {
          result[reg] = computeETA(pos.lat, pos.lng, dest.lat, dest.lng, pos.speed_kts)
        }
      }
    })
    return result
  }, [livePositions])

  // ── Alertes météo par vol ───────────────────────────────────────────────────
  const weatherAlerts = useMemo(() => {
    const alerts = {}
    flights.filter(f => f.status === 'in_flight').forEach(f => {
      const zones = routeIntersectsWeather(f.origin, f.destination)
      if (zones.length) alerts[f.id] = zones
    })
    return alerts
  }, [flights])

  // ── Avions en vol ───────────────────────────────────────────────────────────
  const airborne = useMemo(() =>
    Object.values(livePositions).filter(p => p.status === 'airborne'),
    [livePositions]
  )

  return {
    positions: livePositions,
    rawPositions: positions,
    tracks,
    etas,
    weatherAlerts,
    airborne,
    openSkyData, openSkyStatus,
    simulationOn, setSimulationOn,
    loading, error,
    onManualUpdate: handleManualUpdate,
    onFetchOpenSky: fetchOpenSky,
    clearError: () => setError(null),
  }
}
