import type { AnnotationDetailLevel, WorkspaceSettings } from '../types/physics.ts';

export const DEFAULT_ANNOTATION_DETAIL_LEVEL: AnnotationDetailLevel = 3;
export const DEFAULT_MANUSCRIPT_WIDTH_PERCENT = 58;
export const MIN_MANUSCRIPT_WIDTH_PERCENT = 36;
export const MAX_MANUSCRIPT_WIDTH_PERCENT = 76;

export function clampManuscriptWidthPercent(raw: unknown): number {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) {
    return DEFAULT_MANUSCRIPT_WIDTH_PERCENT;
  }
  const rounded = Math.round(num);
  if (rounded < MIN_MANUSCRIPT_WIDTH_PERCENT) return MIN_MANUSCRIPT_WIDTH_PERCENT;
  if (rounded > MAX_MANUSCRIPT_WIDTH_PERCENT) return MAX_MANUSCRIPT_WIDTH_PERCENT;
  return rounded;
}

export function computeManuscriptWidthPercentFromPointer(
  clientX: number,
  containerLeft: number,
  containerWidth: number
): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(containerLeft) || !(containerWidth > 0)) {
    return DEFAULT_MANUSCRIPT_WIDTH_PERCENT;
  }
  const rawPercent = ((clientX - containerLeft) / containerWidth) * 100;
  return clampManuscriptWidthPercent(rawPercent);
}

export interface AnnotationDetailProfile {
  level: AnnotationDetailLevel;
  shortLabel: string;
  academicProfile: string;
  annotationDepthSummary: string;
  derivationVerbositySummary: string;
  derivationStepHint: string;
  annotationCountMultiplier: number;
  previewSample: {
    conceptHeader: string;
    explanationText: string;
    steps: Array<{ label: string; latex?: string; text: string }>;
  };
}

export const ANNOTATION_DETAIL_PROFILES: Record<
  AnnotationDetailLevel,
  AnnotationDetailProfile
> = {
  1: {
    level: 1,
    shortLabel: '极简前沿',
    academicProfile: '资深研究者 / 同方向博士后及以上',
    annotationDepthSummary:
      '仅保留论文原创 K4 关键创新、核心物理假设边界与易混淆符号；全面跳过 K1/K2 及常规技术细节，追求零干扰精读体验。',
    derivationVerbositySummary:
      '极简提要模式：仅列出起始作用量/算符与最终结论公式，省略所有中间代数变形与标准恒等式（约 1 步核心跳转）。',
    derivationStepHint: '1 步关键跃迁（只列核心起止式与物理结论）',
    annotationCountMultiplier: 0.5,
    previewSample: {
      conceptHeader: '【数学推导｜单圈有效作用量】Lv.1 极简点睛',
      explanationText:
        '在背景场 $\\phi_{\\text{cl}}$ 上对涨落做高斯鞍点积分并取 Legendre 变换即得 1PI 单圈修正。',
      steps: [
        {
          label: '核心结论',
          latex: '\\Gamma^{(1)}[\\phi_{\\text{cl}}] = S[\\phi_{\\text{cl}}] + \\frac{i\\hbar}{2}\\mathrm{Tr}\\ln\\!\\left(-\\frac{\\delta^2 S}{\\delta\\phi^2}\\right)',
          text: '关键前提：背景场缓变且二次涨落算符无负模。',
        },
      ],
    },
  },
  2: {
    level: 2,
    shortLabel: '精炼要点',
    academicProfile: '高年级博士生 / 具备相近领域文献基础',
    annotationDepthSummary:
      '重点批注 K3 陌生理论与 K4 论文核心方法；K2 相关概念仅给出物理图像与关键结论，避免冗长背景铺垫。',
    derivationVerbositySummary:
      '精炼推导模式：保留 1–2 个决定推导方向的关键转折式与核心定理依据，省略标准高斯积分与常规微积分化简。',
    derivationStepHint: '1–2 步核心转折（保留关键定理与转折公式）',
    annotationCountMultiplier: 0.75,
    previewSample: {
      conceptHeader: '【数学推导｜单圈有效作用量】Lv.2 精炼要点',
      explanationText:
        '通过 $\\phi = \\phi_{\\text{cl}} + \\sqrt{\\hbar}\\,\\eta$ 做半经典展开，利用运动方程消去一阶项后对二阶高斯积分求行列式。',
      steps: [
        {
          label: '关键展开',
          latex: 'Z[J] \\approx e^{i(S[\\phi_{\\text{cl}}] + \\int J\\phi_{\\text{cl}})/\\hbar}\\left(\\det\\frac{\\delta^2 S}{\\delta\\phi^2}\\right)^{-1/2}',
          text: '由 $\\ln\\det \\mathcal{M} = \\mathrm{Tr}\\ln\\mathcal{M}$ 直接转入单圈有效作用量。',
        },
        {
          label: '物理判据',
          text: '需保证二阶算符正定性以维持真空稳定性。',
        },
      ],
    },
  },
  3: {
    level: 3,
    shortLabel: '标准学术',
    academicProfile: '理论物理研究生 / 科研均衡精读（默认）',
    annotationDepthSummary:
      '严格遵循 K1–K4 分级原则：K1 自动精简隐藏，K2 在复杂衔接处适度点拨，K3/K4 围绕概念实质、物理机制、易错辨析展开。',
    derivationVerbositySummary:
      '标准推导模式：拆解被作者跳过的 2–3 个关键中间步骤，显式标明【原文推导】【补充推导】【独立核验】及核心符号定义。',
    derivationStepHint: '2–3 步标准拆解（兼顾中间步骤与阅读节奏）',
    annotationCountMultiplier: 1.0,
    previewSample: {
      conceptHeader: '【数学推导｜单圈有效作用量】Lv.3 标准学术',
      explanationText:
        '对连通生成泛函 $W[J] = -i\\hbar\\ln Z[J]$ 作 Legendre 变换得到 1PI 有效作用量 $\\Gamma[\\phi_{\\text{cl}}]$，衔接微扰论与量子修正。',
      steps: [
        {
          label: '【原文推导】步骤 1：背景场二阶展开',
          latex: 'S[\\phi_{\\text{cl}} + \\sqrt{\\hbar}\\eta] = S[\\phi_{\\text{cl}}] + \\frac{\\hbar}{2}\\int \\eta\\,\\frac{\\delta^2 S}{\\delta\\phi^2}\\eta + \\mathcal{O}(\\hbar^{3/2})',
          text: '一阶变分与外源项 $\\int J\\eta$ 依经典运动方程精确抵消。',
        },
        {
          label: '【补充推导】步骤 2：泛函高斯积分',
          latex: 'W[J] = S[\\phi_{\\text{cl}}] + \\int J\\phi_{\\text{cl}} + \\frac{i\\hbar}{2}\\mathrm{Tr}\\ln\\!\\left(-\\frac{\\delta^2 S}{\\delta\\phi^2}\\right)',
          text: '利用矩阵对数恒等式化简泛函行列式，再作 Legendre 变换消去 $J$。',
        },
        {
          label: '【独立核验】步骤 3：量纲与 $\\hbar$ 阶数核验',
          text: '验证 $\\mathrm{Tr}\\ln$ 项处于 $\\mathcal{O}(\\hbar)$ 单圈量级且与 1PI 圈图展开一致。',
        },
      ],
    },
  },
  4: {
    level: 4,
    shortLabel: '深度展开',
    academicProfile: '跨方向研究者 / 硕士进阶补强',
    annotationDepthSummary:
      '充分展开 K2–K4 概念的前置知识锚点、适用条件限制、不同教材记号差异及对后续章节论证链条的影响。',
    derivationVerbositySummary:
      '详尽推导模式：拆解 3–4 个细粒度中间步骤，显式补充算符对易、积分换元、分部积分边界项消去及主要符号字典。',
    derivationStepHint: '3–4 步详尽推导（含前置桥梁、代换细节与符号表）',
    annotationCountMultiplier: 1.25,
    previewSample: {
      conceptHeader: '【数学推导｜单圈有效作用量】Lv.4 深度展开',
      explanationText:
        '完整对比生成泛函 $Z[J]$、连通泛函 $W[J]$ 与 1PI 有效作用量 $\\Gamma[\\phi_{\\text{cl}}]$ 的物理层级差异，补充无限维泛函积分测度记号细节。',
      steps: [
        {
          label: '【前置知识】步骤 1：有限维至泛函高斯积分推广',
          latex: '\\int \\prod_i d\\eta_i\\, e^{\\frac{i}{2}\\eta^T A \\eta} = (2\\pi i)^{N/2}(\\det A)^{-1/2}',
          text: '将离散指标 $i$ 连续化为时空坐标 $x$，并把常因子吸收进路径积分归一化。',
        },
        {
          label: '【原文推导】步骤 2：鞍点处线性项消去',
          latex: '\\frac{\\delta S}{\\delta\\phi}\\Big|_{\\phi_{\\text{cl}}} + J(x) = 0',
          text: '由驻相条件确定经典构型 $\\phi_{\\text{cl}}[J]$，消除 $\\mathcal{O}(\\sqrt{\\hbar})$ 涨落项。',
        },
        {
          label: '【补充推导】步骤 3：矩阵对数与泛函迹转换',
          latex: '-i\\hbar\\ln(\\det\\mathcal{M})^{-1/2} = \\frac{i\\hbar}{2}\\mathrm{Tr}\\ln\\mathcal{M}',
          text: '注意玻色场（$-1/2$ 幂）与费米 Grassmann 场（$+1$ 幂）的行列式幂次符号差别。',
        },
        {
          label: '【独立核验】步骤 4：Legendre 变换与边界收敛性',
          text: '核验在欧氏延拓下算符 $\\mathcal{M}_E > 0$ 确保高斯积分绝对收敛。',
        },
      ],
    },
  },
  5: {
    level: 5,
    shortLabel: '逐式精讲',
    academicProfile: '初入该方向 / 数学工具与物理图像全展开',
    annotationDepthSummary:
      '最大化教学导师详尽度：逐一解释 K2/K3/K4 概念的来龙去脉、前置定理、物理图像类比、常见误区及记号约定冲突排查。',
    derivationVerbositySummary:
      '保姆级逐式推导模式：提供 4–6 步零跳步数学展开，覆盖分部积分边界项、指标收缩规则、因子 $1/2$ 与 $i$ 的来源及极限量纲检验。',
    derivationStepHint: '4–6 步逐式精讲（零跳步代数展开与完整符号核验）',
    annotationCountMultiplier: 1.5,
    previewSample: {
      conceptHeader: '【数学推导｜单圈有效作用量】Lv.5 逐式精讲',
      explanationText:
        '从路径积分第一性原理出发，逐行拆解 $\\hbar$ 幂次重整、泛函微分定义、分部积分边界假设、Wick 转动与 Legendre 变换全过程。',
      steps: [
        {
          label: '【前置知识】步骤 1：泛函导数与格林函数逆元定义',
          latex: '\\frac{\\delta \\phi(x)}{\\delta \\phi(y)} = \\delta^{(d)}(x-y), \\quad \\mathcal{M}(x,y) = \\frac{\\delta^2 S}{\\delta\\phi(x)\\delta\\phi(y)}',
          text: '明确分布意义下的泛函微分操作，避免与普通偏导数混淆。',
        },
        {
          label: '【原文推导】步骤 2：引入 $\\sqrt{\\hbar}$ 标度展开',
          latex: '\\phi(x) = \\phi_{\\text{cl}}(x) + \\sqrt{\\hbar}\\,\\eta(x)',
          text: '指数因子 $1/\\hbar$ 与二阶项中的 $(\\sqrt{\\hbar})^2$ 恰好相消，使高斯积分权重独立于 $\\hbar$。',
        },
        {
          label: '【补充推导】步骤 3：分部积分与边界项严格消去',
          latex: '\\int_{\\mathcal{M}} d^dx\\, \\eta\\,\\partial^2\\eta = -\\int_{\\mathcal{M}} d^dx\\,(\\partial\\eta)^2 + \\int_{\\partial\\mathcal{M}} d\\Sigma_\\mu\\,\\eta\\,\\partial^\\mu\\eta',
          text: '要求涨落场在无穷远边界衰减 $\\eta|_{\\partial\\mathcal{M}} = 0$，保证微分算符自伴性。',
        },
        {
          label: '【补充推导】步骤 4：对角化算符并逐本征值求积分',
          latex: '\\det\\mathcal{M} = \\prod_n \\lambda_n \\implies \\ln\\det\\mathcal{M} = \\sum_n \\ln\\lambda_n = \\mathrm{Tr}\\ln\\mathcal{M}',
          text: '说明离散本征谱乘积如何过渡到动量空间积分 $\\int \\frac{d^dk}{(2\\pi)^d}$。',
        },
        {
          label: '【独立核验】步骤 5：Legendre 逆关系与有效势极限检验',
          latex: '\\frac{\\delta \\Gamma}{\\delta \\phi_{\\text{cl}}} = -J, \\quad \\Gamma[\\phi_0] = -\\Omega_d\\, V_{\\text{eff}}(\\phi_0)',
          text: '在常背景场 $\\phi_{\\text{cl}} = \\phi_0$ 下核验量纲与 Coleman-Weinberg 有效势符号完全自洽。',
        },
      ],
    },
  },
};

export function normalizeAnnotationDetailLevel(raw: unknown): AnnotationDetailLevel {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) {
    return DEFAULT_ANNOTATION_DETAIL_LEVEL;
  }
  const rounded = Math.round(num);
  if (rounded <= 1) return 1;
  if (rounded === 2) return 2;
  if (rounded === 3) return 3;
  if (rounded === 4) return 4;
  return 5;
}

export function normalizeWorkspaceSettings(raw: unknown): WorkspaceSettings {
  if (!raw || typeof raw !== 'object') {
    return { annotationDetailLevel: DEFAULT_ANNOTATION_DETAIL_LEVEL };
  }
  const candidate = raw as Partial<WorkspaceSettings>;
  const normalized: WorkspaceSettings = {
    annotationDetailLevel: normalizeAnnotationDetailLevel(candidate.annotationDetailLevel),
  };
  if (candidate.manuscriptWidthPercent !== undefined) {
    normalized.manuscriptWidthPercent = clampManuscriptWidthPercent(
      candidate.manuscriptWidthPercent
    );
  }
  if (
    candidate.preferredGeminiModel === 'gemini-4-hydrogen' ||
    candidate.preferredGeminiModel === 'gemini-4-neon' ||
    candidate.preferredGeminiModel === 'gemini-4-carbon' ||
    candidate.preferredGeminiModel === 'gemini-4-argon' ||
    candidate.preferredGeminiModel === 'gemini-3.1-flash-lite'
  ) {
    normalized.preferredGeminiModel = candidate.preferredGeminiModel;
  }
  if (candidate.modelRoutingMode === 'cascade' || candidate.modelRoutingMode === 'strict') {
    normalized.modelRoutingMode = candidate.modelRoutingMode;
  }
  if (candidate.geminiAccountTier === 'free' || candidate.geminiAccountTier === 'tier1') {
    normalized.geminiAccountTier = candidate.geminiAccountTier;
  }
  if (
    typeof candidate.dailyTokenBudget === 'number' &&
    Number.isFinite(candidate.dailyTokenBudget) &&
    candidate.dailyTokenBudget >= 10_000
  ) {
    normalized.dailyTokenBudget = Math.round(candidate.dailyTokenBudget);
  }
  return normalized;
}

export function getAnnotationDetailProfile(level: unknown): AnnotationDetailProfile {
  return ANNOTATION_DETAIL_PROFILES[normalizeAnnotationDetailLevel(level)];
}

/**
 * Generates an explicit, authoritative prompt directive for Gemini endpoints
 * based on the user's global "批注详细程度" slider (1..5).
 */
export function buildGeminiAnnotationDetailDirective(
  levelInput: unknown,
  context: 'pre_analysis' | 'translation' | 'chat' | 'deep_dive' | 'mindmap'
): string {
  const profile = getAnnotationDetailProfile(levelInput);
  const commonHeader = `【全局批注详细程度设置：Lv.${profile.level} / 5（${profile.shortLabel}｜适用水平：${profile.academicProfile}）】
- 批注深度要求：${profile.annotationDepthSummary}
- 公式推导冗长程度要求：${profile.derivationVerbositySummary}`;

  if (context === 'pre_analysis') {
    return `${commonHeader}
- 预分析输出调整：请据此合理规划各节的 plannedAnnotationCount（系数约 ${profile.annotationCountMultiplier}x）及 gapAnalysisSummary 中的推导展开策略。Lv.1–2 应控制批注条目高度精简；Lv.4–5 应主动预留充裕的前置知识与中间推导拆分计划。`;
  }

  if (context === 'translation') {
    return `${commonHeader}
- 全文翻译批注控制：严格保持中文学术翻译本身的完整忠实度不变，但按 Lv.${profile.level} 动态调节每条批注的详略与 formulaAnalysis.derivationSteps 长度（目标：${profile.derivationStepHint}）。
  * Lv.1（极简前沿）：仅在 K4 或极易误解处添加极简批注，whatItIs / mathOrPhysicalMechanism 控制在 1–2 句精炼要点，derivationSteps 仅保留 1 步核心起止跳转，省略 prerequisitesNeeded 与常规推导。
  * Lv.2（精炼要点）：聚焦 K3/K4 核心障碍，省略常规代数变形，derivationSteps 保留 1–2 步关键转折式。
  * Lv.3（标准学术）：均衡提供 2–3 步【原文推导】【补充推导】【独立核验】，准确说明概念实质、机制与易错点。
  * Lv.4（深度展开）：详尽填写真实必需的前置知识、符号字典、定理依据与易错辨析，derivationSteps 展开至 3–4 步。
  * Lv.5（逐式精讲）：最大化数学推导的细粒度与可读性，derivationSteps 展开至 4–6 步，显式写出分部积分边界项、标度幂次、量纲核验与物理图像类比。`;
  }

  if (context === 'mindmap') {
    return `${commonHeader}
- 数学推导思维导图树深度控制：按 Lv.${profile.level} 调节树状节点数量与每个节点的代数展开程度（${profile.derivationStepHint}）。Lv.1–2 聚焦主干逻辑（每分支 1–2 个精炼节点，直指关键变换与结论）；Lv.3 保持均衡的 3 主干 × 2–3 子步骤；Lv.4–5 细化至多层子步骤，显式补齐前置定理、中间算符展开、边界条件与极限量纲独立核验节点。`;
  }

  if (context === 'deep_dive') {
    return `${commonHeader}
- 追问推导回复控制：按 Lv.${profile.level} 调节推导步骤数量与解释展开篇幅（${profile.derivationStepHint}）。Lv.1–2 直接给出核心关键步与结论判据，不赘述常规运算；Lv.4–5 逐步展开每一步中间变形、因子来源与极限检验。`;
  }

  // context === 'chat'
  return `${commonHeader}
- 伴读导师回答详略控制：按 Lv.${profile.level} 调节回答长度、前置背景铺垫与公式推导步骤数目（${profile.derivationStepHint}）。Lv.1–2 力求凝练直击核心推导关键跃迁；Lv.3 均衡严谨；Lv.4–5 详细拆解中间每一步变形、物理图像与边界/量纲核验。`;
}
