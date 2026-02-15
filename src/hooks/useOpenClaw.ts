import { useState, useEffect, useRef, useCallback } from 'react'

interface OpenClawMessage {
  type: string
  sessionKey?: string
  data?: any
  timestamp?: string
}

interface UseOpenClawOptions {
  autoConnect?: boolean
  reconnectInterval?: number
}

export function useOpenClaw(options: UseOpenClawOptions = {}) {
  const { autoConnect = true, reconnectInterval = 5000 } = options
  
  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<OpenClawMessage | null>(null)
  const [messages, setMessages] = useState<OpenClawMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    
    try {
      // OpenClaw gateway WebSocket
      const ws = new WebSocket('ws://127.0.0.1:18789')
      
      ws.onopen = () => {
        console.log('🔌 OpenClaw connected')
        setConnected(true)
        setError(null)
      }
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          setLastMessage(msg)
          setMessages(prev => [...prev.slice(-99), msg]) // Keep last 100
        } catch (e) {
          // Non-JSON message
          console.log('OpenClaw raw:', event.data)
        }
      }
      
      ws.onerror = (e) => {
        console.error('OpenClaw error:', e)
        setError('Connection error')
      }
      
      ws.onclose = () => {
        console.log('🔌 OpenClaw disconnected')
        setConnected(false)
        wsRef.current = null
        
        // Auto-reconnect
        if (reconnectInterval > 0) {
          reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval)
        }
      }
      
      wsRef.current = ws
    } catch (e) {
      setError(String(e))
    }
  }, [reconnectInterval])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnected(false)
  }, [])

  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
      return true
    }
    return false
  }, [])

  useEffect(() => {
    if (autoConnect) {
      connect()
    }
    return () => disconnect()
  }, [autoConnect, connect, disconnect])

  return {
    connected,
    lastMessage,
    messages,
    error,
    connect,
    disconnect,
    send
  }
}

// Helper hook for specific event types
export function useOpenClawEvents(eventType: string) {
  const { messages, connected } = useOpenClaw()
  const [events, setEvents] = useState<OpenClawMessage[]>([])
  
  useEffect(() => {
    const filtered = messages.filter(m => m.type === eventType)
    setEvents(filtered)
  }, [messages, eventType])
  
  return { events, connected }
}
