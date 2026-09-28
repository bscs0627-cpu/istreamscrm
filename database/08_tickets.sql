/* =============================================================================
   Support tickets and change requests.
   - One table for both: ticket_type SUPPORT (bug, how-to, data fix...) or
     CHANGE (a modification the customer asks for, estimated in hours and
     quoted before work starts).
   - Number TK-<year>-<seq:0000>, given on create.
   - due_at is the resolve-by time from the priority (SLA); first_response_at
     is the first reply sent to the customer.
   - lead_id / quotation_id point to the lead and quotation made for a change
     request. They are plain columns (no foreign key) so deleting a lead or a
     draft quotation never has to touch tickets.
   - wsm_ticket_comments is the thread: internal notes, replies sent to the
     customer (email / WhatsApp), customer messages logged by staff, and
     status changes.
   Safe to re-run.
   ============================================================================= */
USE istreams_crm;
GO

SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.wsm_tickets', 'U') IS NULL
CREATE TABLE dbo.wsm_tickets (
    ticket_id          INT IDENTITY(1,1) PRIMARY KEY,
    company_id         INT            NOT NULL REFERENCES dbo.wsm_companies(company_id),
    tk_year            INT            NOT NULL,
    tk_seq             INT            NOT NULL,
    ticket_type        VARCHAR(10)    NOT NULL DEFAULT 'SUPPORT',  -- SUPPORT / CHANGE
    customer_id        INT            NOT NULL REFERENCES dbo.wsm_customers(customer_id) ON DELETE CASCADE,
    product_id         INT            NULL,
    subject            NVARCHAR(200)  NOT NULL,
    description        NVARCHAR(MAX)  NULL,
    category           VARCHAR(20)    NOT NULL DEFAULT 'OTHER',
    priority           VARCHAR(10)    NOT NULL DEFAULT 'MEDIUM',   -- LOW / MEDIUM / HIGH / URGENT
    status             VARCHAR(15)    NOT NULL DEFAULT 'OPEN',
    channel            VARCHAR(10)    NOT NULL DEFAULT 'PHONE',    -- WHATSAPP / EMAIL / PHONE / OTHER
    assigned_to        INT            NULL REFERENCES dbo.wsm_users(user_id),
    due_at             DATETIME2      NOT NULL,
    first_response_at  DATETIME2      NULL,
    resolved_at        DATETIME2      NULL,
    closed_at          DATETIME2      NULL,
    estimated_hours    DECIMAL(10,2)  NULL,                        -- change requests
    hourly_rate        DECIMAL(18,2)  NULL,
    lead_id            INT            NULL,
    quotation_id       INT            NULL,
    created_by         INT            NULL REFERENCES dbo.wsm_users(user_id),
    created_at         DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at         DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_wsm_tickets_no')
    CREATE UNIQUE INDEX UX_wsm_tickets_no ON dbo.wsm_tickets(company_id, tk_year, tk_seq);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_tickets_status')
    CREATE INDEX IX_wsm_tickets_status ON dbo.wsm_tickets(company_id, status, due_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_tickets_customer')
    CREATE INDEX IX_wsm_tickets_customer ON dbo.wsm_tickets(customer_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_tickets_lead')
    CREATE INDEX IX_wsm_tickets_lead ON dbo.wsm_tickets(lead_id) WHERE lead_id IS NOT NULL;
GO

IF OBJECT_ID('dbo.wsm_ticket_comments', 'U') IS NULL
CREATE TABLE dbo.wsm_ticket_comments (
    comment_id    INT IDENTITY(1,1) PRIMARY KEY,
    ticket_id     INT            NOT NULL REFERENCES dbo.wsm_tickets(ticket_id) ON DELETE CASCADE,
    kind          VARCHAR(10)    NOT NULL,       -- NOTE / REPLY / CUSTOMER / STATUS
    channel       VARCHAR(10)    NULL,           -- REPLY: EMAIL / WHATSAPP
    body          NVARCHAR(MAX)  NOT NULL,
    created_by    INT            NULL REFERENCES dbo.wsm_users(user_id),
    created_at    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_ticket_comments_ticket')
    CREATE INDEX IX_wsm_ticket_comments_ticket ON dbo.wsm_ticket_comments(ticket_id, comment_id);
GO

PRINT 'Tickets ready.';
