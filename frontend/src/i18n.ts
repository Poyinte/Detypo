import { useState, useCallback, useEffect } from 'react'

export type UILang = 'zh' | 'en'

// Translation dictionary
const translations: Record<UILang, Record<string, string>> = {
  zh: {
    // Sidebar
    'nav.upload': '上传 PDF',
    'nav.export': '导出 PDF',
    'nav.docs': '使用文档',
    'nav.github': 'GitHub',
    'nav.api_settings': 'API 设置',
    'nav.api_title': 'API 设置',
    'nav.validate_pass': '验证通过',
    'nav.validate_fail': 'API Key 无效',
    'nav.validate_btn': '验证并保存',
    'nav.validating': '验证中...',

    // Language toggle
    'lang.ui_label': '界面语言',

    // Header
    'header.list': '列表',
    'header.card': '卡片',

    // Proofreading language
    'proof.lang_label': '校对语种',
    'proof.lang_auto': '自动检测',

    // Pagination
    'pagination.prev': '上一页',
    'pagination.next': '下一页',
    'pagination.first': '已是第一页',
    'pagination.last': '已是最后一页',
    'pagination.page': 'PDF 第 {n} 页',
    'pagination.no_errors': '暂无问题页面',

    // Data table
    'table.original': '原文',
    'table.correction': '建议修改',
    'table.category': '类别',
    'table.reason': '原因',
    'table.page': '页码',
    'table.columns': '列显示',
    'table.category_filter': '类别筛选',
    'table.rows_per_page': '每页行数',
    'table.reset': '重置',
    'table.no_results': '暂无结果',
    'table.showing': '显示',
    'table.of': '共',
    'table.selected': '已选',
  },
  en: {
    // Sidebar
    'nav.upload': 'Upload PDF',
    'nav.export': 'Export PDF',
    'nav.docs': 'Documentation',
    'nav.github': 'GitHub',
    'nav.api_settings': 'API Settings',
    'nav.api_title': 'API Settings',
    'nav.validate_pass': 'Verified',
    'nav.validate_fail': 'Invalid API Key',
    'nav.validate_btn': 'Validate & Save',
    'nav.validating': 'Verifying...',

    // Language toggle
    'lang.ui_label': 'UI Language',

    // Header
    'header.list': 'List',
    'header.card': 'Cards',

    // Proofreading language
    'proof.lang_label': 'Proofreading Language',
    'proof.lang_auto': 'Auto Detect',

    // Pagination
    'pagination.prev': 'Previous',
    'pagination.next': 'Next',
    'pagination.first': 'Already on first page',
    'pagination.last': 'Already on last page',
    'pagination.page': 'PDF Page {n}',
    'pagination.no_errors': 'No issues found',

    // Data table
    'table.original': 'Original',
    'table.correction': 'Correction',
    'table.category': 'Category',
    'table.reason': 'Reason',
    'table.page': 'Page',
    'table.columns': 'Columns',
    'table.category_filter': 'Category Filter',
    'table.rows_per_page': 'Rows per page',
    'table.reset': 'Reset',
    'table.no_results': 'No results',
    'table.showing': 'Showing',
    'table.of': 'of',
    'table.selected': 'Selected',
  },
}

// Load persisted UI language
function loadUILang(): UILang {
  try {
    const stored = localStorage.getItem('ui_lang')
    if (stored === 'zh' || stored === 'en') return stored
  } catch { /* localStorage unavailable */ }
  // Fall back to browser language
  if (typeof navigator !== 'undefined' && navigator.language?.startsWith('zh')) return 'zh'
  return 'en'
}

let _globalLang: UILang = loadUILang()
let _listeners: Array<() => void> = []

export function getUILang(): UILang {
  return _globalLang
}

export function setUILang(lang: UILang) {
  _globalLang = lang
  try { localStorage.setItem('ui_lang', lang) } catch { /* localStorage unavailable */ }
  _listeners.forEach(fn => fn())
}

export function subscribeUILang(fn: () => void) {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter(f => f !== fn) }
}

export function useI18n() {
  const [lang, setLang] = useState<UILang>(_globalLang)

  const subscribeFn = useCallback(() => setLang(_globalLang), [])

  // Listen for external changes (e.g. sidebar toggle)
  useEffect(() => {
    return subscribeUILang(subscribeFn)
  }, [subscribeFn])

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    let value = translations[lang]?.[key] ?? translations['zh']?.[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = value.replace(`{${k}}`, String(v))
      }
    }
    return value
  }, [lang])

  const setUILangFn = useCallback((newLang: UILang) => {
    setLang(newLang)
    setUILang(newLang)
  }, [])

  return { t, uiLang: lang, setUiLang: setUILangFn }
}
