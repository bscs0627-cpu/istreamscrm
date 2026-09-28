/* =============================================================================
   Tax invoices and payments.
   - Invoices come from an accepted quotation (full, or a percentage such as a
     50% advance) and can be edited while DRAFT.
   - The number INV-<year>-<seq:0000> is given only when the invoice is ISSUED,
     so deleted drafts leave no gap in the tax-invoice sequence.
   - On issue the buyer's name / TRN / address are copied onto the invoice, so
     later edits to the company record never change an issued invoice.
   - Issued invoices are never edited; a mistake is fixed by CANCELLED + a new one.
   - Payment status (unpaid / partly paid / paid / overdue) comes from
     amount_paid (sum of wsm_payments) against grand_total and the due date.
   Safe to re-run.
   ============================================================================= */
USE istreams_crm;
GO

SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('dbo.wsm_company_profile', 'invoice_due_days') IS NULL
    ALTER TABLE dbo.wsm_company_profile ADD invoice_due_days INT NOT NULL CONSTRAINT DF_wsm_company_profile_due DEFAULT 30;
IF COL_LENGTH('dbo.wsm_company_profile', 'invoice_terms') IS NULL
    ALTER TABLE dbo.wsm_company_profile ADD invoice_terms NVARCHAR(MAX) NULL;
GO

IF OBJECT_ID('dbo.wsm_invoices', 'U') IS NULL
CREATE TABLE dbo.wsm_invoices (
    invoice_id       INT IDENTITY(1,1) PRIMARY KEY,
    company_id       INT            NOT NULL REFERENCES dbo.wsm_companies(company_id),
    inv_year         INT            NULL,                       -- set on issue
    inv_seq          INT            NULL,                       -- set on issue: INV-<year>-<seq:0000>
    quotation_id     INT            NULL REFERENCES dbo.wsm_quotations(quotation_id),
    lead_id          INT            NOT NULL REFERENCES dbo.wsm_leads(lead_id) ON DELETE CASCADE,
    stage            NVARCHAR(100)  NULL,                       -- e.g. "Advance 50%", "Final"
    invoice_date     DATE           NOT NULL,
    due_date         DATE           NOT NULL,
    status           VARCHAR(10)    NOT NULL DEFAULT 'DRAFT',   -- DRAFT / ISSUED / CANCELLED
    bill_to_name     NVARCHAR(200)  NULL,                       -- copied on issue
    bill_to_trn      NVARCHAR(20)   NULL,
    bill_to_address  NVARCHAR(700)  NULL,
    subtotal         DECIMAL(18,2)  NOT NULL DEFAULT 0,
    discount_total   DECIMAL(18,2)  NOT NULL DEFAULT 0,
    vat_total        DECIMAL(18,2)  NOT NULL DEFAULT 0,
    grand_total      DECIMAL(18,2)  NOT NULL DEFAULT 0,
    amount_paid      DECIMAL(18,2)  NOT NULL DEFAULT 0,
    terms            NVARCHAR(MAX)  NULL,
    notes            NVARCHAR(2000) NULL,                       -- internal, not printed
    issued_at        DATETIME2      NULL,
    sent_at          DATETIME2      NULL,
    cancelled_at     DATETIME2      NULL,
    cancel_reason    NVARCHAR(500)  NULL,
    created_by       INT            NULL REFERENCES dbo.wsm_users(user_id),
    created_at       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_wsm_invoices_no')
    CREATE UNIQUE INDEX UX_wsm_invoices_no ON dbo.wsm_invoices(company_id, inv_year, inv_seq) WHERE inv_seq IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_invoices_status')
    CREATE INDEX IX_wsm_invoices_status ON dbo.wsm_invoices(company_id, status, due_date);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_invoices_quote')
    CREATE INDEX IX_wsm_invoices_quote ON dbo.wsm_invoices(quotation_id);
GO

IF OBJECT_ID('dbo.wsm_invoice_lines', 'U') IS NULL
CREATE TABLE dbo.wsm_invoice_lines (
    line_id        INT IDENTITY(1,1) PRIMARY KEY,
    invoice_id     INT            NOT NULL REFERENCES dbo.wsm_invoices(invoice_id) ON DELETE CASCADE,
    sort_order     INT            NOT NULL,
    product_id     INT            NULL REFERENCES dbo.wsm_products(product_id),
    description    NVARCHAR(1000) NOT NULL,
    unit           VARCHAR(15)    NULL,
    quantity       DECIMAL(12,2)  NOT NULL,
    unit_price     DECIMAL(18,2)  NOT NULL,
    discount_pct   DECIMAL(5,2)   NOT NULL DEFAULT 0,
    vat_pct        DECIMAL(5,2)   NOT NULL DEFAULT 5,
    net_amount     DECIMAL(18,2)  NOT NULL,
    vat_amount     DECIMAL(18,2)  NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_invoice_lines_invoice')
    CREATE INDEX IX_wsm_invoice_lines_invoice ON dbo.wsm_invoice_lines(invoice_id, sort_order);
GO

IF OBJECT_ID('dbo.wsm_payments', 'U') IS NULL
CREATE TABLE dbo.wsm_payments (
    payment_id     INT IDENTITY(1,1) PRIMARY KEY,
    company_id     INT            NOT NULL REFERENCES dbo.wsm_companies(company_id),
    invoice_id     INT            NOT NULL REFERENCES dbo.wsm_invoices(invoice_id) ON DELETE CASCADE,
    payment_date   DATE           NOT NULL,
    amount         DECIMAL(18,2)  NOT NULL,
    method         VARCHAR(15)    NOT NULL,                  -- BANK_TRANSFER / CHEQUE / CASH / CARD / ONLINE
    reference      NVARCHAR(100)  NULL,                      -- cheque no, transfer ref...
    notes          NVARCHAR(500)  NULL,
    created_by     INT            NULL REFERENCES dbo.wsm_users(user_id),
    created_at     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_payments_invoice')
    CREATE INDEX IX_wsm_payments_invoice ON dbo.wsm_payments(invoice_id);
GO

PRINT 'Invoices ready.';
GO
