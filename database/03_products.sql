/* =============================================================================
   Products & price list: the software, subscriptions and services a software
   company sells (licenses, cloud plans, implementation, customization, AMC...).
   Safe to re-run.
   ============================================================================= */
USE istreams_crm;
GO

SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.wsm_products', 'U') IS NULL
CREATE TABLE dbo.wsm_products (
    product_id     INT IDENTITY(1,1) PRIMARY KEY,
    company_id     INT            NOT NULL REFERENCES dbo.wsm_companies(company_id),
    product_code   NVARCHAR(30)   NOT NULL,                  -- e.g. ERP-LIC, CRM-CLOUD
    product_name   NVARCHAR(200)  NOT NULL,
    category       NVARCHAR(50)   NOT NULL,                  -- the software family: ERP / HRMS / CRM / POS / ...
    item_type      VARCHAR(15)    NOT NULL,                  -- LICENSE / SUBSCRIPTION / IMPLEMENTATION / CUSTOMIZATION / AMC / TRAINING / HARDWARE / OTHER
    unit           VARCHAR(15)    NOT NULL,                  -- PER_LICENSE / PER_USER / PER_USER_MONTH / PER_USER_YEAR / PER_MONTH / PER_YEAR / PER_HOUR / PER_DAY / FIXED
    price          DECIMAL(18,2)  NOT NULL,                  -- AED, before VAT
    vat_pct        DECIMAL(5,2)   NOT NULL DEFAULT 5,
    description    NVARCHAR(2000) NULL,
    is_active      CHAR(1)        NOT NULL DEFAULT 'T',
    created_at     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UX_wsm_products_code UNIQUE (company_id, product_code)
);
GO

PRINT 'Products ready.';
GO
