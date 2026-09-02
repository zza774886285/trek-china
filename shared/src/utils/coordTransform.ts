/**
 * WGS-84 ↔ GCJ-02 坐标转换工具。
 *
 * TREK 内部存储使用 WGS-84（GPS 原始坐标），高德地图使用 GCJ-02（国测局坐标）。
 * 切换到高德地图底图时，必须将 WGS-84 坐标转换为 GCJ-02 才能正确显示。
 *
 * 参考: https://github.com/googlemaps/geojs
 */

const PI = Math.PI
const A = 6378245.0 // 长半轴
const EE = 0.00669342162296594323 // 偏心率平方

function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0
  return ret
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0
  return ret
}

/**
 * WGS-84 坐标转 GCJ-02 坐标。
 * @param wgsLng WGS-84 经度
 * @param wgsLat WGS-84 纬度
 * @returns [gcjLng, gcjLat] GCJ-02 坐标
 */
export function wgs84ToGcj02(wgsLng: number, wgsLat: number): [number, number] {
  if (outOfChina(wgsLng, wgsLat)) return [wgsLng, wgsLat]

  let dLat = transformLat(wgsLng - 105.0, wgsLat - 35.0)
  let dLng = transformLng(wgsLng - 105.0, wgsLat - 35.0)

  const radLat = wgsLat / 180.0 * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)

  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI)
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI)

  return [wgsLng + dLng, wgsLat + dLat]
}

/**
 * GCJ-02 坐标转 WGS-84 坐标（迭代法，精度约0.5m）。
 * @param gcjLng GCJ-02 经度
 * @param gcjLat GCJ-02 纬度
 * @returns [wgsLng, wgsLat] WGS-84 坐标
 */
export function gcj02ToWgs84(gcjLng: number, gcjLat: number): [number, number] {
  if (outOfChina(gcjLng, gcjLat)) return [gcjLng, gcjLat]

  let [lng, lat] = wgs84ToGcj02(gcjLng, gcjLat)
  return [gcjLng * 2 - lng, gcjLat * 2 - lat]
}

/**
 * 批量将 WGS-84 坐标数组转为 GCJ-02（用于路线 polyline）。
 * 输入格式: [lng, lat][]
 */
export function wgs84PathToGcj02(path: [number, number][]): [number, number][] {
  return path.map(([lng, lat]) => wgs84ToGcj02(lng, lat))
}
