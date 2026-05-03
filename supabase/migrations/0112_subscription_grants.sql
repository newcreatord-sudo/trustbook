grant select on public.platform_settings to anon, authenticated;
grant select on public.subscription_plans to anon, authenticated;

grant select on public.business_subscriptions to authenticated;
grant select on public.customer_subscriptions to authenticated;

grant select, insert on public.subscription_change_requests to authenticated;
grant select on public.subscription_change_request_events to authenticated;

