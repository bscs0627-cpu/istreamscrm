/* Company form fields: state, group of company, other nature of business,
   invoice and delivery addresses. The existing address column is the
   communication address. Safe to re-run. */
USE istreams_crm;
GO

IF COL_LENGTH('dbo.wsm_accounts', 'state') IS NULL ALTER TABLE dbo.wsm_accounts ADD state NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.wsm_accounts', 'group_name') IS NULL ALTER TABLE dbo.wsm_accounts ADD group_name NVARCHAR(200) NULL;
IF COL_LENGTH('dbo.wsm_accounts', 'other_industry') IS NULL ALTER TABLE dbo.wsm_accounts ADD other_industry NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.wsm_accounts', 'invoice_address') IS NULL ALTER TABLE dbo.wsm_accounts ADD invoice_address NVARCHAR(500) NULL;
IF COL_LENGTH('dbo.wsm_accounts', 'delivery_address') IS NULL ALTER TABLE dbo.wsm_accounts ADD delivery_address NVARCHAR(500) NULL;
GO
