const svgNamespace = 'http://www.w3.org/2000/svg';
const iconShapes = {
  search: '<circle cx="10.75" cy="10.75" r="6.25"/><path d="m15.25 15.25 4.25 4.25"/>',
  translate: '<path d="M3 6h12M9 3v3m4 0c-1 5-4 8-9 10m2-7c1 3 3 5 6 7m1 4 4-10 4 10m-6.8-3h5.6"/>',
  rename: '<path d="M3.5 7h7m-7 0V5h5m-5 2v2m0 8h7m7-12v14m-3-14h6m-6 14h6"/>',
  sparkle: '<path d="M11 4c1 4.5 2.5 6 7 7-4.5 1-6 2.5-7 7-1-4.5-2.5-6-7-7 4.5-1 6-2.5 7-7Zm7 13h4m-2-2v4"/>',
  plugin: '<path d="M5 5h4V4a2 2 0 0 1 4 0v1h4v4h1a2 2 0 0 1 0 4h-1v5h-4v-1a2 2 0 0 0-4 0v1H5v-5h1a2 2 0 0 0 0-4H5Z"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  settings: '<path d="m9 4-.6 2.4-2.3 1-2.2-.6-1.4 2.5 1.6 1.7v2l-1.6 1.7 1.4 2.5 2.2-.6 2.3 1L9 20h3l.6-2.4 2.3-1 2.2.6 1.4-2.5-1.6-1.7v-2l1.6-1.7-1.4-2.5-2.2.6-2.3-1L12 4Z" transform="translate(1.5)"/><circle cx="12" cy="12" r="2.6"/>',
  sliders: '<path d="M4 7h4m4 0h8M4 17h8m4 0h4"/><circle cx="10" cy="7" r="2"/><circle cx="14" cy="17" r="2"/>',
  model: '<rect x="6" y="6" width="12" height="12" rx="3"/><rect x="10" y="10" width="4" height="4" rx="1"/><path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3"/>',
  pin: '<path d="m9 4 7 3-2 4 1 4-8-3 3-2-1-6Zm1 9-3 7"/>',
  power: '<path d="M12 3v8M7 5.7a8 8 0 1 0 10 0"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1.3"/><rect x="14" y="4" width="6" height="6" rx="1.3"/><rect x="4" y="14" width="6" height="6" rx="1.3"/><rect x="14" y="14" width="6" height="6" rx="1.3"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  document: '<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 0v5h5M9 12h6m-6 4h6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 4-4 3 3 4-5 5 5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  open: '<path d="M14 4h6v6m0-6-9 9m-1-7H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
  refresh: '<path d="M20 7v5h-5m5 0A8 8 0 1 0 18 17.3"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  save: '<path d="M5 4h12l3 3v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3 0v6h8V4M8 20v-6h8v6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/>',
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="m4 4 16 16M7 7.2a9 9 0 0 1 5-1.2c6 0 9.5 6 9.5 6a14 14 0 0 1-2.8 3.2M5 8.8A15 15 0 0 0 2.5 12s3.5 6 9.5 6a9 9 0 0 0 4.6-1.3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12m-8 4v5m4-5v5"/>',
  undo: '<path d="M9 5 4 10l5 5m-5-5h10a5 5 0 0 1 0 10h-2"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  pause: '<path d="M9 5v14m6-14v14"/>',
  pulse: '<path d="M3 12h4l3-6 4 12 3-6h4"/>'
};

function createIcon(name) {
  const icon = document.createElementNS(svgNamespace, 'svg');
  icon.setAttribute('class', 'ui-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.8');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.innerHTML = iconShapes[name];
  return icon;
}

function setIconLabel(element, name, label) {
  element.classList.add('icon-label');
  element.replaceChildren(createIcon(name), label);
}

for (const element of document.querySelectorAll('[data-icon]')) {
  const label = element.textContent.trim();
  if (label) setIconLabel(element, element.dataset.icon, label);
  else element.replaceChildren(createIcon(element.dataset.icon));
}
