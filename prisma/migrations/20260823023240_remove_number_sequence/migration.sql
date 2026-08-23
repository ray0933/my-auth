BEGIN TRY

BEGIN TRAN;

-- DropTable
-- Invoice numbers are now entered manually by the user (see IssueInvoiceDto),
-- so the auto-numbering sequence table is no longer needed.
DROP TABLE [dbo].[NumberSequence];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
