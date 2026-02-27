import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAircraft } from '../hooks/useAircraft'
import { useFlights } from '../hooks/useFlights'
import { getPotentialPercent, getAlertLevel } from '../services/aircraft'
import { AIRPORTS, FLIGHT_STATUS_LABELS, FLIGHT_STATUS_COLORS } from '../services/flights'

// ─── Météo mock (remplacer par API OpenWeather ou AVWX) ─────────────────────
const WEATHER_STATIONS = [
  { icao: 'TFFJ', name: 'St-Barth', temp: 28, wind: 12, dir: 'ENE', vis: 10, status: 'VFR' },
  { icao: 'TFFG', name: 'St-Martin', temp: 29, wind: 18, dir: 'E', vis: 8, status: 'VFR' },
  { icao: 'TQPF', name: 'Anguilla', temp: 27, wind: 22, dir: 'NE', vis: 6, status: 'MVFR' },
]

// ─── Flotte mock (utilisé si Firestore vide) ────────────────────────────────
const MOCK_FLEET = [
  { id: '1', registration: 'F-OSBH', type: 'Cessna 208', seats: 9, status: 'available', airframe_hours: 4521, engine_hours: 1823, airframe_limit: 12000, engine_limit: 3600 },
  { id: '2', registration: 'F-OSVH', type: 'Cessna 208', seats: 9, status: 'in_flight', airframe_hours: 6234, engine_hours: 2891, airframe_limit: 12000, engine_limit: 3600 },
  { id: '3', registration: 'F-OSHH', type: 'BN Islander', seats: 9, status: 'available', airframe_hours: 8102, engine_hours: 1204, airframe_limit: 15000, engine_limit: 2400 },
  { id: '4', registration: 'F-OSBJ', type: 'Cessna 208B', seats: 9, status: 'maintenance', airframe_hours: 3200, engine_hours: 3480, airframe_limit: 12000, engine_limit: 3600 },
  { id: '5', registration: 'F-OSVJ', type: 'BN Islander', seats: 9, status: 'available', airframe_hours: 11800, engine_hours: 1980, airframe_limit: 15000, engine_limit: 2400 },
  { id: '6', registration: 'F-OSXH', type: 'Cessna 208', seats: 9, status: 'available', airframe_hours: 2100, engine_hours: 980, airframe_limit: 12000, engine_limit: 3600 },
]

// ─── Vols mock ───────────────────────────────────────────────────────────────
const MOCK_FLIGHTS = [
  { id: '1', flight_number: 'SBH101', origin: 'TFFJ', destination: 'TFFG', departure_time: { toDate: () => new Date('2026-02-27T07:30:00') }, arrival_time: { toDate: () => new Date('2026-02-27T07:55:00') }, status: 'landed', pax_count: 8, max_pax: 9 },
  { id: '2', flight_number: 'SBH102', origin: 'TFFG', destination: 'TFFJ', departure_time: { toDate: () => new Date('2026-02-27T08:30:00') }, arrival_time: { toDate: () => new Date('2026-02-27T08:55:00') }, status: 'landed', pax_count: 7, max_pax: 9 },
  { id: '3', flight_number: 'SBH103', origin: 'TFFJ', destination: 'TQPF', departure_time: { toDate: () => new Date('2026-02-27T10:00:00') }, arrival_time: { toDate: () => new Date('2026-02-27T10:30:00') }, status: 'in_flight', pax_count: 5, max_pax: 9 },
  { id: '4', flight_number: 'SBH104', origin: 'TQPF', destination: 'TFFJ', departure_time: { toDate: () => new Date('2026-02-27T11:15:00') }, arrival_time: { toDate: () => new Date('2026-02-27T11:45:00') }, status: 'scheduled', pax_count: 6, max_pax: 9 },
  { id: '5', flight_number: 'SBH105', origin: 'TFFJ', destination: 'TFFG', departure_time: { toDate: () => new Date('2026-02-27T13:00:00') }, arrival_time: { toDate: () => new Date('2026-02-27T13:25:00') }, status: 'scheduled', pax_count: 9, max_pax: 9 },
  { id: '6', flight_number: 'SBH106', origin: 'TFFG', destination: 'TFFJ', departure_time: { toDate: () => new Date('2026-02-27T14:30:00') }, arrival_time: { toDate: () => new Date('2026-02-27T14:55:00') }, status: 'scheduled', pax_count: 4, max_pax: 9 },
]

// ─── Composants UI ───────────────────────────────────────────────────────────

function StatusDot({ status }) {
  const colors = {
    available: 'bg-emerald-400 shadow-emerald-400',
    in_flight: 'bg-amber-400 shadow-amber-400',
    maintenance: 'bg-red-400 shadow-red-400',
  }
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status]} shadow-[0_0_6px_currentColor]`} />
  )
}

function PotentialBar({ current, limit, label }) {
  const pct = getPotentialPercent(current, limit)
  const level = getAlertLevel(pct)
  const barColor = level === 'critical' ? 'bg-red-500' : level === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
  const textColor = level === 'critical' ? 'text-red-400' : level === 'warning' ? 'text-amber-400' : 'text-emerald-400'

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className={textColor}>{pct}% restant</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-gray-500">{current.toFixed(0)} / {limit} h</div>
    </div>
  )
}

function WeatherCard({ station }) {
  const statusColor = station.status === 'VFR' ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5'
    : station.status === 'MVFR' ? 'text-amber-400 border-amber-400/30 bg-amber-400/5'
    : 'text-red-400 border-red-400/30 bg-red-400/5'

  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs text-gray-500 font-mono">{station.icao}</div>
          <div className="text-sm font-semibold text-white">{station.name}</div>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${statusColor}`}>
          {station.status}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-bold text-white">{station.temp}°</div>
          <div className="text-xs text-gray-500">Temp</div>
        </div>
        <div>
          <div className="text-lg font-bold text-white">{station.wind}</div>
          <div className="text-xs text-gray-500">kt {station.dir}</div>
        </div>
        <div>
          <div className="text-lg font-bold text-white">{station.vis}</div>
          <div className="text-xs text-gray-500">km vis</div>
        </div>
      </div>
    </div>
  )
}

function KPICard({ label, value, sub, accent }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 backdrop-blur-sm">
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      <div className="text-sm text-white mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

// ─── Page principale ─────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, role, logout } = useAuth()
  const { fleet: firestoreFleet, loading: fleetLoading } = useAircraft()
  const { flights: firestoreFlights, kpis: firestoreKpis, loading: flightsLoading } = useFlights()
  const [time, setTime] = useState(new Date())
  const [activeTab, setActiveTab] = useState('overview')

  // Utilise mock si Firestore vide
  const fleet = firestoreFleet.length > 0 ? firestoreFleet : MOCK_FLEET
  const flights = firestoreFlights.length > 0 ? firestoreFlights : MOCK_FLIGHTS

  // KPIs calculés
  const kpis = firestoreFlights.length > 0 ? firestoreKpis : {
    total: MOCK_FLIGHTS.length,
    completed: MOCK_FLIGHTS.filter(f => f.status === 'landed').length,
    inFlight: MOCK_FLIGHTS.filter(f => f.status === 'in_flight').length,
    totalPax: MOCK_FLIGHTS.reduce((s, f) => s + f.pax_count, 0),
    fillRate: Math.round(MOCK_FLIGHTS.reduce((s, f) => s + f.pax_count, 0) / MOCK_FLIGHTS.reduce((s, f) => s + f.max_pax, 0) * 100),
  }

  // Alertes maintenance
  const alerts = fleet.filter(a => {
    const ep = getPotentialPercent(a.engine_hours, a.engine_limit)
    const ap = getPotentialPercent(a.airframe_hours, a.airframe_limit)
    return ep <= 20 || ap <= 20 || a.status === 'maintenance'
  })

  // Horloge
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const formatTime = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const formatDate = (d) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const formatFlightTime = (ts) => ts?.toDate?.().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) ?? '--:--'

  const statusLabels = { available: 'Disponible', in_flight: 'En vol', maintenance: 'Maintenance' }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">

      {/* Header */}
      <header className="bg-gray-900/80 border-b border-gray-800 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-black font-bold text-sm">SB</div>
            <div>
              <div className="font-bold text-white leading-none">SKYBH</div>
              <div className="text-xs text-gray-500">SBH Commuter</div>
            </div>
          </div>

          {/* Horloge UTC */}
          <div className="hidden sm:block text-center">
            <div className="font-mono text-amber-400 text-lg leading-none">{formatTime(time)}</div>
            <div className="text-xs text-gray-500 capitalize">{formatDate(time)}</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <div className="text-xs text-white">{user?.email}</div>
              <div className="text-xs text-amber-400 uppercase">{role}</div>
            </div>
            <button onClick={logout} className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors">
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* Nav tabs mobile */}
      <nav className="bg-gray-900 border-b border-gray-800 overflow-x-auto">
        <div className="flex min-w-max px-4">
          {[
            { id: 'overview', label: '📊 Vue globale' },
            { id: 'fleet', label: '✈️ Flotte' },
            { id: 'flights', label: '🗓 Vols' },
            { id: 'weather', label: '🌤 Météo' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ALERTES */}
        {alerts.length > 0 && (
          <div className="bg-red-950/50 border border-red-800/60 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-red-400 text-lg">⚠️</span>
              <span className="font-semibold text-red-300">Alertes maintenance ({alerts.length})</span>
            </div>
            <div className="space-y-2">
              {alerts.map(a => {
                const ep = getPotentialPercent(a.engine_hours, a.engine_limit)
                const ap = getPotentialPercent(a.airframe_hours, a.airframe_limit)
                return (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-bold text-white">{a.registration}</span>
                    {a.status === 'maintenance' && <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded">EN MAINTENANCE</span>}
                    {ep <= 20 && <span className="text-xs bg-amber-900 text-amber-300 px-2 py-0.5 rounded">Moteur {ep}% restant</span>}
                    {ap <= 20 && <span className="text-xs bg-amber-900 text-amber-300 px-2 py-0.5 rounded">Cellule {ap}% restant</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── VUE GLOBALE ── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* KPIs */}
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">KPIs du jour</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPICard label="Vols programmés" value={kpis.total} accent="text-white" />
                <KPICard label="En vol" value={kpis.inFlight} accent="text-amber-400" />
                <KPICard label="Passagers" value={kpis.totalPax} accent="text-sky-400" />
                <KPICard label="Taux remplissage" value={`${kpis.fillRate}%`} accent="text-emerald-400" />
              </div>
            </div>

            {/* Flotte résumé */}
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Flotte — état rapide</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {fleet.map(a => (
                  <div key={a.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-mono font-bold text-white">{a.registration}</div>
                        <div className="text-xs text-gray-400">{a.type}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusDot status={a.status} />
                        <span className="text-xs text-gray-300">{statusLabels[a.status]}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <PotentialBar current={a.engine_hours} limit={a.engine_limit} label="Moteur" />
                      <PotentialBar current={a.airframe_hours} limit={a.airframe_limit} label="Cellule" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Météo résumé */}
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Météo aérodromes</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {WEATHER_STATIONS.map(s => <WeatherCard key={s.icao} station={s} />)}
              </div>
            </div>
          </div>
        )}

        {/* ── FLOTTE ── */}
        {activeTab === 'fleet' && (
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Flotte — {fleet.length} appareils</h2>
            {fleet.map(a => {
              const ep = getPotentialPercent(a.engine_hours, a.engine_limit)
              const ap = getPotentialPercent(a.airframe_hours, a.airframe_limit)
              return (
                <div key={a.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-5 backdrop-blur-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xl font-bold text-white">{a.registration}</span>
                        <StatusDot status={a.status} />
                        <span className="text-sm text-gray-300">{statusLabels[a.status]}</span>
                      </div>
                      <div className="text-sm text-gray-400 mt-0.5">{a.type} — {a.seats} sièges passagers</div>
                    </div>
                    <div className="flex gap-2">
                      {ep <= 10 && <span className="text-xs bg-red-900 text-red-300 px-2 py-1 rounded font-semibold">MOTEUR CRITIQUE</span>}
                      {ep > 10 && ep <= 20 && <span className="text-xs bg-amber-900 text-amber-300 px-2 py-1 rounded">Moteur ⚠️</span>}
                      {ap <= 10 && <span className="text-xs bg-red-900 text-red-300 px-2 py-1 rounded font-semibold">CELLULE CRITIQUE</span>}
                      {ap > 10 && ap <= 20 && <span className="text-xs bg-amber-900 text-amber-300 px-2 py-1 rounded">Cellule ⚠️</span>}
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <PotentialBar current={a.engine_hours} limit={a.engine_limit} label="Potentiel moteur" />
                    <PotentialBar current={a.airframe_hours} limit={a.airframe_limit} label="Potentiel cellule" />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── VOLS ── */}
        {activeTab === 'flights' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Planning du jour — {flights.length} vols</h2>
              <div className="flex gap-3 text-xs text-gray-400">
                <span>✅ {kpis.completed} atterris</span>
                <span>🟡 {kpis.inFlight} en vol</span>
              </div>
            </div>
            <div className="space-y-2">
              {flights.map(f => (
                <div key={f.id} className={`bg-gray-800/60 border rounded-xl p-4 backdrop-blur-sm transition-all ${
                  f.status === 'in_flight' ? 'border-amber-500/40 bg-amber-950/20' :
                  f.status === 'cancelled' ? 'border-red-800/40 opacity-60' :
                  'border-gray-700/50'
                }`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono font-bold text-amber-400 text-sm w-16">{f.flight_number}</span>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm font-semibold text-white">{AIRPORTS[f.origin] || f.origin}</span>
                      <span className="text-gray-500">→</span>
                      <span className="text-sm font-semibold text-white">{AIRPORTS[f.destination] || f.destination}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-400 font-mono">{formatFlightTime(f.departure_time)}</span>
                      <span className="text-gray-600">→</span>
                      <span className="text-gray-400 font-mono">{formatFlightTime(f.arrival_time)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${FLIGHT_STATUS_COLORS[f.status]}`}>
                        {FLIGHT_STATUS_LABELS[f.status]}
                      </span>
                      <span className="text-xs text-gray-500">
                        {f.pax_count}/{f.max_pax} pax
                      </span>
                      {f.pax_count === f.max_pax && <span className="text-xs bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded">FULL</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── MÉTÉO ── */}
        {activeTab === 'weather' && (
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Conditions météo aérodromes</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {WEATHER_STATIONS.map(s => <WeatherCard key={s.icao} station={s} />)}
            </div>
            <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 text-sm text-gray-400">
              <div className="font-semibold text-gray-300 mb-2">Légende conditions</div>
              <div className="space-y-1">
                <div><span className="text-emerald-400 font-semibold">VFR</span> — Visibilité &gt; 5km, plafond &gt; 1000ft — Vol autorisé</div>
                <div><span className="text-amber-400 font-semibold">MVFR</span> — Conditions marginales — Décision pilote requise</div>
                <div><span className="text-red-400 font-semibold">IFR</span> — Conditions dégradées — Vol déconseillé</div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}