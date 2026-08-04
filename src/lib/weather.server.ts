import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  displayLocation,
  parseCoordinate,
  roundedCoordinate,
  type ReadyVisitorWeather,
  type VisitorWeatherResult,
} from "@/lib/weather";

const LOCATION_TTL_MS = 30 * 60 * 1000;
const WEATHER_TTL_MS = 10 * 60 * 1000;
const WEATHER_STALE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 7_000;

type VisitorLocation = {
  label: string;
  timezone: string;
  latitude: number;
  longitude: number;
};

type WeatherCacheEntry = {
  data: ReadyVisitorWeather;
  freshUntil: number;
  staleUntil: number;
};

const locationCache = new Map<string, { location: VisitorLocation; expiresAt: number }>();
const weatherCache = new Map<string, WeatherCacheEntry>();
const weatherInFlight = new Map<string, Promise<ReadyVisitorWeather>>();

const ipLocationSchema = z.object({
  success: z.boolean().optional(),
  latitude: z.number(),
  longitude: z.number(),
  city: z.string().optional(),
  region: z.string().optional(),
  country_code: z.string().optional(),
  timezone: z
    .object({ name: z.string().optional() })
    .optional(),
});

const forecastSchema = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    relative_humidity_2m: z.number(),
    weather_code: z.number(),
    wind_speed_10m: z.number(),
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
  }),
});

function requestIp() {
  const forwarded = getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim();
  return getRequestHeader("cf-connecting-ip")?.trim() || forwarded || undefined;
}

function isSafeIp(value: string | undefined) {
  return !!value && value.length <= 64 && /^[0-9a-fA-F:., ]+$/.test(value);
}

function locationFromHeaders(): VisitorLocation | undefined {
  const latitude = parseCoordinate(getRequestHeader("cf-iplatitude"), -90, 90);
  const longitude = parseCoordinate(getRequestHeader("cf-iplongitude"), -180, 180);
  if (latitude === undefined || longitude === undefined) return undefined;

  return {
    latitude: roundedCoordinate(latitude),
    longitude: roundedCoordinate(longitude),
    label: displayLocation([
      getRequestHeader("cf-ipcity"),
      getRequestHeader("cf-region"),
      getRequestHeader("cf-ipcountry"),
    ]),
    timezone: getRequestHeader("cf-timezone") || "auto",
  };
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`weather provider ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function resolveLocation(): Promise<VisitorLocation | undefined> {
  const fromHeaders = locationFromHeaders();
  if (fromHeaders) return fromHeaders;

  const ip = requestIp();
  const cacheKey = isSafeIp(ip) ? ip! : "server-fallback";
  const cached = locationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.location;

  const endpoint = isSafeIp(ip)
    ? `https://ipwho.is/${encodeURIComponent(ip!)}`
    : "https://ipwho.is/";
  try {
    const parsed = ipLocationSchema.safeParse(await fetchJson(endpoint));
    if (!parsed.success || parsed.data.success === false) return undefined;
    const location: VisitorLocation = {
      latitude: roundedCoordinate(parsed.data.latitude),
      longitude: roundedCoordinate(parsed.data.longitude),
      label: displayLocation([parsed.data.city, parsed.data.region, parsed.data.country_code]),
      timezone: parsed.data.timezone?.name || "auto",
    };
    locationCache.set(cacheKey, { location, expiresAt: Date.now() + LOCATION_TTL_MS });
    return location;
  } catch {
    return undefined;
  }
}

async function fetchWeather(location: VisitorLocation): Promise<ReadyVisitorWeather> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
    timezone: "auto",
    forecast_days: "4",
  });
  const parsed = forecastSchema.safeParse(
    await fetchJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`),
  );
  if (!parsed.success) throw new Error("invalid weather payload");
  return {
    status: "ready",
    location: { label: location.label, timezone: location.timezone, approximate: true },
    current: {
      time: parsed.data.current.time,
      temperatureC: parsed.data.current.temperature_2m,
      apparentTemperatureC: parsed.data.current.apparent_temperature,
      weatherCode: parsed.data.current.weather_code,
      windSpeedKmh: parsed.data.current.wind_speed_10m,
      humidity: parsed.data.current.relative_humidity_2m,
    },
    daily: parsed.data.daily.time.slice(0, 3).map((date, index) => ({
      date,
      weatherCode: parsed.data.daily.weather_code[index] ?? 0,
      minC: parsed.data.daily.temperature_2m_min[index] ?? 0,
      maxC: parsed.data.daily.temperature_2m_max[index] ?? 0,
    })),
    fetchedAt: new Date().toISOString(),
    stale: false,
  };
}

async function fetchCachedWeather(location: VisitorLocation) {
  const key = `${location.latitude.toFixed(2)}:${location.longitude.toFixed(2)}`;
  const cached = weatherCache.get(key);
  const now = Date.now();
  if (cached && cached.freshUntil > now) return cached.data;

  const existing = weatherInFlight.get(key);
  if (existing) return existing;

  const request = fetchWeather(location)
    .then((data) => {
      weatherCache.set(key, {
        data,
        freshUntil: Date.now() + WEATHER_TTL_MS,
        staleUntil: Date.now() + WEATHER_STALE_TTL_MS,
      });
      return data;
    })
    .finally(() => weatherInFlight.delete(key));
  weatherInFlight.set(key, request);

  try {
    return await request;
  } catch (error) {
    if (cached && cached.staleUntil > now) return { ...cached.data, stale: true };
    throw error;
  }
}

export async function loadVisitorWeather(): Promise<VisitorWeatherResult> {
  setResponseHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=900");
  const location = await resolveLocation();
  if (!location) return { status: "unavailable", reason: "location" };
  try {
    return await fetchCachedWeather(location);
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "provider",
    };
  }
}
