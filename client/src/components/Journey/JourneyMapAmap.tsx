import { useEffect, useRef, useState, useCallback, useImperativeHandle, type Ref } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { wgs84ToGcj02 } from '@trek/shared'
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../../constants/mapDefaults'
import type { JourneyTrack } from '@trek/shared'

import type { AMapMap, AMapMarker, AMapPolyline } from '../Map/amapTypes'
import '../Map/amapTypes' // ensure global Window.AMap declaration is loaded

/* ── 工具函数 ──────────────────────────────────────────────────────────── */
// 服务器统一存储 WGS-84（高德POI搜索结果也已转为WGS-84），客户端无条件转 GCJ-02

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

/* ── Journey Map Entry 类型 ────────────────────────────────────────────── */
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

/* ── JourneyMapAmap Handle ─────────────────────────────────────────────── */
export interface JourneyMapAmapHandle {
  highlightMarker: (id: string | null) => void
  focusMarker: (id: string) => void
  invalidateSize: () => void
}

/* ── 组件 Props ────────────────────────────────────────────────────────── */
interface Props {
  ref?: Ref<JourneyMapAmapHandle>
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

/* ── 构建 marker 数据 ─────────────────────────────────────────────────── */
interface MarkerItem {
  id: string
  lat: number
  lng: number
  label: string
  dayColor: string
  dayLabel: number
  source?: string | null
}

function buildMarkerItems(entries: MapEntry[]): MarkerItem[] {
  const items: MarkerItem[] = []
  for (const e of entries) {
    if (e.lat && e.lng) {
      items.push({
        id: e.id,
        lat: e.lat,
        lng: e.lng,
        label: e.title || 'Entry',
        dayColor: e.dayColor || '#52525B',
        dayLabel: e.dayLabel ?? 1,
        source: (e as any).source ?? null,
      })
    }
  }
  items.sort((a, b) => a.id.localeCompare(b.id))
  return items
}

/* ── marker HTML ───────────────────────────────────────────────────────── */
function markerHtml(dayColor: string, dayLabel: number, highlighted: boolean): string {
  const stroke = highlighted ? '#fff' : 'rgba(255,255,255,0.5)'
  const shadow = highlighted
    ? 'filter:drop-shadow(0 0 10px rgba(0,0,0,0.4)) drop-shadow(0 2px 6px rgba(0,0,0,0.4))'
    : 'filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25))'
  const label = String(dayLabel)
  const scale = highlighted ? 1.2 : 1
  const size = 28

  return `<div style="width:${size}px;height:${size}px;transform:scale(${scale});transition:transform 0.2s ease;${shadow};transform-origin:bottom center">
    <svg width="${size}" height="${size}" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="12" fill="${dayColor}" stroke="${stroke}" stroke-width="1.5"/>
      <text x="14" y="14" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="'Poppins',system-ui,sans-serif" font-size="11" font-weight="700">${label}</text>
    </svg>
  </div>`
}

/* ── 组件 ──────────────────────────────────────────────────────────────── */
function JourneyMapAmap(
  { entries, trail, tracks, height = 220, dark, activeMarkerId, onMarkerClick, fullScreen, paddingBottom, ref }: Props,
) {
  const apiKey = useSettingsStore(s => s.settings.amap_api_key || '')
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<AMapMap | null>(null)
  const markersRef = useRef<AMapMarker[]>([])
  const polylinesRef = useRef<AMapPolyline[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const highlightedRef = useRef<string | null>(null)
  const onMarkerClickRef = useRef(onMarkerClick)
  onMarkerClickRef.current = onMarkerClick

  /* 初始化地图 */
  useEffect(() => {
    if (!apiKey || !containerRef.current) return
    let alive = true

    loadAmapScript(apiKey).then(() => {
      if (!alive || !containerRef.current || !window.AMap) return
      const AMap = window.AMap
      // 默认中心点
      const [cLng, cLat] = wgs84ToGcj02(DEFAULT_MAP_CENTER[1], DEFAULT_MAP_CENTER[0])
      mapRef.current = new AMap.Map(containerRef.current, {
        zoom: DEFAULT_MAP_ZOOM,
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

  /* 更新 markers 和 polylines */
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.AMap) return
    const AMap = window.AMap
    const map = mapRef.current

    // 清除旧 markers 和 polylines
    markersRef.current.forEach(m => map.remove(m))
    markersRef.current = []
    polylinesRef.current.forEach(p => map.remove(p))
    polylinesRef.current = []

    const items = buildMarkerItems(entries)
    const allCoords: [number, number][] = []

    // 绘制 trail
    if (trail && trail.length > 1) {
      const path = trail.map(p => {
        const [gcjLng, gcjLat] = wgs84ToGcj02(p.lng, p.lat)
        return new AMap.LngLat(gcjLng, gcjLat)
      })
      const polyline = new AMap.Polyline({
        path,
        strokeColor: '#6366f1',
        strokeWeight: 3,
        strokeOpacity: 0.4,
        lineJoin: 'round',
        strokeStyle: 'dashed',
        strokeDasharray: [6, 4],
      })
      map.add(polyline)
      polylinesRef.current.push(polyline)
      trail.forEach(p => allCoords.push([p.lng, p.lat]))
    }

    // 绘制 tracks
    if (tracks) {
      for (const track of tracks) {
        if (track.points.length < 2) continue
        const path = track.points.map(([lat, lng]) => {
          const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat)
          return new AMap.LngLat(gcjLng, gcjLat)
        })
        // 白色底边
        const casing = new AMap.Polyline({
          path,
          strokeColor: '#ffffff',
          strokeWeight: 6,
          strokeOpacity: 0.75,
          lineJoin: 'round',
        })
        map.add(casing)
        polylinesRef.current.push(casing)
        // 彩色路线
        const polyline = new AMap.Polyline({
          path,
          strokeColor: track.color || '#4f46e5',
          strokeWeight: 3.5,
          strokeOpacity: 0.95,
          lineJoin: 'round',
        })
        map.add(polyline)
        polylinesRef.current.push(polyline)
        track.points.forEach(([lat, lng]) => allCoords.push([lng, lat]))
      }
    }

    // 绘制 markers
    items.forEach(item => {
      const [gcjLng, gcjLat] = wgs84ToGcj02(item.lng, item.lat)
      const isSelected = item.id === activeMarkerId
      const html = markerHtml(item.dayColor, item.dayLabel, isSelected)

      const marker = new AMap.Marker({
        position: new AMap.LngLat(gcjLng, gcjLat),
        content: html,
        offset: new AMap.Pixel(-14, -28),
        extData: item,
      })
      marker.on('click', () => onMarkerClickRef.current?.(item.id))
      map.add(marker)
      markersRef.current.push(marker)
      allCoords.push([item.lng, item.lat])
    })

    // 自动适配视野
    if (allCoords.length > 0) {
      requestAnimationFrame(() => {
        if (mapRef.current && markersRef.current.length > 0) {
          mapRef.current.setFitView(markersRef.current, { padding: [60, 60, 60, 60] })
        }
      })
    }
  }, [mapReady, entries, trail, tracks, activeMarkerId, dark, fullScreen, paddingBottom])

  /* highlight marker */
  const highlightMarker = useCallback((id: string | null) => {
    const prev = highlightedRef.current
    highlightedRef.current = id
    if (!mapReady || !mapRef.current || !window.AMap) return

    // 恢复上一个 marker
    if (prev && prev !== id) {
      const marker = markersRef.current.find(m => (m.getExtData() as MarkerItem)?.id === prev)
      if (marker) {
        const data = marker.getExtData() as MarkerItem
        marker.setContent(markerHtml(data.dayColor, data.dayLabel, false))
      }
    }

    // 高亮当前 marker
    if (id) {
      const marker = markersRef.current.find(m => (m.getExtData() as MarkerItem)?.id === id)
      if (marker) {
        const data = marker.getExtData() as MarkerItem
        marker.setContent(markerHtml(data.dayColor, data.dayLabel, true))
      }
    }
  }, [mapReady])

  /* focus marker */
  const focusMarker = useCallback((id: string) => {
    highlightMarker(id)
    const marker = markersRef.current.find(m => (m.getExtData() as MarkerItem)?.id === id)
    if (marker && mapRef.current) {
      try {
        const pos = marker.getPosition()
        mapRef.current.setZoomAndCenter(12, pos)
      } catch { /* map not yet initialized */ }
    }
  }, [highlightMarker])

  /* invalidateSize */
  const invalidateSize = useCallback(() => {
    // AMap doesn't have invalidateSize, but we can trigger a resize
    if (mapRef.current) {
      try {
        // Trigger window resize event to force AMap to recalculate
        window.dispatchEvent(new Event('resize'))
      } catch { /* ignore */ }
    }
  }, [])

  useImperativeHandle(ref, () => ({ highlightMarker, focusMarker, invalidateSize }), [highlightMarker, focusMarker, invalidateSize])

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-sm">
        高德地图加载失败: {error}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: height === 9999 ? '100%' : height, width: '100%', borderRadius: 'inherit', overflow: 'hidden' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}

export default JourneyMapAmap
