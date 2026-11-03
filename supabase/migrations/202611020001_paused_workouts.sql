-- Switching training styles preserves unfinished workouts without consuming queues.
alter table fitarc.fitarc_sessions drop constraint fitarc_sessions_status_check;
alter table fitarc.fitarc_sessions add constraint fitarc_sessions_status_check
  check (status in ('proposed','active','paused','committed'));
drop index fitarc.fitarc_one_open_session;
create unique index fitarc_one_open_session on fitarc.fitarc_sessions(user_id)
  where status in ('proposed','active');
