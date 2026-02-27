/**
 * @fileoverview Hook React — règles de planning temps réel
 */

import { useState, useEffect, useCallback } from 'react'
import {
  subscribeToRules, updateRules,
  lockPlanning, unlockPlanning, validatePlanning,
  DEFAULT_RULES,
} from '../services/planning-rules.service'

export function usePlanningRules(user) {
  const [rules,   setRules]   = useState(DEFAULT_RULES)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    const unsub = subscribeToRules((r) => { setRules(r); setLoading(false) })
    return () => unsub()
  }, [])

  const handleUpdate = useCallback(async (updates) => {
    try { await updateRules(updates) }
    catch (e) { setError(e.message) }
  }, [])

  const handleLock = useCallback(async () => {
    try { await lockPlanning(user?.uid, user?.email) }
    catch (e) { setError(e.message) }
  }, [user])

  const handleUnlock = useCallback(async () => {
    try { await unlockPlanning() }
    catch (e) { setError(e.message) }
  }, [])

  const handleValidate = useCallback(async () => {
    try { await validatePlanning(user?.uid, user?.email) }
    catch (e) { setError(e.message) }
  }, [user])

  return {
    rules, loading, error,
    onUpdate: handleUpdate,
    onLock: handleLock,
    onUnlock: handleUnlock,
    onValidate: handleValidate,
    clearError: () => setError(null),
  }
}
