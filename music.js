const API_BASE = "https://music-api.gdstudio.xyz/api.php";
const audio = document.getElementById('audio');
const MUSIC_STATE_KEY = 'miffy_music_state_v1';
let currentList = [];
function getPageSize(){ const el = document.getElementById('page-size-select'); return el ? Number(el.value) || 20 : 20; }
const MAX_PAGES = Infinity; // removed artificial cap to allow unlimited loading
const AUTO_LOAD_ALL = true;
const LOAD_DELAY_MS = 400; // ms delay between auto-load requests to avoid spamming API
let autoLoadAbort = false; // flag to allow user to stop auto-loading
let currentPlayingIndex = -1;
let lyricLines = []; // [{time: seconds, text, el}]
let currentLyricIndex = -1;
let lastMusicStatePersistAt = 0;

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }
const coverUrlCache = new Map();
let coverObserver = null;
const searchState = {
  keyword: '',
  source: 'netease',
  mode: null,
  page: 1,
  hasMore: false,
  isLoading: false,
  seen: new Set(),
  manualPaging: false
};

// 兼容接口可能的返回结构（数组或对象包装）
function normalizeSearchData(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.result)) return raw.result;
  if (raw && raw.result && Array.isArray(raw.result.songs)) return raw.result.songs;
  return [];
}

async function fetchSearchByUrl(url) {
  const res = await fetch(url);
  const json = await res.json();
  return normalizeSearchData(json);
}

function makeSearchUrl(keyword, source, pageSize, page, mode) {
  const base = `${API_BASE}?types=search&source=${source}&name=${encodeURIComponent(keyword)}`;
  if (mode === 'plain') {
    if (page !== 1) return '';
    return base;
  }
  if (mode === 'page') return `${base}&count=${pageSize}&page=${page}`;
  if (mode === 'pages') return `${base}&count=${pageSize}&pages=${page}`;
  if (mode === 'offset') return `${base}&limit=${pageSize}&offset=${(page - 1) * pageSize}`;
  return base;
}

async function resolveCoverUrl(source, picId, size) {
  if (!picId) return '';
  const key = `${source}_${picId}_${size || 300}`;
  if (coverUrlCache.has(key)) return coverUrlCache.get(key);

  const res = await fetch(`${API_BASE}?types=pic&source=${source}&id=${encodeURIComponent(picId)}&size=${size || 300}`);
  const data = await res.json();
  const url = data && data.url ? data.url : '';
  if (url) coverUrlCache.set(key, url);
  return url;
}

function ensureCoverObserver() {
  if (coverObserver) return;
  if (!('IntersectionObserver' in window)) return;

  coverObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      coverObserver.unobserve(img);
      hydrateOneCover(img);
    });
  }, { root: document.querySelector('.scroll-area'), rootMargin: '120px 0px' });
}

function bindCoverLazyLoad(container) {
  ensureCoverObserver();
  const imgs = container.querySelectorAll('img[data-cover-ready="0"]');
  imgs.forEach((img) => {
    if (coverObserver) {
      coverObserver.observe(img);
    } else {
      hydrateOneCover(img);
    }
  });
}

async function hydrateOneCover(img) {
  if (!img || img.dataset.coverReady === '1') return;
  const source = img.dataset.source || document.getElementById('api-source').value;
  const picId = img.dataset.picId;
  if (!picId) return;

  try {
    const url = await resolveCoverUrl(source, picId, 300);
    if (!url) return;
    img.src = url;
    img.dataset.coverReady = '1';
    img.classList.remove('hidden');
    const placeholder = img.parentElement ? img.parentElement.querySelector('.cover-placeholder') : null;
    if (placeholder) placeholder.classList.add('hidden');
  } catch (e) {}
}

function mergeUnique(items, source) {
  const merged = [];
  for (const item of items) {
    const key = `${item.source || source}_${item.id || item.mid || item.name}`;
    if (!searchState.seen.has(key)) {
      searchState.seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

async function detectMode(keyword, source) {
  const pageSize = getPageSize();
  const modes = ['page', 'pages', 'offset', 'plain'];
  for (const mode of modes) {
    const u = makeSearchUrl(keyword, source, pageSize, 1, mode);
    if (!u) continue;
    const items = await fetchSearchByUrl(u);
    if (items.length) return { mode, items };
  }
  return { mode: null, items: [] };
}

function setLoadIndicator(text, isError) {
  const el = document.getElementById('load-more-indicator');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('error', !!isError);
}

function getCurrentTrackSnapshot() {
  const track = currentList[currentPlayingIndex] || null;
  if (!track) {
    return null;
  }

  return {
    id: track.id || '',
    source: track.source || '',
    name: track.name || '',
    artist: Array.isArray(track.artist) ? track.artist.slice() : (track.artist || ''),
    album: track.album || '',
    pic_id: track.pic_id || '',
    lyric_id: track.lyric_id || ''
  };
}

function persistMusicState(extraState) {
  if (!audio) {
    return;
  }

  const now = Date.now();
  const shouldThrottle = !extraState || !extraState.force;
  if (shouldThrottle && now - lastMusicStatePersistAt < 800) {
    return;
  }
  lastMusicStatePersistAt = now;

  const track = getCurrentTrackSnapshot();
  const playing = extraState && typeof extraState.playing === 'boolean'
    ? extraState.playing
    : !audio.paused && !audio.ended;

  const payload = {
    track: track,
    src: audio.src || '',
    currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
    duration: Number.isFinite(audio.duration) ? audio.duration : 0,
    playing: playing,
    savedAt: now
  };

  try {
    localStorage.setItem(MUSIC_STATE_KEY, JSON.stringify(payload));
  } catch (error) {}
}

function loadMusicState() {
  try {
    const raw = localStorage.getItem(MUSIC_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function restoreMusicState() {
  if (!audio) {
    return;
  }

  const state = loadMusicState();
  if (!state || !state.src) {
    return;
  }

  if (state.track && Array.isArray(state.track.artist)) {
    state.track.artist = state.track.artist.slice();
  }

  if (!audio.src) {
    audio.src = state.src;
  }

  const seekTo = Number(state.currentTime);
  if (Number.isFinite(seekTo) && seekTo > 0) {
    audio.addEventListener('loadedmetadata', function restoreSeekOnce() {
      audio.removeEventListener('loadedmetadata', restoreSeekOnce);
      try {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          audio.currentTime = Math.min(seekTo, Math.max(0, audio.duration - 0.25));
        } else {
          audio.currentTime = Math.max(0, seekTo);
        }
      } catch (error) {}
    });
  }

  if (state.playing) {
    audio.play().then(() => updatePlayUI(true)).catch(() => updatePlayUI(false));
  }
}

async function loadNextPage() {
  // 如果当前为手动分页模式，阻止自动加载下一页
  if (searchState.manualPaging) return;
  if (searchState.isLoading || !searchState.hasMore) return;
  searchState.isLoading = true;
  setLoadIndicator('正在加载更多...', false);

  try {
    if (searchState.mode === 'plain') {
      searchState.hasMore = false;
      return;
    }

    if (searchState.page > MAX_PAGES) {
      searchState.hasMore = false;
      return;
    }

    const url = makeSearchUrl(searchState.keyword, searchState.source, getPageSize(), searchState.page, searchState.mode);
    if (!url) {
      searchState.hasMore = false;
      return;
    }

    const pageItems = await fetchSearchByUrl(url);
    const merged = mergeUnique(pageItems, searchState.source);

    // 不再依赖“是否满20条”判断，避免接口每页条数不固定导致无法翻页
    if (!pageItems.length || !merged.length) {
      searchState.hasMore = false;
    }

    if (merged.length) {
      const startIndex = currentList.length;
      currentList = currentList.concat(merged);
      renderList(merged, true, startIndex);
    }

    searchState.page += 1;
  } catch (e) {
    setLoadIndicator('加载失败，点我重试', true);
  } finally {
    searchState.isLoading = false;
    updateListHeader();
    if (searchState.hasMore) {
      setLoadIndicator(AUTO_LOAD_ALL ? '正在自动加载全部，请稍候...' : '下滑到底部继续加载', false);
    } else if (!document.getElementById('load-more-indicator')?.classList.contains('error')) {
      setLoadIndicator('没有更多了', false);
    }
  }
}

// --- 核心逻辑：搜索（每次20首，底部下拉加载更多） ---
async function handleSearch() {
  const keyword = document.getElementById('keyword').value.trim();
  const source = document.getElementById('api-source').value;
  if (!keyword) return;

  const container = document.getElementById('list-container');
  container.innerHTML = "<p style='grid-column:1/-1; text-align:center;'>正在搜索...</p>";

  currentList = [];
  searchState.keyword = keyword;
  searchState.source = source;
  searchState.mode = null;
  searchState.page = 2;
  searchState.hasMore = false; // Enforce single-load mode
  searchState.isLoading = false;
  searchState.seen = new Set();

  try {
    const detected = await detectMode(keyword, source);
    if (!detected.mode || !detected.items.length) {
      renderList([]);
      return;
    }

    searchState.mode = detected.mode;
    // first page items are from detectMode
    const firstItems = detected.items || [];
    currentList = mergeUnique(firstItems, source);
    // reset page pointer to 1 (we've loaded page 1)
    searchState.page = 1;

    // plain 模式只有首屏，其它模式默认允许继续翻页
    searchState.hasMore = detected.mode !== 'plain' && firstItems.length >= getPageSize();

    renderList(currentList, false, 0);
    // 单次加载模式：不进行后续自动或手动分页
    searchState.hasMore = false;
  } catch (e) {
    container.innerHTML = "<p>搜索失败，请检查网络或API频率限制</p>";
  }
}

function updateListHeader() {
  const headerEl = document.getElementById('result-header');
  if (!headerEl) return;
  let tail = '，已加载完毕';
  if (searchState.manualPaging) {
    tail = `，第${searchState.page}页`;
  } else if (searchState.hasMore) {
    tail = AUTO_LOAD_ALL ? '，正在自动加载...' : '，下滑到底部继续加载';
  }
  headerEl.textContent = `已加载 ${currentList.length} 首${tail}`;
}

// 分页功能已移除：single-load 模式只加载一次

function renderList(data, append, startIndex) {
  append = !!append;
  startIndex = startIndex || 0;
  const container = document.getElementById('list-container');
  if (!append && (!data || !data.length)) {
    container.innerHTML = "<p style='grid-column:1/-1; text-align:center;'>未搜索到相关歌曲</p>";
    return;
  }

  if (!append) {
    container.innerHTML = `<p id='result-header' style='grid-column:1/-1; text-align:left; margin: 0 0 4px 4px; color: var(--text-muted);'></p>`;
  }

  const html = data.map((item, index) => `
    <div class="item-card" onclick="loadAndPlay(${index})">
      <div class="img-box">
         <svg class="cover-placeholder" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2"><path d="M9 18V5l12-2v13"></path></svg>
         <img class="hidden" data-cover-ready="0" data-source="${item.source || searchState.source}" data-pic-id="${item.pic_id || ''}" alt="cover" />
      </div>
      <div class="item-info">
        <div class="title">${item.name}</div>
        <div class="artist">${Array.isArray(item.artist) ? item.artist.join(' / ') : (item.artist || '未知歌手')} - ${item.album || '未知专辑'}</div>
      </div>
    </div>
  `).join('').replace(/loadAndPlay\((\d+)\)/g, (_, n) => `loadAndPlay(${startIndex + Number(n)})`);

  // 先移除旧的底部提示，再追加内容，最后补回提示
  const oldIndicator = document.getElementById('load-more-indicator');
  if (oldIndicator) oldIndicator.remove();
  container.insertAdjacentHTML('beforeend', html);
  container.insertAdjacentHTML('beforeend', `<div id='load-more-indicator' class='load-more-indicator'></div>`);
  bindCoverLazyLoad(container);
  updateListHeader();
  if (searchState.hasMore) {
    setLoadIndicator('正在自动加载全部，请稍候...', false);
  } else {
    setLoadIndicator('没有更多了', false);
  }
}

// --- 核心逻辑：获取播放地址并播放 ---
async function loadAndPlay(index) {
  currentPlayingIndex = index;
  const track = currentList[index];
  const source = track.source;

  // 每次切歌恢复到封面页
  toggleLyricPage(false);
  
  // 更新基础UI
  const miniTitleEl = document.getElementById('mini-title');
  const fullTitleEl = document.getElementById('full-title');
  if (miniTitleEl) miniTitleEl.innerText = track.name;
  if (fullTitleEl) fullTitleEl.innerText = track.name;
  const artistText = Array.isArray(track.artist) ? track.artist.join(' / ') : (track.artist || '未知歌手');
  const miniArtistEl = document.getElementById('mini-artist');
  const fullArtistEl = document.getElementById('full-artist');
  if (miniArtistEl) miniArtistEl.innerText = artistText;
  if (fullArtistEl) fullArtistEl.innerText = artistText;
  const lyricEl = document.getElementById('lyric-display');
  if (lyricEl) lyricEl.innerText = "正在获取音频流...";
  try {
    // 1. 获取URL
    const urlRes = await fetch(`${API_BASE}?types=url&source=${source}&id=${track.id}`);
    const urlData = await urlRes.json();
    
    // 2. 获取封面
    const picUrl = await resolveCoverUrl(source, track.pic_id, 500);
    
    // 3. 更新播放地址
    audio.src = urlData.url;
    try {
      await audio.play();
      updatePlayUI(true);
      persistMusicState({ playing: true, force: true });
    } catch (err) {
      updatePlayUI(false);
      alert('播放失败：无法启动音频播放');
      return;
    }

    // 4. 更新封面UI
    if (picUrl) {
      const imgHtml = `<img src="${picUrl}">`;
      document.getElementById('mini-img').innerHTML = imgHtml;
      document.getElementById('full-img').innerHTML = imgHtml;
      document.getElementById('player-bg').style.backgroundImage = `url(${picUrl})`;
      // 将封面也设置为唱片背面的背景，保留封面视觉
    }

    // 5. 获取歌词
    getLyrics(source, track.lyric_id);

  } catch (e) {
    alert("该资源暂时无法播放");
  }
}

async function getLyrics(source, id) {
  try {
    const res = await fetch(`${API_BASE}?types=lyric&source=${source}&id=${id}`);
    const data = await res.json();
    const lyricText =
      (data && data.lyric) ||
      (data && data.tlyric) ||
      (data && data.klyric) ||
      (data && data.lrc && data.lrc.lyric) ||
      (data && data.data && data.data.lyric) ||
      (data && data.data && data.data.tlyric) ||
      '';
    const lyricEl = document.getElementById('lyric-display');
    if (!lyricEl) return;
    if (!lyricText) {
      lyricEl.innerText = "纯音乐，请欣赏";
      lyricLines = [];
      currentLyricIndex = -1;
      return;
    }
    // 解析并渲染 LRC（含时间戳）
    lyricLines = parseLrc(lyricText);
    renderLyrics(lyricLines, lyricEl);
    currentLyricIndex = -1;
  } catch (e) {
    const lyricEl = document.getElementById('lyric-display');
    if (lyricEl) lyricEl.innerText = "暂无歌词";
  }
}

function parseLrc(raw) {
  const lines = raw.split(/\r?\n/);
  const out = [];
  const timeRe = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  for (const line of lines) {
    let match;
    const times = [];
    while ((match = timeRe.exec(line)) !== null) {
      const m = Number(match[1]);
      const s = Number(match[2]);
      const ms = match[3] ? Number(match[3].padEnd(3, '0')) : 0;
      times.push(m * 60 + s + ms / 1000);
    }
    const text = line.replace(timeRe, '').trim();
    if (times.length && text.length) {
      for (const t of times) out.push({ time: t, text });
    } else if (text.length && out.length === 0) {
      // fallback: push as untimed lines (spread across duration later)
      out.push({ time: 0, text });
    }
  }
  // sort by time
  out.sort((a, b) => a.time - b.time);
  return out;
}

function renderLyrics(lines, container) {
  container.innerHTML = '';
  if (!lines || !lines.length) {
    container.innerText = '暂无歌词';
    return;
  }
  for (let i = 0; i < lines.length; i++) {
    const row = document.createElement('div');
    row.className = 'lyric-line';
    row.dataset.index = i;
    row.dataset.time = String(lines[i].time);
    row.innerText = lines[i].text;
    container.appendChild(row);
    lines[i].el = row;
  }
  container.scrollTop = 0;
}

function updateLyricHighlight(now) {
  if (!lyricLines || !lyricLines.length) return;
  // Find the last line whose time <= now
  let idx = -1;
  for (let i = 0; i < lyricLines.length; i++) {
    if (now + 0.25 >= lyricLines[i].time) idx = i;
    else break;
  }
  if (idx === -1) return;

  // 仅在行发生变化时更新高亮并滚动一次，避免与平滑/插值冲突
  if (idx === currentLyricIndex) return;

  if (currentLyricIndex >= 0 && lyricLines[currentLyricIndex] && lyricLines[currentLyricIndex].el) {
    lyricLines[currentLyricIndex].el.classList.remove('active');
  }
  currentLyricIndex = idx;
  const activeEl = lyricLines[idx].el;
  if (!activeEl) return;
  activeEl.classList.add('active');

  try {
    const overlay = document.getElementById('lyric-display');
    if (!overlay) return;
    
    // 用 getBoundingClientRect 计算行在视窗中的位置，而不是 offsetTop
    const lineBounds = activeEl.getBoundingClientRect();
    const containerBounds = overlay.getBoundingClientRect();
    
    // 行相对于容器顶部的位置
    const relativeTop = lineBounds.top - containerBounds.top + overlay.scrollTop;
    const targetTop = Math.max(0, relativeTop - containerBounds.height * 0.38);
    
    console.log(`Lyric scroll: idx=${idx}, lineBounds.top=${lineBounds.top}, containerBounds.top=${containerBounds.top}, containerBounds.height=${containerBounds.height}, relativeTop=${relativeTop}, targetTop=${targetTop}`);
    overlay.scrollTop = targetTop;
    console.log(`After scroll: scrollTop is now ${overlay.scrollTop}`);
  } catch (e) {
    console.error('Lyric scroll error:', e);
  }
}

function toggleDiscLyric() {
  const fullPlayer = document.getElementById('full-player');
  if (!fullPlayer) return;
  // 切换显示状态（如果当前显示歌词，则隐藏；如果显示封面，则显示歌词）
  const isShowingLyric = fullPlayer.classList.contains('show-lyric');
  toggleLyricPage(!isShowingLyric);
}

function toggleLyricPage(show) {
  const fullPlayer = document.getElementById('full-player');
  if (!fullPlayer) return;
  fullPlayer.classList.toggle('show-lyric', !!show);
  // 打开歌词页时重置到顶部
  if (show) {
    const overlay = document.getElementById('lyric-display');
    if (overlay) {
      overlay.scrollTop = 0;
    }
  }
}

// --- UI 交互控制 ---
function togglePlay() {
  // 若未加载音频但有搜索结果，点击播放默认播放第一首
  if (!audio.src && currentList.length > 0) {
    loadAndPlay(Math.max(currentPlayingIndex, 0));
    return;
  }
  if (audio.paused) {
    audio.play().then(() => updatePlayUI(true)).catch(() => updatePlayUI(false));
  } else {
    audio.pause();
    updatePlayUI(false);
  }
}

function updatePlayUI(playing) {
  const icon = playing ? 
    '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>' : 
    '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
  document.getElementById('mini-play-icon').innerHTML = icon;
  const fullIcon = document.getElementById('full-play-icon') || document.getElementById('full-play-icon-svg');
  if (fullIcon) fullIcon.innerHTML = icon;

  const disc = document.getElementById('disc-anim');
  if (disc) disc.classList.toggle('playing', playing);
}

function toggleFullPlayer(show) {
  document.getElementById('full-player').classList.toggle('active', show);
  if (!show) toggleLyricPage(false);
}

audio.addEventListener('play', () => updatePlayUI(true));
audio.addEventListener('play', () => persistMusicState({ playing: true }));
audio.addEventListener('pause', () => updatePlayUI(false));
audio.addEventListener('pause', () => persistMusicState({ playing: false }));
audio.addEventListener('ended', () => persistMusicState({ playing: false, force: true }));

function playPrev() {
  if (!currentList.length) return;
  const prevIndex = currentPlayingIndex > 0 ? currentPlayingIndex - 1 : currentList.length - 1;
  loadAndPlay(prevIndex);
}

function playNext() {
  if (!currentList.length) return;
  const nextIndex = currentPlayingIndex >= 0 ? (currentPlayingIndex + 1) % currentList.length : 0;
  loadAndPlay(nextIndex);
}

// 进度条控制
audio.ontimeupdate = () => {
  if(!audio.duration) return;
  // 更新歌词高亮（如果有解析出的歌词）
  try { updateLyricHighlight(audio.currentTime); } catch(e){}
  const pc = (audio.currentTime / audio.duration) * 100;
  document.getElementById('prog-curr').style.width = pc + "%";
  document.getElementById('time-curr').innerText = formatTime(audio.currentTime);
  document.getElementById('time-total').innerText = formatTime(audio.duration);
  persistMusicState({ playing: !audio.paused && !audio.ended });
};

function seek(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  audio.currentTime = (x / rect.width) * audio.duration;
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const secs = String(Math.floor(s % 60)).padStart(2, '0');
  return `${m}:${secs}`;
}

// 初始化：为歌词页添加点击返回事件
(function() {
  const initLyricPageClick = () => {
    const lyricPage = document.getElementById('lyric-page');
    if (!lyricPage) {
      setTimeout(initLyricPageClick, 100);
      return;
    }
    lyricPage.addEventListener('click', (e) => {
      e.stopPropagation();  // 防止事件冒泡
      
      // 如果点击的是lyric-line（歌词行），则不返回
      if (e.target.classList && e.target.classList.contains('lyric-line')) {
        return;
      }
      
      // 其他所有点击都触发返回
      toggleDiscLyric();
    });
  };
  initLyricPageClick();
})();

// 左上角返回热区（无需按钮）
function goBackFromTopLeft() {
  persistMusicState({ playing: !audio.paused && !audio.ended, force: true });
  document.body.classList.add('back-feedback');
  if (navigator.vibrate) navigator.vibrate(15);
  setTimeout(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'index.html';
    }
  }, 110);
}

function isFullPlayerOpen() {
  const fp = document.getElementById('full-player');
  return !!(fp && fp.classList.contains('active'));
}

function isClickInsideFullPlayer(event) {
  if (!event || !event.target || !event.target.closest) return false;
  return !!event.target.closest('#full-player');
}

document.addEventListener('click', (e) => {
  // 点击发生在全屏播放器内部时，永远不触发主页左上角热区
  if (isClickInsideFullPlayer(e)) return;
  // 全屏播放器打开时，也不触发主页返回热区
  if (isFullPlayerOpen()) return;
  const inTopLeft = e.clientX <= 64 && e.clientY <= 64;
  if (inTopLeft) goBackFromTopLeft();
});

document.addEventListener('touchend', (e) => {
  // 点击发生在全屏播放器内部时，永远不触发主页左上角热区
  if (isClickInsideFullPlayer(e)) return;
  // 全屏播放器打开时，不触发主页返回热区
  if (isFullPlayerOpen()) return;
  if (!e.changedTouches || !e.changedTouches[0]) return;
  const t = e.changedTouches[0];
  const inTopLeft = t.clientX <= 64 && t.clientY <= 64;
  if (inTopLeft) goBackFromTopLeft();
}, { passive: true });

window.addEventListener('pagehide', function() {
  persistMusicState({ playing: !audio.paused && !audio.ended, force: true });
});

window.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    restoreMusicState();
  } else {
    persistMusicState({ playing: !audio.paused && !audio.ended });
  }
});

restoreMusicState();

// 其他早期的加载/停止/分页控件可能不存在 — 新脚本保留了对这些元素存在性的检查

(function initInfiniteScroll() {
  const scrollArea = document.querySelector('.scroll-area');
  if (!scrollArea) return;

  scrollArea.addEventListener('scroll', function() {
    if (AUTO_LOAD_ALL) return;
    if (!searchState.hasMore || searchState.isLoading) return;
    const remain = scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
    if (remain < 80) {
      loadNextPage();
    }
  }, { passive: true });

  scrollArea.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'load-more-indicator' && e.target.classList.contains('error')) {
      loadNextPage();
    }
  });
})();
