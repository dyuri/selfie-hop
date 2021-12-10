import { histogramBorders, transformHistogram } from './colorutils.js';

let streaming = false;

const PREVIEW_CONFIG = {
  internalResolution: 'low',
  segmentationThreshold: 0.7,
  maxDetections: 3,
  scoreThreshold: 0.5,
  nmsRadius: 20,
  scaleFactor: 0.8,
  flipHorizontal: false,
  internalScaling: 0.5,
  toneMapping: false,
  useTmpContext: false
};

const SNAPSHOT_CONFIG = {
  internalResolution: 'high',
  segmentationThreshold: 0.7,
  maxDetections: 5,
  scoreThreshold: 0.5,
  nmsRadius: 20,
  scaleFactor: 0.8,
  flipHorizontal: false,
  internalScaling: 0.5,
  toneMapping: true,
  useTmpContext: true
};

const NET_CONFIG_MOBILE = {
  architecture: 'MobileNetV1',
  outputStride: 16,
  multiplier: 0.75,
  quantBytes: 2,
  modelUrl: './model/model-stride16.json'
};

const NET_CONFIG_PRO = {
  architecture: 'ResNet50',
  outputStride: 32,
  quantBytes: 4
};

const DEFAULT_CONFIG = {
  spTop: 0,
  spLeft: 0,
  spWidth: 1,
  width: 800,
  maskBlur: 3,
  bgBlur: 1,
  previewConfig: PREVIEW_CONFIG,
  snapshotConfig: SNAPSHOT_CONFIG,
  netConfig: NET_CONFIG_MOBILE,
  flip: false,
  timer: 0,
  multisnap: 0,
  snapdelay: 200,
  toneMapping: false // disabled because it's currently bad
};

const PRO_CONFIG = Object.assign({}, DEFAULT_CONFIG, {
  bgBlur: 0,
  netConfig: NET_CONFIG_PRO,
});

const CONFIGS = {
  default: DEFAULT_CONFIG,
  pro: PRO_CONFIG
};

const CONFIG_PANEL = {
  bgBlur: {
    type: 'range',
    label: 'Background blur',
    min: 0,
    max: 5,
    step: 1
  },
  timer: {
    type: 'number',
    label: 'Timer',
    min: 0,
    max: 20
  },
  maskBlur: {
    type: 'range',
    label: 'Mask blur',
    min: 0,
    max: 10,
    step: 1
  },
  toneMapping: {
    type: 'checkbox',
    label: 'Tone mapping'
  },
  flip: {
    type: 'checkbox',
    label: 'Flip webcam'
  },
  spTop: {
    type: 'range',
    label: 'Selfie position top',
    min: 0,
    max: 1,
    step: 0.002,
  },
  spLeft: {
    type: 'range',
    label: 'Selfie position left',
    min: 0,
    max: 1,
    step: 0.002,
  },
  spWidth: {
    type: 'range',
    label: 'Selfie position width',
    min: 0,
    max: 1,
    step: 0.002,
  },
  multisnap: {
    type: 'number',
    label: 'Multisnap',
    min: 0,
    max: 6
  },
  snapdelay: {
    type: 'number',
    label: 'Snapshot delay',
    min: 100,
    max: 1000,
    step: 100
  }
};

async function sleep(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

async function detectFace(c, target, segConfig) {
  let source = c.webcam;

  if (segConfig.useTmpContext) {
    // create temporary canvas for segmentation
    source = document.createElement('canvas');
    source.width = c.width;
    source.height = c.width;
    source.getContext('2d').drawImage(c.webcam, 0, 0, c.width, c.width);
  }

  const segmentation = await c.net.segmentPerson(source, segConfig); // TODO multiple faces ?

  const bgmask = window.bodyPix.toMask(segmentation, { r: 0, g: 0, b: 0, a: 255 }, { r: 0, g: 0, b: 0, a: 0 });

  if (!c.maskcanvas) {
    c.maskcanvas = document.createElement('canvas');
    c.maskcanvas.width = segmentation.width;
    c.maskcanvas.height = segmentation.height;
  }
  if (!c.maskctx) {
    c.maskctx = c.maskcanvas.getContext('2d');
  }

  c.maskctx.putImageData(bgmask, 0, 0);

  const ctx = target.getContext('2d');

  const spTop = c.spTop * c.width;
  const spLeft = c.spLeft * c.width;
  const spWidth = c.spWidth * c.width;

  if (c.flip) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(source, spLeft, spTop, spWidth, spWidth);
  ctx.filter = `blur(${c.maskBlur || 2}px)`;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(c.maskcanvas, spLeft, spTop, spWidth, spWidth);

  // flip back
  if (c.flip) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }

  // TODO
  if (segConfig.toneMapping && c.toneMapping) {
    const imgData = ctx.getImageData(0, 0, c.width, c.width);
    const wcHistBorders = histogramBorders(imgData);
    const bgHistBorders = histogramBorders(c.bgCanvas.getContext('2d').getImageData(0, 0, c.width, c.width));
    // green adjustment
    bgHistBorders.g = { min: (wcHistBorders.g.min + bgHistBorders.g.min) / 2, max: (wcHistBorders.g.max + bgHistBorders.g.max) / 2 };

    ctx.putImageData(transformHistogram(imgData, wcHistBorders, bgHistBorders), 0, 0);
  }

  if (c.bgBlur) {
    ctx.filter = `blur(${c.bgBlur}px)`;
  } else {
    ctx.filter = 'none';
  }
  ctx.globalCompositeOperation = 'destination-over';
  ctx.drawImage(c.bgCanvas, 0, 0, c.width, c.width);

  // reset
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';
}

function previewWCLoop(c) {
  if (streaming) {
    detectFace(c, c.preview, c.previewConfig);
  }
  setTimeout(previewWCLoop, 1000 / 30, c);
}

function showTimer(c) {
  if (!c.timerOverlay) {
    c.timerOverlay = document.querySelector('#timer');
    if (!c.timerOverlay) {
      c.timerOverlay = document.createElement('div');
      c.timerOverlay.id = 'timer';
      document.body.appendChild(c.timerOverlay);
    }
  }
  c.timerOverlay.innerHTML = `${c.timer}`;
  document.body.classList.add('timer');
}

function hideTimer(c) {
  if (c.timerOverlay) {
    c.timerOverlay.innerHTML = '';
  }
  document.body.classList.remove('timer');
}

function updateTimer(c, i) {
  if (c.timerOverlay) {
    c.timerOverlay.innerHTML = `${i}`;
  }
}

async function takeSnapshot(c) {
  // close config panel
  c.configPanel?.classList.remove('active');
  if (c.timer) {
    showTimer(c);
    for (let i = +c.timer - 1; i >= 0; i--) {
      await sleep(1000);
      updateTimer(c, i);
    }
    hideTimer(c);
  }
  if (!c.multisnap || +c.multisnap < 2) {
    await detectFace(c, c.snapshot, c.snapshotConfig);
    document.body.classList.add('snapshot');
  } else {
    document.body.classList.add('multisnap');
    let mscont = document.querySelector('#multisnap');
    if (mscont) {
      mscont.innerHTML = '';
      mscont.setAttribute('multi', c.multisnap);
      for (let i = c.multisnap; i >= 1; i--) {
        const snap = document.createElement('canvas');
        snap.width = c.width;
        snap.height = c.width;
        await detectFace(c, snap, c.snapshotConfig);
        mscont.appendChild(snap);
        if (i > 1) {
          await sleep(c.snapdelay);
        }
      }
    }
  }
}

function saveSnapshot(target) {
  const data = target.toDataURL('image/png');
  const now = new Date();
  const filename = `selfiehop-${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}.png`;
  const a = document.createElement('a');
  a.href = data;
  a.download = filename;
  a.click();
}

function webcamStartup(c) {
  if (!c.webcam) {
    // create video element for webcam
    c.webcam = document.createElement('video');
  }

  if (!c.preview) {
    // create canvas element for webcam
    c.preview = document.createElement('canvas');
  }

  c.wcctx = c.wcctx || c.preview.getContext('2d');

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({
      video: { aspectRatio: 1 },
      audio: false
    }).then(function(stream) {
      c.webcam.srcObject = stream;
      c.webcam.play();
    });
  } else {
    // TODO
    alert("No webcam support detected!");
  }

  c.webcam.addEventListener('canplay', () => {
    if (!streaming) {
      c.webcam.setAttribute('width', c.width);
      c.webcam.setAttribute('height', c.width);
      c.preview.setAttribute('width', c.width);
      c.preview.setAttribute('height', c.width);

      streaming = true;
    }
  }, false);
}

function getDefaultConfig() {
  const storedConfig = localStorage.getItem('config');
  if (window.location.search.indexOf('config') > -1) {
    const config = window.location.search.split('config=')[1];
    if (config in CONFIGS) {
      document.querySelector('h1').innerText += ` (${config})`;
      return CONFIGS[config];
    }
  } else if (storedConfig) {
    return JSON.parse(storedConfig);
  }
  return CONFIGS.default;
}

function updateConfigPanel(config) {
  let panel = document.querySelector('.config__panel');

  if (!panel) {
    panel = document.createElement('div');
    panel.classList.add('config__panel');
    config.configPanel.appendChild(panel);

    Object.entries(CONFIG_PANEL).forEach(cfgitem => {
      const key = cfgitem[0];
      const cnf = cfgitem[1];
      const el = document.createElement('div');
      el.classList.add('config__panel__item');
      el.innerHTML = `
      <label for="config-${key}">${cnf.label || key}</label>
      <input
        id="config-${key}"
        type="${cnf.type || 'text'}"
        name="${key}"
        value="${config[key]}"
        ${cnf.type === 'checkbox' && config[key] ? 'checked' : ''}
        ${(cnf.min || cnf.min === 0) ? `min="${cnf.min}"` : ''}
        ${cnf.max ? `max="${cnf.max}"` : ''}
        ${cnf.step ? `step="${cnf.step}"` : ''}
      >`;
      panel.appendChild(el);

      panel.addEventListener('change', e => {
        // TODO support dotted path ?
        if (e.target.type === 'checkbox') {
          config[e.target.name] = e.target.checked;
        } else {
          config[e.target.name] = e.target.value;
        }
      });
    });
  }

  Object.entries(CONFIG_PANEL).forEach(cfgitem => {
    const key = cfgitem[0];
    const cnf = cfgitem[1];
    const el = document.querySelector(`#config-${key}`);
    if (el) {
      if (cnf.type === 'checkbox') {
        el.checked = config[key];
      } else {
        el.value = config[key];
      }
    }
  });

}

function saveConfig(config) {
  const cfg = {};

  Object.keys(config).forEach(key => {
    if (key in DEFAULT_CONFIG) {
      cfg[key] = config[key];
    }
  });
  localStorage.setItem('config', JSON.stringify(cfg));
}

function resetConfig(config) {
  Object.keys(config).forEach(key => {
    if (key in DEFAULT_CONFIG) {
      config[key] = DEFAULT_CONFIG[key];
    }
  });
  updateConfigPanel(config);
}

export async function init(config) {
  const defaultConfig = getDefaultConfig();
  config.width = config.width || defaultConfig.width;
  config.height = config.height || config.width;

  Object.entries(defaultConfig).forEach(([key, value]) => {
    if (!config[key]) {
      config[key] = value;
    }
  });

  document.body.setAttribute("initializing", "");

  webcamStartup(config);

  config.net = await window.bodyPix.load(config.netConfig);

  config.preview = config.preview || document.getElementById('preview');
  config.snapshot = config.snapshot || document.getElementById('snapshot');
  config.background = config.background || document.querySelector('.background__image > img');
  config.bgInput = config.bgInput || document.getElementById('bginput');
  config.uploadBtn = config.uploadBtn || document.getElementById('uploadBtn');
  config.configPanel = config.configPanel || document.querySelector('.config');

  if (!config.bgCanvas) {
    config.bgCanvas = document.createElement('canvas');
    config.bgCanvas.width = config.width;
    config.bgCanvas.height = config.width;
    if (config.background) {
      config.bgCanvas.getContext('2d').drawImage(config.background, 0, 0, config.width, config.width);
    }
  }

  document.addEventListener('click', e => {
    if (e.target.matches('.snapshot__save, .snapshot__save *')) {
      saveSnapshot(config.snapshot);
    } else if (e.target.matches('.snapshot__close, .snapshot__close *')) {
      document.body.classList.remove('snapshot');
    } else if (e.target.matches('.multisnap__close, .multisnap__close *')) {
      document.body.classList.remove('multisnap');
    } else if (e.target.matches('.config__toggle, .config__toggle *')) {
      config.configPanel.classList.toggle('active');
    } else if (e.target.matches('button.save_config, button.save_config *')) {
      saveConfig(config);
    } else if (e.target.matches('button.reset_config, button.reset_config *')) {
      resetConfig(config);
    }
  });

  config.preview.addEventListener('click', e => {
    takeSnapshot(config);
    e.stopPropagation();
    e.preventDefault();
  });

  config.uploadBtn?.addEventListener('click', () => {
    config.bgInput?.click();
  });

  config.bgInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        config.bgCanvas.getContext('2d').drawImage(img, 0, 0, config.width, config.width);
      };
    };
    reader.readAsDataURL(file);
  });

  document.querySelector('.background')?.addEventListener('click', e => {
    if (e.target.matches('.background__image > img')) {
      config.bgCanvas.getContext('2d').drawImage(e.target, 0, 0, config.width, config.width);
    }
  });

  previewWCLoop(config);
  updateConfigPanel(config);

  // make config available
  window.SHCONFIG = config;

  document.body.removeAttribute("initializing");
}

// register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}
