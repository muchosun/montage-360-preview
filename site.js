(() => {
  "use strict";
  const max = window.M360_CONTACTS && window.M360_CONTACTS.max;
  if (typeof max === "string" && max) {
    try {
      const url = new URL(max);
      if (url.protocol === "https:" && url.hostname === "max.ru" && !url.username && !url.password && url.pathname.length > 1) {
        document.querySelectorAll('[data-contact="max"]').forEach(link => {
          link.href = url.href;
          link.hidden = false;
        });
      }
    } catch { /* An unavailable or invalid contact stays hidden. */ }
  }
  const video = document.querySelector("#demo-video");
  const fallback = document.querySelector("#demo-error");
  if (video && fallback) {
    const showError = () => { video.hidden = true; fallback.hidden = false; };
    video.addEventListener("error", showError);
    video.addEventListener("loadedmetadata", () => { video.hidden = false; fallback.hidden = true; });
    if (video.error) showError();
  }
  const calculation = document.querySelector("#economics-details");
  if (calculation) {
    document.querySelectorAll('a[href="#economics-details"]').forEach(link => {
      link.addEventListener("click", () => { calculation.open = true; });
    });
    const expandCalculation = () => { if (location.hash === "#economics-details") calculation.open = true; };
    window.addEventListener("hashchange", expandCalculation);
    expandCalculation();
  }
})();
