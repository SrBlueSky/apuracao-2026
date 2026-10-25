/* sw-avisos.js — service worker mínimo, só para o Chrome do Android conseguir mostrar os avisos da apuração
 * (lá `new Notification` não funciona; é preciso registration.showNotification). Não guarda nada em cache. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (lista) {
    for (var i = 0; i < lista.length; i++) { if ("focus" in lista[i]) return lista[i].focus(); }
    return self.clients.openWindow("./");
  }));
});
