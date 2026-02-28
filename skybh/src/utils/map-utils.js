/**
 * @fileoverview Utilitaires géographiques — Live Map SKYBH v2
 * Bounding box resserrée · Zones météo en pixels · Îles recalibrées
 */

// ── Aéroports ─────────────────────────────────────────────────────────────────
export const AIRPORTS = {
  TFFJ: { icao:'TFFJ', name:'Saint-Barthélemy',        short:'SBH',    lat:17.9044, lng:-62.8436, elev_ft:49  },
  TFFG: { icao:'TFFG', name:'Saint-Martin Grand Case',  short:'SXM-GC', lat:18.0999, lng:-63.0472, elev_ft:7   },
  TNCM: { icao:'TNCM', name:'Sint Maarten Juliana',     short:'SXM',    lat:18.0410, lng:-63.1089, elev_ft:13  },
  TQPF: { icao:'TQPF', name:'Anguilla Clayton Lloyd',   short:'AXA',    lat:18.2048, lng:-63.0551, elev_ft:127 },
  TFFR: { icao:'TFFR', name:'Guadeloupe Pôle Caraïbes', short:'PTP',    lat:16.2653, lng:-61.5317, elev_ft:36  },
}

// ── Bounding box resserrée (focus cluster SBH/SXM/AXA) ───────────────────────
// Avant : 15.8–18.8 / -64.2–-60.8  → îles invisibles, tout compressé
// Après : 17.3–18.6 / -63.6–-62.1  → aéroports bien espacés, lisibles
export const MAP_BOUNDS = {
  minLat: 17.30, maxLat: 18.60,
  minLng:-63.60, maxLng:-62.10,
}

export const SVG_W = 900
export const SVG_H = 520

/**
 * Projection Mercator → coordonnées SVG
 */
export const project = (lat, lng, svgW = SVG_W, svgH = SVG_H) => {
  const { minLat, maxLat, minLng, maxLng } = MAP_BOUNDS
  const x      = ((lng - minLng) / (maxLng - minLng)) * svgW
  const mercY  = v => Math.log(Math.tan(Math.PI / 4 + v * Math.PI / 360))
  const yMin   = mercY(minLat), yMax = mercY(maxLat)
  const y      = svgH - ((mercY(lat) - yMin) / (yMax - yMin)) * svgH
  return { x, y }
}

/**
 * Convertit des nm en pixels SVG (pour rayons météo, etc.)
 */
export const nmToPx = (nm, svgW = SVG_W) => {
  const lngSpan  = MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng
  const pxPerDeg = svgW / lngSpan
  return (nm / 60) * pxPerDeg   // 1° ≈ 60 nm à cette latitude
}

/**
 * Distance orthodromique (nm)
 */
export const distanceNm = (lat1, lng1, lat2, lng2) => {
  const R    = 3440.065
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

/**
 * Cap orthodromique (degrés, 0=Nord)
 */
export const bearingDeg = (lat1, lng1, lat2, lng2) => {
  const f1 = lat1*Math.PI/180, f2 = lat2*Math.PI/180
  const dl = (lng2-lng1)*Math.PI/180
  const y  = Math.sin(dl)*Math.cos(f2)
  const x  = Math.cos(f1)*Math.sin(f2) - Math.sin(f1)*Math.cos(f2)*Math.cos(dl)
  return ((Math.atan2(y,x)*180/Math.PI)+360)%360
}

/**
 * Point intermédiaire sur grande-circulaire
 */
export const intermediatePoint = (lat1, lng1, lat2, lng2, f) => {
  const f1=lat1*Math.PI/180, l1=lng1*Math.PI/180
  const f2=lat2*Math.PI/180, l2=lng2*Math.PI/180
  const d  = 2*Math.asin(Math.sqrt(Math.sin((f2-f1)/2)**2 + Math.cos(f1)*Math.cos(f2)*Math.sin((l2-l1)/2)**2))
  if(d===0) return {lat:lat1,lng:lng1}
  const A=Math.sin((1-f)*d)/Math.sin(d), B=Math.sin(f*d)/Math.sin(d)
  const x=A*Math.cos(f1)*Math.cos(l1)+B*Math.cos(f2)*Math.cos(l2)
  const y=A*Math.cos(f1)*Math.sin(l1)+B*Math.cos(f2)*Math.sin(l2)
  const z=A*Math.sin(f1)+B*Math.sin(f2)
  return { lat:Math.atan2(z,Math.sqrt(x**2+y**2))*180/Math.PI, lng:Math.atan2(y,x)*180/Math.PI }
}

/**
 * ETA dynamique
 */
export const computeETA = (cLat, cLng, dLat, dLng, speedKts) => {
  if(!speedKts||speedKts<10) return null
  const remainNm  = distanceNm(cLat,cLng,dLat,dLng)
  const remainMin = Math.round((remainNm/speedKts)*60)
  const eta       = new Date(Date.now()+remainMin*60000)
  return {
    remainNm: Math.round(remainNm), remainMin, eta,
    etaStr: eta.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),
  }
}

/**
 * Génère une trajectoire simulée (montée/croisière/descente)
 */
export const simulateTrack = (originIcao, destIcao, startTime, speedKts=170) => {
  const orig=AIRPORTS[originIcao], dest=AIRPORTS[destIcao]
  if(!orig||!dest) return []
  const totalNm  = distanceNm(orig.lat,orig.lng,dest.lat,dest.lng)
  const totalMin = (totalNm/speedKts)*60
  const steps    = Math.max(12, Math.round(totalMin*2))
  return Array.from({length:steps+1},(_,i)=>{
    const f   = i/steps
    const pos = intermediatePoint(orig.lat,orig.lng,dest.lat,dest.lng,f)
    const alt = f<0.3?(f/0.3)*8500:f<0.7?8500:((1-f)/0.3)*8500
    return {
      lat:pos.lat, lng:pos.lng,
      altitude_ft:Math.round(alt), speed_kts:speedKts,
      heading:bearingDeg(orig.lat,orig.lng,dest.lat,dest.lng),
      timestamp:new Date(startTime.getTime()+f*totalMin*60000).toISOString(),
    }
  })
}

/**
 * Interpolation position sur track
 */
export const interpolatePosition = (pts, now=new Date()) => {
  if(!pts?.length) return null
  const t=now.getTime(), times=pts.map(p=>new Date(p.timestamp).getTime())
  if(t<=times[0])               return {...pts[0],              progress:0}
  if(t>=times[times.length-1]) return {...pts[pts.length-1],   progress:1}
  let i=0; while(i<times.length-1&&times[i+1]<t) i++
  const f=(t-times[i])/(times[i+1]-times[i])
  const p0=pts[i],p1=pts[i+1]
  return {
    lat:        p0.lat+(p1.lat-p0.lat)*f,
    lng:        p0.lng+(p1.lng-p0.lng)*f,
    altitude_ft:Math.round(p0.altitude_ft+(p1.altitude_ft-p0.altitude_ft)*f),
    speed_kts:  Math.round(p0.speed_kts+(p1.speed_kts-p0.speed_kts)*f),
    heading:    p0.heading,
    progress:   (i+f)/(pts.length-1),
  }
}

// ── Zones météo — rayons en nm (convertis en px dans le composant) ─────────────
export const WEATHER_ZONES = [
  {
    id:'wx1', type:'SIGMET', severity:'warning',
    lat:18.20, lng:-63.16, radiusNm:7,
    label:'CB actifs',
    color:'rgba(245,158,11,0.15)', border:'rgba(245,158,11,0.7)',
    detail:'Cumulo-nimbus signalés, turbulences modérées FL080',
  },
  {
    id:'wx2', type:'METAR', severity:'info',
    lat:17.87, lng:-62.75, radiusNm:5,
    label:'Vis réduite',
    color:'rgba(99,102,241,0.12)', border:'rgba(99,102,241,0.6)',
    detail:'Brume, visibilité 5 km, plafond 1800 ft',
  },
]

export const routeIntersectsWeather = (origIcao,destIcao,zones=WEATHER_ZONES) => {
  const orig=AIRPORTS[origIcao], dest=AIRPORTS[destIcao]
  if(!orig||!dest) return []
  return zones.filter(zone=>{
    for(let f=0.1;f<=0.9;f+=0.2){
      const pt=intermediatePoint(orig.lat,orig.lng,dest.lat,dest.lng,f)
      if(distanceNm(pt.lat,pt.lng,zone.lat,zone.lng)<=zone.radiusNm) return true
    }
    return false
  })
}

export const headingToCardinal = h => {
  const d=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO']
  return d[Math.round(h/22.5)%16]
}

// ── Polygones îles recalibrés pour la nouvelle bounding box ──────────────────
export const ISLANDS = [
  {
    name:'St-Barth', fill:'#152840', stroke:'#1E4A6F', sw:1.5,
    points:[
      [17.877,-62.878],[17.896,-62.860],[17.912,-62.846],[17.924,-62.828],
      [17.929,-62.808],[17.925,-62.787],[17.917,-62.772],[17.905,-62.762],
      [17.891,-62.760],[17.876,-62.766],[17.865,-62.782],[17.858,-62.802],
      [17.856,-62.824],[17.861,-62.848],[17.870,-62.866],
    ],
  },
  {
    name:'St-Martin', fill:'#152840', stroke:'#1E4A6F', sw:1.5,
    points:[
      [18.072,-63.062],[18.085,-63.038],[18.099,-63.012],[18.112,-62.990],
      [18.122,-62.970],[18.128,-62.955],[18.120,-62.948],[18.105,-62.955],
      [18.088,-62.968],[18.073,-62.992],[18.060,-63.018],[18.050,-63.042],
      [18.052,-63.060],[18.062,-63.068],
    ],
  },
  {
    name:'Sint-Maarten', fill:'#152840', stroke:'#1E4A6F', sw:1.2,
    points:[
      [18.040,-63.098],[18.052,-63.075],[18.063,-63.055],[18.055,-63.038],
      [18.042,-63.030],[18.028,-63.028],[18.018,-63.040],[18.014,-63.062],
      [18.018,-63.082],[18.030,-63.098],
    ],
  },
  {
    name:'Anguilla', fill:'#162535', stroke:'#1E4A6F', sw:1.2,
    points:[
      [18.168,-63.148],[18.180,-63.118],[18.193,-63.085],[18.208,-63.052],
      [18.222,-63.022],[18.233,-62.994],[18.238,-62.970],[18.228,-62.958],
      [18.214,-62.960],[18.198,-62.968],[18.182,-62.982],[18.170,-63.005],
      [18.158,-63.040],[18.150,-63.078],[18.152,-63.112],[18.160,-63.140],
    ],
  },
  {
    name:'Saba', fill:'#152840', stroke:'#1E4A6F', sw:0.8,
    points:[
      [17.622,-63.244],[17.632,-63.228],[17.644,-63.220],[17.650,-63.228],
      [17.647,-63.244],[17.636,-63.254],[17.622,-63.254],
    ],
  },
]

// Routes SBH Commuter
export const ROUTES = [
  ['TFFJ','TFFG'],['TFFJ','TNCM'],['TFFJ','TQPF'],
  ['TFFG','TNCM'],['TFFG','TQPF'],['TNCM','TQPF'],
]