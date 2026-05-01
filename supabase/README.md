# Supabase Setup

1. Open your Supabase project.
2. Go to SQL Editor.
3. Run `schema.sql`.
4. Open `supabase-config.js`.
5. Replace `YOUR_SUPABASE_ANON_KEY` with the Project Settings > API anon public key.
6. Sign in with the seeded admin account:
   - Email: `admin@example.com`
   - Password: `ChangeMe123!`
7. Create the four workflow users from Admin > Users:
   - Customer Relations Specialist: `crs`
   - Membership Recruitment and Development Specialist: `membership_specialist`
   - Finance and Accounting Head: `finance_head`
   - Savings and Credit Head: `savings_credit_head`

Workflow status chain:
`Pending` means for MRD verification, `Under Review` means for Finance and Accounting review, and `Forwarded` means for final Savings and Credit Head approval.

This static compatibility build keeps passwords in `public.users` to match the existing app. Before production use, move accounts to Supabase Auth and add row-level security policies.
