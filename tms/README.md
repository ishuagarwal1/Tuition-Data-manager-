# Tuition Manager (React + Vite + Tailwind + Supabase)
## Setup
1. Create a Supabase project; run `supabase/schema.sql` in the SQL Editor.
2. Copy `.env.example` to `.env`, add your Project URL and **anon** key (never the service-role key).
3. `npm install && npm run dev`
4. First teacher: Auth > Users > add user; then in SQL Editor:
   insert into tuition_centres(name) values ('My Centre') returning id;
   insert into profiles(id, centre_id, role, full_name) values ('<auth user id>','<centre id>','teacher','Teacher');
5. Parent accounts: create Auth user, insert a `profiles` row (role 'parent', same centre_id), then set `parents.user_id` to that user id for the parent record. Parents then see only linked children (RLS).
6. Optional: add classes in the `classes` table (Settings UI not built yet).
## Deploy
Push to GitHub, import in Vercel, add the two env vars, deploy.
## Built / not built
Built: login + reset, role routing, dashboard + chart, students (add/edit/archive/search/filter/paging/photo), fee generation, partial payments, PDF receipts, parent portal.
Not built yet: attendance, academics, announcements UI, reports/Excel, settings UI, parent account creation UI.
