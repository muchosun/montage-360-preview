(() => {
  "use strict";
  const frames = document.querySelector('#track-frames');
  const buttons = [...document.querySelectorAll('[data-view-choice]')];
  if (!frames || !buttons.length) return;
  const select = button => {
    frames.dataset.view = button.dataset.viewChoice;
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  };
  buttons.forEach((button,index) => {
    button.addEventListener('click',()=>select(button));
    button.addEventListener('keydown',event=>{
      let next;
      if(event.key==='ArrowRight') next=(index+1)%buttons.length;
      if(event.key==='ArrowLeft') next=(index+buttons.length-1)%buttons.length;
      if(event.key==='Home') next=0;
      if(event.key==='End') next=buttons.length-1;
      if(next!==undefined){event.preventDefault();buttons[next].focus();select(buttons[next]);}
    });
  });
})();
