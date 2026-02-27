import { useState, useEffect } from 'react'
import { addAircraft, updateAircraft, deleteAircraft, addMaintenanceRecord, getMaintenanceHistory } from '../services/aircraft'

const STATUS_OPTIONS = [
  { value: 'available',   label: 'Disponible',   color: '#4ADE80' },
  { value: 'in_flight',   label: 'En vol',        color: '#F0B429' },
  { value: 'maintenance', label: 'Maintenance',   color: '#F87171' },
]

export default function AircraftModal({ aircraft, onClose, onSaved }) {
  const isNew = !aircraft?.id
  const [tab, setTab] = useState('info')
  const [form, setForm] = useState({
    registration: aircraft?.registration || '',
    type: aircraft?.type || 'Cessna 208B Grand Caravan',
    msn: aircraft?.msn || '',
    year: aircraft?.year || new Date().getFullYear(),
    seats: aircraft?.seats || 9,
    status: aircraft?.status || 'available',
    airframe_hours: aircraft?.airframe_hours || 0,
    engine_hours: aircraft?.engine_hours || 0,
    airframe_limit: aircraft?.airframe_limit || 20000,
    engine_limit: aircraft?.engine_limit || 3600,
    notes: aircraft?.notes || '',
  })
  const [maintForm, setMaintForm] = useState({ type: 'inspection', description: '', hours: '', technician: '', date: new Date().toISOString().split('T')[0] })
  const [history, setHistory] = useState([])
  const [histLoading, setHistLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setM = (k, v) => setMaintForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (tab === 'history' && aircraft?.id) {
      setHistLoading(true)
      getMaintenanceHistory(aircraft.id)
        .then(setHistory)
        .finally(() => setHistLoading(false))
    }
  }, [tab, aircraft?.id])

  const handleSave = async () => {
    if (!form.registration) { setError('Immatriculation obligatoire'); return }
    setLoading(true); setError(null)
    try {
      const payload = {
        ...form,
        year: Number(form.year),
        seats: Number(form.seats),
        airframe_hours: Number(form.airframe_hours),
        engine_hours: Number(form.engine_hours),
        airframe_limit: Number(form.airframe_limit),
        engine_limit: Number(form.engine_limit),
      }
      if (isNew) await addAircraft(payload)
      else await updateAircraft(aircraft.id, payload)
      onSaved?.(); onClose()
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleDelete = async () => {
    setLoading(true)
    try { await deleteAircraft(aircraft.id); onSaved?.(); onClose() }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleAddMaint = async () => {
    if (!maintForm.description) { setError('Description maintenance requise'); return }
    setLoading(true); setError(null)
    try {
      await addMaintenanceRecord(aircraft.id, {
        ...maintForm,
        hours: Number(maintForm.hours),
        aircraft: aircraft.registration,
      })
      setMaintForm({ type: 'inspection', description: '', hours: '', technician: '', date: new Date().toISOString().split('T')[0] })
      const updated = await getMaintenanceHistory(aircraft.id)
      setHistory(updated)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const tabs = [
    { id: 'info', label: 'Informations' },
    { id: 'potentiel', label: 'Potentiels' },
    ...(!isNew ? [{ id: 'history', label: 'Historique' }] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl border overflow-hidden" style={{ backgroundColor: '#0B1F3A', borderColor: '#1E3A5F' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1E3A5F', backgroundColor: '#071729' }}>
          <div>
            <div className="font-black text-white">{isNew ? '+ Nouvel avion' : aircraft.registration}</div>
            <div className="text-xs" style={{ color: '#5B8DB8' }}>{isNew ? 'Ajouter à la flotte' : aircraft.type}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        {/* Sub-tabs */}
        <div className="flex border-b" style={{ borderColor: '#1E3A5F', backgroundColor: '#071729' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-4 py-2 text-xs font-semibold border-b-2 transition-colors"
              style={{ borderColor: tab === t.id ? '#F0B429' : 'transparent', color: tab === t.id ? '#F0B429' : '#5B8DB8' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto space-y-4">
          {error && <div className="rounded-lg px-4 py-2 text-sm" style={{ backgroundColor: 'rgba(127,29,29,0.3)', color: '#FCA5A5', border: '1px solid #7F1D1D' }}>{error}</div>}

          {/* ── INFOS ── */}
          {tab === 'info' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Immatriculation *</label>
                  <input value={form.registration} onChange={e => set('registration', e.target.value.toUpperCase())}
                    className="w-full rounded-lg px-3 py-2 text-white font-mono text-sm border outline-none focus:border-[#F0B429]"
                    style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }} placeholder="F-OSBC" />
                </div>
                <div>
                  <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>MSN</label>
                  <input value={form.msn} onChange={e => set('msn', e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                    style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }} placeholder="208B2188" />
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Type d'appareil</label>
                <input value={form.type} onChange={e => set('type', e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                  style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Année</label>
                  <input type="number" value={form.year} onChange={e => set('year', e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                    style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }} />
                </div>
                <div>
                  <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Sièges</label>
                  <input type="number" min="1" max="14" value={form.seats} onChange={e => set('seats', e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                    style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }} />
                </div>
                <div>
                  <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Statut</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                    style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }}>
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1 font-semibold" style={{ color: '#5B8DB8' }}>Notes</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
                  className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429] resize-none"
                  style={{ backgroundColor: '#112D52', borderColor: '#1E3A5F' }} />
              </div>
            </div>
          )}

          {/* ── POTENTIELS ── */}
          {tab === 'potentiel' && (
            <div className="space-y-4">
              <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#112D52', border: '1px solid #1E3A5F' }}>
                <div className="text-xs font-bold text-white mb-1">🔧 Moteur PT6A-114A</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#5B8DB8' }}>Heures actuelles</label>
                    <input type="number" step="0.1" value={form.engine_hours} onChange={e => set('engine_hours', e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                      style={{ backgroundColor: '#071729', borderColor: '#1E3A5F' }} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#5B8DB8' }}>Limite TBO (h)</label>
                    <input type="number" value={form.engine_limit} onChange={e => set('engine_limit', e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                      style={{ backgroundColor: '#071729', borderColor: '#1E3A5F' }} />
                  </div>
                </div>
                <div className="text-xs" style={{ color: '#5B8DB8' }}>
                  Restant : <span className="font-bold text-white">{Math.max(0, form.engine_limit - form.engine_hours).toFixed(0)} h</span>
                  <span className="ml-2">({Math.max(0, Math.round(((form.engine_limit - form.engine_hours) / form.engine_limit) * 100))}%)</span>
                </div>
              </div>
              <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#112D52', border: '1px solid #1E3A5F' }}>
                <div className="text-xs font-bold text-white mb-1">✈ Cellule</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#5B8DB8' }}>Heures actuelles</label>
                    <input type="number" step="0.1" value={form.airframe_hours} onChange={e => set('airframe_hours', e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                      style={{ backgroundColor: '#071729', borderColor: '#1E3A5F' }} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#5B8DB8' }}>Limite TBO (h)</label>
                    <input type="number" value={form.airframe_limit} onChange={e => set('airframe_limit', e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-[#F0B429]"
                      style={{ backgroundColor: '#071729', borderColor: '#1E3A5F' }} />
                  </div>
                </div>
                <div className="text-xs" style={{ color: '#5B8DB8' }}>
                  Restant : <span className="font-bold text-white">{Math.max(0, form.airframe_limit - form.airframe_hours).toFixed(0)} h</span>
                  <span className="ml-2">({Math.max(0, Math.round(((form.airframe_limit - form.airframe_hours) / form.airframe_limit) * 100))}%)</span>
                </div>
              </div>
            </div>
          )}

          {/* ── HISTORIQUE ── */}
          {tab === 'history' && (
            <div className="space-y-4">
              {/* Formulaire ajout */}
              <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#112D52', border: '1px solid #F0B429', borderStyle: 'dashed' }}>
                <div className="text-xs font-bold" style={{ color: '#F0B429' }}>+ Ajouter une intervention</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#5B8DB8' }}>Type</label>
                    <select value={maintForm.type} onChange={e => setM('type', e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-white text-xs border"
                      style={{ backgroundColor: '#071729', borderColor: '#1E3A5F' }}>
                      <option value="inspection">Inspection</option>
                      <option value="engine">Moteur</option>
                      <option value="airframe">Cellule</option>
                      <option value="avionics">Avionique</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#5B8DB8' }}>Date</label>
                    <input type="date" value={maintForm.date} onChange={e => setM('date', e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-white text-xs border"
                      style={{ backgroundColor: '#071729', borderColor: '#1E3A5F', colorScheme: 'dark' }} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#5B8DB8' }}>Description *</label>
                  <input value={maintForm.description} onChange={e => setM('description', e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-white text-xs border"
                    style={{ backgroundColor: '#071729', borderColor: '#1E3A5F' }}
                    placeholder="ex: Remplacement filtre à huile moteur" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#5B8DB8' }}>Heures avion</label>
                    <input type="number" value={maintForm.hours} onChange={e => setM('hours', e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-white text-xs border"
                      style={{ backgroundColor: '#071729', borderColor: '#1E3A5F' }} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#5B8DB8' }}>Technicien</label>
                    <input value={maintForm.technician} onChange={e => setM('technician', e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-white text-xs border"
                      style={{ backgroundColor: '#071729', borderColor: '#1E3A5F' }} />
                  </div>
                </div>
                <button onClick={handleAddMaint} disabled={loading}
                  className="w-full py-2 rounded-lg text-xs font-bold transition-colors"
                  style={{ backgroundColor: '#F0B429', color: '#0B1F3A' }}>
                  {loading ? '...' : '+ Enregistrer intervention'}
                </button>
              </div>

              {/* Liste */}
              {histLoading ? <div className="text-center py-4 text-sm" style={{ color: '#5B8DB8' }}>Chargement...</div> : (
                <div className="space-y-2">
                  {history.length === 0 && <div className="text-center py-4 text-sm" style={{ color: '#2D5580' }}>Aucune intervention enregistrée</div>}
                  {history.map(h => (
                    <div key={h.id} className="rounded-lg p-3" style={{ backgroundColor: '#112D52', border: '1px solid #1E3A5F' }}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-white">{h.description}</div>
                          <div className="text-xs mt-0.5" style={{ color: '#5B8DB8' }}>
                            {h.type} · {h.date} · {h.hours}h · {h.technician || 'N/A'}
                          </div>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{ backgroundColor: '#071729', color: '#5B8DB8' }}>
                          {h.type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between gap-3"
          style={{ borderColor: '#1E3A5F', backgroundColor: '#071729' }}>
          <div>
            {!isNew && tab !== 'history' && (
              confirmDelete ? (
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
                <button onClick={() => setConfirmDelete(true)}
                  className="text-xs px-3 py-2 rounded-lg border"
                  style={{ borderColor: '#7F1D1D', color: '#F87171' }}>
                  🗑 Supprimer
                </button>
              )
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border"
              style={{ borderColor: '#1E3A5F', color: '#5B8DB8' }}>
              Fermer
            </button>
            {tab !== 'history' && (
              <button onClick={handleSave} disabled={loading}
                className="text-sm px-5 py-2 rounded-lg font-bold"
                style={{ backgroundColor: loading ? '#1E3A5F' : '#F0B429', color: '#0B1F3A' }}>
                {loading ? 'Enregistrement...' : isNew ? '+ Ajouter' : 'Enregistrer'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}