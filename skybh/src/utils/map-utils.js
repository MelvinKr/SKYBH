/**
 * @fileoverview Utilitaires géographiques — Live Map SKYBH
 * Projection Mercator · Calculs ETA · Interpolation trajectoire
 * Pur, testable isolément.
 */

// ── Aéroports SBH Commuter ─────────────────────────────────────────────────────
export const AIRPORTS = {
  TFFJ: { icao:'TFFJ', name:'Saint-Barthélemy',  short:'SBH', lat:17.9044, lng:-62.8436, elev_ft:49  },
  TFFG: { icao:'TFFG', name:'Saint-Martin Grand Case', short:'SXM-GC', lat:18.0999, lng:-63.0472, elev_ft:7  },
  TNCM: { icao:'TNCM', name:'Sint Maarten Princess Juliana', short:'SXM', lat:18.0410, lng:-63.1089, elev_ft:13 },
  TQPF: { icao:'TQPF', name:'Anguilla Clayton Lloyd', short:'AXA', lat:18.2048, lng:-63.0551, elev_ft:127},
  TFFR: { icao:'TFFR', name:'Guadeloupe Pôle Caraïbes', short:'PTP', lat:16.2653, lng:-61.5317, elev_ft:36 },
}

// Bounding box carte (zone Caraïbes nord — SBH centrée)
export const MAP_BOUNDS = {
  minLat: 15.8, maxLat: 18.8,
  minLng:-64.2, maxLng:-60.8,
}

/**
 * Projection Mercator → coordonnées SVG
 * @param {number} lat
 * @param {number} lng
 * @param {number} svgW  largeur SVG
 * @param {number} svgH  hauteur SVG
 */
export const project = (lat, lng, svgW, svgH) => {
  const { minLat, maxLat, minLng, maxLng } = MAP_BOUNDS
  const x = ((lng - minLng) / (maxLng - minLng)) * svgW
  // Mercator Y (inversé car SVG Y croît vers le bas)
  const latRad    = lat * Math.PI / 180
  const minLatRad = minLat * Math.PI / 180
  const maxLatRad = maxLat * Math.PI / 180
  const mercY     = v => Math.log(Math.tan(Math.PI/4 + v/2))
  const y = svgH - ((mercY(latRad) - mercY(minLatRad)) / (mercY(maxLatRad) - mercY(minLatRad))) * svgH
  return { x, y }
}

/**
 * Distance orthodromique entre deux points (nm)
 */
export const distanceNm = (lat1, lng1, lat2, lng2) => {
  const R    = 3440.065  // Rayon Terre en nm
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

/**
 * Cap orthodromique entre deux points (degrés, 0=Nord)
 */
export const bearingDeg = (lat1, lng1, lat2, lng2) => {
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const y   = Math.sin(Δλ) * Math.cos(φ2)
  const x   = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

/**
 * Point intermédiaire sur la grande-circulaire
 * @param {number} f  fraction [0-1]
 */
export const intermediatePoint = (lat1, lng1, lat2, lng2, f) => {
  const φ1 = lat1*Math.PI/180, λ1 = lng1*Math.PI/180
  const φ2 = lat2*Math.PI/180, λ2 = lng2*Math.PI/180
  const d   = 2*Math.asin(Math.sqrt(Math.sin((φ2-φ1)/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin((λ2-λ1)/2)**2))
  if (d === 0) return { lat:lat1, lng:lng1 }
  const A   = Math.sin((1-f)*d)/Math.sin(d)
  const B   = Math.sin(f*d)/Math.sin(d)
  const x   = A*Math.cos(φ1)*Math.cos(λ1) + B*Math.cos(φ2)*Math.cos(λ2)
  const y   = A*Math.cos(φ1)*Math.sin(λ1) + B*Math.cos(φ2)*Math.sin(λ2)
  const z   = A*Math.sin(φ1)              + B*Math.sin(φ2)
  return {
    lat: Math.atan2(z, Math.sqrt(x**2+y**2)) * 180/Math.PI,
    lng: Math.atan2(y, x) * 180/Math.PI,
  }
}

/**
 * ETA dynamique depuis position courante
 */
export const computeETA = (currentLat, currentLng, destLat, destLng, speedKts) => {
  if (!speedKts || speedKts < 10) return null
  const remainNm  = distanceNm(currentLat, currentLng, destLat, destLng)
  const remainMin = Math.round((remainNm / speedKts) * 60)
  const eta       = new Date(Date.now() + remainMin * 60000)
  return {
    remainNm:  Math.round(remainNm),
    remainMin,
    eta,
    etaStr: eta.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }),
  }
}

/**
 * Génère une trajectoire simulée réaliste entre deux aéroports
 * Profil : montée → croisière → descente
 * @returns {TrackPoint[]}
 */
export const simulateTrack = (originIcao, destIcao, startTime, speedKts = 170) => {
  const orig = AIRPORTS[originIcao]
  const dest = AIRPORTS[destIcao]
  if (!orig || !dest) return []

  const totalNm  = distanceNm(orig.lat, orig.lng, dest.lat, dest.lng)
  const totalMin = (totalNm / speedKts) * 60
  const points   = []
  const steps    = Math.max(8, Math.round(totalMin * 2)) // point toutes les 30s

  for (let i = 0; i <= steps; i++) {
    const f   = i / steps
    const pos = intermediatePoint(orig.lat, orig.lng, dest.lat, dest.lng, f)

    // Profil altitude : montée 30%, croisière 40%, descente 30%
    const climbFt   = 8500
    const altFt = f < 0.3  ? (f / 0.3)  * climbFt
                : f < 0.7  ? climbFt
                : ((1-f) / 0.3) * climbFt

    const t = new Date(startTime.getTime() + (f * totalMin * 60000))
    points.push({
      lat:         pos.lat,
      lng:         pos.lng,
      altitude_ft: Math.round(altFt),
      speed_kts:   speedKts,
      heading:     bearingDeg(orig.lat, orig.lng, dest.lat, dest.lng),
      timestamp:   t.toISOString(),
    })
  }
  return points
}

/**
 * Position interpolée à l'instant t depuis un tableau de TrackPoints
 */
export const interpolatePosition = (trackPoints, now = new Date()) => {
  if (!trackPoints?.length) return null
  const t = now.getTime()
  const times = trackPoints.map(p => new Date(p.timestamp).getTime())

  // Avant le premier point
  if (t <= times[0]) return { ...trackPoints[0], progress:0 }
  // Après le dernier point
  if (t >= times[times.length-1]) return { ...trackPoints[trackPoints.length-1], progress:1 }

  // Trouver l'intervalle
  let i = 0
  while (i < times.length-1 && times[i+1] < t) i++

  const t0 = times[i], t1 = times[i+1]
  const f  = (t - t0) / (t1 - t0)
  const p0 = trackPoints[i], p1 = trackPoints[i+1]

  return {
    lat:         p0.lat + (p1.lat - p0.lat) * f,
    lng:         p0.lng + (p1.lng - p0.lng) * f,
    altitude_ft: Math.round(p0.altitude_ft + (p1.altitude_ft - p0.altitude_ft) * f),
    speed_kts:   Math.round(p0.speed_kts + (p1.speed_kts - p0.speed_kts) * f),
    heading:     p0.heading,
    progress:    (i + f) / (trackPoints.length - 1),
  }
}

/**
 * Zones météo simulées sur les routes SBH
 */
export const WEATHER_ZONES = [
  { id:'wx1', type:'SIGMET', severity:'warning', lat:18.15, lng:-63.3, radiusNm:12,
    label:'CB actifs', color:'rgba(245,158,11,0.25)', border:'rgba(245,158,11,0.7)',
    detail:'Cumulo-nimbus signalés, turbulences modérées FL080' },
  { id:'wx2', type:'METAR', severity:'info', lat:17.85, lng:-62.6, radiusNm:8,
    label:'Vis réduite', color:'rgba(99,102,241,0.15)', border:'rgba(99,102,241,0.5)',
    detail:'Brume, visibilité 5km, plafond 1800ft' },
]

/**
 * Vérifie si une route traverse une zone météo
 */
export const routeIntersectsWeather = (origIcao, destIcao, zones = WEATHER_ZONES) => {
  const orig = AIRPORTS[origIcao]
  const dest = AIRPORTS[destIcao]
  if (!orig || !dest) return []

  return zones.filter(zone => {
    // Vérifie 5 points sur la route
    for (let f = 0.1; f <= 0.9; f += 0.2) {
      const pt = intermediatePoint(orig.lat, orig.lng, dest.lat, dest.lng, f)
      const d  = distanceNm(pt.lat, pt.lng, zone.lat, zone.lng)
      if (d <= zone.radiusNm) return true
    }
    return false
  })
}

/** Formate cap en direction cardinale */
export const headingToCardinal = (h) => {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO']
  return dirs[Math.round(h/22.5) % 16]
}
