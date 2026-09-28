/* =============================================================================
   Leads: a sales opportunity for one contact / account (which products, how many
   users, cloud or on-premise, budget, decision date), worked by one staff member
   through the pipeline New -> Demo -> Quotation -> Negotiation -> Won / Lost,
   with a timeline of activities and scheduled follow-ups.
   - Assigning a lead also assigns its contact, so the agent can chat / email.
   Safe to re-run.
   ============================================================================= */
USE istreams_crm;
GO

SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.wsm_leads', 'U') IS NULL
CREATE TABLE dbo.wsm_leads (
    lead_id            INT IDENTITY(1,1) PRIMARY KEY,
    company_id         INT            NOT NULL REFERENCES dbo.wsm_companies(company_id),
    lead_seq           INT            NOT NULL,                  -- shown as LD-00001, numbered per company
    customer_id        INT            NOT NULL REFERENCES dbo.wsm_customers(customer_id) ON DELETE CASCADE,
    title              NVARCHAR(200)  NULL,                      -- e.g. "ERP for 25 users"
    source             VARCHAR(20)    NOT NULL,                  -- WHATSAPP / EMAIL / WEBSITE / REFERRAL / LINKEDIN / ...
    users_count        INT            NULL,
    deployment         VARCHAR(10)    NULL,                      -- CLOUD / ON_PREMISE / ANY
    current_system     NVARCHAR(150)  NULL,                      -- what they use today (Tally, Excel, SAP B1...)
    budget             DECIMAL(18,2)  NULL,                      -- AED
    decision_date      DATE           NULL,
    decision_maker     NVARCHAR(150)  NULL,
    requirements       NVARCHAR(2000) NULL,
    expected_value     DECIMAL(18,2)  NULL,                      -- AED, estimated deal size
    status             VARCHAR(20)    NOT NULL DEFAULT 'NEW',
    priority           VARCHAR(5)     NOT NULL DEFAULT 'WARM',   -- HOT / WARM / COLD
    lost_reason        VARCHAR(20)    NULL,
    deal_value         DECIMAL(18,2)  NULL,                      -- AED, final value when won
    closed_at          DATETIME2      NULL,
    assigned_to        INT            NULL REFERENCES dbo.wsm_users(user_id),
    assigned_at        DATETIME2      NULL,
    created_by         INT            NULL REFERENCES dbo.wsm_users(user_id),
    created_at         DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at         DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UX_wsm_leads_seq UNIQUE (company_id, lead_seq)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_leads_company')
    CREATE INDEX IX_wsm_leads_company ON dbo.wsm_leads(company_id, status, assigned_to);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_leads_customer')
    CREATE INDEX IX_wsm_leads_customer ON dbo.wsm_leads(customer_id);
GO

-- Products the lead is interested in.
IF OBJECT_ID('dbo.wsm_lead_products', 'U') IS NULL
CREATE TABLE dbo.wsm_lead_products (
    lead_id      INT NOT NULL REFERENCES dbo.wsm_leads(lead_id) ON DELETE CASCADE,
    product_id   INT NOT NULL REFERENCES dbo.wsm_products(product_id),
    CONSTRAINT PK_wsm_lead_products PRIMARY KEY (lead_id, product_id)
);
GO

IF OBJECT_ID('dbo.wsm_lead_activities', 'U') IS NULL
CREATE TABLE dbo.wsm_lead_activities (
    activity_id    INT IDENTITY(1,1) PRIMARY KEY,
    company_id     INT            NOT NULL REFERENCES dbo.wsm_companies(company_id),
    lead_id        INT            NOT NULL REFERENCES dbo.wsm_leads(lead_id) ON DELETE CASCADE,
    activity_type  VARCHAR(10)    NOT NULL,                  -- NOTE / CALL / MEETING / DEMO / STATUS / ASSIGN / CREATED
    body           NVARCHAR(2000) NULL,
    outcome        VARCHAR(20)    NULL,                      -- calls: ANSWERED / NO_ANSWER / BUSY / SWITCHED_OFF / WRONG_NUMBER
    status_from    VARCHAR(20)    NULL,
    status_to      VARCHAR(20)    NULL,
    created_by     INT            NULL REFERENCES dbo.wsm_users(user_id),
    created_at     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_lead_activities_lead')
    CREATE INDEX IX_wsm_lead_activities_lead ON dbo.wsm_lead_activities(lead_id, created_at);
GO

IF OBJECT_ID('dbo.wsm_follow_ups', 'U') IS NULL
CREATE TABLE dbo.wsm_follow_ups (
    follow_up_id   INT IDENTITY(1,1) PRIMARY KEY,
    company_id     INT            NOT NULL REFERENCES dbo.wsm_companies(company_id),
    lead_id        INT            NOT NULL REFERENCES dbo.wsm_leads(lead_id) ON DELETE CASCADE,
    follow_up_type VARCHAR(10)    NOT NULL,                  -- CALL / WHATSAPP / EMAIL / MEETING / DEMO
    due_at         DATETIME2      NOT NULL,                  -- UTC
    notes          NVARCHAR(1000) NULL,
    assigned_to    INT            NULL REFERENCES dbo.wsm_users(user_id),
    is_done        CHAR(1)        NOT NULL DEFAULT 'F',
    done_at        DATETIME2      NULL,
    done_by        INT            NULL REFERENCES dbo.wsm_users(user_id),
    created_by     INT            NULL REFERENCES dbo.wsm_users(user_id),
    created_at     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_follow_ups_due')
    CREATE INDEX IX_wsm_follow_ups_due ON dbo.wsm_follow_ups(company_id, is_done, due_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_follow_ups_lead')
    CREATE INDEX IX_wsm_follow_ups_lead ON dbo.wsm_follow_ups(lead_id);
GO

PRINT 'Leads ready.';
GO
