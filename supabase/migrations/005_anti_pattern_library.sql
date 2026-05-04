create table if not exists anti_pattern_library (
  id          uuid primary key default gen_random_uuid(),
  category    text not null check (category in ('visual','copy','behavioral','neuroscience')),
  rule_text   text not null,
  confidence  numeric(3,2) not null default 0.5,
  loser_count integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists anti_pattern_library_loser_count_idx on anti_pattern_library(loser_count desc);
