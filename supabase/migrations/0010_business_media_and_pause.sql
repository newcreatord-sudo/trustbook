alter table public.businesses
add column if not exists logo_url text;

alter table public.businesses
add column if not exists gallery_urls text[] not null default array[]::text[];

alter table public.businesses
add column if not exists is_paused boolean not null default false;

