# -*- coding: utf-8 -*-
"""Tests for intel probe helpers."""

import unittest

from src.services.intel_probe_service import (
    build_news_fingerprint,
    extract_urls_from_news_content,
    parse_news_fingerprint,
)


class IntelProbeServiceTestCase(unittest.TestCase):
    def test_fingerprint_roundtrip(self) -> None:
        urls = ["https://a.example/news/1", "https://b.example/x"]
        raw = build_news_fingerprint(urls)
        self.assertEqual(parse_news_fingerprint(raw), set(urls))

    def test_extract_urls_from_news_content(self) -> None:
        text = "标题 https://news.example/a 摘要 https://news.example/b"
        self.assertEqual(
            extract_urls_from_news_content(text),
            ["https://news.example/a", "https://news.example/b"],
        )


if __name__ == "__main__":
    unittest.main()
