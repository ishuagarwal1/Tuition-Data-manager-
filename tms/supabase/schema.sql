-- Tuition Management System: Supabase schema (run in SQL Editor)
create extension if not exists "pgcrypto";

create table tuition_centres (
  id uuid primary key default gen_random_uuid(),
  name text not null, logo_path text, contact_number text, email text, address text,
  default_fee numeric(10,2) default 0 check (default_fee >= 0),
  fee_due_day int default 10 check (fee_due_day between 1 and 28),
  created_at timestamptz default now()
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  centre_id uuid references tuition_centres on delete cascade,
  role text not null check (role in ('teacher','parent')),
  full_name text, phone text, photo_path text,
  created_at timestamptz default now()
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references tuition_centres on delete cascade,
  name text not null, default_fee numeric(10,2) check (default_fee >= 0),
  unique (centre_id, name)
);
create table subjects (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references tuition_centres on delete cascade,
  name text not null, unique (centre_id, name)
);

create table students (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references tuition_centres on delete cascade,
  student_code text not null,
  full_name text not null, photo_path text, dob date, gender text,
  joined_on date default current_date,
  class_id uuid references classes, school_name text, batch text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  monthly_fee numeric(10,2) not null default 0 check (monthly_fee >= 0),
  fee_due_day int default 10 check (fee_due_day between 1 and 28),
  prev_performance text, special_needs text, emergency_contact text,
  medical_notes text,  -- teacher-only: exposed via view below, not to parents
  remarks text, created_at timestamptz default now(),
  unique (centre_id, student_code)
);
create index on students (centre_id, status);

create table parents (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references tuition_centres on delete cascade,
  user_id uuid unique references profiles on delete set null,
  full_name text not null, relation text, phone text, alt_phone text, email text,
  address text, city text, state text, pin_code text,
  created_at timestamptz default now()
);
create table student_parents (
  student_id uuid references students on delete cascade,
  parent_id uuid references parents on delete cascade,
  primary key (student_id, parent_id)
);
create table student_subjects (
  student_id uuid references students on delete cascade,
  subject_id uuid references subjects on delete cascade,
  primary key (student_id, subject_id)
);

create table fee_records (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references tuition_centres on delete cascade,
  student_id uuid not null references students on delete restrict,
  month int not null check (month between 1 and 12),
  year int not null check (year >= 2000),
  total_fee numeric(10,2) not null check (total_fee >= 0),
  amount_paid numeric(10,2) not null default 0 check (amount_paid >= 0),
  due_date date not null,
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid')),
  created_at timestamptz default now(),
  unique (student_id, month, year),          -- no duplicate month records
  check (amount_paid <= total_fee)
);
create index on fee_records (centre_id, year, month, status);

create table payments (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references tuition_centres on delete cascade,
  fee_record_id uuid not null references fee_records on delete restrict,
  receipt_no bigint generated always as identity,
  amount numeric(10,2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null check (method in ('cash','upi','bank_transfer','other')),
  reference_id text, remarks text,
  voided boolean not null default false, void_reason text,   -- corrections, never deletes
  created_by uuid references profiles, created_at timestamptz default now()
);
create index on payments (fee_record_id);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references tuition_centres on delete cascade,
  student_id uuid not null references students on delete cascade,
  on_date date not null,
  status text not null check (status in ('present','absent','leave')),
  unique (student_id, on_date)
);
create table academic_records (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references tuition_centres on delete cascade,
  student_id uuid not null references students on delete cascade,
  subject_id uuid references subjects,
  kind text not null check (kind in ('test','exam','assignment','remark')),
  title text, marks numeric(6,2), max_marks numeric(6,2), remark text,
  recorded_on date default current_date
);
create table announcements (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references tuition_centres on delete cascade,
  title text not null, body text, category text,
  audience text not null default 'all' check (audience in ('all','class','parents','students')),
  class_id uuid references classes, created_at timestamptz default now()
);
create table notifications (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references tuition_centres on delete cascade,
  parent_id uuid not null references parents on delete cascade,
  announcement_id uuid references announcements on delete cascade,
  title text not null, body text, read_at timestamptz,
  delivery text not null default 'in_app',  -- only 'in_app' until WhatsApp/email is configured
  created_at timestamptz default now()
);
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid, actor uuid, table_name text, row_id uuid, action text,
  old_data jsonb, new_data jsonb, created_at timestamptz default now()
);

-- ---------- helpers ----------
create function my_centre() returns uuid language sql stable security definer set search_path=public
as $$ select centre_id from profiles where id = auth.uid() $$;
create function is_teacher() returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from profiles where id = auth.uid() and role='teacher') $$;
create function my_students() returns setof uuid language sql stable security definer set search_path=public
as $$ select sp.student_id from student_parents sp join parents p on p.id=sp.parent_id where p.user_id = auth.uid() $$;
create function my_parent_ids() returns setof uuid language sql stable security definer set search_path=public
as $$ select id from parents where user_id = auth.uid() $$;

-- ---------- payment logic (atomic, row-locked) ----------
create function sync_fee_status() returns trigger language plpgsql security definer set search_path=public as $$
declare fid uuid := coalesce(new.fee_record_id, old.fee_record_id); paid numeric; tot numeric;
begin
  select total_fee into tot from fee_records where id = fid;
  select coalesce(sum(amount),0) into paid from payments where fee_record_id = fid and not voided;
  if paid > tot then raise exception 'Payment exceeds remaining balance'; end if;
  update fee_records set amount_paid = paid,
    status = case when paid = 0 then 'unpaid' when paid < tot then 'partial' else 'paid' end
  where id = fid;
  return null;
end $$;
create trigger trg_sync after insert or update on payments for each row execute function sync_fee_status();

create function record_payment(p_fee uuid, p_amount numeric, p_method text, p_date date, p_ref text, p_remarks text)
returns payments language plpgsql security definer set search_path=public as $$
declare f fee_records; r payments;
begin
  if not is_teacher() then raise exception 'Not allowed'; end if;
  select * into f from fee_records where id = p_fee and centre_id = my_centre() for update;
  if not found then raise exception 'Fee record not found'; end if;
  if p_amount > f.total_fee - f.amount_paid then raise exception 'Amount exceeds balance'; end if;
  insert into payments(centre_id, fee_record_id, amount, paid_on, method, reference_id, remarks, created_by)
  values (f.centre_id, p_fee, p_amount, p_date, p_method, p_ref, p_remarks, auth.uid()) returning * into r;
  insert into notifications(centre_id, parent_id, title, body)
    select f.centre_id, sp.parent_id, 'Payment received', 'Receipt #'||r.receipt_no||' for '||p_amount
    from student_parents sp where sp.student_id = f.student_id;
  return r;
end $$;

create function void_payment(p_id uuid, p_reason text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_teacher() then raise exception 'Not allowed'; end if;
  update payments set voided = true, void_reason = p_reason where id = p_id and centre_id = my_centre();
end $$;

-- ---------- audit ----------
create function audit() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into audit_logs(centre_id, actor, table_name, row_id, action, old_data, new_data)
  values (coalesce(new.centre_id, old.centre_id), auth.uid(), tg_table_name,
          coalesce(new.id, old.id), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;
create trigger a_students after insert or update or delete on students for each row execute function audit();
create trigger a_fees after insert or update or delete on fee_records for each row execute function audit();
create trigger a_pay after insert or update on payments for each row execute function audit();

-- ---------- RLS ----------
do $$ declare t text; begin
  foreach t in array array['tuition_centres','profiles','classes','subjects','students','parents','student_parents',
    'student_subjects','fee_records','payments','attendance','academic_records','announcements','notifications','audit_logs']
  loop execute format('alter table %I enable row level security', t); end loop; end $$;

-- teacher: full access inside own centre
do $$ declare t text; begin
  foreach t in array array['classes','subjects','students','parents','fee_records','attendance','academic_records','announcements','notifications']
  loop execute format('create policy teacher_all on %I for all using (is_teacher() and centre_id = my_centre()) with check (is_teacher() and centre_id = my_centre())', t); end loop; end $$;

create policy centre_read on tuition_centres for select using (id = my_centre());
create policy centre_teacher on tuition_centres for update using (is_teacher() and id = my_centre());
create policy self_profile on profiles for select using (id = auth.uid() or (is_teacher() and centre_id = my_centre()));
create policy self_profile_upd on profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
create policy t_sp on student_parents for all using (is_teacher() and student_id in (select id from students where centre_id = my_centre()));
create policy t_ss on student_subjects for all using (is_teacher() and student_id in (select id from students where centre_id = my_centre()));
create policy t_pay_read on payments for select using (is_teacher() and centre_id = my_centre());  -- writes only via record_payment()
create policy t_audit on audit_logs for select using (is_teacher() and centre_id = my_centre());

-- parents: read-only, own linked children only
create policy p_students on students for select using (id in (select my_students()));
create policy p_sp on student_parents for select using (student_id in (select my_students()));
create policy p_parent on parents for select using (user_id = auth.uid());
create policy p_fees on fee_records for select using (student_id in (select my_students()));
create policy p_pay on payments for select using (fee_record_id in (select id from fee_records where student_id in (select my_students())));
create policy p_att on attendance for select using (student_id in (select my_students()));
create policy p_acad on academic_records for select using (student_id in (select my_students()));
create policy p_ann on announcements for select using (centre_id = my_centre());
create policy p_notif on notifications for select using (parent_id in (select my_parent_ids()));
create policy p_notif_upd on notifications for update using (parent_id in (select my_parent_ids()));
create policy p_classes on classes for select using (centre_id = my_centre());
create policy p_subjects on subjects for select using (centre_id = my_centre());

-- Medical notes must never reach parents: revoke column access
revoke select (medical_notes) on students from authenticated;
create view students_teacher_medical with (security_invoker = true) as
  select id, medical_notes from students where is_teacher();
grant select (medical_notes) on students to service_role;

-- ---------- storage ----------
insert into storage.buckets (id, name, public) values ('student-photos','student-photos',false) on conflict do nothing;
-- object path convention: <centre_id>/<student_id>.jpg
create policy photos_teacher on storage.objects for all
  using (bucket_id='student-photos' and is_teacher() and (storage.foldername(name))[1] = my_centre()::text)
  with check (bucket_id='student-photos' and is_teacher() and (storage.foldername(name))[1] = my_centre()::text);
create policy photos_parent on storage.objects for select
  using (bucket_id='student-photos' and (storage.foldername(name))[2]::text is not null
         and split_part((storage.foldername(name))[2],'.',1)::uuid in (select my_students()));
