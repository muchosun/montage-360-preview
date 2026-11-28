(() => {
  "use strict";
  const viewer = document.querySelector("#example-viewer");
  if (!viewer || typeof viewer.showModal !== "function") return;
  document.querySelectorAll("[data-preview-id]").forEach(preview => {
    const card = document.getElementById(preview.dataset.previewId);
    const target = card && card.querySelector("[data-example]");
    if (!target) return;
    preview.addEventListener("click", event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      target.click();
    });
  });
})();
