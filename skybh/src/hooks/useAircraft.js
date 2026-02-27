import { useEffect, useState } from 'react'
import { subscribeToFleet } from '../services/aircraft'

export function useAircraft() {
  const [fleet, setFleet] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = subscribeToFleet((data) => {
      setFleet(data)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  return { fleet, loading }
}