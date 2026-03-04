/**
 * DCSPage.jsx — Departure Control System
 * SBH Commuter — Accès : agent_sol, ops, admin
 * Route : /dcs (plein écran terrain, tablette/mobile)
 */

import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuth } from '../context/AuthContext'
import { useDCS } from '../hooks/useDCS'
import PassengerCheckin from '../components/dcs/PassengerCheckin'
import WBCalculator from '../components/dcs/WBCalculator'

const NAVY  = '#0B1F3A'
const GOLD  = '#C8A951'
const GREEN = '#16a34a'
const RED   = '#dc2626'

const ALLOWED_ROLES = ['admin', 'ops', 'agent_sol']

const toDate  = ts => ts?.toDate ? ts.toDate() : new Date(ts)
const fmtTime = d  => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

// ── Mock fallback (même données que le dashboard) ─────────────
const mkDate = (h, m) => {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return { toDate: () => d }
}

const MOCK_FLIGHTS = [
  { id:'1',  flightNumber:'PV801', flight_number:'PV801', origin:'TFFJ', destination:'TNCM', scheduledDeparture:mkDate(6,30),  departure_time:mkDate(6,30),  arrival_time:mkDate(6,55),  status:'landed',    pax_count:8, max_pax:9, aircraft:'F-OSBC', registration:'F-OSBC' },
  { id:'2',  flightNumber:'PV802', flight_number:'PV802', origin:'TNCM', destination:'TFFJ', scheduledDeparture:mkDate(7,30),  departure_time:mkDate(7,30),  arrival_time:mkDate(7,55),  status:'landed',    pax_count:9, max_pax:9, aircraft:'F-OSBC', registration:'F-OSBC' },
  { id:'3',  flightNumber:'PV803', flight_number:'PV803', origin:'TFFJ', destination:'TFFG', scheduledDeparture:mkDate(8,0),   departure_time:mkDate(8,0),   arrival_time:mkDate(8,20),  status:'landed',    pax_count:7, max_pax:9, aircraft:'F-OSBM', registration:'F-OSBM' },
  { id:'4',  flightNumber:'PV804', flight_number:'PV804', origin:'TFFG', destination:'TFFJ', scheduledDeparture:mkDate(9,0),   departure_time:mkDate(9,0),   arrival_time:mkDate(9,20),  status:'in_flight', pax_count:5, max_pax:9, aircraft:'F-OSBM', registration:'F-OSBM' },
  { id:'5',  flightNumber:'PV805', flight_number:'PV805', origin:'TFFJ', destination:'TNCM', scheduledDeparture:mkDate(9,30),  departure_time:mkDate(9,30),  arrival_time:mkDate(9,55),  status:'scheduled', pax_count:6, max_pax:9, aircraft:'F-OSBS', registration:'F-OSBS' },
  { id:'6',  flightNumber:'PV806', flight_number:'PV806', origin:'TNCM', destination:'TFFJ', scheduledDeparture:mkDate(10,45), departure_time:mkDate(10,45), arrival_time:mkDate(11,10), status:'scheduled', pax_count:8, max_pax:9, aircraft:'F-OSBS', registration:'F-OSBS' },
  { id:'7',  flightNumber:'PV807', flight_number:'PV807', origin:'TFFJ', destination:'TFFG', scheduledDeparture:mkDate(11,0),  departure_time:mkDate(11,0),  arrival_time:mkDate(11,20), status:'scheduled', pax_count:9, max_pax:9, aircraft:'F-OSJR', registration:'F-OSJR' },
  { id:'8',  flightNumber:'PV808', flight_number:'PV808', origin:'TFFG', destination:'TFFJ', scheduledDeparture:mkDate(12,0),  departure_time:mkDate(12,0),  arrival_time:mkDate(12,20), status:'scheduled', pax_count:4, max_pax:9, aircraft:'F-OSJR', registration:'F-OSJR' },
  { id:'9',  flightNumber:'PV809', flight_number:'PV809', origin:'TFFJ', destination:'TNCM', scheduledDeparture:mkDate(13,30), departure_time:mkDate(13,30), arrival_time:mkDate(13,55), status:'scheduled', pax_count:7, max_pax:9, aircraft:'F-OSBC', registration:'F-OSBC' },
  { id:'10', flightNumber:'PV810', flight_number:'PV810', origin:'TNCM', destination:'TFFJ', scheduledDeparture:mkDate(14,30), departure_time:mkDate(14,30), arrival_time:mkDate(14,55), status:'scheduled', pax_count:6, max_pax:9, aircraft:'F-OSBM', registration:'F-OSBM' },
  { id:'11', flightNumber:'PV811', flight_number:'PV811', origin:'TFFJ', destination:'TFFG', scheduledDeparture:mkDate(15,30), departure_time:mkDate(15,30), arrival_time:mkDate(15,50), status:'scheduled', pax_count:5, max_pax:9, aircraft:'F-OSBS', registration:'F-OSBS' },
  { id:'12', flightNumber:'PV812', flight_number:'PV812', origin:'TFFG', destination:'TFFJ', scheduledDeparture:mkDate(16,30), departure_time:mkDate(16,30), arrival_time:mkDate(16,50), status:'scheduled', pax_count:8, max_pax:9, aircraft:'F-OSJR', registration:'F-OSJR' },
]

// ── Onglets DCS ───────────────────────────────────────────────
const TABS = [
  { id: 'checkin',  label: 'Check-in',  icon: '✓' },
  { id: 'wb',       label: 'W&B',       icon: '⚖' },
  { id: 'manifest', label: 'Manifeste', icon: '📋' },
]

// ── Carte vol sélectionnable ──────────────────────────────────
function FlightCard({ flight, selected, onSelect }) {
  const depTime  = flight.scheduledDeparture?.toDate?.() || toDate(flight.departure_time)
  const diffMin  = Math.round((depTime - new Date()) / 60000)
  const isUrgent = diffMin > 0 && diffMin < 30
  const isPast   = diffMin < -60

  const statusColors = {
    landed:    { bg: '#f0f0ec', color: '#888',    label: 'Atterri'      },
    in_flight: { bg: '#fef9c3', color: '#92400e', label: 'En vol'       },
    scheduled: { bg: '#f0f7ff', color: '#1e40af', label: 'Programmé'    },
    boarding:  { bg: '#dcfce7', color: '#15803d', label: 'Embarquement' },
    cancelled: { bg: '#fee2e2', color: '#991b1b', label: 'Annulé'       },
  }
  const sc = statusColors[flight.status] || statusColors.scheduled

  return (
    <div
      onClick={() => onSelect(flight)}
      style={{
        background: 'white', borderRadius: 12, padding: '14px 16px',
        border: `2px solid ${selected ? GOLD : isUrgent ? '#fde68a' : '#e5e5e0'}`,
        cursor: 'pointer', transition: 'border-color 0.2s',
        opacity: isPast ? 0.45 : 1,
        boxShadow: selected ? `0 0 0 3px ${GOLD}22` : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: NAVY, letterSpacing: '0.05em' }}>
            {flight.flightNumber || flight.flight_number}
          </div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
            {flight.origin} → {flight.destination}
          </div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
            {flight.aircraft || flight.registration}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: isUrgent ? '#ea580c' : NAVY }}>
            {fmtTime(depTime)}
          </div>
          <div style={{
            marginTop: 4, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
            background: sc.bg, color: sc.color,
          }}>
            {isPast ? 'Parti' : isUrgent ? `${diffMin} min` : sc.label}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Onglet Manifeste — branché sur useDCS ─────────────────────
function ManifestTab({ flight }) {
  const { manifest, handleGenerateManifest, loading } = useDCS(flight?.id, flight)

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        Chargement...
      </div>
    )
  }

  if (!manifest) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
        <div style={{ fontWeight: 700, color: NAVY }}>Manifeste non généré</div>
        <div style={{ fontSize: 12, marginTop: 6, color: '#aaa' }}>
          Effectuez au moins un check-in puis générez le manifeste
        </div>
        <button
          onClick={handleGenerateManifest}
          style={{
            marginTop: 20, padding: '14px 28px', borderRadius: 12,
            background: NAVY, color: 'white', border: 'none',
            fontSize: 14, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.03em',
          }}
        >
          ↻ Générer le manifeste
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 16px 32px' }}>
      {/* En-tête manifeste */}
      <div style={{ background: NAVY, borderRadius: 12, padding: 16, marginBottom: 16, color: 'white' }}>
        <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: '0.12em' }}>MANIFESTE DE VOL</div>
        <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4, letterSpacing: '0.05em' }}>
          {manifest.flightNumber}
        </div>
        <div style={{ fontSize: 13, color: GOLD, marginTop: 4 }}>
          {manifest.origin} → {manifest.destination} · {manifest.aircraftRegistration}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {[
            { label: 'Pax total', value: manifest.totalPax },
            { label: 'Checkés',   value: manifest.checkedInPax },
            { label: 'Embarqués', value: manifest.boardedPax ?? '—' },
            { label: 'Bagages',   value: `${manifest.totalBaggageWeight ?? 0} kg` },
          ].map(({ label, value }) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'white' }}>{value}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
            </div>
          ))}
          {manifest.weightBalance && (
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: manifest.weightBalance.isValid ? '#86efac' : '#fca5a5' }}>
                {manifest.weightBalance.isValid ? '✓ OK' : '✗ KO'}
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginTop: 2 }}>W&B</div>
            </div>
          )}
        </div>
      </div>

      {/* Statut manifeste */}
      <div style={{
        padding: '10px 14px', borderRadius: 10, marginBottom: 16,
        background: manifest.status === 'departed' ? '#dcfce7'
                  : manifest.status === 'closed'   ? '#fef9c3'
                  : '#f0f7ff',
        border: `1px solid ${manifest.status === 'departed' ? '#86efac'
                            : manifest.status === 'closed'   ? '#fde68a'
                            : '#93c5fd'}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 16 }}>
          {manifest.status === 'departed' ? '✈' : manifest.status === 'closed' ? '🔒' : '📋'}
        </span>
        <div>
          <div style={{
            fontWeight: 700, fontSize: 12,
            color: manifest.status === 'departed' ? GREEN
                 : manifest.status === 'closed'   ? '#92400e'
                 : '#1e40af',
          }}>
            {manifest.status === 'departed' ? 'Vol parti'
           : manifest.status === 'closed'   ? 'Manifeste clôturé'
           : 'Manifeste ouvert'}
          </div>
          {manifest.generatedAt && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
              Généré le {manifest.generatedAt?.toDate?.()?.toLocaleString('fr-FR') ?? '—'}
            </div>
          )}
        </div>
      </div>

      {/* Liste passagers */}
      {(!manifest.bookings || manifest.bookings.length === 0) ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#aaa', fontSize: 13 }}>
          Aucun passager dans ce manifeste
        </div>
      ) : manifest.bookings.map((b, i) => (
        <div key={b.bookingId || i} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px', background: 'white', borderRadius: 10,
          marginBottom: 8, border: '1px solid #e5e5e0',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: b.status === 'boarded'    ? GREEN
                      : b.status === 'checked_in' ? '#dbeafe'
                      : '#f0f0ec',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800,
            color: b.status === 'boarded'    ? 'white'
                 : b.status === 'checked_in' ? NAVY
                 : '#bbb',
          }}>
            {i + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {b.lastName?.toUpperCase()} {b.firstName}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
              {b.docNumber || '—'}
              {b.seatNumber && ` · Siège ${b.seatNumber}`}
              {(b.baggage ?? b.baggageWeight) > 0 && ` · ${b.baggage ?? b.baggageWeight} kg`}
            </div>
          </div>
          <div style={{
            padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, flexShrink: 0,
            background: b.status === 'boarded'    ? '#dcfce7'
                      : b.status === 'checked_in' ? '#dbeafe'
                      : '#f0f0ec',
            color: b.status === 'boarded'    ? GREEN
                 : b.status === 'checked_in' ? NAVY
                 : '#888',
          }}>
            {b.status === 'boarded'    ? 'EMBARQUÉ'
           : b.status === 'checked_in' ? 'CHECKÉ'
           : 'CONFIRMÉ'}
          </div>
        </div>
      ))}

      {/* Bouton regénérer */}
      {manifest.status !== 'departed' && (
        <button
          onClick={handleGenerateManifest}
          style={{
            width: '100%', marginTop: 16, padding: '14px', borderRadius: 12,
            border: `2px solid ${NAVY}`, background: 'white', color: NAVY,
            fontSize: 14, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.03em',
          }}
        >
          ↻ Regénérer le manifeste
        </button>
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────
export default function DCSPage() {
  const { role } = useAuth()

  const [flights,        setFlights]        = useState([])
  const [selectedFlight, setSelectedFlight] = useState(null)
  const [activeTab,      setActiveTab]      = useState('checkin')
  const [wbResult,       setWbResult]       = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [showFlights,    setShowFlights]    = useState(true)
  const [usingMock,      setUsingMock]      = useState(false)

  // ── Accès restreint ───────────────────────────────────────
  if (!ALLOWED_ROLES.includes(role)) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f5f5f0', fontFamily: 'Helvetica Neue, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <div style={{ fontWeight: 800, color: NAVY, fontSize: 16 }}>Accès non autorisé</div>
          <div style={{ color: '#888', fontSize: 13, marginTop: 6 }}>
            Rôle requis : agent_sol, ops ou admin
          </div>
        </div>
      </div>
    )
  }

  // ── Vols du jour (Firestore + fallback mock) ──────────────
  useEffect(() => {
    const today    = new Date(); today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)

    let unsub = () => {}
    try {
      const q = query(
        collection(db, 'flight_plans'),
        where('scheduledDeparture', '>=', today),
        where('scheduledDeparture', '<', tomorrow),
        orderBy('scheduledDeparture', 'asc')
      )
      unsub = onSnapshot(
        q,
        snap => {
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          if (data.length > 0) {
            setFlights(data)
            setUsingMock(false)
          } else {
            setFlights(MOCK_FLIGHTS)
            setUsingMock(true)
          }
          setLoading(false)
        },
        err => {
          console.error('DCS flights error:', err)
          setFlights(MOCK_FLIGHTS)
          setUsingMock(true)
          setLoading(false)
        }
      )
    } catch (err) {
      console.error('DCS query error:', err)
      setFlights(MOCK_FLIGHTS)
      setUsingMock(true)
      setLoading(false)
    }

    return () => unsub()
  }, [])

  // Auto-sélection prochain vol
  useEffect(() => {
    if (!selectedFlight && flights.length > 0) {
      const now  = new Date()
      const next = flights.find(f => {
        const dep = f.scheduledDeparture?.toDate?.() || toDate(f.departure_time)
        return dep > now
      })
      setSelectedFlight(next || flights[0])
    }
  }, [flights, selectedFlight])

  const selectFlight = (flight) => {
    setSelectedFlight(flight)
    setShowFlights(false)
    setActiveTab('checkin')
    setWbResult(null)
  }

  return (
    <div style={{
      fontFamily: 'Helvetica Neue, sans-serif',
      minHeight: '100vh',
      background: '#f5f5f0',
      maxWidth: 520,
      margin: '0 auto',
      color: NAVY,
    }}>

      {/* ── Top bar ── */}
      <div style={{
        background: NAVY, padding: '12px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 50,
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}>
        <div>
          <div style={{ fontSize: 9, color: GOLD, fontWeight: 700, letterSpacing: '0.15em' }}>SBH COMMUTER</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: 'white' }}>DCS — Opérations Sol</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {usingMock && (
            <span style={{
              padding: '3px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700,
              background: 'rgba(200,169,81,0.2)', color: GOLD, border: `1px solid ${GOLD}44`,
            }}>DEMO</span>
          )}
          {selectedFlight && (
            <button
              onClick={() => setShowFlights(v => !v)}
              style={{
                padding: '7px 14px', borderRadius: 8,
                background: showFlights ? GOLD : 'rgba(255,255,255,0.1)',
                border: 'none',
                color: showFlights ? NAVY : 'white',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {showFlights
                ? '✕ Fermer'
                : `✈ ${selectedFlight.flightNumber || selectedFlight.flight_number}`}
            </button>
          )}
        </div>
      </div>

      {/* ── Sélecteur vols ── */}
      {showFlights && (
        <div style={{ padding: '16px 16px 8px' }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#888',
            letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12,
          }}>
            Vols du jour — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
              Chargement des vols...
            </div>
          ) : flights.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div style={{ fontWeight: 700, color: NAVY }}>Aucun vol planifié aujourd'hui</div>
              <div style={{ fontSize: 12, marginTop: 6, color: '#aaa' }}>
                Les vols apparaissent ici une fois planifiés dans SKYBH
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 16 }}>
              {flights.map(f => (
                <FlightCard
                  key={f.id}
                  flight={f}
                  selected={selectedFlight?.id === f.id}
                  onSelect={selectFlight}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Contenu principal ── */}
      {selectedFlight && !showFlights && (
        <>
          {/* Tabs */}
          <div style={{
            display: 'flex', background: 'white',
            borderBottom: '2px solid #e5e5e0',
            position: 'sticky', top: 52, zIndex: 40,
          }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, padding: '13px 8px',
                  border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: `3px solid ${activeTab === tab.id ? GOLD : 'transparent'}`,
                  color: activeTab === tab.id ? NAVY : '#888',
                  fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 16 }}>{tab.icon}</div>
                <div style={{ marginTop: 2 }}>{tab.label}</div>
              </button>
            ))}
          </div>

          {/* Badge vol sélectionné */}
          <div style={{
            padding: '10px 16px', background: 'white',
            borderBottom: '1px solid #e5e5e0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <span style={{ fontWeight: 900, fontSize: 15, color: NAVY }}>
                {selectedFlight.flightNumber || selectedFlight.flight_number}
              </span>
              <span style={{ fontSize: 13, color: '#666', marginLeft: 8 }}>
                {selectedFlight.origin} → {selectedFlight.destination}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#999' }}>
              {selectedFlight.aircraft || selectedFlight.registration}
            </div>
          </div>

          {/* Tab content */}
          <div style={{ paddingBottom: 60 }}>
            {activeTab === 'checkin' && (
              <PassengerCheckin flight={selectedFlight} />
            )}
            {activeTab === 'wb' && (
              <WBCalculator
                initialRegistration={selectedFlight.aircraft || selectedFlight.registration || 'F-OSBC'}
                onResult={setWbResult}
                flightId={selectedFlight?.id}
              />
            )}
            {activeTab === 'manifest' && (
              <ManifestTab flight={selectedFlight} />
            )}
          </div>

          {/* Badge W&B flottant */}
          {wbResult && activeTab !== 'wb' && (
            <div
              onClick={() => setActiveTab('wb')}
              style={{
                position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                padding: '8px 16px', borderRadius: 999,
                background: wbResult.isValid ? '#dcfce7' : '#fee2e2',
                border: `1px solid ${wbResult.isValid ? '#86efac' : '#fca5a5'}`,
                color: wbResult.isValid ? GREEN : RED,
                fontSize: 12, fontWeight: 700,
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                zIndex: 60, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              W&B {wbResult.isValid ? '✓ CONFORME' : '✗ HORS LIMITES'} · {wbResult.takeoffWeight} kg
            </div>
          )}
        </>
      )}

      {/* ── État vide ── */}
      {!selectedFlight && !showFlights && (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✈</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>Sélectionnez un vol</div>
          <button
            onClick={() => setShowFlights(true)}
            style={{
              marginTop: 16, padding: '12px 24px', borderRadius: 10,
              background: NAVY, color: 'white', border: 'none',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Voir les vols
          </button>
        </div>
      )}
    </div>
  )
}