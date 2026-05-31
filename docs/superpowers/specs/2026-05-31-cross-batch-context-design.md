# 跨页上下文校对 — 设计文档

**日期**: 2026-05-31  
**状态**: 已确认

## 问题

校对 pipeline 按批次向 LLM 发送文本，各批次独立处理。当句子跨页（跨批次边界）时，LLM 只看到片段，可能误判为错误。例如：

- 上文末尾：「这体现了」
- 下批次开头：「现代汉语的发展趋势」

LLM 看到「现代汉语的发展趋势」孤立出现，可能标记为语法错误。

## 方案：轻量双向上下文

在每批次的 user prompt 中，附加前后批次各 2 句的纯文本作为参考上下文。上下文仅用于理解，不参与校对。

### 为什么不用多轮对话

1. 多轮对话需要顺序执行（批次 N 的 messages 依赖批次 N-1 的回复），会破坏当前并行架构
2. 轻量上下文只需要相邻批次的原始文本，Phase 1 已全部提取，无需等待
3. 只需 2 句上下文即可判断跨页断句，不需要完整的对话历史

## 架构

```
Phase 1: 提取所有批次文本 (已有)
   ↓
Phase 1.5: 为每批截取前后 2 句纯文本上下文 (新增)
   ↓
Phase 2: 并行 LLM 调用，每批带上上下文 (修改)
```

上下文构造逻辑（Phase 1 完成后，Phase 2 开始前）：

```
批次 N 的上文 = 批次 N-1 的纯文本末尾 2 句
批次 N 的下文 = 批次 N+1 的纯文本开头 2 句

边缘：首批无上文，末批无下文，单批次无上下文
```

## Prompt 结构

```
[system]
校对规则（不变）

[user]
[上文参考，请勿校对]
（批次 N-1 末尾 2 句，去掉 [#NNNN] ID）

---
请校对以下文本：

（批次 N 的带 ID 文本，不变）

---
[下文参考，请勿校对]
（批次 N+1 开头 2 句，去掉 [#NNNN] ID）
```

## 语言配置（languages.json）

```json
{
  "zh": {
    "sentence_separators": "。！？",
    "context_sentences": 2
  },
  "en": {
    "sentence_separators": ".!?",
    "context_sentences": 2
  }
}
```

- `sentence_separators`: 断句标点，按语言配置
- `context_sentences`: 前后各取几句

## 修改文件

| 文件 | 改动 |
|---|---|
| `rules/languages.json` | 添加 `sentence_separators`、`context_sentences` 字段（zh、en） |
| `core/language_profile.py` | `LanguageProfile` 新增两个字段，从 JSON 读取 |
| `core/proofreader.py` | Phase 1 后为每批从相邻批次提取上下文 |
| `core/llm_client.py` | `proofread()` 新增 `prefix_context`、`suffix_context` 参数 |

## 上下文提取算法

```python
def _extract_context(text: str, direction: 'prefix' | 'suffix', 
                     sep_pattern: str, count: int) -> str:
    """
    1. 用 sep_pattern 正则分句
    2. 去掉 [#NNNN] 标记
    3. 取前/后 count 句
    """
```

- 中文：`re.split(r'(?<=[。！？])', text)` — 在标点后断句
- 英文：`re.split(r'(?<=[.!?])\s+', text)` — 在标点+空白后断句

## 兼容性

- 不改变 LLM API 响应格式
- 不改变前端 SSE 事件结构
- `proofread()` 的新参数为可选，默认 `None`（向后兼容）
- 现有测试不受影响（独立调用 `proofread()` 时不传上下文，行为不变）
