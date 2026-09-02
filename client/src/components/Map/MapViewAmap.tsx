import { useEffect, useRef, useState, useCallback, memo } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { wgs84ToGcj02 } from '@trek/shared'
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../../constants/mapDefaults'
import type { Place } from '../../types'
import type { AMapMap, AMapMarker, AMapLngLat, AMapPolyline } from './amapTypes'
import './amapTypes' // ensure global Window.AMap declaration is loaded

/* ── 工具函数 ──────────────────────────────────────────────────────────── */
/** 高德 POI 搜索返回 GCJ02，不需要转换；GPS/OSM 是 WGS84 需要转换 */
function toGcj(lng: number, lat: number, osmId?: string | null): [number, number] {
  if (osmId?.startsWith('amap:')) return [lng, lat] // 已是 GCJ02
  return wgs84ToGcj02(lng, lat)
}
/** 路线数据来自高德路线规划 API，已是 GCJ02 */
function toGcjForce(lng: number, lat: number): [number, number] {
  return [lng, lat]
}

function loadAmapScript(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.AMap) { resolve(); return }
    // AMap JS API 2.0: set security config BEFORE loading any scripts
    if (!(window as any)._AMapSecurityConfig) {
      (window as any)._AMapSecurityConfig = {
        securityJsCode: 'ff612f9b4cd1e8a1b02a885d88204e60',
      }
    }
    // Load security.js first
    const secScript = document.createElement('script')
    secScript.src = 'https://webapi.amap.com/security.js'
    secScript.onload = () => {
      // Then load main API
      const mainScript = document.createElement('script')
      mainScript.src = `https://webapi.amap.com/maps?v=2.0&key=${apiKey}&plugin=AMap.Marker,AMap.Polyline`
      mainScript.onload = () => resolve()
      mainScript.onerror = () => reject(new Error('Failed to load AMap JS API'))
      document.head.appendChild(mainScript)
    }
    secScript.onerror = () => {
      // Try direct load without security.js
      const mainScript = document.createElement('script')
      mainScript.src = `https://webapi.amap.com/maps?v=2.0&key=${apiKey}&plugin=AMap.Marker,AMap.Polyline`
      mainScript.onload = () => resolve()
      mainScript.onerror = () => reject(new Error('Failed to load AMap JS API'))
      document.head.appendChild(mainScript)
    }
    document.head.appendChild(secScript)
  })
}

/* ── 组件 ──────────────────────────────────────────────────────────────── */
export interface MapViewAmapProps {
  places?: Place[]
  dayPlaces?: Place[]
  route?: [number, number][][] | null
  selectedPlaceId?: number | null
  onMarkerClick?: (place: Place) => void
  center?: [number, number]
  zoom?: number
  fitKey?: number
}

export const MapViewAmap = memo(function MapViewAmap({
  places = [],
  dayPlaces = [],
  route = null,
  selectedPlaceId = null,
  onMarkerClick,
  center = DEFAULT_MAP_CENTER,
  zoom = DEFAULT_MAP_ZOOM,
  fitKey = 0,
}: MapViewAmapProps) {
  const apiKey = useSettingsStore(s => s.settings.amap_api_key || '')
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<AMapMap | null>(null)
  const markersRef = useRef<AMapMarker[]>([])
  const polylinesRef = useRef<AMapPolyline[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* 初始化地图 */
  useEffect(() => {
    if (!apiKey || !containerRef.current) return
    let alive = true

    loadAmapScript(apiKey).then(() => {
      if (!alive || !containerRef.current || !window.AMap) return
      const AMap = window.AMap
      const [cLng, cLat] = wgs84ToGcj02(center[1], center[0])
      mapRef.current = new AMap.Map(containerRef.current, {
        zoom,
        center: [cLng, cLat],
        mapStyle: 'amap://styles/normal',
        viewMode: '2D',
      })
      setMapReady(true)
    }).catch(err => {
      if (alive) setError(err instanceof Error ? err.message : 'Failed to load AMap')
    })

    return () => {
      alive = false
      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
      }
    }
  }, [apiKey])

  /* 更新 markers */
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.AMap) return
    const AMap = window.AMap
    const map = mapRef.current

    // 清除旧 markers
    markersRef.current.forEach(m => map.remove(m))
    markersRef.current = []

    const allPlaces = dayPlaces.length > 0 ? dayPlaces : places
    allPlaces.forEach(place => {
      if (place.lat == null || place.lng == null) return
      const [gcjLng, gcjLat] = toGcj(place.lng, place.lat, place.osm_id)
      const isSelected = place.id === selectedPlaceId
      const size = isSelected ? 36 : 28
      const color = isSelected ? '#6366f1' : '#3b82f6'
      const html = `<div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${color};border:3px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
        color:white;font-size:${size * 0.4}px;font-weight:bold;
        cursor:pointer;transform:translate(-50%,-50%);
      ">${place.name?.charAt(0) || '📍'}</div>`

      const marker = new AMap.Marker({
        position: new AMap.LngLat(gcjLng, gcjLat),
        content: html,
        offset: new AMap.Pixel(-size / 2, -size / 2),
        extData: place,
      })
      marker.on('click', () => onMarkerClick?.(place))
      map.add(marker)
      markersRef.current.push(marker)
    })
  }, [mapReady, places, dayPlaces, selectedPlaceId, onMarkerClick, fitKey])

  /* 更新路线 polyline — cache last non-null route to survive provider-switch null gap */
  const lastRouteRef = useRef<[number, number][][] | null>(null)
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.AMap) return
    const AMap = window.AMap
    const map = mapRef.current

    // Cache latest non-null route so provider-switch gap still draws
    if (route && route.length > 0) lastRouteRef.current = route

    polylinesRef.current.forEach(p => map.remove(p))
    polylinesRef.current = []

    const activeRoute = route && route.length > 0 ? route : lastRouteRef.current
    if (!activeRoute) return

    activeRoute.forEach((segment) => {
      // route data is [lat, lng] (GeoJSON order) — swap to (lng, lat) for AMap
      const path = segment.map(([lat, lng]) => {
        const [gcjLng, gcjLat] = toGcjForce(lng, lat)
        return new AMap.LngLat(gcjLng, gcjLat)
      })
      const polyline = new AMap.Polyline({
        path,
        strokeColor: '#3b82f6',
        strokeWeight: 6,
        strokeOpacity: 1.0,
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 120,
        visible: true,
      })
      map.add(polyline)
      polylinesRef.current.push(polyline)
    })
    // Fit view to include polylines
    if (polylinesRef.current.length > 0) {
      map.setFitView(polylinesRef.current as any, false)
    }
  }, [mapReady, route, fitKey])

  /* 自动适配视野 */
  useEffect(() => {
    if (!mapReady || !mapRef.current || markersRef.current.length === 0) return
    mapRef.current.setFitView(markersRef.current, { padding: [60, 60, 60, 60] })
  }, [mapReady, fitKey])

  /* fly-to on selectedPlaceId change — mirrors Leaflet SelectionController */
  const prevSelectedRef = useRef<number | null>(null)
  useEffect(() => {
    if (!selectedPlaceId || !mapRef.current || selectedPlaceId === prevSelectedRef.current) {
      prevSelectedRef.current = selectedPlaceId
      return
    }
    const allPlaces = dayPlaces.length > 0 ? dayPlaces : places
    const selected = allPlaces.find(p => p.id === selectedPlaceId)
    if (selected?.lat != null && selected?.lng != null) {
      const [gcjLng, gcjLat] = toGcj(selected.lng, selected.lat, selected.osm_id)
      const map = mapRef.current
      map.setZoomAndCenter(16, new (window.AMap!.LngLat)(gcjLng, gcjLat))
    }
    prevSelectedRef.current = selectedPlaceId
  }, [selectedPlaceId, places, dayPlaces])

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-sm">
        高德地图加载失败: {error}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full" style={{ minHeight: 400 }} />
  )
})

export default MapViewAmap
