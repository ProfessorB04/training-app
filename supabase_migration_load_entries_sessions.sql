-- Balance Movement Training App — Migration (2026-10-09): mehrere Session-RPE-Einträge pro Tag
-- Bisher: ein Eintrag je Person und Tag (unique user_id+entry_date; neue Eingabe überschrieb den Tag).
-- Neu: jede Session ist eine eigene Zeile (Formular „Session-RPE“, Trainingsplan, Conditioning).
-- Alle Auswertungen summieren je Tag. Bestehende Einträge bleiben unverändert.

do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.load_entries'::regclass and con.contype = 'u'
  loop
    execute format('alter table public.load_entries drop constraint %I', c.conname);
  end loop;
end $$;

create index if not exists load_entries_user_date on public.load_entries(user_id, entry_date);

select count(*) as eintraege,
       (select count(*) from pg_constraint where conrelid = 'public.load_entries'::regclass and contype = 'u') as eindeutigkeit_noch_da
from public.load_entries;
