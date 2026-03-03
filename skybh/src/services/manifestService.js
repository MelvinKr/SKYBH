import {
  doc, getDoc, updateDoc, setDoc,
  serverTimestamp, onSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'
import { getBookingsByFlight } from './bookingService'
import { getPassenger } from './passengerService'
import { calculateWB } from '../utils/weightBalance'

const COL = 'manifests'

export const MANIFEST_STATUS = {
  OPEN:      'open',
  CLOSED:    'closed',
  DEPARTED:  'departed',
  CANCELLED: 'cancelled',
}

// ── Normalise un objet vol quelle que soit la convention de nommage ──
// Accepte : flight_number ou flightNumber, departure_time ou scheduledDeparture, etc.
function normalizeFlightData(flightData) {
  // Convertit un Timestamp Firestore ou un objet mock { toDate: fn } en Date JS
  const resolveDate = (val) => {
    if (!val) return null
    if (val?.toDate) return val.toDate()   // Timestamp Firestore ou mock
    if (val instanceof Date) return val
    return new Date(val)
  }

  return {
    flightNumber:       flightData.flightNumber
                     || flightData.flight_number
                     || '',
    registration:       flightData.registration
                     || flightData.aircraft
                     || '',
    origin:             flightData.origin      || '',
    destination:        flightData.destination || '',
    scheduledDeparture: resolveDate(            // ← résout toDate() avant setDoc
                          flightData.scheduledDeparture ||
                          flightData.departure_time
                        ),
    fuelKg:             flightData.fuelKg    || 0,
    tripFuelKg:         flightData.tripFuelKg || 0,
  }
}

/** Récupère le manifeste d'un vol */
export async function getManifestByFlight(flightId) {
  try {
    const snap = await getDoc(doc(db, COL, flightId))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  } catch (err) {
    throw new Error(`Manifeste introuvable : ${err.message}`)
  }
}

/** Écoute temps réel du manifeste */
export function subscribeToManifest(flightId, onData, onError) {
  return onSnapshot(
    doc(db, COL, flightId),
    snap => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  )
}

/**
 * Génère ou met à jour le manifeste d'un vol
 * @param {string} flightId
 * @param {Object} flightData - Données du vol (convention snake_case ou camelCase acceptée)
 * @param {string} agentId
 */
export async function generateManifest(flightId, flightData, agentId) {
  try {
    // 0. Normaliser les champs vol (snake_case ↔ camelCase)
    const flight = normalizeFlightData(flightData)

    // 1. Récupérer toutes les réservations du vol
    const bookings = await getBookingsByFlight(flightId)

    // 2. Enrichir avec les données passagers
    const enrichedBookings = await Promise.all(
      bookings.map(async booking => {
        try {
          const passenger = await getPassenger(booking.passengerId)
          return { ...booking, passenger }
        } catch {
          return { ...booking, passenger: null }
        }
      })
    )

    // 3. Passagers actifs (excluant annulés et no-show)
    const activeBookings = enrichedBookings.filter(b =>
      ['confirmed', 'checked_in', 'boarded'].includes(b.status)
    )

    // 4. Calcul W&B (optionnel — ne bloque pas si erreur)
    let weightBalance = null
    if (flight.registration) {
      const loadItems = activeBookings.map((b, i) => ({
        station: assignSeatStation(b.seatNumber, i),
        weight:  b.passenger?.weight || 84,
        label:   `${b.passenger?.lastName || '?'} ${b.passenger?.firstName || ''}`,
      }))
      try {
        weightBalance = calculateWB(
          flight.registration,
          loadItems,
          flight.fuelKg,
          flight.tripFuelKg
        )
      } catch (wbErr) {
        console.warn('[Manifest] W&B skipped:', wbErr.message)
      }
    }

    // 5. Snapshot dénormalisé pour impression offline
    const manifestData = {
      flightId,
      flightNumber:         flight.flightNumber,
      aircraftRegistration: flight.registration,
      origin:               flight.origin,
      destination:          flight.destination,
      scheduledDeparture:   flight.scheduledDeparture,
      status:               MANIFEST_STATUS.OPEN,
      totalPax:             activeBookings.length,
      checkedInPax:         activeBookings.filter(b =>
                              ['checked_in', 'boarded'].includes(b.status)
                            ).length,
      totalBaggageWeight:   activeBookings.reduce((s, b) => s + (b.baggageWeight || 0), 0),
      bookings: activeBookings.map(b => ({
        bookingId:   b.id,
        passengerId: b.passengerId,
        lastName:    b.passenger?.lastName    || '',
        firstName:   b.passenger?.firstName   || '',
        nationality: b.passenger?.nationality || '',
        docType:     b.passenger?.documentType   || '',
        docNumber:   b.passenger?.documentNumber || '',
        weight:      b.passenger?.weight || 84,
        baggage:     b.baggageWeight || 0,
        status:      b.status,
        seat:        b.seatNumber || '',
      })),
      weightBalance,
      generatedBy: agentId,
      generatedAt: serverTimestamp(),
      updatedAt:   serverTimestamp(),
    }

    // 6. Upsert — même ID que le flightId pour accès direct
    await setDoc(doc(db, COL, flightId), manifestData, { merge: true })
    return manifestData

  } catch (err) {
    throw new Error(`Génération manifeste échouée : ${err.message}`)
  }
}

/** Clôture le manifeste — plus de check-in possible */
export async function closeManifest(flightId, agentId) {
  try {
    await updateDoc(doc(db, COL, flightId), {
      status:    MANIFEST_STATUS.CLOSED,
      closedBy:  agentId,
      closedAt:  serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    throw new Error(`Clôture manifeste échouée : ${err.message}`)
  }
}

/** Marque le vol comme parti */
export async function departFlight(flightId, agentId) {
  try {
    await updateDoc(doc(db, COL, flightId), {
      status:          MANIFEST_STATUS.DEPARTED,
      actualDeparture: serverTimestamp(),
      departedBy:      agentId,
      updatedAt:       serverTimestamp(),
    })
  } catch (err) {
    throw new Error(`Départ vol échoué : ${err.message}`)
  }
}

/**
 * Formate le manifeste pour impression thermique terrain
 * @param {Object} manifest
 * @returns {string}
 */
export function formatManifestForPrint(manifest) {
  const line = '─'.repeat(40)
  const lines = [
    'ST BARTH COMMUTER',
    `MANIFESTE VOL ${manifest.flightNumber || '--'}`,
    line,
    `${manifest.origin} → ${manifest.destination}`,
    `Appareil : ${manifest.aircraftRegistration || '--'}`,
    `Dep. prévu : ${formatDateTime(manifest.scheduledDeparture)}`,
    line,
    `PAX : ${manifest.totalPax}  |  Bagages : ${manifest.totalBaggageWeight} kg`,
    line,
    '',
    'N°  NOM                    DOC         BAG  STAT',
    line,
  ]

  ;(manifest.bookings || []).forEach((b, i) => {
    const num    = String(i + 1).padStart(2, '0')
    const name   = `${b.lastName} ${b.firstName}`.substring(0, 22).padEnd(22)
    const docNum = (b.docNumber || '--').substring(0, 10).padEnd(10)
    const bag    = String(b.baggage || 0).padStart(3) + 'kg'
    const status = b.status === 'checked_in' ? 'CI' : b.status === 'boarded' ? 'OK' : '--'
    lines.push(`${num}  ${name}  ${docNum}  ${bag}  ${status}`)
  })

  lines.push(line)

  if (manifest.weightBalance) {
    const wb = manifest.weightBalance
    lines.push('')
    lines.push('W&B')
    lines.push(`ZFW : ${wb.zeroFuelWeight} kg  CG : ${wb.zeroFuelCG?.toFixed(3)} m`)
    lines.push(`TOW : ${wb.takeoffWeight} kg  CG : ${wb.takeoffCG?.toFixed(3)} m`)
    lines.push(`MTOW: ${wb.config?.mtow} kg  ${wb.isValid ? 'CONFORME' : '*** NON CONFORME ***'}`)
  }

  lines.push(line)
  lines.push(`Généré le ${new Date().toLocaleString('fr-FR')}`)
  lines.push(`Agent : ${manifest.generatedBy || '--'}`)

  return lines.join('\n')
}

// ── Helpers privés ────────────────────────────────────────────

function assignSeatStation(seatNumber, index) {
  if (seatNumber) {
    const n = parseInt(seatNumber)
    if (n <= 2) return 'row1'
    if (n <= 4) return 'row2'
    if (n <= 6) return 'row3'
    if (n <= 8) return 'row4'
    return 'row5'
  }
  const stations = ['row1','row1','row2','row2','row3','row3','row4','row4','row5']
  return stations[index % stations.length]
}

function formatDateTime(timestamp) {
  if (!timestamp) return '--'
  try {
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return d.toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return '--'
  }
}