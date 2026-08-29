#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Normalize fields + build a single-file HTML prototype with embedded data."""
import json, html
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
DATA = BASE / 'platform' / 'data' / 'menu_data.json'
OUT = BASE / 'platform' / 'frontend' / 'dist' / '音画MenuTree管理平台.html'
TEMPLATE_FILE = BASE / 'platform' / 'frontend' / 'src' / '设置MenuTree_页面模板.html'
SCRIPT_FILE = BASE / 'platform' / 'frontend' / 'src' / '设置MenuTree_平台逻辑.js'

# map raw header -> canonical field key
CANON = {
    "默认值": "默认值", "Default": "默认值",
    "菜单内容": "取值/选项",
    "说明（zh-CN）": "说明(中)", "Explanation": "说明(英/通用)", "说明（en-US）": "说明(英)",
    "隐藏条件": "隐藏条件", "隐藏逻辑": "隐藏条件",
    "灰显条件": "灰显条件", "置灰条件": "灰显条件",
    "灰显提示Toast （纯文本，中文）": "灰显提示(中)", "灰显提示语（中）": "灰显提示(中)", "置灰提示语（中）": "灰显提示(中)",
    "灰显提示Toast （纯文本，英文）": "灰显提示(英)", "灰显提示语（英）": "灰显提示(英)", "置灰提示语（英）": "灰显提示(英)",
    "配置项": "配置项", "机芯条件": "机芯条件",
    "是否跟随图像重置恢复": "跟随重置", "控制中心配置快捷设置": "快捷设置",
    "SPEC": "SPEC", "备注": "备注",
    "TV Source": "信号源:TV", "Launcher": "信号源:Launcher", "Mdida": "信号源:Media",
    "HDMI": "信号源:HDMI", "VGA": "信号源:VGA", "Third-party application": "信号源:三方应用",
}
# canonical field display order
ORDER = ["取值/选项", "默认值", "说明(中)", "说明(英)", "说明(英/通用)",
         "隐藏条件", "灰显条件", "灰显提示(中)", "灰显提示(英)",
         "配置项", "机芯条件", "跟随重置", "快捷设置", "SPEC", "备注",
         "信号源:TV", "信号源:Launcher", "信号源:Media", "信号源:HDMI", "信号源:VGA", "信号源:三方应用"]

def normalize(node):
    raw = node.get("fields", {})
    canon = {}
    for k, v in raw.items():
        ck = CANON.get(k, k)
        if ck in canon and v not in canon[ck]:
            canon[ck] += "\n" + v
        else:
            canon[ck] = v
    node["fields"] = canon
    for c in node.get("children", []):
        normalize(c)

def add_paths(node, prefix):
    node["path"] = prefix + [node["label"].split("\n")[0]]
    for c in node.get("children", []):
        add_paths(c, node["path"])

def main():
    # Seed data powers the built-in V6.0 demo. Imported files are handled losslessly
    # in the browser and their original binary bytes are retained in IndexedDB.
    d = json.load(open(DATA, encoding="utf-8"))
    payload = json.dumps(d, ensure_ascii=False)
    template = TEMPLATE_FILE.read_text(encoding="utf-8")
    script = SCRIPT_FILE.read_text(encoding="utf-8")
    for marker in ("__SEED__", "__SCRIPT__"):
        if template.count(marker) != 1:
            raise ValueError(f"模板中占位符 {marker} 必须且只能出现一次")
    htmlstr = template.replace("__SEED__", payload).replace("__SCRIPT__", script)
    if "__SEED__" in htmlstr or "__SCRIPT__" in htmlstr:
        raise ValueError("构建后仍存在未替换的占位符")
    OUT.write_text(htmlstr, encoding="utf-8")
    print("WROTE", OUT)


if __name__ == "__main__":
    main()
