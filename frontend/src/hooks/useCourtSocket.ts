import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import config from '../config'

type WebSocketStatus = 'CONNECTING' | 'OPEN' | 'CLOSED'

export function useCourtSocket(courtSlug: string) {
  const [status, setStatus] = useState<WebSocketStatus>('CLOSED')
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!courtSlug) return

    setStatus('CONNECTING')
    const wsUrl = `${config.WS_URL}/ws/courts/${courtSlug}`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => setStatus('OPEN')
    ws.onclose = () => setStatus('CLOSED')

    ws.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data)
        // Instant update of React Query cache for 'court'
        queryClient.setQueryData(['court', courtSlug], (oldData: any) => {
            if (!oldData) return update
            return { ...oldData, ...update }
        })
      } catch (err) {
        console.error('Failed to parse WS message', err)
      }
    }

    return () => {
      ws.close()
    }
  }, [courtSlug, queryClient])

  return status
}
