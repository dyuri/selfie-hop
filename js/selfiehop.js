let streaming = false;

const PREVIEW_CONFIG = {
  internalResolution:  'low',
  segmentationThreshold: 0.7,
  maxDetections: 3,
  scoreThreshold: 0.5,
  nmsRadius: 20,
  scaleFactor: 0.8,
  flipHorizontal: false,
  internalScaling: 0.5
};

const SNAPSHOT_CONFIG = {
  internalResolution:  'high',
  segmentationThreshold: 0.7,
  maxDetections: 5,
  scoreThreshold: 0.5,
  nmsRadius: 20,
  scaleFactor: 0.8,
  flipHorizontal: false,
  internalScaling: 0.5
};

const DEFAULT_CONFIG = {
  width: 800,
  maskBlur: '3px',
  bgBlur: '1px',
  previewConfig: PREVIEW_CONFIG,
  snapshotConfig: SNAPSHOT_CONFIG,
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
  ctx.filter = `blur(${c.bgBlur})`;
  ctx.globalCompositeOperation = 'destination-over';
  ctx.drawImage(c.background, 0, 0, c.width, c.width);

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

function takeSnapshot(c) {
  detectFace(c, c.snapshot, c.snapshotConfig);
  document.body.classList.add('snapshot');
}

function saveSnapshot(target) {
  const data = target.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = data;
  a.download = 'selfiehop.png';
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

export async function init(config) {
  config.width = config.width || DEFAULT_CONFIG.width;
  config.height = config.height || config.width;

  Object.entries(DEFAULT_CONFIG).forEach(([key, value]) => {
    if (!config[key]) {
      config[key] = value;
    }
  });

  document.body.setAttribute("initializing", "");

  webcamStartup(config);

  config.net = await window.bodyPix.load({ // TODO ResNet50 ?
    architecture: 'MobileNetV1',
    outputStride: 16,
    multiplier: 0.75,
    quantBytes: 2,
    modelUrl: './model/model-stride16.json'
  });

  config.preview = config.preview || document.getElementById('preview');
  config.snapshot = config.snapshot || document.getElementById('snapshot');
  config.background = config.background || document.querySelector('.background__image > img');
  config.bgInput = config.bgInput || document.getElementById('bginput');
  config.uploadBtn = config.uploadBtn || document.getElementById('uploadBtn');
  config.configPanel = config.configPanel || document.querySelector('.config');

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
        config.background = img;
      };
    };
    reader.readAsDataURL(file);
  });

  document.querySelector('.background')?.addEventListener('click', e => {
    if (e.target.matches('.background__image > img')) {
      config.background = e.target;
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
