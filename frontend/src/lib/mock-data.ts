export interface ErrorItem {
  error_id: string
  original: string
  correction: string
  category: string
  reason: string
  page: number
  bbox: number[]
}

const ORIGINALS = [
  '己经', '在次', '必需品', '按步就班', '不径而走',
  '发贴', '份内', '各行其事', '鬼计', '果脯',
  '报导', '必竟', '不孝子孙', '仓桑', '沉缅',
  '吃里爬外', '重覆', '挡案', '恶梦', '防害',
  '付作用', '功迹', '贯串', '印像', '骄健',
  '克苦', '匮赠', '兰球', '靡烂', '呕歌',
  '偏辟', '迁徒', '熔岩', '师付', '伟度',
  '希翼', '箫洒', '渲泄', '压诈', '赃物',
  '躁音', '震奋', '阻丧', '做案', '搏取',
  '禅连', '不落巢臼', '甘败下风', '一股作气', '九洲',
  '默守成规', '沤心沥血', '出奇不意', '声名狼籍', '有持无恐',
  '言简意骇', '一愁莫展', '仗义直言', '名不符实', '致理名言',
  '反应情况', '报导事实', '纪录影片', '统一布署', '谋取暴利',
  '乱用职权', '贴补家用', '辨证论治', '势在必行', '实施',
  '必须品', '因为', '所以', '但是', '而且',
  '即使', '如果', '虽然', '因此', '然而',
]

const CORRECTIONS: Record<string, string> = {
  '己经': '已经', '在次': '再次', '必需品': '必需品', '按步就班': '按部就班', '不径而走': '不胫而走',
  '发贴': '发帖', '份内': '分内', '各行其事': '各行其是', '鬼计': '诡计', '果脯': '果腹',
  '报导': '报道', '必竟': '毕竟', '不孝子孙': '不肖子孙', '仓桑': '沧桑', '沉缅': '沉湎',
  '吃里爬外': '吃里扒外', '重覆': '重复', '挡案': '档案', '恶梦': '噩梦', '防害': '妨害',
  '付作用': '副作用', '功迹': '功绩', '贯串': '贯穿', '印像': '印象', '骄健': '矫健',
  '克苦': '刻苦', '匮赠': '馈赠', '兰球': '篮球', '靡烂': '糜烂', '呕歌': '讴歌',
  '偏辟': '偏僻', '迁徒': '迁徙', '熔岩': '熔岩', '师付': '师傅', '伟度': '纬度',
  '希翼': '希冀', '箫洒': '潇洒', '渲泄': '宣泄', '压诈': '压榨', '赃物': '赃物',
  '躁音': '噪音', '震奋': '振奋', '阻丧': '沮丧', '做案': '作案', '搏取': '博取',
  '禅连': '蝉联', '不落巢臼': '不落窠臼', '甘败下风': '甘拜下风', '一股作气': '一鼓作气', '九洲': '九州',
  '默守成规': '墨守成规', '沤心沥血': '呕心沥血', '出奇不意': '出其不意', '声名狼籍': '声名狼藉', '有持无恐': '有恃无恐',
  '言简意骇': '言简意赅', '一愁莫展': '一筹莫展', '仗义直言': '仗义执言', '名不符实': '名副其实', '致理名言': '至理名言',
  '反应情况': '反映情况', '报导事实': '报道事实', '纪录影片': '记录影片', '统一布署': '统一部署', '谋取暴利': '牟取暴利',
  '乱用职权': '滥用职权', '贴补家用': '贴补家用', '辨证论治': '辨证论治', '势在必行': '势在必行', '实施': '实施',
  '必须品': '必需品', '因为': '因为', '所以': '所以', '但是': '但是', '而且': '而且',
  '即使': '即使', '如果': '如果', '虽然': '虽然', '因此': '因此', '然而': '然而',
}

const REASONS: Record<string, string> = {
  '用字错误': '常见错别字，同音字混淆',
  '用词不当': '词语使用不规范，建议使用更准确的表达',
  '语法错误': '语法结构存在问题，不符合中文语法规范',
  '标点符号': '标点符号使用不当，应使用全角标点',
  '数字用法': '数字表达方式不符合出版物规范',
  '政治敏感': '含有政治敏感表述，需修改',
}

function uid(): string {
  return `mock_${Math.random().toString(36).slice(2, 10)}`
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateBbox(): [number, number, number, number] {
  const x0 = 50 + Math.random() * 300
  const y0 = 50 + Math.random() * 700
  return [x0, y0, x0 + 40 + Math.random() * 80, y0 + 10 + Math.random() * 6]
}

const CATEGORIES = ['用字错误', '用词不当', '语法错误', '标点符号', '数字用法', '政治敏感'] as const

export function generateMockErrors(pageCount: number = 50, errorsPerPage: number = 8): ErrorItem[] {
  const errors: ErrorItem[] = []
  const originals = ORIGINALS.filter(o => CORRECTIONS[o] && CORRECTIONS[o] !== o)

  for (let p = 1; p <= pageCount; p++) {
    const count = Math.max(2, Math.floor(errorsPerPage * (0.4 + Math.random() * 1.2)))
    const shuffled = [...originals].sort(() => Math.random() - 0.5)
    for (let i = 0; i < count && i < shuffled.length; i++) {
      const original = shuffled[i]
      const correction = CORRECTIONS[original]
      const category = pick([...CATEGORIES])
      errors.push({
        error_id: uid(),
        original,
        correction,
        category,
        reason: REASONS[category],
        page: p,
        bbox: generateBbox(),
      })
    }
  }
  return errors.sort(() => Math.random() - 0.5)
}
