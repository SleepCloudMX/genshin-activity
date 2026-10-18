# 原神活动数据分析

分析原神限时活动中「支持率 → 赔率」的机制与下注策略。当前活动：7.1 上半「判测胜券本征」。

## 目录约定

```
data/                唯一信源（JSON），页面运行时读取
web/                 静态分析页面（HTML/CSS/JS + 本地 ECharts）
scripts/             本地服务等脚本
docs/ai-output/      方案/机制/进展文档；独立 git 仓库
temp/YYYYMMDD/       临时脚本与原始记录，不入库
output/              构建产物（本项目无构建步骤，暂不使用）
```

- `data/*.json` 是唯一信源。不要在前端硬编码比赛数据。
- 修改 JSON 后刷新页面或点击「重新加载数据」即可，无需重建。
- `docs/ai-output` 是独立 git 仓库，其提交与根仓库分开。
- 临时文件一律放 `temp/YYYYMMDD/`，不要放根目录。

## 数据口径

- 押 n 券 → n × 结算倍率积分；押错固定 10×。
- 每场固定 50 券的朴素策略；8 天 × 2 场 = 16 场，全押错保底 8,000 分。
- 16,000 分 = 满奖励线；8,000 分 = 原始奖励线。
- JSON 字段：`activity`（规则/发券/上限/奖励线）、`matches[]`（support/odds/settlement/winner）。
- `odds` 是赛前赔率记录，允许未知（null）；`settlement` 是实际结算倍率，败方为 10。
- 上帝视角：动态规划；日初发券、持有上限 300、可攒券、单场不限金额、已知胜负。

## 使用

```bash
# 使用 ai 环境启动本地服务（默认打开 7.1 活动页面）
python scripts/serve.py

# 指定其他数据文件
python scripts/serve.py --data data/7.1-261012.json --no-browser

# 页面也支持手动指定数据
# http://127.0.0.1:8000/web/index.html?data=../data/7.1-261012.json
```

浏览器安全策略不允许 `file://` 直接 fetch JSON，必须通过本地 HTTP 服务访问。

## 代码约定

- 纯静态前端，不引入构建工具；ECharts 使用 `web/vendor/echarts.min.js`。
- 分析计算全部在 `web/app.js` 中完成；页面启动时校验 JSON 并展示错误/警告。
- 新增活动：新增一份同 schema 的 `data/<版本>-<开始日期>.json`，通过 `?data=` 指定即可。
- 修改后至少做一次页面加载验证（Playwright 或浏览器），确认无控制台错误、数据与图表一致。
- 提交信息使用 Conventional Commits，一次提交聚焦一个模块。
