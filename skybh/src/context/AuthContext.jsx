// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  reload,
} from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { auth } from '../services/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [role,    setRole]    = useState(null)
  const [active,  setActive]  = useState(false)
  const [loading, setLoading] = useState(true)

  /**
   * Lit le rôle depuis les custom claims JWT (source de vérité
   * pour les Firestore Rules). Si absent, appelle la Cloud Function
   * refreshUserClaims pour forcer la sync depuis user_profiles.
   */
  const loadRoleFromClaims = async (firebaseUser) => {
    if (!firebaseUser) {
      setRole(null)
      setActive(false)
      return
    }

    try {
      // 1. Lire les claims du token actuel
      let tokenResult = await firebaseUser.getIdTokenResult()
      let claimRole   = tokenResult.claims?.role
      let claimActive = tokenResult.claims?.active ?? false

      // 2. Si claims manquants → appeler refreshUserClaims
      //    (nouveau user ou token avant déploiement de la CF)
      if (!claimRole) {
        console.log('[Auth] Claims manquants → refresh via Cloud Function...')
        try {
          const functions     = getFunctions()
          const refreshClaims = httpsCallable(functions, 'refreshUserClaims')
          await refreshClaims()

          // 3. Forcer le renouvellement du JWT
          tokenResult = await firebaseUser.getIdToken(true).then(() =>
            firebaseUser.getIdTokenResult()
          )
          claimRole   = tokenResult.claims?.role
          claimActive = tokenResult.claims?.active ?? false
        } catch (cfErr) {
          console.warn('[Auth] refreshUserClaims échoué:', cfErr.message)
        }
      }

      setRole(claimRole   || null)
      setActive(claimActive)
    } catch (err) {
      console.error('[Auth] loadRoleFromClaims error:', err)
      setRole(null)
      setActive(false)
    }
  }

  // Force le rechargement de l'objet user (après updateProfile, avatar…)
  const refreshUser = async () => {
    if (!auth.currentUser) return
    try {
      await reload(auth.currentUser)
      setUser({ ...auth.currentUser })
      // Profiter du refresh pour re-lire les claims aussi
      await loadRoleFromClaims(auth.currentUser)
    } catch (e) {
      console.error('[Auth] refreshUser error:', e)
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser ? { ...firebaseUser } : null)
      await loadRoleFromClaims(firebaseUser)
      setLoading(false)
    })
    return unsub
  }, [])

  const login  = (email, password) => signInWithEmailAndPassword(auth, email, password)
  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, role, active, loading, login, logout, refreshUser }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}