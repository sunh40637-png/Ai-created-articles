# 文章内容自动化创作系统

面向微信公众号内容生产的 AI 创作工作台。

这个项目把选题、长文创作、短文生成、素材管理、固定模板预览、微信草稿同步和云端镜像检查放进了同一个界面，适合做公众号内容的连续生产和多设备协作。

## 核心能力

- 长文创作工作台
  从选题确认、首版稿件生成、校验报告，到固定模板排版预览，形成完整闭环。
- 短文生成模块
  独立会话、版本切换、发布状态管理，适合快速产出纯文字短内容。
- 选题库
  支持主题筛选、分页推荐和创作进度映射。
- 素材库
  本地目录导入、标签管理、素材查看与正文配图匹配。
- 固定模板配置
  针对公众号固定样式做模板预览和图片位配置。
- 微信集成
  支持微信草稿同步和微信剪贴板 HTML 准备。
- 云端同步中心
  当前采用“本地自动保存 + 系统设置手动同步”的模式，先检查本地与云端差异，再决定是否同步或恢复。

## 当前工作流

1. 在 `选题库` 中选择或筛选选题
2. 进入长文工作台生成正文和校验报告
3. 在 `素材库` 和 `模板配置` 中确认配图与版式
4. 在 `排版预览` 中查看固定模板效果
5. 根据需要同步到微信草稿或复制到微信编辑器
6. 在 `系统设置` 中检查并手动执行云端同步

## 技术栈

- React 19
- Vite 8
- Zustand
- Tailwind CSS 4
- shadcn/ui 风格组件
- 多模型文本生成（默认 GLM 5.1）
- 豆包 ASR 音频转写
- 阿里云 OSS 云端镜像
- 微信公众号草稿与剪贴板接口

## 项目模块

- `长文创作`
  主工作台，负责选题、正文、校验、预览和会话历史。
- `短文生成`
  独立的短内容会话模块。
- `选题库`
  题库浏览与推荐管理。
- `文章列表`
  已完成或已进入排版阶段的内容列表。
- `素材库`
  统一管理素材资源和标签。
- `模板配置`
  管理固定模板里的图片位、间距和预览。
- `系统设置`
  查看本地与云端状态，执行手动同步。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

基础配置示例：

```env
LLM_PROVIDER=glm
LLM_API_KEY=
LLM_MODEL=glm-5.1
LLM_BASE_URL=
GLM_API_KEY=
GLM_MODEL=glm-5.1
DOUBAO_ASR_APP_ID=
DOUBAO_ASR_ACCESS_KEY=
DOUBAO_ASR_RESOURCE_ID=volc.bigasr.auc_turbo
FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
```

### 3. 可选：配置共享运行时能力

如果你需要启用 OSS 云端镜像或微信接口，可以在根目录创建或完善 `runtime-config.shared.json`：

```json
{
  "llm": {
    "activeProfileId": "glm-main",
    "profiles": [
      {
        "id": "glm-main",
        "name": "GLM 5.1 主账号",
        "provider": "glm",
        "model": "glm-5.1",
        "apiKey": "",
        "baseUrl": "",
        "enabled": true
      }
    ]
  },
  "aliyunOss": {
    "accessKeyId": "",
    "accessKeySecret": "",
    "bucket": "",
    "endpoint": "",
    "region": ""
  },
  "doubaoAsr": {
    "appId": "",
    "accessKey": "",
    "resourceId": "volc.bigasr.auc_turbo"
  },
  "wechatOfficialAccount": {
    "appId": "",
    "appSecret": ""
  }
}
```

说明：

- `LLM 模型中心` 统一管理长文、短文、选题与拆解使用的当前模型
- `阿里云 OSS` 用于内容云端镜像
- `豆包 ASR` 用于音频转写
- `微信公众号配置` 用于草稿同步

### 4. 启动开发环境

```bash
npm run dev
```

默认访问：

- [http://127.0.0.1:5173](http://127.0.0.1:5173)

### 5. 构建生产产物

```bash
npm run build
```

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动本地开发环境 |
| `npm run build` | 构建前端产物 |
| `npm run preview` | 预览构建结果 |
| `npm run import:library-assets` | 导入素材库图片 |
| `npm run test:rules-ab` | 运行文案规则 A/B 测试 |

## 目录结构

```text
.
├── api/                         # Vercel/本地开发 API 入口
├── public/                      # 静态资源
├── scripts/                     # 脚本工具
├── server/                      # 服务端能力与适配层
├── shared/                      # 前后端共享逻辑
├── src/
│   ├── components/              # 页面与业务组件
│   ├── lib/                     # 客户端工具函数
│   ├── pages/                   # 页面入口
│   └── stores/                  # Zustand 状态管理
├── runtime-config.shared.json   # 运行时共享配置
└── README.md
```

## 同步策略

当前仓库里的内容同步策略是：

- 本地数据：自动保存
- 云端数据：手动同步
- 检查方式：先比较本地和 OSS 的内容状态，再显示可执行操作

这套设计的目的，是让多设备切换时更可控，避免“自动上云但用户无感”的情况。

## 适合的使用场景

- 微信公众号长文生产
- 纯文字短文批量生成
- 固定模板内容排版
- 私有化内容工作台
- 多设备切换下的内容管理

## 注意事项

- 本仓库依赖你自己的 API Key 和云配置，提交前请确认不要把真实密钥推送到远端。
- 如果未配置 OSS，系统设置中的云端同步功能会显示为不可用。
- 微信相关能力依赖你自己的公众号配置与接口权限。

## 未来可继续完善的方向

- 登录系统与多设备账号同步
- 桌面端打包
- 更细粒度的同步记录与冲突处理
- 更完整的素材审核和内容版本管理

## License

当前仓库未附带独立 License 文件。如需公开分发或商业化，建议补充明确的授权协议。
