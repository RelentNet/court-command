import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import config from '../config'

type WebSocketStatus = 'CONNECTING' | 'OPEN' | 'CLOSED'

export function useMatchSocket(matchId: string) {
  const [status, setStatus] = useState<WebSocketStatus>('CLOSED')
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!matchId) return

    setStatus('CONNECTING')
    const wsUrl = `${config.WS_URL}/ws/matches/${matchId}`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => setStatus('OPEN')
    ws.onclose = () => setStatus('CLOSED')
    
    ws.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data)
        // Instant update of React Query cache
        queryClient.setQueryData(['match', matchId], update)
      } catch (err) {
        console.error("Failed to parse WS message", err)
      }
    }

    return () => {
      ws.close()
    }
  }, [matchId, queryClient])

  return status
}
