// ===== 꾸미기 화면 =====
const frameButtons = document.querySelectorAll('#frames button');
const frames = document.querySelectorAll('.preview .frame');
const swatches = document.querySelectorAll('#swatches .swatch');
const captionInput = document.getElementById('cap');
const captionOuts = document.querySelectorAll('.caption-out');
const toneBoxes = document.querySelectorAll('.tone');

// 1) 프레임 바꾸기
function pickFrame(name) {
  frames.forEach((f) => { f.hidden = f.dataset.frame !== name; });
  frameButtons.forEach((b) => {
    const on = b.dataset.frame === name;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
}
frameButtons.forEach((b) => b.addEventListener('click', () => pickFrame(b.dataset.frame)));

// 2) 캡션을 입력하면 미리보기에 바로 반영
function updateCaption() {
  captionOuts.forEach((el) => { el.textContent = captionInput.value; });
}
captionInput.addEventListener('input', updateCaption);

// 3) 톤(사진 자리 색) 바꾸기
function pickTone(color) {
  toneBoxes.forEach((box) => { box.style.background = color; });
  swatches.forEach((s) => {
    const on = s.dataset.color === color;
    s.classList.toggle('on', on);
    s.setAttribute('aria-pressed', on);
  });
}
swatches.forEach((s) => s.addEventListener('click', () => pickTone(s.dataset.color)));

// 4) 텍스트 스탬프: 누르면 캡션 뒤에 붙이기 ("날짜"는 오늘 날짜로)
document.querySelectorAll('#stamps button').forEach((b) => {
  b.addEventListener('click', () => {
    let text = b.textContent;
    if (text === '날짜') {
      const d = new Date();
      text = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    }
    captionInput.value = (captionInput.value + ' ' + text).trim();
    updateCaption();
  });
});

// 처음 상태
pickFrame('grid');
pickTone('#D6D4D0');
updateCaption();
