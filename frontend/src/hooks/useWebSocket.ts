import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

type WebSocketStatus = 'CONNECTING' | 'OPEN' | 'CLOSED'

interface UseWebSocketOptions {
  url: string
  queryKey: unknown[]
  onMessage?: (data: any, queryClient: any, queryKey: unknown[]) => void
}

export function useWebSocket({ url, queryKey, onMessage }: UseWebSocketOptions) {
  const [status, setStatus] = useState<WebSocketStatus>('CLOSED')
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!url) return

    setStatus('CONNECTING')
    const ws = new WebSocket(url)

    ws.onopen = () => setStatus('OPEN')
    ws.onclose = () => setStatus('CLOSED')

    ws.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data)
        
        if (onMessage) {
            onMessage(update, queryClient, queryKey)
        } else {
            // Default behavior: Replace cache
             queryClient.setQueryData(queryKey, update)
        }
       
      } catch (err) {
        console.error('Failed to parse WS message', err)
      }
    }

    return () => {
      ws.close()
    }
  }, [url, queryClient, JSON.stringify(queryKey)]) // eslint-disable-line react-hooks/exhaustive-deps

  return status
}
