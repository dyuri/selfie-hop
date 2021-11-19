self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('sh1').then((cache) => {
      return cache.addAll([
        './',
        './css/style.css',
        './js/selfiehop.js',
        './js/tf.js',
        './js/body-pix.js',
        // backgrounds
        './img/bg1.jpg',
        './img/bg2.jpg',
        './img/bg3.jpg',
        './img/bg4.jpg',
        './img/bg5.jpg',
        './img/bg6.jpg',
        './img/bg7.jpg',
        // models
        './model/model-stride16.json',
        './model/group1-shard1of1.bin',
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
