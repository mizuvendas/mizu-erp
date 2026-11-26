/* Mizu ERP — service worker (26/11/2026)
   Existe só pra o navegador oferecer "Instalar Mizu ERP" (ícone na área
   de trabalho / tela do celular). NÃO guarda nada em cache de propósito:
   cada abertura busca o sistema na internet, então as atualizações
   continuam chegando como sempre, sem versão velha presa no aparelho. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* deixa o navegador buscar normalmente */ });
