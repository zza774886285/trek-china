import { Suspense, lazy, useImperativeHandle, useRef, type Ref } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import JourneyMap, { type JourneyMapHandle } from './JourneyMap'
import ErrorBoundary from '../shared/ErrorBoundary'
import type { JourneyMapGLHandle } from './JourneyMapGL'

import { JourneyMapGLMapbox, JourneyMapGLMaplibre } from '../Map/glLazy'
import type { JourneyTrack } from '@trek/shared'

// 高德地图懒加载，避免非高德用户加载多余 JS
const JourneyMapAmap = lazy(() => import('./JourneyMapAmap').then(m => ({ default: m.default })))

// Unified handle — all providers expose the same three methods.
export type JourneyMapAutoHandle = JourneyMapHandle

interface MapEntry {
  id: string
  lat: number
  lng: number
  title?: string | null
  location_name?: string | null
  mood?: string | null
  entry_date: string
  dayColor?: string
  dayLabel?: number
}

interface Props {
  ref?: Ref<JourneyMapAutoHandle>
  checkins: unknown[]
  entries: MapEntry[]
  trail?: { lat: number; lng: number }[]
  tracks?: JourneyTrack[]
  height?: number
  dark?: boolean
  activeMarkerId?: string | null
  onMarkerClick?: (id: string, type?: string) => void
  fullScreen?: boolean
  paddingBottom?: number
}

function JourneyMapAuto({ ref, ...props }: Props) {
  const provider = useSettingsStore(s => s.settings.map_provider)
  const token = useSettingsStore(s => s.settings.mapbox_access_token)
  const amapKey = useSettingsStore(s => s.settings.amap_api_key)
  const leafletRef = useRef<JourneyMapHandle>(null)
  const glRef = useRef<JourneyMapGLHandle>(null)
  const amapRef = useRef<any>(null)

  // 高德地图：有 key 才启用，否则降级到 Leaflet
  const useAmap = provider === 'amap' && !!amapKey

  // Fall back to Leaflet when the user selected Mapbox GL but hasn't
  // supplied a token yet. MapLibre/OpenFreeMap is tokenless.
  const useGL = !useAmap && (provider === 'maplibre-gl' || (provider === 'mapbox-gl' && !!token))
  const glProvider = provider === 'maplibre-gl' ? 'maplibre-gl' : 'mapbox-gl'

  useImperativeHandle(ref, () => ({
    highlightMarker: (id) => {
      if (useAmap) return amapRef.current?.highlightMarker(id)
      if (useGL) return glRef.current?.highlightMarker(id)
      return leafletRef.current?.highlightMarker(id)
    },
    focusMarker: (id) => {
      if (useAmap) return amapRef.current?.focusMarker(id)
      if (useGL) return glRef.current?.focusMarker(id)
      return leafletRef.current?.focusMarker(id)
    },
    invalidateSize: () => {
      if (useAmap) return amapRef.current?.invalidateSize()
      if (useGL) return glRef.current?.invalidateSize()
      return leafletRef.current?.invalidateSize()
    },
  }), [useAmap, useGL])

  // 高德地图渲染
  if (useAmap) {
    return (
      <ErrorBoundary boundaryId="journey-map:amap" fallback={<JourneyMap ref={leafletRef} {...(props as any)} />}>
        <Suspense fallback={<JourneyMap ref={leafletRef} {...(props as any)} />}>
          <JourneyMapAmap ref={amapRef} {...(props as any)} />
        </Suspense>
      </ErrorBoundary>
    )
  }

  // GL 地图渲染
  const JourneyMapGL = glProvider === 'maplibre-gl' ? JourneyMapGLMaplibre : JourneyMapGLMapbox
  if (useGL) {
    return (
      // See MapViewAuto: the boundary has to sit outside the Suspense to catch a
      // chunk that never arrives.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ErrorBoundary boundaryId="journey-map:gl" resetKeys={[glProvider]} fallback={<JourneyMap ref={leafletRef} {...(props as any)} />}>
        <Suspense fallback={null}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <JourneyMapGL ref={glRef} {...(props as any)} glProvider={glProvider} />
        </Suspense>
      </ErrorBoundary>
    )
  }
  // 默认 Leaflet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <JourneyMap ref={leafletRef} {...(props as any)} />
}

export default JourneyMapAuto
