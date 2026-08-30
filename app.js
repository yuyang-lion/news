(function () {
  "use strict";

  const DATA = window.AI_NEWS || { items: [], sources: [], generated_at: "" };
  const items = Array.isArray(DATA.items) ? DATA.items : [];

  const CATEGORY_LABELS = {
    products: "产品",
    research: "研究",
    policy: "政策",
    industry: "行业",
    tools: "工具",
  };

  const CATEGORY_LABELS_EN = {
    products: "Products",
    research: "Research",
    policy: "Policy",
    industry: "Industry",
    tools: "Tools",
  };

  const state = {
    query: "",
    category: "all",
    source: "all",
    range: "today",
    sort: "newest",
    view: "grid",
    savedOnly: false,
    lang: "zh",
  };

  const I18N = {
    zh: {
      siteName: "每日 AI 新闻",
      siteTag: "Daily AI Newsroom",
      todayNews: "今日新闻",
      sources: "信息源",
      last24h: "近 24 小时",
      lastUpdated: "最后更新",
      searchPlaceholder: "搜索标题、摘要或来源",
      today: "今天",
      last3: "近 3 天",
      last7: "近 7 天",
      all: "全部",
      allSources: "全部来源",
      sortNewest: "最新在前",
      sortOldest: "最早在前",
      saved: "已收藏",
      categoryAll: "全部",
      catProducts: "产品",
      catResearch: "研究",
      catPolicy: "政策",
      catIndustry: "行业",
      catTools: "工具",
      resultCount: (n) => `找到 ${n} 条`,
      emptyQuery: "没有找到匹配的新闻",
      emptySaved: "暂无收藏的新闻",
      skip: "跳到新闻列表",
      toggleTheme: "切换主题",
      toggleLang: "切换语言",
      footerTitle: "每日 AI 新闻",
      footerUpdated: (label) => `最后更新：${label}`,
      untitled: "未命名新闻",
      timeUnknown: "时间未知",
      justNow: "刚刚",
      minutesAgo: (n) => `${n} 分钟前`,
      hoursAgo: (n) => `${n} 小时前`,
      yesterday: "昨天",
      daysAgo: (n) => `${n} 天前`,
      source: "来源",
      gridView: "网格视图",
      listView: "列表视图",
    },
    en: {
      siteName: "Daily AI News",
      siteTag: "AI Newsroom",
      todayNews: "Today",
      sources: "Sources",
      last24h: "Last 24h",
      lastUpdated: "Updated",
      searchPlaceholder: "Search headlines, summaries, or sources",
      today: "Today",
      last3: "3 days",
      last7: "7 days",
      all: "All",
      allSources: "All sources",
      sortNewest: "Newest first",
      sortOldest: "Oldest first",
      saved: "Saved",
      categoryAll: "All",
      catProducts: "Products",
      catResearch: "Research",
      catPolicy: "Policy",
      catIndustry: "Industry",
      catTools: "Tools",
      resultCount: (n) => `${n} results`,
      emptyQuery: "No matching stories",
      emptySaved: "No saved stories",
      skip: "Skip to stories",
      toggleTheme: "Toggle theme",
      toggleLang: "Switch language",
      footerTitle: "Daily AI News",
      footerUpdated: (label) => `Updated: ${label}`,
      untitled: "Untitled",
      timeUnknown: "Unknown time",
      justNow: "just now",
      minutesAgo: (n) => `${n}m ago`,
      hoursAgo: (n) => `${n}h ago`,
      yesterday: "yesterday",
      daysAgo: (n) => `${n}d ago`,
      source: "Source",
      gridView: "Grid view",
      listView: "List view",
    },
  };

  let savedIds = new Set();
  try {
    savedIds = new Set(JSON.parse(localStorage.getItem("ai-news-saved") || "[]"));
  } catch (error) {
    savedIds = new Set();
  }

  function t(key, ...args) {
    const value = I18N[state.lang][key];
    return typeof value === "function" ? value(...args) : value;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function localDayKey(iso) {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function dayDistance(iso) {
    if (!iso) return Infinity;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return Infinity;
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startThen = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((startToday - startThen) / 86400000);
  }

  function formatDate(iso) {
    if (!iso) return t("timeUnknown");
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return t("timeUnknown");
    const locale = state.lang === "zh" ? "zh-CN" : "en-US";
    return new Intl.DateTimeFormat(locale, {
      month: state.lang === "zh" ? "long" : "short",
      day: "numeric",
    }).format(date);
  }

  function formatFullDate(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const locale = state.lang === "zh" ? "zh-CN" : "en-US";
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function timeAgo(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t("justNow");
    if (minutes < 60) return t("minutesAgo", minutes);
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("hoursAgo", hours);
    const days = Math.floor(hours / 24);
    if (days === 1) return t("yesterday");
    if (days < 7) return t("daysAgo", days);
    return formatDate(iso);
  }

  function siteHost(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (error) {
      return t("source");
    }
  }

  function categoryLabel(category) {
    return state.lang === "zh"
      ? CATEGORY_LABELS[category] || "AI"
      : CATEGORY_LABELS_EN[category] || "AI";
  }

  function localizedTitle(item) {
    return state.lang === "zh" ? item.title_zh || item.title : item.title;
  }

  function localizedSummary(item) {
    return state.lang === "zh" ? item.summary_zh || item.summary : item.summary;
  }

  function sourceNameFor(item) {
    return item.source || siteHost(item.site || item.url);
  }

  function filteredItems() {
    const query = state.query.trim().toLowerCase();
    const rangeDays = state.range === "all" ? Infinity : Number(state.range);
    const result = items.filter((item) => {
      if (state.category !== "all" && item.category !== state.category) return false;
      if (state.source !== "all" && item.source_id !== state.source) return false;
      if (state.savedOnly && !savedIds.has(item.id)) return false;
      if (dayDistance(item.published) > rangeDays) return false;
      if (query) {
        const haystack = [
          item.title,
          item.summary,
          item.title_zh,
          item.summary_zh,
          item.source,
          categoryLabel(item.category),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    return result.sort((a, b) => {
      const aTime = new Date(a.published || 0).getTime();
      const bTime = new Date(b.published || 0).getTime();
      return state.sort === "oldest" ? aTime - bTime : bTime - aTime;
    });
  }

  function renderCard(item) {
    const label = categoryLabel(item.category);
    const sourceName = sourceNameFor(item);
    const saved = savedIds.has(item.id);
    const localizedTitleText = localizedTitle(item);
    const localizedSummaryText = localizedSummary(item);
    const image = item.image
      ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(localizedTitleText)}" loading="lazy" referrerpolicy="no-referrer">`
      : `<div class="media-fallback"><span>${escapeHtml(sourceName.slice(0, 1).toUpperCase())}</span><strong>${escapeHtml(label)}</strong></div>`;
    const title = escapeHtml(localizedTitleText || t("untitled"));
    const summary = escapeHtml(localizedSummaryText || "");
    const url = escapeHtml(item.url || "#");
    const site = escapeHtml(item.site || item.url || "");

    return `
      <article class="news-card">
        <a class="card-media" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="${title}">
          ${image}
          <span class="category-badge">${label}</span>
        </a>
        <button class="save-btn${saved ? " saved" : ""}" data-save="${escapeHtml(item.id)}" aria-label="收藏" aria-pressed="${saved}">
          <i data-lucide="${saved ? "bookmark-check" : "bookmark"}"></i>
        </button>
        <div class="card-body">
          <div class="card-meta">
            <span class="source-name">${escapeHtml(sourceName)}</span>
            <span class="time-ago">${timeAgo(item.published)}</span>
          </div>
          <h3><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
          <p>${summary}</p>
          <div class="card-footer">
            <span>${formatDate(item.published)}</span>
            <a href="${site}" target="_blank" rel="noopener noreferrer">${siteHost(site)} <i data-lucide="arrow-up-right"></i></a>
          </div>
        </div>
      </article>
    `;
  }

  function renderGrid() {
    const grid = document.getElementById("news-grid");
    const empty = document.getElementById("empty-state");
    const emptyText = document.getElementById("empty-text");
    const count = document.getElementById("result-count");
    const result = filteredItems();

    if (result.length === 0) {
      grid.innerHTML = "";
      grid.hidden = true;
      empty.hidden = false;
      count.textContent = t("resultCount", 0);
      emptyText.textContent = state.query ? t("emptyQuery") : t("emptySaved");
      return;
    }

    grid.hidden = false;
    empty.hidden = true;
    grid.className = `news-grid view-${state.view}`;
    grid.innerHTML = result.map(renderCard).join("");
    grid.querySelectorAll(".card-media img").forEach((img) => {
      if (img.complete && img.naturalWidth === 0) {
        replaceBrokenImage(img);
      } else {
        img.addEventListener("error", () => replaceBrokenImage(img), { once: true });
      }
    });

    count.textContent = t("resultCount", result.length);
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function replaceBrokenImage(img) {
    const card = img.closest(".news-card");
    if (!card || !img.parentElement) return;
    const sourceName = card.querySelector(".source-name")?.textContent || "AI";
    const label = card.querySelector(".category-badge")?.textContent || "AI";
    const fallback = document.createElement("div");
    fallback.className = "media-fallback";
    fallback.innerHTML = `<span>${escapeHtml(sourceName.slice(0, 1).toUpperCase())}</span><strong>${escapeHtml(label)}</strong>`;
    img.replaceWith(fallback);
  }

  function renderStats() {
    const now = Date.now();
    const todayKey = localDayKey(new Date().toISOString());
    const todayCount = items.filter((item) => localDayKey(item.published) === todayKey).length;
    const sourceCount = new Set(items.map((item) => item.source_id || item.source)).size;
    const last24h = items.filter((item) => {
      const time = new Date(item.published || 0).getTime();
      return now - time <= 86400000;
    }).length;

    document.getElementById("stat-today").textContent = todayCount;
    document.getElementById("stat-sources").textContent = sourceCount;
    document.getElementById("stat-24h").textContent = last24h;
    document.getElementById("stat-updated").textContent = DATA.updated_label || "--";
  }

  function renderTicker() {
    const track = document.getElementById("ticker-track");
    const top = [...items]
      .sort((a, b) => new Date(b.published || 0).getTime() - new Date(a.published || 0).getTime())
      .slice(0, 8);
    const html = top
      .map((item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localizedTitle(item))}</a>`)
      .join("");
    track.innerHTML = html + html;
  }

  function renderSources() {
    const select = document.getElementById("source-select");
    select.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = t("allSources");
    select.appendChild(allOption);
    const seen = new Set();
    items.forEach((item) => {
      const id = item.source_id || item.source;
      if (seen.has(id)) return;
      seen.add(id);
      const option = document.createElement("option");
      option.value = id;
      option.textContent = item.source || siteHost(item.site);
      select.appendChild(option);
    });
    const available = [...select.options].some((option) => option.value === state.source);
    select.value = available ? state.source : "all";
    state.source = select.value;
  }

  function renderFooter() {
    document.getElementById("footer-updated").textContent = t("footerUpdated", DATA.updated_label || "--");
    const nav = document.getElementById("source-links");
    nav.innerHTML = "";
    const seen = new Set();
    items.forEach((item) => {
      const id = item.source_id || item.site;
      if (seen.has(id)) return;
      seen.add(id);
      const link = document.createElement("a");
      link.href = item.site || "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.source || siteHost(item.site);
      nav.appendChild(link);
    });
  }

  function renderMastheadDate() {
    const now = new Date();
    const locale = state.lang === "zh" ? "zh-CN" : "en-US";
    document.getElementById("date-label").textContent = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(now);
  }

  function applyLanguage() {
    const lang = state.lang;
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = t("siteName");
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
      element.setAttribute("aria-label", t(element.dataset.i18nAria));
    });
    document.querySelectorAll("[data-lang-option]").forEach((element) => {
      element.classList.toggle("active", element.dataset.langOption === lang);
    });
    renderSources();
    renderFooter();
    renderMastheadDate();
    renderTicker();
    renderGrid();
  }

  function renderTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const icon = document.querySelector("#theme-toggle i");
    if (icon) {
      icon.setAttribute("data-lucide", theme === "dark" ? "sun" : "moon");
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function bindEvents() {
    const search = document.getElementById("search-input");
    let timer = null;
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.query = search.value;
        renderGrid();
      }, 120);
    });

    document.querySelectorAll(".range-btn").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".range-btn").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        state.range = button.dataset.range;
        renderGrid();
      });
    });

    document.querySelectorAll(".chip").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".chip").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        state.category = button.dataset.category;
        renderGrid();
      });
    });

    document.querySelectorAll(".view-btn").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".view-btn").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        state.view = button.dataset.view;
        renderGrid();
      });
    });

    document.getElementById("source-select").addEventListener("change", (event) => {
      state.source = event.target.value;
      renderGrid();
    });

    document.getElementById("sort-select").addEventListener("change", (event) => {
      state.sort = event.target.value;
      renderGrid();
    });

    const savedToggle = document.getElementById("saved-toggle");
    savedToggle.addEventListener("click", () => {
      state.savedOnly = !state.savedOnly;
      savedToggle.classList.toggle("active", state.savedOnly);
      savedToggle.setAttribute("aria-pressed", String(state.savedOnly));
      renderGrid();
    });

    document.getElementById("news-grid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-save]");
      if (!button) return;
      const id = button.dataset.save;
      if (savedIds.has(id)) {
        savedIds.delete(id);
      } else {
        savedIds.add(id);
      }
      localStorage.setItem("ai-news-saved", JSON.stringify([...savedIds]));
      const saved = savedIds.has(id);
      button.classList.toggle("saved", saved);
      button.setAttribute("aria-pressed", String(saved));
      button.innerHTML = `<i data-lucide="${saved ? "bookmark-check" : "bookmark"}"></i>`;
      if (window.lucide) window.lucide.createIcons();
      if (state.savedOnly) renderGrid();
    });

    document.getElementById("theme-toggle").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem("ai-news-theme", next);
      renderTheme(next);
    });

    document.getElementById("lang-toggle").addEventListener("click", () => {
      state.lang = state.lang === "zh" ? "en" : "zh";
      localStorage.setItem("ai-news-lang", state.lang);
      applyLanguage();
    });
  }

  function init() {
    state.lang = localStorage.getItem("ai-news-lang") || "zh";
    const savedTheme = localStorage.getItem("ai-news-theme") || "light";
    renderTheme(savedTheme);
    applyLanguage();
    renderStats();
    bindEvents();
    if (window.lucide) window.lucide.createIcons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
