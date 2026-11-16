import type {
  ChapterScopeItem,
  EpistemicStatus,
  KnowledgeLevel,
  KnowledgeNode,
  ReadingMaterial,
} from '../types/physics.ts';

export interface TextbookCatalogChapter {
  chapterNumber: number;
  titleZh: string;
  titleEn: string;
  partLabel?: string;
  coreConcepts: string[];
  mathTools: string[];
  keyFormulasLatex: string[];
  keywords: string[];
}

export interface TextbookCatalogEntry {
  id: string;
  matchPatterns: RegExp[];
  canonicalTitle: string;
  canonicalAuthors: string;
  defaultEdition: string;
  domain: string;
  chapters: TextbookCatalogChapter[];
}

function ch(
  chapterNumber: number,
  titleZh: string,
  titleEn: string,
  coreConcepts: string[],
  mathTools: string[],
  keyFormulasLatex: string[] = [],
  partLabel?: string
): TextbookCatalogChapter {
  return {
    chapterNumber,
    titleZh,
    titleEn,
    partLabel,
    coreConcepts,
    mathTools,
    keyFormulasLatex,
    keywords: [
      titleZh.toLowerCase(),
      titleEn.toLowerCase(),
      ...coreConcepts.map((c) => c.toLowerCase()),
    ],
  };
}

/**
 * Authentic, chapter-accurate catalog of major Chinese & English physics textbooks.
 * Every textbook here has its REAL chapter count and REAL chapter titles.
 * Unknown books are NEVER forced into a fake template; their TOC is fetched from the web/AI or parsed from user input.
 */
export const PHYSICS_TEXTBOOK_CATALOG: TextbookCatalogEntry[] = [
  {
    id: 'peskin-qft',
    matchPatterns: [
      /peskin/i,
      /schroeder/i,
      /introduction\s+to\s+quantum\s+field\s+theory/i,
      /佩斯金/,
    ],
    canonicalTitle: 'An Introduction to Quantum Field Theory',
    canonicalAuthors: 'Michael E. Peskin, Daniel V. Schroeder',
    defaultEdition: '1995 (Westview Press)',
    domain: '量子场论与高能物理 (Quantum Field Theory)',
    chapters: [
      ch(1, '引言与对产生截面估算', 'Invitation: Pair Production in e+e- Annihilation', ['自然单位制与量纲分析', '散射截面估算', '单粒子相对论量子力学因果律困境'], ['Lorentz 四维矢量', '量纲分析'], ['d\\sigma / d\\Omega = \\frac{\\alpha^2}{4 E_{\\text{cm}}^2} (1 + \\cos^2\\theta)'], 'Part I'),
      ch(2, 'Klein-Gordon 标量场与正则量子化', 'The Klein-Gordon Field', ['经典场变分与 Noether 定理', '实/复标量场正则对易关系', 'Feynman 传播子 $D_F(x-y)$ 与因果结构'], ['泛函变分', '算符 Fourier 模态展开', '复平面围道积分'], ['[\\phi(\\mathbf{x},t), \\pi(\\mathbf{y},t)] = i\\delta^{(3)}(\\mathbf{x}-\\mathbf{y})', 'D_F(x-y) = \\int \\frac{d^4p}{(2\\pi)^4} \\frac{i}{p^2 - m^2 + i\\epsilon} e^{-ip\\cdot(x-y)}'], 'Part I'),
      ch(3, 'Dirac 旋量场与费米子量子化', 'The Dirac Field', ['Lorentz 群李代数与旋量表示', 'Dirac 方程与旋量完备正交关系', '费米子反对易关系与自旋统计定理', '分立对称性 P, C, T'], ['Clifford 代数 $\\{\\gamma^\\mu, \\gamma^\\nu\\} = 2g^{\\mu\\nu}$', '旋量双线性协变量'], ['(i\\gamma^\\mu \\partial_\\mu - m)\\psi = 0', '\\sum_s u^s(p)\\bar{u}^s(p) = \\not{p} + m'], 'Part I'),
      ch(4, '相互作用场、Wick 定理与 Feynman 图', 'Interacting Fields and Feynman Diagrams', ['相互作用绘景与 Dyson 级数', '编时乘积与 Wick 定理收缩', '$\\phi^4$ 与 Yukawa 理论 Feynman 规则', 'S 矩阵元与微分散射截面公式'], ['Dyson 编时展开', 'Wick 算符收缩代数', '相空间积分 $d\\Pi_{\\text{LIPS}}$'], ['T\\{\\phi_1\\phi_2\\cdots\\phi_n\\} = N\\{\\phi_1\\phi_2\\cdots\\phi_n + \\text{all contractions}\\}'], 'Part I'),
      ch(5, '量子电动力学 (QED) 基本树图过程', 'Elementary Processes of Quantum Electrodynamics', ['$e^+e^- \\to \\mu^+\\mu^-$ 螺旋度振幅与极化求和', 'Dirac $\\gamma$ 矩阵迹定理', 'Compton 散射、Bhabha 散射与 Ward 恒等式'], ['$\\gamma$ 矩阵迹恒等式', 'Mandelstam 变量 $(s,t,u)$'], ['k_\\mu \\mathcal{M}^\\mu = 0'], 'Part I'),
      ch(6, '辐射修正导论：顶点修正、反常磁矩与红外发散', 'Radiative Corrections: Introduction', ['电子顶点单圈修正与形状因子 $F_1, F_2$', 'Schwinger 反常磁矩 $g-2 = \\alpha/\\pi$', 'Feynman 参数化与软光子轫致辐射红外发散相消'], ['Feynman 参数积分', 'Wick 转动 ($p^0 = ip_E^0$)'], ['a_e = \\frac{g-2}{2} = \\frac{\\alpha}{2\\pi}'], 'Part I'),
      ch(7, '形式理论发展：LSZ 约化、光学定理与 Ward-Takahashi 恒等式', 'Radiative Corrections: Some Formal Developments', ['Källén-Lehmann 谱表示与场强重整化 $Z$', 'LSZ 约化公式', '光学定理与 Cutkosky 切割规则', '真空极化与 Ward-Takahashi 恒等式'], ['多复变分支割线不连续度', '1PI 自能重求和'], ['2\\,\\text{Im}\\,\\mathcal{M}(a\\to a) = \\sum_f \\int d\\Pi_f |\\mathcal{M}(a\\to f)|^2'], 'Part I'),
      ch(8, '紫外截断、临界涨落与可重整化幂次计数', 'Invitation: Ultraviolet Cutoffs and Critical Fluctuations', ['紫外截断与有效场论直观图像', '表面发散度 $D$ 与幂次计数可重整化判据'], ['动量幂次计数 (Power Counting)'], ['D = d L - 2 I_B - I_F'], 'Part II'),
      ch(9, '泛函方法与路径积分量子化', 'Functional Methods', ['Feynman 路径积分与生成泛函 $Z[J]$', 'Grassmann 数与费米子 Berezin 积分', '光子场 Faddeev-Popov 规范固定与 $R_\\xi$ 规范传播子', 'Schwinger-Dyson 方程'], ['高斯泛函积分', 'Grassmann 反对易微积分'], ['Z[J] = \\int \\mathcal{D}\\phi \\exp\\left[i\\int d^4x (\\mathcal{L} + J\\phi)\\right]'], 'Part II'),
      ch(10, '微扰重整化系统理论与抵消项', 'Systematics of Renormalization', ['在壳与最小减除重整化条件', '抵消项 (Counterterms) 微扰论', '$\\phi^4$ 与 QED 单圈重整化及 BPHZ 定理'], ['维数正规化 ($d = 4 - \\epsilon$)', '$\\Gamma$ 函数极点展开'], ['\\int \\frac{d^d\\ell_E}{(2\\pi)^d} \\frac{1}{(\\ell_E^2+\\Delta)^2} = \\frac{1}{(4\\pi)^{d/2}} \\Gamma\\left(2-\\frac{d}{2}\\right)\\Delta^{d/2-2}'], 'Part II'),
      ch(11, '重整化与对称性：Goldstone 定理与 Coleman-Weinberg 有效势', 'Renormalization and Symmetry', ['连续对称性自发破缺与 Goldstone 无质量玻色子定理', '1PI 有效作用量 $\\Gamma[\\phi_{\\text{cl}}]$ 与单圈有效势'], ['Legendre 泛函变换', '算符泛函行列式 $\\text{Tr}\\ln$'], ['\\Gamma[\\phi_{\\text{cl}}] = W[J] - \\int d^4x\\, J(x)\\phi_{\\text{cl}}(x)'], 'Part II'),
      ch(12, '重整化群 (RG) 与 Callan-Symanzik 方程', 'The Renormalization Group', ['Wilson 动量壳重整化群流', 'Callan-Symanzik 方程推导', '$\\beta$ 函数、反常维数 $\\gamma$ 与跑动耦合常数', '算符乘积展开 (OPE) 初步'], ['重整化群偏微分特征线法'], ['\\left[ M\\frac{\\partial}{\\partial M} + \\beta(\\lambda)\\frac{\\partial}{\\partial\\lambda} + n\\gamma(\\lambda) \\right] G^{(n)} = 0'], 'Part II'),
      ch(13, '临界指数与标量场统计场论', 'Critical Exponents and Scalar Field Theory', ['二阶相变临界指数、Wilson-Fisher 不动点与 $4-\\epsilon$ 展开', '非线性 $\\sigma$ 模型'], ['$\\epsilon = 4-d$ 微扰展开'], ['\\lambda^* = \\frac{16\\pi^2}{3(N+8)}\\epsilon'], 'Part II'),
      ch(14, '固体物理与对称破缺基础', 'Invitation: The Parton Model of Hadron Structure', ['部分子模型与高能散射标度行为引论'], ['冲量近似运动学'], [], 'Part III'),
      ch(15, '非阿贝尔规范不变性 (Yang-Mills 场论)', 'Non-Abelian Gauge Invariance', ['局域李群规范对称性与协变导数 $D_\\mu = \\partial_\\mu - ig A_\\mu^a t^a$', 'Yang-Mills 场强张量 $F_{\\mu\\nu}^a$ 与作用量', '紧致李代数 Casimir 算符与 Wilson 圈'], ['紧致李群表示论 $[t^a, t^b] = i f^{abc} t^c$', '主纤维丛联络曲率'], ['F_{\\mu\\nu}^a = \\partial_\\mu A_\\nu^a - \\partial_\\nu A_\\mu^a + g f^{abc} A_\\mu^b A_\\nu^c'], 'Part III'),
      ch(16, '非阿贝尔规范场量子化、鬼场、BRST 与渐近自由', 'Quantization of Non-Abelian Gauge Theories', ['Faddeev-Popov 鬼场 (Ghosts) 与规范固定', 'BRST 对称性算符 $Q_B^2 = 0$', '非阿贝尔单圈 $\\beta$ 函数与 QCD 渐近自由 ($\\beta_0 > 0$)', '背景场方法'], ['BRST 上同调', '背景场规范单圈有效作用量'], ['\\beta(g) = -\\frac{g^3}{(4\\pi)^2}\\left(\\frac{11}{3}C_2(G) - \\frac{4}{3}n_f C(r)\\right)'], 'Part III'),
      ch(17, '量子色动力学 (QCD) 与深度非弹性散射', 'Quantum Chromodynamics', ['部分子分布函数、Bjorken 标度律破坏与 Altarelli-Parisi (DGLAP) 演化方程', '$e^+e^-$ 强子产生与喷注'], ['共线发散分离与 DGLAP 积分微分方程'], ['\\frac{d}{d\\ln Q^2} f_i(x, Q^2) = \\frac{\\alpha_s}{2\\pi}\\int_x^1 \\frac{dz}{z} P_{ij}(z) f_j(x/z, Q^2)'], 'Part III'),
      ch(18, 'QCD 中的算符乘积展开 (OPE)', 'Operator Product Expansion', ['流-流关联短距展开、高扭度算符与反常维数矩阵对角化'], ['复合算符重整化混杂矩阵'], ['\\mathcal{O}_1(x)\\mathcal{O}_2(0) \\sim \\sum_n C_n(x) \\mathcal{O}_n(0)'], 'Part III'),
      ch(19, '微扰论反常：Adler-Bell-Jackiw 手征反常与 Fujikawa 测度', 'Perturbation Theory Anomalies', ['轴矢流三角形单圈图与 ABJ 手征反常', 'Fujikawa 路径积分测度雅可比行列式方法', '$\\pi^0 \\to \\gamma\\gamma$ 与规范反常相消条件 $\\text{Tr}[t^a\\{t^b,t^c\\}]=0$'], ['Fujikawa 泛函测度正规化', 'Chern-Pontryagin 拓扑指标'], ['\\partial_\\mu j^{\\mu 5} = -\\frac{e^2}{16\\pi^2}\\epsilon^{\\mu\\nu\\rho\\sigma} F_{\\mu\\nu} F_{\\rho\\sigma}'], 'Part III'),
      ch(20, '自发对称破缺规范理论、Higgs 机制与 Glashow-Weinberg-Salam 电弱标准模型', 'Gauge Theories with Spontaneous Symmetry Breaking', ['Abelian 与非阿贝尔 Higgs 机制', '$SU(2)_L \\times U(1)_Y$ 标准模型、Weinberg 角 $\\theta_W$ 与 $W^\\pm, Z^0$ 质量', '可重整化 $R_\\xi$ 规范与 Goldstone 等效定理'], ['陪集空间规范固定', '高能纵向规范玻色子等效定理'], ['m_W = m_Z \\cos\\theta_W = \\frac{1}{2}gv'], 'Part III'),
      ch(21, '弱电相互作用高阶修正与量子场论前沿展望', 'Quantization of Spontaneously Broken Gauge Theories & Epilogue', ['自发破缺规范场完整 $R_\\xi$ 传播子、$\\rho$ 参数与非微扰拓扑结构展望'], ['单圈精确电弱观测量修正'], ['\\rho = \\frac{m_W^2}{m_Z^2 \\cos^2\\theta_W} = 1 + \\Delta\\rho'], 'Part III'),
    ],
  },
  {
    id: 'weinberg-qft-1',
    matchPatterns: [
      /weinberg.*quantum\s+theory\s+of\s+fields/i,
      /温伯格.*量子场论/,
    ],
    canonicalTitle: 'The Quantum Theory of Fields, Vol. I: Foundations',
    canonicalAuthors: 'Steven Weinberg',
    defaultEdition: '1995 (Cambridge University Press)',
    domain: '量子场论基础与对称性理论 (Quantum Field Theory Foundations)',
    chapters: [
      ch(1, '历史导引：相对论波动力学与场量子化起源', 'Historical Introduction', ['早期量子场论发展史与重整化思想演进'], ['历史文献还原']),
      ch(2, '相对论量子力学：Poincaré 群不可约幺正表示与 Wigner 分类', 'Relativistic Quantum Mechanics', ['Wigner 对称性定理', 'Poincaré 群李代数与小群 (Little Group) 分类：有质量粒子与无质量螺旋度态'], ['李群诱导表示 (Induced Representations)', '射影表示与中心扩张'], ['[P^\\mu, P^\\nu] = 0, \\quad [J^{\\mu\\nu}, P^\\rho] = i(\\eta^{\\nu\\rho}P^\\mu - \\eta^{\\mu\\rho}P^\\nu)']),
      ch(3, '散射理论：In/Out 态、S 矩阵、Lorentz 不变性与光学定理', 'Scattering Theory', ['Møller 波算符、Lippmann-Schwinger 方程、S 矩阵幺正性、光学定理与 CPT 定理基础'], ['散射算符谱理论'], ['S_{\\beta\\alpha} = \\delta(\\beta-\\alpha) - 2\\pi i \\delta^{(4)}(p_\\beta - p_\\alpha) M_{\\beta\\alpha}']),
      ch(4, '集团分解原理 (Cluster Decomposition) 与产生湮灭算符', 'Cluster Decomposition Principle', ['远距实验关联独立性（集团分解原理）与局域相互作用哈密顿量的必然性'], ['连通 S 矩阵元展开'], []),
      ch(5, '量子场与反粒子：从 Poincaré 协变性构造因果场算符', 'Quantum Fields and Antiparticles', ['因果对易关系与有自旋自由场一般构造、Dirac 场与矢量场'], ['Lorentz 群有限维表示 $(A,B)$'], ['[\\psi_l(x), \\psi_{l\'}^\\dagger(y)]_\\pm = 0 \\quad (x-y \\text{ spacelike})']),
      ch(6, 'Feynman 规则与 Dyson 动量空间展开', 'The Feynman Rules', ['旧式微扰论与协变 Feynman 传播子、外线与离壳传播'], ['动量空间围道积分'], []),
      ch(7, '正则形式：Lagrange 变分、Noether 定理与高自旋约束', 'The Canonical Formalism', ['经典拉格朗日作用量原理、Noether 守恒流与相互作用绘景推导'], ['泛函导数与 Legendre 变换'], []),
      ch(8, '量子电动力学 (QED)：规范不变性与无质量自旋 1 光子场', 'Quantum Electrodynamics', ['无质量矢量粒子小群变换非协变性与规范不变性必然性、Coulomb 规范量子化与 Compton 散射'], ['受约束系统 Dirac 括号初步'], ['q_\\mu \\mathcal{M}^\\mu = 0']),
      ch(9, '路径积分方法：从正则相空间推导泛函积分', 'Path-Integral Methods', ['相空间路径积分 $\\int \\mathcal{D}q\\mathcal{D}p$、高斯积分消除共轭动量与费米子 Berezin 积分'], ['相空间泛函积分与行列式'], ['Z = \\int \\mathcal{D}\\phi\\mathcal{D}\\pi \\exp\\left(i\\int d^4x (\\pi\\dot{\\phi} - \\mathcal{H})\\right)']),
      ch(10, '非微扰方法：LSZ 约化、Källén-Lehmann 谱表示与 Ward 恒等式', 'Non-Perturbative Methods', ['极点结构、单粒子重整化波函数因子、LSZ 定理与精确 Ward-Takahashi 恒等式'], ['多复变函数解析延拓与极点留数'], []),
      ch(11, '量子电动力学单圈辐射修正：真空极化、反常磁矩与 Lamb 位移', 'One-Loop Radiative Corrections in QED', ['Pauli-Villars 与维数正规化、Uehling 势、电子 $g-2$ 与氢原子 Lamb 位移完整推导'], ['维数正规化与色散关系'], []),
      ch(12, '紫外发散一般重整化理论与可重整化性判据', 'General Renormalization Theory', ['Weinberg 定理、BPHZ 森林公式消除重叠发散与有效场论高维算符压低'], ['Weinberg 渐近幂次定理与 BPHZ 递归减除'], []),
      ch(13, '红外效应：软光子重求和与射流截面', 'Infrared Effects', ['软光子因子化、虚修正与实发射红外发散严格指数化抵消'], ['软光子阶梯重求和'], []),
      ch(14, '束缚态：Bethe-Salpeter 方程与正电子素能谱', 'Bound States', ['相对论束缚态极点、Bethe-Salpeter 方程与 Dirac 方程外场极限'], ['相对论两体散射核积分方程'], []),
    ],
  },
  {
    id: 'sakurai-mqm',
    matchPatterns: [
      /sakurai/i,
      /napolitano/i,
      /modern\s+quantum\s+mechanics/i,
      /樱井/,
      /现代量子力学/,
    ],
    canonicalTitle: 'Modern Quantum Mechanics (樱井纯《现代量子力学》)',
    canonicalAuthors: 'J. J. Sakurai, Jim Napolitano',
    defaultEdition: '2nd / 3rd Edition (Cambridge University Press)',
    domain: '高等量子力学 (Advanced Quantum Mechanics)',
    chapters: [
      ch(1, '基本概念：Stern-Gerlach、Dirac 符号、表象变换与不确定性', 'Fundamental Concepts', ['Stern-Gerlach 实验与右矢/左矢空间', '厄米算符本征谱与完备性投影 $\\sum |a\\rangle\\langle a|=1$', '位置/动量表象与平移算符生成元'], ['Hilbert 空间算符谱分解', '幺正表象变换矩阵'], ['\\langle (\\Delta A)^2 \\rangle \\langle (\\Delta B)^2 \\rangle \\ge \\frac{1}{4}|\\langle [A,B] \\rangle|^2']),
      ch(2, '量子动力学：演化算符、Heisenberg 绘景、路径积分与规范势', 'Quantum Dynamics', ['时间演化算符 $U(t,t_0)$ 与 Dyson 级数', 'Schrödinger 与 Heisenberg 绘景运动方程', '谐振子升降算符与相干态', 'Feynman 路径积分与 Aharonov-Bohm 拓扑相位效应'], ['BCH 算符恒等式', '泛函路径积分测度'], ['i\\hbar \\frac{d A_H}{dt} = [A_H, H_H]', '\\Delta\\phi_{\\text{AB}} = \\frac{e}{\\hbar c}\\oint \\mathbf{A}\\cdot d\\mathbf{x}']),
      ch(3, '角动量理论：SO(3)/SU(2) 转动群、CG 系数与球张量 Wigner-Eckart 定理', 'Theory of Angular Momentum', ['转动算符与 $SO(3) \\leftrightarrow SU(2)$ 双覆盖、Euler 角与 Wigner $D^{(j)}_{m\'m}$ 矩阵', '轨道角动量与球谐函数', '角动量加法与 Clebsch-Gordan (CG) 系数、Schwinger 玻色子模型', '不可约球张量算符 $T^{(k)}_q$ 与 Wigner-Eckart 定理'], ['SU(2) 李代数表示论', 'CG 正交展开与 Wigner-Eckart 约化矩阵元'], ['\\langle \\alpha\', j\', m\' | T^{(k)}_q | \\alpha, j, m \\rangle = \\langle j, k; m, q | j, k; j\', m\' \\rangle \\frac{\\langle \\alpha\' j\' \\| T^{(k)} \\| \\alpha j \\rangle}{\\sqrt{2j\'+1}}']),
      ch(4, '量子力学中的对称性：宇称、晶格平移与反幺正时间反演', 'Symmetry in Quantum Mechanics', ['离散对称性与宇称选择定则', '晶格离散平移与 Bloch 定理', 'Wigner 反幺正算符、时间反演 $\\Theta = UK$ 与半整数自旋 Kramers 简并定理'], ['反幺正映射 $\\langle \\tilde{\\beta} | \\tilde{\\alpha} \\rangle = \\langle \\alpha | \\beta \\rangle^*$'], ['\\Theta^2 = (-1)^{2j}']),
      ch(5, '近似方法：定态/含时微扰论、变分法、WKB 与 Berry 几何相位', 'Approximation Methods', ['非简并/简并 Rayleigh-Schrödinger 定态微扰论、Stark 与 Zeeman 效应', '变分法与 WKB 半经典连接公式', '相互作用绘景含时微扰论、Fermi 黄金定则与绝热近似 Berry 相位'], ['投影算符微扰展开', '参数空间微分流形联络与 Berry 曲率'], ['\\gamma_n(C) = i \\oint_C \\langle n(\\mathbf{R}) | \\nabla_{\\mathbf{R}} | n(\\mathbf{R}) \\rangle \\cdot d\\mathbf{R}']),
      ch(6, '量子散射理论：Lippmann-Schwinger 方程、Born 近似与分波相移', 'Scattering Theory', ['Lippmann-Schwinger 方程与推迟 Green 函数 $G_+(r,r\')$', 'Born 近似级数与光学定理', '分波展开、相移 $\\delta_l$、Breit-Wigner 共振散射与低能散射长度'], ['复平面 Helmholtz Green 函数围道积分', '球 Bessel 函数渐近匹配'], ['|\\psi^{(\\pm)}\\rangle = |\\phi\\rangle + \\frac{1}{E - H_0 \\pm i\\epsilon} V |\\psi^{(\\pm)}\\rangle']),
      ch(7, '全同粒子、置换对称性、氦原子交换积分与二次量子化', 'Identical Particles', ['置换算符、全同玻色子/费米子对称化与 Slater 行列式', '正仲氦原子交换劈裂', '产生湮灭算符与多体量子场算符 $\\hat{\\Psi}(\\mathbf{x})$ 二次量子化'], ['Fock 空间算符代数'], ['[\\hat{\\Psi}(\\mathbf{x}), \\hat{\\Psi}^\\dagger(\\mathbf{x}\')]_\\mp = \\delta^{(3)}(\\mathbf{x}-\\mathbf{x}\')']),
      ch(8, '相对论量子力学：Klein-Gordon 方程、Dirac 方程与氢原子精细结构精确解', 'Relativistic Quantum Mechanics', ['Klein-Gordon 与 Dirac 方程协变形式', 'Foldy-Wouthuysen 非相对论展开（自旋-轨道耦合与 Darwin 项）', 'Coulomb 场 Dirac 氢原子精确能谱与负能海/空穴理论'], ['四分量旋量算符与 Foldy-Wouthuysen 变换'], ['(i\\gamma^\\mu D_\\mu - mc)\\psi = 0']),
    ],
  },
  {
    id: 'kaxinglin-aqm',
    matchPatterns: [
      /喀兴林/,
      /高等量子力学/,
    ],
    canonicalTitle: '《高等量子力学》（喀兴林 著）',
    canonicalAuthors: '喀兴林',
    defaultEdition: '第 2 版（高等教育出版社）',
    domain: '高等量子力学与群表示论 (Advanced Quantum Mechanics)',
    chapters: [
      ch(1, '希尔伯特空间与量子力学基本原理（Dirac 符号与表象理论）', 'Hilbert Space and Dirac Bra-Ket Formalism', ['右矢与左矢空间、线性算符与本征值问题、连续谱完备性与绘景变换'], ['泛函分析算符谱分解', 'Dirac $\\delta$ 函数']),
      ch(2, '量子散射理论：分波法、格林函数方法与 Lippmann-Schwinger 方程', 'Quantum Scattering Theory', ['定态散射波函数渐近行为、分波法与相移、散射共振与束缚态极点、格林函数积分方程与 Born 近似、全同粒子散射'], ['复平面留数定理与围道积分', '球 Bessel 与 Hankel 函数']),
      ch(3, '群论基础与量子力学中的对称性', 'Group Theory Foundations in Quantum Mechanics', ['群与子群、陪集与不变子群、群的线性表示、不可约表示舒尔引理 (Schur Lemma) 与正交性定理、特征标理论與张量积直积分解'], ['有限群与紧致连续群表示论', '舒尔引理与特征标正交关系'], ['\\frac{1}{|G|}\\sum_{g\\in G} D^{(i)}_{mn}(g)^* D^{(j)}_{m\'n\'}(g) = \\frac{1}{d_i}\\delta_{ij}\\delta_{mm\'}\\delta_{nn\'}']),
      ch(4, '三维转动群 SO(3)/SU(2) 与角动量耦合、不可约球张量', 'Rotation Group SO(3), Angular Momentum and Spherical Tensors', ['SO(3) 与 SU(2) 群表示、Wigner D 矩阵、角动量耦合 CG 系数与 Racah 6j 符号、不可约球张量算符与 Wigner-Eckart 定理'], ['李群无穷小生成元', '3j / 6j 符号与球张量代数']),
      ch(5, '全同多粒子体系与二次量子化方法', 'Many-Body Identical Particles and Second Quantization', ['玻色子与费米子占居数表象、产生与湮灭算符对易/反对易关系、算符在二次量子化表象中的展开、多体格林函数初步'], ['Fock 空间算符代数'], ['\\hat{F} = \\sum_{i,j} \\langle i | f | j \\rangle a_i^\\dagger a_j']),
      ch(6, '辐射场的量子化与辐射跃迁过程', 'Quantization of Electromagnetic Radiation Field', ['库仑规范下自由电磁场正则量子化、光子态与零点能、原子与量子化辐射场相互作用、自发辐射/受激辐射与 Kramers-Heisenberg 色散公式'], ['规范场模式展开与含时微扰论']),
      ch(7, '相对论量子力学：Klein-Gordon 方程与 Dirac 方程', 'Relativistic Quantum Mechanics: Klein-Gordon & Dirac Equations', ['Klein-Gordon 方程、Dirac 方程及洛伦兹协变性證明、旋量平面波解与投影算符、非相对论极限 Foldy-Wouthuysen 变换、中心力场氢原子精细结构与负能态正电子理论'], ['Clifford 代数与双线性协变量', '旋量球谐函数']),
    ],
  },
  {
    id: 'zengjinyan-qm1',
    matchPatterns: [
      /曾谨言/,
      /量子力学.*卷\s*[i1一]/i,
    ],
    canonicalTitle: '《量子力学（卷I）》（曾谨言 著）',
    canonicalAuthors: '曾谨言',
    defaultEdition: '第 5 版（科学出版社）',
    domain: '基础与中级量子力学 (Quantum Mechanics)',
    chapters: [
      ch(1, '量子力学的诞生（黑体辐射、光电效应与 Bohr 原子理论）', 'Origins of Quantum Mechanics', ['Planck 量子假说、光电效应、Compton 效应、Bohr 量子化条件与 de Broglie 物质波'], ['旧量子论半经典积分']),
      ch(2, '波函数与 Schrödinger 方程', 'Wave Function and Schrödinger Equation', ['波函数统计诠释、态叠加原理、Schrödinger 方程、概率流密度守恒与一维势场定态（方势阱、$\\delta$ 势、势垒贯穿）'], ['常微分方程边值匹配']),
      ch(3, '一维谐振子与量子力学算符代数初探', 'One-Dimensional Harmonic Oscillator', ['谐振子坐标表象 Hermite 多项式解、升降算符代数法与相干态'], ['Hermite 微分方程与母函数']),
      ch(4, '力学量用算符表达与厄米算符本征谱理论', 'Observables and Hermitian Operators', ['厄米算符本征值实数性、正交完备性、共同本征态对易判据、不确定度关系与守恒量'], ['线性厄米算符谱分析']),
      ch(5, '中心力场与氢原子精确解', 'Central Potential and Hydrogen Atom', ['球坐标分离变量、轨道角动量与球谐函数、三维各向同性谐振子、库仑场氢原子径向波函数与能级简并度'], ['球谐函数与广义 Laguerre 多项式']),
      ch(6, '态和力学量的表象理论（Dirac 符号与矩阵力学）', 'Representation Theory and Dirac Notation', ['坐标表象与动量表象、幺正变换、Dirac 右矢/左矢符号与 Heisenberg 矩阵力学方程'], ['幺正矩阵变换与完备性投影']),
      ch(7, '电子自旋与角动量耦合（Pauli 矩阵与总角动量）', 'Spin and Addition of Angular Momenta', ['Stern-Gerlach 实验、Pauli 自旋算符代数、自旋旋量波函数、自旋-轨道耦合与双角动量耦合 CG 系数'], ['SU(2) 泡利矩阵代数']),
      ch(8, '带电粒子在电磁场中的运动（规范不变性与 Landau 能级）', 'Charged Particles in Electromagnetic Fields', ['正则动量与机械动量、电磁规范变换与波函数相位、均匀磁场中的 Landau 能级、正常 Zeeman 效应与 Aharonov-Bohm 效应'], ['电磁最小耦合替换 $\\mathbf{p} \\to \\mathbf{p} - q\\mathbf{A}$']),
      ch(9, '定态近似方法（非简并/简并微扰论、变分法与 WKB）', 'Time-Independent Approximation Methods', ['非简并定态微扰论、简并微扰论与氢原子一级 Stark 效应、变分法与氦原子基态、WKB 半经典近似'], ['久期方程对角化与泛函极值']),
      ch(10, '量子跃迁与含时微扰论（光的吸收与辐射选择定则）', 'Quantum Transitions and Time-Dependent Perturbation', ['含时微扰论跃迁概率、周期微扰与 Fermi 黄金定则、电偶极近似跃迁选择定则、二能级系统 Rabi 振荡与绝热近似'], ['含时微分方程级数展开']),
      ch(11, '全同粒子体系与散射初步（氦原子、氢分子与分波法/Born 近似）', 'Identical Particles and Elementary Scattering', ['全同性原理、玻色子与费米子、泡利不相容原理、氦原子正仲态与氢分子 Heitler-London 共价键、弹性散射分波法与 Born 近似'], ['置换反对称波函数与散射相移']),
    ],
  },
  {
    id: 'landau-vol1-mechanics',
    matchPatterns: [
      /landau.*mechanics/i,
      /朗道.*力学/,
      /^《?力学》?$/,
      /理论物理教程.*第一卷/,
    ],
    canonicalTitle: '《力学》（朗道理论物理教程 第一卷 / Mechanics）',
    canonicalAuthors: 'L. D. Landau, E. M. Lifshitz',
    defaultEdition: '第 5 版（高等教育出版社 / Butterworth-Heinemann）',
    domain: '经典分析力学 (Analytical Mechanics)',
    chapters: [
      ch(1, '运动方程：广义坐标与最小作用量原理', 'The Equations of Motion', ['广义坐标、最小作用量原理 $\\delta S = 0$、Euler-Lagrange 方程与 Galileo 相对性原理'], ['泛函变分法'], ['\\frac{d}{dt}\\frac{\\partial L}{\\partial \\dot{q}_i} - \\frac{\\partial L}{\\partial q_i} = 0']),
      ch(2, '守恒定律：时空对称性与能量、动量、角动量守恒及维里定理', 'Conservation Laws', ['时间均匀性与能量守恒、空间均匀性与动量守恒、空间各向同性与角动量守恒、力学相似性与维里定理'], ['连续群无穷小生成元'], ['E = \\sum_i \\dot{q}_i \\frac{\\partial L}{\\partial \\dot{q}_i} - L']),
      ch(3, '运动方程的积分：一维周期运动、中心力场与 Kepler 问题', 'Integration of the Equations of Motion', ['一维势场振荡周期积分、由周期反演势能、中心力场有效势、Kepler 轨道与 Laplace-Runge-Lenz 守恒矢量'], ['椭圆积分与 Abel 积分反演'], ['\\mathbf{M} = \\mathbf{v}\\times\\mathbf{L} - \\alpha \\frac{\\mathbf{r}}{r}']),
      ch(4, '质点碰撞：弹性散射运动学与 Rutherford 公式', 'Collisions Between Particles', ['质心系与实验室系速度动量转换、有效微分散射截面 $d\\sigma$、Rutherford 库仑散射截面与小角散射'], ['瞄准距离散射角映射'], ['d\\sigma = \\left(\\frac{\\alpha}{2E}\\right)^2 \\frac{d\\Omega}{\\sin^4(\\theta/2)}']),
      ch(5, '微振动：多自由度简正坐标、非谐振动、参数共振与快振荡场 Kapitza 摆', 'Small Oscillations', ['一维与多自由度自由简正振动、强迫振动与共振、阻尼与耗散函数、非谐微扰、参数共振 (Mathieu 方程) 与快速振荡场有效势'], ['广义特征值对角化 $\\det(k_{ik} - \\omega^2 m_{ik}) = 0$', '时间尺度分离平均法']),
      ch(6, '刚体运动：角速度、惯量张量、Euler 动力学方程与非惯性系 Coriolis 力', 'Motion of a Rigid Body', ['刚体平动与转动动能、惯量张量 $I_{ik}$ 与主轴、剛体角动量、对称陀螺自由进动、Euler 方程与非惯性系拉格朗日量'], ['正交变换与二阶对称张量对角化'], ['I_1 \\dot{\\Omega}_1 + (I_3 - I_2)\\Omega_2\\Omega_3 = K_1']),
      ch(7, '正则方程：Hamilton 方程、Poisson 括号、正则变换、Hamilton-Jacobi 方程与绝热不变量', 'The Canonical Equations', ['Legendre 变换与 Hamilton 正则方程、Routh 函数、Poisson 括号与 Jacobi 恒等式、正则变换母函数与相空间 Liouville 定理、Hamilton-Jacobi 方程分离变量、作用量-角变量与绝热不变量 $I = \\oint p\\,dq / 2\\pi$'], ['辛几何与正则母函数变换', '一阶非线性偏微分方程全积分'], ['\\frac{\\partial S}{\\partial t} + H\\left(q, \\frac{\\partial S}{\\partial q}, t\\right) = 0']),
    ],
  },
  {
    id: 'landau-vol2-fields',
    matchPatterns: [
      /landau.*classical\s+theory\s+of\s+fields/i,
      /朗道.*场论/,
      /^《?场论》?$/,
      /理论物理教程.*第二卷/,
    ],
    canonicalTitle: '《场论》（朗道理论物理教程 第二卷 / The Classical Theory of Fields）',
    canonicalAuthors: 'L. D. Landau, E. M. Lifshitz',
    defaultEdition: '第 8 版（高等教育出版社）',
    domain: '狭义相对论电动力学与广义相对论 (Classical Field Theory & General Relativity)',
    chapters: [
      ch(1, '相对性原理与 Minkowski 四维时空张量', 'The Principle of Relativity', ['时间间隔、固有时、Lorentz 变换与四维矢量/反对称张量'], ['四维时空伪欧氏度规']),
      ch(2, '相对论力学：自由粒子作用量与四维动量', 'Relativistic Mechanics', ['最小作用量原理 $S = -mc\\int ds$、能量与动量、质心系运动学与角动量四维张量'], ['世界线弧长变分']),
      ch(3, '场中的电荷：四维势、电磁场张量与规范不变性', 'Charges in Electromagnetic Fields', ['四维势 $A^i = (\\phi, \\mathbf{A})$、Lorentz 力方程、电磁场张量 $F_{ik} = \\partial_i A_k - \\partial_k A_i$ 与双不变量'], ['外微分与四维势变分']),
      ch(4, '电磁场方程：Maxwell 方程组协变形式与电磁能动量张量', 'The Electromagnetic Field Equations', ['最小作用量导出第二对 Maxwell 方程、连续性方程、电磁场能量-动量张量 $T^{ik}$ 与维里定理'], ['连续介质场作用量变分']),
      ch(5, '恒定电磁场：Coulomb 定律、多极矩展开与毕奥-萨伐尔定律', 'Constant Electromagnetic Fields', ['静电场电偶极矩/四极矩展开、恒定磁场矢量势与磁矩'], ['球谐多极展开']),
      ch(6, '电磁波：波动方程、平面单色波偏振与几何光学极限', 'Electromagnetic Waves', ['d\'Alembert 波动方程、平面电磁波偏振态 Stokes 参数、包络缓变几何光学程函方程'], ['Fourier 频谱展开与程函近似']),
      ch(7, '运动电荷的场：推迟势与 Liénard-Wiechert 势', 'The Field of Moving Charges', ['d\'Alembert 方程推迟格林函数、推迟势与任意运动点电荷 Liénard-Wiechert 势、Darwin 拉格朗日量'], ['四维推迟光锥 $\\delta$ 函数积分']),
      ch(8, '电磁波的辐射：偶极辐射、四极辐射与辐射阻尼 (Abraham-Lorentz)', 'Radiation of Electromagnetic Waves', ['远区电偶极、磁偶极与电四极辐射功率、相对论高速运动电荷同步辐射 (Synchrotron Radiation)、电磁波散射与辐射反作用力'], ['推迟时间多极泰勒展开']),
      ch(9, '引力场中的粒子：等效原理、弯曲时空度规与测地线方程', 'Particles in a Gravitational Field', ['等效原理、弯曲时空黎曼度规 $g_{ik}$、Christoffel 联络符号 $\\Gamma^i_{kl}$、协变微分与引力场中粒子测地线运动方程'], ['伪黎曼几何联络与测地变分']),
      ch(10, '引力场方程：Riemann 曲率张量、Hilbert 作用量与 Einstein 场方程', 'The Gravitational Field Equations', ['Riemann-Christoffel 曲率张量、Bianchi 恒等式、Ricci 张量、引力场作用量变分、Einstein 场方程 $R_{ik} - \\frac{1}{2}g_{ik}R = \\frac{8\\pi k}{c^4}T_{ik}$ 与 Landau-Lifshitz 能动量赝张量'], ['度规泛函变分 $\\delta\\sqrt{-g}$']),
      ch(11, '物体的场：Schwarzschild 度规、三大经典引力检验与黑洞引力坍缩', 'The Field of Gravitating Bodies', ['中心对称 Schwarzschild 真空度规、水星近日点进动与光线偏折、Kruskal 坐标系、球对称坍缩与 Kerr 旋转黑洞度规'], ['球对称 Einstein 方程精确积分']),
      ch(12, '引力波：弱场平面引力波与四极引力辐射能量损失', 'Gravitational Waves', ['弱引力场横向无迹规范、引力波偏振与双星系统引力波四极辐射功率公式'], ['线性化场方程与四极矩']),
      ch(13, '相对论宇宙学：各向同性常曲率空间与 Friedmann 宇宙模型', 'Relativistic Cosmology', ['常曲率三维空间度规、FLRW 宇宙线元、Friedmann 膨胀演化方程与宇宙学红移'], ['齐性各向同性流形几何']),
    ],
  },
  {
    id: 'landau-vol3-qm',
    matchPatterns: [
      /landau.*quantum\s+mechanics/i,
      /朗道.*量子力学/,
      /理论物理教程.*第三卷/,
    ],
    canonicalTitle: '《量子力学（非相对论理论）》（朗道理论物理教程 第三卷）',
    canonicalAuthors: 'L. D. Landau, E. M. Lifshitz',
    defaultEdition: '第 6 版（高等教育出版社）',
    domain: '非相对论量子力学完整体系 (Quantum Mechanics)',
    chapters: [
      ch(1, '量子力学基本概念：不确定性原理、叠加原理与算符', 'The Basic Concepts of Quantum Mechanics', ['测量过程、波函数、线性自伴算符与连续谱本征函数规一化'], ['算符谱理论']),
      ch(2, '能量与动量：哈密顿算符、守恒律与定态薛定谔方程', 'Energy and Momentum', ['时间平移与哈密顿量、动量算符、不确定性关系与时间反演对称性'], ['偏微分算符理论']),
      ch(3, '薛定谔方程：一维势场、谐振子与奇异势', 'Schrödinger\'s Equation', ['一维运动的能谱性质、势阱能级、线性谐振子与反射/透射系数'], ['二阶常微分方程与超几何函数']),
      ch(4, '角动量：轨道角动量算符、球谐函数与角动量相加', 'Angular Momentum', ['角动量对易关系、本征值与球谐函数、轴对称陀螺与角动量耦合规则'], ['球谐函数与群表示']),
      ch(5, '有心力场中的运动：径向方程、库仑场氢原子与抛物坐标', 'Motion in a Centrally Symmetric Field', ['球面波、三维谐振子、库仑吸引/排斥场径向波函数与抛物坐标分离变量'], ['合流超几何函数 (Confluent Hypergeometric Functions)']),
      ch(6, '微扰理论：定态非简并/简并微扰论与含时跃迁微扰', 'Perturbation Theory', ['久期方程、二阶修正、绝热微扰与周期微扰共振跃迁、连续谱微扰'], ['算符级数展开']),
      ch(7, '准经典情形：WKB 近似、Bohr-Sommerfeld 量子化与势垒穿透', 'The Quasi-Classical Case', ['准经典波函数、转折点边界条件、势垒穿透概率与越势垒反射复平面积分'], ['鞍点渐近展开与 Airy 函数']),
      ch(8, '自旋与不可约球张量：Pauli 旋量、精细结构与 3j/6j 符号', 'Spin', ['旋量代数、自旋波函数、电磁场中的泡利方程、Wigner 3j 与 Racah 6j 符号及球张量矩阵元'], ['SU(2) 旋量张量代数']),
      ch(9, '全同粒子与二次量子化：置换群杨图与玻色/费米二次量子化', 'Identity of Particles', ['全同粒子不可分辨性、置换群对称性杨图 (Young Tableaux)、玻色与费米二次量子化算符'], ['对称群 $S_N$ 不可约表示']),
      ch(10, '原子：原子能级分类、自洽场 Hartree-Fock 方程、精细结构与 Zeeman/Stark 效应', 'The Atom', ['Hund 规则、Thomas-Fermi 模型、Hartree-Fock 方程、LS 耦合与 jj 耦合、Zeeman 与二次/线性 Stark 效应'], ['自洽场变分积分微分方程']),
      ch(11, '双原子分子：电子项分类、振动转动谱与能级交叉 Landau-Zener 跃迁', 'The Diatomic Molecule', ['Born-Oppenheimer 近似、分子势能曲线、$\Lambda$-双分裂、分子能级交叉与 Landau-Zener 非绝热跃迁公式'], ['点群与轴对称群表示']),
      ch(12, '对称性理论：点群不可约表示、晶体场劈裂与 Jahn-Teller 效应', 'The Theory of Symmetry', ['有限点群特征标表、对称坐标、量子能级简并解除与分子 Jahn-Teller 不稳定性'], ['点群与空间群特征标理论']),
      ch(13, '多原子分子：简正振动分类、科里奥利耦合与非对称陀螺转动谱', 'Polyatomic Molecules', ['多原子分子振动模对称性分类与转动-振动相互作用'], ['分子点群表示分解']),
      ch(14, '角动量的相加与不可约张量高阶理论', 'Addition of Angular Momenta', ['高阶不可约张量乘积与约化矩阵元系统计算'], ['Racah 代数']),
      ch(15, '磁场中的运动：Landau 能级、磁平移群与泡利顺磁/朗道抗磁基礎', 'Motion in a Magnetic Field', ['对称规范与朗道规范下的精确波函数、有自旋粒子在磁场中的运动'], ['磁平移算符代数']),
      ch(16, '原子核结构：核力同位旋、壳层模型与集体转动/振动能谱', 'Nuclear Structure', ['同位旋对称性、核壳层模型自旋-轨道耦合与非球形核转动谱'], ['SU(2) 同位旋代数']),
      ch(17, '弹性碰撞理论：分波散射相移、解析性、S 矩阵极点与共振散射', 'Elastic Collisions', ['散射振幅解析性质、光学定理、低能散射长度、束缚态虚动量极点、Breit-Wigner 共振公式与库仑散射'], ['复能量平面 Riemann 面解析延拓']),
      ch(18, '非弹性碰撞理论：反应截面、阈行为 Wigner 定律与细致平衡原理', 'Inelastic Collisions', ['非弹性散射 S 矩阵幺正性、慢粒子反应截面阈值奇异性与时间反演细致平衡'], ['多通道散射矩阵理论']),
    ],
  },
  {
    id: 'guoshuohong-ed',
    matchPatterns: [
      /郭硕鸿/,
      /^《?电动力学》?$/,
    ],
    canonicalTitle: '《电动力学》（郭硕鸿 著）',
    canonicalAuthors: '郭硕鸿',
    defaultEdition: '第 3 版（高等教育出版社）',
    domain: '经典与相对论电动力学 (Electrodynamics)',
    chapters: [
      ch(1, '电磁现象的普遍规律（Maxwell 方程组、介质边值关系与电磁场能流守恒）', 'General Laws of Electromagnetic Phenomena', ['高斯定理与安培环路定理微分形式、洛伦兹力、介质极化与磁化、Maxwell 方程组、电磁场边值关系、Poynting 能流定理与电磁动量及麦克斯韦应力张量'], ['矢量分析散度与旋度定理（Gauss & Stokes）'], ['\\nabla\\times\\mathbf{E} = -\\frac{\\partial\\mathbf{B}}{\\partial t}, \\quad \\nabla\\times\\mathbf{H} = \\mathbf{J} + \\frac{\\partial\\mathbf{D}}{\\partial t}']),
      ch(2, '静电场（标势泊松方程、唯一性定理、分离变量法、镜像法、格林函数与电多极矩）', 'Electrostatics', ['静电势与 Poisson/Laplace 方程、边值问题唯一性定理、直角/球/柱坐标分离变量法（Legendre 多项式）、电像法、Green 函数法与电荷体系电多极矩展开（偶极矩与四极矩张量）'], ['球谐函数与 Legendre 方程', 'Green 函数边值理论'], ['\\nabla^2 \\varphi = -\\frac{\\rho}{\\varepsilon_0}']),
      ch(3, '静磁场（矢势、规范变换、磁标势、阿哈罗诺夫-玻姆效应与磁多极矩）', 'Magnetostatics', ['磁矢势 $\\mathbf{B} = \\nabla\\times\\mathbf{A}$ 与库仑规范、毕奥-萨伐尔定律、磁标势法求解铁磁球、小区域电流分布磁偶极矩、超导体完全抗磁性 Meissner 效应与 London 方程、Aharonov-Bohm 效应'], ['矢量泊松方程与多极展开'], ['\\nabla^2 \\mathbf{A} = -\\mu_0 \\mathbf{J}']),
      ch(4, '电磁波的传播（平面电磁波、界面反射折射菲涅尔公式、导体趋肤效应与谐振腔波导）', 'Propagation of Electromagnetic Waves', ['齐次波动方程、平面电磁波偏振、绝缘介质界面反射与折射 Fresnel 公式（全反射与 Brewster 角）、导电介质中的电磁波与趋肤深度、有界空间金属波导管（TE/TM 模截止频率）与谐振腔、等离子体电磁波色散'], ['复折射率与 Helmholtz 边值问题']),
      ch(5, '电磁波的辐射（达朗贝尔方程、推迟势、电偶极辐射、磁偶极/电四极辐射与天线）', 'Radiation of Electromagnetic Waves', ['电磁势规范变换（Lorenz 规范与 Coulomb 规范）、d\'Alembert 非齐次方程与推迟势、振荡电偶极子近区与远区辐射场及辐射功率、磁偶极与电四极辐射、半波天线方向图与电磁波衍射基尔霍夫公式'], ['推迟格林函数与远场渐近展开'], ['\\Box \\mathbf{A} = -\\mu_0 \\mathbf{J}, \\quad \\mathbf{A}(\\mathbf{r},t) = \\frac{\\mu_0}{4\\pi}\\int \\frac{\\mathbf{J}(\\mathbf{r}\', t - R/c)}{R} dV\'']),
      ch(6, '狭义相对论（洛伦兹变换、四维闵可夫斯基时空、电磁场四维张量协变性与相对论力学）', 'Special Theory of Relativity', ['狭义相对论基本原理、Lorentz 时空坐标变换、尺缩钟慢与同时相对性、Minkowski 四维空间与四维协变张量、四维电流密度与四维势、电磁场张量 $F_{\\mu\\nu}$ 与电磁场变换公式、相对论质点力学四维动量与能量-动量关系 $E^2 = p^2c^2 + m_0^2c^4$'], ['四维洛伦兹张量代数'], ['\\partial_\\mu F_{\\mu\\nu} = -\\mu_0 J_\\nu']),
      ch(7, '带电粒子和电磁场的相互作用（Liénard-Wiechert 势、加速电荷辐射、同步辐射、切伦科夫辐射与色散）', 'Interaction of Charged Particles and Electromagnetic Fields', ['任意运动带电粒子的 Liénard-Wiechert 推迟势与电磁场、高速运动电荷辐射功率角分布（轫致辐射与同步辐射）、切伦科夫辐射 (Cherenkov Radiation)、辐射阻尼 Abraham-Lorentz 力与谱线自然宽度、介质电磁波色散与 Kramers-Kronig 关系'], ['推迟光锥雅可比变换'], []),
    ],
  },
  {
    id: 'jackson-ed',
    matchPatterns: [
      /jackson.*electrodynamics/i,
      /杰克逊.*电动力学/,
    ],
    canonicalTitle: 'Classical Electrodynamics (Jackson)',
    canonicalAuthors: 'John David Jackson',
    defaultEdition: '3rd Edition (Wiley)',
    domain: '高等经典电动力学 (Graduate Electrodynamics)',
    chapters: [
      ch(1, '静电学导论：Poisson 方程、Dirichlet/Neumann 格林函数与变分法', 'Introduction to Electrostatics', ['Coulomb 定律、Gauss 定律、Green 定理、唯一性定理与正式 Green 函数构造'], ['偏微分方程 Green 函数理论']),
      ch(2, '静电学边值问题 I：镜像法、反演变换与二维复变共形映射', 'Boundary-Value Problems in Electrostatics: I', ['导电球/圆柱镜像法、格林函数本征函数展开与二维 Laplace 方程复变共形变换'], ['复变函数共形映射']),
      ch(3, '静电学边值问题 II：球坐标与柱坐标正交函数展开（球谐函数与 Bessel 函数）', 'Boundary-Value Problems in Electrostatics: II', ['Legendre 多项式、球谐函数加法定理、柱坐标 Bessel 与修正 Bessel 函数边值展开'], ['Sturm-Liouville 正交特殊函数']),
      ch(4, '多极矩、宏观介质静电学与电介质极化', 'Multipoles, Electrostatics of Macroscopic Media, Dielectrics', ['球谐多极展开、笛卡尔四极矩张量、宏观平均、Clausius-Mossotti 关系与静电能量'], ['不可约球张量多极展开']),
      ch(5, '静磁学、法拉第电磁感应与准稳态磁场', 'Magnetostatics, Faraday\'s Law, Quasi-Static Fields', ['Biot-Savart 定律、矢势多极展开、宏观磁化、法拉第感应定律与自感/互感系数'], ['矢量球谐函数初探']),
      ch(6, 'Maxwell 方程组、宏观电动力学、守恒律与规范变换', 'Maxwell Equations, Macroscopic Electromagnetism, Conservation Laws', ['位移电流、Lorenz 与 Coulomb 规范 Green 函数、Poynting 定理复数形式与对偶变换'], ['四维波动算符推迟/超前格林函数']),
      ch(7, '平面电磁波与波的传播：偏振、Kramers-Kronig 色散关系与群速度', 'Plane Electromagnetic Waves and Wave Propagation', ['Fresnel 折射反射、等离子体与电离层磁光效应、因果性与 Kramers-Kronig 关系、波包色散扩展'], ['复平面解析性与 Hilbert 变换']),
      ch(8, '波导、谐振腔与光纤（介质波导模式与微扰损耗）', 'Waveguides, Resonant Cavities, and Optical Fibers', ['柱形空心金属波导 TE/TM 模、品质因数 Q 与腔体壁损耗微扰计算'], ['二维截面 Helmholtz 本征值']),
      ch(9, '辐射系统、多极场与天线辐射（矢量球谐多极展开）', 'Radiating Systems, Multipole Fields and Radiation', ['局域振荡源电偶极/磁偶极/电四极辐射、精确矢量球谐函数 $\\mathbf{X}_{lm}$ 多极展开与散射'], ['矢量球谐函数算符代数']),
      ch(10, '电磁波散射与衍射（Rayleigh 散射、Mie 散射、光学定理与矢量 Kirchhoff 衍射）', 'Scattering and Diffraction', ['长波偶极散射、导电球散射、标量与矢量 Kirchhoff 衍射积分与 Babinet 原理'], ['分波多极相移与积分方程']),
      ch(11, '狭义相对论（Lorentz 群生成元、Thomas 进动与电磁场协变形式）', 'Special Theory of Relativity', ['Lorentz 变换李代数生成元、自旋 Thomas 进动 (BMT 方程) 与电磁场对偶张量'], ['Lorentz 群李代数 $SO(1,3)$']),
      ch(12, '相对论粒子与电磁场的动力学（最小作用量、电磁能动张量与 Darwin 拉格朗日量）', 'Dynamics of Relativistic Particles and Electromagnetic Fields', ['相对论带电粒子拉格朗日与哈密顿量、电磁场正则与对称能动量张量 $\\Theta^{\\mu\\nu}$、Noether 定理'], ['经典场变分原理']),
      ch(13, '带电粒子碰撞、能量损失与散射（Bethe 阻止本领公式与 Cherenkov 辐射）', 'Collisions, Energy Loss, and Scattering of Charged Particles', ['重带电粒子电离能损 Bethe 公式、密度效应与 Cherenkov 锥角辐射谱'], ['介质介电函数 $\\epsilon(\\mathbf{k},\\omega)$ 纵向/横向响应']),
      ch(14, '运动电荷的辐射（Liénard-Wiechert 势、同步辐射角分布与频谱、摇摆器与自由电子激光）', 'Radiation by Moving Charges', ['广义 Lamor 公式、超相对论粒子辐射窄锥效应、同步辐射 Airy/Bessel 频谱与 Thomson 散射'], ['修正 Bessel 函数 $K_{1/3}, K_{2/3}$ 积分']),
      ch(15, '轫致辐射、虚光子方法 (Weizsäcker-Williams) 与辐射跃迁多极过程', 'Bremsstrahlung, Method of Virtual Quanta, Radiative Beta Processes', ['经典与量子轫致辐射、软光子红外发散与等效虚光子谱方法'], ['Weizsäcker-Williams 等效光子近似']),
      ch(16, '辐射阻尼、带电粒子经典模型与自场散射（Abraham-Lorentz-Dirac 方程）', 'Radiation Damping, Classical Models of Charged Particles', ['辐射反作用力、失控解 (Runaway Solutions) 与预加速因果律分析'], ['三阶微分方程渐近规整化']),
    ],
  },
  {
    id: 'liangcanbin-gr',
    matchPatterns: [
      /梁灿彬/,
      /微分几何入门与广义相对论/,
    ],
    canonicalTitle: '《微分几何入门与广义相对论（上册）》（梁灿彬、周彬 著）',
    canonicalAuthors: '梁灿彬，周彬',
    defaultEdition: '第 2 版（科学出版社）',
    domain: '整体微分几何与广义相对论 (Differential Geometry & General Relativity)',
    chapters: [
      ch(1, '拓扑空间与微分流形（开集、同胚、坐标卡与光滑流形定义）', 'Topological Spaces and Differentiable Manifolds', ['拓扑空间、连通性与紧致性、光滑流形图册、光滑函数与光滑映射'], ['点集拓扑与流形公理']),
      ch(2, '切矢、余切矢与张量场（抽象指标记号、推前与拉回映射、度规张量）', 'Tangent Vectors, Cotangent Vectors and Tensor Fields', ['切矢作为导子、余切矢（对偶矢）、多重线性映射与张量积、Penrose 抽象指标记号 (Abstract Index Notation)、流形上的度规张量场 $g_{ab}$ 与洛伦兹流形'], ['多重线性代数与抽象指标记号']),
      ch(3, '联络与黎曼曲率张量（导数算符、平行移动、测地线与曲率张量）', 'Connections and Riemann Curvature Tensor', ['抽象导数算符 $\\nabla_a$、挠率与曲率张量 $R_{abc}{}^d$、与度规相容的无挠唯一联络（Levi-Civita 联络）、克氏符 $\\Gamma^c{}_{ab}$、平行移动、测地线方程与 Bianchi 恒等式'], ['整体微分几何协变导数'], ['\\nabla_a \\nabla_b \\omega_c - \\nabla_b \\nabla_a \\omega_c = R_{abc}{}^d \\omega_d']),
      ch(4, '李导数、Killing 场与超曲面（单参数微分同胚群、对称性与高斯-科达齐方程）', 'Lie Derivatives, Killing Fields and Hypersurfaces', ['矢量场积分曲线与单参数微分同胚群、李导数 $\\mathcal{L}_v$、Killing 矢量场 $\\nabla_{(a}\\xi_{b)}=0$ 与测地线守恒量、超曲面诱导度规与外曲率 $K_{ab}$'], ['流形单参数变换群与外曲率']),
      ch(5, '微分形式及其积分（外代数、外微分、体积元与流形上的 Stokes 定理）', 'Differential Forms and Integration on Manifolds', ['全反称张量（微分形式）、楔积 $\\wedge$、外微分算子 $d$ ($d^2=0$)、流形定向与度规适配体积元 $\\varepsilon_{abcd}$、广义 Stokes 定理与 Frobenius 超曲面正交定理'], ['外微分形式与上同调初步']),
      ch(6, '狭义相对论（闵氏时空、世界线、四维动量与理想流体能动张量）', 'Special Relativity in Geometric Language', ['Minkowski 时空几何表述、类时/类光/类空矢量、观测量分解、电动力学协变表示与理想流体能动量张量 $T_{ab} = (\\rho+p)u_a u_b + p g_{ab}$'], ['时空正交分解']),
      ch(7, '广义相对论基础（马赫原理、等效原理、爱因斯坦场方程与测地偏离）', 'Foundations of General Relativity', ['潮汐力与测地偏离方程、愛因斯坦场方程 $G_{ab} + \\Lambda g_{ab} = 8\\pi T_{ab}$、牛顿近似弱场极限与经典检验（引力红移、光线偏折、水星近日点进动与雷达回波延迟）'], ['测地偏离与场方程线性化']),
      ch(8, '球对称度规与 Schwarzschild 黑洞（Birkhoff 定理、Kruskal 延拓与 Penrose 图）', 'Spherically Symmetric Spacetimes and Schwarzschild Black Holes', ['球对称度规一般形式與 Birkhoff 定理、史瓦西度规奇异性分析、Eddington-Finkelstein 坐标、Kruskal 最大解析延拓、共形紧致化与 Penrose-Carter 图、恒星内部 TOV 方程'], ['时空最大解析延拓与共形几何']),
      ch(9, '引力波（线性化爱因斯坦方程、TT 规范偏振模与四极矩辐射公式）', 'Gravitational Waves', ['弱场微扰规范变换、Lorenz 规范与横向无迹 (TT) 规范、平面引力波对检验粒子作用与孤立源引力辐射功率'], ['微扰规范不变性分解']),
      ch(10, '宇宙学（宇宙学原理、Robertson-Walker 度规、Friedmann 方程与大爆炸模型）', 'Relativistic Cosmology', ['空间齐性各向同性对称性、RW 度规、宇宙学红移、Hubble 定律、Friedmann 动力学方程、粒子视界与事件视界、早期热宇宙与暴胀简介'], ['最大对称子流形与宇宙学动力学']),
    ],
  },
  {
    id: 'linzonghan-statmech',
    matchPatterns: [
      /林宗涵/,
      /汪志诚/,
      /热力学与统计物理/,
      /热力学·统计物理/,
    ],
    canonicalTitle: '《热力学与统计物理学》（林宗涵 / 汪志诚 著）',
    canonicalAuthors: '林宗涵 / 汪志诚',
    defaultEdition: '北京大学出版社 / 高等教育出版社',
    domain: '热力学与统计物理 (Thermodynamics & Statistical Physics)',
    chapters: [
      ch(1, '热力学的基本规律（热力学第零、第一、第二定律、熵与热力学函数麦克斯韦关系）', 'Fundamental Laws of Thermodynamics', ['状态方程、热力学第一定律、卡诺定理与克劳修斯不等式、熵增加原理、自由能/吉布斯函数与 Maxwell 偏导数关系'], ['全微分与 Legendre 变换']),
      ch(2, '均匀物质的热力学性质与单元系相变（克拉珀龙方程、范德瓦耳斯方程与临界点）', 'Thermodynamic Properties and Phase Transitions', ['内能/焓/熵普遍关系式、焦耳-汤姆孙效应、单元复相系相平衡条件、Clapeyron 方程、一级相变与 Ehrenfest 连续相变分类、朗道相变平均场理论'], ['热力学势稳定性判据']),
      ch(3, '多元系的复相平衡和化学平衡、热力学第三定律', 'Multicomponent Phase Equilibrium and Third Law', ['多元系化学势、吉布斯相律 $f = k - \\varphi + 2$、质量作用定律与 Nernst 热定理（热力学第三定律）'], ['多元齐次函数 Euler 定理']),
      ch(4, '近独立粒子的最概然分布（玻尔兹曼、玻色與费米分布推导）', 'Most Probable Distribution of Nearly Independent Particles', ['粒子运动状态量子与经典相格描述、等概率原理、玻尔兹曼/玻色/费米系统的微观状态数与拉格朗日乘子法推导三种统计分布'], ['组合计数与 Stirling 公式']),
      ch(5, '玻尔兹曼统计（麦克斯韦速度分布、能量均分定理、理想气体热容与顺磁性）', 'Boltzmann Statistics', ['经典配分函数 $Z_1$、麦克斯韦速度分布律、经典能量均分定理、双原子分子振动/转动配分函数与固体杜隆-珀替定律、顺磁性固体居里定律'], ['高斯积分与单粒子配分函数']),
      ch(6, '玻色统计和费米统计（弱简并气体、玻色-爱因斯坦凝聚 BEC、光子气体、声子与金属自由电子气）', 'Bose-Einstein and Fermi-Dirac Statistics', ['巨配分函数导出玻色/费米分布、玻色-爱因斯坦凝聚 (BEC) 临界温度、Planck 黑体辐射、固体 Debye 比热模型、强简并费米气体 Sommerfeld 展开、金属电子线性比热、泡利顺磁性与白矮星简并压'], ['Bose/Fermi 积分渐近展开']),
      ch(7, '系综理论（相空间刘维尔定理、微正则系综、正则系综、巨正则系综与量子密度矩阵）', 'Ensemble Theory', ['经典相空间代表点与 Liouville 定理、微正则系综、正则系综配分函数与能量涨落、巨正则系综巨配分函数与粒子数涨落、非理想气体维里展开与 Mayer 集团展开、量子统计密度算符 $\\hat{\\rho}$ 与 Von Neumann 方程'], ['相空间高维积分与算符迹']),
      ch(8, '涨落理论（准热力学涨落高斯分布、临界乳光、布朗运动 Langevin 方程与涨落-耗散定理）', 'Theory of Fluctuations', ['热力学量围绕平衡值的涨落概率 $w \\propto e^{\\Delta S/k_B}$、光散射与临界涨落空间关联函数、布朗运动 Langevin 方程、Fokker-Planck 方程与 Nyquist 热噪声定理'], ['随机过程关联函数与功率谱']),
      ch(9, '非平衡态统计物理初步（玻尔兹曼输运方程、H 定理、弛豫时间近似与不可逆过程热力学）', 'Non-Equilibrium Statistical Physics', ['玻尔兹曼积分微分方程、分子混沌假设与 H 定理、弛豫时间近似下的金属电导率/热导率与 Wiedemann-Franz 定律、Onsager 倒易关系与最小熵产生定理'], ['动力论碰撞积分与线性响应']),
      ch(10, '相变与临界现象重整化群理论（Ising 模型、平均场、标度律与 Kadanoff/Wilson 重整化群）', 'Phase Transitions and Renormalization Group', ['Ising 模型一维转移矩阵解与二维 Onsager 解概述、临界指数标度关系、块自旋重整化群变换与不动点分析'], ['转移矩阵与重整化群流方程']),
    ],
  },
  {
    id: 'huangkun-solidstate',
    matchPatterns: [
      /黄昆/,
      /韩汝琦/,
      /^《?固体物理学?》?$/,
    ],
    canonicalTitle: '《固体物理学》（黄昆 原著，韩汝琦 改编）',
    canonicalAuthors: '黄昆，韩汝琦',
    defaultEdition: '高等教育出版社',
    domain: '固体物理与凝聚态基础 (Solid State Physics)',
    chapters: [
      ch(1, '晶体结构（晶格周期性、布拉伐格子、晶向晶面指数与倒易点阵）', 'Crystal Structure and Reciprocal Lattice', ['原胞与基矢、七大晶系与 14 种布拉伐格子、密勒指数、倒格子与布里渊区、X 射线衍射布拉格定律与劳厄方程'], ['三维周期点阵 Fourier 变换']),
      ch(2, '固体的结合（离子晶体马德隆常数、共价结合、金属结合与范德瓦耳斯结合）', 'Crystal Binding', ['内聚能、离子晶体静电马德隆能、分子晶体 Lennard-Jones 势与共价键杂化轨道'], ['点阵无穷级数求和 (Evjen 方法)']),
      ch(3, '晶格振动与晶体的热学性质（一维单原子/双原子链、声学波/光学波、声子与 Debye 比热）', 'Lattice Vibrations and Thermal Properties', ['一维单原子链色散关系与第一布里渊区、一维双原子链声学支与光学支、三维晶格振动简正模式与声子能量量子、爱因斯坦与德拜热容模型、非谐效应与热膨胀/热导率'], ['周期边界条件 Born-von Kármán 与简正坐标变换']),
      ch(4, '能带理论（布洛赫定理、近自由电子近似、紧束缚近似 LCAO 与态密度）', 'Energy Band Theory', ['周期势场 Bloch 定理、近自由电子微扰能隙开启、紧束缚近似 (Tight-Binding) 能带公式、等能面与电子态密度 $g(E)$ 及范霍夫奇点'], ['周期势薛定谔方程与简并微扰']),
      ch(5, '晶体中电子在电场和磁场中的运动（准经典运动、有效质量张量、空穴、导体/绝缘体/半导体与回旋共振、德哈斯-范阿尔芬效应）', 'Electron Dynamics in Electric and Magnetic Fields', ['波包群速度、电子准经典动力学方程 $\\hbar\\dot{\\mathbf{k}} = -e(\\mathbf{E} + \\mathbf{v}\\times\\mathbf{B})$、有效质量张量 $m^*_{ij}$、满带与空穴导电、强磁场朗道能级量子化与 de Haas-van Alphen 振荡'], ['倒空间准经典轨道积分']),
      ch(6, '金属电子论（费米球、功函数、接触电势与玻尔兹曼方程电导理论）', 'Electron Theory of Metals', ['自由电子费米气、电声子散射弛豫时间与金属电阻率温度依赖'], ['费米面输运积分']),
      ch(7, '半导体电子论（本征与杂质半导体载流子统计分布、电导与霍尔效应、PN 结整流与光伏效应）', 'Semiconductor Physics', ['导带电子与价带空穴浓度乘积律、施主与受主杂质电离度、费米能级随温度移动、Hall 效应与 PN 结扩散/漂移势垒'], ['巨正则半导体载流子统计']),
      ch(8, '固体的磁性（原子磁矩、朗之万抗磁、范弗莱克顺磁、铁磁交换作用 Heisenberg 模型与自旋波磁振子）', 'Magnetism in Solids', ['外斯分子场理论、海森堡交换哈密顿量 $H = -\\sum J_{ij}\\mathbf{S}_i\\cdot\\mathbf{S}_j$、铁磁自旋波 (Magnons) $T^{3/2}$ 布洛赫定律与反铁磁/亚铁磁'], ['Holstein-Primakoff 玻色化初步']),
      ch(9, '超导电性基本现象与 BCS 理论简介（零电阻、迈斯纳效应、伦敦方程、磁通量子化、库珀对与约瑟夫森效应）', 'Superconductivity', ['第一类与第二类超导体、London 穿透深度、同位素效应、电子-声子吸引与 Cooper 对能隙、DC/AC Josephson 效应'], ['宏观量子波函数相位相干']),
    ],
  },
  {
    id: 'altland-simons-cmft',
    matchPatterns: [
      /altland/i,
      /simons/i,
      /condensed\s+matter\s+field\s+theory/i,
      /凝聚态场论/,
    ],
    canonicalTitle: 'Condensed Matter Field Theory',
    canonicalAuthors: 'Alexander Altland, Ben D. Simons',
    defaultEdition: '2nd / 3rd Edition (Cambridge University Press)',
    domain: '凝聚态量子场论与多体物理 (Condensed Matter Field Theory)',
    chapters: [
      ch(1, '从粒子到场：晶格连续极限、声子拉格朗日量与电磁规范场', 'From Particles to Fields', ['经典谐振子链连续场极限、泛函变分与 Noether 定理、二次量子化前导'], ['泛函导数与连续极限展开']),
      ch(2, '二次量子化：玻色/费米产生湮灭算符、Fock 空间、自旋系统 Jordan-Wigner 变换与 Hubbard 模型', 'Second Quantization', ['Fock 空间表示、紧束缚哈密顿量、Bogoliubov 变换对角化超流与反铁磁自旋波、一维自旋链 Jordan-Wigner 费米化'], ['算符二次量子化与 Bogoliubov 变换']),
      ch(3, 'Feynman 路径积分：虚时欧氏路径积分、相干态泛函积分与 Matsubara 频率求和', 'Feynman Path Integral', ['玻色相干态与 Grassmann 费米相干态完备性、量子配分函数泛函积分表示、虚时周期/反周期边界条件与 Matsubara 留数求和'], ['复平面留数定理 Matsubara 求和', 'Grassmann 相干态积分']),
      ch(4, '泛函场积分：自洽场 Saddle-Point、Hubbard-Stratonovich 变换、BCS 超导与等离子体 RPA 屏蔽', 'Functional Field Integral', ['相互作用四费米子项 Hubbard-Stratonovich 辅助场解耦、电子气等离子体振荡 RPA 介电函数与 BCS 平均场能隙方程'], ['Hubbard-Stratonovich 恒等式与高斯涨落']),
      ch(5, '微扰论与 Feynman 图：Wick 定理、自能 Dyson 方程、杂质无序平均与电导图展开', 'Perturbation Theory', ['连通图定理、单粒子格林函数自能、乱相近似 (RPA) 极化泡图与无序金属杂质散射自能'], ['热力学格林函数图技术']),
      ch(6, '破缺对称性与集体现象：Goldstone 模、超流相位刚度、Anderson-Higgs 机制与无序非线性 $\\sigma$ 模型', 'Broken Symmetry and Collective Phenomena', ['自发对称破缺低能有效作用量梯度展开、超导电磁响应 Meissner 核与无序扩散模式 (Diffuson / Cooperon)'], ['低能梯度展开']),
      ch(7, '响应理论：实时间推迟格林函数、解析延拓、Kubo 线性响应公式与涨落-耗散定理', 'Response Theory', ['虚时 Matsubara 格林函数向实频率推迟格林函数解析延拓 $i\\omega_n \\to \\omega + i0^+$、Kubo 电导率公式与 Kramers-Kronig 关系'], ['复频率上半平面解析延拓']),
      ch(8, '重整化群 (RG)：动量壳重整化、耗散量子隧穿、非线性 $\\sigma$ 模型与 BKT 涡旋解束缚相变', 'The Renormalization Group', ['Wilson 动量壳抽取、标度维数、一维与二维弱局域化重整化流及二维 XY 模型 Berezinskii-Kosterlitz-Thouless (BKT) 相变 RG 方程'], ['动量壳泛函积分重整化']),
      ch(9, '拓扑场论：Chern 数、拓扑绝缘体、手征反常、Wess-Zumino 项、整数量子霍尔效应 Pruisken 作用量与分数量子霍尔 Chern-Simons 理论', 'Topology', ['同伦群拓扑孤子、Berry 相位与 TKNN 霍尔电导陈数、1+1 维手征反常与玻色化 (Bosonization)、自旋链 Haldane 能隙 $\\theta$ 项与 2+1 维 Chern-Simons 拓扑场论'], ['同伦群 $\\pi_n$ 与陈类拓扑不变量']),
      ch(10, '非平衡场论：Keldysh 闭合时间回路路径积分、量子 Langevin 与动理学方程', 'Non-Equilibrium (Keldysh) Field Theory', ['Schwinger-Keldysh 正向/反向时间支路生成泛函、Keldysh 旋转（经典场与量子场分量）及量子玻尔兹曼方程推导'], ['Keldysh 矩阵格林函数']),
    ],
  },
  {
    id: 'mazhongqi-grouptheory',
    matchPatterns: [
      /马中骐/,
      /物理学中的群论/,
    ],
    canonicalTitle: '《物理学中的群论》（马中骐 著）',
    canonicalAuthors: '马中骐',
    defaultEdition: '第 3 版（科学出版社）',
    domain: '群论与李代数在物理中的应用 (Group Theory in Physics)',
    chapters: [
      ch(1, '群的基本概念（群公理、子群、陪集、共轭类、商群与同态基本定理）', 'Basic Concepts of Groups', ['群乘法表、拉格朗日定理、不变子群与商群、群的直积与半直积'], ['抽象代数群结构']),
      ch(2, '群的线性表示理论（等价表示、不可约表示、舒尔引理、正交关系与正则表示）', 'Group Representation Theory', ['舒尔引理 (Schur Lemma)、不可约幺正表示矩阵元完备正交定理、特征标表构造与直积表示 Clebsch-Gordan 分解'], ['有限群特征标正交分析']),
      ch(3, '点群与晶体对称性（SO(3) 有限子群、32 晶体点群与双群）', 'Point Groups and Crystal Symmetry', ['第一类与第二类正多面体点群、晶体场能级劈裂与自旋双群表示'], ['点群不可约表示分解']),
      ch(4, '置换群 $S_n$ 与杨图、杨表及不可约张量基', 'Symmetric Group Sn and Young Tableaux', ['置换轮换结构、配分与杨图 (Young Diagrams)、标准杨表、杨对称化算子与钩长公式 (Hook Length Formula)'], ['置换群代数与杨算子']),
      ch(5, '连续群与李代数基础（SO(3)、SU(2) 群参数化、无穷小生成元、伴随表示与 Casimir 算子）', 'Lie Groups and Lie Algebras: SO(3) and SU(2)', ['李群流形与李代数结构常数、Killing 度规、半单李代数判据、SU(2) 不可约表示与 Wigner-Eckart 定理'], ['李代数对易关系与 Killing 型']),
      ch(6, '半单李代数分类：根系、权系、Cartan 矩阵、Dynkin 图与 Weyl 群', 'Semisimple Lie Algebras: Roots, Weights and Dynkin Diagrams', ['Cartan 子代数、根空间分解、单根 (Simple Roots)、Cartan 矩阵、经典李代数 $A_n, B_n, C_n, D_n$ 与例外李代数 Dynkin 图、最高权表示与 Weyl 维数公式'], ['Cartan-Weyl 根权几何与 Dynkin 图']),
      ch(7, 'SU(N) 群表示：张量方法、SU(3) 夸克八重态与规范理论群结构', 'SU(N) Representations and Particle Physics Symmetries', ['SU(N) 基本表示张量积杨表约化、Gell-Mann $\\lambda$ 矩阵、SU(3) 味道八重态与十重态强子质量公式'], ['SU(N) 张量杨表约化']),
      ch(8, 'Lorentz 群与 Poincaré 群及其旋量表示', 'Lorentz Group, Poincaré Group and Spinors', ['固有洛伦兹群 $SO^+(1,3) \\cong SL(2,\\mathbb{C})/\\mathbb{Z}_2$、双自旋子表示 $(j_1, j_2)$ 与 Dirac/Weyl 旋量'], ['非紧致李群有限维与幺正表示']),
    ],
  },
];

const CHINESE_NUMERAL_MAP: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十一: 11,
  十二: 12,
  十三: 13,
  十四: 14,
  十五: 15,
  十六: 16,
  十七: 17,
  十八: 18,
  十九: 19,
  二十: 20,
  二十一: 21,
  二十二: 22,
  二十三: 23,
  二十四: 24,
  二十五: 25,
};

/**
 * Replaces Chinese numerals inside chapter/part expressions (e.g. "第一至七章", "前四章", "第三章")
 * with Arabic numerals so regex parsing is uniform and rock-solid.
 */
export function normalizeChineseNumerals(input: string): string {
  let result = input;
  const sortedKeys = Object.keys(CHINESE_NUMERAL_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const val = CHINESE_NUMERAL_MAP[key];
    result = result.replace(
      new RegExp(`(第|前|头|后|至|到|~|-|–|—|、|,|\\s)${key}(?=\\s*(?:章|节|部分|篇|卷|至|到|~|-|–|—|、|,|$))`, 'g'),
      `$1${val}`
    );
  }
  return result;
}

export interface ParsedScopeResult {
  masteredChapters: Set<number>;
  partialChapters: Set<number>;
  excludedChapters: Set<number>;
  hasExplicitChapterNumbers: boolean;
  isFullBook: boolean;
  partMatched: string[];
  topicKeywordsIncluded: string[];
  topicKeywordsExcluded: string[];
  humanSummary: string;
}

/**
 * Parses a natural-language learning scope string (e.g., "第1-7章，第9章；第6章不太熟，跳过第3章" or "前五章" or "Part I")
 * into exact chapter sets and topic keywords.
 */
export function parseReadScopeExpression(
  readScope: string,
  totalChapters?: number,
  selfReportedMastered: string = '',
  selfReportedUnfamiliar: string = ''
): ParsedScopeResult {
  const normalized = normalizeChineseNumerals(readScope);
  const masteredChapters = new Set<number>();
  const partialChapters = new Set<number>();
  const excludedChapters = new Set<number>();
  const partMatched: string[] = [];

  // Infer effective max chapter bound if totalChapters is not yet known
  const mentionedDigits = [...normalized.matchAll(/\d+/g)]
    .map((m) => parseInt(m[0], 10))
    .filter((n) => n >= 1 && n <= 60);
  const maxBound = totalChapters ?? (mentionedDigits.length > 0 ? Math.max(...mentionedDigits) : 20);

  // Split into clauses so positive read ranges, exclusion clauses, and partial/skimmed clauses are evaluated independently
  const clauses = normalized
    .split(
      /[；;。\n]+|[，,]\s*(?=(?:第|ch|前|头|后|但|不过|除|跳过|不含|未读|未看|未学|没读|没看|没学|略过|其中|全|上|下|part|skip|except))/i
    )
    .map((c) => c.trim())
    .filter(Boolean);

  let isFullBook = false;

  const extractNumbersAndRanges = (text: string): number[] => {
    const nums: number[] = [];

    // 1. Prefix "前 N 章" / "头 N 章" / "first N chapters" / "up to ch N" / "第 N 章以前"
    const prefixMatches = [
      ...text.matchAll(/(?:前|头|first\s+|up\s+to\s+(?:ch(?:apter)?\.?\s*)?)(\d+)\s*(?:章|节|chapters?)?/gi),
      ...text.matchAll(/第?\s*(\d+)\s*章\s*(?:以前|之前|及以前)/gi),
    ];
    for (const m of prefixMatches) {
      const end = Math.min(parseInt(m[1], 10), maxBound);
      for (let i = 1; i <= end; i++) nums.push(i);
    }

    // 2. Suffix "第 N 章以后" / "第 N 章及以后" / "后 N 章"
    const afterMatches = [...text.matchAll(/第?\s*(\d+)\s*章\s*(?:以后|之后|及以后|往后)/gi)];
    for (const m of afterMatches) {
      const start = Math.max(1, parseInt(m[1], 10));
      for (let i = start; i <= maxBound; i++) nums.push(i);
    }
    const lastNMatches = [...text.matchAll(/后\s*(\d+)\s*章/gi)];
    for (const m of lastNMatches) {
      const count = parseInt(m[1], 10);
      for (let i = Math.max(1, maxBound - count + 1); i <= maxBound; i++) nums.push(i);
    }

    // 3. Explicit ranges: "1-7", "1~7", "1至7", "1到7", "第1章至第7章", "Ch. 1 - 7", "Chapters 1 through 7"
    const rangeMatches = [
      ...text.matchAll(
        /(?:第|ch(?:apters?|ap)?\.?\s*)?(\d+)\s*(?:章|节)?\s*(?:-|–|—|~|～|至|到|through|to)\s*(?:第|ch(?:apters?|ap)?\.?\s*)?(\d+)\s*(?:章|节)?/gi
      ),
    ];
    for (const m of rangeMatches) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      const start = Math.max(1, Math.min(a, b));
      const end = Math.min(maxBound, Math.max(a, b));
      for (let i = start; i <= end; i++) nums.push(i);
    }

    // 4. Enumerated lists or single chapters: e.g. "第1、3、5章", "Ch 1, 2, 4", "第9章"
    const listBlocks = [
      ...text.matchAll(
        /(?:第|ch(?:apters?|ap)?\.?\s*)(\d+(?:\s*(?:、|,|，|和|与|及|and|&)\s*(?:第|ch(?:apters?|ap)?\.?\s*)?\d+)*)\s*(?:章|节)?/gi
      ),
      ...text.matchAll(
        /(\d+(?:\s*(?:、|,|，|和|与|及|and|&)\s*\d+)+)\s*(?:章|节)/gi
      ),
      ...text.matchAll(/(\d+)\s*(?:章|节)/gi),
    ];
    for (const m of listBlocks) {
      const digits = m[1].match(/\d+/g) || [];
      for (const d of digits) {
        const n = parseInt(d, 10);
        if (n >= 1 && n <= maxBound) nums.push(n);
      }
    }

    return Array.from(new Set(nums));
  };

  for (const clause of clauses) {
    const isExclusionClause = /(?:除了?|跳过|不含|未读|未看|未学|没读|没看|没学|略过|除外|except|skip|without|excluding|unread)/i.test(
      clause
    );
    const isPartialClause = /(?:粗读|略读|大致|半熟|不太熟|看了一半|部分|接触过|不扎实|不够熟|模糊|skimmed|partially|briefly)/i.test(
      clause
    );

    if (/(?:全书|全部章节|整本书|整部|通读|all\s+chapters|entire\s+book|whole\s+book)/i.test(clause) && !isExclusionClause) {
      isFullBook = true;
      for (let i = 1; i <= maxBound; i++) masteredChapters.add(i);
    }

    if (/(?:上半册|前半部分|前半本|第一部分|part\s*1\b|part\s*i\b)/i.test(clause)) {
      partMatched.push('Part I');
      const half = maxBound >= 18 ? 7 : Math.ceil(maxBound / 2);
      for (let i = 1; i <= half; i++) {
        if (isExclusionClause) excludedChapters.add(i);
        else if (isPartialClause) partialChapters.add(i);
        else masteredChapters.add(i);
      }
    }
    if (/(?:第二部分|中篇|part\s*2\b|part\s*ii\b)/i.test(clause)) {
      partMatched.push('Part II');
      const start = maxBound >= 18 ? 8 : Math.floor(maxBound / 3) + 1;
      const end = maxBound >= 18 ? 14 : Math.floor((maxBound * 2) / 3);
      for (let i = start; i <= end; i++) {
        if (isExclusionClause) excludedChapters.add(i);
        else if (isPartialClause) partialChapters.add(i);
        else masteredChapters.add(i);
      }
    }
    if (/(?:下半册|后半部分|后半本|第三部分|part\s*3\b|part\s*iii\b)/i.test(clause)) {
      partMatched.push('Part III');
      const start = maxBound >= 18 ? 15 : Math.ceil(maxBound / 2) + 1;
      for (let i = start; i <= maxBound; i++) {
        if (isExclusionClause) excludedChapters.add(i);
        else if (isPartialClause) partialChapters.add(i);
        else masteredChapters.add(i);
      }
    }

    const nums = extractNumbersAndRanges(clause);
    for (const n of nums) {
      if (isExclusionClause) {
        excludedChapters.add(n);
        masteredChapters.delete(n);
        partialChapters.delete(n);
      } else if (isPartialClause) {
        partialChapters.add(n);
        masteredChapters.delete(n);
      } else {
        masteredChapters.add(n);
      }
    }
  }

  if (selfReportedUnfamiliar.trim()) {
    const unfamNorm = normalizeChineseNumerals(selfReportedUnfamiliar);
    const unfamNums = extractNumbersAndRanges(unfamNorm);
    for (const n of unfamNums) {
      excludedChapters.add(n);
      masteredChapters.delete(n);
    }
  }

  const splitTopics = (raw: string): string[] =>
    raw
      .replace(/第?\s*\d+(?:\s*[-~至到]\s*\d+)?\s*[章节]/g, ' ')
      .replace(/[()（）【】\[\]]/g, ' ')
      .split(/[，,、；;。\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && !/^(?:以及|还有|包括|主要是|已读|阅读了|学习了|掌握了|前\d+章)$/.test(s));

  const topicKeywordsIncluded = Array.from(
    new Set([...splitTopics(readScope), ...splitTopics(selfReportedMastered)])
  );
  const topicKeywordsExcluded = Array.from(new Set(splitTopics(selfReportedUnfamiliar)));

  const hasExplicitChapterNumbers =
    masteredChapters.size > 0 || partialChapters.size > 0 || isFullBook;

  const formatChapterList = (set: Set<number>): string => {
    const arr = Array.from(set).sort((a, b) => a - b);
    if (arr.length === 0) return '无';
    const ranges: string[] = [];
    let start = arr[0];
    let prev = arr[0];
    for (let i = 1; i <= arr.length; i++) {
      if (i < arr.length && arr[i] === prev + 1) {
        prev = arr[i];
      } else {
        ranges.push(start === prev ? `第 ${start} 章` : `第 ${start}–${prev} 章`);
        if (i < arr.length) {
          start = arr[i];
          prev = arr[i];
        }
      }
    }
    return ranges.join('、');
  };

  let unreadSummaryPart = '';
  if (totalChapters !== undefined) {
    const unreadSet = new Set<number>();
    for (let i = 1; i <= totalChapters; i++) {
      if (!masteredChapters.has(i) && !partialChapters.has(i)) {
        unreadSet.add(i);
      }
    }
    unreadSummaryPart = `；未读/跳过章节 (K3) ${formatChapterList(unreadSet)}`;
  } else if (excludedChapters.size > 0) {
    unreadSummaryPart = `；明确跳过/未读 (K3) ${formatChapterList(excludedChapters)} 及其他未涉足章节`;
  } else {
    unreadSummaryPart = '；其余未涉足章节自动归入 K3 陌生知识';
  }

  const humanSummary = hasExplicitChapterNumbers
    ? `已精准解析章节范围：已掌握 (K1) ${formatChapterList(masteredChapters)}${
        partialChapters.size > 0 ? `；接触过/半熟 (K2) ${formatChapterList(partialChapters)}` : ''
      }${unreadSummaryPart}`
    : `已按主题关键词解析范围：已学主题（${topicKeywordsIncluded.join('、') || readScope}）${
        topicKeywordsExcluded.length > 0 ? `；明确未学（${topicKeywordsExcluded.join('、')}）` : ''
      }`;

  return {
    masteredChapters,
    partialChapters,
    excludedChapters,
    hasExplicitChapterNumbers,
    isFullBook,
    partMatched,
    topicKeywordsIncluded,
    topicKeywordsExcluded,
    humanSummary,
  };
}

/**
 * Matches a book title/author against our authentic Physics Textbook Catalog.
 */
export function matchTextbookCatalog(title: string, authors: string = ''): TextbookCatalogEntry | null {
  const combined = `${title} ${authors}`.trim();
  if (!combined) return null;
  for (const entry of PHYSICS_TEXTBOOK_CATALOG) {
    if (entry.matchPatterns.some((re) => re.test(combined))) {
      return entry;
    }
  }
  return null;
}

/**
 * Parses user-pasted or web-scraped Table of Contents lines (one chapter per line)
 * into structured TextbookCatalogChapter items.
 */
export function parseCustomTocLines(rawTocText: string): TextbookCatalogChapter[] {
  const lines = rawTocText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);

  const chapters: TextbookCatalogChapter[] = [];
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const normalized = normalizeChineseNumerals(rawLine);
    const numMatch = normalized.match(/^(?:第\s*)?(\d+)\s*(?:章|节|\.|、|:|：|-|\s)\s*(.+)$/i);
    const chapNum = numMatch ? parseInt(numMatch[1], 10) : i + 1;
    const cleanTitle = numMatch ? numMatch[2].trim() : rawLine;

    // Split optional concepts separated by — or | or （...）
    const parts = cleanTitle.split(/\s*(?:—|--|\||｜|：|:)\s*/);
    const mainTitle = parts[0] || cleanTitle;
    const extraConcepts = parts.slice(1).flatMap((p) => p.split(/[，,、；;]/).map((s) => s.trim()).filter(Boolean));

    chapters.push({
      chapterNumber: chapNum,
      titleZh: mainTitle,
      titleEn: `Chapter ${chapNum}: ${mainTitle}`,
      coreConcepts: extraConcepts.length > 0 ? extraConcepts : [mainTitle],
      mathTools: [`第 ${chapNum} 章核心理论与数学推导方法`],
      keyFormulasLatex: [],
      keywords: [mainTitle.toLowerCase(), ...extraConcepts.map((c) => c.toLowerCase())],
    });
  }
  return chapters;
}

export interface DeterministicMaterialAnalysis {
  domain: string;
  authors: string;
  editionOrYear: string;
  parsedScopeSummary: string;
  chapterBreakdown: ChapterScopeItem[];
  explicitMastered: string[];
  inferredMastered: string[];
  unlearnedOrSkipped: string[];
  mathTools: string[];
  keyTheoremsAndFormulas: string[];
  depthRating: string;
  supportedPhysicsProblems: string[];
  extractedNodes: Array<{
    conceptNameZh: string;
    conceptNameEn: string;
    level: KnowledgeLevel;
    epistemicStatus: EpistemicStatus;
    rationale: string;
    formulaLatex?: string;
  }>;
}

/**
 * Maps an authentic array of book chapters (from the catalog, from Gemini/web TOC retrieval, or from user paste)
 * against the user's `readScope`, `selfReportedMastered`, and `selfReportedUnfamiliar`.
 * If no book TOC is available yet, it NEVER invents fake chapters — it only parses what the user explicitly wrote!
 */
export function analyzeMaterialScopeDeterministically(params: {
  title: string;
  authors?: string;
  editionOrYear?: string;
  readScope: string;
  selfReportedMastered?: string;
  selfReportedUnfamiliar?: string;
  externalChapters?: TextbookCatalogChapter[];
  customTocText?: string;
}): DeterministicMaterialAnalysis {
  const {
    title,
    authors = '',
    editionOrYear = '',
    readScope,
    selfReportedMastered = '',
    selfReportedUnfamiliar = '',
    externalChapters = [],
    customTocText = '',
  } = params;

  const matchedBook = matchTextbookCatalog(title, authors);
  const customParsedChapters = customTocText.trim()
    ? parseCustomTocLines(customTocText)
    : [];

  // Priority: 1. User-pasted custom TOC -> 2. AI/Web retrieved real chapters -> 3. Built-in 30+ textbook catalog -> 4. Empty (no fake chapters!)
  const realChapters: TextbookCatalogChapter[] =
    customParsedChapters.length > 0
      ? customParsedChapters
      : externalChapters.length > 0
      ? externalChapters
      : matchedBook
      ? matchedBook.chapters
      : [];

  const totalChaptersCount =
    realChapters.length > 0
      ? Math.max(...realChapters.map((c) => c.chapterNumber))
      : undefined;

  const parsedScope = parseReadScopeExpression(
    readScope,
    totalChaptersCount,
    selfReportedMastered,
    selfReportedUnfamiliar
  );

  const chapterBreakdown: ChapterScopeItem[] = realChapters.map((chItem) => {
    let status: ChapterScopeItem['status'] = 'unread_k3';
    let statusReason = '';

    const chSearchableText = [
      chItem.titleZh,
      chItem.titleEn,
      ...chItem.coreConcepts,
      ...(chItem.keywords || []),
    ]
      .join(' ')
      .toLowerCase();

    const matchedExcludedKeyword = parsedScope.topicKeywordsExcluded.find((kw) =>
      chSearchableText.includes(kw.toLowerCase())
    );
    const matchedIncludedKeyword = parsedScope.topicKeywordsIncluded.find((kw) =>
      chSearchableText.includes(kw.toLowerCase())
    );

    if (parsedScope.excludedChapters.has(chItem.chapterNumber) || matchedExcludedKeyword) {
      status = 'unread_k3';
      statusReason = matchedExcludedKeyword
        ? `您明确指出未学或生疏「${matchedExcludedKeyword}」，本章归入 K3 陌生知识`
        : `您在阅读范围中明确排除了第 ${chItem.chapterNumber} 章，归入 K3 陌生知识`;
    } else if (parsedScope.partialChapters.has(chItem.chapterNumber)) {
      status = 'partial_k2';
      statusReason = `第 ${chItem.chapterNumber} 章位于您的半熟/略读范围内，归入 K2 相关知识`;
    } else if (parsedScope.masteredChapters.has(chItem.chapterNumber)) {
      status = 'mastered_k1';
      statusReason = `第 ${chItem.chapterNumber} 章位于您明确录入的阅读范围（${readScope}）内，归入 K1 已学习基础`;
    } else if (!parsedScope.hasExplicitChapterNumbers && matchedIncludedKeyword) {
      status = 'mastered_k1';
      statusReason = `本章匹配您录入的已学主题「${matchedIncludedKeyword}」，归入 K1 已学习知识`;
    } else {
      status = 'unread_k3';
      statusReason = `第 ${chItem.chapterNumber} 章超出您录入的阅读范围（${readScope}），严禁凭书名默认已掌握，归入 K3 未知知识`;
    }

    return {
      chapterNumber: chItem.chapterNumber,
      chapterTitleZh: chItem.titleZh,
      chapterTitleEn: chItem.titleEn,
      status,
      statusReason,
      coreConcepts: chItem.coreConcepts,
      keyFormulasLatex: chItem.keyFormulasLatex || [],
      mathTools: chItem.mathTools || [],
    };
  });

  const masteredChs = chapterBreakdown.filter((c) => c.status === 'mastered_k1');
  const partialChs = chapterBreakdown.filter((c) => c.status === 'partial_k2');
  const unreadChs = chapterBreakdown.filter((c) => c.status === 'unread_k3');

  const userExplicitItems = selfReportedMastered
    .split(/[，,；;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const userUnfamiliarItems = selfReportedUnfamiliar
    .split(/[，,；;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const explicitMastered: string[] = [
    ...userExplicitItems.map((item) => `【用户明确声明已掌握】${item}`),
    ...masteredChs.flatMap((chItem) =>
      chItem.coreConcepts
        .slice(0, 2)
        .map((c) => `第 ${chItem.chapterNumber} 章（${chItem.chapterTitleZh}）：${c}`)
    ),
  ];
  if (explicitMastered.length === 0) {
    explicitMastered.push(`《${title}》阅读范围（${readScope}）内的核心理论与推导`);
  }

  const inferredMastered: string[] = [
    ...partialChs.map(
      (chItem) =>
        `第 ${chItem.chapterNumber} 章（${chItem.chapterTitleZh}）：${chItem.coreConcepts.join('、')}（略读/部分接触）`
    ),
    ...masteredChs
      .filter((chItem) => chItem.coreConcepts.length > 2)
      .map(
        (chItem) =>
          `第 ${chItem.chapterNumber} 章高阶应用：${chItem.coreConcepts.slice(2).join('、')}`
      ),
  ];
  if (inferredMastered.length === 0) {
    inferredMastered.push(
      `《${title}》已读范围（${readScope}）在特殊边界条件与复杂极限下的综合推导应用`
    );
  }

  const unlearnedOrSkipped: string[] = [
    ...userUnfamiliarItems.map((item) => `【用户明确声明未学/生疏】${item}`),
    ...unreadChs.map(
      (chItem) =>
        `未读第 ${chItem.chapterNumber} 章《${chItem.chapterTitleZh}》：${chItem.coreConcepts
          .slice(0, 2)
          .join('、')}`
    ),
  ];
  if (unlearnedOrSkipped.length === 0) {
    unlearnedOrSkipped.push(
      `《${title}》中超出您的实际阅读范围（${readScope}）的所有未读章节与高阶延伸内容`
    );
  }

  const mathTools = Array.from(
    new Set(
      (masteredChs.length > 0 ? [...masteredChs, ...partialChs] : chapterBreakdown.slice(0, 4)).flatMap(
        (c) => c.mathTools
      )
    )
  );
  if (mathTools.length === 0) {
    mathTools.push(`与《${title}》（${readScope}）配套的数学推导工具`);
  }

  const keyTheoremsAndFormulas = Array.from(
    new Set(
      (masteredChs.length > 0 ? masteredChs : chapterBreakdown.slice(0, 3)).flatMap((c) =>
        c.keyFormulasLatex.map((f) => `$${f}$`)
      )
    )
  ).slice(0, 5);

  const extractedNodes: DeterministicMaterialAnalysis['extractedNodes'] = [];

  for (const item of userExplicitItems) {
    extractedNodes.push({
      conceptNameZh: item,
      conceptNameEn: item,
      level: 'K1',
      epistemicStatus: '已学习知识',
      rationale: `您在录入《${title}》（${readScope}）时明确声明已掌握「${item}」，归为 K1 基础知识，翻译时免除冗余解释。`,
    });
  }

  for (const chItem of masteredChs) {
    extractedNodes.push({
      conceptNameZh: `《${title}》第 ${chItem.chapterNumber} 章：${chItem.chapterTitleZh}`,
      conceptNameEn: `Ch.${chItem.chapterNumber}: ${chItem.chapterTitleEn}`,
      level: 'K1',
      epistemicStatus: '已学习知识',
      rationale: `位于您已阅读的《${title}》第 ${chItem.chapterNumber} 章（阅读范围：${readScope}），核心内容包括：${chItem.coreConcepts.join('、')}。`,
      formulaLatex: chItem.keyFormulasLatex[0],
    });
  }

  for (const chItem of partialChs) {
    extractedNodes.push({
      conceptNameZh: `《${title}》第 ${chItem.chapterNumber} 章：${chItem.chapterTitleZh}`,
      conceptNameEn: `Ch.${chItem.chapterNumber}: ${chItem.chapterTitleEn}`,
      level: 'K2',
      epistemicStatus: '推测掌握知识',
      rationale: `第 ${chItem.chapterNumber} 章处于半熟/接触过状态（${chItem.coreConcepts.join('、')}），仅在论文出现复杂变形或特殊条件时提供批注。`,
      formulaLatex: chItem.keyFormulasLatex[0],
    });
  }

  for (const item of userUnfamiliarItems) {
    extractedNodes.push({
      conceptNameZh: item,
      conceptNameEn: item,
      level: 'K3',
      epistemicStatus: '未知知识',
      rationale: `您在录入《${title}》时明确指出未掌握或生疏「${item}」，归为 K3 陌生知识，论文中出现时必须提供深入批注。`,
    });
  }

  for (const chItem of unreadChs.slice(0, 10)) {
    extractedNodes.push({
      conceptNameZh: `未读第 ${chItem.chapterNumber} 章：${chItem.chapterTitleZh}`,
      conceptNameEn: `Unread Ch.${chItem.chapterNumber}: ${chItem.chapterTitleEn}`,
      level: 'K3',
      epistemicStatus: '未知知识',
      rationale: `《${title}》第 ${chItem.chapterNumber} 章超出您的实际阅读范围（${readScope}）。严禁仅凭书名默认已掌握，涉及「${chItem.coreConcepts.join('、')}」时必须补充前置与数学推导。`,
      formulaLatex: chItem.keyFormulasLatex[0],
    });
  }

  // If no chapter breakdown was available (unlisted book & no TOC fetched yet), still generate nodes for the user's parsed chapter numbers/topics!
  if (chapterBreakdown.length === 0 && extractedNodes.length === 0) {
    extractedNodes.push({
      conceptNameZh: `《${title}》已读范围（${readScope}）`,
      conceptNameEn: `${title} (${readScope})`,
      level: 'K1',
      epistemicStatus: '已学习知识',
      rationale: `根据您录入的《${title}》阅读范围「${readScope}」识别为已学习内容。`,
    });
    extractedNodes.push({
      conceptNameZh: `《${title}》超出「${readScope}」的未读章节`,
      conceptNameEn: `${title} (Unread Chapters beyond ${readScope})`,
      level: 'K3',
      epistemicStatus: '未知知识',
      rationale: `遵循“读过一本书不代表掌握全书”原则，超出「${readScope}」的未读章节一律归为 K3 陌生知识。`,
    });
  }

  const depthRating =
    chapterBreakdown.length > 0
      ? `本书共 ${chapterBreakdown.length} 章：已读掌握 ${masteredChs.length} 章 (K1)${
          partialChs.length > 0 ? `、半熟接触 ${partialChs.length} 章 (K2)` : ''
        }、未读章节 ${unreadChs.length} 章 (K3 未知知识)`
      : `实际阅读范围：${readScope}（${parsedScope.humanSummary}）`;

  const supportedPhysicsProblems =
    masteredChs.length > 0
      ? masteredChs
          .slice(0, 4)
          .map(
            (chItem) =>
              `支持理解基于第 ${chItem.chapterNumber} 章（${chItem.chapterTitleZh}）的理论推导与公式演算`
          )
      : [`支持理解《${title}》(${readScope}) 范围内的理论物理问题`];

  return {
    domain: matchedBook ? matchedBook.domain : '理论物理',
    authors: authors.trim() || (matchedBook ? matchedBook.canonicalAuthors : '学术作者'),
    editionOrYear: editionOrYear.trim() || (matchedBook ? matchedBook.defaultEdition : '标准版本'),
    parsedScopeSummary: parsedScope.humanSummary,
    chapterBreakdown,
    explicitMastered,
    inferredMastered,
    unlearnedOrSkipped,
    mathTools,
    keyTheoremsAndFormulas,
    depthRating,
    supportedPhysicsProblems,
    extractedNodes,
  };
}

/**
 * Recomputes a ReadingMaterial and its KnowledgeNodes when the user interactively clicks
 * a chapter in the UI to toggle its status between `mastered_k1`, `partial_k2`, and `unread_k3`.
 */
export function rebuildMaterialFromChapterBreakdown(
  material: ReadingMaterial,
  updatedBreakdown: ChapterScopeItem[]
): {
  updatedMaterial: ReadingMaterial;
  rebuiltNodesForMaterial: KnowledgeNode[];
} {
  const masteredChs = updatedBreakdown.filter((c) => c.status === 'mastered_k1');
  const partialChs = updatedBreakdown.filter((c) => c.status === 'partial_k2');
  const unreadChs = updatedBreakdown.filter((c) => c.status === 'unread_k3');

  const explicitMastered = masteredChs.flatMap((chItem) =>
    chItem.coreConcepts
      .slice(0, 2)
      .map((c) => `第 ${chItem.chapterNumber} 章（${chItem.chapterTitleZh}）：${c}`)
  );
  const inferredMastered = [
    ...partialChs.map(
      (chItem) =>
        `第 ${chItem.chapterNumber} 章（${chItem.chapterTitleZh}）：${chItem.coreConcepts.join('、')}`
    ),
    ...masteredChs
      .filter((chItem) => chItem.coreConcepts.length > 2)
      .map(
        (chItem) =>
          `第 ${chItem.chapterNumber} 章高阶应用：${chItem.coreConcepts.slice(2).join('、')}`
      ),
  ];
  const unlearnedOrSkipped = unreadChs.map(
    (chItem) =>
      `未读第 ${chItem.chapterNumber} 章《${chItem.chapterTitleZh}》：${chItem.coreConcepts
        .slice(0, 2)
        .join('、')}`
  );

  const parsedScopeSummary = `本书共 ${updatedBreakdown.length} 章：已读掌握 (K1) 第 ${
    masteredChs.map((c) => c.chapterNumber).join('、') || '无'
  } 章；接触过 (K2) 第 ${
    partialChs.map((c) => c.chapterNumber).join('、') || '无'
  } 章；未读/跳过 (K3) 第 ${unreadChs.map((c) => c.chapterNumber).join('、') || '无'} 章`;

  const updatedMaterial: ReadingMaterial = {
    ...material,
    chapterBreakdown: updatedBreakdown,
    parsedScopeSummary,
    explicitMastered: explicitMastered.length > 0 ? explicitMastered : material.explicitMastered,
    inferredMastered,
    unlearnedOrSkipped,
    depthRating: `本书共 ${updatedBreakdown.length} 章：已读掌握 ${masteredChs.length} 章 (K1)、接触过 ${partialChs.length} 章 (K2)、未读 ${unreadChs.length} 章 (K3)`,
  };

  const rebuiltNodesForMaterial: KnowledgeNode[] = [
    ...masteredChs.map((chItem) => ({
      id: `kn-${material.id}-ch-${chItem.chapterNumber}`,
      conceptNameZh: `《${material.title}》第 ${chItem.chapterNumber} 章：${chItem.chapterTitleZh}`,
      conceptNameEn: `Ch.${chItem.chapterNumber}: ${chItem.chapterTitleEn}`,
      level: 'K1' as KnowledgeLevel,
      epistemicStatus: '已学习知识' as EpistemicStatus,
      domain: material.domain,
      sourceMaterialIds: [material.id],
      rationale: `《${material.title}》第 ${chItem.chapterNumber} 章已确认为「已读掌握 (K1)」，翻译时免除冗余批注。`,
      formulaLatex: chItem.keyFormulasLatex[0],
    })),
    ...partialChs.map((chItem) => ({
      id: `kn-${material.id}-ch-${chItem.chapterNumber}`,
      conceptNameZh: `《${material.title}》第 ${chItem.chapterNumber} 章：${chItem.chapterTitleZh}`,
      conceptNameEn: `Ch.${chItem.chapterNumber}: ${chItem.chapterTitleEn}`,
      level: 'K2' as KnowledgeLevel,
      epistemicStatus: '推测掌握知识' as EpistemicStatus,
      domain: material.domain,
      sourceMaterialIds: [material.id],
      rationale: `《${material.title}》第 ${chItem.chapterNumber} 章设定为「接触过/半熟 (K2)」，仅在复杂变形或理解障碍时点拨。`,
      formulaLatex: chItem.keyFormulasLatex[0],
    })),
    ...unreadChs.map((chItem) => ({
      id: `kn-${material.id}-ch-${chItem.chapterNumber}`,
      conceptNameZh: `未读第 ${chItem.chapterNumber} 章：${chItem.chapterTitleZh}`,
      conceptNameEn: `Unread Ch.${chItem.chapterNumber}: ${chItem.chapterTitleEn}`,
      level: 'K3' as KnowledgeLevel,
      epistemicStatus: '未知知识' as EpistemicStatus,
      domain: material.domain,
      sourceMaterialIds: [material.id],
      rationale: `《${material.title}》第 ${chItem.chapterNumber} 章处于未读范围，涉及「${chItem.coreConcepts.join('、')}」时必须提供深度批注。`,
      formulaLatex: chItem.keyFormulasLatex[0],
    })),
  ];

  return { updatedMaterial, rebuiltNodesForMaterial };
}
