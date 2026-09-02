import type { Place, AssignmentPlace } from '../../types'

type PlaceLike = Pick<Place | AssignmentPlace, 'name' | 'lat' | 'lng'>

/**
 * 生成高德地图网页版链接，与 Google Maps / Apple Maps 跳转 UI 对齐。
 * 格式: https://uri.amap.com/marker?position=lng,lat&name=地点名称
 */
export function getAmapUrlForPlace(place: PlaceLike | null | undefined): string | null {
  if (!place || place.lat == null || place.lng == null) return null
  const name = place.name?.trim() || ''
  return `https://uri.amap.com/marker?position=${place.lng},${place.lat}&name=${encodeURIComponent(name)}&callnative=1`
}
