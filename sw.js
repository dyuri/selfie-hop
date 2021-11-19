const cacheName = 'sh-cache-21111921';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => {
      return cache.addAll([
        './',
        './css/style.css',
        './js/selfiehop.js?v=' + cacheName,
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
    caches.open(cacheName).then((cache) => {
      return cache.match(event.request).then(response => {
        return response || fetch(event.request).then(res => {
          cache.put(event.request, res.clone());
          return res;
        });
      });
    })
  );
});
