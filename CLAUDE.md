# 原神活动数据分析

分析原神限时活动中「支持率 → 赔率」的机制与下注策略。当前活动：7.1 上半「判测胜券本征」。

## 目录约定

```
index.html           入口，双击打开；默认浅色
web/                 静态资源（app.js / style.css / vendor/echarts）
data/                唯一信源（JS 数据文件）
scripts/             可选工具；serve.py 仅用于 HTTP 调试
docs/ai-output/      方案/机制/进展文档；独立 git 仓库
temp/YYYYMMDD/       临时脚本与原始记录，不入库
output/              构建产物（本项目无构建步骤，暂不使用）
```

- `data/*.js` 是唯一信源，格式为 `window.ACTIVITY_DATA = {...};`，由 `index.html` 通过 `<script src>` 加载。
- 修改数据后刷新 `index.html` 或点击「重新加载数据」即可，无需构建、无需服务器。
- 不依赖 Python；`scripts/serve.py` 只是可选的 HTTP 调试工具，不是入口。
- `docs/ai-output` 是独立 git 仓库，其提交与根仓库分开。
- 临时文件一律放 `temp/YYYYMMDD/`，不要放根目录。
- 旧的 `data/7.1-261012.json` 已归档到 `temp/261018/legacy/`，不再使用。

## 数据口径

- 押 n 券 → n × 结算倍率积分；押错固定 10×。
- 每场固定 50 券的朴素策略；8 天 × 2 场 = 16 场，全押错保底 8,000 分。
- 16,000 分 = 满奖励线；8,000 分 = 原始奖励线。
- 数据字段：`activity`（规则/发券/上限/奖励线）、`matches[]`（support/odds/settlement/winner）。
- `odds` 是赛前赔率记录，允许未知（null）；`settlement` 是实际结算倍率，败方为 10。
- 上帝视角：动态规划；日初发券、持有上限 300、可攒券、单场不限金额、已知胜负。

## 文档约定

- `docs/ai-output/<活动>/index.md`：用表格列出该目录下的文档与内容摘要。
- `docs/ai-output/logs/YYYY-MM-DD.md`：只包含「已做」「待做」两节；仅当用户明确要求更新文档时更新，工作过程中不要频繁写日志。

## 使用

直接双击根目录的 `index.html`。数据来自 `data/7.1-261012.js`。

- 更新数据：编辑 `data/7.1-261012.js`，刷新页面或点击「重新加载数据」。
- 可选 HTTP 调试：`python scripts/serve.py`；入口仍以 `index.html` 为准。
- 页面启动时会校验数据并展示错误/警告；无需构建步骤。

## 代码约定

- 纯静态前端，不引入构建工具；ECharts 使用 `web/vendor/echarts.min.js`。
- 分析计算全部在 `web/app.js` 中完成；数据通过 `window.ACTIVITY_DATA` 注入。
- 新增活动：新增一份同 schema 的 `data/<id>.js`，在 `index.html` 中引用即可。
- 修改后至少做一次页面加载验证（Playwright 或浏览器），确认无控制台错误、数据与图表一致。
- 提交信息使用 Conventional Commits，一次提交聚焦一个模块。
