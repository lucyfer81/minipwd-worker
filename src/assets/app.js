const API_BASE = window.location.origin;
const SORT_OPTIONS = ['updated_desc', 'used_desc', 'title_asc'];
const SPACE_FILTERS = ['all', 'personal', 'work'];

let authToken = null;
let passwordItems = [];
let currentEditorMode = 'add';
let currentDetailItem = null;
let activeSpaceFilter = getStoredValue('minipwd_space_filter', 'all', SPACE_FILTERS);
let activeSort = getStoredValue('minipwd_sort', 'updated_desc', SORT_OPTIONS);

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkSession();
});

function getStoredValue(key, fallback, allowedValues) {
  const value = localStorage.getItem(key);
  if (value && allowedValues.includes(value)) {
    return value;
  }
  return fallback;
}

function setupEventListeners() {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('addBtn').addEventListener('click', () => openEditor());
  document.getElementById('generateBtn').addEventListener('click', () => openGenerator(false));
  document.getElementById('searchInput').addEventListener('input', applyCurrentView);
  document.getElementById('sortSelect').addEventListener('change', handleSortChange);

  document.querySelectorAll('[data-space-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const space = button.dataset.spaceFilter;
      if (!SPACE_FILTERS.includes(space)) {
        return;
      }
      activeSpaceFilter = space;
      localStorage.setItem('minipwd_space_filter', space);
      updateSpaceFilterButtons();
      applyCurrentView();
    });
  });

  document.getElementById('closeGeneratorBtn').addEventListener('click', closeGenerator);
  document.getElementById('lengthSlider').addEventListener('input', (e) => {
    document.getElementById('lengthValue').textContent = e.target.value;
  });
  document.getElementById('generateActionBtn').addEventListener('click', handleGeneratePassword);
  document.getElementById('copyPasswordBtn').addEventListener('click', async () => {
    const password = document.getElementById('passwordResult').textContent || '';
    await copyToClipboard(password);
    showToast('复制成功', 'success');
  });

  document.getElementById('closeDetailBtn').addEventListener('click', closeItemDetail);
  document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      closeItemDetail();
    }
  });
  document.getElementById('copyDetailUsernameBtn').addEventListener('click', () => copyDetailField('username'));
  document.getElementById('copyDetailPasswordBtn').addEventListener('click', () => copyDetailField('password'));
  document.getElementById('copyDetailUrlBtn').addEventListener('click', () => copyDetailField('url'));

  document.getElementById('closeEditorBtn').addEventListener('click', closeEditor);
  document.getElementById('cancelEditorBtn').addEventListener('click', closeEditor);
  document.getElementById('editorForm').addEventListener('submit', handleSaveItem);
  document.getElementById('togglePasswordBtn').addEventListener('click', togglePasswordVisibility);
  document.getElementById('generateForItemBtn').addEventListener('click', () => openGenerator(true));

  document.getElementById('sortSelect').value = activeSort;
  updateSpaceFilterButtons();
}

function checkSession() {
  const storedToken = localStorage.getItem('minipwd_token') || sessionStorage.getItem('minipwd_token');
  if (storedToken) {
    authToken = storedToken;
    showApp();
    loadItems();
  } else {
    showLogin();
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const password = document.getElementById('masterPassword').value;

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      const data = await res.json();
      authToken = data.token;
      localStorage.setItem('minipwd_token', data.token);
      document.getElementById('loginError').classList.add('hidden');
      showApp();
      loadItems();
      return;
    }

    document.getElementById('loginError').classList.remove('hidden');
    document.getElementById('masterPassword').value = '';
  } catch {
    showToast('网络错误，请重试', 'error');
  }
}

function showLogin() {
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

async function loadItems() {
  try {
    const res = await fetch(`${API_BASE}/api/items?space=all&sort=updated_desc`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (res.ok) {
      passwordItems = await res.json();
      applyCurrentView();
      return;
    }

    if (res.status === 401) {
      logout();
      return;
    }

    showToast('加载失败', 'error');
  } catch {
    showToast('加载失败', 'error');
  }
}

function handleSortChange(e) {
  const nextSort = e.target.value;
  if (!SORT_OPTIONS.includes(nextSort)) {
    return;
  }

  activeSort = nextSort;
  localStorage.setItem('minipwd_sort', nextSort);
  applyCurrentView();
}

function updateSpaceFilterButtons() {
  document.querySelectorAll('[data-space-filter]').forEach((button) => {
    if (button.dataset.spaceFilter === activeSpaceFilter) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });
}

function applyCurrentView() {
  const query = (document.getElementById('searchInput').value || '').trim().toLowerCase();
  let filtered = passwordItems.filter((item) => matchesSpace(item) && matchesQuery(item, query));
  filtered = sortItems(filtered);
  renderItems(filtered, query);
}

function matchesSpace(item) {
  if (activeSpaceFilter === 'all') {
    return true;
  }
  return normalizeSpace(item.space) === activeSpaceFilter;
}

function matchesQuery(item, query) {
  if (!query) {
    return true;
  }

  const tags = Array.isArray(item.tags) ? item.tags.join(' ') : '';
  const text = [
    item.title,
    item.username,
    item.login_url,
    item.notes,
    item.folder,
    tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return text.includes(query);
}

function sortItems(items) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (activeSort === 'title_asc') {
      return (a.title || '').localeCompare(b.title || '', 'zh-CN', { sensitivity: 'base' });
    }

    if (activeSort === 'used_desc') {
      return compareDateDesc(a.last_used_at || a.updated_at || a.created_at, b.last_used_at || b.updated_at || b.created_at);
    }

    return compareDateDesc(a.updated_at || a.created_at, b.updated_at || b.created_at);
  });
  return sorted;
}

function compareDateDesc(left, right) {
  const leftTs = left ? Date.parse(left) : 0;
  const rightTs = right ? Date.parse(right) : 0;
  return rightTs - leftTs;
}

function renderItems(items, query) {
  const list = document.getElementById('passwordList');
  list.innerHTML = '';

  if (items.length === 0) {
    const reason = query || activeSpaceFilter !== 'all'
      ? '没有匹配的条目，请调整搜索词或分类'
      : '暂无密码条目，点击"添加"开始';

    list.innerHTML = `
      <div class="cards-empty text-center text-gray-500 py-10 bg-white rounded-lg border border-dashed border-gray-300">
        ${reason}
      </div>
    `;
    return;
  }

  items.forEach((item) => {
    const normalizedSpace = normalizeSpace(item.space);
    const spaceLabel = normalizedSpace === 'work' ? '工作' : '个人';
    const folderText = item.folder ? `<p class="password-card-meta">📁 ${escapeHtml(item.folder)}</p>` : '';
    const tagsText = item.tags && item.tags.length > 0 ? `<p class="password-card-tags">🏷️ ${escapeHtml(item.tags.join(', '))}</p>` : '';

    const div = document.createElement('div');
    div.className = 'password-item password-card';
    div.innerHTML = `
      <div class="password-card-main cursor-pointer" onclick="openItemDetail(${item.id})">
        <div class="password-card-title-row">
          <h3 class="password-card-title">${escapeHtml(item.title)}</h3>
          <span class="item-space-badge ${normalizedSpace}">${spaceLabel}</span>
          ${item.login_url ? `<a href="${escapeHtml(item.login_url)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline" onclick="event.stopPropagation()">🔐</a>` : ''}
        </div>
        <p class="password-card-meta">${escapeHtml(item.username)}</p>
        ${folderText}
        ${tagsText}
        ${item.notes ? `<p class="password-card-notes">${escapeHtml(item.notes)}</p>` : ''}
      </div>
      <div class="password-card-actions">
        <button onclick="editItem(${item.id})" class="password-card-icon text-blue-600 hover:text-blue-800" aria-label="编辑">✏️</button>
        <button onclick="deleteItem(${item.id})" class="password-card-icon text-red-600 hover:text-red-800" aria-label="删除">🗑️</button>
      </div>
    `;
    list.appendChild(div);
  });
}

async function openItemDetail(id) {
  currentDetailItem = null;
  document.getElementById('detailTitle').textContent = '加载中...';
  document.getElementById('detailSpace').textContent = '-';
  document.getElementById('detailUsername').textContent = '-';
  document.getElementById('detailPassword').textContent = '-';
  document.getElementById('detailUrl').textContent = '-';
  document.getElementById('detailModal').classList.remove('hidden');
  document.getElementById('detailFolderGroup').classList.add('hidden');
  document.getElementById('detailTagsGroup').classList.add('hidden');
  document.getElementById('detailNotesGroup').classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE}/api/items/${id}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (res.status === 401) {
      logout();
      return;
    }

    if (!res.ok) {
      closeItemDetail();
      showToast('加载详情失败', 'error');
      return;
    }

    const item = await res.json();
    currentDetailItem = item;
    document.getElementById('detailTitle').textContent = item.title || '条目详情';
    document.getElementById('detailSpace').textContent = normalizeSpace(item.space) === 'work' ? '工作' : '个人';
    document.getElementById('detailUsername').textContent = item.username || '-';
    document.getElementById('detailPassword').textContent = item.password || '-';
    document.getElementById('detailUrl').textContent = item.login_url || '-';

    if (item.folder) {
      document.getElementById('detailFolder').textContent = item.folder;
      document.getElementById('detailFolderGroup').classList.remove('hidden');
    }

    if (item.tags && item.tags.length > 0) {
      document.getElementById('detailTags').textContent = item.tags.join(', ');
      document.getElementById('detailTagsGroup').classList.remove('hidden');
    }

    if (item.notes) {
      document.getElementById('detailNotes').textContent = item.notes;
      document.getElementById('detailNotesGroup').classList.remove('hidden');
    }
  } catch {
    closeItemDetail();
    showToast('加载详情失败', 'error');
  }
}

function closeItemDetail() {
  document.getElementById('detailModal').classList.add('hidden');
  currentDetailItem = null;
}

async function copyDetailField(field) {
  if (!currentDetailItem) {
    return;
  }

  const fieldTextMap = {
    username: currentDetailItem.username,
    password: currentDetailItem.password,
    url: currentDetailItem.login_url,
  };
  const fieldNameMap = {
    username: '用户名',
    password: '密码',
    url: 'URL',
  };

  const text = fieldTextMap[field];
  if (!text) {
    showToast('暂无可复制内容', 'error');
    return;
  }

  await copyToClipboard(text);
  showToast(`${fieldNameMap[field]}已复制`, 'success');
  if (currentDetailItem.id) {
    markItemUsed(currentDetailItem.id);
  }
}

function openGenerator(forItem = false) {
  document.getElementById('generatorModal').classList.remove('hidden');
  document.getElementById('generatorModal').dataset.forItem = String(forItem);
  document.getElementById('generatedPassword').classList.add('hidden');
}

function closeGenerator() {
  document.getElementById('generatorModal').classList.add('hidden');
}

async function handleGeneratePassword() {
  const options = {
    length: Number.parseInt(document.getElementById('lengthSlider').value, 10),
    uppercase: document.getElementById('useUppercase').checked,
    lowercase: document.getElementById('useLowercase').checked,
    numbers: document.getElementById('useNumbers').checked,
    symbols: document.getElementById('useSymbols').checked,
    excludeSimilar: document.getElementById('excludeSimilar').checked,
  };

  const params = new URLSearchParams({
    length: String(options.length),
    uppercase: String(options.uppercase),
    lowercase: String(options.lowercase),
    numbers: String(options.numbers),
    symbols: String(options.symbols),
    excludeSimilar: String(options.excludeSimilar),
  });

  try {
    const res = await fetch(`${API_BASE}/api/generate-password?${params.toString()}`);
    if (!res.ok) {
      showToast('生成失败', 'error');
      return;
    }

    const data = await res.json();
    document.getElementById('passwordResult').textContent = data.password;
    document.getElementById('generatedPassword').classList.remove('hidden');

    const forItem = document.getElementById('generatorModal').dataset.forItem === 'true';
    if (forItem) {
      document.getElementById('itemPassword').value = data.password;
      closeGenerator();
    }
  } catch {
    showToast('生成失败', 'error');
  }
}

function openEditor(item = null) {
  const modal = document.getElementById('editorModal');
  const title = document.getElementById('editorTitle');
  const passwordInput = document.getElementById('itemPassword');
  const toggleButton = document.getElementById('togglePasswordBtn');

  if (item) {
    currentEditorMode = 'edit';
    title.textContent = '编辑密码条目';
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemSpace').value = normalizeSpace(item.space);
    document.getElementById('itemTitle').value = item.title || '';
    document.getElementById('itemUsername').value = item.username || '';
    document.getElementById('itemPassword').value = item.password || '';
    document.getElementById('itemLoginUrl').value = item.login_url || '';
    document.getElementById('itemFolder').value = item.folder || '';
    document.getElementById('itemTags').value = item.tags && item.tags.length > 0 ? item.tags.join(', ') : '';
    document.getElementById('itemNotes').value = item.notes || '';
  } else {
    currentEditorMode = 'add';
    title.textContent = '添加密码条目';
    document.getElementById('editorForm').reset();
    document.getElementById('itemId').value = '';
    document.getElementById('itemSpace').value = activeSpaceFilter === 'work' ? 'work' : 'personal';
  }

  passwordInput.type = 'password';
  toggleButton.textContent = '👁️';
  modal.classList.remove('hidden');
}

function closeEditor() {
  document.getElementById('editorModal').classList.add('hidden');
}

function togglePasswordVisibility() {
  const input = document.getElementById('itemPassword');
  const button = document.getElementById('togglePasswordBtn');
  if (input.type === 'password') {
    input.type = 'text';
    button.textContent = '🙈';
  } else {
    input.type = 'password';
    button.textContent = '👁️';
  }
}

function parseTagsInput(raw) {
  if (!raw) {
    return [];
  }
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );
}

async function handleSaveItem(e) {
  e.preventDefault();

  const data = {
    space: normalizeSpace(document.getElementById('itemSpace').value),
    title: document.getElementById('itemTitle').value,
    username: document.getElementById('itemUsername').value,
    password: document.getElementById('itemPassword').value,
    login_url: document.getElementById('itemLoginUrl').value,
    folder: document.getElementById('itemFolder').value,
    tags: parseTagsInput(document.getElementById('itemTags').value),
    notes: document.getElementById('itemNotes').value,
  };

  try {
    let url = `${API_BASE}/api/items`;
    let method = 'POST';

    if (currentEditorMode === 'edit') {
      const id = document.getElementById('itemId').value;
      url = `${API_BASE}/api/items/${id}`;
      method = 'PUT';
    }

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      closeEditor();
      await loadItems();
      showToast('保存成功', 'success');
      return;
    }

    if (res.status === 401) {
      logout();
      return;
    }

    const payload = await res.json().catch(() => null);
    showToast(payload?.error || '保存失败', 'error');
  } catch {
    showToast('网络错误', 'error');
  }
}

async function editItem(id) {
  try {
    const res = await fetch(`${API_BASE}/api/items/${id}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (res.status === 401) {
      logout();
      return;
    }

    if (!res.ok) {
      showToast('加载编辑数据失败', 'error');
      return;
    }

    const item = await res.json();
    openEditor(item);
  } catch {
    showToast('加载编辑数据失败', 'error');
  }
}

async function deleteItem(id) {
  if (!confirm('确定要删除这个条目吗？')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/items/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (res.status === 401) {
      logout();
      return;
    }

    if (!res.ok) {
      showToast('删除失败', 'error');
      return;
    }

    passwordItems = passwordItems.filter((item) => item.id !== id);
    applyCurrentView();
    if (currentDetailItem && currentDetailItem.id === id) {
      closeItemDetail();
    }
    showToast('删除成功', 'success');
  } catch {
    showToast('网络错误', 'error');
  }
}

async function markItemUsed(id) {
  try {
    const res = await fetch(`${API_BASE}/api/items/${id}/used`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!res.ok) {
      return;
    }

    const payload = await res.json();
    const target = passwordItems.find((item) => item.id === id);
    if (target) {
      target.last_used_at = payload.last_used_at;
    }
    if (currentDetailItem && currentDetailItem.id === id) {
      currentDetailItem.last_used_at = payload.last_used_at;
    }
    if (activeSort === 'used_desc') {
      applyCurrentView();
    }
  } catch {
    // 忽略打点失败，不影响主要功能
  }
}

async function copyToClipboard(text) {
  if (!text) {
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function normalizeSpace(space) {
  return space === 'work' ? 'work' : 'personal';
}

function logout() {
  authToken = null;
  passwordItems = [];
  currentDetailItem = null;
  localStorage.removeItem('minipwd_token');
  sessionStorage.removeItem('minipwd_token');
  showLogin();
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white ${
    type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600'
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}
