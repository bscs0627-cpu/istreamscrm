/* Product form fields (supplier ref, margin, sub category, image, specifications,
   configuration) and sub products, each with its own price.
   specifications is a JSON array of {name, value}. image is a small data URL.
   Safe to re-run. */
USE istreams_crm;
GO

SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('dbo.wsm_products', 'supplier_ref') IS NULL ALTER TABLE dbo.wsm_products ADD supplier_ref NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.wsm_products', 'margin_pct') IS NULL ALTER TABLE dbo.wsm_products ADD margin_pct DECIMAL(7,2) NULL;
IF COL_LENGTH('dbo.wsm_products', 'sub_category') IS NULL ALTER TABLE dbo.wsm_products ADD sub_category NVARCHAR(50) NULL;
IF COL_LENGTH('dbo.wsm_products', 'image') IS NULL ALTER TABLE dbo.wsm_products ADD image NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.wsm_products', 'specifications') IS NULL ALTER TABLE dbo.wsm_products ADD specifications NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.wsm_products', 'has_sub_products') IS NULL ALTER TABLE dbo.wsm_products ADD has_sub_products CHAR(1) NOT NULL CONSTRAINT DF_wsm_products_has_sub DEFAULT 'F';
IF COL_LENGTH('dbo.wsm_products', 'sub_detail_type') IS NULL ALTER TABLE dbo.wsm_products ADD sub_detail_type NVARCHAR(50) NULL;
IF COL_LENGTH('dbo.wsm_products', 'sub_uom') IS NULL ALTER TABLE dbo.wsm_products ADD sub_uom VARCHAR(15) NULL;
IF COL_LENGTH('dbo.wsm_products', 'conversion_rate') IS NULL ALTER TABLE dbo.wsm_products ADD conversion_rate DECIMAL(18,4) NOT NULL CONSTRAINT DF_wsm_products_conv DEFAULT 1;
GO

IF OBJECT_ID('dbo.wsm_product_subs', 'U') IS NULL
CREATE TABLE dbo.wsm_product_subs (
    sub_id       INT IDENTITY(1,1) PRIMARY KEY,
    company_id   INT            NOT NULL REFERENCES dbo.wsm_companies(company_id),
    product_id   INT            NOT NULL REFERENCES dbo.wsm_products(product_id) ON DELETE CASCADE,
    sub_name     NVARCHAR(200)  NOT NULL,
    detail       NVARCHAR(200)  NULL,
    price        DECIMAL(18,2)  NOT NULL,
    image        NVARCHAR(MAX)  NULL,
    is_active    CHAR(1)        NOT NULL DEFAULT 'T',
    created_at   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_wsm_product_subs_product')
    CREATE INDEX IX_wsm_product_subs_product ON dbo.wsm_product_subs(product_id);
GO
