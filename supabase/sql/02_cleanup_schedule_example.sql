-- 任意：Supabase Cronで毎日、cleanup-orders Edge Functionを呼び出す例です。
-- PROJECT_REF、ANON_KEY、CLEANUP_SECRETを書き換えてから実行してください。
-- 本番では秘密値をSupabase Vaultへ保存する運用を推奨します。

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'cleanup-expired-exhibition-orders',
  '15 18 * * *', -- UTC 18:15 = 日本時間 翌日03:15
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/cleanup-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', 'CLEANUP_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
