-- Balance Movement Training App — Migration (2026-10-09): mehrere manuelle Sessions pro Tag
-- In „sRPE aus der App“ können je Person und Tag beliebig viele Sessions nachgetragen werden.
--   session_no: 1, 2, 3 … je Person und Tag
--   count_app:  true  = App-Wert des Tages zählt zusätzlich zu den manuellen Sessions
--               false = manuelle Sessions ersetzen den App-Wert (bisheriges Verhalten; gilt für alle alten Einträge)

alter table public.load_manual add column if not exists session_no int not null default 1;
alter table public.load_manual add column if not exists count_app boolean not null default false;

alter table public.load_manual drop constraint if exists load_manual_person_key_entry_date_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'load_manual_person_day_session_key') then
    alter table public.load_manual add constraint load_manual_person_day_session_key unique (person_key, entry_date, session_no);
  end if;
end $$;

select count(*) as manuelle_werte,
       (select count(*) from pg_constraint where conname = 'load_manual_person_key_entry_date_key') as alte_sperre_noch_da
from public.load_manual;
