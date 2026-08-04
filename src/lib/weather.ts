import { z } from "zod";

const readyWeatherSchema = z.object({
  status: z.literal("ready"),
  location: z.object({
    label: z.string(),
    timezone: z.string(),
    approximate: z.literal(true),
  }),
  current: z.object({
    time: z.string(),
    temperatureC: z.number(),
    apparentTemperatureC: z.number(),
    weatherCode: z.number().int(),
    windSpeedKmh: z.number(),
    humidity: z.number().min(0).max(100),
  }),
  daily: z.array(
    z.object({
      date: z.string(),
      weatherCode: z.number().int(),
      minC: z.number(),
      maxC: z.number(),
    }),
  ),
  fetchedAt: z.string(),
  stale: z.boolean(),
});

export const visitorWeatherSchema = z.discriminatedUnion("status", [
  readyWeatherSchema,
  z.object({
    status: z.literal("unavailable"),
    reason: z.enum(["location", "provider", "timeout"]),
  }),
]);

export type VisitorWeatherResult = z.infer<typeof visitorWeatherSchema>;
export type ReadyVisitorWeather = z.infer<typeof readyWeatherSchema>;

const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: "晴朗",
  1: "大致晴朗",
  2: "局部多云",
  3: "阴天",
  45: "有雾",
  48: "冻雾",
  51: "小毛毛雨",
  53: "毛毛雨",
  55: "较强毛毛雨",
  56: "冻毛毛雨",
  57: "强冻毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  66: "冻雨",
  67: "强冻雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  77: "雪粒",
  80: "阵雨",
  81: "中阵雨",
  82: "强阵雨",
  85: "阵雪",
  86: "强阵雪",
  95: "雷雨",
  96: "雷雨伴冰雹",
  99: "强雷雨伴冰雹",
};

export function weatherDescription(code: number) {
  return WEATHER_DESCRIPTIONS[code] ?? "天气变化中";
}

export function parseCoordinate(value: unknown, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

export function roundedCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

export function displayLocation(parts: Array<unknown>) {
  const label = parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim())
    .join(" · ");
  return label || "当前位置";
}
