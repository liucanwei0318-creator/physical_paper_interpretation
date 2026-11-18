# PhysicaAnnotate — 理论物理英文论文深度翻译与精准批注系统

**PhysicaAnnotate** 是一套面向理论物理与数学物理科研人员的全栈学术精读工作台。系统围绕**个人知识背景建模（K1–K4 四级掌握度）**与**防截断分节增量翻译引擎**构建，将英文预印本或期刊论文转化为包含严密数学推导还原、五类精准批注、伴读导师问答及联网文献核验的中文深度批注文稿。

---

## 核心功能特性

1. **AI 额度实时监控面板与 Gemini 模型自由切换（Hydrogen / Argon / Flash-Lite）**
   - **多模型自由切换**：支持在顶栏一键切换 **`gemini-4-hydrogen`**（推荐高速均衡主力）、**`gemini-4-argon`**（深度推理旗舰，附免费层 `100 RPD / 5 RPM` 限额提示）与 **`gemini-3.1-flash-lite`**（轻量极速省流），支持「智能级联容错（带失败冷却跳过）」与「严格锁定模型」两种调度模式。
   - **Google AI Studio 官方配额监控与智能推荐**：支持切换「免费层级 Free Tier」与「付费层级 Tier 1」官方限额标准，按太平洋时间（`America/Los_Angeles`）实时计算各模型 **RPD（每日请求）**、**60 秒滚动 RPM/TPM** 与下次重置倒计时（`00:00 PT`），并根据当前预算压力与任务类型智能推荐轻量模型。
2. **K1–K4 个人知识背景建模（阶段 1）**
   - 支持录入已读教材（内置 Landau、Weinberg、Peskin、Sakurai、Wald、Polchinski 等经典理论物理教材章节目录解析）与前沿论文，精细区分 K1（已掌握免冗余批注）、K2（接触过按需提示）、K3（未读知识缺口）与 K4（论文专属核心机制）。
3. **多源论文导入与全局预分析（阶段 2）**
   - 支持 **arXiv ID / URL 自动抓取**（优先提取 arXiv e-print TeX 源码以完整保留原始 LaTeX 方程，回退至 ar5iv HTML 与 Atom API）、**PDF 原文解析**与**纯文本/LaTeX 粘贴**。
4. **防截断分节深度翻译与边译边读（阶段 3）**
   - 按论文自然章节（`\section` / 编号标题）智能切分长文，逐节生成中文学术译文与五类深度批注。
   - **边译边存与断点续译**：每译完一节立即写入本地持久化快照，支持中途随时切换至阅读视图边译边读，刷新后可一键从断点续译剩余章节。
5. **专业术语对照表、文献核验与多格式学术导出（阶段 4）**
   - 自动汇总全文「中文术语（English Term）」首次出现规范表、交互式术语词云与 CrossRef / arXiv 文献核验。
   - 支持一键导出 **Markdown (`.md`)**、**LaTeX 源码 (`.tex`, `ctexart` 中文学术排版)** 与 **BibTeX 引文库 (`.bib`)**，内置本地自托管学术字体（`Plus Jakarta Sans`、`Source Serif 4`、`IBM Plex Mono`）。

---

## 运行环境要求与快速开始

- **Node.js**：`>= 22.18.0`
- **环境变量**：在项目根目录创建 `.env`（参考 `.env.example`，切勿提交真实密钥至版本库）：
  ```bash
  GEMINI_API_KEY="your_gemini_api_key"
  ```

```bash
# 1. 安装依赖
npm install

# 2. 运行单元测试套件
npm test

# 3. TypeScript 严格类型检查
npm run lint

# 4. 构建生产环境分包产物
npm run build

# 5. 启动生产服务 (默认监听 3000 端口)
npm start
```
