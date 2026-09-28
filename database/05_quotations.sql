/* =============================================================================
   Quotations: numbered QT-2026-0001, built from the price list, with discount,
   5% VAT, revisions (R1, R2...) during negotiation, admin approval for big
   discounts, and a PDF sent by email / WhatsApp.
   - wsm_company_profile: the seller's details printed on quotations (and later
     invoices): legal name, TRN, address, bank, logo, default terms.
   - Each revision is its own row sharing quote_year + quote_seq; the one it
     replaced gets status REVISED.
   Safe to re-run.
   ============================================================================= */
USE istreams_crm;
GO

SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.wsm_company_profile', 'U') IS NULL
CREATE TABLE dbo.wsm_company_profile (
    company_id            INT             NOT NULL PRIMARY KEY REFERENCES dbo.wsm_companies(company_id),
    legal_name            NVARCHAR(200)   NULL,
    trn                   NVARCHAR(20)    NULL,
    address               NVARCHAR(500)   NULL,
    phone                 NVARCHAR(50)    NULL,
    email                 NVARCHAR(150)   NULL,
    website               NVARCHAR(200)   NULL,
    bank_name             NVARCHAR(150)   NULL,
    bank_account_name     NVARCHAR(200)   NULL,
    bank_account_no       NVARCHAR(50)    NULL,
    iban                  NVARCHAR(50)    NULL,
    swift                 NVARCHAR(20)    NULL,
    logo                  VARBINARY(MAX)  NULL,
    logo_content_type     NVARCHAR(50)    NULL,
    quote_validity_days   INT             NOT NULL DEFAULT 30,
    max_discount_pct      DECIMAL(5,2)    NOT NULL DEFAULT 10,   -- above this, a quotation needs admin approval
    quote_payment_terms   NVARCHAR(1000)  NULL,
    quote_terms           NVARCHAR(MAX)   NULL,
    updated_at            DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.wsm_quotations', 'U') IS NULL
CREATE TABLE dbo.wsm_quotations (
    quotation_id     INT IDENTITY(1,1) PRIMARY KEY,
    company_id       INT            NOT NULL REFERENCES dbo.wsm_companies(company_id),
    quote_year       INT            NOT NULL,
    quote_seq        INT            NOT NULL,                   -- QT-<year>-<seq:0000>
    revision         INT            NOT NULL DEFAULT 0,         -- 0 = original, 1 = R1 ...
    lead_id          INT            NOT NULL REFERENCES dbo.wsm_leads(lead_id) ON DELETE CASCADE,
    subject          NVARCHAR(200)  NULL,
    quote_date       DATE           NOT NULL,
    valid_until      DATE           NOT NULL,
    status           VARCHAR(10)    NOT NULL DEFAULT 'DRAFT',   -- DRAFT / SENT / ACCEPTED / REJECTED / REVISED
    subtotal         DECIMAL(18,2)  NOT NULL DEFAULT 0,         -- sum of qty x price
    discount_total   DECIMAL(18,2)  NOT NULL DEFAULT 0,
    vat_total        DECIMAL(18,2)  NOT NULL DEFAULT 0,
    grand_total      DECIMAL(18,2)  NOT NULL DEFAULT 0,
    max_line_discount DECIMAL(5,2)  NOT NULL DEFAULT 0,
    payment_terms    NVARCHAR(1000) NULL,
    terms            NVARCHAR(MAX)  NULL,
    notes            NVARCHAR(2000) NULL,                       -- internal, not printed
    approval_status  VARCHAR(10)    NOT NULL DEFAULT 'NONE',    -- NONE / PENDING / APPROVED
    approved_by      INT            NULL REFERENCES dbo.wsm_users(user_id),
    approved_at      DATETIME2      NULL,
    sent_at          DATETIME2      NULL,
    closed_at        DATETIME2      NULL,                       -- accepted / rejected
    reject_reason    NVARCHAR(500)  NULL,
    created_by       INT            NULL REFERENCES dbo.wsm_users(user_id),
    created_at       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UX_wsm_quotations_no UNIQUE (company_id, quote_year, quote_seq, revision)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_quotations_lead')
    CREATE INDEX IX_wsm_quotations_lead ON dbo.wsm_quotations(lead_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_quotations_status')
    CREATE INDEX IX_wsm_quotations_status ON dbo.wsm_quotations(company_id, status);
GO

IF OBJECT_ID('dbo.wsm_quotation_lines', 'U') IS NULL
CREATE TABLE dbo.wsm_quotation_lines (
    line_id        INT IDENTITY(1,1) PRIMARY KEY,
    quotation_id   INT            NOT NULL REFERENCES dbo.wsm_quotations(quotation_id) ON DELETE CASCADE,
    sort_order     INT            NOT NULL,
    product_id     INT            NULL REFERENCES dbo.wsm_products(product_id),   -- NULL = free-text line
    description    NVARCHAR(1000) NOT NULL,
    unit           VARCHAR(15)    NULL,
    quantity       DECIMAL(12,2)  NOT NULL,
    unit_price     DECIMAL(18,2)  NOT NULL,
    discount_pct   DECIMAL(5,2)   NOT NULL DEFAULT 0,
    vat_pct        DECIMAL(5,2)   NOT NULL DEFAULT 5,
    net_amount     DECIMAL(18,2)  NOT NULL,                  -- qty x price - discount, before VAT
    vat_amount     DECIMAL(18,2)  NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_quotation_lines_quote')
    CREATE INDEX IX_wsm_quotation_lines_quote ON dbo.wsm_quotation_lines(quotation_id, sort_order);
GO

PRINT 'Quotations ready.';
GO
