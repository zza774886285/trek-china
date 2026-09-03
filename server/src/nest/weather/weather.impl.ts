import { readCappedJson } from '../../utils/cappedFetch';

const WEATHER_TIMEOUT_MS = 8000;
const MAX_WEATHER_BYTES = 1024 * 1024;

// ── QWeather (和风天气) config ──────────────────────────────────────────
const QWEATHER_API = 'https://devapi.qweather.com';
const QWEATHER_KEY = process.env.QWEATHER_KEY || '';

// ── Interfaces ──────────────────────────────────────────────────────────

export interface WeatherResult {
  temp: number;
  temp_max?: number;
  temp_min?: number;
  main: string;
  description: string;
  type: string;
  sunrise?: string | null;
  sunset?: string | null;
  precipitation_sum?: number;
  precipitation_probability_max?: number;
  wind_max?: number;
  hourly?: HourlyEntry[];
  error?: string;
}

export interface HourlyEntry {
  hour: number;
  temp: number;
  precipitation: number;
  precipitation_probability: number;
  main: string;
  wind: number;
  humidity: number;
}

// ── QWeather icon → main 映射 ──────────────────────────────────────────

const ICON_MAP: Record<string, string> = {
  '100': 'Clear', '150': 'Clear',
  '101': 'Clouds', '102': 'Clouds', '103': 'Clouds', '151': 'Clouds', '153': 'Clouds',
  '104': 'Clouds',
  '300': 'Drizzle', '301': 'Drizzle',
  '302': 'Rain', '303': 'Rain', '304': 'Rain',
  '305': 'Rain', '306': 'Rain', '307': 'Rain', '308': 'Rain',
  '309': 'Drizzle', '310': 'Rain', '311': 'Rain', '312': 'Rain',
  '313': 'Rain', '314': 'Rain', '315': 'Rain', '316': 'Rain', '317': 'Rain', '318': 'Rain',
  '399': 'Rain',
  '400': 'Snow', '401': 'Snow', '402': 'Snow', '403': 'Snow',
  '404': 'Snow', '405': 'Snow', '406': 'Snow', '407': 'Snow', '408': 'Snow', '409': 'Snow', '410': 'Snow',
  '499': 'Snow',
  '500': 'Fog', '501': 'Fog', '502': 'Fog', '503': 'Fog', '504': 'Fog',
  '507': 'Fog', '508': 'Fog', '509': 'Fog', '510': 'Fog', '511': 'Fog', '512': 'Fog', '513': 'Fog', '514': 'Fog', '515': 'Fog',
  '900': 'Clear', '901': 'Clouds',
};

// ── Open-Meteo WMO code mappings (fallback) ──────────────────────────

const WMO_MAP: Record<number, string> = {
  0: 'Clear', 1: 'Clear', 2: 'Clouds', 3: 'Clouds',
  45: 'Fog', 48: 'Fog',
  51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 56: 'Drizzle', 57: 'Drizzle',
  61: 'Rain', 63: 'Rain', 65: 'Rain', 66: 'Rain', 67: 'Rain',
  71: 'Snow', 73: 'Snow', 75: 'Snow', 77: 'Snow',
  80: 'Rain', 81: 'Rain', 82: 'Rain',
  85: 'Snow', 86: 'Snow',
  95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
};

const WMO_DESCRIPTION_ZH: Record<number, string> = {
  0: '晴', 1: '大部晴朗', 2: '局部多云', 3: '多云',
  45: '雾', 48: '雾凇',
  51: '小雨', 53: '中雨', 55: '大雨', 56: '冻雨', 57: '强冻雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '中阵雨', 82: '强阵雨',
  85: '小阵雪', 86: '强阵雪',
  95: '雷暴', 96: '雷暴伴冰雹', 99: '强雷暴伴冰雹',
};

function iconToMain(icon: string): string {
  return ICON_MAP[icon] || 'Clouds';
}

// ── Cache ───────────────────────────────────────────────────────────────

const weatherCache = new Map<string, { data: WeatherResult; expiresAt: number }>();
const inFlight = new Map<string, Promise<WeatherResult>>();
const CACHE_MAX_ENTRIES = 1000;
const CACHE_PRUNE_TARGET = 500;
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000;

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of weatherCache) {
    if (now > entry.expiresAt) weatherCache.delete(key);
  }
  if (weatherCache.size > CACHE_MAX_ENTRIES) {
    const entries = [...weatherCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const toDelete = entries.slice(0, entries.length - CACHE_PRUNE_TARGET);
    toDelete.forEach(([key]) => weatherCache.delete(key));
  }
}

let cleanupTimer: NodeJS.Timeout | null = null;

export function startCacheCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(pruneCache, CACHE_CLEANUP_INTERVAL);
  cleanupTimer.unref?.();
}

export function stopCacheCleanup(): void {
  if (!cleanupTimer) return;
  clearInterval(cleanupTimer);
  cleanupTimer = null;
}

const TTL_FORECAST_MS = 60 * 60 * 1000;
const TTL_CURRENT_MS = 15 * 60 * 1000;
const TTL_CLIMATE_MS = 24 * 60 * 60 * 1000;

export function cacheKey(lat: string, lng: string, date?: string): string {
  const rlat = Number.parseFloat(lat).toFixed(2);
  const rlng = Number.parseFloat(lng).toFixed(2);
  return `${rlat}_${rlng}_${date || 'current'}`;
}

function getCached(key: string): WeatherResult | null {
  const entry = weatherCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    weatherCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: WeatherResult, ttlMs: number): void {
  weatherCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ── Coord validation ────────────────────────────────────────────────────

function coord(value: string, max: number, label: string): number {
  const n = String(value ?? '').trim() === '' ? Number.NaN : Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > max) {
    throw new ApiError(400, `Invalid ${label}`);
  }
  return n;
}

export function estimateCondition(tempAvg: number, precipMm: number): string {
  if (precipMm > 5) return tempAvg <= 0 ? 'Snow' : 'Rain';
  if (precipMm > 1) return tempAvg <= 0 ? 'Snow' : 'Drizzle';
  if (precipMm > 0.3) return 'Clouds';
  return tempAvg > 15 ? 'Clear' : 'Clouds';
}

// ── QWeather API helpers ────────────────────────────────────────────────

interface QWeatherNow {
  code: string;
  now?: {
    temp: string;
    feelsLike: string;
    icon: string;
    text: string;
    windDir: string;
    windScale: string;
    humidity: string;
    precip: string;
  };
}

interface QWeatherDaily {
  fxDate: string;
  tempMax: string;
  tempMin: string;
  iconDay: string;
  iconNight: string;
  textDay: string;
  textNight: string;
  humidity: string;
  precip: string;
  windDirDay: string;
  windScaleDay: string;
  sunrise: string;
  sunset: string;
}

interface QWeatherForecast {
  code: string;
  daily?: QWeatherDaily[];
}

interface QWeatherHourly {
  fxTime: string;
  temp: string;
  icon: string;
  text: string;
  precip: string;
  humidity: string;
  windScale: string;
}

interface QWeatherHourlyResp {
  code: string;
  hourly?: QWeatherHourly[];
}

interface QWeatherHistorical {
  code: string;
  weatherDaily?: {
    obsDate: string;
    tempMax: string;
    tempMin: string;
    iconDay: string;
    textDay: string;
    precip: string;
    humidity: string;
  };
}

// ── GeoAPI: 经纬度 → 城市ID ────────────────────────────────────────────

async function geoLookup(lng: string, lat: string): Promise<string | null> {
  try {
    const url = `https://geoapi.qweather.com/v2/city/lookup?location=${lng},${lat}&key=${QWEATHER_KEY}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
    const data = await readCappedJson<{ location?: Array<{ id: string }> }>(response, MAX_WEATHER_BYTES);
    return data?.location?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function qweatherGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, key: QWEATHER_KEY });
  const url = `${QWEATHER_API}${path}?${qs}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
  const data = await readCappedJson<T>(response, MAX_WEATHER_BYTES);
  if (!data) throw new ApiError(502, 'QWeather API error');
  return data;
}

// ── getWeather ──────────────────────────────────────────────────────────

async function _getWeatherImpl(
  lat: string,
  lng: string,
  date: string | undefined,
  lang: string,
  time?: string,
): Promise<WeatherResult> {
  const ck = cacheKey(lat, lng, date ? `${date}T${time ?? ''}` : date);

  // No date → current weather
  if (!date) {
    const cached = getCached(ck);
    if (cached) return cached;

    const now = await qweatherGet<QWeatherNow>('/v7/weather/now', { location: `${lng},${lat}` });
    if (now.code !== '200' || !now.now) {
      throw new ApiError(502, `QWeather error: ${now.code}`);
    }

    const result: WeatherResult = {
      temp: Number(now.now.temp),
      main: iconToMain(now.now.icon),
      description: now.now.text,
      type: 'current',
    };
    setCache(ck, result, TTL_CURRENT_MS);
    return result;
  }

  // With date
  const cached = getCached(ck);
  if (cached) return cached;

  const targetDate = new Date(date);
  const now = new Date();
  const diffDays = (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  // Forecast range (today ~ +3 days for free tier)
  if (diffDays >= -1 && diffDays <= 3) {
    const forecast = await qweatherGet<QWeatherForecast>('/v7/weather/3d', { location: `${lng},${lat}` });
    if (forecast.code !== '200' || !forecast.daily) {
      throw new ApiError(502, `QWeather forecast error: ${forecast.code}`);
    }

    const day = forecast.daily.find(d => d.fxDate === date);
    if (day) {
      const result: WeatherResult = {
        temp: Math.round((Number(day.tempMax) + Number(day.tempMin)) / 2),
        temp_max: Number(day.tempMax),
        temp_min: Number(day.tempMin),
        main: iconToMain(day.iconDay),
        description: day.textDay,
        type: 'forecast',
        sunrise: day.sunrise || null,
        sunset: day.sunset || null,
        precipitation_sum: Number(day.precip) || 0,
      };
      setCache(ck, result, TTL_FORECAST_MS);
      return result;
    }
  }

  // Historical: try QWeather historical API (needs city ID, not coordinates)
  if (diffDays < -1) {
    const histDate = date.replace(/-/g, '');
    try {
      const cityId = await geoLookup(lng, lat);
      const hist = await qweatherGet<QWeatherHistorical>('/v7/historical/weather', {
        location: cityId || `${lng},${lat}`,
        date: histDate,
      });
      if (hist.code === '200' && hist.weatherDaily) {
        const d = hist.weatherDaily;
        const result: WeatherResult = {
          temp: Math.round((Number(d.tempMax) + Number(d.tempMin)) / 2),
          temp_max: Number(d.tempMax),
          temp_min: Number(d.tempMin),
          main: iconToMain(d.iconDay),
          description: d.textDay,
          type: 'forecast',
          precipitation_sum: Number(d.precip) || 0,
        };
        setCache(ck, result, TTL_CLIMATE_MS);
        return result;
      }
    } catch {
    // Historical API may not be available on free tier, fall through to Open-Meteo
    }
    }

    // ── Open-Meteo fallback for historical dates ──────────────────────────
    if (diffDays < -1) {
    try {
    const dateStr = targetDate.toISOString().slice(0, 10);
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum&timezone=auto`;
    const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
    const data = await readCappedJson<{ daily?: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; weathercode?: number[]; precipitation_sum?: number[] } }>(response, MAX_WEATHER_BYTES);
    if (data?.daily?.time?.length && data.daily.temperature_2m_max?.[0] != null) {
      const tMax = data.daily.temperature_2m_max[0];
      const tMin = data.daily.temperature_2m_min![0];
      const code = data.daily.weathercode?.[0];
      const main = WMO_MAP[code!] || estimateCondition((tMax + tMin) / 2, data.daily.precipitation_sum?.[0] || 0);
      const result: WeatherResult = {
        temp: Math.round((tMax + tMin) / 2),
        temp_max: Math.round(tMax),
        temp_min: Math.round(tMin),
        main,
        description: WMO_DESCRIPTION_ZH[code!] || '',
        type: 'forecast',
      };
      setCache(ck, result, TTL_CLIMATE_MS);
      return result;
    }
    } catch {
    // Open-Meteo also failed, return empty
    }
    }

    // Far-future or fallback: estimate from climate averages (placeholder)
    return { temp: 0, main: '', description: '', type: '', error: 'no_forecast' };
}

export async function getWeather(
  rawLat: string,
  rawLng: string,
  date: string | undefined,
  lang: string,
  time?: string,
): Promise<WeatherResult> {
  const lat = String(coord(rawLat, 90, 'latitude'));
  const lng = String(coord(rawLng, 180, 'longitude'));
  const ck = cacheKey(lat, lng, date ? `${date}T${time ?? ''}` : date);
  const cached = getCached(ck);
  if (cached) return cached;

  const inFlightKey = `${ck}:${lang}`;
  const existing = inFlight.get(inFlightKey);
  if (existing !== undefined) return existing;
  const promise = _getWeatherImpl(lat, lng, date, lang, time);
  inFlight.set(inFlightKey, promise);
  try { return await promise; } finally { inFlight.delete(inFlightKey); }
}

// ── getDetailedWeather ──────────────────────────────────────────────────

async function _getDetailedWeatherImpl(
  lat: string,
  lng: string,
  date: string,
  lang: string,
): Promise<WeatherResult> {
  const ck = `detailed_${cacheKey(lat, lng, date)}`;
  const cached = getCached(ck);
  if (cached) return cached;

  const targetDate = new Date(date);
  const now = new Date();
  const diffDays = (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  // Climate / far-future fallback
  if (diffDays > 3) {
    return { temp: 0, main: '', description: '', type: '', error: 'no_forecast' };
  }

  // Get forecast + hourly
  let forecast: QWeatherForecast;
  try {
    forecast = await qweatherGet<QWeatherForecast>('/v7/weather/3d', { location: `${lng},${lat}` });
  } catch {
    forecast = { code: 'error', daily: null } as any;
  }

  // If QWeather fails and date is historical, try Open-Meteo Archive
  if ((forecast.code !== '200' || !forecast.daily) && diffDays < -1) {
    try {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum&timezone=auto`;
      const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
      const data = await readCappedJson<{ daily?: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; weathercode?: number[]; precipitation_sum?: number[] } }>(response, MAX_WEATHER_BYTES);
      if (data?.daily?.time?.length && data.daily.temperature_2m_max?.[0] != null) {
        const tMax = data.daily.temperature_2m_max[0];
        const tMin = data.daily.temperature_2m_min![0];
        const code = data.daily.weathercode?.[0];
        const main = WMO_MAP[code!] || estimateCondition((tMax + tMin) / 2, data.daily.precipitation_sum?.[0] || 0);
        const result: WeatherResult = {
          temp: Math.round((tMax + tMin) / 2),
          temp_max: Math.round(tMax),
          temp_min: Math.round(tMin),
          main,
          description: WMO_DESCRIPTION_ZH[code!] || '',
          type: 'forecast',
        };
        setCache(ck, result, TTL_CLIMATE_MS);
        return result;
      }
    } catch {
      // Open-Meteo also failed
    }
  }

  if (forecast.code !== '200' || !forecast.daily) {
    return { temp: 0, main: '', description: '', type: '', error: 'no_forecast' };
  }

  const day = forecast.daily.find(d => d.fxDate === date);

  // Get hourly data for the target date
  let hourlyData: HourlyEntry[] = [];
  try {
    const hourlyResp = await qweatherGet<QWeatherHourlyResp>('/v7/weather/24h', { location: `${lng},${lat}` });
    if (hourlyResp.code === '200' && hourlyResp.hourly) {
      hourlyData = hourlyResp.hourly.map(h => ({
        hour: new Date(h.fxTime).getHours(),
        temp: Number(h.temp),
        precipitation: Number(h.precip) || 0,
        precipitation_probability: 0,
        main: iconToMain(h.icon),
        wind: Number(h.windScale) || 0,
        humidity: Number(h.humidity) || 0,
      }));
    }
  } catch {
    // Hourly may fail, continue without it
  }

  if (day) {
    const result: WeatherResult = {
      temp: Math.round((Number(day.tempMax) + Number(day.tempMin)) / 2),
      temp_max: Number(day.tempMax),
      temp_min: Number(day.tempMin),
      main: iconToMain(day.iconDay),
      description: day.textDay,
      type: 'forecast',
      sunrise: day.sunrise || null,
      sunset: day.sunset || null,
      precipitation_sum: Number(day.precip) || 0,
      hourly: hourlyData.length > 0 ? hourlyData : undefined,
    };
    setCache(ck, result, TTL_FORECAST_MS);
    return result;
  }

  return { temp: 0, main: '', description: '', type: '', error: 'no_forecast' };
}

export async function getDetailedWeather(
  rawLat: string,
  rawLng: string,
  date: string,
  lang: string,
): Promise<WeatherResult> {
  const lat = String(coord(rawLat, 90, 'latitude'));
  const lng = String(coord(rawLng, 180, 'longitude'));
  const ck = `detailed_${cacheKey(lat, lng, date)}`;
  const cached = getCached(ck);
  if (cached) return cached;

  const inFlightKey = `${ck}:${lang}`;
  const existing = inFlight.get(inFlightKey);
  if (existing !== undefined) return existing;
  const promise = _getDetailedWeatherImpl(lat, lng, date, lang);
  inFlight.set(inFlightKey, promise);
  try { return await promise; } finally { inFlight.delete(inFlightKey); }
}

// ── Error class ─────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
