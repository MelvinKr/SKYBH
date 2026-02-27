import { useState, useEffect } from 'react'
import { Timestamp } from 'firebase/firestore'
import { addFlight, updateFlight, deleteFlight, duplicateFlight, AIRPORTS_FULL, FLIGHT_STATUS_LABELS } from '../services/flights'

const AIRPORTS = Object.entries(AIRPORTS_FULL).map(([icao, v]) => ({ icao, ...v }))
const STATUSES = Object.entries(FLIGHT_STATUS_LABELS).map(([value, label]) => ({ value, label }))

const toTimeString = (ts) => {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const todayAt = (timeStr) => {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return Timestamp.fromDate(d)
}

export default function FlightModal({ flight, fleet, onClose, onSaved }) {
  const isNew = !flight?.id
  const [form, setForm] = useState({
    flight_number: flight?.flight_number || '',
    origin: flight?.origin || 'TFFJ',
    destination: flight?.destination || 'TNCM',
    departure_time: flight?.departure_time ? toTimeString(flight.departure_time) : '08:00',
    arrival_time: flight?.arrival_time ? toTimeString(flight.arrival_time) : '08:25',
    aircraft: flight?.aircraft || (fleet[0]?.registration || ''),
    pilot: flight?.pilot || '',
    status: flight?.status || 'scheduled',
    pax_count: flight?.pax_count || 0,
    max_pax: flight?.max_pax || 9,
    notes: flight?.notes || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.flight_number || !form.origin || !form.destination || !form.departure_time || !form.aircraft) {
      setError('Champs obligatoires manquants')
      return
    }
    if (form.origin === form.destination) {
      setError('Origine et destination identiques')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const payload = {
        ...form,
        departure_time: todayAt(form.departure_time),
        arrival_time: todayAt(form.arrival_time),
        pax_count: Number(form.pax_count),
        max_pax: Number(form.max_pax),
      }
      if (isNew) await addFlight(payload)
      else await updateFlight(flight.id, payload)
      onSaved?.()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      await deleteFlight(flight.id)
      onSaved?.()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDuplicate = async () => {
    setLoading(true)
    try {
      await duplicateFlight(flight)
      onSaved?.()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl border overflow-hidden" style={{ backgroundColor: '#0B1F3A', borderColor: '#1E3A5F' }}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1E3A5F', backgroundColor: '#071729' }}>
          <div>
            <div className="font-black text-white">{isNew ? '+ Nouveau vol' : `Éditer ${flight.flight_number}`}</div>
            <div className="text-xs" style={{ color: '#5B8DB8' }}>{isNew ? 'Créer une rotation' : 'Modifier les données du vol'}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {error && (
            <div className="rounded-lg px-4 py-2 text-sm" style={{ backgroundColor: 'rgba(127,29,29,0.3)', color: '#FCA5A5', border: '1px solid #7F1D1D' }}>
              {error}
            </div>
          )}

          {/* Numéro de vol */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>N° vol *</label>
              <input value={form.flight_number} onChange={e => set('flight_number', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-white font-mono text-sm border outline-none focus:border-[#F0B429]"
                style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }}
                placeholder="PV801" />
            </div>
            <div>
              <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Avion *</label>
              <select value={form.aircraft} onChange={e => set('aircraft', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }}>
                {fleet.map(a => (
                  <option key={a.registration} value={a.registration}
                    disabled={a.status === 'maintenance'}>
                    {a.registration}{a.status === 'maintenance' ? ' (MAINT.)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Origine / Destination */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Origine *</label>
              <select value={form.origin} onChange={e => set('origin', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }}>
                {AIRPORTS.map(a => <option key={a.icao} value={a.icao}>{a.icao} — {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Destination *</label>
              <select value={form.destination} onChange={e => set('destination', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }}>
                {AIRPORTS.map(a => <option key={a.icao} value={a.icao}>{a.icao} — {a.name}</option>)}
              </select>
            </div>
          </div>

          {/* Horaires */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Départ *</label>
              <input type="time" value={form.departure_time} onChange={e => set('departure_time', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F', colorScheme: 'dark' }} />
            </div>
            <div>
              <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Arrivée *</label>
              <input type="time" value={form.arrival_time} onChange={e => set('arrival_time', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F', colorScheme: 'dark' }} />
            </div>
          </div>

          {/* Pax + Statut */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Pax</label>
              <input type="number" min="0" max="9" value={form.pax_count} onChange={e => set('pax_count', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }} />
            </div>
            <div>
              <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Max pax</label>
              <input type="number" min="1" max="9" value={form.max_pax} onChange={e => set('max_pax', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }} />
            </div>
            <div>
              <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Statut</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Pilote */}
          <div>
            <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Pilote</label>
            <input value={form.pilot} onChange={e => set('pilot', e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
              style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }}
              placeholder="Nom du pilote commandant de bord" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429] resize-none"
              style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }}
              placeholder="Observations opérationnelles..." />
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t flex flex-wrap items-center justify-between gap-3"
          style={{ borderColor: '#1E3A5F', backgroundColor: '#071729' }}>

          <div className="flex gap-2">
            {!isNew && (
              <>
                <button onClick={handleDuplicate} disabled={loading}
                  className="text-xs px-3 py-2 rounded-lg border transition-colors"
                  style={{ borderColor: '#1E3A5F', color: '#5B8DB8' }}>
                  ⎘ Dupliquer
                </button>
                {confirmDelete ? (
                  <div className="flex gap-2">
                    <button onClick={handleDelete} disabled={loading}
                      className="text-xs px-3 py-2 rounded-lg font-bold"
                      style={{ backgroundColor: '#7F1D1D', color: '#FCA5A5' }}>
                      Confirmer suppression
                    </button>
                    <button onClick={() => setConfirmDelete(false)}
                      className="text-xs px-3 py-2 rounded-lg border"
                      style={{ borderColor: '#1E3A5F', color: '#5B8DB8' }}>
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} disabled={loading}
                    className="text-xs px-3 py-2 rounded-lg border transition-colors"
                    style={{ borderColor: '#7F1D1D', color: '#F87171' }}>
                    🗑 Supprimer
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={onClose}
              className="text-sm px-4 py-2 rounded-lg border transition-colors"
              style={{ borderColor: '#1E3A5F', color: '#5B8DB8' }}>
              Annuler
            </button>
            <button onClick={handleSave} disabled={loading}
              className="text-sm px-5 py-2 rounded-lg font-bold transition-colors"
              style={{ backgroundColor: loading ? '#1E3A5F' : '#F0B429', color: '#0B1F3A' }}>
              {loading ? 'Enregistrement...' : isNew ? '+ Créer le vol' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}