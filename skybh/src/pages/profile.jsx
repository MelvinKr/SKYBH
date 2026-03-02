// src/pages/profile.jsx
// Panel slide-in : Profil / Compte / Notifications
// FIXES : refreshUser() après updateProfile + photo, upload avatar base64 fiable
import { useState, useEffect, useRef } from 'react'
import {
  updateProfile, updateEmail, updatePassword,
  EmailAuthProvider, reauthenticateWithCredential,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, db, storage } from '../services/firebase'
import { useAuth } from '../context/AuthContext'

// ── Palette ───────────────────────────────────────────────────────────────
const C = {
  bg: '#0B1F3A', panel: '#0F2745', panelLight: '#152840',
  border: '#1E3A5F', borderHov: '#2D5580',
  gold: '#F0B429', goldMid: 'rgba(240,180,41,0.1)', goldBorder: 'rgba(240,180,41,0.25)',
  blue: '#5B8DB8', text: '#F1F5F9', muted: '#64748B',
  green: '#4ADE80', greenBg: 'rgba(74,222,128,0.08)',
  red: '#EF4444',   redBg: 'rgba(239,68,68,0.08)',
}

const ROLE_META = {
  admin:     { label: 'Administrateur', color: '#F0B429', icon: '★' },
  ops:       { label: 'Opérations',     color: '#3B82F6', icon: '⊞' },
  pilote:    { label: 'Pilote',         color: '#4ADE80', icon: '✈' },
  agent_sol: { label: 'Agent Sol',      color: '#A78BFA', icon: '◉' },
}

const BASES = [
  'TFFJ — Saint-Barthélemy',
  'TFFG — Saint-Martin (Grand Case)',
  'TNCM — Sint-Maarten',
  'TQPF — Anguilla',
]

// ── Helpers ──────────────────────────────────────────────────────────────
const initials = (name, email) => {
  if (name?.trim()) {
    const parts = name.trim().split(' ').filter(Boolean)
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0][0].toUpperCase()
  }
  return (email?.[0] || 'U').toUpperCase()
}

const fmtDate = (str) => {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

const pwdStrength = (pwd) => {
  if (!pwd) return null
  if (pwd.length < 6)  return { label: 'Trop court', color: '#EF4444', pct: 25 }
  if (pwd.length < 8)  return { label: 'Faible',     color: '#FB923C', pct: 45 }
  if (pwd.length < 12) return { label: 'Correct',    color: '#F0B429', pct: 65 }
  return { label: 'Solide', color: '#4ADE80', pct: 100 }
}

const STYLES = `
@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0.5; }
  to   { transform: translateX(0);    opacity: 1; }
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes spin { to { transform: rotate(360deg); } }
`

// ── Micro-composants ──────────────────────────────────────────────────────
function Label({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: C.blue, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{children}</div>
}

function Input({ icon, style, ...props }) {
  return (
    <div style={{ position: 'relative' }}>
      {icon && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: C.muted, pointerEvents: 'none' }}>{icon}</span>}
      <input
        style={{
          width: '100%', boxSizing: 'border-box',
          background: C.panelLight, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: icon ? '10px 12px 10px 36px' : '10px 12px',
          color: C.text, fontSize: 13, outline: 'none', ...style,
        }}
        onFocus={e => e.target.style.borderColor = C.gold}
        onBlur={e  => e.target.style.borderColor = C.border}
        {...props}
      />
    </div>
  )
}

function SaveBtn({ loading, label = '✓ Enregistrer', onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled || loading}
      style={{
        padding: '10px 22px', borderRadius: 10, fontSize: 12, fontWeight: 700,
        background: C.gold, color: C.bg, border: 'none',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.5 : 1, transition: 'opacity 0.2s',
      }}>
      {loading ? '⟳ Enregistrement…' : label}
    </button>
  )
}

function Toast({ msg, type }) {
  if (!msg) return null
  const ok = type === 'success'
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
      background: ok ? C.greenBg : C.redBg,
      border: `1px solid ${ok ? C.green : C.red}`,
      borderRadius: 12, padding: '12px 18px',
      color: ok ? C.green : C.red, fontSize: 13, fontWeight: 600,
      animation: 'slideUp 0.2s ease',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {ok ? '✓' : '✕'} {msg}
    </div>
  )
}

function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
      <div style={{ flex: 1, height: 1, background: C.border }}/>
      {label && <span style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: C.border }}/>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
export default function ProfilePage({ onClose }) {
  const { user, role, refreshUser } = useAuth()

  const [section, setSection] = useState('profil')
  const [toast,   setToast]   = useState(null)

  // Profil
  const [displayName,   setDisplayName]   = useState('')
  const [base,          setBase]          = useState('')
  const [phone,         setPhone]         = useState('')
  const [bio,           setBio]           = useState('')
  const [avatarSrc,     setAvatarSrc]     = useState('')
  const [profilSaving,  setProfilSaving]  = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const fileRef = useRef(null)

  // Compte
  const [newEmail,    setNewEmail]    = useState('')
  const [emailPwd,    setEmailPwd]    = useState('')
  const [currentPwd,  setCurrentPwd]  = useState('')
  const [newPwd,      setNewPwd]      = useState('')
  const [confirmPwd,  setConfirmPwd]  = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [pwdSaving,   setPwdSaving]   = useState(false)

  // Notifications
  const [notifPrefs, setNotifPrefs] = useState({
    notif_maintenance: true, notif_meteo: true, notif_ftl: true,
    notif_planning: false, notif_email: false,
  })
  const [notifSaving, setNotifSaving] = useState(false)

  // Init : lire depuis auth.currentUser (toujours à jour) + Firestore
  useEffect(() => {
    const cu = auth.currentUser
    setDisplayName(cu?.displayName || '')
    setAvatarSrc(cu?.photoURL || '')
    if (!user?.uid) return
    getDoc(doc(db, 'user_profiles', user.uid)).then(snap => {
      if (!snap.exists()) return
      const d = snap.data()
      setBase(d.base || '')
      setPhone(d.phone || '')
      setBio(d.bio || '')
      if (d.notif_prefs) setNotifPrefs(p => ({ ...p, ...d.notif_prefs }))
    }).catch(console.error)
  }, [user?.uid])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Upload avatar ────────────────────────────────────────────────────────
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { showToast('Photo max 2 Mo', 'error'); return }
    if (!file.type.startsWith('image/')) { showToast('Format invalide', 'error'); return }

    setAvatarLoading(true)
    try {
      // Upload vers Firebase Storage → avatars/{uid}
      const storageRef = ref(storage, `avatars/${user.uid}`)
      await uploadBytes(storageRef, file)
      const photoURL = await getDownloadURL(storageRef)

      // Mise à jour Firebase Auth
      await updateProfile(auth.currentUser, { photoURL })

      // Rechargement du contexte React
      await refreshUser()

      setAvatarSrc(photoURL)
      showToast('Photo mise à jour')
    } catch (err) {
      console.error('Avatar error:', err)
      showToast('Erreur upload photo — vérifiez la connexion', 'error')
    } finally {
      setAvatarLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Sauvegarder profil ───────────────────────────────────────────────────
  const saveProfile = async () => {
    setProfilSaving(true)
    try {
      await updateProfile(auth.currentUser, { displayName: displayName.trim() })
      await setDoc(doc(db, 'user_profiles', user.uid), {
        base, phone, bio, updated_at: serverTimestamp(),
      }, { merge: true })

      // ✅ FIXE CLEF : recharger pour que le header affiche le nouveau nom
      await refreshUser()

      showToast('Profil enregistré')
    } catch (err) {
      console.error(err)
      showToast('Erreur sauvegarde', 'error')
    } finally {
      setProfilSaving(false)
    }
  }

  // ── Changer email ────────────────────────────────────────────────────────
  const saveEmail = async () => {
    if (!newEmail.trim() || !emailPwd) return
    setEmailSaving(true)
    try {
      const cred = EmailAuthProvider.credential(user.email, emailPwd)
      await reauthenticateWithCredential(auth.currentUser, cred)
      await updateEmail(auth.currentUser, newEmail.trim())
      await refreshUser()
      setNewEmail(''); setEmailPwd('')
      showToast('Email mis à jour')
    } catch (err) {
      const msgs = {
        'auth/wrong-password':       'Mot de passe incorrect',
        'auth/email-already-in-use': 'Email déjà utilisé',
        'auth/invalid-email':        'Email invalide',
      }
      showToast(msgs[err.code] || 'Erreur changement email', 'error')
    } finally {
      setEmailSaving(false)
    }
  }

  // ── Changer mot de passe ─────────────────────────────────────────────────
  const savePwd = async () => {
    if (!currentPwd || !newPwd || newPwd !== confirmPwd) return
    if (newPwd.length < 8) { showToast('Min. 8 caractères requis', 'error'); return }
    setPwdSaving(true)
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPwd)
      await reauthenticateWithCredential(auth.currentUser, cred)
      await updatePassword(auth.currentUser, newPwd)
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      showToast('Mot de passe mis à jour')
    } catch (err) {
      showToast(err.code === 'auth/wrong-password' ? 'Mot de passe actuel incorrect' : 'Erreur', 'error')
    } finally {
      setPwdSaving(false)
    }
  }

  // ── Sauvegarder notifications ────────────────────────────────────────────
  const saveNotifs = async () => {
    setNotifSaving(true)
    try {
      await setDoc(doc(db, 'user_profiles', user.uid), {
        notif_prefs: notifPrefs, updated_at: serverTimestamp(),
      }, { merge: true })
      showToast('Préférences enregistrées')
    } catch {
      showToast('Erreur sauvegarde', 'error')
    } finally {
      setNotifSaving(false)
    }
  }

  // ── Valeurs affichées (depuis auth.currentUser, toujours fraîches) ────────
  const cu = auth.currentUser
  const shownName = displayName || cu?.displayName || user?.email?.split('@')[0] || 'Utilisateur'
  const shownAvatar = avatarSrc || cu?.photoURL || ''
  const rm = ROLE_META[role] || ROLE_META.ops

  // ═══ RENDER ══════════════════════════════════════════════════════════════
  return (
    <>
      <style>{STYLES}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      }}/>

      {/* Panneau */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 901,
        width: '100%', maxWidth: 520, background: C.panel,
        borderLeft: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column',
        animation: 'slideIn 0.25s cubic-bezier(0.16,1,0.3,1)',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
          background: C.bg, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Avatar cliquable */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div
                onClick={() => !avatarLoading && fileRef.current?.click()}
                style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: shownAvatar ? 'transparent' : 'linear-gradient(135deg,#1E3A5F,#2D5580)',
                  border: `2px solid ${C.gold}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', overflow: 'hidden', position: 'relative',
                }}>
                {shownAvatar
                  ? <img src={shownAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setAvatarSrc('')}/>
                  : <span style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{initials(shownName, user?.email)}</span>
                }
                {/* Overlay 📷 */}
                <div className="avatar-overlay" style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.55)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: avatarLoading ? 1 : 0, transition: 'opacity 0.2s', fontSize: 16,
                }}
                  onMouseEnter={e => { if (!avatarLoading) e.currentTarget.style.opacity = 1 }}
                  onMouseLeave={e => { if (!avatarLoading) e.currentTarget.style.opacity = 0 }}>
                  {avatarLoading
                    ? <span style={{ animation: 'spin 0.8s linear infinite', display: 'inline-block' }}>⟳</span>
                    : '📷'}
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange}/>
            </div>

            {/* Identité */}
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{shownName}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{user?.email}</div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
                fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '2px 8px', borderRadius: 6,
                background: `${rm.color}18`, border: `1px solid ${rm.color}35`, color: rm.color,
              }}>
                {rm.icon} {rm.label}
              </div>
            </div>
          </div>

          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
        </div>

        {/* Onglets */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          {[
            { id: 'profil', label: '👤 Profil' },
            { id: 'compte', label: '🔒 Compte' },
            { id: 'notifs', label: '🔔 Notifications' },
          ].map(t => (
            <button key={t.id} onClick={() => setSection(t.id)}
              style={{
                flex: 1, padding: '12px 8px', border: 'none', cursor: 'pointer',
                background: 'transparent', fontSize: 12, fontWeight: 600,
                borderBottom: `2px solid ${section === t.id ? C.gold : 'transparent'}`,
                color: section === t.id ? C.gold : C.muted, transition: 'color 0.15s, border-color 0.15s',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Corps scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* ══ PROFIL ══════════════════════════════════════════════ */}
          {section === 'profil' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <Label>Nom affiché</Label>
                <Input icon="👤" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Jean Dupont"/>
              </div>
              <div>
                <Label>Base principale</Label>
                <select value={base} onChange={e => setBase(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', background: C.panelLight, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', color: base ? C.text : C.muted, fontSize: 13, outline: 'none' }}>
                  <option value="">— Choisir une base —</option>
                  {BASES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input icon="📞" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+590 690 00 00 00" type="tel"/>
              </div>
              <div>
                <Label>Bio</Label>
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3}
                  placeholder="Pilote Cessna 208B, base TFFJ..."
                  style={{ width: '100%', boxSizing: 'border-box', background: C.panelLight, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', color: C.text, fontSize: 13, outline: 'none', resize: 'vertical' }}/>
              </div>

              <Divider label="Infos compte"/>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'UID',                value: user?.uid ? user.uid.slice(0,12) + '…' : '—' },
                  { label: 'Créé le',            value: fmtDate(user?.metadata?.creationTime) },
                  { label: 'Dernière connexion', value: fmtDate(user?.metadata?.lastSignInTime) },
                  { label: 'Email vérifié',      value: user?.emailVerified ? '✓ Oui' : '✕ Non' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: C.panelLight, borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 12, color: C.text, fontFamily: 'monospace' }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <SaveBtn loading={profilSaving} onClick={saveProfile}/>
              </div>
            </div>
          )}

          {/* ══ COMPTE ══════════════════════════════════════════════ */}
          {section === 'compte' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Changer l'email</div>
                <div><Label>Email actuel</Label><Input value={user?.email || ''} disabled style={{ color: C.muted }}/></div>
                <div><Label>Nouvel email</Label><Input icon="✉" value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="nouveau@exemple.com"/></div>
                <div><Label>Mot de passe (confirmation)</Label><Input icon="🔑" value={emailPwd} onChange={e => setEmailPwd(e.target.value)} type="password" placeholder="••••••••"/></div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <SaveBtn loading={emailSaving} onClick={saveEmail} label="✓ Changer l'email" disabled={!newEmail.trim() || !emailPwd}/>
                </div>
              </div>

              <Divider/>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Changer le mot de passe</div>
                <div><Label>Mot de passe actuel</Label><Input icon="🔒" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} type="password" placeholder="••••••••"/></div>
                <div>
                  <Label>Nouveau mot de passe</Label>
                  <Input icon="🔑" value={newPwd} onChange={e => setNewPwd(e.target.value)} type="password" placeholder="Min. 8 caractères"/>
                  {newPwd && (() => { const s = pwdStrength(newPwd); return (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ height: 3, borderRadius: 2, background: C.border, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${s.pct}%`, background: s.color, transition: 'width 0.3s' }}/>
                      </div>
                      <div style={{ fontSize: 10, color: s.color, marginTop: 3 }}>{s.label}</div>
                    </div>
                  )})()}
                </div>
                <div>
                  <Label>Confirmer le mot de passe</Label>
                  <Input icon="🔑" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} type="password" placeholder="••••••••"/>
                  {confirmPwd && (
                    <div style={{ fontSize: 11, marginTop: 4, color: newPwd === confirmPwd ? C.green : C.red }}>
                      {newPwd === confirmPwd ? '✓ Mots de passe identiques' : '✕ Les mots de passe ne correspondent pas'}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <SaveBtn loading={pwdSaving} onClick={savePwd} label="✓ Changer le mot de passe"
                    disabled={!currentPwd || !newPwd || newPwd !== confirmPwd}/>
                </div>
              </div>
            </div>
          )}

          {/* ══ NOTIFICATIONS ════════════════════════════════════════ */}
          {section === 'notifs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Choisissez les alertes à recevoir.</div>
              {[
                { key: 'notif_maintenance', icon: '🔧', label: 'Alertes maintenance',    sub: 'Potentiels moteur/cellule critiques' },
                { key: 'notif_meteo',       icon: '◎',  label: 'Alertes météo',           sub: 'Conditions IFR ou dégradées' },
                { key: 'notif_ftl',         icon: '⏱',  label: 'Limites FTL',             sub: 'Temps de vol crew approchant la limite' },
                { key: 'notif_planning',    icon: '▦',  label: 'Modifications planning',  sub: 'Changements sur vols assignés' },
                { key: 'notif_email',       icon: '✉',  label: 'Résumé email quotidien',  sub: 'Récapitulatif opérationnel du jour' },
              ].map(({ key, icon, label, sub }) => {
                const active = notifPrefs[key]
                return (
                  <div key={key} onClick={() => setNotifPrefs(p => ({ ...p, [key]: !p[key] }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${active ? C.goldBorder : C.border}`,
                      background: active ? C.goldMid : 'transparent', transition: 'all 0.15s',
                    }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>
                    </div>
                    <div style={{ width: 38, height: 22, borderRadius: 11, flexShrink: 0, background: active ? C.gold : C.border, position: 'relative', transition: 'background 0.2s' }}>
                      <div style={{ position: 'absolute', top: 3, left: active ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: active ? C.bg : C.muted, transition: 'left 0.2s' }}/>
                    </div>
                  </div>
                )
              })}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <SaveBtn loading={notifSaving} onClick={saveNotifs}/>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type}/>}
    </>
  )
}