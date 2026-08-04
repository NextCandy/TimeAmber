import { ListMusic, Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { GlassPanel } from "@/components/public/GlassPanel";
import { DEFAULT_POST_COVER } from "@/lib/brand";
import { safePublicHref, type PublicSiteConfig } from "@/lib/public-site-settings";

type MusicConfig = PublicSiteConfig["music"];
type MusicTrack = MusicConfig["playlist"][number];

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "00:00";
  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function orderedTracks(music: MusicConfig): MusicTrack[] {
  return music.playlist.filter((track) => track.enabled).sort((a, b) => a.order - b.order);
}

export function MusicPlayer({ music }: { music: MusicConfig }) {
  const tracks = useMemo(() => orderedTracks(music), [music.playlist]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [selectedId, setSelectedId] = useState(music.activeTrackId);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const currentTrack = tracks.find((track) => track.id === selectedId) ?? tracks[0];
  const currentUrl = currentTrack ? safePublicHref(currentTrack.url) : undefined;

  useEffect(() => {
    const configured = tracks.find((track) => track.id === music.activeTrackId)?.id;
    setSelectedId((current) =>
      tracks.some((track) => track.id === current) ? current : (configured ?? tracks[0]?.id ?? ""),
    );
  }, [music.activeTrackId, tracks]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    audio.src = currentUrl ?? "";
    if (currentUrl) audio.load();
  }, [currentUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () =>
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      if (tracks.length > 1) {
        const index = tracks.findIndex((track) => track.id === currentTrack?.id);
        setSelectedId(tracks[(index + 1) % tracks.length]?.id ?? "");
      } else {
        setPlaying(false);
        setCurrentTime(0);
      }
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [currentTrack?.id, tracks]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !currentUrl) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function selectRelative(offset: -1 | 1) {
    if (!currentTrack || tracks.length < 2) return;
    const index = tracks.findIndex((track) => track.id === currentTrack.id);
    setSelectedId(tracks[(index + offset + tracks.length) % tracks.length]?.id ?? "");
  }

  return (
    <GlassPanel className="aibrium-music-card" aria-label="音乐播放器">
      <div className="aibrium-card-heading">
        <span className="aibrium-card-heading__bar" aria-hidden="true" />
        <h2>{music.providerLabel}</h2>
        <Music2 className="aibrium-music-card__heading-icon" aria-hidden="true" />
      </div>

      {currentTrack ? (
        <>
          <div className="aibrium-music-card__track">
            <img
              src={safePublicHref(currentTrack.coverUrl) || DEFAULT_POST_COVER}
              alt=""
              width={72}
              height={72}
              className="aibrium-music-card__cover"
            />
            <div className="aibrium-music-card__track-copy">
              <h3>{currentTrack.title}</h3>
              <p>{currentTrack.artist || "TimeAmber"}</p>
              {currentTrack.subtitle && <small>{currentTrack.subtitle}</small>}
            </div>
          </div>
          <div className="aibrium-music-card__progress">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              onChange={(event) => {
                const next = Number(event.target.value);
                setCurrentTime(next);
                if (audioRef.current) audioRef.current.currentTime = next;
              }}
              aria-label="播放进度"
              disabled={!currentUrl || !duration}
            />
            <span>{formatTime(duration)}</span>
          </div>
          <div className="aibrium-music-card__controls">
            <button
              type="button"
              onClick={() => selectRelative(-1)}
              disabled={tracks.length < 2}
              aria-label="上一首"
            >
              <SkipBack aria-hidden="true" />
            </button>
            <button
              type="button"
              className="aibrium-music-card__play"
              onClick={() => void togglePlayback()}
              disabled={!currentUrl}
              aria-label={playing ? "暂停播放" : "播放音乐"}
            >
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={() => selectRelative(1)}
              disabled={tracks.length < 2}
              aria-label="下一首"
            >
              <SkipForward aria-hidden="true" />
            </button>
            <span className="aibrium-music-card__count">
              <ListMusic aria-hidden="true" />
              {tracks.findIndex((track) => track.id === currentTrack.id) + 1} / {tracks.length}
            </span>
          </div>
        </>
      ) : (
        <div className="aibrium-music-card__empty">
          <Music2 aria-hidden="true" />
          <p>后台添加音乐后即可播放</p>
          <small>支持媒体库地址或公开的 http(s) 音频地址</small>
        </div>
      )}
      <audio ref={audioRef} preload="metadata" />
    </GlassPanel>
  );
}
