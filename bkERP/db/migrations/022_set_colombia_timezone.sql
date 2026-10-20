-- Configurar la zona horaria predeterminada de la base de datos a Colombia (America/Bogota)
-- Esto garantiza que now(), CURRENT_DATE, timestamptz::date y cálculos de día tomen UTC-5.
ALTER DATABASE evolution_erp SET timezone TO 'America/Bogota';
