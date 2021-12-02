import { histogramBorders, transformHistogram } from './colorutils.js';

let streaming = false;

const PREVIEW_CONFIG = {
  internalResolution:  'low',
  segmentationThreshold: 0.7,
  maxDetections: 3,
  scoreThreshold: 0.5,
  nmsRadius: 20,
  scaleFactor: 0.8,
  flipHorizontal: false,
  internalScaling: 0.5,
  toneMapping: false
};

const SNAPSHOT_CONFIG = {
  internalResolution:  'high',
  segmentationThreshold: 0.7,
  maxDetections: 5,
  scoreThreshold: 0.5,
  nmsRadius: 20,
  scaleFactor: 0.8,
  flipHorizontal: false,
  internalScaling: 0.5,
  toneMapping: true
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
  quantBytes: 2
};

const DEFAULT_CONFIG = {
  width: 800,
  maskBlur: '3px',
  bgBlur: '1px',
  previewConfig: PREVIEW_CONFIG,
  snapshotConfig: SNAPSHOT_CONFIG,
  netConfig: NET_CONFIG_MOBILE,
};

const PRO_CONFIG = {
  width: 800,
  maskBlur: '3px',
  bgBlur: null,
  previewConfig: PREVIEW_CONFIG,
  snapshotConfig: SNAPSHOT_CONFIG,
  netConfig: NET_CONFIG_PRO,
};

const CONFIGS = {
  default: DEFAULT_CONFIG,
  pro: PRO_CONFIG
};

async function detectFace(c, target, segConfig) {
  const segmentation = await c.net.segmentPerson(c.webcam, segConfig); // TODO multiple faces ?

  const bgmask = window.bodyPix.toMask(segmentation, {r: 0, g: 0, b: 0, a: 255}, {r: 0, g:0, b: 0, a: 0});

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

  ctx.drawImage(c.webcam, 0, 0, c.width, c.width);
  ctx.filter = `blur(${c.maskBlur})`;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(c.maskcanvas, 0, 0, c.width, c.width);

  if (segConfig.toneMapping) {
    const imgData = ctx.getImageData(0, 0, c.width, c.width);
    const wcHistBorders = histogramBorders(imgData);
    const bgHistBorders = histogramBorders(c.bgCanvas.getContext('2d').getImageData(0, 0, c.width, c.width));
    // green adjustment
    bgHistBorders.g = {min: (wcHistBorders.g.min + bgHistBorders.g.min) / 2, max: (wcHistBorders.g.max + bgHistBorders.g.max) / 2};

    ctx.putImageData(transformHistogram(imgData, wcHistBorders, bgHistBorders), 0, 0);
  }

  if (c.bgBlur) {
    ctx.filter = `blur(${c.bgBlur})`;
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

async function takeSnapshot(c) {
  await detectFace(c, c.snapshot, c.snapshotConfig);
  document.body.classList.add('snapshot');
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
  if (window.location.search.indexOf('config') > -1) {
    const config = window.location.search.split('config=')[1];
    if (config in CONFIGS) {
      return CONFIGS[config];
    }
  }
  return CONFIGS.default;
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
    } else if (e.target.matches('.snapshot, .snapshot *')) {
      document.body.classList.remove('snapshot');
    } else if (e.target.matches('.config__toggle, .config__toggle *')) {
      config.configPanel.classList.toggle('active');
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

  document.body.removeAttribute("initializing");
}

// register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', {scope: './'}).then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}
