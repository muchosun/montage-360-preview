(() => {
  "use strict";
  const config = window.M360_LEAD_CONFIG;
  const section = document.querySelector("#lead");
  const form = document.querySelector("#lead-form");
  if (!window.crypto || !crypto.subtle || typeof crypto.randomUUID !== "function") return;
  if (!config || !config.enabled || !section || !form || location.protocol !== "https:" || location.hostname !== "montazh360.ru") return;
  let endpoint, privacy;
  try {
    endpoint = new URL(config.endpoint);
    privacy = new URL(config.privacyUrl);
    if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".apigw.yandexcloud.net") || endpoint.pathname !== "/leads" || endpoint.search || endpoint.hash || endpoint.username || endpoint.password ||
        privacy.origin !== "https://montazh360.ru" || privacy.username || privacy.password || !config.consentVersion) return;
  } catch { return; }
  const button = form.querySelector('[type="submit"]');
  const status = document.querySelector("#lead-status");
  const errorBox = document.querySelector("#lead-error");
  const consentLink = form.querySelector("[data-privacy-link]");
  const contact = form.elements.namedItem("contact");
  const type = form.elements.namedItem("contact_type");
  let sending = false, accepted = false;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const pendingKey = "m360_pending_lead_v1";
  const acceptedKey = "m360_accepted_leads_v1";
  const seen = new Set();
  try { for (const id of JSON.parse(sessionStorage.getItem(acceptedKey) || "[]")) if (uuid.test(id)) seen.add(id); } catch { /* Optional browser storage. */ }
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem(pendingKey) || "null"); } catch { /* No personal fields are stored. */ }

  function clearErrors() {
    errorBox.hidden = true;
    for (const error of form.querySelectorAll(".field-error")) { error.textContent = ""; error.hidden = true; }
    for (const field of form.elements) field.removeAttribute("aria-invalid");
  }
  function showErrors(errors) {
    let first;
    for (const [key, message] of Object.entries(errors)) {
      const field = form.elements.namedItem(key);
      const error = document.getElementById("lead-error-" + key);
      if (field && error) {
        field.setAttribute("aria-invalid", "true");
        error.textContent = message;
        error.hidden = false;
        first = first || field;
      }
    }
    if (first) first.focus();
  }
  function clearField(field) {
    if (!field || !field.name) return;
    field.removeAttribute("aria-invalid");
    const error = document.getElementById("lead-error-" + field.name);
    if (error) { error.hidden = true; error.textContent = ""; }
    errorBox.hidden = true;
  }
  function busy(value) {
    form.setAttribute("aria-busy", String(value));
    for (const field of form.elements) field.disabled = value;
  }
  form.addEventListener("input", event => clearField(event.target));
  form.addEventListener("change", event => clearField(event.target));
  function contactMode() {
    clearField(contact);
    contact.type = type.value === "email" ? "email" : type.value === "phone" ? "tel" : "text";
    contact.inputMode = type.value === "phone" ? "tel" : type.value === "email" ? "email" : "text";
    contact.autocomplete = type.value === "phone" ? "tel" : type.value === "email" ? "email" : "username";
    document.querySelector("#contact-hint").textContent = type.value === "phone" ? "Например, +7 900 000-00-00" : type.value === "email" ? "Адрес, на который можно ответить" : "Имя пользователя, например @username";
  }
  type.addEventListener("change", contactMode);
  contactMode();
  consentLink.href = privacy.href;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (sending || accepted) return;
    clearErrors();
    const errors = {};
    for (const field of form.elements) {
      if (field.willValidate && !field.validity.valid) errors[field.name] = field.validity.valueMissing ? "Заполните поле." : "Проверьте значение.";
    }
    if (!form.elements.namedItem("consent").checked) errors.consent = "Для ответа на заявку нужно ваше согласие.";
    if (type.value === "phone" && !/^\d{10,15}$/.test(contact.value.replace(/[\s()+-]/g, ""))) errors.contact = "Укажите телефон с кодом страны.";
    if (type.value === "telegram" && !/^[A-Za-z0-9_]{5,32}$/.test(contact.value.replace(/^https:\/\/t\.me\//, "").replace(/^@/, ""))) errors.contact = "Проверьте имя пользователя Telegram.";
    if (Object.keys(errors).length) { showErrors(errors); return; }
    const value = name => form.elements.namedItem(name).value.trim();
    const data = {venue:value("venue"),city:value("city"),activity:value("activity"),cameras:value("cameras"),contact_type:type.value,contact:contact.value.trim(),flow:value("flow") === "" ? null : Number(value("flow")),comment:value("comment"),consent:true,consent_version:config.consentVersion,attribution:window.M360Attribution ? window.M360Attribution.get() : {}};
    sending = true; busy(true); button.textContent = "Отправляем…"; status.textContent = "Ждём подтверждение приёма заявки.";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const body = JSON.stringify(data);
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
      const fingerprint = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,"0")).join("");
      if (!pending || !uuid.test(pending.key) || pending.fingerprint !== fingerprint) pending = {key:crypto.randomUUID(),fingerprint};
      try { sessionStorage.setItem(pendingKey, JSON.stringify(pending)); } catch { /* Retry still works within this page. */ }
      const response = await fetch(endpoint.href, {method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":pending.key},body,signal:controller.signal,credentials:"omit",referrerPolicy:"no-referrer"});
      const result = await response.json();
      if (!response.ok || result.ok !== true || !uuid.test(result.id || "")) {
        if (response.status === 422 && result.errors) { busy(false); showErrors(result.errors); }
        if (response.status === 409) { pending = null; try { sessionStorage.removeItem(pendingKey); } catch {} }
        throw new Error(response.status === 429 ? "limit" : "unconfirmed");
      }
      accepted = true;
      status.textContent = "Заявка принята. Номер: " + result.id + ". Свяжемся с вами по указанному контакту.";
      button.textContent = "Заявка принята";
      // Only a confirmed persisted ID reaches this path. Contact clicks never do.
      if (!seen.has(result.id)) {
        seen.add(result.id);
        try { sessionStorage.setItem(acceptedKey, JSON.stringify([...seen].slice(-20))); sessionStorage.removeItem(pendingKey); } catch {}
        const id = Number(window.M360_ANALYTICS && window.M360_ANALYTICS.counterId);
        if (window.M360_ANALYTICS_READY && id > 0 && typeof window.ym === "function") {
          try { window.ym(id,"reachGoal","lead_form_success"); } catch { /* The saved request remains successful if analytics is blocked. */ }
        }
      }
      for (const field of form.elements) field.disabled = true;
    } catch (error) {
      busy(false);
      status.textContent = "";
      errorBox.textContent = error.message === "limit" ? "Слишком много попыток. Повторите через 10 минут или позвоните Александру." : "Не получили подтверждение приёма. Попробуйте ещё раз — повтор той же заявки не создаст дубль. Можно также позвонить Александру.";
      errorBox.hidden = false;
      button.textContent = "Повторить отправку";
      button.disabled = false;
    } finally { clearTimeout(timeout); sending = false; form.setAttribute("aria-busy", "false"); }
  });
  section.hidden = false;
  document.querySelectorAll("[data-lead-cta]").forEach(link => { link.href = "#lead"; link.textContent = "Получить расчёт для площадки"; });
})();
