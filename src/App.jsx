import React, { useState, useMemo, useEffect } from 'react';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Layers,
  Sliders,
  ShieldCheck,
  AlertTriangle,
  Database,
  Copy,
  Check,
  PlusCircle,
  Search,
  Filter,
  BarChart3,
  Globe,
  Cpu,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  FileSpreadsheet,
  Zap,
  BookOpen,
  RefreshCw
} from 'lucide-react';

// 默认回退数据（当本地或网络 JSON 尚未加载完成时立即渲染，保证零白屏）
const FALLBACK_DATA = {
  lastUpdated: "2026-11-09 15:15:00 CST (内蔵快照)",
  dataSource: "AkShare + FRED API + Local QMT 60m Engine",
  macroQuadrant: "再通胀交易窗口 / 狭义流动性充裕",
  macroAnchors: [
    {
      id: 'tips10y',
      name: '10Y TIPS 实际利率',
      code: 'FRED: DFII10',
      value: '1.82%',
      change: '-6 bps',
      trend: 'down',
      signal: '利多黄金/有色',
      spark: [2.05, 2.01, 1.96, 1.94, 1.89, 1.86, 1.82],
      desc: '实际利率下行压制美元持有成本，支撑黄金及高弹性资源品估值扩张'
    },
    {
      id: 'dxy',
      name: '美元指数 (DXY)',
      code: 'ICE: DXY',
      value: '102.45',
      change: '-0.38%',
      trend: 'down',
      signal: '弱美元周期',
      spark: [104.2, 103.8, 103.5, 103.1, 102.9, 102.7, 102.45],
      desc: '非美央行利差收窄，大宗商品计价货币压制解除'
    },
    {
      id: 'net_liq',
      name: '美联储净流动性',
      code: 'WALCL-TGA-ONRRP',
      value: '$6.18T',
      change: '+$42B (周)',
      trend: 'up',
      signal: '准备金充裕',
      spark: [6.02, 6.05, 6.08, 6.10, 6.12, 6.14, 6.18],
      desc: 'TGA账户释放叠加ON RRP见底，商业银行准备金余额维持高位'
    },
    {
      id: 'gold_oil',
      name: '金油比 (Gold/WTI)',
      code: 'XAU / CL',
      value: '37.8x',
      change: '-1.2x',
      trend: 'down',
      signal: '工业通胀修复',
      spark: [40.5, 39.8, 39.2, 38.9, 38.5, 38.1, 37.8],
      desc: '金油比自高位回落，表明原油及工业品相对贵金属开启补涨共振'
    },
    {
      id: 'cop_gold',
      name: '铜金比 (Copper/Gold)',
      code: 'HG / XAU (x1000)',
      value: '3.64',
      change: '+0.09',
      trend: 'up',
      signal: '全球制造业回暖',
      spark: [3.42, 3.45, 3.49, 3.53, 3.56, 3.60, 3.64],
      desc: '电网CapEx与AI数据中心电力配套拉动铜需求，铜金比底部抬升'
    }
  ],
  commodities: [
    {
      id: 'gold',
      sector: '贵金属',
      name: 'SHFE 黄金 / COMEX Gold',
      code: 'AU2612 / GCZ6',
      futuresPrice: 628.50,
      spotPrice: 631.20,
      unit: '元/克',
      changePct: 1.45,
      basis: 2.70,
      basisPct: 0.43,
      structure: 'Back (现货升水)',
      invLevel: '18.5%',
      invPercentile: 18.5,
      invWeeklyChange: '-3.2%',
      cycleStage: '央行购金+降息共振',
      firstHandNote: '水贝批发市场投资金条加工费回升至+12元/克，上海金溢价维持正值，亚洲实金买盘依然坚挺。',
      forwardCurve: [631.2, 628.5, 627.8, 626.9, 626.0, 625.2],
      basisHistory: [
        { date: 'W-5', basis: -1.2, inv: 28 },
        { date: 'W-4', basis: 0.5, inv: 25 },
        { date: 'W-3', basis: 1.4, inv: 23 },
        { date: 'W-2', basis: 1.9, inv: 21 },
        { date: 'W-1', basis: 2.3, inv: 19.5 },
        { date: '本周', basis: 2.7, inv: 18.5 }
      ]
    },
    {
      id: 'copper',
      sector: '有色金属',
      name: 'SHFE 阴极铜 / LME Copper',
      code: 'CU2612 / HGZ6',
      futuresPrice: 78450,
      spotPrice: 78920,
      unit: '元/吨',
      changePct: 2.18,
      basis: 470,
      basisPct: 0.60,
      structure: 'Strong Back (强升水)',
      invLevel: '14.2%',
      invPercentile: 14.2,
      invWeeklyChange: '-8.6%',
      cycleStage: '主动去库尾声 -> 补库启动',
      firstHandNote: '进口铜精矿TC现货指数跌破6.5美元/干吨，华东主流冶炼厂联合检修落地，下游线缆与特高压变压器排产环比+14%。',
      forwardCurve: [78920, 78450, 78100, 77750, 77400, 77150],
      basisHistory: [
        { date: 'W-5', basis: -180, inv: 34 },
        { date: 'W-4', basis: -50, inv: 29 },
        { date: 'W-3', basis: 120, inv: 24 },
        { date: 'W-2', basis: 260, inv: 19 },
        { date: 'W-1', basis: 390, inv: 16 },
        { date: '本周', basis: 470, inv: 14.2 }
      ]
    }
  ],
  equityPool: [],
  fieldNotes: []
};

const Sparkline = ({ data, color = '#10B981' }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 88;
  const height = 28;
  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

export default function App() {
  const [marketData, setMarketData] = useState(FALLBACK_DATA);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState('fundamentals');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [selectedCommodityId, setSelectedCommodityId] = useState('copper');
  const [chartMode, setChartMode] = useState('basis_inv');

  // Tab 2 跨资产共振筛选状态
  const [boardFilter, setBoardFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedTsv, setCopiedTsv] = useState(false);

  // Tab 3 60m量化策略交互参数
  const [volEntryThreshold, setVolEntryThreshold] = useState(1.05);
  const [volFullThreshold, setVolFullThreshold] = useState(1.40);
  const [atrMaxStandard, setAtrMaxStandard] = useState(2.0);
  const [enableGreenExemption, setEnableGreenExemption] = useState(true);
  const [onlyShowGoldenAtr, setOnlyShowGoldenAtr] = useState(false);

  // Tab 4 一手调研日志状态（支持 localStorage 持久化）
  const [fieldNotes, setFieldNotes] = useState([]);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteCategory, setNewNoteCategory] = useState('有色金属 · 铜/铝');
  const [newNoteSource, setNewNoteSource] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteImpact, setNewNoteImpact] = useState('利多 (Bullish)');
  const [newNoteTickers, setNewNoteTickers] = useState('');

  const fetchMarketData = async () => {
    setIsLoadingData(true);
    try {
      const res = await fetch(`./data/market_data.json?t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        setMarketData(json);
        const savedNotes = localStorage.getItem('commodity_field_notes_v1');
        if (savedNotes) {
          setFieldNotes(JSON.parse(savedNotes));
        } else if (json.fieldNotes) {
          setFieldNotes(json.fieldNotes);
        }
      }
    } catch (err) {
      console.warn('使用内置快照数据:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchMarketData();
  }, []);

  const commoditiesList = marketData.commodities || [];
  const selectedCommodity = useMemo(
    () => commoditiesList.find((c) => c.id === selectedCommodityId) || commoditiesList[0] || FALLBACK_DATA.commodities[0],
    [selectedCommodityId, commoditiesList]
  );

  const filteredCommodities = useMemo(() => {
    if (selectedSector === 'ALL') return commoditiesList;
    return commoditiesList.filter((c) => c.sector === selectedSector);
  }, [selectedSector, commoditiesList]);

  // 动态计算 60m 策略动作与仓位
  const evaluatedEquities = useMemo(() => {
    const pool = marketData.equityPool || [];
    return pool
      .map((item) => {
        const maxAllowedAtr = enableGreenExemption && item.dailyGreenAboveMid ? 3.0 : atrMaxStandard;
        const isGoldenZone = item.dailyGreenAboveMid && item.distFromMidAtr <= 1.0;

        let dynamicAction = '观察等待 (Wait)';
        let actionBadgeColor = 'bg-slate-800 text-slate-300 border-slate-700';
        let dynamicReason = '';

        if (item.distFromMidAtr > maxAllowedAtr) {
          dynamicAction = '风控减半 (Halve - 超ATR上限)';
          actionBadgeColor = 'bg-rose-950/80 text-rose-300 border-rose-700/60';
          dynamicReason = `偏离MID达 ${item.distFromMidAtr} ATR > 阈值 ${maxAllowedAtr.toFixed(1)} ATR，触发高位止盈减半`;
        } else if (!item.dailyGreenAboveMid && item.distFromMidAtr > 1.8) {
          dynamicAction = '收阴减仓 (Halve - 破豁免)';
          actionBadgeColor = 'bg-amber-950/80 text-amber-300 border-amber-700/60';
          dynamicReason = `日线收阴未满足豁免，且距离MID ${item.distFromMidAtr} ATR 偏高，锁利减半`;
        } else if (item.volRatio60m >= volFullThreshold) {
          if (item.distFromMidAtr > atrMaxStandard && enableGreenExemption && item.dailyGreenAboveMid) {
            dynamicAction = '豁免锁仓 / 满仓 (Exempt Hold)';
            actionBadgeColor = 'bg-purple-950/80 text-purple-300 border-purple-600/60';
            dynamicReason = `日线站上MID且为阳线，享受 <3ATR 豁免 (${item.distFromMidAtr} ATR)，免除stop5.5洗盘止损`;
          } else {
            dynamicAction = isGoldenZone ? '1/1 黄金满仓 (Golden Full)' : '1/1 共振满仓 (Full)';
            actionBadgeColor = 'bg-emerald-950/90 text-emerald-300 border-emerald-600/70';
            dynamicReason = `60m量比 ${item.volRatio60m}x >= ${volFullThreshold}x MA5，${
              isGoldenZone ? '且处于<1ATR黄金买点区' : '趋势与板块共振确认'
            }`;
          }
        } else if (item.volRatio60m >= volEntryThreshold) {
          dynamicAction = '1/2 试仓信号 (Half Entry)';
          actionBadgeColor = 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60';
          dynamicReason = `60m量比 ${item.volRatio60m}x >= ${volEntryThreshold}x MA5，先建1/2底仓等待二次放量阳线`;
        } else {
          dynamicReason = `60m量比 ${item.volRatio60m}x 低于试仓线 ${volEntryThreshold}x，继续跟踪`;
        }

        return {
          ...item,
          isGoldenZone,
          dynamicAction,
          actionBadgeColor,
          dynamicReason
        };
      })
      .filter((item) => {
        if (boardFilter !== 'ALL' && !item.board.includes(boardFilter)) return false;
        if (onlyShowGoldenAtr && !item.isGoldenZone) return false;
        if (
          searchQuery.trim() !== '' &&
          !item.name.includes(searchQuery.trim()) &&
          !item.code.toLowerCase().includes(searchQuery.trim().toLowerCase()) &&
          !item.commodity.includes(searchQuery.trim())
        ) {
          return false;
        }
        return true;
      });
  }, [marketData.equityPool, volEntryThreshold, volFullThreshold, atrMaxStandard, enableGreenExemption, boardFilter, onlyShowGoldenAtr, searchQuery]);

  const handleCopyTSV = () => {
    const headers = [
      '代码',
      '名称',
      '交易板块',
      '映射大宗商品',
      '最新价',
      '涨跌幅(%)',
      '60m量比(vs MA5)',
      '日线阳线>MID',
      '距MID距离(ATR)',
      '60m趋势状态',
      '共振评分',
      '策略动作指令',
      '规则触发说明'
    ];
    const rows = evaluatedEquities.map((e) => [
      e.code,
      e.name,
      e.board,
      e.commodity,
      e.price,
      e.changePct,
      e.volRatio60m,
      e.dailyGreenAboveMid ? '是(豁免激活)' : '否',
      e.distFromMidAtr,
      e.exp2Trend,
      e.resonanceScore,
      e.dynamicAction,
      e.dynamicReason
    ]);
    const tsvContent = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(tsvContent);
    setCopiedTsv(true);
    setTimeout(() => setCopiedTsv(false), 2500);
  };

  const handleAddFieldNote = (e) => {
    e.preventDefault();
    if (!newNoteTitle.trim() || !newNoteContent.trim()) return;
    const tickers = newNoteTickers
      .split(/[,，\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    const newEntry = {
      id: Date.now(),
      time: new Date().toISOString().slice(0, 16).replace('T', ' '),
      category: newNoteCategory,
      source: newNoteSource.trim() || '一手现货渠道实录',
      title: newNoteTitle.trim(),
      content: newNoteContent.trim(),
      impact: newNoteImpact,
      linkedTickers: tickers.length ? tickers : ['601899.SH']
    };
    const updated = [newEntry, ...fieldNotes];
    setFieldNotes(updated);
    localStorage.setItem('commodity_field_notes_v1', JSON.stringify(updated));
    setNewNoteTitle('');
    setNewNoteSource('');
    setNewNoteContent('');
    setNewNoteTickers('');
  };

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-100 font-sans selection:bg-amber-500/30 selection:text-amber-200 pb-12">
      {/* 顶部机构级品牌与宏观状态栏 */}
      <header className="border-b border-slate-800/80 bg-[#0B111E]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Layers className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  大宗商品一手观察与策略投研终端
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  OPT4.3.1 · 60M RESONANCE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                宏观流动性定价锚 · 期现基差库存周期 · 全市场资源股（含北交所30cm/创业板20cm）60m信号引擎
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900/90 border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400">宏观象限:</span>
              <span className="font-semibold text-emerald-400">{marketData.macroQuadrant}</span>
            </div>
            <button
              onClick={fetchMarketData}
              title="重新拉取最新 JSON 数据"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 font-mono border border-slate-800 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isLoadingData ? 'animate-spin' : ''}`} />
              <span>{marketData.lastUpdated}</span>
            </button>
          </div>
        </div>

        {/* 顶部 5 大宏观流动性与跨资产比价锚 */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 border-t border-slate-800/60 bg-[#090E1A]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {(marketData.macroAnchors || []).map((item) => {
              const isPositiveSignal =
                item.id === 'tips10y' || item.id === 'dxy' || item.id === 'gold_oil'
                  ? item.trend === 'down'
                  : item.trend === 'up';
              return (
                <div
                  key={item.id}
                  title={item.desc}
                  className="p-2.5 rounded-lg bg-[#111827]/90 border border-slate-800/80 hover:border-slate-700 transition-all flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-300 truncate">{item.name}</span>
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-base font-bold font-mono text-white">{item.value}</span>
                      <span
                        className={`text-xs font-mono font-medium ${
                          isPositiveSignal ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {item.change}
                      </span>
                    </div>
                    <div className="mt-1">
                      <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-slate-800/90 text-amber-300/90 border border-slate-700/60">
                        {item.signal}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <Sparkline data={item.spark} color={isPositiveSignal ? '#10B981' : '#F59E0B'} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 主导航栏 Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto border-t border-slate-800/60">
          {[
            { id: 'fundamentals', label: '一手观察与基本面全景', icon: BarChart3, badge: '期现基差/库存' },
            { id: 'resonance', label: '跨资产与A股资源板块共振', icon: Globe, badge: '含北交所/20cm' },
            { id: 'quant60m', label: '60m量化信号与风控工作台', icon: Cpu, badge: 'MID/ATR豁免' },
            { id: 'fieldnotes', label: '一手现货调研与情报流', icon: BookOpen, badge: `${fieldNotes.length}条实录` }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  active
                    ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    active ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.badge}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* 主体内容容器 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {/* ================= TAB 1: 一手观察与基本面全景 ================= */}
        {activeTab === 'fundamentals' && selectedCommodity && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {['ALL', '贵金属', '有色金属', '能源化工', '黑色建材', '战略小金属'].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setSelectedSector(sec)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedSector === sec
                        ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm shadow-amber-500/30'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {sec === 'ALL' ? '全部核心品种' : sec}
                  </button>
                ))}
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <span>点击任意品种卡片切换右侧深度【期现基差 & 远期曲线】分析</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* 左侧：品种一手监控矩阵 */}
              <div className="lg:col-span-7 space-y-3">
                {filteredCommodities.map((item) => {
                  const isSelected = item.id === selectedCommodity.id;
                  const isPositiveBasis = item.basis >= 0;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedCommodityId(item.id)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#131C2E] border-amber-500/70 shadow-lg shadow-amber-500/5'
                          : 'bg-[#0E1525] border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-slate-800 text-amber-400 border border-slate-700">
                            {item.sector}
                          </span>
                          <h3 className="text-sm sm:text-base font-bold text-white">{item.name}</h3>
                          <span className="text-xs font-mono text-slate-400">{item.code}</span>
                        </div>
                        <span
                          className={`text-xs font-mono px-2 py-0.5 rounded font-semibold ${
                            isPositiveBasis
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/50'
                              : 'bg-amber-950/80 text-amber-400 border border-amber-700/50'
                          }`}
                        >
                          {item.structure}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-800/60">
                        <div>
                          <div className="text-[11px] text-slate-400">期货主力 / 现货一手价</div>
                          <div className="mt-0.5 flex items-baseline gap-1.5">
                            <span className="text-sm font-bold font-mono text-white">{item.futuresPrice}</span>
                            <span className="text-xs text-slate-400">/</span>
                            <span className="text-sm font-bold font-mono text-amber-300">{item.spotPrice}</span>
                          </div>
                          <span
                            className={`text-[11px] font-mono ${
                              item.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {item.changePct >= 0 ? `+${item.changePct}%` : `${item.changePct}%`} ({item.unit})
                          </span>
                        </div>

                        <div>
                          <div className="text-[11px] text-slate-400">期现基差 (现货-期货)</div>
                          <div className="mt-0.5 flex items-baseline gap-1.5">
                            <span
                              className={`text-sm font-bold font-mono ${
                                item.basis >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {item.basis >= 0 ? `+${item.basis}` : item.basis}
                            </span>
                            <span className="text-xs font-mono text-slate-300">
                              ({item.basisPct >= 0 ? `+${item.basisPct}%` : `${item.basisPct}%`})
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {item.basis > 0 ? '现货升水 · 宜逢低做多' : '现货贴水 · 关注仓单压力'}
                          </span>
                        </div>

                        <div>
                          <div className="text-[11px] text-slate-400">显性库存 5年分位数</div>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  item.invPercentile < 25 ? 'bg-emerald-500' : 'bg-amber-500'
                                }`}
                                style={{ width: `${item.invPercentile}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono font-bold text-white">{item.invLevel}</span>
                          </div>
                          <span className="text-[11px] font-mono text-emerald-400">
                            周度去库: {item.invWeeklyChange}
                          </span>
                        </div>

                        <div>
                          <div className="text-[11px] text-slate-400">当前基本面驱动阶段</div>
                          <div className="mt-1 text-xs font-semibold text-amber-200">{item.cycleStage}</div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-800/50 flex items-start gap-2 text-xs text-slate-300">
                        <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-amber-300">一手现货实录：</strong>
                          {item.firstHandNote}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 右侧：选中品种的期现结构与库存周期深度图表 */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-5 rounded-xl bg-[#0F172A] border border-slate-800 sticky top-36">
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
                    <div>
                      <span className="text-xs text-amber-400 font-mono uppercase">Deep Structure Analysis</span>
                      <h3 className="text-base font-bold text-white mt-0.5">{selectedCommodity.name}</h3>
                    </div>
                    <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-xs">
                      <button
                        onClick={() => setChartMode('basis_inv')}
                        className={`px-2.5 py-1 rounded-md transition-all ${
                          chartMode === 'basis_inv' ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-400'
                        }`}
                      >
                        基差 vs 库存
                      </button>
                      <button
                        onClick={() => setChartMode('forward')}
                        className={`px-2.5 py-1 rounded-md transition-all ${
                          chartMode === 'forward' ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-400'
                        }`}
                      >
                        远期价格曲线
                      </button>
                    </div>
                  </div>

                  {chartMode === 'basis_inv' ? (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                        <span>近6周 期现基差走强 vs 显性库存去化共振</span>
                        <span className="font-mono text-emerald-400">低库存 + 正基差 = 强逼仓驱动</span>
                      </div>
                      <div className="bg-[#090D16] p-4 rounded-lg border border-slate-800/80 space-y-3">
                        {(selectedCommodity.basisHistory || []).map((row, idx) => {
                          const maxAbsBasis = Math.max(
                            ...(selectedCommodity.basisHistory || []).map((r) => Math.abs(r.basis)),
                            1
                          );
                          const basisBarWidth = Math.min(100, Math.round((Math.abs(row.basis) / maxAbsBasis) * 100));
                          return (
                            <div key={idx} className="grid grid-cols-12 items-center gap-2 text-xs font-mono">
                              <div className="col-span-2 text-slate-400">{row.date}</div>
                              <div className="col-span-5 flex items-center gap-2">
                                <div className="w-full h-2.5 bg-slate-800 rounded overflow-hidden flex">
                                  <div
                                    className={`h-full ${row.basis >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                    style={{ width: `${basisBarWidth}%` }}
                                  />
                                </div>
                                <span
                                  className={`w-14 text-right ${
                                    row.basis >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                  }`}
                                >
                                  {row.basis >= 0 ? `+${row.basis}` : row.basis}
                                </span>
                              </div>
                              <div className="col-span-5 flex items-center gap-2 pl-2 border-l border-slate-800">
                                <div className="w-full h-2.5 bg-slate-800 rounded overflow-hidden">
                                  <div className="h-full bg-amber-400/80" style={{ width: `${row.inv}%` }} />
                                </div>
                                <span className="w-12 text-right text-amber-300">{row.inv}%</span>
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> 左列：期现基差 ({selectedCommodity.unit})
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> 右列：库存历史分位 (%)
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                        <span>期限结构曲线 (Spot &amp; 近月 {'->'} 远月合约)</span>
                        <span className="font-mono text-amber-400">{selectedCommodity.structure}</span>
                      </div>
                      <div className="bg-[#090D16] p-4 rounded-lg border border-slate-800/80">
                        <div className="grid grid-cols-6 gap-2 items-end h-36 pt-6 px-2">
                          {(selectedCommodity.forwardCurve || []).map((price, idx) => {
                            const curve = selectedCommodity.forwardCurve || [];
                            const minP = Math.min(...curve);
                            const maxP = Math.max(...curve);
                            const range = maxP - minP || 1;
                            const heightPct = 25 + Math.round(((price - minP) / range) * 70);
                            const labels = ['现货', '近月M1', '主力M2', '远月M3', '远月M4', '远月M5'];
                            return (
                              <div key={idx} className="flex flex-col items-center gap-1.5 h-full justify-end">
                                <span className="text-[11px] font-mono text-slate-200">{price}</span>
                                <div
                                  className={`w-full rounded-t transition-all ${
                                    idx === 0
                                      ? 'bg-amber-400'
                                      : idx === 1
                                      ? 'bg-emerald-500'
                                      : 'bg-slate-700 hover:bg-slate-600'
                                  }`}
                                  style={{ height: `${heightPct}%` }}
                                />
                                <span className="text-[10px] font-mono text-slate-400">{labels[idx]}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs space-y-1.5">
                    <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      <span>期现联动做多/映射选股判据：</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      当大宗商品处于 <strong className="text-emerald-400">库存分位 &lt; 25%</strong> 且呈现{' '}
                      <strong className="text-emerald-400">Back (现货升水期货)</strong> 结构时，商品抗跌且极易向上逼空；此时同步切换到【60m量化策略】，优先选择资源自给率高且满足{' '}
                      <code className="text-amber-300 font-mono">vol &gt;= 1.4*MA5</code> 的A股映射龙头。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: 跨资产与A股资源板块共振 ================= */}
        {activeTab === 'resonance' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[#0E1525] border border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 mr-1">交易板块筛选:</span>
                {['ALL', '主板', '创业板', '科创板', '北交所'].map((b) => (
                  <button
                    key={b}
                    onClick={() => setBoardFilter(b)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      boardFilter === b
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    {b === 'ALL' ? '全市场 (保留北交所30cm)' : b}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜代码/名称/商品(如: 铜/北交所)..."
                    className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  onClick={handleCopyTSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-medium transition-all"
                >
                  {copiedTsv ? <Check className="w-3.5 h-3.5" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                  <span>{copiedTsv ? '已复制 TSV (可直接粘贴Excel)' : '一键复制 TSV 映射池'}</span>
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0E1525] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-[#090E1A] text-[11px] font-mono text-slate-400 uppercase">
                      <th className="py-3 px-4">股票代码 / 名称</th>
                      <th className="py-3 px-3">板块弹性</th>
                      <th className="py-3 px-3">映射商品锚</th>
                      <th className="py-3 px-3 text-right">最新价 / 涨幅</th>
                      <th className="py-3 px-3 text-right">60m量比 (vs MA5)</th>
                      <th className="py-3 px-3">日线阳线&gt;MID</th>
                      <th className="py-3 px-3 text-right">距MID (ATR倍数)</th>
                      <th className="py-3 px-3">资源自给率 / 核心壁垒</th>
                      <th className="py-3 px-4">60m共振策略指令</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {evaluatedEquities.map((row) => (
                      <tr key={row.code} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{row.name}</div>
                          <div className="font-mono text-[11px] text-slate-400">{row.code}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                              row.board.includes('北交所')
                                ? 'bg-purple-950/90 text-purple-300 border border-purple-700/60'
                                : row.board.includes('20cm')
                                ? 'bg-blue-950/90 text-blue-300 border border-blue-700/60'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {row.board}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-medium text-amber-300">{row.commodity}</td>
                        <td className="py-3 px-3 text-right font-mono">
                          <div className="text-white font-bold">{row.price.toFixed(2)}</div>
                          <div className={row.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {row.changePct >= 0 ? `+${row.changePct}%` : `${row.changePct}%`}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              row.volRatio60m >= volFullThreshold
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : row.volRatio60m >= volEntryThreshold
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                : 'text-slate-400'
                            }`}
                          >
                            {row.volRatio60m.toFixed(2)}x
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {row.dailyGreenAboveMid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                              <Check className="w-3.5 h-3.5" /> 阳线站稳MID
                            </span>
                          ) : (
                            <span className="text-rose-400">日线收阴/破位</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          <span
                            className={`font-bold ${
                              row.isGoldenZone
                                ? 'text-amber-300'
                                : row.distFromMidAtr > 2.0
                                ? 'text-purple-300'
                                : 'text-slate-200'
                            }`}
                          >
                            {row.distFromMidAtr.toFixed(2)} ATR
                          </span>
                          {row.isGoldenZone && (
                            <div className="text-[10px] text-amber-400">黄金低吸区(&lt;1ATR)</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-300 max-w-[180px] truncate" title={row.selfSufficiency}>
                          {row.selfSufficiency}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold border ${row.actionBadgeColor}`}
                          >
                            {row.dynamicAction}
                          </span>
                          <div className="text-[11px] text-slate-400 mt-1 max-w-[240px]">{row.dynamicReason}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: 60m量化信号与风控工作台 ================= */}
        {activeTab === 'quant60m' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-4">
              <div className="p-5 rounded-xl bg-[#0F172A] border border-slate-800 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-white">60m 策略规则实时调参台</h3>
                  </div>
                  <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                    opt4_3_1_double_opt
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-300">1/2 试仓量比阈值 (vs 60m MA5)</span>
                    <span className="font-mono font-bold text-cyan-400">{volEntryThreshold.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.90"
                    max="1.30"
                    step="0.05"
                    value={volEntryThreshold}
                    onChange={(e) => setVolEntryThreshold(parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-300">1/1 满仓共振量比阈值 (vs 60m MA5)</span>
                    <span className="font-mono font-bold text-emerald-400">{volFullThreshold.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="1.20"
                    max="2.00"
                    step="0.05"
                    value={volFullThreshold}
                    onChange={(e) => setVolFullThreshold(parseFloat(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-300">常规 ATR 偏离上限 (防追高阈值)</span>
                    <span className="font-mono font-bold text-amber-400">{atrMaxStandard.toFixed(1)} ATR</span>
                  </div>
                  <input
                    type="range"
                    min="1.2"
                    max="2.8"
                    step="0.1"
                    value={atrMaxStandard}
                    onChange={(e) => setAtrMaxStandard(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableGreenExemption}
                      onChange={(e) => setEnableGreenExemption(e.target.checked)}
                      className="mt-0.5 rounded accent-amber-500"
                    />
                    <div className="text-xs">
                      <div className="font-semibold text-white">启用【日线站上MID且非阴线】豁免规则</div>
                      <p className="text-slate-400 mt-0.5">
                        开启后：若日线为阳线且在MID上方，将ATR上限放宽至 <strong className="text-purple-300">3.0 ATR</strong>，并豁免常规 <code className="text-amber-300">stop5.5</code> 止损，防止主升浪洗盘被甩下车。
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyShowGoldenAtr}
                      onChange={(e) => setOnlyShowGoldenAtr(e.target.checked)}
                      className="mt-0.5 rounded accent-emerald-500"
                    />
                    <div className="text-xs">
                      <div className="font-semibold text-amber-300">仅显示【距MID &lt; 1 ATR】黄金起跳买点</div>
                      <p className="text-slate-400 mt-0.5">
                        过滤已大幅脱离中轨的标的，聚焦刚从60m/日线MID中轨放量起跳、盈亏比最佳的标的。
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-3">
              {evaluatedEquities.map((stock) => (
                <div
                  key={stock.code}
                  className="p-4 rounded-xl bg-[#0E1525] border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-white">{stock.name}</span>
                      <span className="font-mono text-xs text-slate-400">{stock.code}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">
                        {stock.board}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {stock.commodity}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">{stock.dynamicReason}</p>
                    <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] font-mono text-slate-400">
                      <span>
                        60m量比: <strong className="text-white">{stock.volRatio60m}x</strong>
                      </span>
                      <span>
                        距MID距离: <strong className="text-amber-300">{stock.distFromMidAtr} ATR</strong>
                      </span>
                      <span>
                        趋势结构: <strong className="text-emerald-400">{stock.exp2Trend}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex sm:flex-col items-end justify-between w-full sm:w-auto gap-2">
                    <span
                      className={`px-3 py-1 rounded-lg text-xs font-bold border ${stock.actionBadgeColor}`}
                    >
                      {stock.dynamicAction}
                    </span>
                    <div className="text-right font-mono">
                      <span className="text-sm font-bold text-white mr-2">¥{stock.price.toFixed(2)}</span>
                      <span className={`text-xs ${stock.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stock.changePct >= 0 ? `+${stock.changePct}%` : `${stock.changePct}%`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 4: 一手现货调研与情报流 ================= */}
        {activeTab === 'fieldnotes' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5">
              <form
                onSubmit={handleAddFieldNote}
                className="p-5 rounded-xl bg-[#0F172A] border border-slate-800 space-y-4"
              >
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <PlusCircle className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">录入一手产业链/现货草根调研</h3>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">大宗产业链分类</label>
                  <select
                    value={newNoteCategory}
                    onChange={(e) => setNewNoteCategory(e.target.value)}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="有色金属 · 铜/铝">有色金属 · 铜/铝</option>
                    <option value="贵金属 · 黄金/白银">贵金属 · 黄金/白银</option>
                    <option value="能源化工 · 原油/油服">能源化工 · 原油/油服</option>
                    <option value="战略小金属 · 钨/稀土/钛">战略小金属 · 钨/稀土/钛</option>
                    <option value="宏观流动性 · 美联储/TGA">宏观流动性 · 美联储/TGA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">一手情报标题 *</label>
                  <input
                    type="text"
                    required
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    placeholder="例如：华东铜杆大厂排产超预期，现货升水扩大"
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">信息渠道来源</label>
                    <input
                      type="text"
                      value={newNoteSource}
                      onChange={(e) => setNewNoteSource(e.target.value)}
                      placeholder="如：SMM/港口贸易商"
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">多空方向评估</label>
                    <select
                      value={newNoteImpact}
                      onChange={(e) => setNewNoteImpact(e.target.value)}
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="强利多 (Strong Bullish)">强利多 (Strong Bullish)</option>
                      <option value="利多 (Bullish)">利多 (Bullish)</option>
                      <option value="中性观察 (Neutral)">中性观察 (Neutral)</option>
                      <option value="利空 (Bearish)">利空 (Bearish)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">关联A股代码 (逗号分隔)</label>
                  <input
                    type="text"
                    value={newNoteTickers}
                    onChange={(e) => setNewNoteTickers(e.target.value)}
                    placeholder="如：601899.SH, 920088.BJ"
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">一手调研正文细节 *</label>
                  <textarea
                    rows={4}
                    required
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="记录现货升贴水报价、冶炼厂TC费用、港口库存疏港量或交割库仓单异动..."
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-amber-500/20"
                >
                  保存至一手观察时间轴 (自动持久化至本地浏览器)
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 space-y-4">
              {fieldNotes.map((note) => (
                <div key={note.id} className="p-5 rounded-xl bg-[#0E1525] border border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {note.category}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">{note.time}</span>
                    </div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-700/50">
                      {note.impact}
                    </span>
                  </div>
                  <h4 className="text-sm sm:text-base font-bold text-white">{note.title}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{note.content}</p>
                  <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-400">来源渠道: {note.source}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">映射标的:</span>
                      {(note.linkedTickers || []).map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono border border-slate-700"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
