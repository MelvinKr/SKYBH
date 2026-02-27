import { useState } from 'react'

// ── Icônes SVG météo inline ───────────────────────────────────────────────────
const Icons = {
  Sun: () => (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      <circle cx="32" cy="32" r="12" fill="#F0B429" opacity="0.95"/>
      {[0,45,90,135,180,225,270,315].map((deg,i) => (
        <line key={i}
          x1={32 + 16*Math.cos(deg*Math.PI/180)}
          y1={32 + 16*Math.sin(deg*Math.PI/180)}
          x2={32 + 22*Math.cos(deg*Math.PI/180)}
          y2={32 + 22*Math.sin(deg*Math.PI/180)}
          stroke="#F0B429" strokeWidth="2.5" strokeLinecap="round"/>
      ))}
    </svg>
  ),
  PartlyCloudy: () => (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      <circle cx="24" cy="26" r="10" fill="#F0B429" opacity="0.9"/>
      {[0,60,120,180,240,300].map((deg,i) => (
        <line key={i}
          x1={24 + 13*Math.cos(deg*Math.PI/180)}
          y1={26 + 13*Math.sin(deg*Math.PI/180)}
          x2={24 + 18*Math.cos(deg*Math.PI/180)}
          y2={26 + 18*Math.sin(deg*Math.PI/180)}
          stroke="#F0B429" strokeWidth="2" strokeLinecap="round"/>
      ))}
      <ellipse cx="36" cy="40" rx="14" ry="9" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
      <ellipse cx="26" cy="43" rx="10" ry="7" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5"/>
      <ellipse cx="44" cy="43" rx="8" ry="6" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5"/>
    </svg>
  ),
  Cloudy: () => (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      <ellipse cx="32" cy="34" rx="18" ry="11" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5"/>
      <ellipse cx="22" cy="38" rx="12" ry="9" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
      <ellipse cx="42" cy="38" rx="10" ry="8" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
      <ellipse cx="32" cy="26" rx="10" ry="8" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5"/>
    </svg>
  ),
  Rain: () => (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      <ellipse cx="32" cy="26" rx="18" ry="11" fill="rgba(147,197,253,0.2)" stroke="rgba(147,197,253,0.4)" strokeWidth="1.5"/>
      <ellipse cx="22" cy="30" rx="12" ry="9" fill="rgba(147,197,253,0.18)" stroke="rgba(147,197,253,0.35)" strokeWidth="1.5"/>
      <ellipse cx="42" cy="30" rx="10" ry="8" fill="rgba(147,197,253,0.18)" stroke="rgba(147,197,253,0.35)" strokeWidth="1.5"/>
      {[[24,42],[32,46],[40,42],[28,50],[36,50]].map(([x,y],i) => (
        <line key={i} x1={x} y1={y} x2={x-2} y2={y+6} stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
      ))}
    </svg>
  ),
  Thunder: () => (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      <ellipse cx="32" cy="24" rx="18" ry="11" fill="rgba(107,114,128,0.3)" stroke="rgba(107,114,128,0.5)" strokeWidth="1.5"/>
      <ellipse cx="22" cy="28" rx="12" ry="9" fill="rgba(107,114,128,0.25)" stroke="rgba(107,114,128,0.4)" strokeWidth="1.5"/>
      <ellipse cx="42" cy="28" rx="10" ry="8" fill="rgba(107,114,128,0.25)" stroke="rgba(107,114,128,0.4)" strokeWidth="1.5"/>
      <polyline points="34,38 29,48 33,48 28,58" stroke="#F0B429" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  Wind: () => (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      {[[12,24,38,24,4],[12,32,44,32,6],[12,40,34,40,4]].map(([x1,y1,x2,y2,r],i) => (
        <g key={i}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round"/>
          <circle cx={x2} cy={y2} r={r} stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none"/>
        </g>
      ))}
    </svg>
  ),
  Fog: () => (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      {[20,28,36,44,52].map((y,i) => (
        <line key={i} x1={12} y1={y} x2={52} y2={y} stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={i%2===0?"0":"4 3"}/>
      ))}
    </svg>
  ),
}

// ── Logique icône selon METAR ─────────────────────────────────────────────────
function getWeatherIcon(w) {
  const raw = (w.raw || '').toUpperCase()
  const vis = w.vis || 10
  const ceil = w.ceiling || null
  const wind = w.wind_speed || 0

  if (raw.includes('TS') || raw.includes('TSRA')) return 'Thunder'
  if (raw.includes('RA') || raw.includes('DZ') || raw.includes('SHRA')) return 'Rain'
  if (raw.includes('FG') || raw.includes('BR') || raw.includes('HZ') || vis < 1) return 'Fog'
  if (raw.includes('OVC') || (ceil && ceil < 500)) return 'Cloudy'
  if (raw.includes('BKN') || raw.includes('SCT') || (ceil && ceil < 2000)) return 'PartlyCloudy'
  if (wind > 25) return 'Wind'
  return 'Sun'
}

function getIconColor(iconName) {
  const colors = {
    Sun: '#F0B429',
    PartlyCloudy: '#F0B429',
    Cloudy: '#9CA3AF',
    Rain: '#93C5FD',
    Thunder: '#FCD34D',
    Wind: '#E2E8F0',
    Fog: '#D1D5DB',
  }
  return colors[iconName] || '#F0B429'
}

// ── Parsing direction vent ────────────────────────────────────────────────────
function WindArrow({ deg, size = 20 }) {
  if (!deg && deg !== 0) return <span style={{color:'#5B8DB8'}}>VRB</span>
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{display:'inline-block',verticalAlign:'middle'}}>
      <g transform={`rotate(${deg}, 12, 12)`}>
        <polygon points="12,3 15,18 12,15 9,18" fill="#F0B429" opacity="0.9"/>
      </g>
    </svg>
  )
}

// ── Parsing nuages ────────────────────────────────────────────────────────────
function parseClouds(raw) {
  if (!raw) return []
  const matches = [...raw.matchAll(/(FEW|SCT|BKN|OVC)(\d{3})/g)]
  const labels = { FEW:'Quelques', SCT:'Épars', BKN:'Fragmenté', OVC:'Couvert' }
  return matches.map(m => ({
    layer: m[1],
    label: labels[m[1]] || m[1],
    alt: parseInt(m[2]) * 100,
  }))
}

function parseWeatherCode(raw) {
  if (!raw) return []
  const codes = {
    'RA': '🌧 Pluie', 'SHRA': '🌦 Averses', 'DZ': '🌦 Bruine',
    'TS': '⛈ Orage', 'TSRA': '⛈ Orage+Pluie',
    'FG': '🌫 Brouillard', 'BR': '🌫 Brume', 'HZ': '🌫 Brume sèche',
    'SH': '🌦 Averses', 'FEW': null, 'SCT': null, 'BKN': null, 'OVC': null,
  }
  const found = []
  Object.entries(codes).forEach(([code, label]) => {
    if (label && raw.toUpperCase().includes(code)) found.push(label)
  })
  return [...new Set(found)]
}

// ── Modal détail météo ────────────────────────────────────────────────────────
function WeatherDetail({ w, onClose }) {
  const clouds = parseClouds(w.raw)
  const phenomena = parseWeatherCode(w.raw)
  const iconName = getWeatherIcon(w)
  const IconComp = Icons[iconName]

  const vfrCfg = {
    VFR:  { color:'#4ADE80', bg:'rgba(74,222,128,0.1)',  border:'rgba(74,222,128,0.3)',  label:'Conditions nominales — Vol autorisé' },
    MVFR: { color:'#F0B429', bg:'rgba(240,180,41,0.1)',  border:'rgba(240,180,41,0.3)',  label:'Conditions marginales — Décision pilote' },
    IFR:  { color:'#F87171', bg:'rgba(248,113,113,0.1)', border:'rgba(248,113,113,0.3)', label:'Conditions dégradées — Vérifier NOTAMs' },
  }[w.status] || { color:'#4ADE80', bg:'rgba(74,222,128,0.1)', border:'rgba(74,222,128,0.3)', label:'' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:'rgba(0,0,0,0.75)'}} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border overflow-hidden" style={{backgroundColor:'#0B1F3A', borderColor:'#1E3A5F'}} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b overflow-hidden" style={{borderColor:'#1E3A5F', background:'linear-gradient(135deg, #071729 0%, #0F2A4A 100%)'}}>
          {/* Icône grande en fond */}
          <div style={{position:'absolute', right:16, top:'50%', transform:'translateY(-50%)', width:80, height:80, opacity:0.15}}>
            <IconComp />
          </div>
          <div className="flex items-start justify-between">
            <div>
              <div style={{color:'#5B8DB8', fontSize:10, fontFamily:'monospace', letterSpacing:3, textTransform:'uppercase'}}>{w.icao}</div>
              <div className="font-black text-xl text-white mt-0.5">{w.name}</div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-black px-2 py-0.5 rounded border" style={{color:vfrCfg.color, borderColor:vfrCfg.border, backgroundColor:vfrCfg.bg}}>
                  {w.status}
                </span>
                <span className="text-xs" style={{color:'#5B8DB8'}}>{vfrCfg.label}</span>
              </div>
            </div>
            <div style={{width:56, height:56, flexShrink:0}}>
              <IconComp />
            </div>
          </div>
          <button onClick={onClose} style={{position:'absolute', top:12, right:12, color:'#5B8DB8', background:'none', border:'none', fontSize:18, cursor:'pointer', lineHeight:1}}>✕</button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">

          {/* Température & Point de rosée */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label:'Température', value:`${w.temp}°C`, icon:'🌡', color:'#FCA5A5' },
              { label:'Point rosée', value:`${w.dewpoint ?? '--'}°C`, icon:'💧', color:'#93C5FD' },
              { label:'Humidité', value: w.temp != null && w.dewpoint != null ? `${Math.round(100 - 5*(w.temp - w.dewpoint))}%` : '--', icon:'〰', color:'#6EE7B7' },
            ].map(item => (
              <div key={item.label} className="rounded-xl p-3 text-center" style={{backgroundColor:'#112D52', border:'1px solid #1E3A5F'}}>
                <div style={{fontSize:18, marginBottom:4}}>{item.icon}</div>
                <div className="text-lg font-black" style={{color:item.color}}>{item.value}</div>
                <div style={{color:'#5B8DB8', fontSize:10, marginTop:2}}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* Vent */}
          <div className="rounded-xl p-4" style={{backgroundColor:'#112D52', border:'1px solid #1E3A5F'}}>
            <div style={{color:'#5B8DB8', fontSize:10, fontWeight:700, letterSpacing:2, textTransform:'uppercase', marginBottom:8}}>Vent</div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <WindArrow deg={w.wind_deg} size={28} />
                <div>
                  <div className="font-black text-white text-lg">{w.wind_speed} kt</div>
                  <div style={{color:'#5B8DB8', fontSize:11}}>{w.wind_dir} {w.wind_deg ? `(${w.wind_deg}°)` : ''}</div>
                </div>
              </div>
              {w.wind_gust && (
                <div className="rounded-lg px-3 py-2" style={{backgroundColor:'rgba(240,180,41,0.1)', border:'1px solid rgba(240,180,41,0.3)'}}>
                  <div className="font-bold" style={{color:'#F0B429'}}>{w.wind_gust} kt</div>
                  <div style={{color:'#5B8DB8', fontSize:10}}>Rafales</div>
                </div>
              )}
              <div className="flex-1 text-right">
                <div className="text-sm font-bold" style={{color: w.wind_speed > 25 ? '#F87171' : w.wind_speed > 15 ? '#F0B429' : '#4ADE80'}}>
                  {w.wind_speed > 25 ? '⚠ Fort' : w.wind_speed > 15 ? '~ Modéré' : '✓ Faible'}
                </div>
              </div>
            </div>
          </div>

          {/* Visibilité + Plafond */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-4" style={{backgroundColor:'#112D52', border:'1px solid #1E3A5F'}}>
              <div style={{color:'#5B8DB8', fontSize:10, fontWeight:700, letterSpacing:2, textTransform:'uppercase', marginBottom:6}}>Visibilité</div>
              <div className="font-black text-white text-xl">
                {w.vis >= 9999 ? '10+ km' : `${w.vis} km`}
              </div>
              <div className="mt-1">
                <div style={{height:4, backgroundColor:'#1E3A5F', borderRadius:2, overflow:'hidden'}}>
                  <div style={{height:'100%', width:`${Math.min(100, (w.vis/10)*100)}%`, backgroundColor: w.vis >= 5 ? '#4ADE80' : w.vis >= 3 ? '#F0B429' : '#F87171', borderRadius:2}}/>
                </div>
              </div>
            </div>
            <div className="rounded-xl p-4" style={{backgroundColor:'#112D52', border:'1px solid #1E3A5F'}}>
              <div style={{color:'#5B8DB8', fontSize:10, fontWeight:700, letterSpacing:2, textTransform:'uppercase', marginBottom:6}}>Plafond</div>
              <div className="font-black text-white text-xl">
                {w.ceiling ? `${w.ceiling.toLocaleString()} ft` : 'CAVOK'}
              </div>
              <div style={{color: !w.ceiling ? '#4ADE80' : w.ceiling > 3000 ? '#4ADE80' : w.ceiling > 1000 ? '#F0B429' : '#F87171', fontSize:11, marginTop:4, fontWeight:600}}>
                {!w.ceiling ? '✓ Ciel dégagé' : w.ceiling > 3000 ? '✓ Bon' : w.ceiling > 1000 ? '~ Marginal' : '⚠ Bas'}
              </div>
            </div>
          </div>

          {/* Nuages */}
          {clouds.length > 0 && (
            <div className="rounded-xl p-4" style={{backgroundColor:'#112D52', border:'1px solid #1E3A5F'}}>
              <div style={{color:'#5B8DB8', fontSize:10, fontWeight:700, letterSpacing:2, textTransform:'uppercase', marginBottom:8}}>Couverture nuageuse</div>
              <div className="space-y-2">
                {clouds.map((c, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{backgroundColor:'#071729', color:'#93C5FD'}}>{c.layer}</span>
                      <span style={{color:'#5B8DB8', fontSize:12}}>{c.label}</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-white">{c.alt.toLocaleString()} ft</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phénomènes */}
          {phenomena.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {phenomena.map((p, i) => (
                <span key={i} className="text-xs px-3 py-1.5 rounded-full font-semibold" style={{backgroundColor:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.3)', color:'#FCA5A5'}}>
                  {p}
                </span>
              ))}
            </div>
          )}

          {/* METAR brut */}
          <div className="rounded-xl p-3" style={{backgroundColor:'#050F1A', border:'1px solid #0F2A4A'}}>
            <div style={{color:'#2D5580', fontSize:9, letterSpacing:2, textTransform:'uppercase', marginBottom:4}}>METAR brut OACI</div>
            <div className="font-mono text-xs break-all" style={{color:'#5B8DB8', lineHeight:1.6}}>{w.raw || 'N/A'}</div>
            {w.updated && (
              <div style={{color:'#1E3A5F', fontSize:9, marginTop:6}}>
                Dernière mise à jour : {w.updated?.toLocaleTimeString?.('fr-FR') || '--'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Carte météo principale ────────────────────────────────────────────────────
export default function WeatherCard({ w, loading }) {
  const [showDetail, setShowDetail] = useState(false)

  if (loading || !w) return (
    <div className="rounded-xl border p-4 animate-pulse" style={{backgroundColor:'#112D52', borderColor:'#1E3A5F', minHeight:140}}>
      <div style={{height:12, backgroundColor:'#1E3A5F', borderRadius:4, marginBottom:8, width:'60%'}}/>
      <div style={{height:20, backgroundColor:'#1E3A5F', borderRadius:4, marginBottom:12, width:'80%'}}/>
      <div style={{height:40, backgroundColor:'#1E3A5F', borderRadius:4}}/>
    </div>
  )

  const iconName = getWeatherIcon(w)
  const IconComp = Icons[iconName]
  const iconColor = getIconColor(iconName)

  const vfrCfg = {
    VFR:  { color:'#4ADE80', border:'rgba(74,222,128,0.35)',  bg:'rgba(74,222,128,0.06)' },
    MVFR: { color:'#F0B429', border:'rgba(240,180,41,0.35)',  bg:'rgba(240,180,41,0.06)' },
    IFR:  { color:'#F87171', border:'rgba(248,113,113,0.35)', bg:'rgba(248,113,113,0.06)' },
  }[w.status] || { color:'#4ADE80', border:'rgba(74,222,128,0.35)', bg:'rgba(74,222,128,0.06)' }

  return (
    <>
      {showDetail && <WeatherDetail w={w} onClose={() => setShowDetail(false)} />}

      <button
        onClick={() => setShowDetail(true)}
        className="w-full rounded-xl border p-4 text-left transition-all hover:scale-[1.02]"
        style={{
          backgroundColor: vfrCfg.bg,
          borderColor: vfrCfg.border,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        {/* Top row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div style={{color:'#5B8DB8', fontSize:10, fontFamily:'monospace', letterSpacing:3}}>{w.icao}</div>
            <div className="font-bold text-sm text-white mt-0.5">{w.name}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div style={{width:36, height:36}}>
              <IconComp />
            </div>
            <span className="text-xs font-black px-2 py-0.5 rounded border" style={{color:vfrCfg.color, borderColor:vfrCfg.border}}>
              {w.status}
            </span>
          </div>
        </div>

        {/* Données principales */}
        <div className="grid grid-cols-3 gap-1 text-center mb-3">
          {[
            { val:`${w.temp}°C`,              lbl:'Temp' },
            { val:`${w.wind_speed}kt`,        lbl:w.wind_dir },
            { val:w.vis>=9999?'CAVOK':`${w.vis}km`, lbl:w.ceiling?`${w.ceiling}ft`:'Visib.' },
          ].map(({val,lbl}) => (
            <div key={lbl}>
              <div className="font-black text-white text-base">{val}</div>
              <div style={{color:'#5B8DB8', fontSize:10}}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* METAR tronqué */}
        {w.raw && (
          <div className="font-mono text-xs truncate rounded px-2 py-1" style={{backgroundColor:'rgba(7,23,41,0.8)', color:'#5B8DB8'}}>
            {w.raw}
          </div>
        )}

        {/* Hint */}
        <div style={{color:'#2D5580', fontSize:9, marginTop:6, textAlign:'right', letterSpacing:1}}>
          CLIQUER POUR DÉTAIL →
        </div>
      </button>
    </>
  )
}
