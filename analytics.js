(() => {
  "use strict";
  // Previews, the guest page and HTTP never load a counter or store attribution.
  if (location.protocol !== "https:" || location.hostname !== "montazh360.ru" ||
      !["/", "/index.html"].includes(location.pathname) || window.M360_ANALYTICS_READY) return;
  window.M360_ANALYTICS_READY = true;

  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  const storageKey = "m360_attribution_v1";
  let attribution = {};
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
    for (const key of keys) {
      if (typeof saved[key] === "string") attribution[key] = saved[key].slice(0, 200);
    }
  } catch { /* Private browsing and unavailable storage do not block the page. */ }
  const query = new URLSearchParams(location.search);
  if (keys.some(key => query.has(key))) {
    attribution = {};
    for (const key of keys) {
      const value = query.get(key);
      if (value) attribution[key] = value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200);
    }
    try { sessionStorage.setItem(storageKey, JSON.stringify(attribution)); } catch { /* Optional storage. */ }
  }
  // The form reads this before submission. Only its confirmed saved-ID path
  // can emit lead_form_success; this bootstrap tracks contact clicks separately.
  window.M360Attribution = Object.freeze({ get: () => ({ ...attribution }) });

  const rawId = window.M360_ANALYTICS && window.M360_ANALYTICS.counterId;
  if (!/^[1-9]\d{0,11}$/.test(String(rawId))) return;
  const id = Number(rawId);
  window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
  window.ym.l = window.ym.l || Date.now();
  const library = "https://mc.yandex.ru/metrika/tag.js";
  if (![...document.scripts].some(script => script.src === library)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = library;
    document.head.appendChild(script);
  }
  const send = (...args) => { try { window.ym(...args); } catch { /* A blocker must not break contacts. */ } };
  send(id, "init", { webvisor: false, clickmap: false, trackLinks: false, accurateTrackBounce: true });
  document.addEventListener("click", event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target && typeof event.target.closest === "function" ? event.target.closest("a[href]") : null;
    if (!link) return;
    const url = new URL(link.href);
    const channel = url.protocol === "tel:" ? "phone" :
      url.hostname === "t.me" ? "telegram" : url.hostname === "max.ru" ? "max" : null;
    if (channel) send(id, "reachGoal", "contact_click", { channel });
  });
})();
