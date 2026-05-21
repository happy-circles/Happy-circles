insert into public.analytics_event_catalog (
  event_name,
  description,
  event_family,
  event_kind,
  feature_key,
  allowed_metadata_keys,
  is_active,
  deprecated_at
)
values
  (
    'performance_app_start',
    'La app registro el inicio de carga del runtime mobile.',
    'performance',
    'lifecycle',
    'performance',
    array['durationMs', 'phase', 'startKind'],
    true,
    null
  ),
  (
    'performance_snapshot_cache_restored',
    'La app completo la restauracion local del snapshot cacheado.',
    'performance',
    'outcome',
    'performance',
    array['cacheHit', 'cacheState', 'cachedAgeMs', 'durationMs', 'networkStatus', 'snapshotVersion'],
    true,
    null
  ),
  (
    'performance_snapshot_network_resolved',
    'La app resolvio el snapshot vivo desde red.',
    'performance',
    'outcome',
    'performance',
    array['durationMs', 'networkStatus', 'snapshotVersion'],
    true,
    null
  ),
  (
    'performance_screen_ready',
    'Una pantalla quedo lista para interaccion visual.',
    'performance',
    'outcome',
    'performance',
    array['cacheState', 'durationMs', 'route', 'startKind'],
    true,
    null
  ),
  (
    'performance_background_refetch_failed',
    'Un refetch en segundo plano fallo mientras habia datos disponibles.',
    'performance',
    'outcome',
    'performance',
    array['cacheState', 'networkStatus', 'reason', 'route', 'snapshotVersion'],
    true,
    null
  )
on conflict (event_name) do update
set description = excluded.description,
    event_family = excluded.event_family,
    event_kind = excluded.event_kind,
    feature_key = excluded.feature_key,
    allowed_metadata_keys = excluded.allowed_metadata_keys,
    is_active = excluded.is_active,
    deprecated_at = excluded.deprecated_at,
    updated_at = timezone('utc', now());
