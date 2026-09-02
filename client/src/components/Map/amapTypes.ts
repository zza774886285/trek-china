/* ── 高德 JS API 类型声明（共享） ──────────────────────────────────────── */

export interface AMapPixel {
  x: number
  y: number
}

export interface AMapMarker {
  setMap(map: AMapMap | null): void
  on(event: string, handler: () => void): void
  off(event: string, handler: () => void): void
  setPosition(lnglat: AMapLngLat): void
  getPosition(): AMapLngLat
  setContent(content: string | HTMLElement): void
  setExtData(data: unknown): unknown
  getExtData(): unknown
  setOffset(offset: AMapPixel): void
}

export interface AMapPolyline {
  setMap(map: AMapMap | null): void
}

export interface AMapLngLat {
  new (lng: number, lat: number): AMapLngLat
  getPosition(): { lng: number; lat: number }
}

export interface AMapMap {
  new (container: string | HTMLElement, opts?: unknown): AMapMap
  destroy(): void
  add(overlay: AMapMarker | AMapPolyline | AMapMarker[]): void
  remove(overlay: AMapMarker | AMapPolyline): void
  clearMap(): void
  setCenter(lnglat: AMapLngLat): void
  setZoomAndCenter(zoom: number, center: AMapLngLat): void
  setFitView(overlays?: AMapMarker[], fitViewOptions?: unknown): void
  on(event: string, handler: (e: unknown) => void): void
  off(event: string, handler: (e: unknown) => void): void
}

declare global {
  interface Window {
    AMap?: {
      Map: new (container: string | HTMLElement, opts?: unknown) => AMapMap
      Marker: new (opts?: unknown) => AMapMarker
      Polyline: new (opts?: unknown) => AMapPolyline
      LngLat: new (lng: number, lat: number) => AMapLngLat
      Icon: new (opts?: unknown) => unknown
      Size: new (w: number, h: number) => unknown
      Pixel: new (x: number, y: number) => AMapPixel
      load(): Promise<void>
    }
  }
}

export {}
