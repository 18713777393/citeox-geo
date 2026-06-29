export interface IndustryEntry {
  primary: string;
  categories: string[];
}

export const industryDictionary: IndustryEntry[] = [
  { primary: "餐饮美食", categories: ["中餐厅", "西餐厅", "快餐", "咖啡厅", "奶茶店", "烘焙店", "小吃店", "火锅店", "烧烤", "其他"] },
  { primary: "零售电商", categories: ["服装店", "鞋店", "美妆店", "数码店", "家居店", "超市", "便利店", "母婴店", "其他"] },
  { primary: "教育培训", categories: ["语言培训", "K12辅导", "职业技能", "艺术培训", "留学咨询", "早教", "其他"] },
  { primary: "医疗健康", categories: ["综合医院", "专科诊所", "牙科", "中医", "美容整形", "体检中心", "其他"] },
  { primary: "本地生活", categories: ["家政服务", "维修服务", "搬家服务", "洗护服务", "摄影服务", "宠物服务", "其他"] },
  { primary: "酒店旅游", categories: ["酒店民宿", "旅行社", "景区乐园", "城市导览", "露营营地", "签证服务", "其他"] },
  { primary: "房地产", categories: ["新房销售", "二手房中介", "长租公寓", "商业地产", "物业服务", "装修设计", "其他"] },
  { primary: "汽车服务", categories: ["汽车销售", "维修保养", "洗车美容", "租车出行", "二手车", "充电服务", "其他"] },
  { primary: "金融服务", categories: ["银行服务", "保险服务", "证券投资", "贷款咨询", "财富管理", "支付服务", "其他"] },
  { primary: "法律服务", categories: ["律师事务所", "知识产权", "合同审查", "劳动仲裁", "企业合规", "法律咨询", "其他"] },
  { primary: "企业服务", categories: ["工商财税", "人力资源", "SaaS软件", "咨询顾问", "品牌营销", "客服外包", "其他"] },
  { primary: "软件科技", categories: ["AI软件", "数据分析", "网络安全", "低代码", "云服务", "协同办公", "其他"] },
  { primary: "工业制造", categories: ["机械设备", "电子制造", "汽车零部件", "化工材料", "包装印刷", "智能工厂", "其他"] },
  { primary: "建筑工程", categories: ["建筑施工", "工程监理", "建材供应", "园林景观", "机电安装", "工程设计", "其他"] },
  { primary: "农业食品", categories: ["农产品", "生鲜供应", "食品加工", "有机农业", "水产养殖", "农资服务", "其他"] },
  { primary: "母婴亲子", categories: ["母婴用品", "月子中心", "亲子乐园", "儿童摄影", "早教托育", "产后修复", "其他"] },
  { primary: "美妆个护", categories: ["护肤品牌", "彩妆品牌", "美发护理", "香水香氛", "医美护理", "个人清洁", "其他"] },
  { primary: "服饰鞋包", categories: ["女装", "男装", "童装", "运动服饰", "箱包配饰", "鞋履品牌", "其他"] },
  { primary: "运动健身", categories: ["健身房", "瑜伽普拉提", "运动装备", "户外运动", "球类培训", "康复训练", "其他"] },
  { primary: "文化娱乐", categories: ["影院演出", "剧本娱乐", "音乐培训", "艺术展览", "线上娱乐", "文创产品", "其他"] },
  { primary: "媒体传播", categories: ["广告公司", "公关传播", "内容机构", "MCN机构", "视频制作", "直播运营", "其他"] },
  { primary: "家居家装", categories: ["全屋定制", "家具品牌", "家纺软装", "装修公司", "智能家居", "家电品牌", "其他"] },
  { primary: "物流运输", categories: ["快递服务", "同城配送", "货运物流", "冷链物流", "仓储服务", "跨境物流", "其他"] },
  { primary: "能源环保", categories: ["新能源", "光伏储能", "环保设备", "垃圾处理", "节能服务", "碳管理", "其他"] },
  { primary: "政务公共", categories: ["政务服务", "公共事业", "城市服务", "园区服务", "公益组织", "公共安全", "其他"] },
  { primary: "招聘就业", categories: ["招聘平台", "猎头服务", "职业培训", "灵活用工", "校园招聘", "雇主品牌", "其他"] },
  { primary: "财税会计", categories: ["代理记账", "税务筹划", "审计服务", "财务咨询", "发票服务", "企业年报", "其他"] },
  { primary: "跨境出海", categories: ["跨境电商", "海外营销", "海外仓", "外贸服务", "本地化翻译", "国际支付", "其他"] },
  { primary: "游戏动漫", categories: ["手游", "端游", "游戏发行", "动漫IP", "电竞服务", "虚拟周边", "其他"] },
  { primary: "宠物服务", categories: ["宠物医院", "宠物用品", "宠物美容", "宠物寄养", "宠物食品", "宠物训练", "其他"] },
  { primary: "老年养老", categories: ["养老院", "居家养老", "护理服务", "康复器械", "适老改造", "老年教育", "其他"] },
  { primary: "婚庆服务", categories: ["婚礼策划", "婚纱摄影", "礼服租赁", "司仪主持", "婚宴酒店", "珠宝婚戒", "其他"] },
  { primary: "摄影影像", categories: ["商业摄影", "儿童摄影", "证件照", "视频拍摄", "后期修图", "航拍服务", "其他"] },
  { primary: "珠宝钟表", categories: ["黄金珠宝", "钻石定制", "腕表销售", "首饰维修", "奢侈品回收", "文玩收藏", "其他"] },
  { primary: "酒水饮料", categories: ["白酒", "葡萄酒", "啤酒", "茶饮品牌", "咖啡品牌", "功能饮料", "其他"] },
  { primary: "生鲜商超", categories: ["水果店", "蔬菜店", "肉禽蛋", "水产海鲜", "社区团购", "精品超市", "其他"] },
  { primary: "连锁加盟", categories: ["餐饮加盟", "教育加盟", "零售加盟", "服务加盟", "招商加盟", "品牌孵化", "其他"] },
  { primary: "知识付费", categories: ["在线课程", "社群会员", "训练营", "咨询服务", "电子书", "私教陪跑", "其他"] },
  { primary: "心理咨询", categories: ["个体咨询", "婚恋咨询", "青少年心理", "企业EAP", "心理测评", "情绪疗愈", "其他"] },
  { primary: "公益慈善", categories: ["慈善基金", "志愿服务", "公益项目", "社会企业", "环保公益", "助学助残", "其他"] },
  { primary: "艺术收藏", categories: ["画廊", "拍卖行", "艺术培训", "艺术品交易", "收藏鉴定", "手作工坊", "其他"] },
  { primary: "票务会展", categories: ["展会主办", "会议服务", "活动策划", "票务平台", "展台搭建", "会务执行", "其他"] },
  { primary: "安防消防", categories: ["监控安防", "门禁系统", "消防设备", "安全培训", "应急服务", "智慧安防", "其他"] },
  { primary: "印刷包装", categories: ["包装设计", "纸品印刷", "标签印刷", "礼盒包装", "环保包装", "印刷设备", "其他"] },
  { primary: "仪器仪表", categories: ["检测仪器", "实验设备", "计量仪表", "传感器", "医疗仪器", "工业仪表", "其他"] },
  { primary: "通信电子", categories: ["通信设备", "手机数码", "智能硬件", "电子元件", "物联网设备", "维修服务", "其他"] },
  { primary: "交通出行", categories: ["网约车", "共享出行", "公交服务", "停车服务", "驾校培训", "道路救援", "其他"] },
  { primary: "家电维修", categories: ["空调维修", "冰箱维修", "洗衣机维修", "厨电维修", "清洗保养", "安装服务", "其他"] },
  { primary: "办公文具", categories: ["办公用品", "文具品牌", "打印耗材", "办公家具", "礼品定制", "设备租赁", "其他"] },
  { primary: "健康管理", categories: ["营养咨询", "体重管理", "慢病管理", "运动康复", "睡眠管理", "健康检测", "其他"] },
  { primary: "个人IP", categories: ["专家顾问", "自媒体", "讲师教练", "主播达人", "作者作家", "独立设计师", "其他"] },
  { primary: "其他", categories: ["综合服务", "新兴行业", "区域品牌", "个人品牌", "线下门店", "线上业务", "其他"] }
];

export function listIndustries() {
  return industryDictionary;
}

export function getIndustryCategories(industry: string) {
  const normalized = normalizeIndustryText(industry);
  const entry = industryDictionary.find((item) => normalizeIndustryText(item.primary) === normalized);
  return entry?.categories ?? [];
}

export function isKnownIndustry(industry: string) {
  return industry === "其他" || getIndustryCategories(industry).length > 0;
}

export function isKnownCategory(industry: string, category: string | undefined) {
  if (!category) return true;
  if (industry === "其他") return true;
  const categories = getIndustryCategories(industry);
  return categories.length === 0 || categories.includes(category) || category === "其他";
}

export function searchIndustries(query: string) {
  const normalized = normalizeIndustryText(query);
  if (!normalized) return industryDictionary.slice(0, 20);
  return industryDictionary
    .filter((entry) => {
      return (
        normalizeIndustryText(entry.primary).includes(normalized) ||
        entry.categories.some((category) => normalizeIndustryText(category).includes(normalized))
      );
    })
    .slice(0, 20);
}

function normalizeIndustryText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
