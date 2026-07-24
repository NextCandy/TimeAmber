update public.posts
set
  post_type = 'html',
  external_url = substring(content from 'url:([^ ]+)'),
  updated_at = now()
where content like '<' || chr(33) || '-- timeamber-offline-html:v1%'
  and substring(content from 'url:([^ ]+)') is not null;
