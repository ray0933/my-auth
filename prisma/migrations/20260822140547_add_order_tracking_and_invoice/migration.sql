SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[User] ADD [employeeCode] NVARCHAR(1000);

-- CreateTable
CREATE TABLE [dbo].[NumberSequence] (
    [id] NVARCHAR(1000) NOT NULL,
    [scope] NVARCHAR(1000) NOT NULL,
    [currentValue] INT NOT NULL CONSTRAINT [NumberSequence_currentValue_df] DEFAULT 0,
    CONSTRAINT [NumberSequence_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [NumberSequence_scope_key] UNIQUE NONCLUSTERED ([scope])
);

-- CreateTable
CREATE TABLE [dbo].[OrderTracking] (
    [id] NVARCHAR(1000) NOT NULL,
    [orderNumber] NVARCHAR(1000) NOT NULL,
    [orderType] NVARCHAR(1000) NOT NULL,
    [orderDate] DATETIME2,
    [customerShortName] NVARCHAR(1000),
    [endUser] NVARCHAR(1000),
    [projectName] NVARCHAR(1000),
    [salesRepCode] NVARCHAR(1000),
    [salesRepName] NVARCHAR(1000),
    [orderAmountUntaxed] DECIMAL(18,2),
    [estimatedCostUntaxed] DECIMAL(18,2),
    [snapshotAt] DATETIME2,
    [notes] NVARCHAR(1000),
    [createdById] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [OrderTracking_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [OrderTracking_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [OrderTracking_orderNumber_key] UNIQUE NONCLUSTERED ([orderNumber])
);

-- CreateTable
CREATE TABLE [dbo].[InvoicePlan] (
    [id] NVARCHAR(1000) NOT NULL,
    [orderTrackingId] NVARCHAR(1000) NOT NULL,
    [plannedMonth] DATETIME2 NOT NULL,
    [plannedMonthStr] NVARCHAR(1000) NOT NULL,
    [estimatedCompletionDate] DATETIME2 NOT NULL,
    [estimatedCompletionMonthStr] NVARCHAR(1000) NOT NULL,
    [plannedAmount] DECIMAL(18,2) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [InvoicePlan_status_df] DEFAULT 'pending',
    [invoiceId] NVARCHAR(1000),
    [notes] NVARCHAR(1000),
    [createdById] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InvoicePlan_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [InvoicePlan_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Invoice] (
    [id] NVARCHAR(1000) NOT NULL,
    [invoiceNumber] NVARCHAR(1000) NOT NULL,
    [orderTrackingId] NVARCHAR(1000) NOT NULL,
    [invoiceDate] DATETIME2 NOT NULL CONSTRAINT [Invoice_invoiceDate_df] DEFAULT CURRENT_TIMESTAMP,
    [amount] DECIMAL(18,2) NOT NULL,
    [taxAmount] DECIMAL(18,2) NOT NULL,
    [totalAmount] DECIMAL(18,2) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Invoice_status_df] DEFAULT 'issued',
    [voidedAt] DATETIME2,
    [voidReason] NVARCHAR(1000),
    [issuedById] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Invoice_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Invoice_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Invoice_invoiceNumber_key] UNIQUE NONCLUSTERED ([invoiceNumber])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OrderTracking_orderType_idx] ON [dbo].[OrderTracking]([orderType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OrderTracking_salesRepCode_idx] ON [dbo].[OrderTracking]([salesRepCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InvoicePlan_orderTrackingId_idx] ON [dbo].[InvoicePlan]([orderTrackingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InvoicePlan_plannedMonth_idx] ON [dbo].[InvoicePlan]([plannedMonth]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InvoicePlan_estimatedCompletionDate_idx] ON [dbo].[InvoicePlan]([estimatedCompletionDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InvoicePlan_status_idx] ON [dbo].[InvoicePlan]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Invoice_orderTrackingId_idx] ON [dbo].[Invoice]([orderTrackingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Invoice_status_idx] ON [dbo].[Invoice]([status]);

-- CreateIndex
-- Filtered unique index (not a plain UNIQUE constraint): SQL Server treats every NULL as
-- equal in a regular unique constraint/index, so with multiple existing users having no
-- employeeCode, a plain UNIQUE would reject them as "duplicate NULLs". Filtering the index
-- to non-NULL values gives the same effective uniqueness Prisma's `@unique` asks for while
-- still allowing any number of users with employeeCode = NULL.
--
-- Wrapped in EXEC(...) (dynamic SQL) rather than a plain CREATE INDEX statement: this whole
-- migration is executed as a single T-SQL batch (no GO support), and a stand-alone CREATE
-- INDEX is compiled against the catalog snapshot taken at the start of the batch, so it can't
-- see the [employeeCode] column added by ALTER TABLE earlier in the very same batch — unlike
-- ALTER TABLE ADD CONSTRAINT, which resolves column references incrementally. Deferring
-- compilation into a dynamic-SQL string sidesteps that.
EXEC('CREATE UNIQUE NONCLUSTERED INDEX [User_employeeCode_key] ON [dbo].[User]([employeeCode]) WHERE [employeeCode] IS NOT NULL');

-- AddForeignKey
ALTER TABLE [dbo].[OrderTracking] ADD CONSTRAINT [OrderTracking_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[User]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InvoicePlan] ADD CONSTRAINT [InvoicePlan_orderTrackingId_fkey] FOREIGN KEY ([orderTrackingId]) REFERENCES [dbo].[OrderTracking]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InvoicePlan] ADD CONSTRAINT [InvoicePlan_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[Invoice]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InvoicePlan] ADD CONSTRAINT [InvoicePlan_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[User]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Invoice] ADD CONSTRAINT [Invoice_orderTrackingId_fkey] FOREIGN KEY ([orderTrackingId]) REFERENCES [dbo].[OrderTracking]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Invoice] ADD CONSTRAINT [Invoice_issuedById_fkey] FOREIGN KEY ([issuedById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
