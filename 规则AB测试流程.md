# 规则 A/B 测试流程

## 当前版本说明

- `规则A`：当前稳定版，保留现有写作与审核口径
- `规则B`：候选版，按《写作与审核规则优化需求 v1.0》接入，重点强化：
  - 古文真实性核查
  - 真实历史人物事实性约束
  - 段落结构随机性
  - 更细的审核报告字段

当前前端工作台默认走“混合生效版”：

- `A型 / C型 -> 规则A`
- `B型 -> 规则B`

这样做的目的是：

- 不影响当前稳定使用
- 便于直接回退
- A/B 结果可并排比较

## 版本管理方式

规则配置文件：

- [server/contentRuleProfiles.js](/Users/awehome/Documents/文章内容自动化创作系统/server/contentRuleProfiles.js)

其中：

- `A` = 稳定版
- `B` = 候选版

当前默认值：

- `DEFAULT_CONTENT_RULE_PROFILE_ID = 'LIVE'`

这意味着：

- 不指定规则版本时，系统默认走混合生效版
- 只有在你主动显式指定 `A` 或 `B` 时，才会强制跑单一版本

## 固定测试题单

默认测试题单文件：

- [content-style/ab-test-topics.json](/Users/awehome/Documents/文章内容自动化创作系统/content-style/ab-test-topics.json)

当前内置了 `6` 个固定选题：

- `A型` 2 个
- `B型` 2 个
- `C型` 2 个

这样可以满足基础对照测试。

## 推荐测试命令

在项目根目录执行：

```bash
npm run test:rules-ab
```

这条命令会：

- 读取固定测试题单
- 对每个选题分别运行 `规则A` 和 `规则B`
- 自动输出结果文件

## 常用测试方式

只测两版完整对照：

```bash
npm run test:rules-ab
```

只测 `规则A`：

```bash
npm run test:rules-ab -- --profile A
```

只测 `规则B`：

```bash
npm run test:rules-ab -- --profile B
```

只先跑前 2 个题目做小样：

```bash
npm run test:rules-ab -- --limit 2
```

指定自定义题单文件：

```bash
npm run test:rules-ab -- --topic-file /你的路径/自定义题单.json
```

## 测试结果输出位置

每次执行后，结果会生成在：

```bash
ab-test-results/时间戳目录/
```

目录内会包含：

- `summary.md`
  - 汇总所有题目的结论、字数、摘要
- `results.json`
  - 结构化结果，便于后续人工整理
- 每个题目单独一份 Markdown 文件
  - 包含正文和审核报告

## 建议测试步骤

1. 先跑一轮完整 A/B：

```bash
npm run test:rules-ab
```

2. 打开 `summary.md`，先看这些维度：

- 审核结论有没有明显变化
- 字数是否更稳定
- B 是否明显减少套路感
- B 的审核报告是否更细、更可用

3. 再抽样打开每个题目的 Markdown 结果，重点比：

- 古文引用是否更像真的
- 真实人物信息是否更谨慎
- 三段结构是否更不容易“一模一样”
- 你自己主观上更愿意发哪一版

4. 如果 B 有明显收益，再扩大测试样本。

建议扩大到：

- 5 到 10 个固定选题
- 每种类型至少 2 篇

## 回退方式

如果测试后发现 `规则B` 不如 `规则A`：

- 不需要删任何代码
- 继续保持默认 `A`
- 停止使用 `--profile B` 即可

如果以后想正式切换到 `B`，再单独改默认值即可。

## 当前约束

- 当前只完成规则版本化和测试脚本
- 前端工作台还没有做可视化 A/B 切换开关
- 测试阶段建议优先使用脚本跑固定题单
