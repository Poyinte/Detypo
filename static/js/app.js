// ── State ──
const state = {
  fileId: null,
  pageCount: 0,
  errors: [],
  excludedIds: new Set(),
  activeFilter: 'all',
  activePageNav: null,
  proofreadStartTime: null,
  elapsedTimer: null,
};

// ── DOM refs ──
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  fileInput: $('#file-input'),
  btnUpload: $('#btn-upload'),
  btnStart: $('#btn-start'),
  btnStop: $('#btn-stop'),
  btnExport: $('#btn-export'),
  btnSelectAll: $('#btn-select-all'),
  btnDeselectAll: $('#btn-deselect-all'),
  btnSettings: $('#btn-settings'),
  btnPrevError: $('#btn-prev-error'),
  btnNextError: $('#btn-next-error'),
  pageIndicator: $('#page-indicator'),
  pageNavList: $('#page-nav-list'),
  placeholder: $('#upload-placeholder'),
  annotationList: $('#annotation-list'),
  statusText: $('#status-text'),
  statusDot: $('#status-dot'),
  progressText: $('#progress-text'),
  elapsedTime: $('#elapsed-time'),
  statusSep: $('#status-sep'),
  filenameDisplay: $('#filename-display'),
  excludedCount: $('#excluded-count'),
  filterBtns: $$('.filter-btn'),
  settingsModal: $('#settings-modal'),
  apiKeyInput: $('#api-key-input'),
  btnValidateKey: $('#btn-validate-key'),
  btnCloseModal: $('#btn-close-modal'),
  btnToggleVisibility: $('#btn-toggle-visibility'),
  keyStatus: $('#key-status'),
  progressOverlay: $('#progress-overlay'),
  progressFill: $('#progress-fill'),
  progressPageText: $('#progress-page-text'),
  progressErrorsText: $('#progress-errors-text'),
};

// ── Helpers ──
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startTimer() {
  state.proofreadStartTime = Date.now();
  dom.elapsedTime.style.display = '';
  dom.statusSep.style.display = '';
  state.elapsedTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.proofreadStartTime) / 1000);
    dom.elapsedTime.textContent = `耗时 ${formatTime(elapsed)}`;
  }, 1000);
}

function stopTimer() {
  if (state.elapsedTimer) {
    clearInterval(state.elapsedTimer);
    state.elapsedTimer = null;
  }
}

function setStatus(phase, text) {
  dom.statusText.textContent = text;
  dom.statusDot.className = 'status-dot ' + phase;
}

// ── API Key Management ──
function getApiKey() {
  return localStorage.getItem('deepseek_api_key') || '';
}

function setApiKey(key) {
  localStorage.setItem('deepseek_api_key', key);
}

function showModal() {
  dom.apiKeyInput.value = getApiKey();
  dom.keyStatus.textContent = '';
  dom.settingsModal.style.display = '';
}

function hideModal() {
  dom.settingsModal.style.display = 'none';
}

dom.btnSettings.addEventListener('click', showModal);
dom.btnCloseModal.addEventListener('click', hideModal);
dom.settingsModal.addEventListener('click', (e) => {
  if (e.target === dom.settingsModal) hideModal();
});

dom.btnToggleVisibility.addEventListener('click', () => {
  const inp = dom.apiKeyInput;
  const icon = dom.btnToggleVisibility.querySelector('i');
  if (inp.type === 'password') {
    inp.type = 'text';
    icon.className = 'ri-eye-line';
  } else {
    inp.type = 'password';
    icon.className = 'ri-eye-off-line';
  }
});

dom.btnValidateKey.addEventListener('click', async () => {
  const key = dom.apiKeyInput.value.trim();
  if (!key.startsWith('sk-')) {
    dom.keyStatus.className = 'key-status error';
    dom.keyStatus.textContent = 'API Key 格式错误：应以 sk- 开头';
    return;
  }
  dom.keyStatus.className = 'key-status';
  dom.keyStatus.textContent = '验证中...';
  try {
    const res = await fetch('/api/settings/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key }),
    });
    const data = await res.json();
    if (data.valid) {
      setApiKey(key);
      dom.keyStatus.className = 'key-status success';
      dom.keyStatus.textContent = data.message || 'API Key 验证成功';
      setTimeout(hideModal, 800);
    } else {
      dom.keyStatus.className = 'key-status error';
      dom.keyStatus.textContent = data.message || '验证失败';
    }
  } catch (e) {
    dom.keyStatus.className = 'key-status error';
    dom.keyStatus.textContent = '网络错误，请重试';
  }
});

if (!getApiKey()) {
  showModal();
}

// ── Upload ──
dom.btnUpload.addEventListener('click', () => dom.fileInput.click());
dom.fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  setStatus('idle', '上传中...');
  dom.btnUpload.disabled = true;
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '上传失败: HTTP ' + res.status);
    }
    const data = await res.json();
    state.fileId = data.file_id;
    state.pageCount = data.page_count;
    state.errors = [];
    state.excludedIds = new Set();
    state.activePageNav = null;
    dom.filenameDisplay.textContent = file.name;
    dom.placeholder.style.display = 'none';
    dom.btnStart.disabled = false;
    dom.btnExport.disabled = true;
    dom.btnSelectAll.disabled = true;
    dom.btnDeselectAll.disabled = true;
    dom.annotationList.innerHTML = '';
    dom.pageNavList.innerHTML = '';
    dom.excludedCount.style.display = 'none';
    dom.pageIndicator.textContent = `共 ${state.pageCount} 页 / 0 处问题`;
    dom.progressOverlay.style.display = 'none';
    setStatus('idle', '就绪 — 点击「开始校对」启动检查');
  } catch (e) {
    setStatus('idle', e.message);
  } finally {
    dom.btnUpload.disabled = false;
  }
});

// ── Proofread (fetch-based SSE) ──
dom.btnStart.addEventListener('click', () => {
  if (!state.fileId) return;
  const apiKey = getApiKey();
  if (!apiKey) {
    showModal();
    return;
  }
  state.errors = [];
  state.excludedIds = new Set();
  dom.annotationList.innerHTML = '';
  dom.pageNavList.innerHTML = '';
  dom.excludedCount.style.display = 'none';
  dom.progressOverlay.style.display = '';
  dom.progressFill.style.width = '0%';
  dom.progressPageText.textContent = `0 / ${state.pageCount} 页`;
  dom.progressErrorsText.textContent = '已发现 0 处问题';
  dom.btnStart.disabled = true;
  dom.btnStop.disabled = false;
  dom.btnExport.disabled = true;
  dom.btnSelectAll.disabled = true;
  dom.btnDeselectAll.disabled = true;
  startTimer();

  fetchEventSource(`/api/proofread/${state.fileId}`, apiKey);
});

async function fetchEventSource(url, apiKey) {
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const d = await res.json(); msg = d.detail || msg; } catch (_) {}
      setStatus('idle', msg);
      dom.btnStart.disabled = false;
      dom.btnStop.disabled = true;
      stopTimer();
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let eventType = '';
      let dataStr = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7);
        } else if (line.startsWith('data: ')) {
          dataStr = line.slice(6);
        } else if (line === '' && eventType && dataStr) {
          handleSSEEvent(eventType, dataStr);
          eventType = '';
          dataStr = '';
        }
      }
    }
    if (eventType && dataStr) {
      handleSSEEvent(eventType, dataStr);
    }
  } catch (e) {
    setStatus('idle', '连接中断: ' + e.message);
    dom.btnStart.disabled = false;
    dom.btnStop.disabled = true;
    stopTimer();
  }
}

function handleSSEEvent(eventType, dataStr) {
  let data;
  try { data = JSON.parse(dataStr); } catch (_) { return; }

  switch (eventType) {
    case 'extracting':
      setStatus('active', `正在提取第 ${data.pages} 页文本...`);
      dom.progressText.textContent = `提取文本中`;
      break;

    case 'batch_start':
      setStatus('active', `正在校对第 ${data.batch[0]}-${data.batch[data.batch.length - 1]} 页...`);
      dom.progressText.textContent = `第 ${data.batch[0]}/${data.total} 页`;
      break;

    case 'llm_waiting':
      setStatus('waiting', `等待 AI 响应...（第 ${data.pages} 页）`);
      dom.progressText.textContent = 'AI 分析中';
      break;

    case 'parsing':
      setStatus('active', `正在分析第 ${data.pages} 页结果...`);
      dom.progressText.textContent = `解析 ${data.errors_found} 条结果`;
      break;

    case 'annotating':
      setStatus('active', `正在标注第 ${data.pages} 页...`);
      dom.progressText.textContent = `标注 ${data.count} 处`;
      break;

    case 'page_done':
      setStatus('active', `第 ${data.current}/${data.total} 页完成`);
      dom.progressText.textContent = `${data.current}/${data.total} 页`;
      for (const err of data.errors) {
        state.errors.push(err);
        renderAnnotation(err);
      }
      refreshAllUI();
      const pct = Math.round(data.current / data.total * 100);
      dom.progressFill.style.width = pct + '%';
      dom.progressPageText.textContent = `${data.current} / ${data.total} 页`;
      dom.progressErrorsText.textContent = `已发现 ${state.errors.length} 处问题`;
      break;

    case 'complete':
      stopTimer();
      setStatus('idle', `校对完成 — 共发现 ${state.errors.length} 处问题`);
      dom.progressText.textContent = '';
      dom.elapsedTime.style.display = 'none';
      dom.statusSep.style.display = 'none';
      dom.btnStart.disabled = false;
      dom.btnStop.disabled = true;
      dom.btnExport.disabled = state.errors.length === 0;
      dom.btnSelectAll.disabled = state.errors.length === 0;
      dom.btnDeselectAll.disabled = state.errors.length === 0;
      dom.progressOverlay.style.display = 'none';
      break;

    case 'proofread_error':
      stopTimer();
      setStatus('idle', data.message || '校对出错');
      dom.btnStart.disabled = false;
      dom.btnStop.disabled = true;
      dom.progressOverlay.style.display = 'none';
      break;

    case 'stopped':
      stopTimer();
      setStatus('idle', '已停止');
      dom.btnStart.disabled = false;
      dom.btnStop.disabled = true;
      dom.progressOverlay.style.display = 'none';
      dom.elapsedTime.style.display = 'none';
      dom.statusSep.style.display = 'none';
      break;
  }
}

// ── Stop ──
dom.btnStop.addEventListener('click', async () => {
  await fetch(`/api/proofread/${state.fileId}/stop`, { method: 'POST' });
});

// ── Render single annotation card ──
function renderAnnotation(err) {
  const card = document.createElement('div');
  card.className = 'annotation-card';
  card.dataset.category = err.category;
  card.dataset.page = err.page;
  card.dataset.errorId = err.error_id;
  card.dataset.excluded = 'false';
  card.innerHTML = `
    <input type="checkbox" class="card-checkbox" checked data-error-id="${esc(err.error_id)}" title="取消选中将排除此条目">
    <div class="card-body">
      <div class="card-header">
        <span class="category-tag ${esc(err.category)}">${esc(err.category)}</span>
        <span class="card-page-badge">第 ${err.page} 页</span>
      </div>
      <div class="correction-line">
        <span class="original-text">${esc(err.original)}</span>
        <span class="arrow">→</span>
        <span class="corrected-text">${esc(err.correction)}</span>
      </div>
      <div class="reason">${esc(err.reason)}</div>
    </div>
  `;

  const cb = card.querySelector('.card-checkbox');
  cb.addEventListener('change', () => {
    if (cb.checked) {
      state.excludedIds.delete(err.error_id);
      card.classList.remove('excluded');
      card.dataset.excluded = 'false';
    } else {
      state.excludedIds.add(err.error_id);
      card.classList.add('excluded');
      card.dataset.excluded = 'true';
    }
    refreshPageNav();
    updateExcludedCount();
  });

  ensurePageSection(err.page).appendChild(card);
}

function ensurePageSection(pageNum) {
  const sectionId = `page-section-${pageNum}`;
  let section = document.getElementById(sectionId);
  if (!section) {
    section = document.createElement('div');
    section.id = sectionId;
    section.className = 'page-section';
    section.dataset.page = pageNum;
    section.innerHTML = `
      <div class="page-section-header">
        <span class="page-num">第 ${pageNum} 页</span>
        <span class="page-error-count"></span>
      </div>
    `;
    dom.annotationList.appendChild(section);
  }
  return section;
}

// ── Refresh: page nav, counts, filters ──
function refreshAllUI() {
  updatePageIndicator();
  refreshPageNav();
  updateExcludedCount();
  applyFilter();
}

function updatePageIndicator() {
  const activeCount = state.errors.length - state.excludedIds.size;
  dom.pageIndicator.textContent =
    `共 ${state.pageCount} 页 / ${activeCount} 处问题`;
  updateNavButtons();
}

function updateNavButtons() {
  const pages = getErrorPages();
  dom.btnPrevError.disabled = pages.length === 0;
  dom.btnNextError.disabled = pages.length === 0;
}

function getErrorPages() {
  const pages = new Set();
  for (const e of state.errors) {
    if (!state.excludedIds.has(e.error_id)) {
      pages.add(e.page);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

// ── Page Navigation ──
function refreshPageNav() {
  const pages = getErrorPages();
  dom.pageNavList.innerHTML = '';

  pages.forEach(pageNum => {
    const item = document.createElement('div');
    item.className = 'page-nav-item';
    item.dataset.page = pageNum;

    const errorsOnPage = state.errors.filter(
      e => e.page === pageNum && !state.excludedIds.has(e.error_id)
    ).length;
    const excludedOnPage = state.errors.filter(
      e => e.page === pageNum && state.excludedIds.has(e.error_id)
    ).length;

    item.innerHTML = `
      <span class="nav-page-num">第 ${pageNum} 页</span>
      <span class="nav-error-count">${errorsOnPage}</span>
    `;
    if (excludedOnPage > 0) {
      item.classList.add('has-excluded');
    }

    item.addEventListener('click', () => {
      const section = document.getElementById(`page-section-${pageNum}`);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      dom.pageNavList.querySelectorAll('.page-nav-item').forEach(
        el => el.classList.remove('active')
      );
      item.classList.add('active');
      state.activePageNav = pageNum;
      dom.pageIndicator.textContent =
        `第 ${pageNum} 页 / 共 ${state.pageCount} 页 · ${state.errors.length - state.excludedIds.size} 处问题`;
    });

    dom.pageNavList.appendChild(item);
  });
}

function updateExcludedCount() {
  if (state.excludedIds.size > 0) {
    dom.excludedCount.style.display = '';
    dom.excludedCount.textContent = `已排除 ${state.excludedIds.size} 条`;
  } else {
    dom.excludedCount.style.display = 'none';
  }
}

// ── Prev/Next page navigation ──
dom.btnPrevError.addEventListener('click', () => {
  const pages = getErrorPages();
  if (pages.length === 0) return;
  const current = state.activePageNav || pages[0];
  const idx = pages.indexOf(current);
  const prev = idx > 0 ? pages[idx - 1] : pages[pages.length - 1];
  navigateToPage(prev);
});

dom.btnNextError.addEventListener('click', () => {
  const pages = getErrorPages();
  if (pages.length === 0) return;
  const current = state.activePageNav || pages[0];
  const idx = pages.indexOf(current);
  const next = idx < pages.length - 1 ? pages[idx + 1] : pages[0];
  navigateToPage(next);
});

function navigateToPage(pageNum) {
  state.activePageNav = pageNum;
  const section = document.getElementById(`page-section-${pageNum}`);
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  dom.pageNavList.querySelectorAll('.page-nav-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.page) === pageNum);
  });
  dom.pageIndicator.textContent =
    `第 ${pageNum} 页 / 共 ${state.pageCount} 页 · ${state.errors.length - state.excludedIds.size} 处问题`;
}

// ── Filter ──
dom.filterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    dom.filterBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeFilter = btn.dataset.category;
    applyFilter();
  });
});

function applyFilter() {
  const sections = dom.annotationList.querySelectorAll('.page-section');
  sections.forEach((section) => {
    const cards = section.querySelectorAll('.annotation-card');
    let visibleCount = 0;
    cards.forEach((card) => {
      const catMatch = state.activeFilter === 'all' ||
        card.dataset.category === state.activeFilter;
      card.style.display = catMatch ? '' : 'none';
      if (catMatch && card.dataset.excluded !== 'true') visibleCount++;
    });
    section.style.display = visibleCount > 0 ? '' : 'none';
    const countEl = section.querySelector('.page-error-count');
    if (countEl) {
      countEl.textContent = visibleCount > 0 ? `${visibleCount} 处问题` : '';
    }
  });
}

// ── Select All / Deselect All ──
dom.btnSelectAll.addEventListener('click', () => {
  state.excludedIds.clear();
  dom.annotationList.querySelectorAll('.annotation-card').forEach(card => {
    card.classList.remove('excluded');
    card.dataset.excluded = 'false';
    const cb = card.querySelector('.card-checkbox');
    if (cb) cb.checked = true;
  });
  refreshAllUI();
});

dom.btnDeselectAll.addEventListener('click', () => {
  dom.annotationList.querySelectorAll('.annotation-card').forEach(card => {
    const cb = card.querySelector('.card-checkbox');
    const errId = cb ? cb.dataset.errorId : card.dataset.errorId;
    if (errId) state.excludedIds.add(errId);
    card.classList.add('excluded');
    card.dataset.excluded = 'true';
    if (cb) cb.checked = false;
  });
  refreshAllUI();
});

// ── Export ──
dom.btnExport.addEventListener('click', async () => {
  if (!state.fileId) return;
  try {
    const res = await fetch(`/api/export/${state.fileId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exclude_ids: [...state.excludedIds],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '导出失败');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proofread_${state.fileId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    setStatus('idle', '导出失败: ' + e.message);
  }
});
