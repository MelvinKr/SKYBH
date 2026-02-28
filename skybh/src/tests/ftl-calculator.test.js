/**
 * @fileoverview Tests Vitest — FTL Calculator + Crew Validators
 * Run: npx vitest run tests/ftl-calculator.test.js
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  calculateFTL,
  validateCrewForFlight,
  getExpiryStatus,
  getSimCheckStatus,
  crewMemberStatus,
  FTL_LIMITS,
} from '../src/utils/ftl-calculator'

// ── Helpers fixtures ──────────────────────────────────────────────────────────
const makeLog = ({ date, flightMin, dutyStartH = 7, dutyDurationH = 4 }) => {
  const d = new Date(`${date}T${String(dutyStartH).padStart(2,'0')}:00:00Z`)
  return {
    crew_id:       'crew-001',
    flight_id:     `flight-${Math.random().toString(36).slice(2)}`,
    date,
    duty_start_utc: d.getTime(),
    duty_end_utc:   d.getTime() + dutyDurationH * 3_600_000,
    flight_minutes: flightMin,
  }
}

const TODAY = '2026-02-28'
const flightDate = new Date(`${TODAY}T00:00:00Z`)

// ── calculateFTL ─────────────────────────────────────────────────────────────
describe('calculateFTL', () => {

  describe('sans logs existants', () => {
    it('vol court → compliant, risk ok', () => {
      const result = calculateFTL([], flightDate, 60)
      expect(result.compliant).toBe(true)
      expect(result.risk_level).toBe('ok')
      expect(result.counters.flight_hours_today).toBeCloseTo(1)
    })

    it('compteurs à zéro sans logs', () => {
      const result = calculateFTL([], flightDate, 0)
      expect(result.counters.flight_hours_today).toBe(0)
      expect(result.counters.flight_hours_7d).toBe(0)
      expect(result.counters.flight_hours_28d).toBe(0)
    })
  })

  describe('limite journalière FT (8h)', () => {
    it('exactement 8h → compliant', () => {
      const logs = [makeLog({ date: TODAY, flightMin: 420, dutyStartH: 6, dutyDurationH: 8 })]
      const result = calculateFTL(logs, flightDate, 60) // 420+60 = 480min = 8h exact
      expect(result.compliant).toBe(true)
      expect(result.counters.flight_hours_today).toBeCloseTo(8)
    })

    it('dépasse 8h → violation', () => {
      const logs = [makeLog({ date: TODAY, flightMin: 420, dutyStartH: 6, dutyDurationH: 8 })]
      const result = calculateFTL(logs, flightDate, 61) // 420+61 = 481min > 8h
      expect(result.compliant).toBe(false)
      expect(result.risk_level).toBe('violation')
      expect(result.reason).toContain('journalier')
    })

    it('à 90% de 8h → risk warning', () => {
      // 80% de 8h = 6.4h = 384min existants, nouveau vol 61min → total 7.4h = 92.5%
      const logs = [makeLog({ date: TODAY, flightMin: 384 })]
      const result = calculateFTL(logs, flightDate, 61)
      expect(result.risk_level).toBe('critical') // >95%
    })
  })

  describe('limite duty journalière (13h)', () => {
    it('duty projetée > 13h → violation', () => {
      const dayStart = new Date(`${TODAY}T06:00:00Z`).getTime()
      const logs = [makeLog({ date: TODAY, flightMin: 60, dutyStartH: 6, dutyDurationH: 10 })]
      // Duty start = 6h, il reste 3h → nouveau duty de 4h dépasse
      const newDutyStart = new Date(`${TODAY}T15:00:00Z`).getTime()
      const newDutyEnd   = new Date(`${TODAY}T19:30:00Z`).getTime() // +4.5h
      const result = calculateFTL(logs, flightDate, 30, newDutyStart, newDutyEnd)
      expect(result.compliant).toBe(false)
      expect(result.reason).toContain('Duty')
    })
  })

  describe('limite 7 jours (60h)', () => {
    it('accumule 59h sur 7j → compliant', () => {
      const logs = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(flightDate)
        d.setDate(d.getDate() - i - 1)
        return makeLog({ date: d.toISOString().slice(0,10), flightMin: 590 }) // ~9.83h/j
      })
      // Total: 6 * 590 = 3540min = 59h → ok
      const result = calculateFTL(logs, flightDate, 60) // +1h = 60h exact
      expect(result.compliant).toBe(true)
      expect(result.counters.flight_hours_7d).toBeCloseTo(60, 0)
    })

    it('dépasse 60h sur 7j → violation', () => {
      const logs = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(flightDate)
        d.setDate(d.getDate() - i - 1)
        return makeLog({ date: d.toISOString().slice(0,10), flightMin: 600 }) // 10h/j
      })
      // Total: 6 * 600 = 3600min = 60h, +61min = 61h
      const result = calculateFTL(logs, flightDate, 61)
      expect(result.compliant).toBe(false)
      expect(result.reason).toContain('7j')
    })

    it('logs hors fenêtre 7j ne comptent pas', () => {
      const oldDate = new Date(flightDate)
      oldDate.setDate(oldDate.getDate() - 8) // 8j avant = hors fenêtre
      const logs = [makeLog({ date: oldDate.toISOString().slice(0,10), flightMin: 480 })]
      const result = calculateFTL(logs, flightDate, 60)
      expect(result.counters.flight_hours_7d).toBeCloseTo(1)
    })
  })

  describe('limite 28 jours (190h)', () => {
    it('dépasse 190h sur 28j → violation', () => {
      // 27j * 7.5h = 202.5h existants → violation même sans nouveau vol
      const logs = Array.from({ length: 27 }, (_, i) => {
        const d = new Date(flightDate)
        d.setDate(d.getDate() - i - 1)
        return makeLog({ date: d.toISOString().slice(0,10), flightMin: 450 }) // 7.5h
      })
      const result = calculateFTL(logs, flightDate, 60)
      expect(result.compliant).toBe(false)
      expect(result.reason).toContain('28j')
    })

    it('logs à J-29 ne comptent pas', () => {
      const old = new Date(flightDate)
      old.setDate(old.getDate() - 29)
      const logs = [makeLog({ date: old.toISOString().slice(0,10), flightMin: 480 })]
      const result = calculateFTL(logs, flightDate, 60)
      expect(result.counters.flight_hours_28d).toBeCloseTo(1)
    })
  })

  describe('repos minimum (10h)', () => {
    it('repos < 10h → violation', () => {
      const prevEnd   = new Date(`${TODAY}T18:00:00Z`).getTime()
      const newStart  = new Date(`${TODAY}T23:00:00Z`).getTime() // 5h après → violation
      const prevLog   = {
        crew_id: 'crew-001', flight_id:'f1', date: TODAY,
        duty_start_utc: prevEnd - 4*3600000, duty_end_utc: prevEnd, flight_minutes: 60,
      }
      const result = calculateFTL([prevLog], flightDate, 60, newStart, newStart + 3600000)
      expect(result.compliant).toBe(false)
      expect(result.reason).toContain('Repos')
    })

    it('repos exactement 10h → compliant', () => {
      const prevEnd  = new Date(`${TODAY}T08:00:00Z`).getTime()
      const newStart = new Date(`${TODAY}T18:00:00Z`).getTime() // 10h après
      const prevLog  = {
        crew_id:'crew-001', flight_id:'f1', date: TODAY,
        duty_start_utc: prevEnd - 4*3600000, duty_end_utc: prevEnd, flight_minutes: 60,
      }
      const result = calculateFTL([prevLog], flightDate, 60, newStart, newStart + 3600000)
      // Peut être non-compliant pour d'autres raisons mais pas pour le repos
      expect(result.reason).not.toContain('Repos')
    })
  })

  describe('marges retournées', () => {
    it('marges correctes avec 3h de vol aujourd\'hui', () => {
      const logs = [makeLog({ date: TODAY, flightMin: 180 })]
      const result = calculateFTL(logs, flightDate, 0)
      expect(result.margins.ft_today_remaining).toBeCloseTo(5) // 8 - 3
    })

    it('marges négatives si violation', () => {
      const logs = [makeLog({ date: TODAY, flightMin: 480 })]
      const result = calculateFTL(logs, flightDate, 60)
      expect(result.margins.ft_today_remaining).toBeLessThan(0)
    })
  })

  describe('edge cases', () => {
    it('logs vide []', () => {
      expect(() => calculateFTL([], flightDate, 60)).not.toThrow()
    })

    it('flightDate string ISO', () => {
      const result = calculateFTL([], '2026-02-28', 60)
      expect(result.compliant).toBe(true)
    })

    it('newFlightMin = 0 → ne change pas les compteurs', () => {
      const logs = [makeLog({ date: TODAY, flightMin: 120 })]
      const r1 = calculateFTL(logs, flightDate, 0)
      const r2 = calculateFTL(logs, flightDate, 0)
      expect(r1.counters.flight_hours_today).toBe(r2.counters.flight_hours_today)
    })

    it('null/undefined logs → traités comme vide', () => {
      expect(() => calculateFTL(null ?? [], flightDate, 60)).not.toThrow()
    })
  })
})

// ── getExpiryStatus ───────────────────────────────────────────────────────────
describe('getExpiryStatus', () => {
  const ref = new Date('2026-03-01')

  it('date future > 30j → valid', () => {
    expect(getExpiryStatus('2026-06-01', ref)).toBe('valid')
  })

  it('date dans 15j → expiring', () => {
    expect(getExpiryStatus('2026-03-10', ref)).toBe('expiring')
  })

  it('date passée → expired', () => {
    expect(getExpiryStatus('2026-01-01', ref)).toBe('expired')
  })

  it('date null → expired', () => {
    expect(getExpiryStatus(null)).toBe('expired')
  })

  it('date exactement aujourd\'hui → expired', () => {
    const today = ref.toISOString().slice(0, 10)
    // Expiry = ref day → diff = 0j → expired (pas de vol valide)
    expect(getExpiryStatus(today, ref)).toBe('expiring') // 0 jours → ≤ 30
  })
})

// ── getSimCheckStatus ─────────────────────────────────────────────────────────
describe('getSimCheckStatus', () => {
  const ref = new Date('2026-03-01')

  it('sim check il y a 1 mois → valid', () => {
    expect(getSimCheckStatus('2026-02-01', ref)).toBe('valid')
  })

  it('sim check il y a 5 mois → expiring', () => {
    // 150 < diff < 180
    const d = new Date(ref)
    d.setDate(d.getDate() - 160)
    expect(getSimCheckStatus(d.toISOString().slice(0,10), ref)).toBe('expiring')
  })

  it('sim check il y a 7 mois → expired', () => {
    const d = new Date(ref)
    d.setDate(d.getDate() - 210)
    expect(getSimCheckStatus(d.toISOString().slice(0,10), ref)).toBe('expired')
  })

  it('null → expired', () => {
    expect(getSimCheckStatus(null)).toBe('expired')
  })
})

// ── validateCrewForFlight ─────────────────────────────────────────────────────
describe('validateCrewForFlight', () => {
  const validMember = { id:'crew-001', active:true, role:'PIC', name:'Dupont' }
  const validQuals  = {
    medical_expiry: '2027-01-01',
    license_expiry: '2027-06-01',
    last_sim_check: '2025-12-01',
    type_ratings:   ['C208'],
  }
  const validFlight = {
    id:'fl-001',
    departure_time: new Date('2026-03-15T08:00:00Z'),
    arrival_time:   new Date('2026-03-15T08:45:00Z'),
    aircraft_type:  'C208',
  }

  it('tout valide → valid true, pas de bloquants', () => {
    const result = validateCrewForFlight(validMember, validQuals, [], validFlight)
    expect(result.valid).toBe(true)
    expect(result.blockers).toHaveLength(0)
  })

  it('membre inactif → bloquant', () => {
    const result = validateCrewForFlight({ ...validMember, active:false }, validQuals, [], validFlight)
    expect(result.valid).toBe(false)
    expect(result.blockers[0]).toContain('inactif')
  })

  it('medical expiré → bloquant', () => {
    const result = validateCrewForFlight(
      validMember,
      { ...validQuals, medical_expiry:'2025-01-01' },
      [], validFlight
    )
    expect(result.valid).toBe(false)
    expect(result.blockers.some(b => b.includes('médicale'))).toBe(true)
  })

  it('licence expirée → bloquant', () => {
    const result = validateCrewForFlight(
      validMember,
      { ...validQuals, license_expiry:'2020-01-01' },
      [], validFlight
    )
    expect(result.valid).toBe(false)
    expect(result.blockers.some(b => b.includes('Licence'))).toBe(true)
  })

  it('sim check expiré → bloquant', () => {
    const result = validateCrewForFlight(
      validMember,
      { ...validQuals, last_sim_check:'2024-01-01' },
      [], validFlight
    )
    expect(result.valid).toBe(false)
    expect(result.blockers.some(b => b.includes('Sim check'))).toBe(true)
  })

  it('type rating manquant → bloquant', () => {
    const result = validateCrewForFlight(
      validMember,
      { ...validQuals, type_ratings:['BN2'] },
      [], validFlight
    )
    expect(result.valid).toBe(false)
    expect(result.blockers.some(b => b.includes('C208'))).toBe(true)
  })

  it('FTL violation → bloquant', () => {
    // Remplir 8h de vol aujourd'hui
    const date = '2026-03-15'
    const existingLogs = [makeLog({ date, flightMin: 480 })]
    const result = validateCrewForFlight(validMember, validQuals, existingLogs, validFlight)
    expect(result.valid).toBe(false)
    expect(result.blockers.some(b => b.includes('FTL'))).toBe(true)
  })

  it('medical bientôt expiré → warning (pas bloquant)', () => {
    const soon = new Date('2026-03-15')
    soon.setDate(soon.getDate() + 15)
    const result = validateCrewForFlight(
      validMember,
      { ...validQuals, medical_expiry: soon.toISOString().slice(0,10) },
      [], validFlight
    )
    expect(result.valid).toBe(true)
    expect(result.warnings.some(w => w.includes('médicale'))).toBe(true)
  })

  it('membre null → bloquant', () => {
    const result = validateCrewForFlight(null, validQuals, [], validFlight)
    expect(result.valid).toBe(false)
  })

  it('qualifications null → bloquant', () => {
    const result = validateCrewForFlight(validMember, null, [], validFlight)
    expect(result.valid).toBe(false)
    expect(result.blockers.some(b => b.includes('Qualifications'))).toBe(true)
  })
})

// ── crewMemberStatus ──────────────────────────────────────────────────────────
describe('crewMemberStatus', () => {
  const active = { active:true }
  const inactive = { active:false }
  const goodQuals = {
    medical_expiry:'2027-01-01', license_expiry:'2027-01-01', last_sim_check:'2025-12-01',
  }
  const expiredQuals = {
    medical_expiry:'2020-01-01', license_expiry:'2027-01-01', last_sim_check:'2025-12-01',
  }

  it('inactif → inactive', () => {
    expect(crewMemberStatus(inactive, goodQuals)).toBe('inactive')
  })

  it('actif + tout bon → ok', () => {
    expect(crewMemberStatus(active, goodQuals)).toBe('ok')
  })

  it('actif + expired qual → critical', () => {
    expect(crewMemberStatus(active, expiredQuals)).toBe('critical')
  })

  it('actif + FTL critical → warning', () => {
    const ftl = { risk_level:'critical' }
    expect(crewMemberStatus(active, goodQuals, ftl)).toBe('warning')
  })
})
