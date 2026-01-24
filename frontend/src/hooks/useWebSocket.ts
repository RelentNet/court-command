import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'

type WebSocketStatus = 'CONNECTING' | 'OPEN' | 'CLOSED'

interface UseWebSocketOptions {
  url: string
  queryKey: Array<unknown>
  onMessage?: (data: unknown, queryClient: QueryClient, queryKey: Array<unknown>) => void
}

export function useWebSocket({ url, queryKey, onMessage }: UseWebSocketOptions) {
  const [status, setStatus] = useState<WebSocketStatus>('CLOSED')
  const queryClient = useQueryClient()

  // Use a ref for onMessage to avoid re-triggering the effect if the function identity changes
  const onMessageRef = useRef(onMessage)
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    if (!url) return

    setStatus('CONNECTING')
    const ws = new WebSocket(url)

    ws.onopen = () => setStatus('OPEN')
    ws.onclose = () => setStatus('CLOSED')

    ws.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data) as unknown

        if (onMessageRef.current) {
          onMessageRef.current(update, queryClient, queryKey)
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
  }, [url, queryClient, JSON.stringify(queryKey)])

  return status
}