/* =============================================================================
   Subscriptions & renewals: recurring items (cloud users, AMC / support,
   hosting) billed every month / quarter / year.
   - end_date is the date the customer has paid up to. A renewal invoice covers
     end_date + 1 .. end_date + one cycle; issuing it moves end_date forward.
   - Status is ACTIVE or CANCELLED; "renewal due" (end within 30 days) and
     "expired" (end_date passed, not renewed) are worked out from end_date.
   - The API drafts the renewal invoice and a follow-up 30 days ahead; it never
     messages the customer by itself.
   Safe to re-run.
   ============================================================================= */
USE istreams_crm;
GO

SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.wsm_subscriptions', 'U') IS NULL
CREATE TABLE dbo.wsm_subscriptions (
    subscription_id  INT IDENTITY(1,1) PRIMARY KEY,
    company_id       INT            NOT NULL REFERENCES dbo.wsm_companies(company_id),
    lead_id          INT            NOT NULL REFERENCES dbo.wsm_leads(lead_id) ON DELETE CASCADE,
    quotation_id     INT            NULL REFERENCES dbo.wsm_quotations(quotation_id),
    product_id       INT            NULL REFERENCES dbo.wsm_products(product_id),
    description      NVARCHAR(500)  NOT NULL,
    unit             VARCHAR(15)    NULL,
    quantity         DECIMAL(12,2)  NOT NULL,
    unit_price       DECIMAL(18,2)  NOT NULL,                  -- per unit per billing cycle, before VAT
    discount_pct     DECIMAL(5,2)   NOT NULL DEFAULT 0,
    vat_pct          DECIMAL(5,2)   NOT NULL DEFAULT 5,
    billing_cycle    VARCHAR(10)    NOT NULL,                  -- MONTHLY / QUARTERLY / YEARLY
    start_date       DATE           NOT NULL,
    end_date         DATE           NOT NULL,                  -- paid up to (inclusive)
    auto_renew       CHAR(1)        NOT NULL DEFAULT 'T',      -- T = draft the renewal invoice automatically
    status           VARCHAR(10)    NOT NULL DEFAULT 'ACTIVE', -- ACTIVE / CANCELLED
    cancelled_at     DATETIME2      NULL,
    cancel_reason    NVARCHAR(500)  NULL,
    notes            NVARCHAR(1000) NULL,
    created_by       INT            NULL REFERENCES dbo.wsm_users(user_id),
    created_at       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_subscriptions_due')
    CREATE INDEX IX_wsm_subscriptions_due ON dbo.wsm_subscriptions(company_id, status, end_date);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_subscriptions_lead')
    CREATE INDEX IX_wsm_subscriptions_lead ON dbo.wsm_subscriptions(lead_id);
GO

-- A renewal invoice knows which subscription and which period it bills.
IF COL_LENGTH('dbo.wsm_invoices', 'subscription_id') IS NULL
    ALTER TABLE dbo.wsm_invoices ADD subscription_id INT NULL REFERENCES dbo.wsm_subscriptions(subscription_id);
IF COL_LENGTH('dbo.wsm_invoices', 'period_start') IS NULL
    ALTER TABLE dbo.wsm_invoices ADD period_start DATE NULL;
IF COL_LENGTH('dbo.wsm_invoices', 'period_end') IS NULL
    ALTER TABLE dbo.wsm_invoices ADD period_end DATE NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_invoices_subscription')
    CREATE INDEX IX_wsm_invoices_subscription ON dbo.wsm_invoices(subscription_id);
GO

PRINT 'Subscriptions ready.';
GO
