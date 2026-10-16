# Base de datos (Supabase)

Las migraciones viven en `supabase/migrations/` con el formato de la CLI de Supabase
(`<timestamp>_<nombre>.sql`) y se aplican en orden. Todas son idempotentes.

## Sincronizar con la base real (una sola vez)

```bash
npx supabase login
npx supabase init            # genera supabase/config.toml (no sobrescribe migrations/)
npx supabase link --project-ref <ref-del-proyecto>
npx supabase migration repair --status applied 20261001000000 20261002000000 20261014000100 20261014000200 20261014000300 20261014000700 20261014001000 20261015000300
npx supabase db diff         # debe quedar vacío; si no, revisar diferencias
```

## Flujo diario

```bash
npx supabase migration new <nombre>   # crea un archivo nuevo en migrations/
npx supabase db push                  # aplica las migraciones pendientes
```

`seed.sql` contiene datos de ejemplo para entornos locales (`npx supabase db reset`).
