export default async function run(page) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('http://localhost:1880/app/')
  await page.getByRole('heading', { name: 'Tổng quan tồn kho' }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'Mô phỏng mạch' }).click()
  await page.getByRole('heading', { name: 'Mô phỏng mạch kệ hàng' }).waitFor()

  const slider = page.getByRole('slider', { name: 'Mức tồn giả lập' })
  await slider.evaluate((element) => {
    element.value = '14'
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })

  const ledActive = await page.locator('.led-lamp.led-active').count()
  const oledText = await page.locator('.oled-count').textContent()
  await page.getByRole('button', { name: 'Gửi qua MQTT' }).click()
  await page.getByText('Kịch bản đã gửi qua MQTT.').waitFor({ timeout: 10000 })
  const response = await page.request.get('http://localhost:1880/api/trays')
  const tray = (await response.json())[0]
  await page.screenshot({ path: 'E:/doan_iot/docs/evidence/circuit-lab-14-percent.png', fullPage: true })

  return {
    circuitVisible: await page.locator('.circuit-svg').isVisible(),
    sliderValue: await slider.inputValue(),
    svgLedRedAndBlinking: ledActive > 0,
    oledText,
    mqttApiStock: tray.stockPercent,
    mqttApiThreshold: tray.lowThresholdPercent,
    mqttApiLed: tray.actuatorLed,
    restockPending: (await page.request.get('http://localhost:1880/api/orders')).ok(),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  }
}
