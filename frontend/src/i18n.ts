import { useState, useCallback, useEffect } from 'react'

export type UILang = 'zh' | 'en'

// Translation dictionary
const translations: Record<UILang, Record<string, string>> = {
  zh: {
    // Sidebar
    'nav.upload': '上传 PDF',
    'nav.export': '导出 PDF',
    'nav.navigation': '导航',
    'nav.docs': '使用文档',
    'nav.github': 'GitHub',
    'nav.api_settings': 'API 设置',
    'nav.api_title': 'API 设置',
    'nav.validate_pass': '验证通过',
    'nav.validate_fail': 'API Key 无效',
    'nav.validate_btn': '验证并保存',
    'nav.validating': '验证中...',
    'nav.network_error': '网络错误，请重试',

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
    'pagination.jump_placeholder': '请输入页码...',
    'pagination.no_errors': '暂无问题页面',

    // Data table
    'table.original': '原文',
    'table.correction': '建议修改',
    'table.category': '类别',
    'table.reason': '原因',
    'table.page': '页码',
    'table.columns': '列显示',
    'table.select_columns': '选择列',
    'table.original_correction': '原文与修改',
    'table.category_filter': '类别筛选',
    'table.show_categories': '显示类别',
    'table.keep_categories': '保留类别',
    'table.select_all': '全选',
    'table.clear': '清空',
    'table.no_results': '暂无结果',
    'table.total': '共 {count} 项',
    'table.selected': '已选 {selected}/{total}',
    'table.excluded': '已排除 {count} 项',
    'table.per_page': '每页',
    'table.items': '条',
    'table.exclude_selected': '排除已选',
    'table.restore_selected': '恢复已选',
    'table.deselect': '取消选择',

    // Status bar
    'status.elapsed': '耗时 {elapsed}',
    'status.tokens': 'Tokens {tokens}',
    'status.cache_hit': '命中 {tokens} ({pct}%)',
    'status.cache_miss': '未命中 {tokens}',
    'status.cost': '消费 ¥{cost}',
    'status.balance': '余额 ¥{balance}',

    // Wizard
    'wizard.drop_title': '上传 PDF 文件',
    'wizard.drop_hint': '拖入或点击下方按钮选择所要校对的 PDF 文件',
    'wizard.select_file': '选择 PDF 文件',
    'wizard.pick_file': '选择 PDF 文件',
    'wizard.range_title': '选择校对范围',
    'wizard.file_info': '{filename} · 共 {pages} 页',
    'wizard.start_page': '起始页 · 第 {page} 页',
    'wizard.end_page': '结束页 · 第 {page} 页',
    'wizard.total_pages': '总计 {count} 页',
    'wizard.est_tokens': '预计用量 {tokens} tokens · ¥{cost}',
    'wizard.start_btn': '开始校对',
    'wizard.only_pdf': '仅支持 PDF 文件',

    // Dialogs
    'dialog.reupload_title': '重新上传 PDF',
    'dialog.reupload_desc': '此操作会清空当前校对结果。请确认已导出所需文件。',
    'dialog.cancel': '取消',
    'dialog.confirm': '确定',
    'dialog.api_key_title': '请输入 DeepSeek API Key',
    'dialog.export_failed': '导出失败',
    'dialog.validate_fail': 'API Key 无效',

    // Log messages
    'log.uploading': '正在上传...',
    'log.ready': '就绪',
    'log.proofreading_started': '校对已开始',
    'log.connection_closed': '连接已关闭',
  },
  en: {
    // Sidebar
    'nav.upload': 'Upload PDF',
    'nav.export': 'Export PDF',
    'nav.navigation': 'Navigation',
    'nav.docs': 'Documentation',
    'nav.github': 'GitHub',
    'nav.api_settings': 'API Settings',
    'nav.api_title': 'API Settings',
    'nav.validate_pass': 'Verified',
    'nav.validate_fail': 'Invalid API Key',
    'nav.validate_btn': 'Validate & Save',
    'nav.validating': 'Verifying...',
    'nav.network_error': 'Network error, please retry',

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
    'pagination.jump_placeholder': 'Jump to page...',
    'pagination.no_errors': 'No issues found',

    // Data table
    'table.original': 'Original',
    'table.correction': 'Correction',
    'table.category': 'Category',
    'table.reason': 'Reason',
    'table.page': 'Page',
    'table.columns': 'Columns',
    'table.select_columns': 'Select Columns',
    'table.original_correction': 'Original & Correction',
    'table.category_filter': 'Category Filter',
    'table.show_categories': 'Show Categories',
    'table.keep_categories': 'Keep Categories',
    'table.select_all': 'Select All',
    'table.clear': 'Clear',
    'table.no_results': 'No results',
    'table.total': '{count} total',
    'table.selected': '{selected}/{total} selected',
    'table.excluded': '{count} excluded',
    'table.per_page': 'per page',
    'table.items': 'items',
    'table.exclude_selected': 'Exclude Selected',
    'table.restore_selected': 'Restore Selected',
    'table.deselect': 'Deselect',

    // Status bar
    'status.elapsed': '{elapsed} elapsed',
    'status.tokens': '{tokens} tokens',
    'status.cache_hit': '{tokens} cached ({pct}%)',
    'status.cache_miss': '{tokens} uncached',
    'status.cost': '¥{cost} spent',
    'status.balance': '¥{balance} balance',

    // Wizard
    'wizard.drop_title': 'Upload PDF File',
    'wizard.drop_hint': 'Drag and drop or click the button below to select a PDF file',
    'wizard.select_file': 'Select PDF File',
    'wizard.pick_file': 'Select PDF File',
    'wizard.range_title': 'Select Page Range',
    'wizard.file_info': '{filename} · {pages} pages',
    'wizard.start_page': 'Start · Page {page}',
    'wizard.end_page': 'End · Page {page}',
    'wizard.total_pages': '{count} pages total',
    'wizard.est_tokens': 'Est. {tokens} tokens · ¥{cost}',
    'wizard.start_btn': 'Start Proofreading',
    'wizard.only_pdf': 'Only PDF files are supported',

    // Dialogs
    'dialog.reupload_title': 'Re-upload PDF',
    'dialog.reupload_desc': 'This will clear all current proofreading results. Please confirm you have exported any needed files.',
    'dialog.cancel': 'Cancel',
    'dialog.confirm': 'Confirm',
    'dialog.api_key_title': 'Enter DeepSeek API Key',
    'dialog.export_failed': 'Export failed',
    'dialog.validate_fail': 'API Key invalid',

    // Log messages
    'log.uploading': 'Uploading...',
    'log.ready': 'Ready',
    'log.proofreading_started': 'Proofreading started',
    'log.connection_closed': 'Connection closed',
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
