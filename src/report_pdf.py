# -*- coding: utf-8 -*-
"""PDF rendering helpers for analysis reports."""

from playwright.sync_api import sync_playwright


def report_url_to_pdf(url: str) -> bytes:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            page.goto(url, wait_until="networkidle")
            page.wait_for_function("window.__DSA_REPORT_READY__ === true", timeout=60000)
            error = page.evaluate("window.__DSA_REPORT_ERROR__ || ''")
            if error:
                raise RuntimeError(f"Report print page failed: {error}")
            page.evaluate("document.fonts ? document.fonts.ready : Promise.resolve()")
            page.evaluate("new Promise(resolve => requestAnimationFrame(() => resolve()))")
            return page.pdf(
                format="A4",
                print_background=True,
                margin={
                    "top": "12mm",
                    "right": "12mm",
                    "bottom": "12mm",
                    "left": "12mm",
                },
            )
        finally:
            browser.close()
