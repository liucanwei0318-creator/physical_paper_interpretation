# PhysicaAnnotate 完整评测报告（v3 — 第三轮复测）

> **评测对象**：`https://paperinterpretation.ai.studio/`
> **源码**：`https://github.com/liucanwei0318-creator/physical_paper_interpretation`（最新 commit `67727cd2` "feat: add real-time AI quota monitor and model routing"）
> **评测时间**：2026-11-17（21:40–22:00 CST）
> **评测方式**：线上真实调用（含 strict 模式错误诊断）+ 全量代码审查 + 安装/类型检查/构建/39 项单元测试验证

---

## 一、结论速览

**综合评分：⭐⭐⭐⭐½（4.5 / 5）**

| 维度 | 得分 | 说明 |
|------|------|------|
| 产品设计 / 创新性 | ⭐⭐⭐⭐⭐ | 新增模型路由 + 配额监控，产品闭环进一步完整 |
| 功能完整度 | ⭐⭐⭐⭐⭐ | 8 阶段工作流 + 模型切换 + 额度面板 |
| 专业度 | ⭐⭐⭐⭐⭐ | 翻译/目录/公式还原质量实测优秀 |
| 代码健壮性 / 容错 | ⭐⭐⭐⭐⭐ | 级联降级、错误分类、空值防护、JSON 修复 |
| 工程化 | ⭐⭐⭐⭐⭐ | install/tsc/build/39 测试全绿，lockfile、代码分割齐备 |
| 性能 | ⭐⭐⭐⭐ | 入口 158KB(47KB gzip)；但默认模型每请求白付 6s 探测（见 P1-1） |
| 安全 / 成本控制 | ⭐⭐ | 有"监控"无"防护"：仍无限流/鉴权/硬性拦截（见 P1-2） |

> **核心判断**：本轮新增的"配额监控 + 模型路由"方向完全正确、实现质量高、测试覆盖到位；但实测暴露了一个**必须处理的运行事实**——旗舰模型（Hydrogen/Argon）在当前生产账号上不可用，应用实际 100% 运行在 Flash-Lite 上，且每次请求都为此付出额外延迟。配额系统仍是"可见性"而非"保护"。

---

## 二、本轮新增功能实测（线上真实调用）

| # | 测试 | 结果 | 证据 |
|---|------|------|------|
| 1 | `GET /api/health` | ✅ | 新增 `supportedModels: [hydrogen, argon, flash-lite]` |
| 2 | `POST /api/web-search`（strict 锁定 flash-lite） | ✅ | `modelUsed: gemini-3.1-flash-lite`，token 遥测完整（prompt 1105 / completion 968 / total 2073 / latency 5.4s） |
| 3 | `POST /api/web-search`（cascade 指定 argon） | ⚠️ 降级 | `requestedModel: argon → actualModel: flash-lite` |
| 4 | **`POST /api/web-search`（strict 锁定 hydrogen）** | 🔴 失败 | `errorCode: TIMEOUT`，latency 45010ms（45s 超时） |
| 5 | **`POST /api/web-search`（strict 锁定 argon）** | 🔴 失败 | `errorCode: RATE_LIMIT_429`，latency 108ms |
| 6 | `GET /api/usage-stats` | ⚠️ | 公开可读，含模型/token/耗时明细；`recentEntries` 正确记录每次调用 |

### 关键诊断（本轮最重要的发现）

**Google 已于 2026-11-11 正式发布 Gemini 4 Hydrogen 与 Gemini 4 Argon**（[官方博客](https://blog.google/intl/en-in/products/introducing-gemini-4-hydrogen/)、[DeepMind Model Card](https://deepmind.google/models/model-cards/gemini-4-hydrogen/)），模型名真实无误。但在当前生产账号上：

1. **Hydrogen：45 秒超时**。该模型默认 thinking 级别为 "high"（[apidog 文档](https://apidog.com/blog/gemini-4-hydrogen-api/)），长提示词下超过应用默认 45s 超时上限，且代码未显式设置 `thinkingLevel`。
2. **Argon：429 配额超限**。Argon 是前沿深度推理模型，免费层限额极低（应用自带的限额表即写明：免费层 RPM 5 / RPD 100），当前账号立即 429。
3. **级联模式下"首选模型不跳过冷却"**：`server.ts:199-203` 的冷却跳过逻辑排除了 `requestedModel`，因此默认 hydrogen 每次请求都要白付 6 秒探测超时（或 strict 下白等 45 秒）后才回退 Flash-Lite。
4. **实际后果**：生产环境 100% 的 AI 响应由 Flash-Lite 完成；UI 默认推荐并在顶栏展示的 "Hydrogen 主力" 从未成功过；每次调用额外 +6s 延迟。

---

## 三、全量工程验证（全绿）

```text
npm install      ✅ 182 packages（干净解析，无 ERESOLVE）
npx tsc --noEmit ✅ 0 报错
npx vite build   ✅ 1.26s；入口 158.33KB(47.10 gzip)；
                     QuotaAndModelModal 独立懒加载分包 29.68KB
node --test      ✅ 39/39 通过（新增 computeQuotaSummary / computeOfficialModelQuotas /
                     computePacificResetCountdown / computeModelRecommendation 等测试）
```

- 新增 `quotaTracker.ts`（954 行）核心算法（用量聚合、RPM/TPM/RPD 滚动窗口、PT 午夜倒计时、模型推荐）均有单元测试覆盖。
- 全部组件已从原生 `fetch` 迁移到 `apiFetch`，请求头注入（`x-preferred-gemini-model` / `x-model-routing-mode`）与客户端用量记账实际生效。
- 设置持久化已扩展并防御性归一化（模型、路由模式、层级、日预算 ≥10000 校验）。
- `bun.lock` 已删除（双锁文件问题消除），README 已同步新功能说明。

---

## 四、发现的问题（按严重度）

### 🔴 P1-1 旗舰模型生产不可用，默认路由白付延迟
- Hydrogen 45s 超时（未设置 thinkingLevel + 默认超时过短）、Argon 免费层 429。
- 级联不跳过已失败的首选模型 → 每次请求 +6s 探测（strict 下 +45s）。
- **建议**：
  1. 调用 hydrogen 时显式设置 `thinkingLevel: 'medium'`（或 low），并将氢/氩模型超时分级（如 hydrogen 90s、argon 120s、flash-lite 45s）；
  2. 冷却逻辑对首选模型连续 N 次失败后同样跳过（或记录"今日不可用"标记）；
  3. 免费层默认推荐改为 Flash-Lite，Argon 标注"免费层每日仅 100 次"；
  4. 把实测失败率纳入 `computeModelRecommendation`（目前只看 token 预算与官方限额百分比，未考虑实际可用性）。

### 🔴 P1-2 配额是"监控"不是"防护"（上轮 P0 建议仍悬空）
- `quotaTracker` 只有计算/展示函数（`shouldPromptSwitch` 是"建议"非"拦截"）；`generateWithCascadeDetailed` 调用 Gemini 前**不检查任何预算**。
- 全部 `/api/*` 仍无鉴权、无限流；`/api/usage-stats` 公开暴露用量明细，`/api/usage-stats/reset` 公开可清空账本。
- **建议**：加 `express-rate-limit` 按 IP 限流；服务端硬性每日 token 预算（超限直接返回 429 提示而非调用 Gemini）；`usage-stats` 系列加简单口令/环境变量鉴权。

### 🟡 P2-1 `installQuotaFetchInterceptor` 是空壳死代码
- `quotaTracker.ts:950-953` 函数体只设标志位，从未替换 `window.fetch`。当前因全组件已改用 `apiFetch` 而侥幸生效，但名字误导；未来新代码若用原生 `fetch` 将静默丢失模型路由与记账。建议删除该函数，或在其中真正 patch `window.fetch`。

### 🟡 P2-2 服务端账本仅内存、无聚合
- `serverUsageLedger` 是进程内数组（上限 250 条），实例重启即失；Cloud Run 多实例时各记各的，`/api/usage-stats` 只返回当前实例数据。建议落盘（文件/SQLite）或明确标注"单实例有效"。

### 🟡 P2-3 PORT 环境变量被忽略（移植性回归）
- `server.ts:905` 由 v2 的 `Number(process.env.PORT) || 3000` 改为硬编码 `const PORT = 3000`。当前 AI Studio 部署恰好用 3000 所以线上正常（README 也已写明），但移植到 Render/Fly.io/Railway 等动态端口平台将无法启动。建议恢复 env 支持。

### 🟢 P2-4 遗留：Google Fonts 仍走 CDN（`index.html` 未变）
- 有系统字体回退、影响小；可用 `@fontsource` 自托管。

---

## 五、上轮（v2）建议落实追踪

| v2 建议 | 状态 |
|---------|------|
| esbuild 冲突 / 测试脚本 / 代码分割 / KaTeX 本地化 / __dirname / clean 脚本 / 路径泄漏 / 乱码 / Node engines | ✅ 全部落实（上轮已验证） |
| P0：公开接口限流 + 用量上限 | ⚠️ 部分落实——加了"用量监控与模型路由"，但**硬性限流/拦截未做** |
| P1：LaTeX/Word/PDF + BibTeX 导出 | ❌ 未做 |
| P2：知识模型共享、章节级重译、术语一致性告警、Google Fonts 自托管 | ❌ 未做（字体仍未自托管） |
| 闪卡知识库、Docker/本地模型、国际化、移动端阅读模式 | ❌ 未做（P3，可后续） |

---

## 六、修改建议（本轮更新版）

### 立即修复（P1）
1. **修通模型可用性**（见 P1-1 四条具体方案）——这是本轮最影响体验的问题：用户以为在用旗舰模型，实际一直在 Flash-Lite 上还多付 6s。
2. **监控升级为防护**：IP 限流 + 服务端硬性日预算拦截 + usage-stats/reset 鉴权。

### 短期优化（P2）
3. 删除/实现 `installQuotaFetchInterceptor` 空壳；恢复 `process.env.PORT` 支持；服务端账本落盘；Google Fonts 自托管。

### 产品功能（延续上轮建议，按价值排序）
4. **多格式导出**（LaTeX/Word/PDF）+ **BibTeX 引用导出**——科研刚需；
5. **章节级重译 + 手动编辑锁定** + **术语一致性告警**；
6. **知识模型共享**（团队 K1–K4 基线）+ 术语表合并；
7. CI/CD（GitHub Actions 跑 lint/test/build）+ E2E（Playwright 核心工作流）；
8. 个人知识库/闪卡、公式索引、Docker 部署 + 本地模型适配、国际化、移动端阅读模式。

---

## 七、三轮评测演进

| 轮次 | 版本 | 综合评分 | 主要结论 |
|------|------|---------|---------|
| 第 1 轮 | 0c09a260 | ⭐⭐⭐⭐ | 产品出色；白屏/404/持久化缺失（代码中部分已修复）；P0 依赖冲突与测试不可运行 |
| 第 2 轮 | a7b6ba6c | ⭐⭐⭐⭐½ | 9 项工程问题全部修复并验证；发现公开接口无限流的成本风险 |
| 第 3 轮 | 67727cd2 | ⭐⭐⭐⭐½ | 模型路由 + 配额监控上线且质量高；实测发现旗舰模型不可用（45s 超时 / 429）与"监控无防护"两大问题 |
