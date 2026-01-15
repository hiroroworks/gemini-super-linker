/**
 * Gemini Super-Linker - content.js (v8.0)
 * 1. チャット履歴の自動保存 (リネーム保護付き)
 * 2. Markdownダウンロード
 * 3. Gemアイコンのカスタマイズ
 */

(function() {
  'use strict';
  
  if (window.hasGeminiSuperLinkerLoaded) return;
  window.hasGeminiSuperLinkerLoaded = true;

  console.log('Gemini Super-Linker v8.0: Ready.');

  // ==========================================
  //  Part A: メッセージ受信
  // ==========================================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'downloadMarkdown') {
      downloadMarkdown();
    } else if (request.action === 'getGemInfo') {
      sendResponse(getGemInfo());
    } else if (request.action === 'updateIcon') {
      replaceIcons();
      sendResponse({ success: true });
    }
    return true;
  });

  // ==========================================
  //  Part B: Gemアイコン変更
  // ==========================================
  function getGemInfo() {
    const url = window.location.href;
    const gemIdMatch = url.match(/\/gem\/([^\/\?]+)/);
    if (!gemIdMatch) return null;
    
    const gemId = gemIdMatch[1];
    let gemName = 'Unknown Gem';
    const titleElement = document.querySelector('title');
    if (titleElement) {
      const title = titleElement.textContent;
      const nameMatch = title.match(/^(.+?)\s*[-–—]\s*Gemini/);
      if (nameMatch) gemName = nameMatch[1].trim();
    }
    return { gemId, gemName };
  }

  async function replaceIcons() {
    const gemInfo = getGemInfo();
    if (!gemInfo) return;
    const key = `gem_icon_${gemInfo.gemId}`;
    const data = await chrome.storage.local.get(key);
    if (!data[key]) return;
    const imageData = data[key].imageData;

    // ロゴ、アバター、メッセージ内のアイコンを置換
    const targets = [
      ...document.querySelectorAll('.bot-logo-text'),
      ...document.querySelectorAll('bard-avatar')
    ];

    targets.forEach(el => {
      // 既に処理済みならスキップ
      if (el.dataset.gemIconReplaced === 'true') return;

      // bard-avatarの場合は内部のdivを探す
      let container = el;
      if (el.tagName.toLowerCase() === 'bard-avatar') {
        const innerDiv = el.querySelector('div[class*="avatar"], div[class*="logo"]');
        if (innerDiv) container = innerDiv;
        else return; // ターゲットが見つからない
      }

      // 条件: SVGがある、またはテキストが短い(イニシャル)
      if (container.querySelector('svg') || container.textContent.trim().length <= 2) {
        container.innerHTML = '';
        container.appendChild(createIconImage(imageData));
        container.style.background = 'transparent';
        container.dataset.gemIconReplaced = 'true';
        el.dataset.gemIconReplaced = 'true';
      }
    });

    // メッセージ内のアイコン (遅延ロード対応)
    document.querySelectorAll('[role="article"]').forEach(article => {
      const avatar = article.querySelector('bard-avatar');
      if (avatar && avatar.dataset.gemIconReplaced !== 'true') {
         // ここでも再帰的に適用してもいいが、MutationObserverに任せる
      }
    });
  }

  function createIconImage(src) {
    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'width:100%; height:100%; object-fit:cover; border-radius:50%; display:block;';
    return img;
  }

  // ==========================================
  //  Part C: Markdown ダウンロード
  // ==========================================
  function downloadMarkdown() {
    const title = getChatTitle() || "Gemini_Chat";
    const date = new Date().toISOString().split('T')[0];
    let md = `# ${title}\nURL: ${location.href}\nDate: ${date}\n\n---\n\n`;

    const messages = document.querySelectorAll('user-query, model-response');
    if (messages.length === 0) {
      alert("チャット内容が見つかりません。");
      return;
    }

    messages.forEach(msg => {
      const isUser = msg.tagName.toLowerCase() === 'user-query';
      const speaker = isUser ? "👤 User" : "💎 Gemini";
      let text = msg.innerText.trim();
      if (msg.querySelectorAll('img').length > 0) text += "\n\n(画像あり)";
      md += `## ${speaker}\n${text}\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${date}_${title.replace(/[\\/:*?"<>|]/g, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ==========================================
  //  Part D: チャット履歴 自動保存 (リネーム対応版)
  // ==========================================
  let lastSavedUrl = "";
  let lastSavedTitle = "";

  function getChatTitle() {
    const convTitle = document.querySelector('.conversation-title, [data-test-id="conversation-title"]');
    if (convTitle && convTitle.textContent.trim()) return convTitle.textContent.trim();
    const pageTitle = document.title;
    if (pageTitle && !['Gemini', 'Google Gemini'].includes(pageTitle)) {
      return pageTitle.replace(/ - Gemini$/, '').trim();
    }
    return null;
  }

  function autoSaveChat() {
    const url = location.href;
    if (!url.includes('/app/') && !url.includes('/gem/')) return;

    let pageTitle = getChatTitle();
    if (!pageTitle || pageTitle === 'Gemini') return;

    // 重複チェック (前回保存時と同じならスキップ)
    if (url === lastSavedUrl && pageTitle === lastSavedTitle) return;

    chrome.storage.local.get(['gemini_chats'], (result) => {
      let chats = result.gemini_chats || [];
      const now = Date.now();

      // 既存のチャットを探す
      const existingIndex = chats.findIndex(c => c.url === url);

      if (existingIndex > -1) {
        // --- 更新ロジック ---
        const existingChat = chats[existingIndex];
        
        // もし「リネーム済み(isRenamed: true)」なら、タイトルは更新しない！
        if (existingChat.isRenamed) {
          // タイトルは既存のまま維持
          pageTitle = existingChat.title; 
        } 
        
        // データを更新 (一番上に持ってくるために一旦削除)
        chats.splice(existingIndex, 1);
        chats.push({
          url: url,
          title: pageTitle, // ページタイトル or リネーム後のタイトル
          lastSeen: now,
          isRenamed: existingChat.isRenamed || false // フラグを引き継ぐ
        });
        
      } else {
        // --- 新規追加ロジック ---
        chats.push({
          url: url,
          title: pageTitle,
          lastSeen: now,
          isRenamed: false
        });
      }

      // ソートして保存
      chats.sort((a, b) => b.lastSeen - a.lastSeen);

      chrome.storage.local.set({ gemini_chats: chats }, () => {
        // console.log(`履歴保存: ${pageTitle}`);
        lastSavedUrl = url;
        lastSavedTitle = pageTitle;
        showToast(`保存: ${pageTitle.substring(0, 15)}...`);
      });
    });
  }

  function showToast(msg) {
    const old = document.getElementById('merry-toast');
    if (old) old.remove();
    const div = document.createElement('div');
    div.id = 'merry-toast';
    Object.assign(div.style, {
      position: 'fixed', bottom: '20px', right: '20px',
      padding: '8px 16px', background: '#4caf50', color: 'white',
      borderRadius: '4px', zIndex: '999999', fontSize: '12px',
      boxShadow: '0 2px 5px rgba(0,0,0,0.2)', pointerEvents: 'none'
    });
    div.textContent = `🧹 ${msg}`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  }

  // ==========================================
  //  Part E: 統合監視
  // ==========================================
  const observer = new MutationObserver(() => {
    if (window.iconTimeout) clearTimeout(window.iconTimeout);
    window.iconTimeout = setTimeout(replaceIcons, 300);

    if (window.saveTimeout) clearTimeout(window.saveTimeout);
    window.saveTimeout = setTimeout(autoSaveChat, 2000);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setInterval(() => { replaceIcons(); autoSaveChat(); }, 3000);
  setTimeout(() => { replaceIcons(); autoSaveChat(); }, 2000);

})();