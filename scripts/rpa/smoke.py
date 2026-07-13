#!/usr/bin/env python3
"""无 LLM 的本地浏览器回归：连接已打开的 Chrome，验证关键工作流。"""

from __future__ import annotations

import os
import subprocess
import sys
import textwrap
import urllib.request


base_url = os.environ.get("PHOTO_STUDIO_URL", "http://127.0.0.1:4173/").rstrip("/")

try:
    with urllib.request.urlopen(base_url, timeout=3) as response:
        if response.status != 200:
            raise RuntimeError(f"开发服务器返回 HTTP {response.status}")
except Exception as error:
    sys.exit(f"RPA 需要已启动的本地开发服务器：npm run server -- --port 4173 --no-open\n{error}")

script = f"""
tabs = list_tabs(include_chrome=False)
target = next((tab for tab in tabs if tab['url'].rstrip('/') == '{base_url}'), None)
if target:
    switch_tab(target)
    goto_url('{base_url}/')
else:
    new_tab('{base_url}/')
wait_for_load()
assert js(\"document.querySelector('[data-page=\\\"home\\\"]')?.dataset.ready\") == 'true'
assert js(\"!!document.querySelector('[data-testid=\\\"open-image\\\"]')\")
assert js(\"!!document.querySelector('[data-testid=\\\"create-new\\\"]')\")
js(\"document.querySelector('[data-testid=\\\"create-new\\\"]')?.click()\")
wait_for_load()
assert js("location.href").endswith('/editor/')
assert js(\"document.body.dataset.manualCutoutTools\") == 'selection,magic_erase,erase'
assert js(\"!!document.querySelector('[data-testid=\\\"save-local-project\\\"]')\")
print('Photo Studio RPA smoke passed')
"""

result = subprocess.run(["browser-use"], input=textwrap.dedent(script), text=True)
sys.exit(result.returncode)
