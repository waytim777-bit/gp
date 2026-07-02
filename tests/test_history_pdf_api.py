import subprocess
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

from api.v1.endpoints.history import download_history_pdf


class HistoryPdfApiTest(unittest.TestCase):
    @patch("api.v1.endpoints.history.subprocess.run")
    @patch("api.v1.endpoints.history.HistoryService")
    def test_download_history_pdf_returns_attachment(self, mock_service_cls, mock_run):
        mock_service_cls.return_value.get_markdown_report.return_value = "# Report"
        mock_run.return_value = subprocess.CompletedProcess(
            args=["wkhtmltopdf"],
            returncode=0,
            stdout=b"%PDF-1.4",
            stderr=b"",
        )

        response = download_history_pdf("123", db_manager=Mock(), current_user=object())

        self.assertEqual(response.media_type, "application/pdf")
        self.assertEqual(response.body, b"%PDF-1.4")
        self.assertIn("attachment;", response.headers["content-disposition"])
        mock_service_cls.return_value.get_markdown_report.assert_called_once_with(
            "123",
            owner_user_id=None,
        )

    @patch("api.v1.endpoints.history.subprocess.run")
    @patch("api.v1.endpoints.history.HistoryService")
    def test_download_history_pdf_raises_when_wkhtmltopdf_fails(self, mock_service_cls, mock_run):
        mock_service_cls.return_value.get_markdown_report.return_value = "# Report"
        mock_run.return_value = subprocess.CompletedProcess(
            args=["wkhtmltopdf"],
            returncode=1,
            stdout=b"",
            stderr=b"failed",
        )

        with self.assertRaises(HTTPException) as ctx:
            download_history_pdf("123", db_manager=Mock(), current_user=object())

        self.assertEqual(ctx.exception.status_code, 500)


if __name__ == "__main__":
    unittest.main()
