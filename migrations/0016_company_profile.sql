-- Company profile — the details a proper VAT invoice and receipt need to carry.
-- Without these an invoice looks like a printout, not a document a client (or
-- their accountant) can act on: it needs the trading address, the VAT number,
-- who to pay and by when.

ALTER TABLE organisations ADD COLUMN company_address TEXT;   -- multi-line trading address
ALTER TABLE organisations ADD COLUMN vat_number TEXT;        -- e.g. GB123456789 (blank if not VAT-registered)
ALTER TABLE organisations ADD COLUMN company_number TEXT;    -- Companies House number
ALTER TABLE organisations ADD COLUMN company_phone TEXT;
ALTER TABLE organisations ADD COLUMN company_email TEXT;     -- public contact address shown on invoices
ALTER TABLE organisations ADD COLUMN bank_details TEXT;      -- free text: account name / sort code / account no
ALTER TABLE organisations ADD COLUMN invoice_terms TEXT;     -- e.g. "Payment due within 14 days of the invoice date"
