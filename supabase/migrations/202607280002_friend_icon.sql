-- 友链自定义图标。
-- 原来只能靠 Google favicon 服务推导（国内访问不稳，且拿不到高清 logo），
-- 加一列存后台填的图标地址，为空时仍回退到 favicon 服务、再回退到首字母。

alter table public.friends
  add column if not exists icon text;

comment on column public.friends.icon is '友链图标地址，为空时回退到站点 favicon';
