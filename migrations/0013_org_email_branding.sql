-- How persistent message notifications should be. The default is "once": you're
-- told a thread has something new, and not told again until you've looked at it.
-- A business that would rather be chased can switch to 'chase'.
--   once  — one email per unread streak; reading the thread re-arms it
--   chase — keep reminding while messages keep arriving, max one per 30 minutes
ALTER TABLE organisations ADD COLUMN message_notify TEXT NOT NULL DEFAULT 'once';

-- Backfill a sensible sender name for existing businesses.
UPDATE organisations SET email_from = NULL WHERE email_from = '';
