document.addEventListener('DOMContentLoaded', () => {
  // UI要素
  const downloadBtn = document.getElementById('downloadBtn');
  const exportBtn = document.getElementById('exportBtn');
  const statusDiv = document.getElementById('status');
  
  // Icon設定
  const gemSettings = document.getElementById('gem-settings');
  const gemNameSpan = document.getElementById('gem-name');
  const dropZone = document.getElementById('dropZone');
  const iconInput = document.getElementById('iconInput');
  const previewContainer = document.getElementById('preview-container');
  const iconPreview = document.getElementById('icon-preview');
  const actionButtons = document.getElementById('actionButtons');
  const saveIconBtn = document.getElementById('saveIconBtn');
  const resetIconBtn = document.getElementById('resetIconBtn');

  // リスト・検索
  const searchBox = document.getElementById('searchBox');
  const chatList = document.getElementById('chatList');

  let currentGemId = null;
  let allChats = [];

  // ==========================================
  // 1. 初期化 & Gem情報取得
  // ==========================================
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url.includes('google.com')) {
      statusDiv.textContent = "Geminiページを開いてください";
      return;
    }
    statusDiv.textContent = "準備完了";

    // Gem情報の確認
    chrome.tabs.sendMessage(tab.id, { action: 'getGemInfo' }, (response) => {
      if (chrome.runtime.lastError) return;

      if (response && response.gemId) {
        currentGemId = response.gemId;
        gemSettings.style.display = 'block';
        gemNameSpan.textContent = response.gemName;
        actionButtons.style.display = 'none'; // 初期は隠す

        // 保存済みアイコン
        const key = `gem_icon_${currentGemId}`;
        chrome.storage.local.get(key, (data) => {
          if (data[key] && data[key].imageData) {
            showPreview(data[key].imageData);
            actionButtons.style.display = 'flex';
          }
        });
      }
    });
  });

  // ==========================================
  // 2. アイコン変更機能 (D&D)
  // ==========================================
  dropZone.addEventListener('click', () => iconInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  iconInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) return status("画像のみ対応です", true);
    if (file.size > 2 * 1024 * 1024) return status("画像は2MB以下にしてください", true);

    const reader = new FileReader();
    reader.onload = (ev) => {
      showPreview(ev.target.result);
      actionButtons.style.display = 'flex';
      dropZone.dataset.tempImage = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function showPreview(src) {
    iconPreview.src = src;
    previewContainer.style.display = 'block';
    dropZone.style.display = 'none';
  }

  function status(msg, isError = false) {
    statusDiv.textContent = msg;
    statusDiv.style.color = isError ? 'red' : '#666';
  }

  // 保存 & リセット
  saveIconBtn.addEventListener('click', () => {
    const imageData = dropZone.dataset.tempImage || iconPreview.src;
    if (!currentGemId || !imageData) return;
    const key = `gem_icon_${currentGemId}`;
    chrome.storage.local.set({ [key]: { imageData, updatedAt: Date.now() } }, () => {
      status("アイコンを適用しました！");
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'updateIcon' });
      });
      setTimeout(() => window.close(), 1000);
    });
  });

  resetIconBtn.addEventListener('click', () => {
    if(!currentGemId) return;
    chrome.storage.local.remove(`gem_icon_${currentGemId}`, () => {
       status("アイコン設定を削除しました");
       previewContainer.style.display = 'none';
       dropZone.style.display = 'block';
       actionButtons.style.display = 'none';
       chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
         chrome.tabs.sendMessage(tabs[0].id, { action: 'updateIcon' }); // リセット反映（リロード推奨だが一応）
       });
    });
  });

  downloadBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'downloadMarkdown' });
      window.close();
    });
  });

  // ==========================================
  // 3. チャット履歴: 描画・検索・編集・削除
  // ==========================================
  
  function loadChats() {
    chrome.storage.local.get(['gemini_chats'], (result) => {
      allChats = result.gemini_chats || [];
      renderList(allChats);
    });
  }
  loadChats(); // 初回読み込み

  // 描画
  function renderList(chats) {
    chatList.innerHTML = '';
    if (chats.length === 0) {
      chatList.innerHTML = '<li class="empty-msg">履歴が見つかりません</li>';
      return;
    }

    chats.forEach(chat => {
      const li = document.createElement('li');
      
      // 左側: リンクと日付
      const divContent = document.createElement('div');
      divContent.className = 'link-content';
      
      const a = document.createElement('a');
      a.href = chat.url;
      a.className = 'link-title';
      a.textContent = chat.title;
      a.target = "_blank";
      a.title = chat.title;

      const dateStr = new Date(chat.lastSeen).toLocaleDateString() + ' ' + new Date(chat.lastSeen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const spanDate = document.createElement('span');
      spanDate.className = 'link-date';
      spanDate.textContent = dateStr;

      divContent.appendChild(a);
      divContent.appendChild(spanDate);

      // 右側: 操作ボタン
      const divActions = document.createElement('div');
      divActions.className = 'item-actions';

      // 編集ボタン
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-action-small';
      editBtn.innerHTML = '✏️';
      editBtn.title = "タイトルを変更";
      editBtn.onclick = (e) => {
        e.preventDefault(); // リンク移動防止
        editChatTitle(chat.url, chat.title);
      };

      // 削除ボタン
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-action-small btn-delete';
      delBtn.innerHTML = '🗑️';
      delBtn.title = "履歴から削除";
      delBtn.onclick = (e) => {
        e.preventDefault();
        deleteChat(chat.url);
      };

      divActions.appendChild(editBtn);
      divActions.appendChild(delBtn);

      li.appendChild(divContent);
      li.appendChild(divActions);
      chatList.appendChild(li);
    });
  }

  // --- 編集ロジック ---
  function editChatTitle(url, oldTitle) {
    const newTitle = prompt("新しいタイトルを入力してください:", oldTitle);
    if (newTitle && newTitle !== oldTitle) {
      chrome.storage.local.get(['gemini_chats'], (result) => {
        let chats = result.gemini_chats || [];
        const index = chats.findIndex(c => c.url === url);
        if (index > -1) {
          chats[index].title = newTitle;
          chats[index].isRenamed = true; // ★重要: 自動上書き防止フラグ
          
          chrome.storage.local.set({ gemini_chats: chats }, () => {
            loadChats(); // 再描画
          });
        }
      });
    }
  }

  // --- 削除ロジック ---
  function deleteChat(url) {
    if (!confirm("この履歴を削除しますか？\n(Gemini上のデータは消えません)")) return;
    
    chrome.storage.local.get(['gemini_chats'], (result) => {
      let chats = result.gemini_chats || [];
      const newChats = chats.filter(c => c.url !== url);
      
      chrome.storage.local.set({ gemini_chats: newChats }, () => {
        loadChats(); // 再描画
      });
    });
  }

  // 検索
  searchBox.addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase();
    const filtered = allChats.filter(chat => 
      chat.title.toLowerCase().includes(keyword)
    );
    renderList(filtered);
  });

  // JSONエクスポート
  exportBtn.addEventListener('click', () => {
    if (allChats.length === 0) return status("データがありません", true);
    
    const jsonStr = JSON.stringify(allChats, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini_history_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
});