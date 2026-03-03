/**
 * @fileoverview Calculs Weight & Balance — SBH Commuter
 * Cessna 208B Grand Caravan & 208B Grand Caravan EX
 *
 * ⚠️  IMPORTANT : Ces valeurs sont issues des données constructeur Cessna.
 *     Elles doivent être validées et ajustées par le chef pilote
 *     selon les Flight Manual (AFM) spécifiques de chaque appareil.
 *
 * Référence : Cessna 208B AFM — FAA/DGAC certified
 * Unités    : kg pour les masses, mètres pour les bras de levier
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATIONS PAR VARIANTE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AircraftConfig
 * @property {string}   name          - Nom complet de la variante
 * @property {number}   mtow          - Maximum Takeoff Weight (kg)
 * @property {number}   mlw           - Maximum Landing Weight (kg)
 * @property {number}   mzfw          - Maximum Zero Fuel Weight (kg)
 * @property {number}   emptyWeight   - Masse à vide opérationnelle (kg) — À ajuster par avion
 * @property {number}   emptyCG       - CG à vide (m) — À ajuster par avion
 * @property {number}   fuelCapacity  - Capacité carburant max (litres)
 * @property {number}   fuelDensity   - Densité Jet-A1 (kg/L) — standard OACI
 * @property {object}   cgLimits      - Limites envelope CG (m)
 * @property {object}   stations      - Bras de levier des stations (m)
 */

/** @type {Object.<string, AircraftConfig>} */
export const AIRCRAFT_CONFIGS = {

  // ── Cessna 208B Grand Caravan (standard) ─────────────────────
  // Appareils : F-OSBC, F-OSBM, F-OSBS
  C208B: {
    name: 'Cessna 208B Grand Caravan',
    mtow: 3969,       // kg — ⚠️ À valider AFM
    mlw: 3969,        // kg — même que MTOW sur C208B
    mzfw: 3379,       // kg — ⚠️ À valider AFM
    emptyWeight: 2145, // kg — valeur type, DOIT être ajustée par avion (pesée)
    emptyCG: 4.61,    // m  — valeur type, DOIT être ajustée par avion (pesée)
    fuelCapacity: 1009, // litres (réservoirs standard)
    fuelDensity: 0.800, // kg/L — Jet-A1 à +15°C (varie avec température)

    /**
     * Limites CG selon la masse (envelope DGAC)
     * ⚠️ Vérifier les courbes exactes dans l'AFM section 6
     */
    cgLimits: {
      forward: 4.47,  // m — limite avant (nez)
      aft: 4.98,      // m — limite arrière (queue)
    },

    /**
     * Bras de levier des stations — distance depuis le datum (nez avion)
     * ⚠️ Ces valeurs sont à confirmer avec le chef pilote
     */
    stations: {
      pilot:        { arm: 2.27, label: 'Pilote' },
      copilot:      { arm: 2.27, label: 'Copilote / Siège avant droit' },
      row1:         { arm: 3.35, label: 'Rangée 1 (sièges 1-2)' },
      row2:         { arm: 4.27, label: 'Rangée 2 (sièges 3-4)' },
      row3:         { arm: 5.18, label: 'Rangée 3 (sièges 5-6)' },
      row4:         { arm: 6.10, label: 'Rangée 4 (sièges 7-8)' },
      row5:         { arm: 7.01, label: 'Rangée 5 (siège 9)' },
      baggageFwd:   { arm: 1.52, label: 'Soute avant' },
      baggageAft:   { arm: 8.23, label: 'Soute arrière' },
      fuel:         { arm: 4.53, label: 'Carburant (réservoirs ailes)' },
    },
  },

  // ── Cessna 208B Grand Caravan EX ─────────────────────────────
  // Appareils : F-OSCO, F-OSCP, F-OSJR
  C208B_EX: {
    name: 'Cessna 208B Grand Caravan EX',
    mtow: 4082,       // kg — MTOW supérieur sur EX ⚠️ À valider AFM
    mlw: 4082,        // kg
    mzfw: 3470,       // kg — ⚠️ À valider AFM
    emptyWeight: 2228, // kg — valeur type EX, DOIT être ajustée par avion
    emptyCG: 4.63,    // m  — valeur type EX, DOIT être ajustée par avion
    fuelCapacity: 1009, // litres (identique standard)
    fuelDensity: 0.800,

    cgLimits: {
      forward: 4.47,
      aft: 4.98,
    },

    stations: {
      pilot:        { arm: 2.27, label: 'Pilote' },
      copilot:      { arm: 2.27, label: 'Copilote / Siège avant droit' },
      row1:         { arm: 3.35, label: 'Rangée 1 (sièges 1-2)' },
      row2:         { arm: 4.27, label: 'Rangée 2 (sièges 3-4)' },
      row3:         { arm: 5.18, label: 'Rangée 3 (sièges 5-6)' },
      row4:         { arm: 6.10, label: 'Rangée 4 (sièges 7-8)' },
      row5:         { arm: 7.01, label: 'Rangée 5 (siège 9)' },
      baggageFwd:   { arm: 1.52, label: 'Soute avant' },
      baggageAft:   { arm: 8.23, label: 'Soute arrière' },
      fuel:         { arm: 4.53, label: 'Carburant (réservoirs ailes)' },
    },
  },
}

/**
 * Mapping immatriculation → variante
 * ⚠️ Mettre à jour si la flotte évolue
 */
export const REGISTRATION_TO_CONFIG = {
  'F-OSBC': 'C208B',
  'F-OSBM': 'C208B',
  'F-OSBS': 'C208B',
  'F-OSCO': 'C208B_EX',
  'F-OSCP': 'C208B_EX',
  'F-OSJR': 'C208B_EX',
}

/**
 * Poids standard passager DGAC (sans bagages)
 * Référence : Règlement EU 965/2012 / DGAC
 */
export const STD_PAX_WEIGHTS = {
  adult:   84,  // kg — adulte standard (été : 76kg, hiver : 84kg)
  child:   35,  // kg — enfant (2-12 ans)
  infant:  0,   // kg — nourrisson (<2 ans, sur genoux, non compté)
  summer:  76,  // kg — adulte été (option)
  winter:  84,  // kg — adulte hiver (option)
}

/**
 * Franchise bagages standard SBH Commuter
 * ⚠️ À confirmer avec la direction commerciale
 */
export const BAGGAGE_ALLOWANCE = {
  standard: 10, // kg par passager
  excess_fee_per_kg: 5, // EUR par kg excédentaire
}


// ─────────────────────────────────────────────────────────────────────────────
// FONCTIONS DE CALCUL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Récupère la configuration d'un appareil par son immatriculation
 * @param {string} registration - Ex: 'F-OSBC'
 * @returns {AircraftConfig}
 * @throws {Error} si immatriculation inconnue
 */
export function getAircraftConfig(registration) {
  const configKey = REGISTRATION_TO_CONFIG[registration]
  if (!configKey) {
    throw new Error(`Immatriculation inconnue : ${registration}`)
  }
  return AIRCRAFT_CONFIGS[configKey]
}

/**
 * Convertit des litres de carburant en kg
 * @param {number} liters
 * @param {number} [density] - kg/L (défaut : 0.800 pour Jet-A1)
 * @returns {number} kg
 */
export function fuelLitersToKg(liters, density = 0.800) {
  return Math.round(liters * density * 10) / 10
}

/**
 * Convertit des kg de carburant en litres
 * @param {number} kg
 * @param {number} [density]
 * @returns {number} litres
 */
export function fuelKgToLiters(kg, density = 0.800) {
  return Math.round((kg / density) * 10) / 10
}

/**
 * Calcule le moment d'un élément (masse × bras)
 * @param {number} weight - kg
 * @param {number} arm    - m
 * @returns {number} kg·m
 */
export function calcMoment(weight, arm) {
  return weight * arm
}

/**
 * @typedef {Object} LoadItem
 * @property {string} station  - Clé de station (ex: 'row1', 'baggageAft')
 * @property {number} weight   - kg
 * @property {string} [label]  - Description libre
 */

/**
 * @typedef {Object} WBResult
 * @property {boolean} isValid          - true si tous les paramètres sont dans les limites
 * @property {number}  zeroFuelWeight   - kg
 * @property {number}  zeroFuelCG       - m
 * @property {number}  takeoffWeight    - kg
 * @property {number}  takeoffCG        - m
 * @property {number}  landingWeight    - kg (après carburant brûlé)
 * @property {number}  landingCG        - m
 * @property {number}  totalMoment      - kg·m
 * @property {number}  usableFuelKg     - kg
 * @property {number}  marginToMTOW     - kg de marge avant MTOW
 * @property {number}  marginToMZFW     - kg de marge avant MZFW
 * @property {object}  cgStatus         - Statut CG (avant/dans/après limites)
 * @property {string[]} warnings        - Messages d'avertissement
 * @property {string[]} errors          - Messages d'erreur bloquants
 */

/**
 * Calcul complet du Weight & Balance
 *
 * @param {string}     registration  - Immatriculation avion (ex: 'F-OSBC')
 * @param {LoadItem[]} loadItems     - Liste des charges (pax, bagages, etc.)
 * @param {number}     fuelKg        - Carburant au décollage (kg)
 * @param {number}     tripFuelKg    - Carburant brûlé en vol (kg) pour calcul masse atterrissage
 * @returns {WBResult}
 */
export function calculateWB(registration, loadItems, fuelKg, tripFuelKg = 0) {
  const config   = getAircraftConfig(registration)
  const warnings = []
  const errors   = []

  // ── Masse et moment à vide ────────────────────────────────
  let totalWeight = config.emptyWeight
  let totalMoment = calcMoment(config.emptyWeight, config.emptyCG)

  // ── Ajout des charges utiles ──────────────────────────────
  for (const item of loadItems) {
    const station = config.stations[item.station]
    if (!station) {
      warnings.push(`Station inconnue ignorée : "${item.station}"`)
      continue
    }
    totalWeight += item.weight
    totalMoment += calcMoment(item.weight, station.arm)
  }

  // ── Zero Fuel Weight & CG ─────────────────────────────────
  const zeroFuelWeight = totalWeight
  const zeroFuelCG     = totalWeight > 0 ? totalMoment / totalWeight : 0

  // Vérification MZFW
  if (zeroFuelWeight > config.mzfw) {
    errors.push(`MZFW dépassé : ${zeroFuelWeight} kg > ${config.mzfw} kg (excès : ${Math.round(zeroFuelWeight - config.mzfw)} kg)`)
  }

  // ── Ajout carburant → Takeoff Weight ─────────────────────
  const usableFuelKg   = Math.min(fuelKg, fuelLitersToKg(config.fuelCapacity))
  const takeoffWeight  = zeroFuelWeight + usableFuelKg
  const takeoffMoment  = totalMoment + calcMoment(usableFuelKg, config.stations.fuel.arm)
  const takeoffCG      = takeoffWeight > 0 ? takeoffMoment / takeoffWeight : 0

  if (fuelKg > fuelLitersToKg(config.fuelCapacity)) {
    warnings.push(`Carburant renseigné (${fuelKg} kg) dépasse la capacité max (${fuelLitersToKg(config.fuelCapacity)} kg). Valeur plafonnée.`)
  }

  // Vérification MTOW
  if (takeoffWeight > config.mtow) {
    errors.push(`MTOW dépassé : ${Math.round(takeoffWeight)} kg > ${config.mtow} kg (excès : ${Math.round(takeoffWeight - config.mtow)} kg)`)
  }

  // ── CG au décollage ───────────────────────────────────────
  const cgStatus = getCGStatus(takeoffCG, config.cgLimits)
  if (cgStatus === 'forward') {
    errors.push(`CG trop avant : ${takeoffCG.toFixed(3)} m < limite avant ${config.cgLimits.forward} m`)
  } else if (cgStatus === 'aft') {
    errors.push(`CG trop arrière : ${takeoffCG.toFixed(3)} m > limite arrière ${config.cgLimits.aft} m`)
  }

  // ── Masse et CG à l'atterrissage ─────────────────────────
  const landingFuelKg  = Math.max(0, usableFuelKg - tripFuelKg)
  const landingWeight  = zeroFuelWeight + landingFuelKg
  const landingMoment  = totalMoment + calcMoment(landingFuelKg, config.stations.fuel.arm)
  const landingCG      = landingWeight > 0 ? landingMoment / landingWeight : 0

  if (landingWeight > config.mlw) {
    errors.push(`MLW dépassé à l'atterrissage : ${Math.round(landingWeight)} kg > ${config.mlw} kg`)
  }

  // ── Marges ────────────────────────────────────────────────
  const marginToMTOW = config.mtow - takeoffWeight
  const marginToMZFW = config.mzfw - zeroFuelWeight

  // Avertissements proactifs
  if (marginToMTOW >= 0 && marginToMTOW < 50) {
    warnings.push(`Attention : marge MTOW très faible (${Math.round(marginToMTOW)} kg)`)
  }
  if (marginToMZFW >= 0 && marginToMZFW < 50) {
    warnings.push(`Attention : marge MZFW très faible (${Math.round(marginToMZFW)} kg)`)
  }

  return {
    isValid:        errors.length === 0,
    zeroFuelWeight: Math.round(zeroFuelWeight * 10) / 10,
    zeroFuelCG:     Math.round(zeroFuelCG * 1000) / 1000,
    takeoffWeight:  Math.round(takeoffWeight * 10) / 10,
    takeoffCG:      Math.round(takeoffCG * 1000) / 1000,
    landingWeight:  Math.round(landingWeight * 10) / 10,
    landingCG:      Math.round(landingCG * 1000) / 1000,
    totalMoment:    Math.round(totalMoment * 10) / 10,
    usableFuelKg:   Math.round(usableFuelKg * 10) / 10,
    marginToMTOW:   Math.round(marginToMTOW * 10) / 10,
    marginToMZFW:   Math.round(marginToMZFW * 10) / 10,
    cgStatus,
    warnings,
    errors,
    // Données brutes pour affichage
    config,
    registration,
  }
}

/**
 * Détermine si le CG est dans l'enveloppe
 * @param {number} cg
 * @param {{forward: number, aft: number}} limits
 * @returns {'ok'|'forward'|'aft'}
 */
export function getCGStatus(cg, limits) {
  if (cg < limits.forward) return 'forward'
  if (cg > limits.aft)     return 'aft'
  return 'ok'
}

/**
 * Calcule le nombre de passagers max admissibles étant donné
 * un carburant et une masse bagages fixés
 * @param {string} registration
 * @param {number} fuelKg
 * @param {number} baggageKg
 * @param {number} [paxWeight] - kg par pax (défaut adulte DGAC)
 * @returns {number} max pax
 */
export function maxPassengers(registration, fuelKg, baggageKg, paxWeight = STD_PAX_WEIGHTS.adult) {
  const config     = getAircraftConfig(registration)
  const baseWeight = config.emptyWeight + fuelKg + baggageKg
  const available  = Math.min(config.mtow, config.mzfw + fuelKg) - baseWeight
  return Math.max(0, Math.floor(available / paxWeight))
}

/**
 * Génère un résumé textuel du résultat W&B (pour manifeste / impression)
 * @param {WBResult} result
 * @returns {string}
 */
export function formatWBSummary(result) {
  const status = result.isValid ? '✓ CONFORME' : '✗ NON CONFORME'
  const lines = [
    `W&B ${result.registration} — ${status}`,
    `─────────────────────────────────────`,
    `Masse à vide opé.  : ${result.config.emptyWeight} kg`,
    `Zero Fuel Weight   : ${result.zeroFuelWeight} kg  (CG: ${result.zeroFuelCG} m)`,
    `Carburant emporté  : ${result.usableFuelKg} kg`,
    `Masse décollage    : ${result.takeoffWeight} kg  (CG: ${result.takeoffCG} m)`,
    `Masse atterrissage : ${result.landingWeight} kg  (CG: ${result.landingCG} m)`,
    `MTOW               : ${result.config.mtow} kg  (marge: ${result.marginToMTOW} kg)`,
    `Limites CG         : ${result.config.cgLimits.forward} m → ${result.config.cgLimits.aft} m`,
  ]
  if (result.warnings.length) {
    lines.push(`\nAvertissements :`)
    result.warnings.forEach(w => lines.push(`  ⚠ ${w}`))
  }
  if (result.errors.length) {
    lines.push(`\nErreurs bloquantes :`)
    result.errors.forEach(e => lines.push(`  ✗ ${e}`))
  }
  return lines.join('\n')
}
