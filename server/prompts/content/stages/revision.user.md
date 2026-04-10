{{sharedContext}}

修订方式：{{revisionLabel}}

当前正文：
{{draftMarkdown}}

修订摘要：
{{revisionBrief}}

输出要求：
- draftMarkdown：修订后的最终正文 Markdown。
- 修订后的 draftMarkdown 必须严格遵守固定 Markdown 骨架与占位符结构。
- reportMarkdown：基于修订后正文输出的最终校验报告 Markdown。
- generatedTitle：基于修订后正文内容生成的 1 个正式标题，直接供右侧文字稿和后续排版使用。
- summary：一句适合展示在工作流里的简短总结。

{{titleGenerationRequirements}}

再次提醒：只返回 JSON 对象本身，不要加 ```json 代码块。
