# 预测周期与共享分析

本文描述「会员 + 积分 + 订阅推送」体系下的 **预测周期（prediction cycle）** 与 **canonical 共享分析** 语义，供首页分析、订阅推送与管理端推送管理统一复用。

## 周期定义

| 字段 | 含义 |
| --- | --- |
| `cycle_anchor_date` | 周期锚点 = 最新已入库交易日 T（存于 `shared_analysis_runs.analysis_date`） |
| `prediction_target_date` | 预测目标 = T 的下一交易日 |
| `data_as_of_date` | 行情/财报等结构化数据的截至交易日 |

**周期窗口**：`T` 日 `PREDICTION_CYCLE_CUTOFF_HOUR`（默认 18:00，市场本地时区）→ 下一交易日同一时刻前，共用同一份 canonical 报告。

示例（A 股，截止 18:00）：

- 周五 18:00 后 ~ 周一 18:00 前：锚点均为周五，预测目标为周一。
- 周一 18:00 后：锚点切换为周一，预测目标为周二。

**非交易日**：仍可发起分析，归属上一有效周期锚点（选项 B）。

## 去重键

```
(code, cycle_anchor_date, report_type)
```

对应表 `shared_analysis_runs` 唯一约束 `uix_shared_analysis_run_code_date_type`。

## 数据快照

表 `stock_data_snapshots` 按 `(code, cycle_anchor_date)` 保存结构化上下文 JSON（K 线、筹码、财报摘要等），供周期内情报增量重分析复用。

## 情报增量（周期内二次预测）

当本周期已有 canonical 且未 `force_refresh` 时：

1. 探测窗口：`since = max(锚点 cutoff, last_analyzed_at)`，`until = now`
2. SearXNG 搜索新闻；若存在未知 URL 且发布时间不早于 `since` → 全量重分析
3. 无新新闻 → 返回 canonical，并收取 **探测积分**（`CREDITS_ANALYSIS_PROBE`，默认 2）
4. SearXNG 失败：fail-open 返回缓存，尽量不扣探测费

有新新闻时只扣全量 LLM 积分，不叠加探测费。

## 统一入口

`SharedAnalysisService.get_or_create()` 被以下路径调用：

- C 端首页 / API：`AnalysisService.analyze_stock`
- 订阅推送分析：`SubscriptionRunner.analyze_due` / `_ensure_shared_report`
- 管理端推送管理：同上（`force_refresh` 可跳探测直接全量重跑）

## 配置项

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PREDICTION_CYCLE_CUTOFF_HOUR` | `18` | 周期切换时刻（市场本地小时） |
| `CREDITS_ANALYSIS_PROBE` | `2` | 无新新闻时探测固定积分；`0` 表示不扣费 |

## 相关代码

- `src/core/prediction_cycle.py` — 周期解析
- `src/services/shared_analysis_service.py` — canonical 编排
- `src/services/intel_probe_service.py` — 情报探测
- C 端首页报告区通过 `ReportMeta.prediction_cycle` 展示周期锚点、预测目标与缓存/探测提示。
