{{sharedContext}}

待审核正文：
{{draftMarkdown}}

输出要求：
{{reportInstruction}}
{{reportFormattingInstruction}}
- 必须额外检查正文里 [IMAGE_1]、[IMAGE_2]、[IMAGE_3]、[ENDING] 是否齐全且顺序正确。
- 必须额外检查正文是否满足“一级标题 + 开头正文 + 3 个主体段 + [ENDING] + 结尾标题 + 结尾正文 + 祝福语”的固定 Markdown 骨架。
- 如果主体段数不等于 3，可记录为结构偏差，但不要因此丢弃正文内容；只有在标题层级、结尾结构或主体边界无法稳定识别时，才优先判为 rewrite。
- generatedTitle：基于当前正文内容生成的 1 个正式标题，直接供右侧文字稿和后续排版使用。
- revisionBrief：用 4 到 8 条简短项目符号总结“下一步必须改什么”，只保留修订执行要点，不要复述整份长报告。
- decision：只能输出 pass / partial / rewrite 其中一个。
- summary：一句适合展示在工作流里的简短总结。

{{titleGenerationRequirements}}

再次提醒：只返回 JSON 对象本身，不要加 ```json 代码块。
