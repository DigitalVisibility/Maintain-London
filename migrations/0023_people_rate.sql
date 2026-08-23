-- Optional hourly rate per person, so worked hours can be costed.
-- Only ever shown to people with the financials (view_costs) capability.
ALTER TABLE people ADD COLUMN default_rate REAL;
