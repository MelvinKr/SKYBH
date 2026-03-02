const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

initializeApp();

/**
 * Synchronise le rôle Firestore → Custom Claims Firebase Auth
 * Se déclenche à chaque modification d'un user_profiles/{uid}
 */
exports.syncUserRole = onDocumentWritten(
  "user_profiles/{uid}",
  async (event) => {
    const uid = event.params.uid;
    const data = event.data?.after?.data();

    // Document supprimé → supprimer les claims
    if (!data) {
      await getAuth().setCustomUserClaims(uid, {});
      return;
    }

    const role = data.role || "agent_sol";

    try {
      await getAuth().setCustomUserClaims(uid, { role });
      console.log(`✅ Claims mis à jour : ${uid} → ${role}`);
    } catch (err) {
      console.error(`❌ Erreur claims pour ${uid}:`, err);
    }
  }
);