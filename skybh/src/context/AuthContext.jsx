import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../services/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Récupère le rôle depuis Firestore
        try {
          const docRef = doc(db, 'users', firebaseUser.uid)
          const docSnap = await getDoc(docRef)
          if (docSnap.exists()) {
            setRole(docSnap.data().role)
          }
        } catch (error) {
          console.error('Erreur récupération rôle:', error)
          setRole(null)
        }
        setUser(firebaseUser)
      } else {
        setUser(null)
        setRole(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const login = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (error) {
      throw new Error(getFirebaseErrorMessage(error.code))
    }
  }

  const logout = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      throw new Error('Erreur lors de la déconnexion')
    }
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, login, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return context
}

// Messages d'erreur Firebase en français
function getFirebaseErrorMessage(code) {
  const messages = {
    'auth/user-not-found': 'Utilisateur introuvable',
    'auth/wrong-password': 'Mot de passe incorrect',
    'auth/invalid-email': 'Email invalide',
    'auth/too-many-requests': 'Trop de tentatives, réessayez plus tard',
    'auth/invalid-credential': 'Identifiants incorrects',
  }
  return messages[code] || 'Erreur de connexion'
}