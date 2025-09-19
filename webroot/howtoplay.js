const slide = document.getElementById('slide');
const btn = document.getElementById('nextBtn');
const slides = ['howtoplay1.png','howtoplay2.png'];
let idx = 0;

function show(i){
  slide.src = slides[i];
  slide.alt = `How to play step ${i+1}`;
}

btn.addEventListener('click', ()=>{
  idx = (idx + 1) % slides.length;
  show(idx);
});

// Allow right arrow key
window.addEventListener('keydown',(e)=>{
  if(e.key === 'ArrowRight') btn.click();
});