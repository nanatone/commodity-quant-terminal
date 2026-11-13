# 大宗商品一手观察与策略投研终端 (Commodity & Equity 60m Quant Terminal)

本项目是一个已完成**前后端数据分离**与 **GitHub Actions 自动定时更新配置** 的全栈投研终端工程包，可直接交由 **Antigravity** 或本地命令行一键启动与部署。

---

## 📁 工程目录结构

```text
commodity-quant-terminal/
├── .github/workflows/
│   └── deploy.yml             # GitHub Actions 定时抓取数据 + 自动编译部署 GitHub Pages
├── public/data/
│   └── market_data.json       # 前端动态读取的核心数据源（含宏观流动性、期现基差库存、60m股票池）
├── scripts/
│   ├── fetch_data.py          # Python 自动化脚本（FRED API + AkShare 期现基差 + 60m量比/MID/ATR计算）
│   └── requirements.txt       # Python 依赖清单
├── src/
│   ├── App.jsx                # 终端前端主应用（支持 ./data/market_data.json 动态拉取与回退保护）
│   ├── main.jsx               # React 挂载入口
│   └── index.css              # Tailwind CSS 样式表
├── index.html
├── package.json
├── vite.config.js             # 已配置 base: './'，兼容任意 GitHub Pages 仓库路径
└── tailwind.config.js
```

---

## 🚀 给 Antigravity 的一键部署指令

解压本代码包后，在 **Antigravity** 中打开该文件夹，直接发送以下一句话指令即可：

> **“请帮我运行 `npm install` 并启动本地预览检查效果；随后初始化 Git 仓库并推送到我的 GitHub 远端仓库，开启 GitHub Pages 自动部署。”**

---

## 🔑 GitHub 仓库两步配置（启用每日自动更新）

1. **配置 GitHub Pages 构建源**：
   进入你的 GitHub 仓库 -> **Settings** -> **Pages** -> **Build and deployment** -> 将 **Source** 切换为 **GitHub Actions**。
2. **（可选）配置美联储 FRED API Key**：
   进入 **Settings** -> **Secrets and variables** -> **Actions** -> 点击 **New repository secret**，添加名称为 `FRED_API_KEY` 的密钥（用于每日自动更新 10Y TIPS 实际利率、TGA 账户与 ON RRP 净流动性；即使不配，Python 脚本也会平稳跳过并更新国内 AkShare 商品与 A 股 60m 数据）。
