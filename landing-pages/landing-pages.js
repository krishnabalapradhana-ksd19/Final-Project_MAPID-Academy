(function () {
  const mapHolder = document.getElementById('map-holder');
  const readout = document.getElementById('readout');
  const roName  = document.getElementById('ro-name');
  const roStat  = document.getElementById('ro-stat');
  const roNote  = document.getElementById('ro-note');
  const metaSel = document.getElementById('meta-sel');

  function activate(el, group, regions) {
    group.classList.add('dimmed');
    regions.forEach(r => r.classList.toggle('is-active', r === el));
    roName.textContent = el.dataset.name;
    roStat.textContent = el.dataset.luas;
    roNote.textContent = el.dataset.stat;
    readout.classList.add('show');
    metaSel.textContent = el.dataset.name;
  }

  function clear(group, regions) {
    group.classList.remove('dimmed');
    regions.forEach(r => r.classList.remove('is-active'));
    readout.classList.remove('show');
    roName.textContent = 'Pilih wilayah';
    roStat.textContent = '5 kabupaten / kota';
    roNote.textContent = 'arahkan kursor atau ketuk peta';
    metaSel.textContent = 'Pilih wilayah';
  }

  fetch('../src/prov-diy-assets/diy-wilayah.svg')
    .then(res => res.text())
    .then(svgMarkup => {
      mapHolder.innerHTML = svgMarkup;

      const svg     = mapHolder.querySelector('svg.map');
      const group   = mapHolder.querySelector('#regions');
      const regions = mapHolder.querySelectorAll('.region');

      regions.forEach(el => {
        el.addEventListener('mouseenter', () => activate(el, group, regions));
        el.addEventListener('focus',      () => activate(el, group, regions));
        el.addEventListener('blur',       () => clear(group, regions));
        el.addEventListener('click',      () => activate(el, group, regions));
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(el, group, regions); }
        });
      });

      svg.addEventListener('mouseleave', () => clear(group, regions));
    });
})();
