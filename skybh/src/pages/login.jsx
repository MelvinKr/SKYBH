import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// ── Domaines officiels autorisés ───────────────────────────────
const ALLOWED_DOMAINS = [
  'opsair.netlify.app',
  'www.opsair.netlify.app',
  'opsair.com',
  'www.opsair.com',
  'localhost',
  '127.0.0.1',
]

const MAX_ATTEMPTS = 5
const LOCKOUT_MS   = 5 * 60 * 1000
const STORAGE_KEY  = 'opsair_login_attempts'

function getCurrentDomain() {
  return window.location.hostname
}

function isDomainAllowed() {
  const host = getCurrentDomain()
  return ALLOWED_DOMAINS.some(d => host === d || host.endsWith('.' + d))
}

function getAttemptData() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { count: 0, lockedUntil: null }
  } catch {
    return { count: 0, lockedUntil: null }
  }
}

function saveAttemptData(data) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {}
}

function resetAttempts() {
  sessionStorage.removeItem(STORAGE_KEY)
}

export default function Login() {
  const { login }  = useAuth()
  const navigate   = useNavigate()

  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [error,       setError]       = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [attempts,    setAttempts]    = useState(0)
  const [lockedUntil, setLockedUntil] = useState(null)
  const [countdown,   setCountdown]   = useState(0)

  const domainOk      = isDomainAllowed()
  const currentDomain = getCurrentDomain()

  useEffect(() => {
    const data = getAttemptData()
    setAttempts(data.count)
    if (data.lockedUntil && data.lockedUntil > Date.now()) {
      setLockedUntil(data.lockedUntil)
    } else if (data.lockedUntil) {
      resetAttempts()
    }
  }, [])

  useEffect(() => {
    if (!lockedUntil) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, lockedUntil - Date.now())
      setCountdown(Math.ceil(remaining / 1000))
      if (remaining <= 0) {
        setLockedUntil(null)
        resetAttempts()
        setAttempts(0)
        clearInterval(interval)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lockedUntil])

  const handleSubmit = async () => {
    if (!domainOk || lockedUntil) return
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      resetAttempts()
      navigate('/dashboard')
    } catch (err) {
      const newCount = attempts + 1
      setAttempts(newCount)
      if (newCount >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS
        setLockedUntil(until)
        saveAttemptData({ count: newCount, lockedUntil: until })
        setError(`Compte temporairement bloqué après ${MAX_ATTEMPTS} tentatives. Réessayez dans 5 minutes.`)
      } else {
        saveAttemptData({ count: newCount, lockedUntil: null })
        setError(`Identifiants incorrects. Tentative ${newCount}/${MAX_ATTEMPTS}.`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleKey  = (e) => { if (e.key === 'Enter') handleSubmit() }
  const isLocked   = !!lockedUntil && lockedUntil > Date.now()
  const isDisabled = loading || isLocked || !domainOk

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: 'linear-gradient(135deg, #0B1F3A 0%, #162d50 60%, #0B1F3A 100%)' }}>
      <div className="w-full max-w-md">

        {/* Marque */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
               style={{ background: '#C8A951' }}>
            <span className="text-3xl">✈</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-widest">OPSAIR</h1>
          <p className="mt-1" style={{ color: '#C8A951', fontSize: '0.85rem', letterSpacing: '0.1em' }}>
            ACCÈS OPÉRATIONNEL
          </p>
        </div>

        {/* Indicateur domaine */}
        <div className={`rounded-lg px-4 py-3 mb-6 flex items-start gap-3 border ${
          domainOk ? 'border-green-600 bg-green-900/30' : 'border-red-500 bg-red-900/40'
        }`}>
          <span className="text-lg mt-0.5">{domainOk ? '🔒' : '⚠️'}</span>
          <div>
            <p className={`text-sm font-semibold ${domainOk ? 'text-green-400' : 'text-red-400'}`}>
              {domainOk ? 'Connexion sécurisée vérifiée' : 'DOMAINE NON AUTORISÉ'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: domainOk ? '#86efac' : '#fca5a5' }}>
              {domainOk
                ? `✓ ${currentDomain} — Site officiel OpsAir`
                : `⚠ Vous êtes sur "${currentDomain}" — Ne saisissez pas vos identifiants ici.`}
            </p>
          </div>
        </div>

        {/* Blocage si mauvais domaine */}
        {!domainOk && (
          <div className="rounded-xl p-6 text-center border border-red-500" style={{ background: '#1a0a0a' }}>
            <p className="text-red-400 font-bold text-lg mb-2">⛔ Accès refusé</p>
            <p className="text-red-300 text-sm mb-4">
              Cette page est accessible uniquement depuis le domaine officiel.
            </p>
            <a href="https://opsair.netlify.app"
               className="inline-block px-6 py-2 rounded-lg font-semibold text-sm"
               style={{ background: '#C8A951', color: '#0B1F3A' }}>
              Aller sur opsair.netlify.app →
            </a>
          </div>
        )}

        {/* Formulaire */}
        {domainOk && (
          <div className="rounded-2xl p-8 shadow-2xl"
               style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(200,169,81,0.2)' }}>
            <div className="space-y-5">

              <div>
                <label className="block text-xs font-semibold mb-2 tracking-wider"
                       style={{ color: '#C8A951' }}>IDENTIFIANT</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKey}
                  disabled={isDisabled}
                  className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none disabled:opacity-40"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(200,169,81,0.3)' }}
                  placeholder="prenom.nom@opsair.com"
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2 tracking-wider"
                       style={{ color: '#C8A951' }}>MOT DE PASSE</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKey}
                  disabled={isDisabled}
                  className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none disabled:opacity-40"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(200,169,81,0.3)' }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="rounded-lg px-4 py-3 text-sm border border-red-500/50 bg-red-900/30 text-red-300">
                  {error}
                </div>
              )}

              {isLocked && (
                <div className="rounded-lg px-4 py-3 text-center border"
                     style={{ borderColor: '#C8A951', background: 'rgba(200,169,81,0.1)' }}>
                  <p className="text-sm font-semibold" style={{ color: '#C8A951' }}>
                    Compte bloqué — {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Trop de tentatives. Patientez avant de réessayer.</p>
                </div>
              )}

              {!isLocked && attempts > 0 && (
                <p className="text-xs text-center text-gray-500">
                  {MAX_ATTEMPTS - attempts} tentative{MAX_ATTEMPTS - attempts > 1 ? 's' : ''} restante{MAX_ATTEMPTS - attempts > 1 ? 's' : ''}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={isDisabled}
                className="w-full font-bold rounded-lg px-4 py-3 transition-all text-sm tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: isDisabled ? '#555' : '#C8A951', color: '#0B1F3A' }}
              >
                {loading ? 'CONNEXION EN COURS...' : isLocked ? 'COMPTE BLOQUÉ' : 'SE CONNECTER'}
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 text-center">
              <p className="text-xs text-gray-600">Accès réservé au personnel autorisé OpsAir</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(200,169,81,0.4)' }}>
                Plateforme de gestion opérationnelle aérienne
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}