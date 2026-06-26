import time
import json
import os
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options


def scrape_focus_news(profile_dir=None, headless=False):
    """
    手动登录并切换到“焦点”频道后，抓取所有新闻条目中的时间(datetime)和内容(content)。
    保存为带日期的 JSON 文件，如 tushare_focus_news_20260625.json
    """
    if profile_dir is None:
        profile_dir = os.path.join(os.getcwd(), "chrome_profile")
        os.makedirs(profile_dir, exist_ok=True)

    chrome_options = Options()
    chrome_options.add_argument(f"--user-data-dir={profile_dir}")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option("useAutomationExtension", False)

    if headless:
        chrome_options.add_argument("--headless")

    driver = webdriver.Chrome(options=chrome_options)
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": """
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            })
        """
    })

    try:
        wait = WebDriverWait(driver, 20)

        # ---------- 1. 检查登录状态 ----------
        driver.get("https://tushare.pro/news/sina")
        time.sleep(3)

        if "login" in driver.current_url:
            print("🔐 未检测到登录状态，请手动登录...")
            driver.get("https://tushare.pro/login")
            wait.until(EC.presence_of_element_located((By.TAG_NAME, "form")))
            print("=" * 60)
            print("请在浏览器中手动输入账号、密码及验证码完成登录。")
            print("登录成功后，请**手动切换到「焦点」频道**（点击频道栏的“焦点”）。")
            print("切换完成后，回到终端按 Enter 键继续...")
            print("=" * 60)
            input("👉 按 Enter 继续...")

            if "login" in driver.current_url:
                print("⚠️ 仍在登录页，请确认已登录并切换到焦点频道？")
                confirm = input("若已就绪请按 Enter 继续，否则请先完成操作：")
                if "login" in driver.current_url:
                    raise Exception("登录失败或未切换到焦点频道。")
        else:
            print("✅ 检测到已登录状态（使用缓存的会话）")
            print("请**手动切换到「焦点」频道**，然后按 Enter 继续...")
            input("👉 按 Enter 继续...")

        # ---------- 2. 定位焦点容器 ----------
        focus_container = wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div#news_焦点.news_data.cur"))
        )
        print("✅ 已定位到「焦点」新闻容器")

        # ---------- 3. 提取所有新闻条目（时间和内容） ----------
        news_items = focus_container.find_elements(By.CSS_SELECTOR, "div.key_news.news_item")
        news_data = []

        for item in news_items:
            try:
                datetime_elem = item.find_element(By.CSS_SELECTOR, "div.news_datetime")
                datetime_str = datetime_elem.text.strip()

                content_elem = item.find_element(By.CSS_SELECTOR, "div.news_content")
                content = content_elem.text.strip()

                news_data.append({
                    "datetime": datetime_str,
                    "content": content
                })
            except Exception as e:
                print(f"提取条目出错: {e}")
                continue

        # ---------- 4. 保存为带日期的 JSON 文件 ----------
        date_str = datetime.now().strftime("%Y%m%d")
        filename = f"tushare_focus_news_{date_str}.json"

        output = {
            "channel": "焦点",
            "total": len(news_data),
            "news": news_data
        }
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        print(f"✅ 成功抓取 {len(news_data)} 条新闻，已保存至 {filename}")
        return news_data

    except Exception as e:
        print(f"❌ 发生错误: {e}")
        driver.save_screenshot("error_screenshot.png")
        print("已保存错误截图: error_screenshot.png")
        raise

    finally:
        close = input("是否关闭浏览器？(y/n): ").strip().lower()
        if close == 'y':
            driver.quit()
        else:
            print("浏览器保持打开。")


if __name__ == "__main__":
    scrape_focus_news()