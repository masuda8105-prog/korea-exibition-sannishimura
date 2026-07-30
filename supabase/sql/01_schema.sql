-- 韓国展示会注文ツール：注文情報と名刺画像の一時保存
create extension if not exists pgcrypto;

create table if not exists public.exhibition_orders (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique,
  order_no text not null,
  order_data jsonb not null,
  business_card_original_path text,
  business_card_preview_path text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists exhibition_orders_expires_at_idx
  on public.exhibition_orders (expires_at);

alter table public.exhibition_orders enable row level security;
revoke all on table public.exhibition_orders from anon, authenticated;

-- 非公開ストレージ。閲覧はEdge Functionが発行する期限付きURLだけ。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-cards',
  'business-cards',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- anon/authenticated用のStorageポリシーは作成しません。
-- Edge Functionのservice_roleだけが読み書きします。
