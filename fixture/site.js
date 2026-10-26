document.querySelector('form').addEventListener('submit', (e) => {
  e.preventDefault()
  window.om?.('event', 'lead_sent')
  document.getElementById('result').textContent =
    'Тестовая заявка принята. Проверьте цель в OpenMetrika.'
  window.om?.('flush')
})
document.getElementById('pricing').addEventListener('click', () => {
  history.pushState({}, '', '/fixture/pricing')
  document.querySelector('.services h2').textContent = 'Проект от 150 000 ₽'
  window.om?.('event', 'pricing_open')
})
document.getElementById('purchase').addEventListener('click', (e) => {
  window.om?.('ecommerce', {
    action: 'purchase',
    order_id: 'TEST-' + Date.now(),
    revenue: 5000,
    currency: 'RUB',
    items: [{ id: 'test-audit', name: 'Тестовый аудит', price: 5000, quantity: 1 }],
  })
  e.target.textContent = 'Тестовый заказ создан'
  window.om?.('flush')
})
const status = document.createElement('p')
status.id = 'counter-status'
status.style = 'font-size:12px;padding:0 7%;color:#778570'
document.body.append(status)
status.textContent = `Счётчик: ${window.om?.('getClientId') ? 'подключён' : navigator.doNotTrack === '1' ? 'отключён настройкой Do Not Track' : navigator.globalPrivacyControl ? 'отключён настройкой Global Privacy Control' : 'не запущен'}`
