-- Run once in the Supabase SQL editor. Lets a signed-in user delete their own account + data.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.food_logs where user_id = auth.uid();
  delete from public.profiles  where id = auth.uid();
  delete from auth.users       where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Deletes all of the user's logs + profile but keeps the sign-in (used by "Delete All Data").
create or replace function public.delete_my_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.food_logs where user_id = auth.uid();
  delete from public.profiles  where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
