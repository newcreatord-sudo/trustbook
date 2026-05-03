insert into storage.buckets (id, name, public)
values ('business-media', 'business-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists business_media_public_read on storage.objects;
create policy business_media_public_read on storage.objects
for select
to public
using (bucket_id = 'business-media');

drop policy if exists business_media_member_insert on storage.objects;
create policy business_media_member_insert on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-media'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_business_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists business_media_member_update on storage.objects;
create policy business_media_member_update on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-media'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_business_member(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'business-media'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_business_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists business_media_member_delete on storage.objects;
create policy business_media_member_delete on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-media'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_business_member(((storage.foldername(name))[1])::uuid)
);

