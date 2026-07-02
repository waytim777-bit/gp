import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

from api.v1.endpoints.history import download_history_pdf


class HistoryPdfApiTest(unittest.TestCase):
    @patch("api.v1.endpoints.history.report_url_to_pdf")
    @patch("api.v1.endpoints.history.HistoryService")
    def test_download_history_pdf_returns_attachment(self, mock_service_cls, mock_report_url_to_pdf):
        mock_service_cls.return_value.get_markdown_report.return_value = "# Report"
        mock_report_url_to_pdf.return_value = b"%PDF-1.4"

        response = download_history_pdf("123", db_manager=Mock(), current_user=object())

        self.assertEqual(response.media_type, "application/pdf")
        self.assertEqual(response.body, b"%PDF-1.4")
        self.assertIn("attachment;", response.headers["content-disposition"])
        mock_service_cls.return_value.get_markdown_report.assert_called_once_with(
            "123",
            owner_user_id=None,
        )
        url = mock_report_url_to_pdf.call_args.args[0]
        self.assertIn("/reports/123/print?token=", url)

    @patch("api.v1.endpoints.history.report_url_to_pdf")
    @patch("api.v1.endpoints.history.HistoryService")
    def test_download_history_pdf_raises_when_pdf_generation_fails(self, mock_service_cls, mock_report_url_to_pdf):
        mock_service_cls.return_value.get_markdown_report.return_value = "# Report"
        mock_report_url_to_pdf.side_effect = RuntimeError("failed")

        with self.assertRaises(HTTPException) as ctx:
            download_history_pdf("123", db_manager=Mock(), current_user=object())

        self.assertEqual(ctx.exception.status_code, 500)


if __name__ == "__main__":
    unittest.main()
