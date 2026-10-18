# 原神活动数据分析

分析原神限时活动中「支持率 → 赔率」的机制与下注策略。当前活动：7.1 上半「判测胜券本征」。

## 站点结构

纯静态单页壳子，适配 GitHub Pages；无构建、无服务器依赖。

- `index.html`：默认显示活动索引；点击活动后在同一页面渲染分析，不跳转独立 HTML。
- URL 使用 `?event=<id>` 参数进入活动，例如 `index.html?event=7.1-261012`。
- 使用 query 参数而不是路径路由：GitHub Pages 没有服务端 rewrite，`/event/<id>` 这类路径会 404。
- 所有资源使用相对路径，兼容 `https://<user>.github.io/genshin-activity/` 子路径。
- `.nojekyll` 已添加，避免 Jekyll 处理静态文件。
- 默认浅色主题，可切换暗色。

## 目录约定

```
index.html           单页壳子 + 活动索引
web/                 静态资源（app.js / style.css / vendor/echarts）
data/activities.js   活动索引清单
data/<id>.js         活动数据，注册到 window.ACTIVITY_DATA_BY_ID
scripts/serve.py     可选 HTTP 调试，不是入口依赖
docs/ai-output/      方案/机制/进展文档；独立 git 仓库
temp/YYYYMMDD/       临时脚本与原始记录，不入库
output/              构建产物（本项目无构建步骤，暂不使用）
```

- 数据与界面分离；不要在 `index.html` 中硬编码比赛数据。
- 临时文件一律放 `temp/YYYYMMDD/`，不要放根目录。
- `docs/ai-output` 是独立 git 仓库，其提交与根仓库分开。

## 数据与新增活动

数据文件是 JS 对象，结构与原先的 JSON 一致：

```js
window.ACTIVITY_DATA_BY_ID = window.ACTIVITY_DATA_BY_ID || {};
window.ACTIVITY_DATA_BY_ID["<id>"] = {
  activity: { /* ... */ },
  matches: [ /* ... */ ]
};
```

用 JS 数据文件而不是 JSON fetch：`file://` 和 GitHub Pages 都能通过 `<script src>` 直接加载，不需要服务器或 CORS。

新增活动：

1. 创建 `data/<id>.js` 并注册数据；
2. 在 `data/activities.js` 增加一条索引：`id / name / version / phase / startDate / status / dataFile / description`；
3. 打开 `index.html?event=<id>`；
4. 保持索引与数据文件中的 `activity` 元数据（名称/版本/阶段/日期）一致。

修改数据后刷新页面即可。旧的 `data/7.1-261012.json` 已归档到 `temp/261018/legacy/`，不再使用。

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

## 验证

直接双击 `index.html`：应先看到活动索引；点击活动进入分析，URL 变为 `?event=<id>`；返回/前进按钮正常；无控制台错误。

可选 HTTP 调试：`python scripts/serve.py`，入口仍以 `index.html` 为准。

## 代码约定

- 纯静态前端，不引入构建工具；ECharts 使用 `web/vendor/echarts.min.js`。
- 分析计算全部在 `web/app.js` 中完成；活动数据按需动态加载。
- 修改后至少做一次页面加载验证（Playwright 或浏览器），确认无控制台错误、数据与图表一致。
- 提交信息使用 Conventional Commits，一次提交聚焦一个模块。
