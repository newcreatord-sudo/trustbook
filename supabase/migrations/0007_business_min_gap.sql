alter table public.businesses
add column if not exists min_gap_min int not null default 0;

alter table public.businesses
drop constraint if exists businesses_min_gap_min_nonneg;

alter table public.businesses
add constraint businesses_min_gap_min_nonneg check (min_gap_min >= 0);

