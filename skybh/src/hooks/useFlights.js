import { useEffect, useState } from 'react'
import { subscribeTodayFlights, computeDayKPIs } from '../services/flights'

export function useFlights() {
  const [flights, setFlights] = useState([])
  const [kpis, setKpis] = useState({ total: 0, completed: 0, cancelled: 0, inFlight: 0, totalPax: 0, fillRate: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = subscribeTodayFlights((data) => {
      setFlights(data)
      setKpis(computeDayKPIs(data))
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  return { flights, kpis, loading }
}