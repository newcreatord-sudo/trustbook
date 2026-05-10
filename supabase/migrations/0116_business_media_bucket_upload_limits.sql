-- Enforcement lato Storage per logo/galleria pubblici (`business-media`).
-- Allineato a src/lib/storage.ts: MIME JPEG/PNG/WebP/GIF; peso massimo = tetto galleria (12 MiB).
-- Il logo resta limitato a 5 MiB solo nel client; bypass API può caricare fino a questo tetto bucket.

update storage.buckets
set
  file_size_limit = 12582912,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'business-media';
