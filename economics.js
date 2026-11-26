(() => {
  "use strict";
  const section = document.querySelector(".sales-economics");
  if (!section) return;
  const price = Number(section.dataset.price);
  const days = Number(section.dataset.days);
  const share = Number(section.dataset.share);
  const buttons = [...section.querySelectorAll("[data-orders]")];
  if (![price, days, share].every(Number.isFinite) || price <= 0 || days <= 0 || share <= 0 || share > .7) return;
  const money = amount => Math.round(amount).toLocaleString("ru-RU");
  function select(button) {
    const orders = Number(button.dataset.orders);
    if (!Number.isInteger(orders) || orders <= 0) return;
    const total = orders * days * price;
    section.querySelector("[data-order-count]").textContent = orders;
    section.querySelector("[data-venue-revenue]").textContent = money(total * share);
    section.querySelector("[data-total-revenue]").textContent = money(total) + " ₽";
    buttons.forEach(item => {
      const selected = item === button;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
  }
  buttons.forEach(button => {
    button.disabled = false;
    const orders = Number(button.dataset.orders);
    button.setAttribute("aria-label", `${orders} оплаченных роликов в день: ${money(orders * days * price * share)} рублей площадке за месяц до её расходов`);
    button.addEventListener("click", () => select(button));
  });
})();
