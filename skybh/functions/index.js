const { onDocumentWritten } = require("firebase-functions/v2/firestore")
const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { initializeApp }      = require("firebase-admin/app")
const { getAuth }            = require("firebase-admin/auth")
const { getFirestore }       = require("firebase-admin/firestore")

initializeApp()

const VALID_ROLES = ['admin', 'ops', 'pilote', 'agent_sol']

// ─────────────────────────────────────────────────────────────
// 1. TRIGGER EXISTANT — conservé + ajout du champ "active"
// ─────────────────────────────────────────────────────────────
exports.syncUserRole = onDocumentWritten(
  "user_profiles/{uid}",
  async (event) => {
    const uid  = event.params.uid
    const data = event.data?.after?.data()

    // Document supprimé → vider les claims
    if (!data) {
      await getAuth().setCustomUserClaims(uid, {})
      return
    }

    const role   = data.role   || "agent_sol"
    const active = data.active ?? false   // ← AJOUT

    try {
      await getAuth().setCustomUserClaims(uid, { role, active })  // ← AJOUT active
      console.log(`✅ Claims mis à jour : ${uid} → role=${role} active=${active}`)
    } catch (err) {
      console.error(`❌ Erreur claims pour ${uid}:`, err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// 2. CALLABLE — Refresh claims depuis le client
//    Appeler après login pour forcer la sync
//    Usage : httpsCallable(functions, 'refreshUserClaims')()
// ─────────────────────────────────────────────────────────────
exports.refreshUserClaims = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Non connecté.')

  const snap = await getFirestore().collection('user_profiles').doc(uid).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Profil introuvable.')

  const { role, active } = snap.data()

  if (!role || !VALID_ROLES.includes(role)) {
    throw new HttpsError('invalid-argument', `Rôle invalide: ${role}`)
  }

  await getAuth().setCustomUserClaims(uid, { role, active: active ?? false })
  console.log(`✅ refreshClaims OK : uid=${uid} role=${role}`)

  return { success: true, role, active: active ?? false }
})

// ─────────────────────────────────────────────────────────────
// 3. CALLABLE — Assigner un rôle (admin uniquement)
//    Usage : httpsCallable(functions, 'assignRole')({ targetUid, newRole })
// ─────────────────────────────────────────────────────────────
exports.assignRole = onCall(async (request) => {
  if (request.auth?.token?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Réservé aux administrateurs.')
  }

  const { targetUid, newRole, active } = request.data

  if (!targetUid || !newRole) {
    throw new HttpsError('invalid-argument', 'targetUid et newRole requis.')
  }
  if (!VALID_ROLES.includes(newRole)) {
    throw new HttpsError('invalid-argument', `Rôle invalide: ${newRole}`)
  }

  await getFirestore().collection('user_profiles').doc(targetUid).update({
    role:      newRole,
    active:    active ?? true,
    updatedAt: new Date().toISOString(),
    updatedBy: request.auth.uid,
  })

  // Mise à jour immédiate sans attendre le trigger
  await getAuth().setCustomUserClaims(targetUid, {
    role:   newRole,
    active: active ?? true,
  })

  console.log(`✅ assignRole : ${request.auth.uid} → uid=${targetUid} role=${newRole}`)
  return { success: true }
})