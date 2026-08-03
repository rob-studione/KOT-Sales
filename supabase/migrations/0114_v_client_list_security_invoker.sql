-- Security Advisor lint 0010_security_definer_view:
-- public.v_client_list_from_invoices currently runs as SECURITY DEFINER (view owner),
-- bypassing RLS on public.invoices. Switch to security_invoker so the caller's
-- privileges and RLS apply. Definition and grants are left unchanged.
--
-- Underlying table: public.invoices (RLS on; authenticated SELECT via
-- invoices_select_authenticated). CRM SSR uses authenticated session.

begin;

alter view public.v_client_list_from_invoices
set (security_invoker = true);

commit;
