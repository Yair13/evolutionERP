-- Variantes de imagen (xs/sm/md/lg) generadas al subir con sharp

ALTER TABLE product_images
  ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '{}'::jsonb;
