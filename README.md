# 每日 AI 新闻

一个每天自动收集全球 AI 新闻的静态网站。数据来自多个公开 RSS 源，采集脚本会抓取、去重、分类并生成 `data/news.json` 与 `data/news.js`，前端直接读取这些文件展示。

## 功能

- 自动抓取 OpenAI、Google AI、TechCrunch AI、The Verge AI、MIT Tech Review、VentureBeat AI
- 标题与摘要自动翻译成中文，默认中文，可一键切换英文
- 按产品、研究、政策、行业、工具自动分类
- 标题、摘要、来源搜索
- 时间范围、来源、分类、排序筛选
- 网格 / 列表视图切换
- 本地收藏（保存在浏览器 `localStorage`）
- 明暗主题切换
- 响应式布局，支持手机浏览
- GitHub Actions 每天 00:30 UTC 自动更新数据

## 本地运行

网站是纯静态文件，任选一种方式：

```bash
python3 -m http.server 4173
```

然后打开 `http://localhost:4173`。

也可以直接用浏览器打开 `index.html`，数据会通过 `data/news.js` 注入页面。

## 手动采集

脚本只依赖 Python 标准库：

```bash
python3 scripts/collect.py --limit 180 --max-per-source 80
python3 scripts/translate.py --data data/news.json
```

常用参数：

```bash
python3 scripts/collect.py --offline --cache-dir /tmp --out data
python3 scripts/collect.py --timeout 30 --limit 120 --max-per-source 40
```

`--cache-dir` 会优先读取 `<id>.xml` 缓存文件；配合 `--offline` 可以完全离线生成数据。

翻译使用 MyMemory 免费接口。可选地在环境变量 `MYMEMORY_EMAIL` 中配置邮箱以提高每日额度：

```bash
MYMEMORY_EMAIL=you@example.com python3 scripts/translate.py --data data/news.json
```

## 每天自动更新

把仓库推送到 GitHub 后，`.github/workflows/daily-news.yml` 会在每天 UTC 00:30 自动运行采集脚本，并把新的 `data/` 提交回仓库。

工作流会自动执行采集和翻译两步；如果配置了仓库 Secret `MYMEMORY_EMAIL`，翻译额度会更高。

也可以手动触发：

1. 打开 GitHub 仓库的 Actions 页面
2. 选择 **Daily AI News**
3. 点击 **Run workflow**

本地定时任务可以直接用 cron 调用采集脚本：

```cron
30 8 * * * cd /path/to/richang && python3 scripts/collect.py --limit 180
```

## 数据格式

`data/news.json` 顶层包含：

```json
{
  "generated_at": "2026-08-30T02:50:59+00:00",
  "updated_label": "2026-08-30 02:50 UTC",
  "sources": [
    {
      "id": "openai",
      "name": "OpenAI",
      "site": "https://openai.com/news",
      "feed": "https://openai.com/news/rss.xml"
    }
  ],
  "items": [
    {
      "id": "hash",
      "title": "新闻标题",
      "url": "https://example.com/article",
      "source": "OpenAI",
      "source_id": "openai",
      "site": "https://openai.com/news",
      "published": "2026-08-30T00:00:00+00:00",
      "summary": "摘要",
      "image": "https://example.com/image.jpg",
      "category": "products",
      "title_zh": "中文标题",
      "summary_zh": "中文摘要",
      "translated": true
    }
  ]
}
```

分类值为 `products`、`research`、`policy`、`industry`、`tools`。

## 添加新闻源

编辑 `scripts/sources.json`，按现有结构追加：

```json
{
  "id": "source-id",
  "name": "Source Name",
  "site": "https://example.com",
  "feed": "https://example.com/feed.xml",
  "default_category": "research"
}
```

然后重新运行采集脚本。
