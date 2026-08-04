import { CloudSun, Droplets, MapPin, RefreshCw, Wind } from "lucide-react";
import { useEffect, useState } from "react";

import { GlassPanel } from "@/components/public/GlassPanel";
import { formatDateKey } from "@/lib/date";
import { loadVisitorWeatherFn } from "@/lib/weather.functions";
import { weatherDescription, type VisitorWeatherResult } from "@/lib/weather";

function celsius(value: number) {
  return `${Math.round(value)}°`;
}

export function WeatherCard() {
  const [weather, setWeather] = useState<VisitorWeatherResult | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setWeather(null);
    void loadVisitorWeatherFn()
      .then((next) => {
        if (!cancelled) setWeather(next);
      })
      .catch(() => {
        if (!cancelled) setWeather({ status: "unavailable", reason: "provider" });
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  return (
    <GlassPanel className="aibrium-weather-card" aria-live="polite">
      <div className="aibrium-card-heading">
        <span className="aibrium-card-heading__bar" aria-hidden="true" />
        <h2>IP 天气</h2>
      </div>

      {!weather && (
        <div className="aibrium-weather-card__loading" aria-label="正在获取天气">
          <span />
          <span />
          <span />
        </div>
      )}

      {weather?.status === "unavailable" && (
        <div className="aibrium-weather-card__empty">
          <CloudSun className="h-8 w-8 text-accent-amber" aria-hidden="true" />
          <p>暂时无法获取天气</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            重试
          </button>
        </div>
      )}

      {weather?.status === "ready" && (
        <>
          <div className="aibrium-weather-card__location">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{weather.location.label}</span>
            <small>IP 估算</small>
          </div>
          <div className="aibrium-weather-card__current">
            <div>
              <strong>{celsius(weather.current.temperatureC)}</strong>
              <p>{weatherDescription(weather.current.weatherCode)}</p>
            </div>
            <CloudSun className="h-12 w-12 text-accent-amber" aria-hidden="true" />
          </div>
          <div className="aibrium-weather-card__metrics">
            <span>
              <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
              {weather.current.humidity}%
            </span>
            <span>
              <Wind className="h-3.5 w-3.5" aria-hidden="true" />
              {Math.round(weather.current.windSpeedKmh)} km/h
            </span>
            <span>体感 {celsius(weather.current.apparentTemperatureC)}</span>
          </div>
          <div className="aibrium-weather-card__forecast">
            {weather.daily.map((day) => (
              <div key={day.date}>
                <time dateTime={day.date}>{formatDateKey(`${day.date}T00:00:00+08:00`)}</time>
                <span>{weatherDescription(day.weatherCode)}</span>
                <strong>
                  {celsius(day.maxC)} / {celsius(day.minC)}
                </strong>
              </div>
            ))}
          </div>
          <p className="aibrium-weather-card__source">Open-Meteo · 位置为 IP 估算</p>
        </>
      )}
    </GlassPanel>
  );
}
