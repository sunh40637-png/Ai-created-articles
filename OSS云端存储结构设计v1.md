# OSS 云端存储结构设计 v1

## 1. 目标

这份文档用于确定当前项目接入阿里云 OSS 后的第一版数据组织方式。

当前目标只有一个：

- 让文章创作数据和素材文件脱离浏览器本地，支持同一账号在不同电脑上继续使用

当前版本不直接上数据库，先采用：

- 图片文件存 OSS
- 结构化数据也先存 OSS，但按“多文件拆分”方式存储

## 1.1 当前实现状态

这份文档最初是设计文档，现在已经部分落地。

当前已经完成：

- 会话云端同步
  - `content-system/sessions/*.json`
  - `content-system/index/sessions.json`
- 文章云端同步
  - `content-system/articles/*.json`
  - `content-system/index/articles.json`
- 选题库云端同步
  - `content-system/topic-library/topic-library.json`
  - `content-system/index/topics.json`
- 配置云端同步
  - `content-system/configs/writing-config.json`
  - `content-system/configs/system-config.json`
  - `content-system/index/configs.json`

当前还要特别说明两点：

1. 页面启动恢复历史时，已经会比较本机镜像和 OSS 云端，优先恢复更新的一份
2. `选题库` 和 `配置` 目前虽然已经同步到 OSS，但页面运行时仍主要使用代码内常量，不是直接从 OSS 读取
3. 项目级运行配置当前通过根目录 `runtime-config.shared.json` 跟踪
   - 两台电脑切换时，默认通过 Git 同步这份配置
   - `.env` 现在只作为本机临时覆盖

## 2. 设计原则

必须遵守：

1. 不再使用“一个大 JSON 文件存全部业务数据”的方式
2. 一篇文章一个 JSON
3. 一个 AI 会话一个 JSON
4. 选题库单独一个 JSON
5. 配置单独一个 JSON
6. 再维护一组轻量索引文件，供页面快速读取
7. 所有结构化文件必须带 `schemaVersion`、`id`、`createdAt`、`updatedAt`
8. OSS 开启版本控制，避免误删或误覆盖后无法恢复

## 3. OSS 目录结构

```text
content-system/
  index/
    articles.json
    sessions.json
    topics.json
    configs.json

  articles/
    article-20260402-a1b2c3.json
    article-20260402-d4e5f6.json

  sessions/
    session-20260402-a1b2c3.json
    session-20260402-d4e5f6.json

  topic-library/
    topic-library.json

  configs/
    writing-config.json
    system-config.json
```

## 4. 文件命名规则

### 4.1 文章文件

```text
articles/article-YYYYMMDD-短id.json
```

例如：

```text
articles/article-20260402-a1b2c3.json
```

### 4.2 会话文件

```text
sessions/session-YYYYMMDD-短id.json
```

例如：

```text
sessions/session-20260402-a1b2c3.json
```

### 4.3 关系约定

当前项目是一条 AI 对话对应一篇文章，所以：

- 一个 `sessionId` 只对应一个 `articleId`
- 一个 `articleId` 只对应一个 `sessionId`

## 5. 当前项目字段映射

当前本地 store 里的核心字段已经比较稳定，后续上 OSS 时按下面映射：

- `session.id` -> `sessionId`
- `session.title` -> `title`
- `session.stageId` -> `stageId`
- `session.topicSelection.selectedTopic` -> `topic`
- `session.messages` -> `messages`
- `session.draftReview.versions` -> `draftVersions`
- `session.draftReview.activeVersionId` -> `activeVersionId`
- `session.layoutReview` -> `layoutReview`
- `session.updatedAt` -> `updatedAt`

当前阶段值统一为：

- `topic`
- `draft`
- `preview`
- `completed`

## 6. 索引文件设计

索引文件只存轻量信息，不存全文。

### 6.1 `index/articles.json`

用途：

- 文章列表页
- 快速判断有哪些文章
- 快速显示状态、标题、母题、更新时间

建议结构：

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-04-02T14:30:00+08:00",
  "items": [
    {
      "articleId": "article-20260402-a1b2c3",
      "sessionId": "content-session-xxx",
      "title": "女人到了中年，最该远离的不是忙，而是这3种消耗",
      "stageId": "preview",
      "statusLabel": "已确认文字稿",
      "type": "B型",
      "penName": "明远",
      "theme": "家庭关系",
      "createdAt": "2026-04-02T10:00:00+08:00",
      "updatedAt": "2026-04-02T14:20:00+08:00",
      "path": "content-system/articles/article-20260402-a1b2c3.json"
    }
  ]
}
```

### 6.2 `index/sessions.json`

用途：

- 侧边栏 AI 对话历史
- 历史记录悬浮层
- 快速恢复最近会话

建议结构：

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-04-02T14:30:00+08:00",
  "items": [
    {
      "sessionId": "content-session-xxx",
      "articleId": "article-20260402-a1b2c3",
      "title": "女人到了中年，最该远离的不是忙，而是这3种消耗",
      "stageId": "preview",
      "hasHistory": true,
      "lastMessageAt": "2026-04-02T14:18:00+08:00",
      "updatedAt": "2026-04-02T14:20:00+08:00",
      "path": "content-system/sessions/session-20260402-a1b2c3.json"
    }
  ]
}
```

### 6.3 `index/topics.json`

用途：

- 选题库页面快速统计
- 判断某个选题是否已创作

建议结构：

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-04-02T14:30:00+08:00",
  "items": [
    {
      "topicId": "library-topic-01",
      "title": "真正有分寸的人，往往守住了这3条处世边界",
      "type": "A型",
      "theme": "做人处世智慧",
      "status": "pending",
      "linkedArticleId": null,
      "updatedAt": "2026-04-02T14:00:00+08:00"
    }
  ]
}
```

状态建议统一为：

- `pending`
- `in-progress`
- `completed`

### 6.4 `index/configs.json`

用途：

- 记录当前有哪些配置文件
- 记录版本号和最近更新时间

建议结构：

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-04-02T14:30:00+08:00",
  "items": [
    {
      "configId": "writing-config",
      "name": "文案创作配置",
      "version": 1,
      "path": "content-system/configs/writing-config.json",
      "updatedAt": "2026-04-02T14:00:00+08:00"
    },
    {
      "configId": "system-config",
      "name": "系统配置",
      "version": 1,
      "path": "content-system/configs/system-config.json",
      "updatedAt": "2026-04-02T14:00:00+08:00"
    }
  ]
}
```

## 7. 文章文件设计

文章文件只保存“文章视角”的数据，不保存完整消息历史。

建议结构：

```json
{
  "schemaVersion": 1,
  "articleId": "article-20260402-a1b2c3",
  "sessionId": "content-session-xxx",
  "title": "女人到了中年，最该远离的不是忙，而是这3种消耗",
  "stageId": "preview",
  "statusLabel": "已确认文字稿",
  "type": "B型",
  "penName": "明远",
  "theme": "家庭关系",
  "topic": {
    "id": "library-topic-20",
    "title": "女人到了中年，最该远离的不是忙，而是这3种消耗",
    "type": "B型",
    "penName": "明远",
    "theme": "家庭关系",
    "source": "preset"
  },
  "content": {
    "activeVersionId": "draft-version-03",
    "versionNumber": 3,
    "draftMarkdown": "## 正文内容...",
    "auditMarkdown": "## 校验报告...",
    "readableLength": 1700
  },
  "layoutReview": {
    "device": "mobile",
    "fontSize": "medium"
  },
  "assets": {
    "imageIds": [],
    "fixedLayoutConfigVersion": 1
  },
  "createdAt": "2026-04-02T10:00:00+08:00",
  "updatedAt": "2026-04-02T14:20:00+08:00"
}
```

## 8. 会话文件设计

会话文件保存“完整创作过程”，它是将来恢复 AI 对话最关键的数据文件。

建议结构：

```json
{
  "schemaVersion": 1,
  "sessionId": "content-session-xxx",
  "articleId": "article-20260402-a1b2c3",
  "title": "女人到了中年，最该远离的不是忙，而是这3种消耗",
  "stageId": "preview",
  "deepThinkingEnabled": true,
  "activeWorkbenchTab": "draft",
  "isWorkbenchOpen": true,
  "topicSelection": {
    "filterTypes": ["B型"],
    "pageIndex": 0,
    "selectedTopicId": "library-topic-20",
    "selectedTopic": {
      "id": "library-topic-20",
      "title": "女人到了中年，最该远离的不是忙，而是这3种消耗",
      "type": "B型",
      "penName": "明远",
      "theme": "家庭关系"
    },
    "source": "preset"
  },
  "messages": [],
  "draftReview": {
    "activeVersionId": "draft-version-03",
    "latestNote": "",
    "versions": []
  },
  "layoutReview": {
    "device": "mobile",
    "fontSize": "medium"
  },
  "runLogs": [],
  "processingFlow": null,
  "lastFlowSummary": null,
  "createdAt": "2026-04-02T10:00:00+08:00",
  "updatedAt": "2026-04-02T14:20:00+08:00"
}
```

说明：

- `messages` 保留完整对话
- `draftReview.versions` 保留完整版本历史
- `layoutReview` 保留当前预览偏好
- `runLogs`、`processingFlow` 用于后续排查生成问题

## 9. 选题库文件设计

`topic-library/topic-library.json` 存完整选题库。

建议结构：

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-04-02T14:30:00+08:00",
  "items": [
    {
      "id": "library-topic-01",
      "title": "真正有分寸的人，往往守住了这3条处世边界",
      "type": "A型",
      "penName": "芷若",
      "theme": "做人处世智慧",
      "reason": "适合从普通人的处境切入，写出细腻但有后劲的人情道理。",
      "status": "pending",
      "linkedArticleId": null,
      "createdAt": "2026-04-02T14:00:00+08:00",
      "updatedAt": "2026-04-02T14:00:00+08:00"
    }
  ]
}
```

字段说明：

- `status`
  - `pending`：未创作
  - `in-progress`：已被会话选中但未完成
  - `completed`：文章已完成到可记录状态
- `linkedArticleId`
  - 用于回查当前选题对应哪篇文章

## 10. 配置文件设计

### 10.1 `configs/writing-config.json`

存与文案创作相关的规则版本信息。

建议结构：

```json
{
  "schemaVersion": 1,
  "configId": "writing-config",
  "activeRuleProfile": {
    "A型": "stable",
    "B型": "candidate",
    "C型": "stable"
  },
  "penNames": ["明远", "芷若"],
  "updatedAt": "2026-04-02T14:00:00+08:00"
}
```

### 10.2 `configs/system-config.json`

存系统级行为配置。

建议结构：

```json
{
  "schemaVersion": 1,
  "configId": "system-config",
  "contentSessionStorageKey": "content-creation-sessions-v1",
  "topicPageSize": 6,
  "maxArticleSessions": 16,
  "updatedAt": "2026-04-02T14:00:00+08:00"
}
```

## 11. 写入顺序

因为 OSS 不是数据库，没有事务，所以写入顺序要固定。

### 11.1 更新会话

1. 先写 `sessions/session-xxx.json`
2. 再写 `index/sessions.json`

### 11.2 更新文章

1. 先写 `articles/article-xxx.json`
2. 再写 `index/articles.json`

### 11.3 更新选题创作状态

1. 先写 `topic-library/topic-library.json`
2. 再写 `index/topics.json`

## 12. 读取顺序

### 12.1 页面启动

建议顺序：

1. 先读 `index/sessions.json`
2. 再按需要读取具体 `session-xxx.json`
3. 如果缺失或 OSS 不可用，再退回当前本地缓存机制

### 12.2 文章列表页

建议顺序：

1. 先读 `index/articles.json`
2. 点击文章时再读具体 `article-xxx.json`

### 12.3 选题库页

建议顺序：

1. 直接读 `topic-library/topic-library.json`
2. 如需快速筛选统计，可同时读 `index/topics.json`

## 13. 与当前本地持久化的关系

当前项目已经有：

- `localStorage`
- `.local-data/content-creation-sessions.json`

当前实现里，这三层的角色已经基本确定为：

- OSS：云端镜像与跨设备恢复源
- localStorage：页面缓存
- `.local-data/`：本机兜底备份

也就是说：

1. 当前会优先比较本地与 OSS 的更新时间，再决定恢复哪一份
2. 本地缓存只负责提升加载速度和本机兜底
3. 不能让本地临时状态反向覆盖更新后的云端数据

## 14. 环境变量约定

后续实现时，本地 `.env` 统一使用：

```env
ALIYUN_OSS_BUCKET=
ALIYUN_OSS_REGION=
ALIYUN_OSS_ENDPOINT=
ALIYUN_OSS_ACCESS_KEY_ID=
ALIYUN_OSS_ACCESS_KEY_SECRET=
```

这几个值不进入 Git，不写进仓库文档。

## 15. 实施顺序回顾

当前已经按下面顺序完成：

1. 先接 `sessions/`
2. 再接 `articles/`
3. 再接 `index/sessions.json` 和 `index/articles.json`
4. 再接 `topic-library/topic-library.json`
5. 最后接 `configs/`

这个顺序保留不变，原因也没有变化：

- 会话和文章最直接影响“数据不丢”
- 索引接入后，页面切换和列表加载才会变快
- 选题库和配置文件最后接，改动面最小

## 16. 当前结论

这套 v1 方案适合作为当前项目的第一阶段云端持久化方案。

它的特点是：

- 比“一个大 JSON”稳定很多
- 比直接上数据库简单很多
- 能先解决跨电脑与本地丢失问题
- 后面如果要迁移数据库，也比较容易

当前它已经不是纯规划文档，而是“设计 + 已落地现状”的统一说明文档。

后续如果继续往下走，真正还没完成的重点只剩：

1. 让 `选题库` 和 `配置` 页面在运行时直接读 OSS，而不是只读代码常量
2. 视情况把素材库也纳入同一套云端结构
3. 如果后面进入多人或高频使用阶段，再考虑数据库方案
