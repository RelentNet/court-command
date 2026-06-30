import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '../lib/google-maps'


/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MapMarker {
  id: number | string
  lat: number
  lng: number
  label: string
  sublabel?: string
}

interface MapViewProps {
  markers: MapMarker[]
  /** Height in CSS (default: '400px') */
  height?: string
  /** Called when a marker's info window link is clicked */
  onMarkerClick?: (marker: MapMarker) => void
  /** Default center when no markers (US center) */
  defaultCenter?: { lat: number; lng: number }
  /** Default zoom when no markers */
  defaultZoom?: number
}

// US geographic center
const US_CENTER = { lat: 39.8283, lng: -98.5795 }

export function MapView({
  markers,
  height = '400px',
  onMarkerClick,
  defaultCenter = US_CENTER,
  defaultZoom = 4,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const infoWindowRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)

  // Load Google Maps SDK
  useEffect(() => {
    loadGoogleMaps()
      .then(() => setReady(true))
      .catch(() => setError(true))
  }, [])

  // Initialize map
  useEffect(() => {
    if (!ready || !mapRef.current || mapInstanceRef.current) return

    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      styles: [
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }],
        },
      ],
    })

    infoWindowRef.current = new window.google.maps.InfoWindow()
  }, [ready, defaultCenter, defaultZoom])

  // Update markers
  useEffect(() => {
    if (!mapInstanceRef.current) return

    // Clear existing markers
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []

    const validMarkers = markers.filter((m) => m.lat && m.lng)
    if (validMarkers.length === 0) return

    const bounds = new window.google.maps.LatLngBounds()

    validMarkers.forEach((m) => {
      const position = { lat: m.lat, lng: m.lng }
      bounds.extend(position)

      const gMarker = new window.google.maps.Marker({
        position,
        map: mapInstanceRef.current,
        title: m.label,
      })

      gMarker.addListener('click', () => {
        // Build the InfoWindow content with DOM APIs and set untrusted
        // values via textContent so label/sublabel can never be parsed as
        // HTML (avoids stored DOM XSS via venue/org names).
        const container = document.createElement('div')
        container.style.fontFamily = 'system-ui, sans-serif'
        container.style.padding = '4px 0'

        const strong = document.createElement('strong')
        strong.style.fontSize = '14px'
        strong.textContent = m.label
        container.appendChild(strong)

        if (m.sublabel) {
          container.appendChild(document.createElement('br'))
          const span = document.createElement('span')
          span.style.fontSize = '12px'
          span.style.color = '#666'
          span.textContent = m.sublabel
          container.appendChild(span)
        }

        if (onMarkerClick) {
          container.appendChild(document.createElement('br'))
          const link = document.createElement('a')
          link.href = '#'
          link.style.fontSize = '12px'
          link.style.color = '#0ea5e9'
          link.textContent = 'View details →'
          link.addEventListener('click', (e) => {
            e.preventDefault()
            onMarkerClick(m)
          })
          container.appendChild(link)
        }

        infoWindowRef.current.setContent(container)
        infoWindowRef.current.open(mapInstanceRef.current, gMarker)
      })

      markersRef.current.push(gMarker)
    })

    // Fit bounds if multiple markers, or center on single
    if (validMarkers.length === 1) {
      mapInstanceRef.current.setCenter({ lat: validMarkers[0].lat, lng: validMarkers[0].lng })
      mapInstanceRef.current.setZoom(14)
    } else {
      mapInstanceRef.current.fitBounds(bounds, 50)
    }
  }, [markers, onMarkerClick])

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-(--color-border) bg-(--color-bg-secondary)"
        style={{ height }}
      >
        <p className="text-sm text-(--color-text-muted)">Map unavailable</p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="rounded-lg bg-(--color-bg-secondary) animate-pulse" style={{ height }} />
    )
  }

  return (
    <div
      ref={mapRef}
      className="rounded-lg border border-(--color-border) overflow-hidden"
      style={{ height }}
    />
  )
}
