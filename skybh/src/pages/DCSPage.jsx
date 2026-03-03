/**
 * DCSPage.jsx — Departure Control System
 * SBH Commuter — Accès : agent_sol, ops, admin
 * Route : /dcs (plein écran terrain, tablette/mobile)
 */

import { useState, useEffect, useRef } from 'react'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuth } from '../context/AuthContext'
import PassengerCheckin from '../components/dcs/PassengerCheckin'
import WBCalculator from '../components/dcs/WBCalculator'

const NAVY = '#0B1F3A'
const GOLD = '#C8A951'
const GREEN = '#16a34a'
const RED   = '#dc2626'

const ALLOWED_ROLES = ['admin', 'ops', 'agent_sol']

const toDate  = ts => ts?.toDate ? ts.toDate() : new Date(ts)
const fmtTime = d  => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

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

  return (
    <div
      onClick={() => onSelect(flight)}
      style={{
        background: 'white', borderRadius: 12, padding: '14px 16px',
        border: `2px solid ${selected ? GOLD : isUrgent ? '#fde68a' : '#e5e5e0'}`,
        cursor: 'pointer', transition: 'border-color 0.2s',
        opacity: isPast ? 0.45 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: NAVY, letterSpacing: '0.05em' }}>
            {flight.flight_number || flight.flightNumber}
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
            background: isPast ? '#f0f0ec' : isUrgent ? '#fef3c7' : '#f0f7ff',
            color: isPast ? '#888' : isUrgent ? '#92400e' : '#1e40af',
          }}>
            {isPast
              ? 'Parti'
              : isUrgent
                ? `${diffMin} min`
                : diffMin < 0
                  ? 'En cours'
                  : `${Math.floor(diffMin / 60)}h${String(diffMin % 60).padStart(2, '0')}`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Vue manifeste simple ──────────────────────────────────────
function ManifestTab({ manifest }) {
  if (!manifest) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
        <div style={{ fontWeight: 700, color: NAVY }}>Manifeste non généré</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>
          Effectuez au moins un check-in pour générer le manifeste
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 16px' }}>
      {/* En-tête */}
      <div style={{ background: NAVY, borderRadius: 12, padding: 16, marginBottom: 16, color: 'white' }}>
        <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: '0.12em' }}>MANIFESTE</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{manifest.flightNumber}</div>
        <div style={{ fontSize: 13, color: GOLD, marginTop: 4 }}>
          {manifest.origin} → {manifest.destination} · {manifest.aircraftRegistration}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {[
            { label: 'Pax',      value: manifest.totalPax },
            { label: 'Checkés',  value: manifest.checkedInPax },
            { label: 'Bagages',  value: `${manifest.totalBaggageWeight}kg` },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>{label}</div>
            </div>
          ))}
          {manifest.weightBalance && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: manifest.weightBalance.isValid ? '#86efac' : '#fca5a5' }}>
                {manifest.weightBalance.isValid ? '✓ OK' : '✗ KO'}
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>W&B</div>
            </div>
          )}
        </div>
      </div>

      {/* Liste passagers */}
      {manifest.bookings?.map((b, i) => (
        <div key={b.bookingId} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px', background: 'white', borderRadius: 10,
          marginBottom: 8, border: '1px solid #e5e5e0',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: b.status === 'boarded' ? GREEN : b.status === 'checked_in' ? '#dbeafe' : '#f0f0ec',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800,
            color: b.status === 'boarded' ? 'white' : b.status === 'checked_in' ? NAVY : '#bbb',
          }}>
            {i + 1}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: NAVY }}>
              {b.lastName?.toUpperCase()} {b.firstName}
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>
              {b.docNumber} · {b.baggage || 0} kg bagages
            </div>
          </div>
          <div style={{
            padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
            background: b.status === 'boarded' ? '#dcfce7' : b.status === 'checked_in' ? '#dbeafe' : '#f0f0ec',
            color: b.status === 'boarded' ? GREEN : b.status === 'checked_in' ? NAVY : '#888',
          }}>
            {b.status === 'boarded' ? 'EMBARQUÉ' : b.status === 'checked_in' ? 'CHECKÉ' : 'CONFIRMÉ'}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────
export default function DCSPage() {
  const { user, role } = useAuth()

  const [flights,        setFlights]        = useState([])
  const [selectedFlight, setSelectedFlight] = useState(null)
  const [activeTab,      setActiveTab]      = useState('checkin')
  const [manifest,       setManifest]       = useState(null)
  const [wbResult,       setWbResult]       = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [showFlights,    setShowFlights]    = useState(true)

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

  // ── Vols du jour (Firestore temps réel) ───────────────────
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
          setFlights(data)
          setLoading(false)
          // Auto-sélection du prochain vol
          if (!selectedFlight && data.length > 0) {
            const now  = new Date()
            const next = data.find(f => {
              const dep = f.scheduledDeparture?.toDate?.() || toDate(f.departure_time)
              return dep > now
            })
            setSelectedFlight(next || data[0])
          }
        },
        err => {
          console.error('DCS flights error:', err)
          setLoading(false)
        }
      )
    } catch (err) {
      console.error('DCS query error:', err)
      setLoading(false)
    }

    return () => unsub()
  }, [])

  const selectFlight = (flight) => {
    setSelectedFlight(flight)
    setShowFlights(false)
    setActiveTab('checkin')
    setManifest(null)
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
      }}>
        <div>
          <div style={{ fontSize: 9, color: GOLD, fontWeight: 700, letterSpacing: '0.15em' }}>SBH COMMUTER</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: 'white' }}>DCS — Opérations Sol</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                : `✈ ${selectedFlight.flight_number || selectedFlight.flightNumber}`}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
            padding: '10px 16px',
            background: 'white',
            borderBottom: '1px solid #e5e5e0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <span style={{ fontWeight: 900, fontSize: 15, color: NAVY }}>
                {selectedFlight.flight_number || selectedFlight.flightNumber}
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
          <div style={{ paddingBottom: 40 }}>
            {activeTab === 'checkin' && (
              <PassengerCheckin flight={selectedFlight} />
            )}
            {activeTab === 'wb' && (
              <WBCalculator
                initialRegistration={
                  selectedFlight.aircraft ||
                  selectedFlight.registration ||
                  'F-OSBC'
                }
                onResult={setWbResult}
              />
            )}
            {activeTab === 'manifest' && (
              <ManifestTab manifest={manifest} />
            )}
          </div>

          {/* Badge W&B flottant si résultat et onglet différent */}
          {wbResult && activeTab !== 'wb' && (
            <div style={{
              position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
              padding: '8px 16px', borderRadius: 999,
              background: wbResult.isValid ? '#dcfce7' : '#fee2e2',
              border: `1px solid ${wbResult.isValid ? '#86efac' : '#fca5a5'}`,
              color: wbResult.isValid ? GREEN : RED,
              fontSize: 12, fontWeight: 700,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              zIndex: 60, cursor: 'pointer',
            }}
              onClick={() => setActiveTab('wb')}
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