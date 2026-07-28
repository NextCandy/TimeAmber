import postgres from "postgres";

let database: ReturnType<typeof postgres> | undefined;

/**
 * 共享的 Postgres 连接（懒加载单例）。
 * state.functions.ts 里有一份自用的同名实现，这里不去动它，
 * 新模块统一走这个入口，避免每加一个 functions 文件就复制一次连接配置。
 */
export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  database ??= postgres(url, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return database;
}
