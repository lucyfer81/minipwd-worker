// API 配置
const API_BASE = window.location.origin;
let authToken = null;
let passwordItems = [];
let currentEditorMode = 'add'; // 'add' or 'edit'
let currentDetailItem = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
  setupEventListeners();
});

// 检查会话
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

// 设置事件监听
function setupEventListeners() {
  // 登录
  document.getElementById('loginForm').addEventListener('submit', handleLogin);

  // 工具栏
  document.getElementById('addBtn').addEventListener('click', () => openEditor());
  document.getElementById('generateBtn').addEventListener('click', () => openGenerator(false));
  document.getElementById('searchInput').addEventListener('input', handleSearch);

  // 密码生成器弹窗
  document.getElementById('closeGeneratorBtn').addEventListener('click', () => closeGenerator());
  document.getElementById('lengthSlider').addEventListener('input', (e) => {
    document.getElementById('lengthValue').textContent = e.target.value;
  });
  document.getElementById('generateActionBtn').addEventListener('click', handleGeneratePassword);
  document.getElementById('copyPasswordBtn').addEventListener('click', () => {
    const password = document.getElementById('passwordResult').textContent;
    copyToClipboard(password);
    showToast('复制成功', 'success');
  });

  // 详情弹窗
  document.getElementById('closeDetailBtn').addEventListener('click', closeItemDetail);
  document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      closeItemDetail();
    }
  });
  document.getElementById('copyDetailUsernameBtn').addEventListener('click', () => copyDetailField('username'));
  document.getElementById('copyDetailPasswordBtn').addEventListener('click', () => copyDetailField('password'));
  document.getElementById('copyDetailUrlBtn').addEventListener('click', () => copyDetailField('url'));

  // 编辑器弹窗
  document.getElementById('closeEditorBtn').addEventListener('click', closeEditor);
  document.getElementById('cancelEditorBtn').addEventListener('click', closeEditor);
  document.getElementById('editorForm').addEventListener('submit', handleSaveItem);
  document.getElementById('togglePasswordBtn').addEventListener('click', togglePasswordVisibility);
  document.getElementById('generateForItemBtn').addEventListener('click', () => openGenerator(true));
}

// 登录处理
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
      showApp();
      loadItems();
    } else {
      document.getElementById('loginError').classList.remove('hidden');
      document.getElementById('masterPassword').value = '';
    }
  } catch (error) {
    showToast('网络错误，请重试', 'error');
  }
}

// 显示/隐藏界面
function showLogin() {
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

// 加载条目
async function loadItems() {
  try {
    const res = await fetch(`${API_BASE}/api/items`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });

    if (res.ok) {
      passwordItems = await res.json();
      renderItems(passwordItems);
    } else if (res.status === 401) {
      logout();
    }
  } catch (error) {
    showToast('加载失败', 'error');
  }
}

// 渲染条目列表
function renderItems(items) {
  const list = document.getElementById('passwordList');
  list.innerHTML = '';

  if (items.length === 0) {
    list.innerHTML = `
      <div class="cards-empty text-center text-gray-500 py-10 bg-white rounded-lg border border-dashed border-gray-300">
        暂无密码条目，点击"添加"开始
      </div>
    `;
    return;
  }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'password-item password-card';
    div.innerHTML = `
      <div class="password-card-main cursor-pointer" onclick="openItemDetail(${item.id})">
        <div class="password-card-title-row">
            <h3 class="password-card-title">${escapeHtml(item.title)}</h3>
            ${item.login_url ? `<a href="${escapeHtml(item.login_url)}" target="_blank" class="text-blue-600 hover:underline" onclick="event.stopPropagation()">🔐</a>` : ''}
        </div>
        <p class="password-card-meta">${escapeHtml(item.username)}</p>
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

// 打开详情弹窗
function openItemDetail(id) {
  const item = passwordItems.find(i => i.id === id);
  if (!item) return;

  currentDetailItem = item;
  document.getElementById('detailTitle').textContent = item.title || '条目详情';
  document.getElementById('detailUsername').textContent = item.username || '-';
  document.getElementById('detailPassword').textContent = item.password || '-';
  document.getElementById('detailUrl').textContent = item.login_url || '-';

  const notesGroup = document.getElementById('detailNotesGroup');
  if (item.notes) {
    document.getElementById('detailNotes').textContent = item.notes;
    notesGroup.classList.remove('hidden');
  } else {
    document.getElementById('detailNotes').textContent = '';
    notesGroup.classList.add('hidden');
  }

  document.getElementById('detailModal').classList.remove('hidden');
}

function closeItemDetail() {
  document.getElementById('detailModal').classList.add('hidden');
  currentDetailItem = null;
}

function copyDetailField(field) {
  if (!currentDetailItem) return;

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

  copyToClipboard(text);
  showToast(`${fieldNameMap[field]}已复制`, 'success');
}

// 搜索处理
function handleSearch(e) {
  const query = e.target.value.toLowerCase();
  const filtered = passwordItems.filter(item =>
    item.title.toLowerCase().includes(query) ||
    item.username.toLowerCase().includes(query) ||
    (item.notes && item.notes.toLowerCase().includes(query))
  );
  renderItems(filtered);
}

// 打开密码生成器
function openGenerator(forItem = false) {
  document.getElementById('generatorModal').classList.remove('hidden');
  document.getElementById('generatorModal').dataset.forItem = forItem;
  document.getElementById('generatedPassword').classList.add('hidden');
}

function closeGenerator() {
  document.getElementById('generatorModal').classList.add('hidden');
}

// 生成密码
async function handleGeneratePassword() {
  const options = {
    length: parseInt(document.getElementById('lengthSlider').value),
    uppercase: document.getElementById('useUppercase').checked,
    lowercase: document.getElementById('useLowercase').checked,
    numbers: document.getElementById('useNumbers').checked,
    symbols: document.getElementById('useSymbols').checked,
    excludeSimilar: document.getElementById('excludeSimilar').checked,
  };

  const params = new URLSearchParams({
    length: options.length,
    uppercase: options.uppercase,
    lowercase: options.lowercase,
    numbers: options.numbers,
    symbols: options.symbols,
    excludeSimilar: options.excludeSimilar,
  });

  try {
    const res = await fetch(`${API_BASE}/api/generate-password?${params}`);
    const data = await res.json();
    document.getElementById('passwordResult').textContent = data.password;
    document.getElementById('generatedPassword').classList.remove('hidden');

    // 如果是为条目生成，填充到表单
    const forItem = document.getElementById('generatorModal').dataset.forItem === 'true';
    if (forItem) {
      document.getElementById('itemPassword').value = data.password;
      closeGenerator();
    }
  } catch (error) {
    showToast('生成失败', 'error');
  }
}

// 打开编辑器
function openEditor(item = null) {
  const modal = document.getElementById('editorModal');
  const title = document.getElementById('editorTitle');

  if (item) {
    currentEditorMode = 'edit';
    title.textContent = '编辑密码条目';
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemTitle').value = item.title;
    document.getElementById('itemUsername').value = item.username;
    document.getElementById('itemPassword').value = item.password;
    document.getElementById('itemLoginUrl').value = item.login_url || '';
    document.getElementById('itemNotes').value = item.notes || '';
  } else {
    currentEditorMode = 'add';
    title.textContent = '添加密码条目';
    document.getElementById('editorForm').reset();
    document.getElementById('itemId').value = '';
  }

  modal.classList.remove('hidden');
}

function closeEditor() {
  document.getElementById('editorModal').classList.add('hidden');
}

// 切换密码可见性
function togglePasswordVisibility() {
  const input = document.getElementById('itemPassword');
  const btn = document.getElementById('togglePasswordBtn');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

// 保存条目
async function handleSaveItem(e) {
  e.preventDefault();

  const data = {
    title: document.getElementById('itemTitle').value,
    username: document.getElementById('itemUsername').value,
    password: document.getElementById('itemPassword').value,
    login_url: document.getElementById('itemLoginUrl').value,
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
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      showToast('保存成功', 'success');
      closeEditor();
      loadItems();
    } else {
      showToast('保存失败', 'error');
    }
  } catch (error) {
    showToast('网络错误', 'error');
  }
}

// 编辑条目
function editItem(id) {
  const item = passwordItems.find(i => i.id === id);
  if (item) {
    openEditor(item);
  }
}

// 删除条目
async function deleteItem(id) {
  if (!confirm('确定要删除这个条目吗？')) return;

  try {
    const res = await fetch(`${API_BASE}/api/items/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` },
    });

    if (res.ok) {
      showToast('删除成功', 'success');
      loadItems();
    } else {
      showToast('删除失败', 'error');
    }
  } catch (error) {
    showToast('网络错误', 'error');
  }
}

// 复制到剪贴板
function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
}

// 登出
function logout() {
  authToken = null;
  localStorage.removeItem('minipwd_token');
  sessionStorage.removeItem('minipwd_token');
  showLogin();
}

// 显示提示
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white ${
    type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600'
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
