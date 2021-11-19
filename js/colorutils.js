function getColor(imgData, x, y) {
  const i = (y * imgData.width + x) * 4;
  const r = imgData.data[i];
  const g = imgData.data[i + 1];
  const b = imgData.data[i + 2];
  const bw = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

  return {
    r,
    g,
    b,
    bw
  };
}

function setColor(imgData, x, y, color) {
  const offset = (y * imgData.width + x) * 4;
  imgData.data[offset] = color.r | 0;
  imgData.data[offset + 1] = color.g | 0;
  imgData.data[offset + 2] = color.b | 0;
  if (color.alpha || color.alpha === 0) {
    imgData.data[offset + 3] = +(color.alpha * 255) | 0;
  }
}

function normalize(arr) {
  const max = Math.max.apply(null, arr);

  return arr.map(x => x / max);
}

function findMinMax(arr, np, thr=0.001, bdr=2) {
  let min = bdr, max = 255 - bdr;

  while (min < 128 && arr[min] < thr * np) { min++; }
  while (max > 128 && arr[max] < thr * np) { max--; }

  return {min, max};
}

function histogram(imgData) {
  const rHist = new Array(256).fill(0);
  const gHist = new Array(256).fill(0);
  const bHist = new Array(256).fill(0);
  const bwHist = new Array(256).fill(0);

  for (let y = 0; y < imgData.height; y++) {
    for (let x = 0; x < imgData.width; x++) {
      let c = getColor(imgData, x, y);
      rHist[c.r]++;
      gHist[c.g]++;
      bHist[c.b]++;
      bwHist[c.bw]++;
    }
  }

  return {
    r: normalize(rHist),
    g: normalize(gHist),
    b: normalize(bHist),
    grayscale: normalize(bwHist),
    rawr: rHist,
    rawg: gHist,
    rawb: bHist,
    rawgrayscale: bwHist
  };
}

function histogramBorders(imgData, threshold=0.001, border=2) {
  const hist = histogram(imgData);
  const borders = {};
  const numPixels = imgData.width * imgData.height;

  ['r', 'g', 'b', 'grayscale'].forEach(c => {
    borders[c] = findMinMax(hist[`raw${c}`], numPixels, threshold, border);
  });

  return borders;
}

function transformColor(color, from, to) {
  ['r', 'g', 'b'].forEach(c => {
    const cFrom = from[c];
    const cTo = to[c];

    color[c] = Math.max(Math.min(cTo.min + cTo.max * (color[c] - cFrom.min) / (cFrom.max - cFrom.min), 255), 0);
  });

  return color;
}

function transformHistogram(imgData, from, to) {
  to = to || {
    r: {min: 0, max: 255},
    g: {min: 0, max: 255},
    b: {min: 0, max: 255}
  };

  for (let y = 0; y < imgData.height; y++) {
    for (let x = 0; x < imgData.width; x++) {
      let c = getColor(imgData, x, y);
      setColor(imgData, x, y, transformColor(c, from, to));
    }
  }

  return imgData;
}

export {
  getColor,
  setColor,
  histogram,
  histogramBorders,
  transformHistogram
};
