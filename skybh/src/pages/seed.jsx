import { useState } from 'react'
import { db } from '../services/firebase'
import { collection, addDoc, getDocs, deleteDoc, Timestamp, query } from 'firebase/firestore'

const FLEET = [
  { registration:'F-OSBC', type:'Cessna 208B Grand Caravan', msn:'208B2188', year:2010, seats:9, status:'available',   airframe_hours:7821, engine_hours:1680, airframe_limit:20000, engine_limit:3600, notes:'Programme FEP P&W actif' },
  { registration:'F-OSBM', type:'Cessna 208B Grand Caravan', msn:'208B2391', year:2012, seats:9, status:'available',   airframe_hours:6234, engine_hours:2891, airframe_limit:20000, engine_limit:3600, notes:'' },
  { registration:'F-OSBS', type:'Cessna 208B Grand Caravan', msn:'208B2378', year:2013, seats:9, status:'available',   airframe_hours:5980, engine_hours:1204, airframe_limit:20000, engine_limit:3600, notes:'' },
  { registration:'F-OSJR', type:'Cessna 208B Grand Caravan', msn:'208B5350', year:2019, seats:9, status:'available',   airframe_hours:3102, engine_hours:3480, airframe_limit:20000, engine_limit:3600, notes:'Turbine proche TBO' },
  { registration:'F-OSCO', type:'Cessna 208B Grand Caravan', msn:'208B5681', year:2022, seats:9, status:'maintenance', airframe_hours:1450, engine_hours:980,  airframe_limit:20000, engine_limit:3600, notes:'Inspection 100h en cours' },
]

const at = (h, m) => {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return Timestamp.fromDate(d)
}

const FLIGHTS = [
  { flight_number:'PV801', origin:'TFFJ', destination:'TNCM', departure_time:at(6,30),  arrival_time:at(6,55),  status:'landed',    pax_count:8, max_pax:9, aircraft:'F-OSBC', pilot:'J. Dupont' },
  { flight_number:'PV802', origin:'TNCM', destination:'TFFJ', departure_time:at(7,30),  arrival_time:at(7,55),  status:'landed',    pax_count:9, max_pax:9, aircraft:'F-OSBC', pilot:'J. Dupont' },
  { flight_number:'PV803', origin:'TFFJ', destination:'TFFG', departure_time:at(8,0),   arrival_time:at(8,20),  status:'landed',    pax_count:7, max_pax:9, aircraft:'F-OSBM', pilot:'S. Martin' },
  { flight_number:'PV804', origin:'TFFG', destination:'TFFJ', departure_time:at(9,0),   arrival_time:at(9,20),  status:'in_flight', pax_count:5, max_pax:9, aircraft:'F-OSBM', pilot:'S. Martin' },
  { flight_number:'PV805', origin:'TFFJ', destination:'TNCM', departure_time:at(9,30),  arrival_time:at(9,55),  status:'scheduled', pax_count:6, max_pax:9, aircraft:'F-OSBS', pilot:'C. Leroy' },
  { flight_number:'PV806', origin:'TNCM', destination:'TFFJ', departure_time:at(10,45), arrival_time:at(11,10), status:'scheduled', pax_count:8, max_pax:9, aircraft:'F-OSBS', pilot:'C. Leroy' },
  { flight_number:'PV807', origin:'TFFJ', destination:'TFFG', departure_time:at(11,0),  arrival_time:at(11,20), status:'scheduled', pax_count:9, max_pax:9, aircraft:'F-OSJR', pilot:'A. Blanc' },
  { flight_number:'PV808', origin:'TFFG', destination:'TFFJ', departure_time:at(12,0),  arrival_time:at(12,20), status:'scheduled', pax_count:4, max_pax:9, aircraft:'F-OSJR', pilot:'A. Blanc' },
  { flight_number:'PV809', origin:'TFFJ', destination:'TNCM', departure_time:at(13,30), arrival_time:at(13,55), status:'scheduled', pax_count:7, max_pax:9, aircraft:'F-OSBC', pilot:'J. Dupont' },
  { flight_number:'PV810', origin:'TNCM', destination:'TFFJ', departure_time:at(14,30), arrival_time:at(14,55), status:'scheduled', pax_count:6, max_pax:9, aircraft:'F-OSBM', pilot:'S. Martin' },
  { flight_number:'PV811', origin:'TFFJ', destination:'TFFG', departure_time:at(15,30), arrival_time:at(15,50), status:'scheduled', pax_count:5, max_pax:9, aircraft:'F-OSBS', pilot:'C. Leroy' },
  { flight_number:'PV812', origin:'TFFG', destination:'TFFJ', departure_time:at(16,30), arrival_time:at(16,50), status:'scheduled', pax_count:8, max_pax:9, aircraft:'F-OSJR', pilot:'A. Blanc' },
]

export default function SeedPage() {
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const addLog = (msg, type = 'ok') => setLog(l => [...l, { msg, type, ts: new Date().toLocaleTimeString() }])

  const clearCollection = async (col) => {
    const snap = await getDocs(query(collection(db, col)))
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
    addLog(`🗑  ${snap.size} documents supprimés dans "${col}"`, 'warn')
  }

  const runSeed = async () => {
    setLoading(true)
    setLog([])
    try {
      addLog('🚀 Démarrage du seed...', 'info')

      // Nettoyer les collections existantes
      addLog('Nettoyage aircraft_fleet...', 'info')
      await clearCollection('aircraft_fleet')
      addLog('Nettoyage flight_plans...', 'info')
      await clearCollection('flight_plans')

      // Insérer la flotte
      addLog('✈  Insertion flotte SBH Commuter...', 'info')
      for (const ac of FLEET) {
        await addDoc(collection(db, 'aircraft_fleet'), {
          ...ac,
          created_at: Timestamp.now(),
          last_updated: Timestamp.now(),
        })
        addLog(`✅ ${ac.registration} — ${ac.type} (${ac.year})`)
      }

      // Insérer les vols
      addLog('📋 Insertion vols du jour...', 'info')
      for (const fl of FLIGHTS) {
        await addDoc(collection(db, 'flight_plans'), {
          ...fl,
          created_at: Timestamp.now(),
          last_updated: Timestamp.now(),
        })
        addLog(`✅ ${fl.flight_number} ${fl.origin}→${fl.destination} ${fl.pax_count}/${fl.max_pax} pax`)
      }

      addLog('🎉 Seed terminé ! Firebase est prêt.', 'success')
      setDone(true)
    } catch (e) {
      addLog(`❌ Erreur : ${e.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const logColors = {
    ok:      '#4ADE80',
    info:    '#93C5FD',
    warn:    '#F0B429',
    success: '#4ADE80',
    error:   '#F87171',
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#0B1F3A' }}>
      <div className="w-full max-w-xl rounded-2xl border overflow-hidden" style={{ backgroundColor: '#071729', borderColor: '#1E3A5F' }}>

        {/* Header */}
        <div className="px-6 py-5 border-b" style={{ borderColor: '#1E3A5F' }}>
          <div className="font-black text-white text-lg">🔧 Initialisation Firebase</div>
          <div className="text-xs mt-1" style={{ color: '#5B8DB8' }}>
            Peuple Firestore avec la flotte SBH Commuter et les vols du jour.
            <br />
            <span style={{ color: '#F0B429' }}>⚠️ Supprime et recrée les collections existantes.</span>
          </div>
        </div>

        {/* Collections à créer */}
        <div className="px-6 py-4 border-b" style={{ borderColor: '#1E3A5F' }}>
          <div className="text-xs font-bold mb-3" style={{ color: '#5B8DB8' }}>CE QUI SERA CRÉÉ</div>
          <div className="space-y-2">
            {[
              { col: 'aircraft_fleet', n: 5, desc: 'F-OSBC, F-OSBM, F-OSBS, F-OSJR, F-OSCO' },
              { col: 'flight_plans',   n: 12, desc: 'PV801 → PV812, rotations TFFJ/TFFG/TNCM' },
            ].map(({ col, n, desc }) => (
              <div key={col} className="flex items-start gap-3 rounded-lg px-3 py-2" style={{ backgroundColor: '#112D52' }}>
                <div className="font-mono text-xs font-bold" style={{ color: '#F0B429' }}>{col}</div>
                <div>
                  <div className="text-xs font-bold text-white">{n} documents</div>
                  <div className="text-xs" style={{ color: '#5B8DB8' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div className="px-6 py-4 border-b font-mono text-xs space-y-1 max-h-64 overflow-y-auto" style={{ borderColor: '#1E3A5F', backgroundColor: '#050F1A' }}>
            {log.map((l, i) => (
              <div key={i} style={{ color: logColors[l.type] || '#fff' }}>
                <span style={{ color: '#2D5580' }}>{l.ts} </span>{l.msg}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="px-6 py-5 flex items-center justify-between gap-3">
          {done ? (
            <a href="/dashboard" className="flex-1 py-3 rounded-xl font-bold text-center text-sm transition-colors"
              style={{ backgroundColor: '#4ADE80', color: '#0B1F3A' }}>
              → Aller au dashboard
            </a>
          ) : (
            <button onClick={runSeed} disabled={loading}
              className="flex-1 py-3 rounded-xl font-bold text-sm transition-colors"
              style={{ backgroundColor: loading ? '#1E3A5F' : '#F0B429', color: '#0B1F3A', cursor: loading ? 'wait' : 'pointer' }}>
              {loading ? '⏳ Initialisation en cours...' : '🚀 Lancer le seed Firebase'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
