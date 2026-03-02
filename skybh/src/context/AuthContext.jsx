// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, reload } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../services/firebase'   // ← instances déjà initialisées

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [role,    setRole]    = useState(null)
  const [loading, setLoading] = useState(true)

  const loadRole = async (firebaseUser) => {
    if (!firebaseUser) { setRole(null); return }
    try {
      const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
      setRole(snap.exists() ? (snap.data().role || 'ops') : 'ops')
    } catch {
      setRole('ops')
    }
  }

  // Force le rechargement de l'objet user après updateProfile()
  const refreshUser = async () => {
    if (!auth.currentUser) return
    try {
      await reload(auth.currentUser)
      setUser({ ...auth.currentUser })
    } catch (e) {
      console.error('refreshUser error:', e)
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser ? { ...firebaseUser } : null)
      await loadRole(firebaseUser)
      setLoading(false)
    })
    return unsub
  }, [])

  const logout = () => signOut(auth)
  const login  = (email, password) => signInWithEmailAndPassword(auth, email, password)

  return (
    <AuthContext.Provider value={{ user, role, loading, login, logout, refreshUser }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}