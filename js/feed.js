// ===== 게시물 데이터 =====
// 나중에 진짜 사진을 쓰려면 img 에 경로를 넣으세요. 예: img: 'images/01.jpg'
const posts = [
  { label: '[셀카]',       color: '#D6D4D0', caption: 'blue hour',           date: '2026.10.27', img: '' },
  { label: '[손 클로즈업]', color: '#E6E2DC', caption: 'stars on the ground', date: '2026.10.25', img: '' },
  { label: '[바닥]',       color: '#BDBAB4', caption: 'concrete',            date: '2026.10.24', img: '' },
  { label: '[소품]',       color: '#CFCBC4', caption: 'my pocket',           date: '2026.10.21', img: '' },
  { label: '[머그잔]',     color: '#E9E7E3', caption: 'lemon tea',           date: '2026.10.18', img: '' },
  { label: '[얼굴 옆선]',   color: '#DCD6CE', caption: 'tired, cute',         date: '2026.10.15', img: '' },
  { label: '[꽃]',         color: '#C8C6C1', caption: 'small flowers',       date: '2026.10.11', img: '' },
  { label: '[신발]',       color: '#EDEBE7', caption: 'white sandals',       date: '2026.10.07', img: '' },
  { label: '[빵]',         color: '#D9D2C7', caption: 'salt bread',          date: '2026.10.02', img: '' }
];

// 그리드에서 비워 둘 칸 번호 (0부터 셈)
const emptySlots = [1, 5, 6];

const feed = document.getElementById('feed');
const tabs = document.querySelectorAll('.tab');
document.getElementById('post-count').textContent = posts.length;

// 01, 02 ... 처럼 두 자리 번호
function pad(n) {
  return String(n).padStart(2, '0');
}

// 사진 칸 하나 만들기 (사진이 있으면 이미지, 없으면 색 블록)
function photoBox(post) {
  const box = document.createElement('div');
  box.className = 'ph';
  box.style.background = post.color;
  if (post.img) {
    const img = document.createElement('img');
    img.src = post.img;
    img.alt = post.caption;
    box.appendChild(img);
  } else {
    box.textContent = post.label;
  }
  return box;
}

// 게시물 칸을 감싸는 링크 (누르면 상세 페이지로)
function linkTo(child) {
  const a = document.createElement('a');
  a.href = 'post.html';
  a.style.textDecoration = 'none';
  a.style.color = 'inherit';
  a.appendChild(child);
  return a;
}

function renderGrid() {
  const grid = document.createElement('div');
  grid.className = 'view-grid';
  const total = posts.length + emptySlots.length;
  let k = 0;
  for (let i = 0; i < total; i++) {
    if (emptySlots.includes(i)) {
      const empty = document.createElement('div');
      empty.className = 'ph empty';
      grid.appendChild(empty);
    } else {
      grid.appendChild(linkTo(photoBox(posts[k])));
      k++;
    }
  }
  return grid;
}

function renderNum() {
  const wrap = document.createElement('div');
  wrap.className = 'view-num';
  posts.forEach((post, i) => {
    const fig = document.createElement('figure');
    const num = document.createElement('span');
    num.textContent = `(${pad(i + 1)})`;
    const cap = document.createElement('figcaption');
    cap.textContent = post.caption;
    fig.append(num, photoBox(post), cap);
    wrap.appendChild(linkTo(fig));
  });
  return wrap;
}

function renderStrip() {
  const wrap = document.createElement('div');
  wrap.className = 'view-strip';
  posts.forEach((post, i) => {
    const row = document.createElement('a');
    row.className = 'strip-row';
    row.href = 'post.html';
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = pad(i + 1);
    const text = document.createElement('div');
    text.innerHTML = `<span></span><span class="date"></span>`;
    text.children[0].textContent = post.caption;
    text.children[1].textContent = post.date;
    row.append(num, photoBox(post), text);
    wrap.appendChild(row);
  });
  return wrap;
}

function show(mode) {
  feed.innerHTML = '';
  if (mode === 'grid') feed.appendChild(renderGrid());
  if (mode === 'num') feed.appendChild(renderNum());
  if (mode === 'strip') feed.appendChild(renderStrip());

  tabs.forEach((tab) => {
    const on = tab.dataset.mode === mode;
    tab.classList.toggle('on', on);
    tab.setAttribute('aria-pressed', on);
  });
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => show(tab.dataset.mode));
});

show('grid');
