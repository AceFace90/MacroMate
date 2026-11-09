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
