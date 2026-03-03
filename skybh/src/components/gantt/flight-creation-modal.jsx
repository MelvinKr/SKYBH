/**
 * @fileoverview FlightOptimizer — Composant modal de création de vol avec IA
 * Analyse le planning, les potentiels avion, les contraintes FTL et turnaround
 * pour pré-remplir automatiquement les champs optimaux
 */

import { useState, useEffect, useCallback } from 'react'

// ── Constantes ─────────────────────────────────────────────────────────────────
const AIRPORTS = {
  TFFJ: 'Saint-Barthélemy',
  TFFG: 'Saint-Martin Grand Case',
  TNCM: 'Sint-Maarten Julian',
  TQPF: 'Anguilla Clayton J.',
  TFFR: 'Guadeloupe Pôle Caraïbes',
}

const ROUTE_DURATIONS = {
  'TFFJ-TFFG': 10, 'TFFG-TFFJ': 10,
  'TFFJ-TNCM': 12, 'TNCM-TFFJ': 12,
  'TFFJ-TQPF': 25, 'TQPF-TFFJ': 25,
  'TFFG-TNCM': 5,  'TNCM-TFFG': 5,
  'TFFJ-TFFR': 55, 'TFFR-TFFJ': 55,
}

const toDate = ts => ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null

// ── Helpers formatage ──────────────────────────────────────────────────────────
const fmtHHMM = d => {
  if (!d) return ''
  return d.toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/St_Barthelemy'
  })
}

const addMinutes = (date, mins) => new Date(date.getTime() + mins * 60000)

// Parse HH:MM en forçant timezone AST (UTC-4) pour Firestore
const parseHHMM_AST = (str, baseDate) => {
  const [h, m] = str.split(':').map(Number)
  const base = baseDate instanceof Date ? baseDate : new Date(baseDate + 'T12:00:00')
  // Date calendaire AST du jour de base (YYYY-MM-DD)
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/St_Barthelemy' }).format(base)
  const hPad = String(h).padStart(2, '0')
  const mPad = String(m).padStart(2, '0')
  // ISO avec offset -04:00 → JavaScript convertit en UTC correctement
  return new Date(`${ymd}T${hPad}:${mPad}:00-04:00`)
}
const parseHHMM = parseHHMM_AST // alias pour compatibilité

// ── Analyse contexte pour l'IA ─────────────────────────────────────────────────
const buildAIContext = ({ fleet, flights, aircraft_fleet, rules, selectedDate, initialAircraft }) => {
  const dateStr = selectedDate.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'America/St_Barthelemy'
  })

  // Vols du jour triés par heure
  const dayFlights = flights
    .filter(f => {
      const d = toDate(f.departure_time)
      if (!d) return false
      const fmtDay = dt => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/St_Barthelemy' }).format(dt)
      return fmtDay(d) === fmtDay(selectedDate)
    })
    .sort((a, b) => toDate(a.departure_time) - toDate(b.departure_time))

  // Résumé par avion
  const fleetSummary = fleet.map(ac => {
    const acFlights = dayFlights.filter(f => f.aircraft === ac.registration)
    const lastFlight = acFlights[acFlights.length - 1]
    const lastArr = lastFlight ? toDate(lastFlight.arrival_time) : null
    const cycles = acFlights.length

    // Potentiels depuis aircraft_fleet si disponible
    const acData = aircraft_fleet?.find(a => a.registration === ac.registration)
    const enginePot = acData?.engine_potential_remaining ?? acData?.potentiel_moteur ?? null
    const cellPot   = acData?.cell_potential_remaining   ?? acData?.potentiel_cellule ?? null

    return {
      registration: ac.registration,
      status: ac.status,
      cycles_today: cycles,
      last_arrival: lastArr ? fmtHHMM(lastArr) : null,
      last_destination: lastFlight?.destination || null,
      engine_potential_h: enginePot,
      cell_potential_h: cellPot,
      maintenance_due: acData?.maintenance_due || acData?.next_maintenance || null,
      flights_today: acFlights.map(f => ({
        number: f.flight_number,
        route: `${f.origin}→${f.destination}`,
        dep: fmtHHMM(toDate(f.departure_time)),
        arr: fmtHHMM(toDate(f.arrival_time)),
        pax: f.pax_count,
        pilot: f.pilot,
      }))
    }
  })

  // Résumé pilotes (FTL)
  const pilots = [...new Set(dayFlights.map(f => f.pilot).filter(Boolean))]
  const pilotSummary = pilots.map(pilot => {
    const pFlights = dayFlights.filter(f => f.pilot === pilot)
    const firstDep = pFlights[0] ? toDate(pFlights[0].departure_time) : null
    const lastArr  = pFlights[pFlights.length-1] ? toDate(pFlights[pFlights.length-1].arrival_time) : null
    const dutyMins = firstDep && lastArr ? Math.round((lastArr - firstDep) / 60000) : 0
    return {
      name: pilot,
      flights_today: pFlights.length,
      duty_minutes: dutyMins,
      duty_remaining_minutes: (rules?.max_crew_duty_minutes || 720) - dutyMins,
      last_destination: pFlights[pFlights.length-1]?.destination || null,
      last_arrival: lastArr ? fmtHHMM(lastArr) : null,
    }
  })

  return {
    date: dateStr,
    rules: {
      min_turnaround_minutes: rules?.min_turnaround_minutes || 20,
      buffer_minutes: rules?.buffer_minutes || 5,
      max_daily_cycles: rules?.max_daily_cycles || 8,
      max_crew_duty_minutes: rules?.max_crew_duty_minutes || 720,
    },
    fleet: fleetSummary,
    pilots: pilotSummary,
    total_flights_today: dayFlights.length,
    preferred_aircraft: initialAircraft || null,
    available_routes: Object.keys(ROUTE_DURATIONS).map(r => ({
      route: r,
      duration_min: ROUTE_DURATIONS[r]
    })),
  }
}

// ── Panneau suggestion IA ──────────────────────────────────────────────────────
function AISuggestionPanel({ suggestion, onApply, onDismiss }) {
  if (!suggestion) return null
  const { fields, reasoning, warnings, score } = suggestion

  const scoreColor = score >= 80 ? '#4ADE80' : score >= 60 ? '#F0B429' : '#F87171'

  return (
    <div style={{
      margin: '12px 0', borderRadius: 12,
      background: 'linear-gradient(135deg, rgba(17,45,82,0.6), rgba(7,23,41,0.8))',
      border: '1px solid rgba(59,130,246,0.3)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid rgba(30,58,95,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(7,23,41,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>✦</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#93C5FD' }}>Suggestion IA</span>
          <div style={{
            fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99,
            backgroundColor: `${scoreColor}18`, color: scoreColor,
            border: `1px solid ${scoreColor}40`,
          }}>
            Score {score}/100
          </div>
        </div>
        <button onClick={onDismiss} style={{
          background: 'none', border: 'none', color: '#475569',
          cursor: 'pointer', fontSize: 14, padding: 0,
        }}>✕</button>
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Champs proposés */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { label: 'Avion',       value: fields.aircraft },
            { label: 'Pilote',      value: fields.pilot },
            { label: 'Origine',     value: fields.origin ? `${fields.origin} — ${AIRPORTS[fields.origin] || ''}` : null },
            { label: 'Destination', value: fields.destination ? `${fields.destination} — ${AIRPORTS[fields.destination] || ''}` : null },
            { label: 'Départ AST',  value: fields.departure_time },
            { label: 'Arrivée AST', value: fields.arrival_time },
            { label: 'Max PAX',     value: fields.max_pax ? `${fields.max_pax} passagers` : null },
          ].filter(f => f.value).map(f => (
            <div key={f.label} style={{
              padding: '6px 8px', borderRadius: 7,
              backgroundColor: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.15)',
            }}>
              <div style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#93C5FD', marginTop: 2, fontFamily: 'monospace' }}>{f.value}</div>
            </div>
          ))}
        </div>

        {/* Raisonnement */}
        <div style={{
          padding: '8px 10px', borderRadius: 8,
          backgroundColor: 'rgba(17,45,82,0.4)', border: '1px solid #1E3A5F',
        }}>
          <div style={{ fontSize: 9, color: '#2D5580', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 5 }}>
            Analyse
          </div>
          <p style={{ fontSize: 11, color: '#94A3B8', lineHeight: 1.6, margin: 0 }}>{reasoning}</p>
        </div>

        {/* Avertissements */}
        {warnings?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {warnings.map((w, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 6,
                padding: '5px 8px', borderRadius: 6,
                backgroundColor: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.2)',
              }}>
                <span style={{ fontSize: 9, flexShrink: 0 }}>⚠️</span>
                <span style={{ fontSize: 10, color: '#FCD34D', lineHeight: 1.4 }}>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onDismiss} style={{
            flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11, cursor: 'pointer',
            backgroundColor: 'rgba(71,85,105,0.3)', color: '#94A3B8', border: '1px solid #334155',
          }}>Ignorer</button>
          <button onClick={() => onApply(fields)} style={{
            flex: 2, padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 700,
            cursor: 'pointer', border: 'none',
            background: 'linear-gradient(135deg, #1E3A5F, #2D5580)',
            color: '#93C5FD',
          }}>✦ Appliquer la suggestion</button>
        </div>
      </div>
    </div>
  )
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function FlightCreationModal({
  onClose, onSave,
  flights = [], fleet = [], aircraft_fleet = [],
  rules = {}, user,
  initialData = {},
}) {
  const today = new Date()

  // Auto-numérotation : PV8xx basé sur nb vols du jour
  const autoFlightNumber = (() => {
    const todayFlights = flights.filter(f => {
      const d = toDate(f.departure_time)
      if (!d) return false
      const fmt = dt => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/St_Barthelemy' }).format(dt)
      return fmt(d) === fmt(today)
    })
    const nums = todayFlights.map(f => parseInt((f.flight_number || '').replace(/\D/g,''))).filter(n => !isNaN(n))
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 801
    return `PV${next}`
  })()

  // Pilotes disponibles (FTL non dépassé)
  const availablePilots = (() => {
    const maxDuty = rules?.max_crew_duty_minutes || 720
    const todayFlights = flights.filter(f => {
      const d = toDate(f.departure_time)
      if (!d) return false
      const fmt = dt => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/St_Barthelemy' }).format(dt)
      return fmt(d) === fmt(today)
    })
    const allPilots = [...new Set(todayFlights.map(f => f.pilot).filter(Boolean))]
    return allPilots.map(pilot => {
      const pFlights = todayFlights.filter(f => f.pilot === pilot).sort((a,b) => toDate(a.departure_time) - toDate(b.departure_time))
      const firstDep = pFlights[0] ? toDate(pFlights[0].departure_time) : null
      const lastArr  = pFlights[pFlights.length-1] ? toDate(pFlights[pFlights.length-1].arrival_time) : null
      const dutyMins = firstDep && lastArr ? Math.round((lastArr - firstDep) / 60000) : 0
      const remaining = maxDuty - dutyMins
      return { name: pilot, dutyMins, remaining, available: remaining > 30 }
    }).sort((a, b) => b.remaining - a.remaining)
  })()

  const [form, setForm] = useState({
    flight_number:  initialData.flight_number  || autoFlightNumber,
    aircraft:       initialData.aircraft       || '',
    origin:         initialData.origin         || 'TFFJ',
    destination:    initialData.destination    || 'TNCM',
    departure_time: initialData.departure_time || '08:00',
    arrival_time:   initialData.arrival_time   || '08:25',
    flight_date:    initialData.flight_date    || today.toISOString().slice(0,10),
    pax_count:      initialData.pax_count      ?? 0,
    max_pax:        initialData.max_pax        ?? 9,
    pilot:          initialData.pilot          || (availablePilots[0]?.available ? availablePilots[0].name : ''),
    status:         initialData.status         || 'scheduled',
    notes:          initialData.notes          || '',
    flight_type:    initialData.flight_type    || 'regular',
  })

  const [aiLoading,    setAiLoading]    = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState(null)
  const [aiError,      setAiError]      = useState(null)
  const [saving,       setSaving]       = useState(false)

  // Auto-calcul arrivée — travaille en string HH:MM pur, sans Date intermédiaire
  useEffect(() => {
    const dur = ROUTE_DURATIONS[`${form.origin}-${form.destination}`]
    if (!dur || !form.departure_time) return
    try {
      const [h, m] = form.departure_time.split(':').map(Number)
      const totalMin = h * 60 + m + dur
      const arrH = Math.floor(totalMin / 60) % 24
      const arrM = totalMin % 60
      const arrStr = `${String(arrH).padStart(2,'0')}:${String(arrM).padStart(2,'0')}`
      setForm(f => ({ ...f, arrival_time: arrStr }))
    } catch {}
  }, [form.origin, form.destination, form.departure_time])

  // ── Appel IA ──────────────────────────────────────────────────────────────────
  const handleOptimize = useCallback(async () => {
    setAiLoading(true)
    setAiError(null)
    setAiSuggestion(null)

    const context = buildAIContext({
      fleet, flights, aircraft_fleet, rules,
      selectedDate: today,
      initialAircraft: form.aircraft,
    })

    const prompt = `Tu es un expert en planification opérationnelle pour une compagnie aérienne inter-îles caribéenne (Cessna 208B, 9 places max, VFR).

CONTEXTE DU JOUR — ${context.date}
${JSON.stringify(context, null, 2)}

FORMULAIRE ACTUEL (à optimiser) :
${JSON.stringify({
  flight_number: form.flight_number,
  aircraft: form.aircraft,
  origin: form.origin,
  destination: form.destination,
  departure_time: form.departure_time,
  pilot: form.pilot,
}, null, 2)}

CONTRAINTES À RESPECTER :
1. Turnaround minimum : ${context.rules.min_turnaround_minutes} min entre deux vols d'un même avion
2. FTL pilote : max ${context.rules.max_crew_duty_minutes} min de service par jour
3. Cycles max avion : ${context.rules.max_daily_cycles} rotations/jour
4. Préférer les avions avec plus de potentiel moteur/cellule restant
5. Assigner les pilotes disponibles (pas en FTL dépassé)
6. Choisir l'avion dont la dernière destination correspond à l'origine prévue si possible

INSTRUCTIONS :
- Propose l'avion optimal (potentiel, disponibilité, position)
- Propose le pilote optimal (FTL, disponibilité)
- Propose l'horaire de départ optimal (après turnaround + buffer)
- Calcule l'heure d'arrivée automatiquement
- Donne un score d'optimisation /100
- Explique ton raisonnement en 2-3 phrases claires en français
- Liste les avertissements éventuels

Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks :
{
  "fields": {
    "aircraft": "F-OSBC",
    "pilot": "Nom Pilote",
    "origin": "TFFJ",
    "destination": "TNCM",
    "departure_time": "09:30",
    "arrival_time": "09:42",
    "max_pax": 9,
    "flight_number": "PV815"
  },
  "score": 87,
  "reasoning": "Explication en français...",
  "warnings": ["Avertissement éventuel..."]
}`

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      const data = await response.json()
      const text = data.content?.find(b => b.type === 'text')?.text || ''
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      setAiSuggestion(parsed)
    } catch (err) {
      setAiError('Impossible de contacter l\'assistant IA. Vérifiez votre connexion.')
      console.error('AI error:', err)
    } finally {
      setAiLoading(false)
    }
  }, [fleet, flights, aircraft_fleet, rules, form, today])

  // ── Appliquer suggestion ───────────────────────────────────────────────────────
  const handleApplySuggestion = useCallback((fields) => {
    setForm(f => ({
      ...f,
      ...(fields.aircraft      && { aircraft:       fields.aircraft }),
      ...(fields.pilot         && { pilot:           fields.pilot }),
      ...(fields.origin        && { origin:          fields.origin }),
      ...(fields.destination   && { destination:     fields.destination }),
      ...(fields.departure_time && { departure_time: fields.departure_time }),
      ...(fields.arrival_time  && { arrival_time:    fields.arrival_time }),
      ...(fields.max_pax       && { max_pax:         fields.max_pax }),
      ...(fields.flight_number && { flight_number:   fields.flight_number }),
    }))
    setAiSuggestion(null)
  }, [])

  // ── Sauvegarde ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.flight_number || !form.aircraft || !form.origin || !form.destination) return
    setSaving(true)
    try {
      const baseDate = form.flight_date || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/St_Barthelemy' }).format(today)
      const depDate = parseHHMM_AST(form.departure_time, baseDate)
      const arrDate = parseHHMM_AST(form.arrival_time, baseDate)
      await onSave({
        ...form,
        departure_time: depDate,
        arrival_time:   arrDate,
        pax_count: Number(form.pax_count),
        max_pax:   Number(form.max_pax),
      })
      onClose()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────────
  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
    backgroundColor: 'rgba(7,23,41,0.8)', color: '#F1F5F9',
    border: '1px solid #1E3A5F', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit',
  }
  const labelStyle = { fontSize: 11, fontWeight: 600, color: '#5B8DB8', marginBottom: 5, display: 'block' }
  const fieldStyle = { display: 'flex', flexDirection: 'column' }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        backgroundColor: '#0F1E35', border: '1px solid #1E3A5F', borderRadius: 16,
        width: 560, maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #1E3A5F',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(17,45,82,0.8), rgba(7,23,41,0.9))',
          borderRadius: '16px 16px 0 0',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#F1F5F9' }}>+ Nouveau vol</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>Créer une rotation</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Bouton Optimiser IA */}
            <button onClick={handleOptimize} disabled={aiLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 9, fontSize: 11, fontWeight: 700,
                cursor: aiLoading ? 'wait' : 'pointer', border: 'none',
                background: aiLoading
                  ? 'rgba(99,102,241,0.15)'
                  : 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.2))',
                color: aiLoading ? '#6366F1' : '#A5B4FC',
                boxShadow: aiLoading ? 'none' : '0 0 12px rgba(99,102,241,0.2)',
                transition: 'all 0.2s',
              }}>
              {aiLoading ? (
                <>
                  <span style={{ fontSize: 12, animation: 'spin 1s linear infinite' }}>◌</span>
                  Analyse en cours...
                </>
              ) : (
                <>✦ Optimiser avec l'IA</>
              )}
            </button>
            <button onClick={onClose} style={{
              width: 30, height: 30, borderRadius: 8, border: '1px solid #1E3A5F',
              backgroundColor: 'rgba(71,85,105,0.3)', color: '#94A3B8',
              cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Suggestion IA */}
          {aiSuggestion && (
            <AISuggestionPanel
              suggestion={aiSuggestion}
              onApply={handleApplySuggestion}
              onDismiss={() => setAiSuggestion(null)}
            />
          )}
          {aiError && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, fontSize: 11,
              backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#F87171',
            }}>⚠️ {aiError}</div>
          )}

          {/* Ligne 1 : N° vol + Avion */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>N° vol *</label>
              <input style={inputStyle} value={form.flight_number}
                onChange={e => setForm(f => ({ ...f, flight_number: e.target.value }))}
                placeholder="PV810"/>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Avion *</label>
              <select style={inputStyle} value={form.aircraft}
                onChange={e => setForm(f => ({ ...f, aircraft: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {fleet.map(ac => (
                  <option key={ac.registration} value={ac.registration}>
                    {ac.registration}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Ligne 1b : Date */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Date du vol *</label>
            <input type="date" style={inputStyle} value={form.flight_date}
              onChange={e => setForm(f => ({ ...f, flight_date: e.target.value }))}/>
          </div>

          {/* Ligne 2 : Origine + Destination */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Origine *</label>
              <select style={inputStyle} value={form.origin}
                onChange={e => setForm(f => ({ ...f, origin: e.target.value }))}>
                {Object.entries(AIRPORTS).map(([code, name]) => (
                  <option key={code} value={code}>{code} — {name}</option>
                ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Destination *</label>
              <select style={inputStyle} value={form.destination}
                onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}>
                {Object.entries(AIRPORTS).map(([code, name]) => (
                  <option key={code} value={code}>{code} — {name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ligne 3 : Départ + Arrivée */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Départ AST *</label>
              <input type="time" style={inputStyle} value={form.departure_time}
                onChange={e => setForm(f => ({ ...f, departure_time: e.target.value }))}/>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Arrivée AST *</label>
              <input type="time" style={inputStyle} value={form.arrival_time}
                onChange={e => setForm(f => ({ ...f, arrival_time: e.target.value }))}/>
            </div>
          </div>

          {/* Ligne 4 : PAX + Max PAX + Statut */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>PAX</label>
              <input type="number" min={0} max={9} style={inputStyle} value={form.pax_count}
                onChange={e => setForm(f => ({ ...f, pax_count: Number(e.target.value) }))}/>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Max PAX</label>
              <input type="number" min={1} max={9} style={inputStyle} value={form.max_pax}
                onChange={e => setForm(f => ({ ...f, max_pax: Number(e.target.value) }))}/>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Statut</label>
              <select style={inputStyle} value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="scheduled">Programmé</option>
                <option value="boarding">Embarquement</option>
                <option value="in_flight">En vol</option>
                <option value="landed">Atterri</option>
                <option value="cancelled">Annulé</option>
              </select>
            </div>
          </div>

          {/* Ligne 5 : Pilote */}
          <div style={fieldStyle}>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Pilote</span>
              <span style={{ fontSize: 9, color: '#2D5580', fontWeight: 400 }}>
                {availablePilots.filter(p => p.available).length} dispo · FTL max {rules?.max_crew_duty_minutes || 720} min
              </span>
            </label>
            <select style={inputStyle} value={form.pilot}
              onChange={e => setForm(f => ({ ...f, pilot: e.target.value }))}>
              <option value="">— Sélectionner un pilote —</option>
              {availablePilots.map(p => (
                <option key={p.name} value={p.name} disabled={!p.available}
                  style={{ color: p.available ? '#F1F5F9' : '#475569' }}>
                  {p.available ? '✓' : '✗'} {p.name} — {p.remaining > 0 ? `${p.remaining} min restants` : 'FTL dépassé'}
                </option>
              ))}
              <option value="__new__" style={{ color: '#F0B429' }}>+ Nouveau pilote...</option>
            </select>
            {form.pilot === '__new__' && (
              <input style={{ ...inputStyle, marginTop: 6 }} placeholder="Nom complet du pilote"
                onChange={e => setForm(f => ({ ...f, pilot: e.target.value }))}
                autoFocus/>
            )}
          </div>

          {/* Ligne 6 : Type + Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={form.flight_type}
                onChange={e => setForm(f => ({ ...f, flight_type: e.target.value }))}>
                <option value="regular">● Régulier</option>
                <option value="private">✦ Privé</option>
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Notes</label>
              <input style={inputStyle} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Observations opérationnelles..."/>
            </div>
          </div>

          {/* Footer actions */}
          <div style={{
            display: 'flex', gap: 10, paddingTop: 4,
            borderTop: '1px solid #1E3A5F', marginTop: 4,
          }}>
            <button onClick={onClose} style={{
              flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 12, cursor: 'pointer',
              backgroundColor: 'rgba(71,85,105,0.3)', color: '#94A3B8', border: '1px solid #334155',
            }}>Annuler</button>
            <button onClick={handleSave} disabled={saving || !form.flight_number || !form.aircraft}
              style={{
                flex: 2, padding: '10px 0', borderRadius: 9, fontSize: 12, fontWeight: 800,
                cursor: saving || !form.flight_number || !form.aircraft ? 'not-allowed' : 'pointer',
                opacity: saving || !form.flight_number || !form.aircraft ? 0.5 : 1,
                backgroundColor: '#F0B429', color: '#0B1F3A', border: 'none',
              }}>
              {saving ? 'Création...' : '+ Créer le vol'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        select option { background-color: #0F1E35; color: #F1F5F9; }
      `}</style>
    </div>
  )
}