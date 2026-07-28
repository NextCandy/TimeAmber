-- 首页订阅表。
-- 前台通过 server fn 以服务端连接写入（绕过 PostgREST），
-- 这里开启 RLS 且不建任何 policy：anon / authenticated 一律读不到订阅者邮箱。

create table if not exists public.subscribers (
  id bigserial primary key,
  email text not null,
  source text,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

-- 大小写不敏感去重：Foo@x.com 与 foo@x.com 视为同一个订阅者。
create unique index if not exists subscribers_email_lower_key
  on public.subscribers (lower(email));

alter table public.subscribers enable row level security;

comment on table public.subscribers is '首页邮件订阅者，仅服务端可读写';
