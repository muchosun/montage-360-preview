(() => {
  "use strict";
  const links = [...document.querySelectorAll("[data-example]")];
  const dialog = document.querySelector("#example-viewer");
  if (!links.length || !dialog || typeof dialog.showModal !== "function") return;
  const video = dialog.querySelector("video");
  const media = dialog.querySelector(".viewer-media");
  const title = dialog.querySelector("#example-viewer-title");
  const note = dialog.querySelector(".viewer-note");
  const counter = dialog.querySelector(".viewer-counter");
  const error = dialog.querySelector(".viewer-error");
  let index = 0;
  let revision = 0;
  let previousOverflow = "";

  function load(nextIndex) {
    index = (nextIndex + links.length) % links.length;
    const link = links[index];
    const token = ++revision;
    video.pause();
    video.hidden = false;
    error.hidden = true;
    media.hidden = false;
    media.style.setProperty("--viewer-ratio", Number(link.dataset.width) / Number(link.dataset.height));
    title.textContent = link.dataset.title;
    video.setAttribute("aria-label", link.dataset.title + ", без звука");
    note.textContent = link.dataset.duration + " · без звука · полный кадр";
    counter.textContent = (index + 1) + " / " + links.length;
    video.poster = link.dataset.poster;
    video.preload = "metadata";
    video.muted = true;
    video.src = link.href;
    video.load();
    const playback = video.play();
    if (playback) playback.catch(() => {
      if (token === revision && dialog.open && !video.error) {
        note.textContent = link.dataset.duration + " · без звука. Нажмите ▶ для просмотра.";
      }
    });
  }

  links.forEach((link, itemIndex) => {
    link.addEventListener("click", event => {
      // Preserve normal open-in-new-tab and copy-link browser behavior.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      previousOverflow = document.body.style.overflow;
      dialog.showModal();
      document.body.style.overflow = "hidden";
      load(itemIndex);
    });
  });
  dialog.querySelector(".viewer-close").addEventListener("click", () => dialog.close());
  dialog.querySelector(".viewer-prev").addEventListener("click", () => load(index - 1));
  dialog.querySelector(".viewer-next").addEventListener("click", () => load(index + 1));
  dialog.querySelector(".viewer-retry").addEventListener("click", () => load(index));
  dialog.addEventListener("click", event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  dialog.addEventListener("close", () => {
    revision += 1;
    video.pause();
    video.removeAttribute("src");
    video.removeAttribute("poster");
    video.preload = "none";
    video.load();
    document.body.style.overflow = previousOverflow;
  });
  video.addEventListener("error", () => {
    if (!video.hasAttribute("src") || !dialog.open) return;
    video.pause();
    video.hidden = true;
    media.hidden = true;
    error.hidden = false;
  });
  video.addEventListener("loadedmetadata", () => {
    video.hidden = false;
    media.hidden = false;
    error.hidden = true;
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) video.pause(); });
})();
